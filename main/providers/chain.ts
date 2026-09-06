// LLM fallback chain: Groq → Gemini → Ollama. Every call has a hard timeout so a
// hung request can't hold a caller's lock forever. A 429 is distinguished from a
// genuine failure — a rate-limited backend falls through to the next one, and if
// EVERY backend was only ever rate-limited (never a real error), the caller can
// back off and retry later without burning its failure budget.
//
// Raise-only: this module never swallows or logs an error. Callers decide what to
// do with `LLMResult.backend` / `LLMError` / `RateLimited`.
//
// ── Ported from llmroute's src/llmroute/chain.py ─────────────────────────────
// llmroute is Python and cannot be imported into Electron's Node main process,
// and a packaged Electron app must not spawn a Python interpreter. So this is a
// port of the *semantics*, not a binding. Where it diverges, and why:
//
//   1. Kimi (Moonshot) is dropped. llmroute's order is Groq → Gemini → Kimi →
//      Ollama. Toasty has no Kimi key and no settings field for one; adding a
//      dead leg would just slow every fallback down by one timeout.
//   2. Keys come from getSettings() (settings.json), not process.env. A packaged
//      Electron app has no meaningful environment — the user types the key into
//      the Settings panel. GROQ_API_KEY / GEMINI_API_KEY are still read as a
//      fallback so the benchmark can run without touching settings.
//   3. Telemetry is dropped. chain.py's _record() writes to llmroute's telemetry
//      module, which does not exist here. The `backend` field on LLMResult is
//      what a caller needs, and it survives.
//   4. Ollama is called at /api/chat, not chain.py's /api/generate. ai.ts:159
//      already uses /api/chat with the Phase 9 resource guards, and having two
//      different Ollama endpoints in one app is a trap. Same request shape as
//      ai.ts, minus the guards (those belong to the interactive chat path).
//   5. chain.py gives Ollama no 429 branch — a local server does not rate-limit.
//      That is preserved deliberately: an Ollama failure is always genuine.
//   6. No `task_type` parameter. It is telemetry-only in the Python and never
//      affects routing.
import { getSettings } from "../settings";

export const CALL_TIMEOUT_MS = 20_000;

export type Backend = "groq" | "gemini" | "ollama";

const DEFAULT_MODELS: Record<Backend, string> = {
  groq: "openai/gpt-oss-120b",
  gemini: "gemini-2.5-flash",
  ollama: "llama3.2",
};

/** Genuine failure (bad request, auth, 5xx, network, malformed response). */
export class LLMError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LLMError";
  }
}

/** 429 from a specific backend — try the next one, don't count as a genuine failure. */
export class RateLimited extends LLMError {
  constructor(message: string) {
    super(message);
    this.name = "RateLimited";
  }
}

/** Every attempted backend was rate-limited (no genuine errors) — the caller should
 *  back off and retry later, NOT count this toward its retry-to-failed budget. */
export class AllBackendsRateLimited extends LLMError {
  constructor(message: string) {
    super(message);
    this.name = "AllBackendsRateLimited";
  }
}

export interface LLMResult {
  text: string;
  backend: Backend;
}

function key(name: "groqApiKey" | "geminiApiKey", envVar: string): string {
  const fromSettings = (getSettings() as any)[name];
  return fromSettings || process.env[envVar] || "";
}

/** fetch with a hard timeout, normalising network failures into LLMError. */
async function post(url: string, init: RequestInit, label: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e: any) {
    throw new LLMError(`${label} request failed: ${e?.message ?? e}`);
  } finally {
    clearTimeout(timer);
  }
}

async function callGroq(prompt: string, model: string, system?: string): Promise<LLMResult> {
  const apiKey = key("groqApiKey", "GROQ_API_KEY");
  if (!apiKey) throw new LLMError("Groq API key not set");
  const messages: any[] = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });

  const res = await post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages,
        response_format: { type: "json_object" },
        temperature: 0,
      }),
    },
    "groq"
  );
  if (res.status === 429) throw new RateLimited("groq rate limited");
  if (res.status >= 400) throw new LLMError(`groq http ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json().catch(() => null);
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw new LLMError("groq unexpected response shape");
  return { text, backend: "groq" };
}

async function callGemini(prompt: string, model: string, system?: string): Promise<LLMResult> {
  const apiKey = key("geminiApiKey", "GEMINI_API_KEY");
  if (!apiKey) throw new LLMError("Gemini API key not set");
  const body: any = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0 },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const res = await post(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    "gemini"
  );
  if (res.status === 429) throw new RateLimited("gemini rate limited");
  if (res.status >= 400) throw new LLMError(`gemini http ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json().catch(() => null);
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") throw new LLMError("gemini unexpected response shape");
  return { text, backend: "gemini" };
}

async function callOllama(prompt: string, model: string, system?: string): Promise<LLMResult> {
  const base = process.env.OLLAMA_URL || "http://localhost:11434";
  const messages: any[] = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });

  // No 429 branch, matching chain.py:142 — a local server does not rate-limit,
  // so any Ollama failure is a genuine one.
  const res = await post(
    `${base}/api/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: false, format: "json", keep_alive: 0 }),
    },
    "ollama"
  );
  if (res.status >= 400) throw new LLMError(`ollama http ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json().catch(() => null);
  const text = data?.message?.content;
  if (typeof text !== "string") throw new LLMError("ollama unexpected response shape");
  return { text, backend: "ollama" };
}

const BACKENDS: Record<Backend, (p: string, m: string, s?: string) => Promise<LLMResult>> = {
  groq: callGroq,
  gemini: callGemini,
  ollama: callOllama,
};

/** The order Toasty uses unless a caller says otherwise. */
export const DEFAULT_ORDER: Backend[] = ["groq", "gemini", "ollama"];

/**
 * Try each backend in order; RateLimited falls through to the next one.
 *
 * Throws AllBackendsRateLimited if every attempted backend was rate-limited and
 * none had a genuine error; LLMError if at least one genuine error occurred (or
 * no backend in `order` is recognised).
 */
export async function callJSON(
  prompt: string,
  opts: { system?: string; order?: Backend[]; models?: Partial<Record<Backend, string>> } = {}
): Promise<LLMResult> {
  const order = opts.order ?? DEFAULT_ORDER;
  const models = opts.models ?? {};
  let sawGenuineError = false;
  let attempted = false;
  const errors: string[] = [];

  for (const name of order) {
    const fn = BACKENDS[name];
    if (!fn) continue;
    attempted = true;
    const model = models[name] || DEFAULT_MODELS[name];
    try {
      return await fn(prompt, model, opts.system);
    } catch (e: any) {
      if (e instanceof RateLimited) {
        errors.push(`${name}: ${e.message}`);
        continue;
      }
      sawGenuineError = true;
      errors.push(`${name}: ${e?.message ?? e}`);
    }
  }

  if (!attempted) throw new LLMError(`no recognized backend in order: ${order.join(", ")}`);
  const joined = errors.join("; ");
  if (sawGenuineError) throw new LLMError(`all backends failed: ${joined}`);
  throw new AllBackendsRateLimited(`all backends rate-limited: ${joined}`);
}
