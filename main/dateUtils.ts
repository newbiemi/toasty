// Shared date helpers — used by ai.ts, parseRules.ts, and providers/groq.ts

export function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

export function tomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

/** Return YYYY-MM-DD N days from today */
export function addDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

/** Next occurrence of a weekday (0=Sun … 6=Sat) relative to today.
 *  If today is the target day, returns next week's occurrence. */
export function nextWeekday(targetDay: number): string {
  const d = new Date();
  const diff = (targetDay - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}

/** Returns v if it matches YYYY-MM-DD, otherwise null */
export function safeDate(v: string | null | undefined): string | null {
  if (!v || v === "null") return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/** Returns v if it matches HH:MM (24h), otherwise null */
export function safeTime(v: string | null | undefined): string | null {
  if (!v || v === "null") return null;
  return /^\d{2}:\d{2}$/.test(v) ? v : null;
}
