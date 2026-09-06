// Shared date helpers — used by ai.ts, parseRules.ts, providers/*, adjust.ts and bench/.
//
// Two things worth knowing before editing:
//
//  1. Dates are formatted from LOCAL calendar parts, never `toISOString()`.
//     Fahmi is UTC+7, so between local midnight and 07:00 the UTC date is still
//     *yesterday* — `new Date().toISOString().split("T")[0]` handed back the wrong
//     "today" for seven hours every morning, which silently poisoned every
//     "tomorrow"/"tonight"/"EOD" parse in that window.
//
//  2. "now" is overridable via setNow(). The benchmark pins a reference date so a
//     fixture whose expected answer is "tomorrow" scores identically on any day it
//     is run. Production never calls setNow — the override starts null.

let nowOverride: Date | null = null;

/** Pin "now" for deterministic runs (benchmark only). Pass null to restore real time. */
export function setNow(d: Date | null): void {
  nowOverride = d;
}

/** The current moment — respects a pinned date if one is set. */
export function nowDate(): Date {
  return nowOverride ? new Date(nowOverride.getTime()) : new Date();
}

/** YYYY-MM-DD built from a Date's LOCAL calendar parts (never UTC). */
export function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayStr(): string {
  return localDateStr(nowDate());
}

export function tomorrowStr(): string {
  return addDays(1);
}

/** Return YYYY-MM-DD N days from today */
export function addDays(n: number): string {
  const d = nowDate();
  d.setDate(d.getDate() + n);
  return localDateStr(d);
}

/** Next occurrence of a weekday (0=Sun … 6=Sat) relative to today.
 *  If today is the target day, returns next week's occurrence. */
export function nextWeekday(targetDay: number): string {
  const d = nowDate();
  const diff = (targetDay - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return localDateStr(d);
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
