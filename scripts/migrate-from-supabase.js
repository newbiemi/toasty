/**
 * migrate-from-supabase.js
 * One-time import of tasks from a Supabase project into the local toasty.db.
 *
 * WHY Electron (not bare node):
 *   - better-sqlite3 is rebuilt for Electron's Node ABI — running it under system
 *     Node risks ERR_DLOPEN_FAILED.
 *   - app.getPath("userData") resolves to the same path the live app uses, so
 *     we write directly to the real %APPDATA%/Roaming/toasty/toasty.db.
 *
 * SETUP:
 *   1. Quit Toasty (tray → Quit) to avoid write contention on toasty.db.
 *   2. Copy scripts/migrate.env.example → scripts/migrate.env and fill in your creds.
 *   3. Run:  npm run migrate
 *   Idempotent — uses UPSERT on id, so re-running is safe.
 *
 * CREDENTIALS (never commit scripts/migrate.env):
 *   SUPABASE_URL=https://your-project.supabase.co
 *   SUPABASE_KEY=your_service_role_key_or_anon_key
 *   SUPABASE_TABLE=tasks   (optional, defaults to "tasks")
 */

const { app } = require("electron");
const path = require("path");
const fs = require("fs");

// ─── Load creds from scripts/migrate.env ─────────────────────────────────────
function loadEnv() {
  const envPath = path.join(__dirname, "migrate.env");
  if (!fs.existsSync(envPath)) {
    console.error(
      "❌  scripts/migrate.env not found.\n" +
      "    Copy scripts/migrate.env.example → scripts/migrate.env and fill in your creds."
    );
    process.exit(1);
  }
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  const env = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

// ─── Map a Supabase row → SQLite task row ────────────────────────────────────
// Handles both snake_case and camelCase source columns.
// EDIT THIS FUNCTION if your Supabase schema differs.
function mapRow(row) {
  const str = (v, def = "") => (v != null ? String(v) : def);
  const json = (v, def = "[]") => {
    if (v == null) return def;
    if (typeof v === "string") return v;
    return JSON.stringify(v);
  };
  const now = new Date().toISOString();

  return {
    // id: keep as-is (uuid coexists fine with t001-style local ids)
    id:         str(row.id ?? row.id),
    title:      str(row.title, "(untitled)"),
    subtasks:   json(row.subtasks),
    priority:   str(row.priority, "medium"),
    status:     str(row.status, "todo"),
    startDate:  str(row.startDate ?? row.start_date, null),
    dueDate:    str(row.dueDate ?? row.due_date, null),
    dueTime:    str(row.dueTime ?? row.due_time, null),
    category:   str(row.category, ""),
    notes:      str(row.notes, ""),
    links:      json(row.links),
    sortOrder:  Number(row.sortOrder ?? row.sort_order ?? 0),
    createdAt:  str(row.createdAt ?? row.created_at, now),
    updatedAt:  str(row.updatedAt ?? row.updated_at, now),
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
// Force userData to match the production app path (%APPDATA%\toasty\)
// Without this, bare `electron script.js` defaults to %APPDATA%\Electron\
app.setName("toasty");
app.whenReady().then(async () => {
  const env = loadEnv();
  const SUPABASE_URL   = env.SUPABASE_URL;
  const SUPABASE_KEY   = env.SUPABASE_KEY;
  const SUPABASE_TABLE = env.SUPABASE_TABLE || "tasks";

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("❌  SUPABASE_URL and SUPABASE_KEY are required in scripts/migrate.env");
    app.quit(); return;
  }

  // Lazy-require so the module only loads after app:ready (ABI constraint)
  const Database = require("better-sqlite3");

  const dbPath = path.join(app.getPath("userData"), "toasty.db");
  console.log(`\n📂  DB path: ${dbPath}`);

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  // Ensure the tasks table exists (mirrors db.ts — safe to run on an existing DB)
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      subtasks TEXT NOT NULL DEFAULT '[]',
      priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'todo',
      startDate TEXT,
      dueDate TEXT,
      dueTime TEXT,
      category TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      links TEXT NOT NULL DEFAULT '[]',
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);
  // Ad-hoc migration for older DBs without dueTime
  try { db.exec("ALTER TABLE tasks ADD COLUMN dueTime TEXT"); } catch {}

  const upsert = db.prepare(`
    INSERT INTO tasks
      (id, title, subtasks, priority, status, startDate, dueDate, dueTime,
       category, notes, links, sortOrder, createdAt, updatedAt)
    VALUES
      (@id, @title, @subtasks, @priority, @status, @startDate, @dueDate, @dueTime,
       @category, @notes, @links, @sortOrder, @createdAt, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title, subtasks = excluded.subtasks,
      priority = excluded.priority, status = excluded.status,
      startDate = excluded.startDate, dueDate = excluded.dueDate,
      dueTime = excluded.dueTime, category = excluded.category,
      notes = excluded.notes, links = excluded.links,
      sortOrder = excluded.sortOrder, updatedAt = excluded.updatedAt
  `);

  // ── Fetch from Supabase (paginate at 1000) ──────────────────────────────
  let allRows = [];
  let page = 0;
  const PAGE = 1000;
  const headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    "Prefer": "count=exact",
  };

  console.log(`\n🔄  Fetching from ${SUPABASE_URL} → table "${SUPABASE_TABLE}" …`);
  while (true) {
    const from = page * PAGE;
    const to   = from + PAGE - 1;
    const url  = `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?select=*&offset=${from}&limit=${PAGE}`;
    const res  = await fetch(url, { headers });
    if (!res.ok) {
      const body = await res.text();
      console.error(`❌  Supabase error ${res.status}: ${body}`);
      db.close(); app.quit(); return;
    }
    const rows = await res.json();
    allRows = allRows.concat(rows);
    console.log(`    page ${page + 1}: fetched ${rows.length} rows (total so far: ${allRows.length})`);
    if (rows.length < PAGE) break;
    page++;
  }

  if (allRows.length === 0) {
    console.log("\n⚠️   No rows found in Supabase. Nothing to import.");
    db.close(); app.quit(); return;
  }

  // ── UPSERT into SQLite ──────────────────────────────────────────────────
  const insert = db.transaction((rows) => {
    let count = 0;
    for (const row of rows) {
      const mapped = mapRow(row);
      if (!mapped.id || !mapped.title) {
        console.warn(`  ⚠  Skipping row with missing id/title:`, row);
        continue;
      }
      upsert.run(mapped);
      count++;
    }
    return count;
  });

  const upserted = insert(allRows);
  db.close();

  console.log(`\n✅  Done — fetched ${allRows.length}, upserted ${upserted} rows into:\n    ${dbPath}\n`);
  app.quit();
});

app.on("window-all-closed", () => { /* intentional no-op */ });
