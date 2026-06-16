const OLLAMA_BASE = process.env.OLLAMA_URL || "http://localhost:11434";
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || "llama3.2:3b";

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

async function callOllama(systemPrompt: string, userMessage: string): Promise<string> {
  const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
}

export async function parseTasks(text: string): Promise<any[]> {
  const system = `Extract tasks from text. Return ONLY a JSON array. No markdown.
Each: {"title":"...","subtasks":["..."],"priority":"high|medium|low","startDate":"YYYY-MM-DD or null","dueDate":"YYYY-MM-DD or null","category":"...","notes":"...","links":["..."]}
Infer priority from urgency. Extract/infer dates if mentioned. Today is ${todayStr()}. Extract any URLs/links mentioned. Put extra context in notes. Be concise. If no tasks, return [].`;

  const raw = await callOllama(system, text);
  return JSON.parse(raw);
}

export async function adjustTask(taskJSON: string, instruction: string): Promise<any> {
  const system = `You are adjusting an existing task based on the user's instruction.
Current task: ${taskJSON}
Today is ${todayStr()}.

Return ONLY a JSON object (no markdown) with the adjusted task. Keep ALL original fields. You may:
- Change title, priority, dates, category, status
- Add/remove/modify subtasks
- Split into multiple tasks if needed (return a JSON array instead)

Format for single task: {"title":"...","subtasks":["..."],"priority":"high|medium|low","startDate":"YYYY-MM-DD or null","dueDate":"YYYY-MM-DD or null","category":"...","status":"todo|in_progress|done","notes":"...","links":["..."]}
Format if splitting: [{"title":"...", ...}, {"title":"...", ...}]

Only change what the instruction asks for. Keep everything else intact.`;

  const raw = await callOllama(system, instruction);
  return JSON.parse(raw);
}
