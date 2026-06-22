// Groq cloud AI provider (OpenAI-compatible API).
// Used as the primary AI backend for parseTasks, chat, and adjustTask.
// Falls back gracefully — callers catch errors and route to the rule parser / Ollama.
import { getSettings } from "../settings";
import { getKnownCategories, extractJSON, normalizeParsed, validateParsed } from "../aiShared";
import { todayStr, tomorrowStr } from "../dateUtils";
import { ruleParse } from "../parseRules";

const GROQ_BASE = "https://api.groq.com/openai/v1";
// 70b model — required for reliable title summarization on long inputs.
// Free tier: 100 req/min (plenty for personal task capture).
const GROQ_MODEL = "llama-3.3-70b-versatile";
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

export async function groqParse(text: string): Promise<any[]> {
  const key = getSettings().groqApiKey;
  if (!key) throw new Error("No Groq API key configured");

  const knownCategories = getKnownCategories();
  const today = todayStr();
  const tomorrow = tomorrowStr();

  const systemPrompt =
`Extract one or more tasks from the text. Return ONLY a JSON array, no markdown, no extra text.
IMPORTANT: Extract ONLY information explicitly present in the input. Never invent dates, times, names, subtasks, links, or URLs. If a field is not stated, output null (or [] or ""). Add subtasks ONLY when the input literally lists multiple distinct actions, else [].
Today is ${today}. Tomorrow is ${tomorrow}.

Each item must have ALL of these fields:
{"title":"...","dueDate":"YYYY-MM-DD or null","dueTime":"HH:MM 24h or null","startDate":"YYYY-MM-DD or null","priority":"high|medium|low","category":"...","subtasks":[{"text":"step","done":false}],"notes":"...","links":["https://url"] or []}

TITLE: MAX 80 characters. Start with an action verb (Suggest, Create, Review, Update, Send, Escalate, Schedule, Prepare…). Summarize the core action in one short phrase — NEVER copy the full input sentence verbatim. If you cannot summarize, write the single most important noun + verb pair.
PRIORITY: high = hard deadline within 1 week or blocking. medium = standard. low = nice-to-have.
CATEGORY: Pick the closest match from: ${knownCategories}. Never use a date or vague word as a category.
DATES: Never output relative words — always convert to YYYY-MM-DD. Convert 12h to 24h: "3pm"→"15:00".
SUBTASKS: Add specific completable steps ONLY when the input literally lists multiple actions. Return [] for simple tasks.
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

    const arr = normalizeParsed(unwrapped, text);

    // ── Anti-hallucination: cross-check dates/times/links against rule parser ──
    // The rule parser cannot fabricate values not in the input text.
    // If Groq emits a date/time/link the rule parser doesn't find, drop it.
    // Also: if Groq echoes the input verbatim as the title (> 100 chars), replace
    // it with the rule-parsed title — keeps Groq's priority/category/subtasks.
    const ruleResult = ruleParse(text)[0];
    return arr.map((t: any) => {
      const validated = validateParsed(t);
      if (validated.dueDate && !ruleResult.dueDate) validated.dueDate = null;
      if (validated.dueTime && !ruleResult.dueTime) validated.dueTime = null;
      if (validated.links?.length > 0 && ruleResult.links.length === 0) validated.links = [];
      if (!validated.title || validated.title.trim().length > 100) {
        // Model echoed the input — truncate at word boundary as last resort
        const raw = (validated.title || ruleResult.title).trim();
        const cut = raw.slice(0, 80);
        const lastSpace = cut.lastIndexOf(" ");
        validated.title = (lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trim();
      }
      return validated;
    });
  } finally {
    clearTimeout(timer);
  }
}

// ── Chat ──────────────────────────────────────────────────────────────────────

export async function groqChat(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  taskContext: string
): Promise<string> {
  const key = getSettings().groqApiKey;
  if (!key) throw new Error("No Groq API key configured");

  const system = `You are Toasty, a friendly pixel-cat companion who helps with tasks and productivity. Be warm, concise, and helpful. Today is ${todayStr()}.${taskContext}`;

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
    return validateParsed(JSON.parse(raw));
  } finally {
    clearTimeout(timer);
  }
}
