import { app, BrowserWindow, ipcMain } from "electron";
import * as path from "path";
import serve from "electron-serve";
import { listTasks, saveTask, deleteTask, clearDone } from "./db";
import { parseTasks, adjustTask } from "./ai";

const isProd = process.env.NODE_ENV === "production";

const loadURL = isProd
  ? serve({ directory: "app" })
  : null;

let mainWindow: BrowserWindow;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isProd) {
    await (loadURL as any)(mainWindow);
  } else {
    mainWindow.loadURL("http://localhost:8888/");
    mainWindow.webContents.openDevTools();
  }
}

// ─── IPC Handlers ─────────────────────────────
ipcMain.handle("db:list", () => listTasks());
ipcMain.handle("db:save", (_e, task) => saveTask(task));
ipcMain.handle("db:delete", (_e, id) => deleteTask(id));
ipcMain.handle("db:clearDone", () => clearDone());
ipcMain.handle("ai:parse", (_e, text) => parseTasks(text));
ipcMain.handle("ai:adjust", (_e, taskJSON, instruction) => adjustTask(taskJSON, instruction));

// ─── App Lifecycle ────────────────────────────
app.on("ready", createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
