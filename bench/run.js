// Toasty parse benchmark.
//
//   npm run bench          replay recorded Groq answers (offline, deterministic — this is the gate)
//   npm run bench:live     call Groq for real and re-record every answer
//
// Runs under Electron, not plain node: parseRules -> aiShared -> db -> better-sqlite3,
// which is compiled against the Electron ABI and will not load under `node`.
//
// It scores THREE tracks separately, on purpose:
//
//   raw LLM        what Groq actually answered
//   rule parser    what main/parseRules.ts finds on its own, no model involved
//   cross-checked  what the app really uses (groq.ts takes dates, times and links
//                  from the rule parser, everything else from Groq)
//
// Scoring them apart is the whole point. The rule parser is authoritative for
// dates, so a date Groq got RIGHT is discarded whenever the regexes disagree —
// and in one combined number that looks exactly like the model being wrong. Split
// out, the report points straight at the regex to fix.

const path = require("path");
const fs = require("fs");
const { app } = require("electron");

// Must match background.ts:18 — it is what makes userData resolve to
// %APPDATA%\Roaming\toasty, where the Groq key in settings.json lives.
app.setName("toasty");

const B = path.join(__dirname, ".build", "main");
const { setNow, localDateStr } = require(path.join(B, "dateUtils.js"));
const { setKnownCategories } = require(path.join(B, "aiShared.js"));
const { ruleParse } = require(path.join(B, "parseRules.js"));
const { groqParseRaw, crossCheck, GROQ_MODEL } = require(path.join(B, "providers", "groq.js"));

const FIXTURES = path.join(__dirname, "fixtures", "parse.json");
const RECORDING = path.join(__dirname, "recordings", "groq-parse.json");
const BAR = path.join(__dirname, "bar.json");

const LIVE = process.argv.includes("--live");

// ── Scoring ──────────────────────────────────────────────────────────────────

const eq = (a, b) => {
  if (Array.isArray(a) || Array.isArray(b)) {
    const x = Array.isArray(a) ? a : [];
    const y = Array.isArray(b) ? b : [];
    return x.length === y.length && x.every((v, i) => v === y[i]);
  }
  return (a ?? null) === (b ?? null);
};

const show = (v) => (Array.isArray(v) ? `[${v.join(" | ")}]` : v === null || v === undefined ? "—" : String(v));

/** Score one parsed task against a fixture's `expect`. Only keys present in
 *  `expect` are scored; a key present with value null means "must be empty". */
function score(expect, got) {
  const checks = [];
  for (const field of Object.keys(expect)) {
    const want = expect[field];
    const have = got ? got[field] : undefined;
    checks.push({ field, want, have, ok: eq(want, have) });
  }
  return checks;
}

/** Did the parser invent something the input never said? Only counts fields the
 *  fixture explicitly expects to be empty. */
function inventions(checks) {
  return checks.filter(
    (c) =>
      !c.ok &&
      (c.want === null || (Array.isArray(c.want) && c.want.length === 0)) &&
      c.have !== null &&
      c.have !== undefined &&
      !(Array.isArray(c.have) && c.have.length === 0)
  );
}

/** Title sanity — a hard rule, not a judgement call: non-empty, at most 80 chars,
 *  and not the input echoed back verbatim. */
function titleOk(text, got) {
  const t = (got && got.title ? String(got.title) : "").trim();
  if (!t) return false;
  if (t.length > 80) return false;
  return t.toLowerCase() !== text.trim().toLowerCase();
}

// ── Report ───────────────────────────────────────────────────────────────────

const pct = (n, d) => (d === 0 ? "n/a" : `${Math.round((n / d) * 100)}%`);

function tally(rows, track) {
  let ok = 0,
    total = 0,
    inv = 0,
    titles = 0;
  const byField = {};
  for (const r of rows) {
    for (const c of r[track].checks) {
      byField[c.field] = byField[c.field] || { ok: 0, total: 0 };
      byField[c.field].total++;
      total++;
      if (c.ok) {
        ok++;
        byField[c.field].ok++;
      }
    }
    inv += r[track].inventions.length;
    if (r[track].titleOk) titles++;
  }
  return { ok, total, inv, titles, byField };
}

// ── Live calling ─────────────────────────────────────────────────────────────
// Groq's free tier caps tokens per minute (8,000), not requests, and one parse
// costs roughly 1,000. Firing 40 in a row rate-limits most of them and records a
// pile of empty answers that look exactly like the model failing. So: pace the
// calls, and treat a 429 as "wait and retry", never as an answer.

const PACE_MS = 9000;
const MAX_RETRIES = 4;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callWithBackoff(f) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await groqParseRaw(f.text);
    } catch (e) {
      const rateLimited = /\b429\b/.test(e.message);
      if (!rateLimited || attempt === MAX_RETRIES) {
        console.error(`\n  ! ${f.id}: Groq call failed — ${e.message.slice(0, 160)}`);
        return [];
      }
      // Groq tells us how long to wait; fall back to a widening pause.
      const told = e.message.match(/try again in ([\d.]+)s/);
      const waitMs = told ? Math.ceil(parseFloat(told[1]) * 1000) + 1500 : 5000 * (attempt + 1);
      process.stdout.write("~");
      await sleep(waitMs);
    }
  }
  return [];
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const spec = JSON.parse(fs.readFileSync(FIXTURES, "utf8"));
  const ref = new Date(spec.referenceDate);
  setNow(ref);
  setKnownCategories(spec.knownCategories);

  let recorded = { referenceDate: null, model: null, recordedAt: null, answers: {} };
  if (!LIVE) {
    if (!fs.existsSync(RECORDING)) {
      console.error(
        "No recorded Groq answers yet. Run `npm run bench:live` once (needs the Groq key in settings) to record them."
      );
      app.exit(2);
      return;
    }
    recorded = JSON.parse(fs.readFileSync(RECORDING, "utf8"));
    if (recorded.model !== GROQ_MODEL) {
      console.error(
        `Recording used ${recorded.model} but the app now calls ${GROQ_MODEL}. Re-record with \`npm run bench:live\`.`
      );
      app.exit(2);
      return;
    }
    if (recorded.referenceDate !== spec.referenceDate) {
      console.error(
        `Recording was made against ${recorded.referenceDate} but fixtures now pin ${spec.referenceDate}. Re-record with \`npm run bench:live\`.`
      );
      app.exit(2);
      return;
    }
  }

  const rows = [];
  const answers = {};

  for (const f of spec.fixtures) {
    const rule = ruleParse(f.text)[0];

    let raw;
    if (LIVE) {
      raw = await callWithBackoff(f);
      answers[f.id] = raw;
      process.stdout.write(".");
      await sleep(PACE_MS);
    } else {
      raw = recorded.answers[f.id];
      if (raw === undefined) {
        console.error(`No recorded answer for fixture "${f.id}". Re-record with \`npm run bench:live\`.`);
        app.exit(2);
        return;
      }
    }

    const rawTask = raw[0] || null;
    const cross = crossCheck(raw, f.text)[0] || null;

    const mk = (got) => {
      const checks = score(f.expect, got);
      return { got, checks, inventions: inventions(checks), titleOk: titleOk(f.text, got) };
    };

    rows.push({ f, raw: mk(rawTask), rule: mk(rule), cross: mk(cross) });
  }

  if (LIVE) {
    process.stdout.write("\n");
    fs.mkdirSync(path.dirname(RECORDING), { recursive: true });
    fs.writeFileSync(
      RECORDING,
      JSON.stringify(
        {
          referenceDate: spec.referenceDate,
          model: GROQ_MODEL,
          recordedAt: new Date().toISOString(),
          note: "Raw Groq answers, before the rule-parser cross-check. Replayed by `npm run bench` so the gate is offline and deterministic.",
          answers,
        },
        null,
        2
      )
    );
  }

  // ── Print ──
  const tr = tally(rows, "raw");
  const tp = tally(rows, "rule");
  const tc = tally(rows, "cross");
  const n = rows.length;

  console.log("");
  console.log("Toasty parse benchmark");
  console.log(`${n} test phrases, pretending today is ${spec.referenceDate.slice(0, 10)}`);
  console.log(LIVE ? "Groq answers: called live just now" : `Groq answers: replayed from ${recorded.recordedAt?.slice(0, 10)}`);
  console.log("");
  console.log("How many details each one got right");
  console.log("");
  const line = (label, t) =>
    console.log(
      `  ${label.padEnd(24)} ${String(t.ok).padStart(3)} of ${String(t.total).padEnd(4)} ${pct(t.ok, t.total).padStart(5)}` +
        `   made things up: ${String(t.inv).padStart(2)}   usable titles: ${t.titles}/${n}`
    );
  line("Groq on its own", tr);
  line("Rule parser on its own", tp);
  line("What the app uses", tc);
  console.log("");
  console.log("By detail (what the app actually uses):");
  for (const field of Object.keys(tc.byField)) {
    const c = tc.byField[field];
    const r = tr.byField[field];
    const p = tp.byField[field];
    console.log(
      `  ${field.padEnd(10)} app ${String(c.ok).padStart(2)}/${c.total}` +
        `   (Groq ${r.ok}/${r.total}, rules ${p.ok}/${p.total})`
    );
  }

  // ── Misses, split by cause ──
  const dropped = [];
  const modelWrong = [];
  const disagree = [];
  for (const r of rows) {
    for (const c of r.cross.checks) {
      if (c.ok) continue;
      const rawC = r.raw.checks.find((x) => x.field === c.field);
      const ruleC = r.rule.checks.find((x) => x.field === c.field);
      const entry = {
        id: r.f.id,
        field: c.field,
        want: c.want,
        app: c.have,
        groq: rawC ? rawC.have : undefined,
        rules: ruleC ? ruleC.have : undefined,
      };
      if (rawC && rawC.ok) dropped.push(entry);
      else if (ruleC && ruleC.ok) disagree.push(entry);
      else modelWrong.push(entry);
    }
  }

  const dump = (title, list, hint) => {
    if (list.length === 0) return;
    console.log("");
    console.log(`${title} (${list.length})`);
    if (hint) console.log(`  ${hint}`);
    for (const e of list) {
      console.log(
        `  ${e.id.padEnd(30)} ${e.field.padEnd(9)} wanted ${show(e.want).padEnd(28)} app gave ${show(e.app).padEnd(28)} (Groq ${show(e.groq)}, rules ${show(e.rules)})`
      );
    }
  };

  dump(
    "Right answers the safety check threw away",
    dropped,
    "Groq had these correct. main/parseRules.ts did not find them, so the app dropped them. Fix the regex, not the prompt."
  );
  dump("Groq got these wrong", modelWrong, "The rule parser did not save them either.");
  dump(
    "Rule parser was right, Groq overruled it",
    disagree,
    "Both found a value so the safety check let Groq's through, even though they disagree."
  );

  // ── Gate ──
  let barSpec = null;
  if (fs.existsSync(BAR)) barSpec = JSON.parse(fs.readFileSync(BAR, "utf8"));

  console.log("");
  if (!barSpec) {
    console.log("No pass bar agreed yet (bench/bar.json missing) — reporting only, not passing or failing.");
    app.exit(0);
    return;
  }

  const failures = [];
  const accuracy = tc.total === 0 ? 0 : tc.ok / tc.total;
  if (accuracy < barSpec.minAccuracy)
    failures.push(
      `accuracy ${Math.round(accuracy * 100)}% is below the agreed ${Math.round(barSpec.minAccuracy * 100)}%`
    );
  if (tc.inv > barSpec.maxInvented)
    failures.push(`made up ${tc.inv} details, the agreed limit is ${barSpec.maxInvented}`);
  if (tc.titles < n - barSpec.maxBadTitles)
    failures.push(`${n - tc.titles} unusable titles, the agreed limit is ${barSpec.maxBadTitles}`);

  console.log(`Bar: at least ${Math.round(barSpec.minAccuracy * 100)}% right, at most ${barSpec.maxInvented} made-up details, at most ${barSpec.maxBadTitles} unusable titles.`);
  if (failures.length === 0) {
    console.log("PASS");
    app.exit(0);
  } else {
    for (const f of failures) console.log(`FAIL — ${f}`);
    app.exit(1);
  }
}

app.whenReady().then(() =>
  main().catch((e) => {
    console.error(e);
    app.exit(1);
  })
);
