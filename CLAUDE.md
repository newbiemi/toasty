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

## Project Structure (Phase 3 — live)
```
main/
  background.ts       # Electron app lifecycle + IPC handler registration + ambient state tick
  db.ts               # better-sqlite3 CRUD (listTasks, saveTask, deleteTask, clearDone)
  ai.ts               # Ollama HTTP caller (format:"json", AbortController timeout, lean prompt)
  settings.ts         # ToastySettings read/write (JSON in userData/settings.json); includes opacity, openAtLogin
  windows.ts          # createMainWindow (frameless, alwaysOnTop, setOpacity), createPetWindow,
                      # createCaptureWindow, setupTray (with auto-launch toggle), toggleMode,
                      # pushCatState, minimizeMain, hideMain, setMainOpacity, applyAutoLaunch
  preload.ts          # contextBridge — exposes window.toasty.*
renderer/
  pages/
    _document.tsx     # Global dark theme CSS (no Google Fonts — fully offline)
    _app.tsx          # Minimal Next.js App wrapper
    index.tsx         # Dashboard (renders TaskDashboard)
    pet.tsx           # Transparent pet-overlay; single-click→capture, double-click→dashboard
    capture.tsx       # NEW: slim frameless quick-capture box — paste task, auto-close after add
  components/
    TaskDashboard.tsx # Full UI: custom drag bar, opacity slider, settings panel (auto-launch),
                      # kanban with click-to-edit cards, TaskModal (all fields + AI-adjust),
                      # visible parse-fail indicator
    Cat.tsx           # Sprite animator; emoji fallback if PNG 404s; state→frames→fps
  types/
    task.ts           # Task, Subtask, ParsedTask, AdjustedTask interfaces
    electron.d.ts     # window.toasty type declaration (minimize, closeWindow, setOpacity,
                      # openCapture, closeCapture, setAutoLaunch)
  public/cat/
    PROMPTS.md        # nano-banana-pro sprite prompts (idle/thinking/alert/happy/sleep)
    idle/             # idle_01.png … idle_04.png (drop here)
    thinking/         # thinking_01.png … thinking_04.png
    alert/            # alert_01.png … alert_04.png
    happy/            # happy_01.png … happy_04.png
    sleep/            # sleep_01.png … sleep_04.png
  next.config.js      # output:"export", images:{unoptimized:true}
  tsconfig.json       # Pages Router config (target:es5, moduleResolution:bundler)
tsconfig.json         # Main process config (target:ES2020, module:commonjs, outDir:app/)
package.json          # Nextron, electron@30, better-sqlite3@9.6.0, electron-builder;
                      # asarUnpack: better-sqlite3 (native .node unpacked from asar)
```

## IPC Surface (`window.toasty`)
`listTasks()` · `saveTask(task)` · `deleteTask(id)` · `clearDone()` ·
`parse(text)` · `adjust(task, instruction)` ·
`getSettings()` · `setSettings(patch)` · `toggleMode()` · `onCatState(cb)→unsub` ·
`minimize()` · `closeWindow()` · `setOpacity(v)` ·
`openCapture()` · `closeCapture()` · `setAutoLaunch(enabled)` ·
_(Phase 4: `chat(messages)` · `onReminder(cb)`)_

## Key Design Decisions (updated Phase 3)
- **Per-mutation saves** — every state change immediately persists. No debounce/batch.
- **No Next.js server in Electron production** — `output:"export"` in next.config.js. AI + DB calls go through IPC, not `fetch('/api/...')`.
- **`dangerouslySetInnerHTML` in `_document.tsx`** — avoids Next.js hydration mismatch; do not revert to `<style>` tags.
- **`better-sqlite3` needs ABI rebuild** — install with `npm install --ignore-scripts`, then `npm run rebuild` (`electron-builder install-app-deps`). This downloads the prebuilt binary for Electron's Node ABI. The `postinstall` script was renamed to `rebuild` to prevent system Node collision.
- **`getDB()` deferred path** — `app.getPath("userData")` is called inside `getDB()`, not at module top-level, to avoid running before `app:ready`.
- **`nextId`/`nextIds` are sync** — computed from in-memory task array; no DB round-trip needed.
- **Ollama `format:"json"`** — primary guard for structured parse output. Defensive fence-strip + JSON-slice as backstop in `main/ai.ts:extractJSON()`.
- **Tray-app lifecycle** — `window-all-closed` is a no-op; app only quits via tray context menu "Quit Toasty".
- **Cat state machine** — driven by `pushCatState(state)` from `main/windows.ts`. AI calls: thinking→idle. saveTask: happy→idle (2s). Ambient tick (60s): 22:00-06:00 or quietHours → sleep, else idle.
- **Sprite drop pattern** — `renderer/public/cat/<state>/<state>_01.png … _04.png`. Cat.tsx detects first-frame 404 via `onError` and switches to emoji fallback; no app restart needed once PNGs are dropped.
- **Pet window drag** — `WebkitAppRegion:"drag"` on outer div; `"no-drag"` on the cat sprite so click events reach the `<img>` onClick handler.
- **Single vs double click on cat** — 250ms debounce timer: single-click → `openCapture()`; double-click clears the timer and calls `toggleMode()` (dashboard). Tradeoff: 250ms delay on the primary action. If sluggish, drop to single-click=capture + "Open dashboard" link inside the capture box.
- **Frameless main window** — `frame:false` in `createMainWindow`. OS title bar removed; custom drag bar in the renderer uses `WebkitAppRegion:"drag"` with `"no-drag"` on every button/input.
- **Clipboard accelerators** — do NOT use `Menu.setApplicationMenu(null)`. Set a menu with `{role:"editMenu"}` only; renders nothing visible in a frameless window but keeps Ctrl+C/V/X/A alive in inputs.
- **`setOpacity` vs `transparent`** — main window uses `setOpacity(v)` (runtime slider), NOT `transparent:true`. `transparent:true` on win32 breaks hit-testing when combined with always-on-top. Side effect: `setOpacity` dims Toasty's own text too — user finds their sweet spot with the slider.
- **better-sqlite3 asarUnpack** — `asarUnpack: ["**/node_modules/better-sqlite3/**"]` in `package.json` build config. The native `.node` binary must be outside the asar archive or the packaged app cannot load it.
- **Capture window auto-close on blur** — the capture window closes when it loses focus (`blur` event in `createCaptureWindow`). This mirrors the quick-capture UX expectation (click elsewhere to dismiss).
- **`electron-serve` lives in `windows.ts`** — not in `background.ts`. `background.ts` only handles IPC registration and lifecycle.

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
- **Phase 2** ✓ — Pixel cat + pet-overlay / normal-window toggle
- **Phase 3** ✓ — Frameless+transparent window · edit modal (all fields + AI-adjust) · quick-capture · lean parse prompt · packaged .exe + launch-on-startup
- **Phase 4** — Chat + reminders

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
