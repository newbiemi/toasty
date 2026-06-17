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
- **AI**: Ollama HTTP (`localhost:11434`), model driven by `Settings.model` (default `llama3.2:3b`, changeable in-app)
- **Font**: JetBrains Mono fallback chain (offline-safe — no Google Fonts)
- **IPC**: `window.toasty.*` via Electron `contextBridge`

## Project Structure (Phase 7 — live)
```
main/
  background.ts       # Electron app lifecycle + IPC handler registration + ambient state tick
  db.ts               # better-sqlite3 CRUD (listTasks, saveTask, deleteTask, clearDone)
  ai.ts               # Ollama HTTP caller (format:"json", AbortController timeout, full-field parse prompt);
                      # exports parseTasks, adjustTask, checkOllama, listModels
  settings.ts         # ToastySettings read/write (JSON in userData/settings.json); model field is live
  windows.ts          # createMainWindow (frameless, alwaysOnTop, setOpacity), createPetWindow,
                      # createCaptureWindow, setupTray (with auto-launch toggle), toggleMode,
                      # pushCatState, minimizeMain, hideMain, setMainOpacity, applyAutoLaunch
  preload.ts          # contextBridge — exposes window.toasty.*
scripts/
  migrate-from-supabase.js  # One-time data import: Supabase tasks → toasty.db (run via npm run migrate)
  migrate.env.example       # Credential template (copy → scripts/migrate.env, gitignored)
renderer/
  lib/
    taskFromParsed.ts # Shared helper: safeDate, safeTime, buildTaskFromParsed — used by both
                      # capture.tsx and TaskDashboard.tsx; normalises all AI-parsed task fields
  pages/
    _document.tsx     # Global dark theme CSS (no Google Fonts — fully offline)
    _app.tsx          # Minimal Next.js App wrapper
    index.tsx         # Dashboard (renders TaskDashboard)
    pet.tsx           # Transparent pet-overlay; single-click→capture, double-click→dashboard
    capture.tsx       # Slim frameless quick-capture box — paste task, auto-close after add; 💬 button opens chat
    chat.tsx          # Floating 360×460 chat window — multi-turn Ollama /api/chat; drag header + X close
  components/
    TaskDashboard.tsx # Full UI: custom drag bar, opacity slider, settings panel (auto-launch +
                      # model selector), kanban with click-to-edit cards, TaskModal (all fields +
                      # AI-adjust), visible parse-fail indicator
    Cat.tsx           # Sprite animator; emoji fallback if PNG 404s; state→frames→fps
  types/
    task.ts           # Task, Subtask, ParsedTask (includes dueTime), AdjustedTask interfaces
    electron.d.ts     # window.toasty type declaration; includes listModels()
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
`parse(text)` · `adjust(task, instruction)` · `chat(messages)→string` · `listModels()→string[]` ·
`getSettings()` · `setSettings(patch)` · `toggleMode()` · `onCatState(cb)→unsub` ·
`minimize()` · `closeWindow()` · `setOpacity(v)` ·
`openCapture()` · `closeCapture()` · `openChat()` · `closeChat()` · `setAutoLaunch(enabled)` ·
`getPetPosition()→{x,y}` · `movePet(x,y)` · `setPetIgnore(bool)` · `onReminder(cb)→unsub` · `checkOllama()`

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
- **Pet window drag (IPC-based)** — `WebkitAppRegion:"drag"` is NOT used on the pet window. Instead, `handleMouseDown` async-calls `getPetPosition()` IPC (reliable main-process coordinates), then tracks delta via global `mousemove`/`mouseup` listeners and calls `movePet(x, y)` IPC on each move. `WebkitAppRegion` swallows clicks; IPC drag lets click events reach the cat sprite. `window.screenLeft/Top` is unreliable under Windows DPI scaling in transparent windows — always use `getPetPosition()` for the base coordinate.
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
`startDate TEXT`, `dueDate TEXT`, `dueTime TEXT`, `category TEXT`, `notes TEXT`, `links TEXT` (JSON),
`sortOrder INTEGER`, `createdAt TEXT`, `updatedAt TEXT`.

## Phases
- **Phase 1** ✓ — Nextron shell + SQLite (dashboard works fully local, no Supabase)
- **Phase 2** ✓ — Pixel cat + pet-overlay / normal-window toggle
- **Phase 3** ✓ — Frameless+transparent window · edit modal (all fields + AI-adjust) · quick-capture · lean parse prompt · packaged .exe + launch-on-startup
- **Phase 4** ✓ — Draggable cat (IPC-based) · dueTime field + reminder tick · subtask generation fix · reminder banner in dashboard
- **Phase 5** ✓ — Full-field parser (dueTime/subtasks/startDate/notes/links at capture time) · Settings model selector (live model switching) · listModels IPC · shared taskFromParsed helper · Supabase→SQLite one-time import script (`npm run migrate`)
- **Phase 6** ✓ — Pet window size-lock (fixes DPI drift on 125%/150% scaling) · transparent corner click-through (per-pixel alpha via offscreen canvas + `setIgnoreMouseEvents(true,{forward:true})`)
- **Phase 7** ✓ — Global hotkey `Ctrl+Shift+T` → opens capture window · Chat with Toasty (floating 360×460 window, multi-turn `/api/chat`, task-aware system prompt, 💬 entry via capture box)

## Dev Commands
```bash
npm run dev      # nextron — starts Next.js on :8888 + Electron window
npm run build    # nextron build — static export + electron-builder
npm run rebuild  # electron-builder install-app-deps — rebuild native modules for Electron ABI
```

## Data Import (one-time)
To pull existing tasks out of a Supabase project and into the local `toasty.db`:
1. Quit Toasty (tray → Quit).
2. Copy `scripts/migrate.env.example` → `scripts/migrate.env`; fill in `SUPABASE_URL` and `SUPABASE_KEY`.
3. Run `npm run migrate` — outputs the resolved DB path, rows fetched, rows upserted.
4. Launch Toasty normally. Imported UUIDs coexist with local `t001`-style ids.
- Idempotent: re-running is safe (UPSERT on id).
- Why `electron scripts/...` not bare `node`: `better-sqlite3` is rebuilt for Electron's Node ABI; running under system Node hits `ERR_DLOPEN_FAILED`. The script also uses `app.getPath("userData")` to find the exact same DB file the live app uses.

## Known Issues / Notes
- **Multiple dev instances**: `Get-Process node,electron | Stop-Process` to clear all processes
- **Port 8888**: Nextron's default renderer dev port; `background.ts` hardcodes `localhost:8888` for dev
- **Ollama parse quality**: verify early with 5+ varied inputs; `format:"json"` is the main guard
- **`100vw/100vh` in transparent Electron windows** — resolves to full monitor dimensions on Windows, not the window dimensions. Never use for sizing transparent windows; use explicit pixels or `100%` with a properly constrained parent.
- **`window.screenLeft/Top` unreliable** — in transparent Electron windows under Windows DPI scaling. Always use `getPetPosition()` IPC (main process `petWin.getPosition()`) for reliable coordinates.
- **Subtask AI format** — `adjustTask` prompt specifies `[{"text":"...","done":false}]`, but the model may still return `string[]`. `mergeAdjusted()` in `TaskDashboard.tsx` normalizes both shapes.
- **Pet window size-lock** — `createPetWindow` calls `setMinimumSize==setMaximumSize` after creation; `setPetSize` uses the sequence `setMinimumSize(0,0) → setMaximumSize(dim) → setSize(dim) → setMinimumSize(dim)` (releasing the floor first avoids a transient `min > max` on the 34→88 restore path); `movePetWindow` uses `setBounds({x,y,w,h})` instead of `setPosition` to re-assert canonical size every drag tick. Required because `transparent:true` + repeated `setPosition` under Windows 125%/150% scaling accumulates DIP rounding drift and grows the window bounding box.
- **Pet corner click-through** — pet window defaults to interactive (`ignore=false`). On each `mousemove` in `pet.tsx`, per-pixel alpha is sampled: cursor position is mapped into the 72×72 sprite box (8px margin inside the 88×88 window), the current frame is drawn into an offscreen canvas via `Cat`'s `onFrameImg` callback, and `getImageData(x,y,1,1).data[3] < 10` flips the window to `setIgnoreMouseEvents(true, {forward:true})`. Flipping back to interactive happens when the cursor re-enters an opaque pixel, the minimize button (`[data-min-btn]`), or during a drag. Default-interactive (not default-ignore) prevents a race where a fast click on the cat passes through to the app behind before the IPC round-trip completes.
