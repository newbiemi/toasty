import { app, BrowserWindow, Tray, Menu, nativeImage } from "electron";
import * as path from "path";
import serve from "electron-serve";
import { getSettings, setSettings } from "./settings";

const isProd = process.env.NODE_ENV === "production";
const loadURL = isProd ? serve({ directory: "app" }) : null;
const PRELOAD = path.join(__dirname, "preload.js");
const DEV_URL = "http://localhost:8888";

export let mainWin: BrowserWindow | null = null;
export let petWin: BrowserWindow | null = null;
let tray: Tray | null = null;

function webPrefs() {
  return { preload: PRELOAD, contextIsolation: true, nodeIntegration: false };
}

export async function createMainWindow(): Promise<BrowserWindow> {
  mainWin = new BrowserWindow({ width: 1280, height: 800, webPreferences: webPrefs() });
  mainWin.on("closed", () => { mainWin = null; });
  if (isProd) {
    await (loadURL as any)(mainWin);
  } else {
    mainWin.loadURL(`${DEV_URL}/`);
  }
  return mainWin;
}

export const PET_FULL = 88;
export const PET_DOT = 34;

export async function createPetWindow(): Promise<BrowserWindow> {
  const s = getSettings();
  const size = s.petMinimized ? PET_DOT : PET_FULL;
  petWin = new BrowserWindow({
    x: s.catX, y: s.catY,
    width: size, height: size,
    transparent: true, frame: false, alwaysOnTop: true,
    hasShadow: false, resizable: false, skipTaskbar: true,
    webPreferences: webPrefs(),
  });
  petWin.on("move", () => {
    if (!petWin) return;
    const [x, y] = petWin.getPosition();
    setSettings({ catX: x, catY: y });
  });
  petWin.on("closed", () => { petWin = null; });
  if (isProd) {
    petWin.loadURL("app://./pet.html");
  } else {
    petWin.loadURL(`${DEV_URL}/pet`);
  }
  return petWin;
}

export function setupTray() {
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    buf[i * 4] = 240; buf[i * 4 + 1] = 184; buf[i * 4 + 2] = 83; buf[i * 4 + 3] = 255;
  }
  const icon = nativeImage.createFromBuffer(buf, { width: size, height: size });
  tray = new Tray(icon);
  tray.setToolTip("Toasty");
  updateTrayMenu();
}

function updateTrayMenu() {
  if (!tray) return;
  const s = getSettings();
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: s.mode === "window" ? "Switch to Pet Mode" : "Switch to Window Mode",
      click: () => toggleMode(),
    },
    { type: "separator" },
    { label: "Quit Toasty", click: () => app.quit() },
  ]));
}

export async function toggleMode() {
  const s = getSettings();
  const next: "window" | "pet" = s.mode === "window" ? "pet" : "window";
  setSettings({ mode: next });
  if (next === "pet") {
    if (mainWin && !mainWin.isDestroyed()) mainWin.close();
    await createPetWindow();
  } else {
    if (petWin && !petWin.isDestroyed()) petWin.close();
    await createMainWindow();
  }
  updateTrayMenu();
}

export function pushCatState(state: string) {
  const win = mainWin ?? petWin;
  if (win && !win.isDestroyed()) win.webContents.send("cat:state", state);
}

export function setPetSize(size: "dot" | "full") {
  const minimized = size === "dot";
  setSettings({ petMinimized: minimized });
  if (!petWin || petWin.isDestroyed()) return;
  const dim = minimized ? PET_DOT : PET_FULL;
  const [x, y] = petWin.getPosition();
  petWin.setSize(dim, dim);
  petWin.setPosition(x, y);
}
