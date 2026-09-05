import { app, ipcMain, globalShortcut } from "electron";
import { listTasks, saveTask, deleteTask, clearDone } from "./db";
import { parseTasks, adjustTask, chat, checkOllama, listModels } from "./ai";
import { getSettings, setSettings } from "./settings";
import {
  createMainWindow, createPetWindow, setupTray,
  toggleMode, pushCatState, setPetSize,
  minimizeMain, hideMain, setMainOpacity,
  openCaptureWindow, closeCaptureWindow,
  openChatWindow, closeChatWindow,
  applyAutoLaunch, setSkipTaskbar, pushOllamaStatus,
  movePetWindow, getPetPosition, pushReminder, setPetIgnoreMouse,
  focusExisting,
} from "./windows";
import { initAutoUpdater, checkForUpdates, installUpdate } from "./updater";
import { resetSettings, resetTasks, resetAll } from "./reset";

// Unify dev + prod userData path so both write to %APPDATA%\Roaming\toasty\
app.setName("toasty");

// ─── IPC: DB ──────────────────────────────────
ipcMain.handle("db:list", () => listTasks());
ipcMain.handle("db:save", async (_e, task) => {
  const result = await saveTask(task);
  pushCatState("happy");
  setTimeout(() => pushCatState("idle"), 2000);
  return result;
});
ipcMain.handle("db:delete", (_e, id) => deleteTask(id));
ipcMain.handle("db:clearDone", () => clearDone());

// ─── IPC: AI ──────────────────────────────────
ipcMain.handle("ai:parse", async (_e, text) => {
  pushCatState("thinking");
  try { return await parseTasks(text); }
  finally { pushCatState("idle"); }
});
ipcMain.handle("ai:adjust", async (_e, taskJSON, instruction) => {
  pushCatState("thinking");
  try { return await adjustTask(taskJSON, instruction); }
  finally { pushCatState("idle"); }
});

// ─── IPC: Settings + Mode ─────────────────────
ipcMain.handle("settings:get", () => getSettings());
ipcMain.handle("settings:set", (_e, patch) => setSettings(patch));
ipcMain.handle("window:toggleMode", () => toggleMode());
ipcMain.handle("pet:setSize", (_e, size: "dot" | "full") => setPetSize(size));

// ─── IPC: Window controls (custom drag bar) ───
ipcMain.handle("window:minimize", () => minimizeMain());
ipcMain.handle("window:close", () => hideMain());
ipcMain.handle("window:setOpacity", (_e, value: number) => setMainOpacity(value));

// ─── IPC: Capture window ──────────────────────
ipcMain.handle("window:openCapture", () => openCaptureWindow());
ipcMain.handle("window:closeCapture", () => closeCaptureWindow());

// ─── IPC: Chat window ─────────────────────────
ipcMain.handle("window:openChat", () => openChatWindow());
ipcMain.handle("window:closeChat", () => closeChatWindow());

// Minimal task builder for use inside main process (mirrors renderer/lib/taskFromParsed.ts logic)
function buildTaskForDB(parsed: any, id: string): any {
  const now = new Date().toISOString();
  const safeDate = (v: any) =>
    v && v !== "null" && /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : null;
  const safeTime = (v: any) =>
    v && v !== "null" && /^\d{2}:\d{2}$/.test(String(v)) ? String(v) : null;
  const rawSubs = parsed.subtasks;
  const subtasks = Array.isArray(rawSubs)
    ? rawSubs.map((s: any) =>
        typeof s === "string" ? { text: s, done: false } : { text: String(s.text ?? ""), done: !!s.done }
      )
    : [];
  const links = Array.isArray(parsed.links)
    ? parsed.links.filter((l: any) => typeof l === "string" && /^https?:\/\//.test(l))
    : [];
  const priority = ["high", "medium", "low"].includes(parsed.priority) ? parsed.priority : "medium";
  const dueTime = safeTime(parsed.dueTime);
  const dueDate = safeDate(parsed.dueDate) ?? (dueTime ? now.slice(0, 10) : null);
  return {
    id, title: parsed.title || "(untitled)", subtasks, priority,
    status: "todo", startDate: safeDate(parsed.startDate), dueDate, dueTime,
    category: parsed.category || "", notes: parsed.notes || "", links,
    sortOrder: 0, createdAt: now, updatedAt: now,
  };
}

const TASK_INTENT_PHRASES = [
  "i'll add", "i've added", "i will add", "i'm adding", "let me add",
  "i can add", "adding that", "i'll create", "i've created", "i will create",
  "new task", "task added", "task is added", "task has been", "created a task",
  "saving that", "i'll save",
];

ipcMain.handle("ai:chat", async (_e, messages) => {
  pushCatState("thinking");
  const added: any[] = [];
  try {
    const reply = await chat(messages);
    const lower = reply.toLowerCase();
    const hasTaskIntent = TASK_INTENT_PHRASES.some((p) => lower.includes(p));
    if (hasTaskIntent) {
      try {
        const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user")?.content ?? "";
        const parsed = await parseTasks(lastUserMsg);
        if (parsed.length > 0) {
          const existing = listTasks() as any[];
          const max = existing.reduce((m: number, t: any) => {
            const n = t.id?.match(/^t(\d+)$/);
            return n ? Math.max(m, parseInt(n[1], 10)) : m;
          }, 0);
          for (let i = 0; i < parsed.length; i++) {
            const task = buildTaskForDB(parsed[i], `t${String(max + 1 + i).padStart(3, "0")}`);
            saveTask(task);
            added.push(task);
          }
        }
      } catch {}
    }
    return { reply, added };
  } finally {
    if (added.length > 0) {
      pushCatState("happy");
      setTimeout(() => pushCatState("idle"), 2000);
    } else {
      pushCatState("idle");
    }
  }
});

// ─── IPC: Auto-launch ─────────────────────────
ipcMain.handle("window:setAutoLaunch", (_e, enabled: boolean) => {
  setSettings({ openAtLogin: enabled });
  app.setLoginItemSettings({ openAtLogin: enabled, name: "Toasty" });
  return enabled;
});

// ─── IPC: Skip taskbar ────────────────────────
ipcMain.handle("window:setSkipTaskbar", (_e, value: boolean) => setSkipTaskbar(value));

// ─── IPC: Pet drag ───────────────────────────
ipcMain.handle("window:getPetPosition", () => getPetPosition());
ipcMain.handle("window:movePet", (_e, x: number, y: number) => movePetWindow(x, y));
ipcMain.handle("window:setPetIgnore", (_e, ignore: boolean) => setPetIgnoreMouse(ignore));

// ─── IPC: Ollama status ───────────────────────
ipcMain.handle("ollama:check", async () => checkOllama());
ipcMain.handle("ai:models", () => listModels());
ipcMain.handle("app:version", () => app.getVersion());
ipcMain.handle("app:installUpdate", () => installUpdate());

// ─── IPC: Reset (temporary trigger only — real UI lands in the Phase 3 menu) ──
ipcMain.handle("app:resetSettings", () => resetSettings());
ipcMain.handle("app:resetTasks", () => resetTasks());
ipcMain.handle("app:resetAll", () => resetAll());

// ─── Ambient state tick ───────────────────────
function isInQuietHours(h: number, from: number, to: number): boolean {
  if (from <= to) return h >= from && h < to;
  return h >= from || h < to;
}

function tickAmbient() {
  const h = new Date().getHours();
  const s = getSettings();
  const sleeping =
    (s.quietHoursEnabled && isInQuietHours(h, s.quietFrom, s.quietTo)) ||
    h >= 22 || h < 6;
  pushCatState(sleeping ? "sleep" : "idle");
}

async function tickOllama() {
  const status = await checkOllama();
  pushOllamaStatus(status);
}

function tickReminder() {
  const now = new Date();
  const todayDate = now.toISOString().split("T")[0];
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const currentTime = `${hh}:${mm}`;
  const due = listTasks().filter((t: any) =>
    t.status !== "done" &&
    t.dueDate === todayDate &&
    t.dueTime === currentTime
  );
  if (due.length > 0) {
    pushCatState("alert");
    pushReminder(due);
    setTimeout(() => pushCatState("idle"), 5 * 60_000);
  }
}

// ─── App Lifecycle ────────────────────────────
// Single-instance lock: second launch focuses the existing Toasty instead of spawning a copy.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => focusExisting());

  app.on("ready", async () => {
    initAutoUpdater();
    setupTray();
    const s = getSettings();
    applyAutoLaunch();
    if (s.mode === "pet") {
      await createPetWindow();
    } else {
      await createMainWindow();
    }
    tickAmbient();
    setInterval(tickAmbient, 60_000);
    // Check for updates after windows load so push events have a target
    setTimeout(checkForUpdates, 3000);
    // Initial Ollama check after window loads, then every 30s
    setTimeout(tickOllama, 2000);
    setInterval(tickOllama, 30_000);
    // Reminder tick every minute
    setInterval(tickReminder, 60_000);
    // Global capture hotkey — note: Ctrl+Shift+T is "reopen closed tab" in browsers;
    // this steals it system-wide while Toasty runs.
    const registered = globalShortcut.register("CommandOrControl+Shift+T", () => {
      openCaptureWindow();
    });
    if (!registered) console.warn("[toasty] Ctrl+Shift+T hotkey already claimed by another app");
  });

  app.on("will-quit", () => globalShortcut.unregisterAll());

  // Tray app — never quit on window-all-closed; only quit via tray menu
  app.on("window-all-closed", () => { /* intentionally empty */ });
}
