import * as os from "os";
import { getSettings } from "./settings";
import { listTasks } from "./db";

const OLLAMA_BASE = process.env.OLLAMA_URL || "http://localhost:11434";
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || "llama3.2:1b";
// Generous timeout: first parse after boot may hit a cold Ollama (daemon not loaded yet)
const PARSE_TIMEOUT_MS = 30_000;
const ADJUST_TIMEOUT_MS = 45_000;
const CHAT_TIMEOUT_MS = 60_000;
// ── Resource-safety constants (Phase 9) ─────────────────────────────────────
// MIN_FREE_BYTES: refuse any Ollama call when os.freemem() is below this.
// Note: os.freemem() on Windows reports *free*, not *available* (cache counts
// as used) — so this guard errs cautious. Raise to 3 GB if still risky.
const MIN_FREE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB
// KEEP_ALIVE: 0 unloads the model immediately after each response (hygiene —
// prevents the 5-min default hold on RAM/CPU after the call completes).
// Tradeoff: cold-load delay on every turn. Bump to "30s" if too slow.
const KEEP_ALIVE = 0;
// NUM_PREDICT_GEN: max tokens for /api/generate (parse, adjust). Must be large
// enough for a full multi-task JSON array (~150 tokens/task); 512 can truncate
// 4+ tasks and produce invalid JSON. 1024 is safe on 1b and still bounds the
// CPU decode window to ~15-20s worst-case vs the 30/45s abort timeouts.
const NUM_PREDICT_GEN = 1024;
// NUM_PREDICT_CHAT: max tokens for /api/chat. A cut-off sentence degrades
// gracefully (unlike truncated JSON), so a tighter cap is fine here.
const NUM_PREDICT_CHAT = 512;
// NUM_CTX: context-window token cap; shrinks the model's working-set footprint.
const NUM_CTX = 2048;

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

// Returns the user's top used categories from the DB — injected into the parse
// prompt so the model reuses known terms instead of inventing new ones each time.
function getKnownCategories(): string {
  try {
    const tasks = listTasks();
    const counts: Record<string, number> = {};
    for (const t of tasks as any[]) {
      if (t.category) counts[t.category] = (counts[t.category] || 0) + 1;
    }
    const top = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([c]) => c);
    return top.length > 0
      ? top.join(", ")
      : "Recruitment, HR/Management, Meeting, Documentation, Engineering, Product Development, Personal";
  } catch {
    return "Recruitment, HR/Management, Meeting, Documentation, Engineering, Personal";
  }
}

function tomorrowStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

// ── Resource guards ──────────────────────────────────────────────────────────

// Pre-flight RAM check. Throws a user-friendly Error if memory is critically low.
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

// Single-flight lock: only one Ollama call may run at a time across all entry
// points (parse, chat, adjust). Concurrent calls are rejected immediately —
// NOT queued — to avoid stacking long CPU jobs on low-RAM hardware.
let inFlight: Promise<unknown> | null = null;

function extractJSON(raw: string): string {
  let cleaned = raw.replace(/```json|```/g, "").trim();
  const arrStart = cleaned.indexOf("[");
  const arrEnd = cleaned.lastIndexOf("]");
  const objStart = cleaned.indexOf("{");
  const objEnd = cleaned.lastIndexOf("}");
  if (arrStart !== -1 && arrEnd > arrStart) return cleaned.slice(arrStart, arrEnd + 1);
  if (objStart !== -1 && objEnd > objStart) return cleaned.slice(objStart, objEnd + 1);
  return cleaned;
}

async function callOllama(systemPrompt: string, userMessage: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // Prefer the model from settings; fall back to env var / hardcoded default
  const model = getSettings().model || DEFAULT_MODEL;
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        system: systemPrompt,
        prompt: userMessage,
        format: "json",
        stream: false,
        keep_alive: KEEP_ALIVE,
        options: { temperature: 0.1, num_predict: NUM_PREDICT_GEN, num_ctx: NUM_CTX },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama error ${res.status}: ${text}`);
    }
    const data = await res.json();
    return extractJSON(data.response || "[]");
  } finally {
    clearTimeout(timer);
  }
}

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

export async function parseTasks(text: string): Promise<any[]> {
  assertEnoughMemory();
  if (inFlight) throw new Error("Toasty is already thinking — give me a sec 🐾");
  // Strip conversational prefixes so the model isn't confused by greetings
  const cleaned = text.replace(/^(hi|hey|hello)\s+(toasty|there)[,!]?\s*/i, "").trim() || text;

  const knownCategories = getKnownCategories();
  const system = `Extract one or more tasks from the text. Return ONLY a JSON array, no markdown, no extra text.
Today is ${todayStr()}. Tomorrow is ${tomorrowStr()}.

Each item must have ALL of these fields:
{"title":"...","dueDate":"YYYY-MM-DD or null","dueTime":"HH:MM 24h or null","startDate":"YYYY-MM-DD or null","priority":"high|medium|low","category":"...","subtasks":[{"text":"step","done":false}],"notes":"...","links":["https://url"] or []}

TITLE: Start with an action verb (Create, Update, Review, Confirm, Schedule, Prepare, Grant, Announce, Delegate, Optimize, Modify, Audit, Refine...). Be concise — NEVER repeat the full input sentence verbatim. For meetings: "Meeting with [Name] — [Purpose]".

PRIORITY:
- high: hard deadline within 1 week, requires approval from senior stakeholder, or is blocking other work
- medium: standard work task with a flexible timeline
- low: nice-to-have, no deadline pressure

CATEGORY: Pick the closest match from the user's existing categories, or create a new one in the same compound format (e.g. "HR/Analytics", "AI Recruitment Project"). Known categories: ${knownCategories}. NEVER use a date, day name, or vague word ("today", "work", "task") as a category.

DATES: NEVER output relative words — always convert to YYYY-MM-DD. "tomorrow" → ${tomorrowStr()}. If a time is given without a date, set dueDate to today (${todayStr()}). Convert 12h to 24h: "3pm"→"15:00", "9am"→"09:00", "noon"→"12:00".

SUBTASKS: Add specific, concrete, completable steps when the task has multiple distinct actions. Return [] for simple single-action tasks.

NOTES: Capture who requested the task, event context, stakeholder names, and technical details not in the title or subtasks. Use empty string "" if nothing useful remains.

LINKS: Extract only http:// or https:// URLs into links[]. Do not repeat URLs in notes.

Ignore greetings and filler words. If multiple tasks are described, return all in the array. If no task found, return [].`;

  const p = (async () => {
    const raw = await callOllama(system, cleaned, PARSE_TIMEOUT_MS);
    const result = JSON.parse(raw);
    // llama3.2 sometimes returns a single object instead of an array — normalise
    const arr = Array.isArray(result) ? result : (result && result.title ? [result] : []);
    // Guard: if the model echoed the full input as the title, it failed — treat as empty
    return arr.filter((t: any) => t.title && t.title.trim().length < cleaned.length * 0.8);
  })();
  inFlight = p;
  try { return await p; } finally { inFlight = null; }
}

export async function chat(
  messages: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string> {
  assertEnoughMemory();
  if (inFlight) throw new Error("Toasty is already thinking — give me a sec 🐾");
  const model = getSettings().model || DEFAULT_MODEL;

  // Inject pending tasks so Toasty can answer "what do I have due today?" etc.
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
        const text = await res.text();
        throw new Error(`Ollama error ${res.status}: ${text}`);
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

export async function adjustTask(taskJSON: string, instruction: string): Promise<any> {
  assertEnoughMemory();
  if (inFlight) throw new Error("Toasty is already thinking — give me a sec 🐾");
  const system = `You are adjusting an existing task based on the user's instruction.
Current task: ${taskJSON}
Today is ${todayStr()}. Tomorrow is ${tomorrowStr()}.

IMPORTANT: All dates MUST be in YYYY-MM-DD format. Never output relative words like "tomorrow" or "next week" — always convert to a real date.

Return ONLY a JSON object (no markdown) with the adjusted task. Keep ALL original fields. You may:
- Change title, priority, dates, category, status
- Add/remove/modify subtasks
- Split into multiple tasks if needed (return a JSON array instead)

Format for single task: {"title":"...","subtasks":[{"text":"step title","done":false}],"priority":"high|medium|low","startDate":"YYYY-MM-DD or null","dueDate":"YYYY-MM-DD or null","dueTime":"HH:MM or null","category":"...","status":"todo|in_progress|done","notes":"...","links":["..."]}
Format if splitting: [{"title":"...", ...}, {"title":"...", ...}]

Only change what the instruction asks for. Keep everything else intact.`;

  const p = (async () => {
    const raw = await callOllama(system, instruction, ADJUST_TIMEOUT_MS);
    return JSON.parse(raw);
  })();
  inFlight = p;
  try { return await p; } finally { inFlight = null; }
}
