// Shared AI utilities — used by ai.ts (Ollama), providers/groq.ts, and parseRules.ts
import { listTasks } from "./db";

// ── JSON extraction ──────────────────────────────────────────────────────────

/** Strip markdown fences and extract the first JSON array or object */
export function extractJSON(raw: string): string {
  let cleaned = raw.replace(/```json|```/g, "").trim();
  const arrStart = cleaned.indexOf("[");
  const arrEnd = cleaned.lastIndexOf("]");
  const objStart = cleaned.indexOf("{");
  const objEnd = cleaned.lastIndexOf("}");
  if (arrStart !== -1 && arrEnd > arrStart) return cleaned.slice(arrStart, arrEnd + 1);
  if (objStart !== -1 && objEnd > objStart) return cleaned.slice(objStart, objEnd + 1);
  return cleaned;
}

/** Normalise parse output to an array.
 *  Handles single-object returns from Groq json_object mode.
 *  Title-echo is handled downstream in groqParse via the 100-char guard. */
export function normalizeParsed(result: unknown, _original: string): any[] {
  return Array.isArray(result)
    ? result
    : result && (result as any).title
      ? [result]
      : [];
}

// ── Structural validation ────────────────────────────────────────────────────

/** Validate and normalise fields on a single parsed task object.
 *  - Dates/times that don't match YYYY-MM-DD / HH:MM are nulled out.
 *  - category is trimmed; empty string left as-is.
 *  Call this before trusting any LLM-returned date/time. */
export function validateParsed(t: any): any {
  return {
    ...t,
    dueDate:   /^\d{4}-\d{2}-\d{2}$/.test(t.dueDate   ?? "") ? t.dueDate   : null,
    dueTime:   /^\d{2}:\d{2}$/.test(t.dueTime           ?? "") ? t.dueTime   : null,
    startDate: /^\d{4}-\d{2}-\d{2}$/.test(t.startDate  ?? "") ? t.startDate : null,
    category:  typeof t.category === "string" ? t.category.trim() : "",
  };
}

// ── Category helpers ─────────────────────────────────────────────────────────

/** Returns the user's most-used categories from the DB as a comma-separated string.
 *  Injected into parse prompts so the model reuses known terms. */
export function getKnownCategories(): string {
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
