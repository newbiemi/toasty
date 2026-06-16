// ─── AI Provider Abstraction ────────────────
// Swap between Gemini (free) and Anthropic (paid) via AI_PROVIDER env var.
// Both providers receive the same prompt and return the same JSON format.

const provider = process.env.AI_PROVIDER || "groq";

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

// ─── Gemini (Free) ──────────────────────────
async function callGemini(systemPrompt: string, userMessage: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userMessage }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Gemini API error");
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
}

// ─── Groq (Free) ────────────────────────────
async function callGroq(systemPrompt: string, userMessage: string): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY not set");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      temperature: 0.1,
      max_tokens: 4096,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Groq API error");
  return data.choices?.[0]?.message?.content || "[]";
}

// ─── Anthropic (Paid) ───────────────────────
async function callAnthropic(systemPrompt: string, userMessage: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Anthropic API error");
  return data.content?.find((b: any) => b.type === "text")?.text || "[]";
}

// ─── Unified Interface ──────────────────────
async function callAI(systemPrompt: string, userMessage: string): Promise<string> {
  const raw =
    provider === "anthropic"
      ? await callAnthropic(systemPrompt, userMessage)
      : provider === "groq"
      ? await callGroq(systemPrompt, userMessage)
      : await callGemini(systemPrompt, userMessage);

  // Strip markdown fences
  let cleaned = raw.replace(/```json|```/g, "").trim();

  // Extract the outermost JSON array or object in case of trailing text
  const arrStart = cleaned.indexOf("[");
  const arrEnd = cleaned.lastIndexOf("]");
  const objStart = cleaned.indexOf("{");
  const objEnd = cleaned.lastIndexOf("}");

  if (arrStart !== -1 && arrEnd > arrStart) {
    cleaned = cleaned.slice(arrStart, arrEnd + 1);
  } else if (objStart !== -1 && objEnd > objStart) {
    cleaned = cleaned.slice(objStart, objEnd + 1);
  }

  return cleaned;
}

// ─── Public API ─────────────────────────────
export async function parseTasks(text: string) {
  const system = `Extract tasks from text. Return ONLY a JSON array. No markdown.
Each: {"title":"...","subtasks":["..."],"priority":"high|medium|low","startDate":"YYYY-MM-DD or null","dueDate":"YYYY-MM-DD or null","category":"...","notes":"...","links":["..."]}
Infer priority from urgency. Extract/infer dates if mentioned. Today is ${todayStr()}. Extract any URLs/links mentioned. Put extra context in notes. Be concise. If no tasks, return [].`;

  const result = await callAI(system, text);
  return JSON.parse(result);
}

export async function adjustTask(taskJSON: string, instruction: string) {
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

  const result = await callAI(system, instruction);
  return JSON.parse(result);
}

export function getProviderName(): string {
  return provider === "anthropic" ? "Claude (Anthropic)" : provider === "groq" ? "Llama 3.1 (Groq)" : "Gemini 2.5 Flash (Google)";
}
