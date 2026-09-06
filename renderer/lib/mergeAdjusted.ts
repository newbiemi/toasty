import type { Task, Subtask } from "../types/task";

/** Validate YYYY-MM-DD — rejects relative strings like "tomorrow" or "null" */
const safeDate = (v: any): string | null => {
  if (!v || v === "null") return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : null;
};

/** Validate HH:MM (24h) */
const safeTime = (v: any): string | null => {
  if (!v || v === "null") return null;
  return /^\d{2}:\d{2}$/.test(String(v)) ? String(v) : null;
};

const PRIORITIES = ["high", "medium", "low"];
const STATUSES = ["todo", "in_progress", "done"];

const filled = (v: any): boolean => typeof v === "string" && v.trim().length > 0;

/**
 * Merge an AI "adjust" response onto the task the user is editing.
 *
 * The whole job of this function is deciding, field by field, whether the model
 * actually answered — because a model that stayed silent about a field returns it
 * as "" or [], not as undefined.
 *
 * The old version spread the patch wholesale and only guarded dates, so asking
 * "make this urgent" could come back with an empty title and blank out a task the
 * user had already written. Now every field is a whitelisted, validated read:
 * a blank string, an empty array or an out-of-range enum value all mean
 * "model said nothing here", and the previous value is kept.
 *
 * Trade-off worth knowing: this means the model cannot CLEAR a field either —
 * "remove the due date" or "delete the subtasks" has to be done by editing the
 * field directly in the panel. Losing a clear is recoverable; losing the user's
 * own text is not.
 *
 * Pure and dependency-free on purpose, so bench/ can verify it headlessly.
 */
export function mergeAdjusted(prev: Task, patch: any): Task {
  const p = patch && typeof patch === "object" ? patch : {};

  // Subtasks: the model may return string[] even though we ask for {text,done}[].
  // An empty array means "didn't answer", not "clear them".
  const rawSubs = p.subtasks;
  const subtasks: Subtask[] =
    Array.isArray(rawSubs) && rawSubs.length > 0
      ? rawSubs.map((s: any) =>
          typeof s === "string"
            ? { text: s, done: false }
            : { text: String(s?.text ?? ""), done: !!s?.done }
        )
      : prev.subtasks;

  // Links: keep only real URLs, and an empty result means "didn't answer".
  const rawLinks = Array.isArray(p.links)
    ? (p.links as any[]).filter(
        (l) => typeof l === "string" && (l.startsWith("http://") || l.startsWith("https://"))
      )
    : [];
  const links = rawLinks.length > 0 ? rawLinks : prev.links;

  return {
    id: prev.id,
    createdAt: prev.createdAt,
    updatedAt: new Date().toISOString(),
    title: filled(p.title) ? p.title.trim() : prev.title,
    category: filled(p.category) ? p.category.trim() : prev.category,
    notes: filled(p.notes) ? p.notes : prev.notes,
    priority: PRIORITIES.includes(p.priority) ? p.priority : prev.priority,
    status: STATUSES.includes(p.status) ? p.status : prev.status,
    dueDate: safeDate(p.dueDate) ?? prev.dueDate,
    startDate: safeDate(p.startDate) ?? prev.startDate,
    dueTime: safeTime(p.dueTime) ?? prev.dueTime,
    subtasks,
    links,
  };
}
