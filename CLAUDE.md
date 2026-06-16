# Toasty — Claude Reference

## What This Is
**Toasty** is a fully-local, offline-first pixel-cat desktop companion for vibe-coding.
It lives on-screen while you code: a comnyang-style animated cat that holds your tasks,
reminds you of deadlines, chats via Ollama, and lets you capture thoughts by clicking it.

> Transformed from the original `task-parser` Next.js web app (Supabase + cloud AI)
> into an Electron desktop app with SQLite storage and a local LLM (Ollama).

## Stack (Phase 1 — complete ✓)
- **Shell**: Electron (via Nextron) — main process owns all native concerns
- **Renderer**: Next.js 14 (Pages Router), React 18, TypeScript — inline-style approach kept
- **Storage**: `better-sqlite3` in Electron main process (`%APPDATA%/Roaming/toasty/toasty.db`)
- **AI**: Ollama HTTP (`localhost:11434`), default model `llama3.2:3b`
- **Font**: JetBrains Mono fallback chain (offline-safe — no Google Fonts)
- **IPC**: `window.toasty.*` via Electron `contextBridge`

## Project Structure (Phase 1 — live)
```
main/
  background.ts       # Electron app lifecycle + IPC handler registration
  db.ts               # better-sqlite3 CRUD (listTasks, saveTask, deleteTask, clearDone)
  ai.ts               # Ollama HTTP caller (format:"json", defensive fence-stripper)
  preload.ts          # contextBridge — exposes window.toasty.*
renderer/
  pages/
    _document.tsx     # Global dark theme CSS (no Google Fonts — fully offline)
    _app.tsx          # Minimal Next.js App wrapper
    index.tsx         # Renders <TaskDashboard />
  components/
    TaskDashboard.tsx # Full UI — all state, IPC calls, rendering (Supabase/cloud removed)
  types/
    task.ts           # Task, Subtask, ParsedTask, AdjustedTask interfaces
    electron.d.ts     # window.toasty type declaration
  public/cat/
    PROMPTS.md        # nano-banana-pro sprite prompts (idle/thinking/alert/happy/sleep)
  next.config.js      # output:"export", images:{unoptimized:true}
  tsconfig.json       # Pages Router config (target:es5, moduleResolution:bundler)
tsconfig.json         # Main process config (target:ES2020, module:commonjs, outDir:app/)
package.json          # Nextron, electron@30, better-sqlite3@9.6.0, electron-builder
```

## IPC Surface (`window.toasty`)
`listTasks()` · `saveTask(task)` · `deleteTask(id)` · `clearDone()` ·
`parse(text)` · `chat(messages)` · `adjust(task, instruction)` ·
`setMode('pet'|'window')` · `onReminder(cb)` · `getSettings()` · `setSettings()`

## Key Design Decisions
- **Per-mutation saves** — every state change immediately persists. No debounce/batch.
- **No Next.js server in Electron production** — `output:"export"` in next.config.js. AI + DB calls go through IPC, not `fetch('/api/...')`.
- **`dangerouslySetInnerHTML` in `_document.tsx`** — avoids Next.js hydration mismatch; do not revert to `<style>` tags.
- **`better-sqlite3` needs ABI rebuild** — install with `npm install --ignore-scripts`, then `npm run rebuild` (`electron-builder install-app-deps`). This downloads the prebuilt binary for Electron's Node ABI. The `postinstall` script was renamed to `rebuild` to prevent system Node collision.
- **`getDB()` deferred path** — `app.getPath("userData")` is called inside `getDB()`, not at module top-level, to avoid running before `app:ready`.
- **`nextId`/`nextIds` are sync** — computed from in-memory task array; no DB round-trip needed.
- **Ollama `format:"json"`** — primary guard for structured parse output. Defensive fence-strip + JSON-slice as backstop in `main/ai.ts:extractJSON()`.

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
- **Phase 1** ✓ — Nextron shell + SQLite (dashboard works fully local, no Supabase)
- **Phase 2** — Pixel cat + pet-overlay / normal-window toggle
- **Phase 3** — Chat + reminders + click-to-capture

## Dev Commands
```bash
npm run dev      # nextron — starts Next.js on :8888 + Electron window
npm run build    # nextron build — static export + electron-builder
npm run rebuild  # electron-builder install-app-deps — rebuild native modules for Electron ABI
```

## Known Issues / Notes
- **Multiple dev instances**: `Get-Process node,electron | Stop-Process` to clear all processes
- **Port 8888**: Nextron's default renderer dev port; `background.ts` hardcodes `localhost:8888` for dev
- **Ollama parse quality**: verify early with 5+ varied inputs; `format:"json"` is the main guard
