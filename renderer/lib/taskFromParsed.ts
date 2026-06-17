import type { Task, Subtask } from "@/types/task";

/** Validate YYYY-MM-DD — rejects relative strings like "tomorrow" or "null" */
export const safeDate = (v: any): string | null => {
  if (!v || v === "null") return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : null;
};

/** Validate HH:MM (24h) */
export const safeTime = (v: any): string | null => {
  if (!v || v === "null") return null;
  return /^\d{2}:\d{2}$/.test(String(v)) ? String(v) : null;
};

/**
 * Build a full Task from an AI-parsed item.
 * Normalises subtasks (string[] → Subtask[]), validates dates/times,
 * and applies sensible defaults. Used by both TaskDashboard and capture page
 * so the mapping logic stays in one place.
 */
export function buildTaskFromParsed(
  parsed: any,
  opts: { id: string; now: string; rawText: string }
): Task {
  const { id, now, rawText } = opts;

  // Normalize subtasks: model may return string[] even though we ask for {text,done}[]
  const rawSubs = parsed.subtasks;
  const subtasks: Subtask[] = Array.isArray(rawSubs)
    ? rawSubs.map((s: any) =>
        typeof s === "string"
          ? { text: s, done: false }
          : { text: String(s.text ?? ""), done: !!s.done }
      )
    : [];

  // Only keep strings that look like URLs
  const links: string[] = Array.isArray(parsed.links)
    ? (parsed.links as any[]).filter(
        (l) => typeof l === "string" && (l.startsWith("http://") || l.startsWith("https://"))
      )
    : [];

  const priority: Task["priority"] = (["high", "medium", "low"] as const).includes(parsed.priority)
    ? parsed.priority
    : "medium";

  const dueTime = safeTime(parsed.dueTime);
  // Guard: if the model gave us a time but no date, default dueDate to today
  // so the reminder tick (which checks dueDate===today AND dueTime===now) can fire.
  const dueDate =
    safeDate(parsed.dueDate) ?? (dueTime ? new Date().toISOString().slice(0, 10) : null);

  return {
    id,
    title: parsed.title || rawText,
    subtasks,
    priority,
    status: "todo",
    startDate: safeDate(parsed.startDate),
    dueDate,
    dueTime,
    category: parsed.category || "",
    // Keep raw input as fallback so nothing the user typed is silently lost
    notes: parsed.notes || rawText,
    links,
    createdAt: now,
    updatedAt: now,
  };
}
