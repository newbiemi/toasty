import { app, ipcMain } from "electron";
import { listTasks, saveTask, deleteTask, clearDone } from "./db";
import { parseTasks, adjustTask, checkOllama, listModels } from "./ai";
import { getSettings, setSettings } from "./settings";
import {
  createMainWindow, createPetWindow, setupTray,
  toggleMode, pushCatState, setPetSize,
  minimizeMain, hideMain, setMainOpacity,
  openCaptureWindow, closeCaptureWindow,
  applyAutoLaunch, setSkipTaskbar, pushOllamaStatus,
  movePetWindow, getPetPosition, pushReminder, setPetIgnoreMouse,
} from "./windows";

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
app.on("ready", async () => {
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
  // Initial Ollama check after window loads, then every 30s
  setTimeout(tickOllama, 2000);
  setInterval(tickOllama, 30_000);
  // Reminder tick every minute
  setInterval(tickReminder, 60_000);
});

// Tray app — never quit on window-all-closed; only quit via tray menu
app.on("window-all-closed", () => { /* intentionally empty */ });
