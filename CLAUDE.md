# Toasty — Claude Reference

## What This Is
**Toasty** is a cloud-first (with offline rule-based fallback) pixel-cat desktop companion for vibe-coding.
It lives on-screen while you code: a comnyang-style animated cat that holds your tasks,
reminds you of deadlines, chats via Groq (or Ollama), and lets you capture thoughts by clicking it.

> Identity shift (Phase 10): originally "fully-local, offline-first" with Ollama on the hot path.
> Redesigned to be cloud-first (Groq) with a deterministic rule parser as the offline fallback,
> so task capture NEVER runs local LLM inference and can NEVER freeze the machine.
> Ollama now serves the Chat window only — an explicit, user-initiated opt-in.

> Transformed from the original `task-parser` Next.js web app (Supabase + cloud AI)
> into an Electron desktop app with SQLite storage.

## Stack (Phase 10 — current)
- **Shell**: Electron (via Nextron) — main process owns all native concerns
- **Renderer**: Next.js 14 (Pages Router), React 18, TypeScript — inline-style approach kept
- **Storage**: `better-sqlite3` in Electron main process (`%APPDATA%/Roaming/toasty/toasty.db`)
- **AI (primary)**: Groq cloud API (`api.groq.com/openai/v1`, model `llama-3.3-70b-versatile`); key stored in `settings.json`, entered via Settings panel; never shipped in the build
- **AI (offline parse fallback)**: deterministic rule parser (`main/parseRules.ts`) — instant, zero CPU, never freezes
- **AI (chat fallback)**: Ollama HTTP (`localhost:11434`), model driven by `Settings.model` (default `llama3.2:1b`, changeable in-app); Phase 9 resource guards remain for this path
- **Font**: JetBrains Mono fallback chain (offline-safe — no Google Fonts)
- **IPC**: `window.toasty.*` via Electron `contextBridge`

## IPC Surface (`window.toasty`)
`listTasks()` · `saveTask(task)` · `deleteTask(id)` · `clearDone()` ·
`parse(text)` · `adjust(task, instruction)` · `chat(messages)→string` · `listModels()→string[]` ·
`getSettings()` · `setSettings(patch)` · `toggleMode()` · `onCatState(cb)→unsub` ·
`minimize()` · `closeWindow()` · `setOpacity(v)` ·
`openCapture()` · `closeCapture()` · `openChat()` · `closeChat()` · `setAutoLaunch(enabled)` ·
`getPetPosition()→{x,y}` · `movePet(x,y)` · `setPetIgnore(bool)` · `onReminder(cb)→unsub` · `checkOllama()`

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
`startDate TEXT`, `dueDate TEXT`, `dueTime TEXT`, `category TEXT`, `notes TEXT`, `links TEXT` (JSON),
`sortOrder INTEGER`, `createdAt TEXT`, `updatedAt TEXT`.

## Repo sync
This monorepo path (`personal_projects/pet_assistant/toasty/`) is canonical. It also mirrors to a
standalone repo, `github.com/newbiemi/toasty`, via `git subtree split` (keeps full history, doesn't
touch the monorepo working copy):
```bash
git subtree split -P personal_projects/pet_assistant/toasty -b toasty-split
git push https://github.com/newbiemi/toasty.git toasty-split:main
```
Ask before pushing; the mirror push is a separate step from committing to the monorepo.

## Dev Commands
```bash
npm run dev      # nextron — starts Next.js on :8888 + Electron window
npm run build    # nextron build — static export + electron-builder
npm run rebuild  # electron-builder install-app-deps — rebuild native modules for Electron ABI
```

## Pointer index

- Project Structure (full annotated file tree — which files are READ-ONLY/auto-generated, which need re-transcribing by hand after an edit) → `docs/project-structure.md`
- Key Design Decisions (Phase 3 + Phase 10 — per-mutation saves, `better-sqlite3` ABI rebuild, Ollama resource guards, tray/single-instance lifecycle, IPC drag pattern, NSIS uninstall hook, etc.) → `docs/design-decisions.md`
- Known Issues / Notes (dev-instance conflicts, `os.freemem()` caveat, transparent-window sizing gotchas, pet-window click-through/size-lock mechanics) → `docs/known-issues.md`
- Data Import (one-time Supabase → SQLite migration recipe) → `docs/recipes.md`
- Phases (dated build history, archived 2026-09-05) → `mimo recall "toasty CLAUDE.md Phases history archived"`
