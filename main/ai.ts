const OLLAMA_BASE = process.env.OLLAMA_URL || "http://localhost:11434";
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || "llama3.2:3b";
// Generous timeout: first parse after boot may hit a cold Ollama (daemon not loaded yet)
const PARSE_TIMEOUT_MS = 30_000;
const ADJUST_TIMEOUT_MS = 45_000;

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

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
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        system: systemPrompt,
        prompt: userMessage,
        format: "json",
        stream: false,
        options: { temperature: 0.1 },
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

export async function parseTasks(text: string): Promise<any[]> {
  // Strip conversational prefixes so the model isn't confused by greetings
  const cleaned = text.replace(/^(hi|hey|hello)\s+(toasty|there)[,!]?\s*/i, "").trim() || text;

  const system = `Extract tasks from the text. Return ONLY a JSON array, no markdown.
Each item: {"title":"short task title","dueDate":"YYYY-MM-DD or null","priority":"high|medium|low","category":"topic word like work/personal/finance or null"}
Rules: title must be concise (not the full input sentence). Category must be a topic type, NOT a day name or date. Ignore greetings. Today is ${todayStr()}. If no task found, return [].`;

  const raw = await callOllama(system, cleaned, PARSE_TIMEOUT_MS);
  const result = JSON.parse(raw);
  // llama3.2:3b sometimes returns a single object instead of an array — normalise
  const arr = Array.isArray(result) ? result : (result && result.title ? [result] : []);
  // Guard: if the model echoed the full input as the title, it failed — treat as empty
  return arr.filter((t: any) => t.title && t.title.trim().length < cleaned.length * 0.8);
}

function tomorrowStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

export async function adjustTask(taskJSON: string, instruction: string): Promise<any> {
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

  const raw = await callOllama(system, instruction, ADJUST_TIMEOUT_MS);
  return JSON.parse(raw);
}
