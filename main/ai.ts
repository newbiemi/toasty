// AI routing layer — thin seam between callers and providers.
//
// parseTasks / adjustTask: Groq (cloud) → rule parser (offline, instant, never freezes)
// chat:                    Groq (cloud) → Ollama (local, existing Phase 9 guards intact)
//
// Ollama is intentionally OFF the parseTasks/adjustTask hot path to prevent the
// CPU-inference freeze on non-GPU hardware. All Ollama resource guards (inFlight
// lock, freemem check, num_predict, keep_alive:0) survive for the chat fallback.
import * as os from "os";
import { getSettings } from "./settings";
import { listTasks } from "./db";
import { todayStr } from "./dateUtils";
import { ruleParse } from "./parseRules";
import { groqParse, groqChat, groqAdjust } from "./providers/groq";

const OLLAMA_BASE = process.env.OLLAMA_URL || "http://localhost:11434";

// ── Ollama resource guards (chat fallback only) ───────────────────────────────
// These remain intact from Phase 9 — they gate the Ollama chat path only.
const CHAT_TIMEOUT_MS   = 60_000;
const MIN_FREE_BYTES    = 2 * 1024 * 1024 * 1024; // 2 GB
const KEEP_ALIVE        = 0;
const NUM_PREDICT_CHAT  = 512;
const NUM_CTX           = 2048;

function assertEnoughMemory(): void {
  const free = os.freemem();
  if (free < MIN_FREE_BYTES) {
    const freeMB = Math.round(free / 1024 / 1024);
    throw new Error(
      `Not enough RAM to run AI right now (${freeMB} MB free, need ~2 GB). ` +
      `Close some apps and try again 🐾`
    );
  }
}

let inFlight: Promise<unknown> | null = null;

// ── Ollama status ─────────────────────────────────────────────────────────────

export async function checkOllama(): Promise<"running" | "offline"> {
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: controller.signal });
    return res.ok ? "running" : "offline";
  } catch {
    return "offline";
  }
}

export async function listModels(): Promise<string[]> {
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: controller.signal });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models ?? []).map((m: any) => String(m.name));
  } catch {
    return [];
  }
}

// ── parseTasks ────────────────────────────────────────────────────────────────
// Hot path. Groq if key is set, instant rule parser otherwise.
// Ollama is NEVER used here — eliminates the CPU-inference freeze risk.

export async function parseTasks(text: string): Promise<any[]> {
  const cleaned = text.replace(/^(hi|hey|hello)\s+(toasty|there)[,!]?\s*/i, "").trim() || text;
  const s = getSettings();

  let results: any[];
  if (s.aiProvider !== "ollama" && s.groqApiKey) {
    try {
      results = await groqParse(cleaned);
    } catch {
      // Groq failed (no internet, rate limit, bad key) → rule parser
      results = ruleParse(cleaned);
    }
  } else {
    results = ruleParse(cleaned);
  }

  // Title guard — runs for BOTH providers. Catches Groq verbatim echoes AND
  // rule-parser full-text fallbacks when input has no extractable tokens.
  return results.map((t) => {
    const raw = (t.title || cleaned).trim();
    if (raw.length <= 80) return t;
    // Strip common filler phrases so the truncated result reads like a task title
    const stripped = raw.replace(
      /^(I need to|I want to|I have to|We need to|I should|I must|Please|Can you|Could you)\s+/i,
      ""
    ).trim();
    const cap = stripped.charAt(0).toUpperCase() + stripped.slice(1);
    const cut = cap.slice(0, 80);
    const lastSpace = cut.lastIndexOf(" ");
    return { ...t, title: (lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trim() };
  });
}

// ── adjustTask ────────────────────────────────────────────────────────────────
// Groq if available; else return the task unchanged (modal stays open, user edits manually).

export async function adjustTask(taskJSON: string, instruction: string): Promise<any> {
  const s = getSettings();

  if (s.aiProvider !== "ollama" && s.groqApiKey) {
    // Let errors propagate so the UI can surface them — no silent swallow.
    return await groqAdjust(taskJSON, instruction);
  }

  // No key / ollama mode: AI adjust cannot run without a cloud connection.
  throw new Error("AI adjust needs a Groq key to work 🐾 — add one in Settings.");
}

// ── chat ──────────────────────────────────────────────────────────────────────
// Groq first; falls back to local Ollama (Phase 9 guards intact).

export async function chat(
  messages: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string> {
  // Build task context (shared by both providers)
  let taskContext = "";
  try {
    const tasks = listTasks() as any[];
    const pending = tasks.filter((t) => t.status !== "done");
    if (pending.length > 0) {
      const lines = pending
        .slice(0, 10)
        .map((t) => `- ${t.title}${t.dueDate ? ` (due ${t.dueDate})` : ""}`)
        .join("\n");
      taskContext = `\n\nUser's current pending tasks:\n${lines}${pending.length > 10 ? `\n...and ${pending.length - 10} more` : ""}`;
    }
  } catch {}

  const s = getSettings();

  // ── Groq path ──
  if (s.aiProvider !== "ollama" && s.groqApiKey) {
    try {
      return await groqChat(messages, taskContext);
    } catch {
      // Groq failed → fall through to Ollama
    }
  }

  // ── Ollama fallback (Phase 9 guards) ──
  assertEnoughMemory();
  if (inFlight) throw new Error("Toasty is already thinking — give me a sec 🐾");

  const model = s.model || "llama3.2:1b";
  const system = `You are Toasty, a friendly pixel-cat companion who helps with tasks and productivity. Be warm, concise, and helpful. Today is ${todayStr()}.${taskContext}`;

  const p = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
    try {
      const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: system }, ...messages],
          stream: false,
          keep_alive: KEEP_ALIVE,
          options: { temperature: 0.7, num_predict: NUM_PREDICT_CHAT, num_ctx: NUM_CTX },
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Ollama error ${res.status}: ${txt}`);
      }
      const data = await res.json();
      return data.message?.content ?? "(no response)";
    } finally {
      clearTimeout(timer);
    }
  })();
  inFlight = p;
  try { return await p; } finally { inFlight = null; }
}
