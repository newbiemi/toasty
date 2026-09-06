// Groq cloud AI provider (OpenAI-compatible API).
// Used as the primary AI backend for parseTasks, chat, and adjustTask.
// Falls back gracefully — callers catch errors and route to the rule parser / Ollama.
import { getSettings } from "../settings";
import { getKnownCategories, extractJSON, normalizeParsed, validateParsed } from "../aiShared";
import { todayStr, tomorrowStr } from "../dateUtils";
import { ruleParse } from "../parseRules";

const GROQ_BASE = "https://api.groq.com/openai/v1";
// Was llama-3.3-70b-versatile. Groq decommissioned every Llama model — as of
// 2026-09-05 the account's /models list has none, and every parse call was
// 404ing with model_not_found. ai.ts catches that and falls back to the rule
// parser, so the app kept working and never surfaced the failure; the benchmark
// is what made it visible. gpt-oss-120b is the largest chat model Groq still
// serves, supports JSON mode, and answers in ~1s.
const GROQ_MODEL = "openai/gpt-oss-120b";
// Keep timeouts tight — cloud latency is predictable (unlike local CPU inference)
const GROQ_PARSE_TIMEOUT_MS = 15_000;
const GROQ_CHAT_TIMEOUT_MS  = 20_000;

// ── Connectivity ─────────────────────────────────────────────────────────────

/** Quick check: key is present AND the Groq /models endpoint is reachable. */
export async function isGroqAvailable(): Promise<boolean> {
  const key = getSettings().groqApiKey;
  if (!key) return false;
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${GROQ_BASE}/models`, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${key}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Parse ─────────────────────────────────────────────────────────────────────

/** Groq's own answer, normalised to an array but NOT yet cross-checked against
 *  the rule parser. Split out from groqParse() so the benchmark can score the raw
 *  model separately from the cross-checked result — a date the model got right and
 *  the cross-check then dropped looks identical to a model failure otherwise. */
export async function groqParseRaw(text: string): Promise<any[]> {
  const key = getSettings().groqApiKey;
  if (!key) throw new Error("No Groq API key configured");

  const knownCategories = getKnownCategories();
  const today = todayStr();
  const tomorrow = tomorrowStr();

  const systemPrompt =
`Extract one or more tasks from the text. Return ONLY a JSON array, no markdown, no extra text.
IMPORTANT: Extract ONLY information explicitly present in the input. Never invent dates, times, names, links, or URLs. If a field is not stated, output null (or [] or "").
Today is ${today}. Tomorrow is ${tomorrow}.

Each item must have ALL of these fields:
{"title":"...","dueDate":"YYYY-MM-DD or null","dueTime":"HH:MM 24h or null","startDate":"YYYY-MM-DD or null","priority":"high|medium|low","category":"...","subtasks":[{"text":"step","done":false}],"notes":"...","links":["https://url"] or []}

TITLE: MAX 80 characters. Start with an action verb (Suggest, Create, Review, Update, Send, Escalate, Schedule, Prepare…). Summarize the core action in one short phrase — NEVER copy the full input sentence verbatim. If you cannot summarize, write the single most important noun + verb pair.
PRIORITY: high = hard deadline within 1 week or blocking. medium = standard. low = nice-to-have.
CATEGORY: Pick the closest match from: ${knownCategories}. Never use a date or vague word as a category.
DATES: Never output relative words — always convert to YYYY-MM-DD. Convert 12h to 24h: "3pm"→"15:00".
SUBTASKS: If the task is COMPLEX — it explicitly lists multiple steps, contains several distinct action verbs, or is a long multi-clause request — break it into 3–6 concrete, actionable subtasks each starting with a verb. For a simple single-action task, return []. Subtasks must be grounded in the input; do not invent unrelated steps.
NOTES: Capture context not already in the title. Use "" if nothing useful remains.
LINKS: Extract only http:// or https:// URLs. Do not repeat URLs in notes.
If no task found, return [].`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GROQ_PARSE_TIMEOUT_MS);
  try {
    const res = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: text },
        ],
        // Groq OpenAI-style JSON mode — different from Ollama's `format:"json"`
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 1024,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Groq error ${res.status}: ${body}`);
    }
    const data = await res.json();
    const content: string = data.choices?.[0]?.message?.content ?? "[]";

    // Groq json_object returns an object, not an array — unwrap common wrapper keys
    const raw = extractJSON(content);
    const parsed = JSON.parse(raw);
    const unwrapped = Array.isArray(parsed)
      ? parsed
      : (parsed.tasks ?? parsed.data ?? parsed.items ?? (parsed.title ? [parsed] : []));

    return normalizeParsed(unwrapped, text);
  } finally {
    clearTimeout(timer);
  }
}

/** Cross-check Groq's answer against the rule parser, which is authoritative for
 *  dates, times and links.
 *
 *  Each side does what it is good at. The rule parser derives dates from tokens
 *  that are literally in the input, so it cannot fabricate one and it cannot get
 *  weekday arithmetic wrong. Groq is better at the judgement calls — summarising a
 *  title, picking a priority and category, breaking work into subtasks.
 *
 *  So: if the rule parser found a date/time/link, that value wins. If it found
 *  nothing, Groq's value is dropped (it had nothing in the text to derive it from).
 *  Everything else is Groq's.
 *
 *  This used to be a presence gate only — Groq's value passed through untouched
 *  whenever both sides found *something*, even when they disagreed. On the
 *  benchmark's 40 phrases that cost 12 wrong due dates that the rule parser had
 *  right, including every "next Friday" style weekday. See bench/README.md. */
export function crossCheck(arr: any[], text: string): any[] {
  const ruleResult = ruleParse(text)[0];
  return arr.map((t: any) => {
    const validated = validateParsed(t);
    validated.dueDate = ruleResult.dueDate ?? null;
    validated.dueTime = ruleResult.dueTime ?? null;
    if (ruleResult.links.length > 0) validated.links = ruleResult.links;
    else if (validated.links?.length > 0) validated.links = [];
    if (!validated.title || validated.title.trim().length > 100) {
      // Model echoed the input — truncate at word boundary as last resort
      const raw = (validated.title || ruleResult.title).trim();
      const cut = raw.slice(0, 80);
      const lastSpace = cut.lastIndexOf(" ");
      validated.title = (lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trim();
    }
    return validated;
  });
}

export async function groqParse(text: string): Promise<any[]> {
  return crossCheck(await groqParseRaw(text), text);
}

// ── Chat ──────────────────────────────────────────────────────────────────────

export async function groqChat(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  taskContext: string
): Promise<string> {
  const key = getSettings().groqApiKey;
  if (!key) throw new Error("No Groq API key configured");

  // The chat window renders replies as plain text (pages/chat.tsx:128, white-space:
  // pre-wrap) — there is no markdown renderer. gpt-oss-120b reaches for bold, headings
  // and pipe tables unprompted, which show up as literal ** and | characters, so the
  // formatting rules below are load-bearing, not style advice.
  const system = `You are Toasty, a friendly pixel-cat companion who helps with tasks and productivity. Be warm, concise, and helpful. Today is ${todayStr()}.
FORMAT: plain text only. No markdown — no **bold**, no headings, no tables, no backticks. For a list, use short lines starting with "- ". At most one emoji per reply.
LENGTH: 3 sentences for a simple question. For a list of tasks, one line each and nothing more. Never pad with an offer to help further.${taskContext}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GROQ_CHAT_TIMEOUT_MS);
  try {
    const res = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "system", content: system }, ...messages],
        temperature: 0.7,
        max_tokens: 512,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Groq error ${res.status}: ${body}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "(no response)";
  } finally {
    clearTimeout(timer);
  }
}

// ── Adjust ────────────────────────────────────────────────────────────────────

export async function groqAdjust(taskJSON: string, instruction: string): Promise<any> {
  const key = getSettings().groqApiKey;
  if (!key) throw new Error("No Groq API key configured");

  const system =
`You are adjusting an existing task based on the user's instruction.
Current task: ${taskJSON}
Today is ${todayStr()}. Tomorrow is ${tomorrowStr()}.
IMPORTANT: All dates MUST be in YYYY-MM-DD format. Never output relative words like "tomorrow".
IMPORTANT: Only change what the instruction asks for. Keep everything else intact.
If the instruction asks to break the task down, add steps, or list subtasks, generate 3–6 concrete actionable subtasks grounded in the task title and notes, each starting with a verb.
Return ONLY a JSON object with the adjusted task. Keep ALL original fields.
Format: {"title":"...","subtasks":[{"text":"step","done":false}],"priority":"high|medium|low","startDate":"YYYY-MM-DD or null","dueDate":"YYYY-MM-DD or null","dueTime":"HH:MM or null","category":"...","status":"todo|in_progress|done","notes":"...","links":["..."]}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GROQ_PARSE_TIMEOUT_MS);
  try {
    const res = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user",   content: instruction },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 1024,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Groq error ${res.status}: ${body}`);
    }
    const data = await res.json();
    const content: string = data.choices?.[0]?.message?.content ?? "{}";
    const raw = extractJSON(content);
    const adjusted = validateParsed(JSON.parse(raw));

    // Ground dates in the instruction, exactly as parse does. Without this the
    // adjust panel and task capture answer "next Friday" differently — capture
    // takes the rule parser's date, and the panel took whatever the model said.
    //
    // Nulling is safe here: the caller (renderer/lib/mergeAdjusted.ts) falls back
    // to the task's existing value for any field that comes back empty, so an
    // instruction with no date in it ("make this urgent") leaves the due date
    // alone rather than clearing it.
    const grounded = ruleParse(instruction)[0];
    adjusted.dueDate = grounded.dueDate ?? null;
    adjusted.dueTime = grounded.dueTime ?? null;
    return adjusted;
  } finally {
    clearTimeout(timer);
  }
}
