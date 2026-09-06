// Adjust-pipeline smoke test — no UI, no network.
//
//   npm run bench:adjust                        run the built-in scenarios
//   npm run bench:adjust -- "clear everything overdue"   try one instruction by hand
//
// Runs against a throwaway SQLite file in the system temp dir, seeded fresh every
// time, so it never touches the real %APPDATA%\Roaming\toasty\toasty.db.
//
// What it proves, end to end:
//   selector resolution picks the right rows, by content, never by id
//   an ambiguous selector comes back as a question instead of a guess
//   the apply runs inside one transaction
//   undo puts every touched row back exactly as it was

const path = require("path");
const fs = require("fs");
const os = require("os");
const { app } = require("electron");

// Point userData at a throwaway dir BEFORE anything opens the database.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "toasty-bench-"));
app.setPath("userData", TMP);

const B = path.join(__dirname, ".build", "main");
const { setNow } = require(path.join(B, "dateUtils.js"));
const db = require(path.join(B, "db.js"));
const adjust = require(path.join(B, "adjust.js"));

// Pin "today" so overdue-ness is fixed, not a function of when this runs.
const TODAY = "2026-09-16";
setNow(new Date(`${TODAY}T09:00:00`));

const SEED = [
  ["t1", "Send the Ramadan report to finance", "todo", "2026-09-01", "high", "HR/Management"],
  ["t2", "Review the CSA shortlist", "todo", "2026-09-10", "medium", "Recruitment"],
  ["t3", "Book the team offsite", "todo", "2026-09-30", "medium", "HR/Management"],
  ["t4", "Update the onboarding docs", "in_progress", null, "low", "Documentation"],
  ["t5", "Send the payroll file", "todo", "2026-09-14", "high", "HR/Management"],
  ["t6", "Review the engineering headcount plan", "todo", "2026-09-16", "medium", "Engineering"],
  ["t7", "Archive last year's interview notes", "done", "2026-08-01", "low", "Recruitment"],
];

function seed() {
  for (const t of db.listTasks()) db.deleteTask(t.id);
  SEED.forEach(([id, title, status, dueDate, priority, category], i) => {
    db.saveTask({
      id, title, status, dueDate, priority, category,
      subtasks: [], startDate: null, dueTime: null, notes: "", links: [],
      sortOrder: i, createdAt: `2026-08-20T00:00:00.000Z`, updatedAt: `2026-08-20T00:00:00.000Z`,
    });
  });
}

// ── Tiny assertion helpers ───────────────────────────────────────────────────

let failures = 0;
const ok = (cond, label, detail) => {
  console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}${detail && !cond ? `  — ${detail}` : ""}`);
  if (!cond) failures++;
};

/** A stable fingerprint of the whole table, for "undo really put it back". */
const fingerprint = () =>
  JSON.stringify(
    db.listTasks()
      .map((t) => ({ ...t, updatedAt: undefined }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
  );

const titles = (rows) => rows.map((r) => r.title).sort();

// ── Scenarios ────────────────────────────────────────────────────────────────

function run() {
  console.log(`Adjust pipeline smoke test — pretending today is ${TODAY}`);
  console.log(`Throwaway database: ${TMP}\n`);

  // ── 1. Bulk selector: "clear everything overdue" ──
  seed();
  const beforeAll = fingerprint();
  console.log('1. "clear everything overdue"');
  {
    const intents = [adjust.ruleIntent("clear everything overdue")];
    ok(intents[0] != null, "the rules recognise it without calling a model");
    ok(intents[0].op === "delete", "reads as a delete", `got ${intents[0] && intents[0].op}`);
    ok(intents[0].selector.overdue === true, "selector is overdue:true, not a list of ids");

    const r = adjust.resolve(intents[0]);
    // Overdue = due before 2026-09-16 and not done. t1, t2, t5. NOT t6 (due today),
    // NOT t7 (already done), NOT t3/t4.
    ok(r.confidence === "confident", "resolves confidently", r.confidence);
    ok(
      JSON.stringify(titles(r.matched)) ===
        JSON.stringify(titles([{ title: SEED[0][1] }, { title: SEED[1][1] }, { title: SEED[4][1] }])),
      "matches exactly the 3 overdue tasks",
      titles(r.matched).join(" / ")
    );
    ok(!r.matched.some((t) => t.id === "t6"), "a task due TODAY is not overdue");
    ok(!r.matched.some((t) => t.id === "t7"), "a task already done is not overdue");

    const res = adjust.apply([r]);
    ok(db.listTasks().length === SEED.length - 3, "3 rows gone", `${db.listTasks().length} left`);
    ok(res.summary.length === 3, "one plain-language line per change");

    adjust.undo(res.undo);
    ok(fingerprint() === beforeAll, "undo restored the table exactly");
  }

  // ── 2. Content selector, one match ──
  seed();
  console.log('\n2. "mark the ramadan report as done"');
  {
    const intent = adjust.ruleIntent("mark the ramadan report as done");
    ok(intent != null && intent.op === "complete", "reads as a complete");
    const r = adjust.resolve(intent);
    ok(r.confidence === "exact", "one unambiguous match", r.confidence);
    ok(r.matched.length === 1 && r.matched[0].id === "t1", "found t1 by its words, not its id");

    const before = fingerprint();
    const res = adjust.apply([r]);
    ok(db.getTask("t1").status === "done", "t1 is now done");
    ok(db.getTask("t2").status === "todo", "nothing else moved");
    adjust.undo(res.undo);
    ok(fingerprint() === before, "undo restored it");
  }

  // ── 3. Ambiguity surfaces as a question ──
  seed();
  console.log('\n3. "delete the review" — matches two tasks');
  {
    const r = adjust.resolve({ op: "delete", selector: { match: "review" } });
    ok(r.confidence === "ambiguous", "flagged ambiguous, not guessed", r.confidence);
    ok(r.matched.length === 2, "both candidates carried back", String(r.matched.length));
    ok(typeof r.question === "string" && r.question.length > 0, "a question to ask the user");
    console.log(`        question: ${r.question}`);

    const before = fingerprint();
    adjust.apply([r]);
    ok(fingerprint() === before, "apply refused to touch anything ambiguous");
  }

  // ── 4. Exact title beats a loose substring ──
  seed();
  console.log('\n4. tiering: an exact title wins over partial matches');
  {
    const r = adjust.resolve({ op: "complete", selector: { match: "Review the CSA shortlist" } });
    ok(r.confidence === "exact" && r.matched[0].id === "t2", "picked the exact title", r.confidence);
  }

  // ── 5. Nothing matches ──
  console.log('\n5. "delete the quarterly budget" — no such task');
  {
    const r = adjust.resolve({ op: "delete", selector: { match: "quarterly budget" } });
    ok(r.confidence === "none", "reports nothing found", r.confidence);
    ok(!!r.question, "says so rather than deleting the nearest thing");
  }

  // ── 6. Move, with the date read by the rule parser ──
  seed();
  console.log('\n6. "push the team offsite to next Friday"');
  {
    const intent = adjust.ruleIntent("push the team offsite to next Friday");
    ok(intent != null && intent.op === "move", "reads as a move");
    // Today is Wed 2026-09-16, so "next Friday" is the one after this week's: 25th.
    ok(intent.patch.dueDate === "2026-09-25", "date came from the rule parser", intent.patch.dueDate);
    const r = adjust.resolve(intent);
    ok(r.confidence === "exact" && r.matched[0].id === "t3", "found the offsite");
    const before = fingerprint();
    const res = adjust.apply([r]);
    ok(db.getTask("t3").dueDate === "2026-09-25", "moved", db.getTask("t3").dueDate);
    ok(db.getTask("t3").title === SEED[2][1], "title untouched by the move");
    adjust.undo(res.undo);
    ok(fingerprint() === before, "undo restored the old date");
  }

  // ── 7. A blank field in a patch cannot wipe a real value ──
  seed();
  console.log("\n7. a patch full of blanks changes nothing");
  {
    const before = fingerprint();
    const r = adjust.resolve({
      op: "update",
      selector: { match: "payroll" },
      patch: { title: "", category: "   ", status: "", priority: "", subtasks: [], links: [] },
    });
    adjust.apply([r]);
    ok(fingerprint() === before, "empty strings and empty arrays are ignored, not written");
  }

  // ── 8. Rollback: a failing apply leaves nothing half-done ──
  seed();
  console.log("\n8. a failure mid-apply rolls the whole thing back");
  {
    const before = fingerprint();
    const good = adjust.resolve({ op: "delete", selector: { match: "payroll" } });
    // saveTask() is a raw parameterised INSERT — a row missing named columns throws
    // RangeError. This stands in for any write that blows up half way through.
    const bad = {
      intent: { op: "update", patch: { title: "x" } },
      matched: [{ id: "t2" }],
      confidence: "exact",
    };
    let threw = false;
    try {
      adjust.apply([good, bad]);
    } catch {
      threw = true;
    }
    ok(threw, "the bad write threw");
    ok(fingerprint() === before, "the good delete in the same batch was rolled back too");
  }

  // ── 9. Undo across a multi-op batch ──
  seed();
  console.log("\n9. one undo covers a whole mixed batch");
  {
    const before = fingerprint();
    const batch = [
      adjust.resolve({ op: "complete", selector: { match: "payroll" } }),
      adjust.resolve({ op: "delete", selector: { match: "onboarding docs" } }),
      adjust.resolve({ op: "add", patch: { title: "Draft the Q4 hiring plan", priority: "high" } }),
      adjust.resolve({ op: "add", patch: { title: "Chase the visa paperwork" } }),
    ];
    const res = adjust.apply(batch);
    ok(db.getTask("t5").status === "done", "completed one");
    ok(db.getTask("t4") === null, "deleted one");
    ok(res.created.length === 2, "added two", res.created.join());
    ok(new Set(res.created).size === 2, "the two new tasks got different ids", res.created.join());
    ok(res.created.every((id) => db.getTask(id) !== null), "both new tasks are really there");
    adjust.undo(res.undo);
    ok(fingerprint() === before, "a single undo reversed all four");
    ok(res.created.every((id) => db.getTask(id) === null), "both added tasks were removed again");
  }

  console.log("");
  if (failures === 0) console.log("PASS — every check held");
  else console.log(`FAIL — ${failures} check(s) failed`);
  return failures === 0 ? 0 : 1;
}

// ── Manual mode: one instruction from the command line ───────────────────────

async function manual(instruction) {
  seed();
  console.log(`Instruction: ${instruction}\n`);
  let intents;
  const viaRules = adjust.ruleIntent(instruction);
  if (viaRules) {
    console.log("Read offline by the rules, no model call needed.");
    intents = [viaRules];
  } else {
    console.log("The rules didn't recognise it — asking the model…");
    intents = await adjust.readIntents(instruction);
  }
  console.log(`Plan: ${JSON.stringify(intents, null, 2)}\n`);

  const resolutions = intents.map((i) => adjust.resolve(i));
  for (const r of resolutions) {
    console.log(`  ${r.intent.op}: ${r.confidence}` + (r.question ? ` — ${r.question}` : ""));
    for (const t of r.matched) console.log(`      • ${t.title}`);
  }

  const actionable = resolutions.filter((r) => r.confidence === "exact" || r.confidence === "confident");
  if (actionable.length === 0) {
    console.log("\nNothing applied — see the question above.");
    return 0;
  }
  const res = adjust.apply(actionable);
  console.log(`\nApplied ${res.changed} change(s):`);
  for (const s of res.summary) console.log(`  ${s}`);
  const after = db.listTasks().length;
  adjust.undo(res.undo);
  console.log(`\nUndone. ${after} tasks after the change, ${db.listTasks().length} after undo.`);
  return 0;
}

app.whenReady().then(async () => {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const instruction = args[args.length - 1];
  let code = 1;
  try {
    code = instruction && instruction !== __filename ? await manual(instruction) : run();
  } catch (e) {
    console.error(e);
    code = 1;
  } finally {
    try {
      db.closeDB();
      fs.rmSync(TMP, { recursive: true, force: true });
    } catch {}
  }
  app.exit(code);
});
