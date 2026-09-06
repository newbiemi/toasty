import { app, BrowserWindow, Tray, Menu, nativeImage } from "electron";
import * as path from "path";
import serve from "electron-serve";
import { getSettings, setSettings } from "./settings";

const isProd = process.env.NODE_ENV === "production";
// Registers the "app://" protocol every window's prod loadURL relies on — the
// returned helper isn't used directly (every window calls .loadURL("app://...")
// itself), only this side effect.
if (isProd) serve({ directory: "app" });
const PRELOAD = path.join(__dirname, "preload.js");
const DEV_URL = "http://localhost:8888";

export let widgetWin: BrowserWindow | null = null;
export let petWin: BrowserWindow | null = null;
export let captureWin: BrowserWindow | null = null;
export let chatWin: BrowserWindow | null = null;
export let menuWin: BrowserWindow | null = null;
let tray: Tray | null = null;

function webPrefs() {
  return { preload: PRELOAD, contextIsolation: true, nodeIntegration: false };
}

// Dev: app/windows.js (compiled from main/windows.ts) sits at <project>/app, so
// "../resources" resolves to <project>/resources. Prod: extraResources copies
// resources/* to the app's resourcesPath root (see package.json build.extraResources).
function resourcePath(name: string): string {
  return isProd ? path.join(process.resourcesPath, name) : path.join(__dirname, "../resources", name);
}

// ── Keep only edit-role menu so Ctrl+C/V/X/A accelerators stay alive
// (Menu.setApplicationMenu(null) kills clipboard shortcuts in frameless inputs)
function setupAppMenu() {
  const menu = Menu.buildFromTemplate([{ role: "editMenu" }]);
  Menu.setApplicationMenu(menu);
}

// The widget: ~420×520, frameless, always-on-top, position restored from
// settings (widgetX/widgetY — deliberately separate from the cat's catX/catY,
// since they are two independently-draggable windows now). Holds the task
// list, the parse/adjust prompts and the diff preview; everything else lives
// in the menu window (see createMenuWindow below).
export const WIDGET_W = 420;
export const WIDGET_H = 520;

export async function createWidgetWindow(): Promise<BrowserWindow> {
  const s = getSettings();
  widgetWin = new BrowserWindow({
    x: s.widgetX, y: s.widgetY,
    width: WIDGET_W,
    height: WIDGET_H,
    frame: false,          // custom drag bar in the renderer
    transparent: false,    // use setOpacity instead (true breaks win32 hit-testing)
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: s.skipTaskbar ?? false,
    icon: resourcePath("icon.png"),
    webPreferences: webPrefs(),
  });
  widgetWin.setOpacity(s.opacity ?? 1.0);
  // Same DPI-drift fix as the pet window (A1/A3 below): persist on "move" and
  // re-assert bounds rather than trust accumulated setPosition calls.
  widgetWin.on("move", () => {
    if (!widgetWin) return;
    const [x, y] = widgetWin.getPosition();
    setSettings({ widgetX: x, widgetY: y });
  });
  widgetWin.on("closed", () => { widgetWin = null; });
  if (isProd) {
    widgetWin.loadURL("app://./widget.html");
  } else {
    widgetWin.loadURL(`${DEV_URL}/widget`);
  }
  setupAppMenu();
  return widgetWin;
}

// ── Menu window — Settings · AI · Appearance · Data & Reset · About/Updates.
// Opened on demand (cat click, tray), not always visible like the widget.
const MENU_W = 460;
const MENU_H = 420;

export async function openMenuWindow(): Promise<void> {
  if (menuWin && !menuWin.isDestroyed()) { menuWin.focus(); return; }
  const s = getSettings();
  const { screen } = require("electron");
  const { workAreaSize } = screen.getPrimaryDisplay();
  const [catX, catY] = (petWin && !petWin.isDestroyed())
    ? petWin.getPosition()
    : [s.catX ?? 50, s.catY ?? 50];
  const xCandidate = catX + PET_W + 8;
  const x = Math.min(Math.max(0, xCandidate + MENU_W <= workAreaSize.width ? xCandidate : catX - MENU_W - 8), workAreaSize.width - MENU_W);
  const y = Math.min(Math.max(0, catY), workAreaSize.height - MENU_H);
  menuWin = new BrowserWindow({
    x, y, width: MENU_W, height: MENU_H,
    frame: false, transparent: false,
    alwaysOnTop: true, skipTaskbar: true, resizable: false,
    icon: resourcePath("icon.png"),
    webPreferences: webPrefs(),
  });
  menuWin.setOpacity(s.opacity ?? 1.0);
  menuWin.on("closed", () => { menuWin = null; });
  if (isProd) {
    menuWin.loadURL("app://./menu.html");
  } else {
    menuWin.loadURL(`${DEV_URL}/menu`);
  }
}

export function closeMenuWindow(): void {
  if (menuWin && !menuWin.isDestroyed()) menuWin.close();
}

// PET_FULL / PET_CAT (88) is the cat's own hit-region — kept as the on-screen
// clamp basis (movePetWindow) so the cat can still reach every screen edge.
// PET_W/PET_H is the FULL fixed canvas (cat + room for the side menu opened in
// the renderer) — enlarging this does NOT resize the window on menu toggle
// (that's pure React state in pet.tsx); it only changes the size the OS window
// is created/locked at. Must match PET_W/PET_H in renderer/pages/pet.tsx.
export const PET_FULL = 88;
export const PET_CAT = PET_FULL;
export const PET_W = 340;
export const PET_H = 300;
export const PET_DOT = 34;

function fullDims(): [number, number] {
  return [PET_W, PET_H];
}

export async function createPetWindow(): Promise<BrowserWindow> {
  const s = getSettings();
  const [w, h] = s.petMinimized ? [PET_DOT, PET_DOT] : fullDims();
  petWin = new BrowserWindow({
    x: s.catX, y: s.catY,
    width: w, height: h,
    transparent: true, frame: false, alwaysOnTop: true,
    hasShadow: false, resizable: false, skipTaskbar: true,
    icon: resourcePath("icon.png"),
    webPreferences: webPrefs(),
  });
  // A1: Hard-lock size so the OS cannot resize the transparent window.
  // Required on Windows 125%/150% scaling: repeated setPosition on a transparent window
  // accumulates DIP↔physical rounding drift and grows the bounding box.
  petWin.setMinimumSize(w, h);
  petWin.setMaximumSize(w, h);
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
    x: catX + PET_W + 8,
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

export async function openChatWindow(): Promise<void> {
  if (chatWin && !chatWin.isDestroyed()) { chatWin.focus(); return; }
  const s = getSettings();
  const { screen } = require("electron");
  const { workAreaSize } = screen.getPrimaryDisplay();
  const [catX, catY] = (petWin && !petWin.isDestroyed())
    ? petWin.getPosition()
    : [s.catX ?? 50, s.catY ?? 50];
  const W = 360, H = 460;
  // Prefer right of cat; fall back to left if it would clip off-screen.
  // Clamp the full rect into the work area on both axes so a stale/off-screen
  // catX (e.g. after DPI drift) can never put the box off-screen.
  const xRight = catX + PET_W + 8;
  const xCandidate = xRight + W <= workAreaSize.width ? xRight : catX - W - 8;
  const x = Math.min(Math.max(0, xCandidate), workAreaSize.width - W);
  const y = Math.min(Math.max(0, catY), workAreaSize.height - H);
  chatWin = new BrowserWindow({
    x, y, width: W, height: H,
    frame: false, transparent: false,
    alwaysOnTop: true, skipTaskbar: true, resizable: false,
    webPreferences: webPrefs(),
  });
  chatWin.setOpacity(s.opacity ?? 1.0);
  chatWin.on("closed", () => { chatWin = null; });
  if (isProd) {
    chatWin.loadURL("app://./chat.html");
  } else {
    chatWin.loadURL(`${DEV_URL}/chat`);
  }
}

export function closeChatWindow(): void {
  if (chatWin && !chatWin.isDestroyed()) chatWin.close();
}

export function setupTray() {
  // Toasty's head, generated by scripts/generate-icons.js. Fall back to a
  // solid orange square (the old placeholder) if the file is ever missing —
  // the tray must never fail to construct.
  let icon = nativeImage.createFromPath(resourcePath("tray.png"));
  if (icon.isEmpty()) {
    const size = 16;
    const buf = Buffer.alloc(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      buf[i * 4] = 240; buf[i * 4 + 1] = 184; buf[i * 4 + 2] = 83; buf[i * 4 + 3] = 255;
    }
    icon = nativeImage.createFromBuffer(buf, { width: size, height: size });
  }
  tray = new Tray(icon);
  tray.setToolTip("Toasty");
  updateTrayMenu();
}

/** Show the widget if it exists (restoring it from a hide/minimize), or
 *  create it fresh if it was never opened or got destroyed. */
function showOrCreateWidget(): void {
  if (widgetWin && !widgetWin.isDestroyed()) {
    if (widgetWin.isMinimized()) widgetWin.restore();
    widgetWin.show();
    widgetWin.focus();
  } else {
    createWidgetWindow();
  }
}

/** The cat is the only always-visible "Toasty" affordance once the widget is
 *  hidden (its ✕ hides to tray, same as the old dashboard) — clicking it
 *  should read as "bring Toasty back" in that case, not as "open settings".
 *  Once the widget is already up, a click is free to mean "open the menu". */
export function handleCatClicked(): void {
  const widgetUp = widgetWin && !widgetWin.isDestroyed() && widgetWin.isVisible() && !widgetWin.isMinimized();
  if (widgetUp) openMenuWindow();
  else showOrCreateWidget();
}

/** Shared by the tray's right-click menu and the cat's right-click menu —
 *  one definition of "how to reach every window, and how to quit" so there
 *  is always at least one visible way to do both. Rebuilt each time it's
 *  shown so "Start on Login"'s checkmark is never stale. */
function buildAppMenu(): Menu {
  const s = getSettings();
  return Menu.buildFromTemplate([
    { label: `Toasty v${app.getVersion()}`, enabled: false },
    { type: "separator" },
    { label: "Open Widget", click: () => showOrCreateWidget() },
    { label: "Open Menu", click: () => openMenuWindow() },
    { type: "separator" },
    {
      label: s.openAtLogin ? "✓ Start on Login" : "Start on Login",
      click: () => {
        const next = !s.openAtLogin;
        setSettings({ openAtLogin: next });
        app.setLoginItemSettings({ openAtLogin: next, name: "Toasty" });
        // Refreshes the tray's own (persistent) menu instance so its checkmark
        // isn't stale next time; a cat-menu popup is already rebuilt fresh.
        updateTrayMenu();
      },
    },
    { type: "separator" },
    { label: "Quit Toasty", click: () => app.quit() },
  ]);
}

function updateTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(buildAppMenu());
}

/** Right-click on the cat — the fallback path to Quit once the widget is
 *  hidden and the widget's own ✕ isn't reachable. The tray icon is the same
 *  menu, but a tray icon can end up collapsed into Windows' hidden-icons
 *  overflow, so the cat needs its own way there. */
export function showCatContextMenu(): void {
  const menu = buildAppMenu();
  if (petWin && !petWin.isDestroyed()) menu.popup({ window: petWin });
}

/** Every window that shows the cat sprite or needs to react to its state. */
function catStateTargets(): BrowserWindow[] {
  return [petWin, widgetWin].filter((w): w is BrowserWindow => !!w && !w.isDestroyed());
}

export function pushCatState(state: string) {
  for (const w of catStateTargets()) w.webContents.send("cat:state", state);
}

/** Widget shows the AI status pill; menu's AI section shows it too. Broadcast,
 *  not mainWin-only — mainWin doesn't exist any more, and the old single-target
 *  send silently went dead once it did (this is the Phase 3 push-channel hazard). */
export function pushOllamaStatus(status: "running" | "offline") {
  for (const w of [widgetWin, menuWin]) {
    if (w && !w.isDestroyed()) w.webContents.send("ollama:status", status);
  }
}

export function setPetSize(size: "dot" | "full") {
  const minimized = size === "dot";
  setSettings({ petMinimized: minimized });
  if (!petWin || petWin.isDestroyed()) return;
  const [w, h] = minimized ? [PET_DOT, PET_DOT] : fullDims();
  const [x, y] = petWin.getPosition();
  // A2: Release floor → raise ceiling → resize → re-pin, so min never exceeds max
  // (e.g. 34→340 restore: setMinimumSize(340,300) while max=(34,34) would be
  // undefined on Windows). Non-square full dims don't change this sequence.
  petWin.setMinimumSize(0, 0);
  petWin.setMaximumSize(w, h);
  petWin.setSize(w, h);
  petWin.setMinimumSize(w, h);
  petWin.setPosition(x, y);
}

// ── Widget window controls (called via IPC from its custom drag bar) ──
export function minimizeWidget() {
  if (widgetWin && !widgetWin.isDestroyed()) widgetWin.minimize();
}

export function hideWidget() {
  // "Close" hides to tray (consistent with tray-app lifecycle)
  if (widgetWin && !widgetWin.isDestroyed()) widgetWin.hide();
}

/** Applies to every window that renders real content — widget, menu, capture,
 *  chat. Not petWin: its transparent canvas has no background to dim, and
 *  dimming the cat itself was never the point of this slider. */
export function setWidgetOpacity(value: number) {
  const clamped = Math.min(1, Math.max(0.2, value));
  setSettings({ opacity: clamped });
  for (const w of [widgetWin, menuWin, captureWin, chatWin]) {
    if (w && !w.isDestroyed()) w.setOpacity(clamped);
  }
}

export function applyAutoLaunch() {
  const s = getSettings();
  app.setLoginItemSettings({ openAtLogin: s.openAtLogin, name: "Toasty" });
}

export function setSkipTaskbar(value: boolean) {
  setSettings({ skipTaskbar: value });
  if (widgetWin && !widgetWin.isDestroyed()) widgetWin.setSkipTaskbar(value);
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
  // Clamp on the CAT's own sub-region (PET_CAT=88), not the full PET_W×PET_H
  // canvas — the canvas is mostly invisible click-through space reserved for
  // the menu, so bounding on it would stop the cat ~PET_W/2 short of the
  // right/bottom edges and make it "teleport" inward on the first drag.
  // Keeping this on PET_CAT preserves corner-parking; the menu (if open) may
  // clip off-screen there — the documented v1 trade-off.
  const cx = Math.round(Math.min(Math.max(x, -PET_CAT / 2), workAreaSize.width - PET_CAT / 2));
  const cy = Math.round(Math.min(Math.max(y, 0), workAreaSize.height - PET_CAT / 2));
  setSettings({ catX: cx, catY: cy });
  // A3: Re-assert canonical size on every drag tick so DPI rounding never accumulates.
  if (petWin && !petWin.isDestroyed()) {
    const minimized = getSettings().petMinimized;
    const [w, h] = minimized ? [PET_DOT, PET_DOT] : fullDims();
    petWin.setBounds({ x: cx, y: cy, width: w, height: h });
  }
}

/** Fired after anything that changes the task list from outside the widget's
 *  own React state — currently just the menu's Data & Reset actions. Without
 *  this the widget shows stale tasks after a reset, and a leftover undo token
 *  could resurrect rows a reset just deleted on purpose. */
export function pushTasksChanged() {
  if (widgetWin && !widgetWin.isDestroyed()) widgetWin.webContents.send("tasks:changed");
}

export function pushReminder(tasks: any[]) {
  for (const w of catStateTargets()) w.webContents.send("toasty:reminder", tasks);
}

/** Menu's About/Updates section owns the update banner; widget shows a compact
 *  version of it too, so both need the push (widget was the mainWin-only miss). */
export function pushUpdateStatus(status: object) {
  for (const w of [widgetWin, menuWin]) {
    if (w && !w.isDestroyed()) w.webContents.send("update:status", status);
  }
}

export function setPetIgnoreMouse(ignore: boolean) {
  if (petWin && !petWin.isDestroyed())
    petWin.setIgnoreMouseEvents(ignore, { forward: true });
}

// ── Single-instance: focus everything a second launch should surface ──
export function focusExisting(): void {
  if (widgetWin && !widgetWin.isDestroyed()) {
    widgetWin.show();
    if (widgetWin.isMinimized()) widgetWin.restore();
    widgetWin.focus();
  }
  if (petWin && !petWin.isDestroyed()) {
    petWin.show();
    petWin.focus();
  }
}
