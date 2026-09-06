// The adjust engine: turn "clear everything overdue" into rows that actually change.
//
// Three stages, deliberately kept apart:
//
//   1. INTENT   instruction text  →  {op, selector, patch}
//               Either from the rule reader below (offline, instant) or from a
//               model via providers/chain.ts. Both produce the same envelope.
//   2. RESOLVE  selector → the actual rows it names, resolved HERE in main,
//               deterministically, against the live DB. Never by the model.
//   3. APPLY    one transaction, with a snapshot taken first so undo() can put
//               everything back.
//
// Why selectors and not ids: the model hallucinates ids, and it cannot see the
// full list anyway — chat context is capped at 10 pending tasks (ai.ts:126-134).
// A selector describes what the user meant ("the ramadan report", "everything
// overdue") and main works out which rows that is. Ambiguity comes back as a
// question, never a guess.
import { listTasks, saveTask, deleteTask, transaction } from "./db";
import { todayStr, safeDate, safeTime } from "./dateUtils";
import { ruleParse } from "./parseRules";
import { callJSON } from "./providers/chain";
import { extractJSON } from "./aiShared";

// ── The envelope ─────────────────────────────────────────────────────────────

export type Op = "add" | "update" | "complete" | "delete" | "move";

export interface Selector {
  /** Free text to match against title, then notes/category. The main handle. */
  match?: string;
  status?: "todo" | "in_progress" | "done";
  category?: string;
  priority?: "high" | "medium" | "low";
  /** dueDate before today and not done — the same rule the dashboard paints red. */
  overdue?: boolean;
  dueOn?: string;
  dueBefore?: string;
  /** Explicit "all of them". Required for a bulk op with no other filter, so a
   *  selector that resolved to nothing useful can't quietly hit every row. */
  all?: boolean;
}

export interface Intent {
  op: Op;
  selector?: Selector;
  patch?: Record<string, any>;
}

export type Confidence = "exact" | "confident" | "ambiguous" | "none";

export interface Resolution {
  intent: Intent;
  matched: any[];
  confidence: Confidence;
  /** Set when confidence is "ambiguous" or "none" — ask the user this instead of guessing. */
  question?: string;
}

// ── Stage 2: resolution ──────────────────────────────────────────────────────

const norm = (s: any) => String(s ?? "").toLowerCase().trim();

/** Same rule as the dashboard's isOverdue (TaskDashboard.tsx:49): a due date in
 *  the past, on a task that isn't done. Date-only — a task due later today is
 *  not overdue. */
export function isOverdue(task: any, today = todayStr()): boolean {
  return task.dueDate != null && task.status !== "done" && task.dueDate < today;
}

function structuralFilter(tasks: any[], sel: Selector): any[] {
  const today = todayStr();
  return tasks.filter((t) => {
    if (sel.status && t.status !== sel.status) return false;
    if (sel.category && norm(t.category) !== norm(sel.category)) return false;
    if (sel.priority && t.priority !== sel.priority) return false;
    if (sel.overdue && !isOverdue(t, today)) return false;
    if (sel.dueOn && t.dueDate !== sel.dueOn) return false;
    if (sel.dueBefore && !(t.dueDate != null && t.dueDate < sel.dueBefore)) return false;
    return true;
  });
}

/** Rank text matches into tiers, best first. Only the best non-empty tier counts —
 *  an exact title match beats three loose substring hits, and should not be called
 *  ambiguous just because the loose ones exist. */
function tieredTextMatch(tasks: any[], needle: string): any[][] {
  const n = norm(needle);
  if (!n) return [];
  const exact: any[] = [];
  const startsWith: any[] = [];
  const contains: any[] = [];
  const elsewhere: any[] = [];
  for (const t of tasks) {
    const title = norm(t.title);
    if (title === n) exact.push(t);
    else if (title.startsWith(n)) startsWith.push(t);
    else if (title.includes(n)) contains.push(t);
    else if (norm(t.notes).includes(n) || norm(t.category).includes(n)) elsewhere.push(t);
  }
  return [exact, startsWith, contains, elsewhere].filter((tier) => tier.length > 0);
}

const preview = (rows: any[], limit = 5) =>
  rows.slice(0, limit).map((t) => `"${t.title}"`).join(", ") +
  (rows.length > limit ? `, and ${rows.length - limit} more` : "");

/**
 * Work out which rows an intent names. Deterministic, reads the live DB, never
 * asks a model anything.
 */
export function resolve(intent: Intent, allTasks?: any[]): Resolution {
  if (intent.op === "add") {
    return { intent, matched: [], confidence: "exact" };
  }

  const sel = intent.selector ?? {};
  const tasks = allTasks ?? (listTasks() as any[]);
  const hasStructural =
    sel.status != null ||
    sel.category != null ||
    sel.priority != null ||
    sel.overdue === true ||
    sel.dueOn != null ||
    sel.dueBefore != null;

  if (!sel.match && !hasStructural && !sel.all) {
    return {
      intent,
      matched: [],
      confidence: "ambiguous",
      question: "Which task did you mean? I couldn't tell from that.",
    };
  }

  const pool = structuralFilter(tasks, sel);

  // No text to match on: a pure bulk op ("everything overdue", "all of today's").
  // Many rows is the expected answer here, not an ambiguity.
  if (!sel.match) {
    if (pool.length === 0) {
      return {
        intent,
        matched: [],
        confidence: "none",
        question: "Nothing matches that — there's no task like it on the list.",
      };
    }
    return { intent, matched: pool, confidence: "confident" };
  }

  const tiers = tieredTextMatch(pool, sel.match);
  if (tiers.length === 0) {
    return {
      intent,
      matched: [],
      confidence: "none",
      question: `I couldn't find a task matching "${sel.match}".`,
    };
  }

  const best = tiers[0];
  if (best.length === 1) return { intent, matched: best, confidence: "exact" };

  return {
    intent,
    matched: best,
    confidence: "ambiguous",
    question: `"${sel.match}" matches ${best.length} tasks — ${preview(best)}. Which one?`,
  };
}

// ── Stage 3: apply, with undo ────────────────────────────────────────────────

/** Fields an adjust is allowed to write. Anything else in a patch is ignored —
 *  a model that invents "assignee" or echoes back "id" cannot reach the DB. */
const PATCHABLE = [
  "title",
  "notes",
  "category",
  "priority",
  "status",
  "dueDate",
  "dueTime",
  "startDate",
  "links",
  "subtasks",
] as const;

const PRIORITIES = ["high", "medium", "low"];
const STATUSES = ["todo", "in_progress", "done"];

/** Keep only fields the model actually answered, validated. Same discipline as
 *  renderer/lib/mergeAdjusted.ts: "" and [] mean "said nothing", not "clear it". */
function sanitisePatch(patch: Record<string, any> | undefined): Record<string, any> {
  const out: Record<string, any> = {};
  if (!patch) return out;
  for (const f of PATCHABLE) {
    const v = patch[f];
    if (v === undefined || v === null) continue;
    if (f === "dueDate" || f === "startDate") {
      const d = safeDate(String(v));
      if (d) out[f] = d;
    } else if (f === "dueTime") {
      const t = safeTime(String(v));
      if (t) out[f] = t;
    } else if (f === "priority") {
      if (PRIORITIES.includes(v)) out[f] = v;
    } else if (f === "status") {
      if (STATUSES.includes(v)) out[f] = v;
    } else if (f === "links") {
      const links = Array.isArray(v)
        ? v.filter((l) => typeof l === "string" && /^https?:\/\//.test(l))
        : [];
      if (links.length > 0) out[f] = links;
    } else if (f === "subtasks") {
      const subs = Array.isArray(v)
        ? v.map((s: any) =>
            typeof s === "string" ? { text: s, done: false } : { text: String(s?.text ?? ""), done: !!s?.done }
          )
        : [];
      if (subs.length > 0) out[f] = subs;
    } else if (typeof v === "string" && v.trim().length > 0) {
      out[f] = v.trim();
    }
  }
  return out;
}

/** Highest `tN` id in use, matching the renderer's scheme (TaskDashboard nextIds).
 *  apply() counts up from this once per batch — recomputing it per add would
 *  hand two new tasks in the same batch the same id. */
function highestId(tasks: any[]): number {
  return tasks.reduce((m, t) => {
    const n = String(t.id).match(/^t(\d+)$/);
    return n ? Math.max(m, parseInt(n[1], 10)) : m;
  }, 0);
}

export interface UndoToken {
  /** Rows as they were before the apply — restored verbatim on undo. */
  before: any[];
  /** Ids the apply created — deleted on undo, since they had no "before". */
  created: string[];
  at: string;
}

export interface ApplyResult {
  changed: number;
  created: string[];
  undo: UndoToken;
  /** Plain-language line per change, for the diff preview Phase 3 will render. */
  summary: string[];
}

/**
 * Apply resolved intents in ONE transaction, snapshotting every row it touches
 * first so undo() can put them back exactly.
 *
 * Synchronous on purpose — better-sqlite3 refuses an async transaction, and it
 * should: an await between BEGIN and COMMIT lets other writes interleave. Do the
 * model call and resolve() before calling this.
 *
 * Resolutions that came back ambiguous or empty are skipped, not guessed at.
 */
export function apply(resolutions: Resolution[]): ApplyResult {
  const all = listTasks() as any[];
  const before: any[] = [];
  const created: string[] = [];
  const summary: string[] = [];
  const seen = new Set<string>();
  const now = new Date().toISOString();

  const snapshot = (t: any) => {
    if (seen.has(t.id)) return;
    seen.add(t.id);
    before.push(JSON.parse(JSON.stringify(t)));
  };

  let idCounter = highestId(all);

  const work = () => {
    for (const r of resolutions) {
      if (r.confidence === "ambiguous" || r.confidence === "none") continue;
      const patch = sanitisePatch(r.intent.patch);

      if (r.intent.op === "add") {
        const id = `t${++idCounter}`;
        const row = {
          id,
          title: patch.title || "Untitled task",
          subtasks: patch.subtasks ?? [],
          priority: patch.priority ?? "medium",
          status: patch.status ?? "todo",
          startDate: patch.startDate ?? null,
          dueDate: patch.dueDate ?? null,
          dueTime: patch.dueTime ?? null,
          category: patch.category ?? "",
          notes: patch.notes ?? "",
          links: patch.links ?? [],
          sortOrder: 0,
          createdAt: now,
          updatedAt: now,
        };
        saveTask(row);
        created.push(id);
        summary.push(`Added "${row.title}"`);
        continue;
      }

      for (const t of r.matched) {
        snapshot(t);
        if (r.intent.op === "delete") {
          deleteTask(t.id);
          summary.push(`Deleted "${t.title}"`);
          continue;
        }
        if (r.intent.op === "complete") {
          saveTask({ ...t, status: "done", updatedAt: now });
          summary.push(`Marked "${t.title}" done`);
          continue;
        }
        // "update" and "move" are the same write; "move" just reads better in a
        // summary and is only ever emitted with a date in the patch.
        saveTask({ ...t, ...patch, id: t.id, createdAt: t.createdAt, updatedAt: now });
        const fields = Object.keys(patch);
        summary.push(
          r.intent.op === "move" && patch.dueDate
            ? `Moved "${t.title}" to ${patch.dueDate}`
            : `Updated ${fields.length > 0 ? fields.join(", ") : "nothing"} on "${t.title}"`
        );
      }
    }
  };

  transaction(work);

  return { changed: before.length + created.length, created, undo: { before, created, at: now }, summary };
}

/**
 * Put back exactly what the matching apply() changed: restore every snapshotted
 * row, delete every row it created. One transaction, so a partial undo is not a
 * state the DB can end up in.
 *
 * The token is held by the caller and lives in memory only — undo does not
 * survive quitting the app. That is deliberate: a journal on disk that outlives a
 * session can resurrect tasks the user deleted on purpose days ago.
 */
export function undo(token: UndoToken): { restored: number; removed: number } {
  transaction(() => {
    for (const id of token.created) deleteTask(id);
    for (const row of token.before) saveTask(row);
  });
  return { restored: token.before.length, removed: token.created.length };
}

// ── Stage 1a: the offline intent reader ──────────────────────────────────────
// Deterministic, instant, no network — the same discipline as parseRules.ts is to
// parseTasks. Covers the phrasings that actually come up; anything it does not
// recognise falls through to the model.

const DONE_RE = /\b(?:mark|set|tick|check)\b.*\b(?:done|complete[d]?|finished)\b|\b(?:done|complete[d]?|finish(?:ed)?)\s+(?:with\s+)?/i;

/** Pull a "…" or 'the X' style target out of an instruction. */
function targetPhrase(text: string, verbRe: RegExp): string | undefined {
  const quoted = text.match(/["'“”‘’]([^"'“”‘’]{2,})["'“”‘’]/);
  if (quoted) return quoted[1].trim();
  const m = text.match(verbRe);
  if (!m) return undefined;
  let rest = text.slice((m.index ?? 0) + m[0].length).trim();
  rest = rest
    .replace(/^(?:the|my|that|this)\s+/i, "")
    .replace(/\s+\b(?:as|to|for|by|on|until|till)\b.*$/i, "")
    .replace(/\s+\b(?:task|item|one)\b\s*$/i, "")
    .replace(/[.!?]+$/, "")
    .trim();
  return rest.length >= 2 ? rest : undefined;
}

/** Does the instruction name a bulk group rather than one task? */
function bulkSelector(text: string): Selector | undefined {
  const sel: Selector = {};
  let hit = false;
  if (/\boverdue\b|\blate\b|\bpast due\b/i.test(text)) {
    sel.overdue = true;
    hit = true;
  }
  if (/\bdone\b/i.test(text) && /\ball\b|\beverything\b/i.test(text)) {
    sel.status = "done";
    hit = true;
  }
  if (/\bdue\s+today\b|\btoday'?s\b/i.test(text)) {
    sel.dueOn = todayStr();
    hit = true;
  }
  if (/\b(?:high|urgent)\s+priority\b|\burgent\s+(?:ones|tasks)\b/i.test(text)) {
    sel.priority = "high";
    hit = true;
  }
  if (!hit && /\b(?:everything|all\s+(?:of\s+)?(?:them|tasks|my\s+tasks))\b/i.test(text)) {
    sel.all = true;
    hit = true;
  }
  return hit ? sel : undefined;
}

/**
 * Read an instruction into an intent envelope using rules only.
 * Returns null when nothing matches — the caller should then try the model.
 */
export function ruleIntent(instruction: string): Intent | null {
  const text = instruction.trim();
  if (!text) return null;

  const bulk = bulkSelector(text);

  // Delete / clear
  if (/\b(?:delete|remove|clear|wipe|get rid of|drop)\b/i.test(text)) {
    const sel = bulk ?? { match: targetPhrase(text, /\b(?:delete|remove|clear|get rid of|drop)\s+/i) };
    if (sel && (sel.match || bulk)) return { op: "delete", selector: sel };
  }

  // Complete
  if (DONE_RE.test(text) || /\b(?:complete|finish)\b/i.test(text)) {
    const sel = bulk ?? {
      match: targetPhrase(text, /\b(?:mark|set|tick|check|complete|finish)\s+(?:off\s+)?/i),
    };
    if (sel && (sel.match || bulk)) return { op: "complete", selector: sel };
  }

  // Move / reschedule — the date comes from the rule parser, never from a model,
  // so "push it to next Friday" resolves the same way task capture would.
  if (/\b(?:move|push|reschedule|postpone|delay|shift|bump)\b/i.test(text)) {
    const parsed = ruleParse(text)[0];
    const sel = bulk ?? {
      match: targetPhrase(text, /\b(?:move|push|reschedule|postpone|delay|shift|bump)\s+/i),
    };
    if ((parsed.dueDate || parsed.dueTime) && sel && (sel.match || bulk)) {
      const patch: Record<string, any> = {};
      if (parsed.dueDate) patch.dueDate = parsed.dueDate;
      if (parsed.dueTime) patch.dueTime = parsed.dueTime;
      return { op: "move", selector: sel, patch };
    }
  }

  // Priority change
  const prio = text.match(/\b(?:make|set|mark)\b.*\b(urgent|high|medium|low)\b/i);
  if (prio) {
    const value = prio[1].toLowerCase() === "urgent" ? "high" : prio[1].toLowerCase();
    const sel = bulk ?? { match: targetPhrase(text, /\b(?:make|set|mark)\s+/i) };
    if (sel && (sel.match || bulk)) return { op: "update", selector: sel, patch: { priority: value } };
  }

  return null;
}

// ── Stage 1b: the model intent reader ────────────────────────────────────────

const INTENT_SYSTEM = `You turn a user's instruction about their task list into a JSON plan. Return ONLY JSON: {"intents":[{"op":"...","selector":{...},"patch":{...}}]}.

op is one of: add, update, complete, delete, move.

selector describes WHICH tasks, by content — never by id, you cannot see ids.
  match:     words from the task's title, as the user said them
  status:    todo | in_progress | done
  category:  a category name
  priority:  high | medium | low
  overdue:   true, for tasks whose due date has passed
  dueOn:     YYYY-MM-DD
  dueBefore: YYYY-MM-DD
  all:       true, ONLY when the user clearly means every task
Use the fewest fields that identify what the user meant. Omit selector for op "add".

patch holds the new values, using only these fields: title, notes, category, priority, status, dueDate, dueTime, startDate, links, subtasks.
Dates must be YYYY-MM-DD, times HH:MM 24-hour. Never output a relative word like "tomorrow".
Leave out any field the user did not ask to change. Never invent a value.

If the instruction is not about changing tasks, return {"intents":[]}.`;

/**
 * Read an instruction into intents: rules first, model only if the rules don't
 * recognise it. Dates in the model's patch are re-derived from the instruction
 * by the rule parser, the same anti-hallucination cross-check parse uses — a
 * model that answers "move it to 2027-01-01" out of nowhere gets that dropped.
 */
export async function readIntents(instruction: string): Promise<Intent[]> {
  const viaRules = ruleIntent(instruction);
  if (viaRules) return [viaRules];

  const res = await callJSON(instruction, {
    system: `${INTENT_SYSTEM}\nToday is ${todayStr()}.`,
  });
  let parsed: any;
  try {
    parsed = JSON.parse(extractJSON(res.text));
  } catch {
    throw new Error("The AI's answer wasn't readable — try rephrasing that.");
  }
  const raw: any[] = Array.isArray(parsed) ? parsed : parsed?.intents ?? [];
  const grounded = ruleParse(instruction)[0];

  return raw
    .filter((i) => ["add", "update", "complete", "delete", "move"].includes(i?.op))
    .map((i) => {
      const patch = { ...(i.patch ?? {}) };
      // Same rule as the parse cross-check: a date the instruction never
      // contained does not survive, whatever the model says.
      if (patch.dueDate && !grounded.dueDate) delete patch.dueDate;
      if (patch.dueTime && !grounded.dueTime) delete patch.dueTime;
      return { op: i.op as Op, selector: i.selector, patch };
    });
}
