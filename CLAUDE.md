# Toasty — Claude Reference

## What This Is
**Toasty** is a fully-local, offline-first pixel-cat desktop companion for vibe-coding.
It lives on-screen while you code: a comnyang-style animated cat that holds your tasks,
reminds you of deadlines, chats via Ollama, and lets you capture thoughts by clicking it.

> Transformed from the original `task-parser` Next.js web app (Supabase + cloud AI)
> into an Electron desktop app with SQLite storage and a local LLM (Ollama).

## Stack (target — Electron phase)
- **Shell**: Electron (via Nextron) — main process owns all native concerns
- **Renderer**: Next.js 14 (App Router), React 18, TypeScript — inline-style approach kept
- **Storage**: `better-sqlite3` in Electron main process (`%APPDATA%/Toasty/toasty.db`)
- **AI**: Ollama HTTP (`localhost:11434`), default model `llama3.2:3b`
- **Font**: JetBrains Mono, dark theme (`#0e0e10` body, `#53f078` accent)
- **IPC**: `window.toasty.*` via Electron `contextBridge`

## Stack (current — pre-Electron web app)
- **Framework**: Next.js 14.2, React 18, TypeScript
- **AI**: Groq (llama-3.1-8b-instant) / Gemini 2.5 Flash / Claude — switched via `AI_PROVIDER`
- **DB**: Supabase (Postgres) via `@supabase/supabase-js` (TO BE REPLACED with SQLite)
- **Font**: JetBrains Mono

## Project Structure (current)
```
app/
  layout.tsx          # Global styles via dangerouslySetInnerHTML (fixes Next.js hydration bug)
  page.tsx            # Renders <TaskDashboard />
  api/
    parse/route.ts    # POST /api/parse  → parseTasks() from lib/ai.ts  [PHASE 1: remove]
    adjust/route.ts   # POST /api/adjust → adjustTask() from lib/ai.ts  [PHASE 1: remove]
components/
  TaskDashboard.tsx   # Full UI — all state, DB calls, and rendering live here
lib/
  ai.ts               # AI provider abstraction — prompts/JSON-extraction reused in main/ai.ts
  supabase.ts         # Supabase client init  [PHASE 1: delete]
  tasks.ts            # Unused scaffold        [PHASE 1: delete]
types/
  task.ts             # Task, Subtask, ParsedTask, AdjustedTask interfaces (camelCase, keep)
supabase/
  schema.sql          # Reference schema       [PHASE 1: delete after migration]
```

## Target Structure (post-Electron scaffold)
```
main/
  background.ts       # Electron app lifecycle + IPC handler registration
  db.ts               # better-sqlite3 CRUD (listTasks, saveTask, deleteTask, clearDone, nextId)
  ai.ts               # Ollama HTTP caller — reuses prompt strings from current lib/ai.ts
  reminders.ts        # setInterval due/overdue scan → IPC push to renderer
  windows.ts          # pet-overlay + main window, toggle, tray
preload/
  index.ts            # contextBridge — exposes window.toasty.*
renderer/             # Next.js UI (moved here under Nextron)
  app/, components/, lib/, types/, public/
  public/cat/         # Sprite drop folder (idle/thinking/alert/happy/sleep)
    PROMPTS.md        # nano-banana-pro prompts for each state
```

## IPC Surface (`window.toasty`)
`listTasks()` · `saveTask(task)` · `deleteTask(id)` · `clearDone()` ·
`parse(text)` · `chat(messages)` · `adjust(task, instruction)` ·
`setMode('pet'|'window')` · `onReminder(cb)` · `getSettings()` · `setSettings()`

## Key Design Decisions
- **DB calls funneled through 5 module-level functions** in `TaskDashboard.tsx` (lines 27-38, 128-160)
  — Phase 1 swaps only these to `window.toasty.*` IPC. Render tree unchanged.
- **Per-mutation saves** — every state change immediately persists. No debounce/batch.
- **No Next.js server in Electron production** — `app/api/` route handlers don't run; AI calls
  go through IPC, not `fetch('/api/...')`.
- **`dangerouslySetInnerHTML` in layout** — required for hydration bug; do not revert.
- **`better-sqlite3` needs ABI rebuild** — use `electron-rebuild` after `npm install`.
  This is the #1 Nextron + native module pitfall.

## Cat States → Sprite Files
| State | Trigger | Subfolder |
|---|---|---|
| `idle` | default / vibe presence | `public/cat/idle/` |
| `thinking` | during Ollama parse/chat call | `public/cat/thinking/` |
| `alert` | task due/overdue | `public/cat/alert/` |
| `happy` | task added / completed | `public/cat/happy/` |
| `sleep` | quiet hours / night | `public/cat/sleep/` |

## SQLite Table: `tasks`
Mirrors the old Supabase schema but in **camelCase columns** (no snake_case mapping needed):
`id TEXT PK`, `title TEXT`, `subtasks TEXT` (JSON), `priority TEXT`, `status TEXT`,
`startDate TEXT`, `dueDate TEXT`, `category TEXT`, `notes TEXT`, `links TEXT` (JSON),
`sortOrder INTEGER`, `createdAt TEXT`, `updatedAt TEXT`.

## Phases
- **Phase 1** — Nextron shell + SQLite (dashboard works fully local, no Supabase)
- **Phase 2** — Pixel cat + pet-overlay / normal-window toggle
- **Phase 3** — Chat + reminders + click-to-capture

## Dev Notes
- Old PM2 setup (port 3001) is obsolete once Electron shell is added.
- `lib/tasks.ts` is an unused scaffold — delete in Phase 1.
- Ollama parse quality risk: use `format: "json"` in Ollama calls + keep the defensive
  JSON fence-stripper from `lib/ai.ts:callAI` as backstop. Verify early with 5 test inputs.

## Known Issues / History (pre-Electron)
- **Groq/Gemini quota**: creating a new key in the same Google project does NOT reset quota.
- **Hydration error**: fixed in `layout.tsx` — do not revert `<style>` to plain template literal.
- **Multiple dev instances**: `Get-Process node | Stop-Process` to wipe all Node processes.
