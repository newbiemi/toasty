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
export let captureWin: BrowserWindow | null = null;
let tray: Tray | null = null;

function webPrefs() {
  return { preload: PRELOAD, contextIsolation: true, nodeIntegration: false };
}

// ── Keep only edit-role menu so Ctrl+C/V/X/A accelerators stay alive
// (Menu.setApplicationMenu(null) kills clipboard shortcuts in frameless inputs)
function setupAppMenu() {
  const menu = Menu.buildFromTemplate([{ role: "editMenu" }]);
  Menu.setApplicationMenu(menu);
}

export async function createMainWindow(): Promise<BrowserWindow> {
  const s = getSettings();
  mainWin = new BrowserWindow({
    width: 1280,
    height: 800,
    frame: false,          // custom drag bar in the renderer
    transparent: false,    // use setOpacity instead (true breaks win32 hit-testing)
    alwaysOnTop: true,
    skipTaskbar: s.skipTaskbar ?? false,
    webPreferences: webPrefs(),
  });
  mainWin.setOpacity(s.opacity ?? 1.0);
  mainWin.on("closed", () => { mainWin = null; });
  if (isProd) {
    await (loadURL as any)(mainWin);
  } else {
    mainWin.loadURL(`${DEV_URL}/`);
  }
  setupAppMenu();
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

// ── Quick-capture window — small frameless always-on-top box near the cat ──
export async function openCaptureWindow(): Promise<void> {
  if (captureWin && !captureWin.isDestroyed()) {
    captureWin.focus();
    return;
  }
  const s = getSettings();
  // Use live petWin position so capture always appears next to the dragged cat
  const [catX, catY] = (petWin && !petWin.isDestroyed())
    ? petWin.getPosition()
    : [s.catX ?? 50, s.catY ?? 50];
  captureWin = new BrowserWindow({
    x: catX + PET_FULL + 8,
    y: catY,
    width: 380,
    height: 52,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: webPrefs(),
  });
  captureWin.setOpacity(s.opacity ?? 1.0);
  captureWin.on("closed", () => { captureWin = null; });
  captureWin.on("blur", () => {
    // Auto-close when user clicks away (unless focused for paste)
    if (captureWin && !captureWin.isDestroyed()) captureWin.close();
  });
  if (isProd) {
    captureWin.loadURL("app://./capture.html");
  } else {
    captureWin.loadURL(`${DEV_URL}/capture`);
  }
}

export function closeCaptureWindow(): void {
  if (captureWin && !captureWin.isDestroyed()) captureWin.close();
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
      label: s.mode === "window" ? "Open Toasty" : "Switch to Window Mode",
      click: () => {
        if (s.mode !== "window") toggleMode();
        else if (mainWin) { mainWin.show(); mainWin.focus(); }
        else createMainWindow();
      },
    },
    {
      label: s.mode === "window" ? "Switch to Pet Mode" : "Switch to Window Mode",
      click: () => toggleMode(),
    },
    { type: "separator" },
    {
      label: s.openAtLogin ? "✓ Start on Login" : "Start on Login",
      click: () => {
        const next = !s.openAtLogin;
        setSettings({ openAtLogin: next });
        app.setLoginItemSettings({ openAtLogin: next, name: "Toasty" });
        updateTrayMenu();
      },
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

export function pushOllamaStatus(status: "running" | "offline") {
  if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send("ollama:status", status);
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

// ── Window controls (called via IPC from the custom drag bar) ──
export function minimizeMain() {
  if (mainWin && !mainWin.isDestroyed()) mainWin.minimize();
}

export function hideMain() {
  // "Close" hides to tray (consistent with tray-app lifecycle)
  if (mainWin && !mainWin.isDestroyed()) mainWin.hide();
}

export function setMainOpacity(value: number) {
  const clamped = Math.min(1, Math.max(0.2, value));
  setSettings({ opacity: clamped });
  if (mainWin && !mainWin.isDestroyed()) mainWin.setOpacity(clamped);
  if (captureWin && !captureWin.isDestroyed()) captureWin.setOpacity(clamped);
}

export function applyAutoLaunch() {
  const s = getSettings();
  app.setLoginItemSettings({ openAtLogin: s.openAtLogin, name: "Toasty" });
}

export function setSkipTaskbar(value: boolean) {
  setSettings({ skipTaskbar: value });
  if (mainWin && !mainWin.isDestroyed()) mainWin.setSkipTaskbar(value);
}

export function getPetPosition(): { x: number; y: number } {
  if (petWin && !petWin.isDestroyed()) {
    const [x, y] = petWin.getPosition();
    return { x, y };
  }
  const s = getSettings();
  return { x: s.catX, y: s.catY };
}

export function movePetWindow(x: number, y: number) {
  const { workAreaSize } = require("electron").screen.getPrimaryDisplay();
  // Clamp: keep cat at least partially on screen
  const cx = Math.round(Math.min(Math.max(x, -PET_FULL / 2), workAreaSize.width - PET_FULL / 2));
  const cy = Math.round(Math.min(Math.max(y, 0), workAreaSize.height - PET_FULL / 2));
  setSettings({ catX: cx, catY: cy });
  if (petWin && !petWin.isDestroyed()) petWin.setPosition(cx, cy);
}

export function pushReminder(tasks: any[]) {
  const win = mainWin ?? petWin;
  if (win && !win.isDestroyed()) win.webContents.send("toasty:reminder", tasks);
}
