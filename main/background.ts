import { app, ipcMain } from "electron";
import { listTasks, saveTask, deleteTask, clearDone } from "./db";
import { parseTasks, adjustTask } from "./ai";
import { getSettings, setSettings } from "./settings";
import {
  createMainWindow, createPetWindow, setupTray,
  toggleMode, pushCatState, setPetSize,
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

// ─── App Lifecycle ────────────────────────────
app.on("ready", async () => {
  setupTray();
  const s = getSettings();
  if (s.mode === "pet") {
    await createPetWindow();
  } else {
    await createMainWindow();
  }
  tickAmbient();
  setInterval(tickAmbient, 60_000);
});

// Tray app — never quit on window-all-closed; only quit via tray menu
app.on("window-all-closed", () => { /* intentionally empty */ });
