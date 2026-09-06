// Deterministic rule-based task parser.
// No LLM, no IO — instant and can never freeze the machine.
// Used as the offline/no-key fallback for parseTasks() and as the
// authoritative date/time/link validator for the Groq anti-hallucination cross-check.
import { todayStr, tomorrowStr, addDays, nextWeekday, nowDate, localDateStr } from "./dateUtils";
import { getKnownCategories } from "./aiShared";

// Every "what day is it" read goes through nowDate() — never `new Date()` directly.
// The benchmark pins a reference date, and a stray `new Date()` silently ignores it.

// ── Time extraction ──────────────────────────────────────────────────────────

type TimePattern = [RegExp, (m: RegExpMatchArray) => string];

const TIME_PATTERNS: TimePattern[] = [
  // "3pm" / "3:30pm" / "3:30 pm"
  [/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i, (m) => {
    let h = parseInt(m[1], 10);
    const min = m[2] ?? "00";
    const ampm = m[3].toLowerCase();
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${min}`;
  }],
  // "15:00" or "9:00" (24h, colon required to avoid matching "t001" ids)
  [/\b([01]?\d|2[0-3]):([0-5]\d)\b/, (m) => `${String(parseInt(m[1], 10)).padStart(2, "0")}:${m[2]}`],
  // "noon"
  [/\bnoon\b/i, () => "12:00"],
  // "midnight"
  [/\bmidnight\b/i, () => "00:00"],
  // Bare hour: "standup at 9", "coffee at 3 tomorrow". Deliberately last, so
  // anything with am/pm or a colon is claimed by the patterns above first.
  //
  // Two guards keep this from eating ordinary numbers ("look at 5 candidates"):
  // it must follow "at", and it must be followed by end-of-input, punctuation,
  // "o'clock", or a date word. Hours 1–7 read as afternoon ("lunch at 1" = 13:00),
  // 8–12 as written — the usual convention, and wrong occasionally by design.
  [
    /\bat\s+(\d{1,2})(?:\s*o'?clock)?(?=\s*$|\s*[.,;!?]|\s+(?:on|today|tomorrow|tonight|tmrw|tmr|sharp|next|this)\b)/i,
    (m) => {
      let h = parseInt(m[1], 10);
      if (h >= 1 && h <= 7) h += 12;
      if (h > 23) h = 12;
      return `${String(h).padStart(2, "0")}:00`;
    },
  ],
];

function extractTime(text: string): { time: string | null; rest: string } {
  for (const [re, fn] of TIME_PATTERNS) {
    const m = text.match(re);
    if (m) {
      return { time: fn(m), rest: text.replace(m[0], " ").replace(/\s+/g, " ").trim() };
    }
  }
  return { time: null, rest: text };
}

// ── Date extraction ──────────────────────────────────────────────────────────

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tuesday: 2,
  wed: 3, wednesday: 3, thu: 4, thursday: 4, fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

const MONTH_NAMES: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
  apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
  aug: 7, august: 7, sep: 8, september: 8, oct: 9, october: 9,
  nov: 10, november: 10, dec: 11, december: 11,
};

/** Midnight today, for "is this candidate date in the past?" comparisons. */
function startOfToday(): Date {
  const n = nowDate();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

/** A calendar date the user most likely meant.
 *  With no explicit year, a day that has already passed rolls to next year —
 *  "Jan 15" said in September means next January, not eight months ago. */
function futureDate(monthIdx: number, day: number, explicitYear?: number): string {
  const year = explicitYear ?? nowDate().getFullYear();
  let cand = new Date(year, monthIdx, day);
  if (explicitYear === undefined && cand < startOfToday()) cand = new Date(year + 1, monthIdx, day);
  return localDateStr(cand);
}

/** Same idea one unit down: a bare day-of-month rolls to next month, not next year.
 *  "pay the invoices on the 3rd" said on the 16th means the 3rd of next month. */
function futureDayOfMonth(day: number): string {
  const n = nowDate();
  let cand = new Date(n.getFullYear(), n.getMonth(), day);
  if (cand < startOfToday()) cand = new Date(n.getFullYear(), n.getMonth() + 1, day);
  return localDateStr(cand);
}

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10,
};

function extractDate(text: string): { date: string | null; rest: string } {
  const strip = (m: string) => text.replace(m, " ").replace(/\s+/g, " ").trim();

  // YYYY-MM-DD (explicit ISO)
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return { date: iso[1], rest: strip(iso[0]) };

  // DD/MM or DD/MM/YYYY
  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/);
  if (slash) {
    const year = slash[3] ? parseInt(slash[3], 10) : undefined;
    return {
      date: futureDate(parseInt(slash[2], 10) - 1, parseInt(slash[1], 10), year),
      rest: strip(slash[0]),
    };
  }

  // "Jan 15" / "Jan 15th" / "15 Jan" / "15th Jan" — ordinal suffix optional
  for (const [name, idx] of Object.entries(MONTH_NAMES)) {
    const re1 = new RegExp(`\\b${name}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "i");
    const re2 = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${name}\\.?\\b`, "i");
    const m = text.match(re1) || text.match(re2);
    if (m) return { date: futureDate(idx, parseInt(m[1], 10)), rest: strip(m[0]) };
  }

  // "in 3 days" / "in two weeks" / "in a month"
  const inN = text.match(/\bin\s+(\d{1,3}|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+(day|week|month)s?\b/i);
  if (inN) {
    const n = /^\d+$/.test(inN[1]) ? parseInt(inN[1], 10) : NUMBER_WORDS[inN[1].toLowerCase()] ?? 1;
    const unit = inN[2].toLowerCase();
    if (unit === "month") {
      const d = nowDate();
      d.setMonth(d.getMonth() + n);
      return { date: localDateStr(d), rest: strip(inN[0]) };
    }
    return { date: addDays(unit === "week" ? n * 7 : n), rest: strip(inN[0]) };
  }

  // "end of month" → last day of this month
  const eom = text.match(/\bend\s+of\s+(?:the\s+)?month\b/i);
  if (eom) {
    const n = nowDate();
    return { date: localDateStr(new Date(n.getFullYear(), n.getMonth() + 1, 0)), rest: strip(eom[0]) };
  }

  // "end of week" / "EOW" → the upcoming Friday
  const eow = text.match(/\bend\s+of\s+(?:the\s+)?week\b|\bEOW\b/i);
  if (eow) return { date: nextWeekday(5), rest: strip(eow[0]) };

  // "next week" → +7 days
  if (/\bnext\s+week\b/i.test(text))
    return { date: addDays(7), rest: text.replace(/\bnext\s+week\b/i, " ").replace(/\s+/g, " ").trim() };

  // "next month" → 1st of next month
  if (/\bnext\s+month\b/i.test(text)) {
    const d = nowDate(); d.setMonth(d.getMonth() + 1, 1);
    return { date: localDateStr(d), rest: text.replace(/\bnext\s+month\b/i, " ").replace(/\s+/g, " ").trim() };
  }

  // Bare day-of-month: "on the 20th", "due the 3rd". Runs after every pattern
  // that carries its own month, so "Oct 20th" is already gone by here.
  const ord = text.match(/\b(?:on\s+|by\s+|due\s+)?(?:the\s+)?(\d{1,2})(st|nd|rd|th)\b/i);
  if (ord) {
    const day = parseInt(ord[1], 10);
    if (day >= 1 && day <= 31) return { date: futureDayOfMonth(day), rest: strip(ord[0]) };
  }

  // Named relative terms — longer matches first to avoid partial hits
  const relMap: [RegExp, () => string][] = [
    [/\bnext\s+(sun|mon|tue|wed|thu|fri|sat|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i,
      () => {
        const m = text.match(/\bnext\s+(\w+)\b/i)!;
        const key = m[1].toLowerCase();
        const target = WEEKDAYS[key] ?? 1;
        const d = nowDate();
        // "next X" = the X after the upcoming one (skip any this week)
        const diff = (target - d.getDay() + 7) % 7 || 7;
        const skip = diff < 7 ? 7 : 0;
        d.setDate(d.getDate() + diff + skip);
        return localDateStr(d);
      },
    ],
    [/\btonight\b/i,   todayStr],
    [/\btomorrow\b/i,  tomorrowStr],
    [/\btmrw\b/i,      tomorrowStr],
    [/\btmr\b/i,       tomorrowStr],
    [/\btoday\b/i,     todayStr],
    [/\bEOD\b/i,       todayStr],
    [/\bCOB\b/i,       todayStr],
    [/\b(sun|mon|tue|wed|thu|fri|sat|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i,
      () => {
        const m = text.match(/\b(sun|mon|tue|wed|thu|fri|sat|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i)!;
        return nextWeekday(WEEKDAYS[m[1].toLowerCase()] ?? 1);
      },
    ],
  ];

  for (const [re, fn] of relMap) {
    if (re.test(text)) {
      return { date: fn(), rest: text.replace(re, " ").replace(/\s+/g, " ").trim() };
    }
  }

  return { date: null, rest: text };
}

// ── Priority extraction ──────────────────────────────────────────────────────

function extractPriority(text: string): { priority: "high" | "medium" | "low"; rest: string } {
  if (/\b(urgent|asap|critical|immediate)\b/i.test(text) || /!!+/.test(text)) {
    return {
      priority: "high",
      rest: text.replace(/\b(urgent|asap|critical|immediate)\b/gi, "").replace(/!!+/g, "").replace(/\s+/g, " ").trim(),
    };
  }
  if (/\b(low[\s-]?priority|whenever|no[\s-]?rush)\b/i.test(text)) {
    return { priority: "low", rest: text };
  }
  return { priority: "medium", rest: text };
}

// ── Category extraction ──────────────────────────────────────────────────────

function extractCategory(text: string): { category: string; rest: string } {
  // Explicit #tag (highest priority)
  const hashTag = text.match(/#([A-Za-z][\w/-]*)/);
  if (hashTag) {
    return { category: hashTag[1], rest: text.replace(hashTag[0], " ").replace(/\s+/g, " ").trim() };
  }
  // Match against the user's known DB categories (case-insensitive substring)
  const known = getKnownCategories().split(", ");
  const lower = text.toLowerCase();
  for (const cat of known) {
    if (lower.includes(cat.toLowerCase())) return { category: cat, rest: text };
  }
  return { category: "", rest: text };
}

// ── Link extraction ──────────────────────────────────────────────────────────

function extractLinks(text: string): { links: string[]; rest: string } {
  const links: string[] = [];
  const rest = text
    .replace(/https?:\/\/\S+/g, (url) => {
      // Trailing sentence punctuation is almost never part of the URL —
      // "read https://influx.com/leave-2026." must not save the full stop.
      links.push(url.replace(/[.,;:!?)\]}'"]+$/, ""));
      return " ";
    })
    .replace(/\s+/g, " ")
    .trim();
  return { links, rest };
}

// ── Title clean-up ───────────────────────────────────────────────────────────

function cleanTitle(s: string): string {
  return s
    .replace(/^(hi|hey|hello)\s+(toasty|there)[,!]?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Subtask extraction ───────────────────────────────────────────────────────

/** Split text into actionable subtask items.
 *  Two modes:
 *  1. Explicit marker  — "subtasks: …", "steps: …", "todo: …" etc. — extract
 *     items listed after the marker (comma/and-separated).
 *  2. Complex task inference — if NO marker but there are 2+ comma/and-separated
 *     verb-led clauses (multi-action), split into subtasks.
 *  Simple single-action tasks return []. */
function extractSubtasks(text: string): { text: string; done: boolean }[] {
  // Explicit subtask / step markers (case-insensitive)
  const MARKER_RE = /\b(?:subtasks?|sub-tasks?|steps?|to[- ]?do(?:s|list)?)\s*[:–\-]\s*/i;
  const markerMatch = text.match(MARKER_RE);
  let segment = "";

  if (markerMatch && markerMatch.index !== undefined) {
    // Take everything after the marker
    segment = text.slice(markerMatch.index + markerMatch[0].length).trim();
  } else {
    // No explicit marker — check if this looks like a complex multi-action task.
    // Heuristic: 2+ comma/and-separated segments that each start with a verb.
    // Verbs here are any word that isn't a preposition/article/number.
    const NON_VERB = /^(?:a|an|the|to|for|with|by|at|in|on|of|from|about|\d)$/i;
    const parts = text
      .split(/,|\band\b|\&/)
      .map((s) => s.trim())
      .filter((s) => s.length > 8); // discard very short fragments
    const verbLed = parts.filter((s) => {
      const firstWord = s.split(/\s+/)[0];
      return firstWord && !NON_VERB.test(firstWord);
    });
    // Require 3+ verb-led clauses without an explicit marker, so a single "and"
    // joining names or objects ("Email Ongki and Budi") does not produce subtasks.
    if (verbLed.length >= 3) {
      segment = parts.join(", ");
    }
  }

  if (!segment) return [];

  // Split segment on commas and "and"/"&", trim, drop very short/empty strings
  const items = segment
    .split(/,|\band\b|\&/)
    .map((s) => s.trim().replace(/^[-•*]\s*/, "")) // strip leading bullets if any
    .filter((s) => s.length > 4);

  if (items.length < 2) return []; // single fragment after split → not a list
  return items.map((s) => ({ text: s.charAt(0).toUpperCase() + s.slice(1), done: false }));
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Parse `text` deterministically — no LLM, no IO, never throws.
 *  Always returns at least one task. */
export function ruleParse(text: string): any[] {
  const cleaned = text
    .replace(/^(hi|hey|hello)\s+(toasty|there)[,!]?\s*/i, "")
    .trim() || text;

  // Extract subtasks from the original cleaned text BEFORE field-stripping,
  // so markers like "subtasks:" survive the pipeline.
  const subtasks = extractSubtasks(cleaned);

  const { links, rest: r1 } = extractLinks(cleaned);
  const { priority, rest: r2 } = extractPriority(r1);
  const { category, rest: r3 } = extractCategory(r2);
  const { time, rest: r4 } = extractTime(r3);
  const { date, rest: r5 } = extractDate(r4);

  const title = cleanTitle(r5) || cleaned; // fallback: full original text

  // A time without an explicit date defaults to today (so reminders can fire)
  const dueDate = date ?? (time ? todayStr() : null);

  return [{
    title,
    subtasks,
    priority,
    startDate: null,
    dueDate,
    dueTime:   time,
    category,
    notes:     "",
    links,
  }];
}
