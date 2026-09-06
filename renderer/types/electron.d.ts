import type { Task } from "./task";

interface ToastySettings {
  catX: number;
  catY: number;
  widgetX: number;
  widgetY: number;
  petMinimized: boolean;
  quietHoursEnabled: boolean;
  quietFrom: number;
  quietTo: number;
  model: string;
  opacity: number;
  openAtLogin: boolean;
  skipTaskbar: boolean;
  groqApiKey: string;
  geminiApiKey: string;
  aiProvider: "groq" | "ollama";
  spriteFolder: string;
}

// Raw shapes the shared folder can carry — see main/spriteFolder.ts and
// lib/spriteData.ts (which merges this onto the bundled cat defaults).
interface LoadedSpriteFiles {
  folder: string;
  grid: { cols: number; rows: number; cells: Record<string, string> } | null;
  faces: { cols: number; rows: number; variants: Record<string, Record<string, string>>; rig?: unknown } | null;
  motion: Record<string, unknown> | null;
}

// Mirrors main/adjust.ts's Resolution/Confidence shapes, serialized over IPC —
// only what the renderer needs to render the diff preview, never the engine
// objects themselves (those stay in main, see background.ts's pendingResolutions).
interface AdjustPreview {
  /** One plain-language line per change that WOULD happen, exact vs. count
   *  never applied to. Empty when every resolution was ambiguous/none. */
  summary: string[];
  /** One line per resolution that needs the user to disambiguate — never guessed at. */
  questions: string[];
  /** False when nothing in this preview can actually be applied (every
   *  resolution was ambiguous or found nothing) — disable Apply, not no-op it. */
  canApply: boolean;
}

interface AdjustApplyResult {
  changed: number;
  created: string[];
  summary: string[];
}

interface AdjustUndoResult {
  restored: number;
  removed: number;
}

interface ToastyAPI {
  // DB
  listTasks: () => Promise<Task[]>;
  saveTask: (task: Task) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  clearDone: () => Promise<void>;
  // AI — single-task parse/adjust (task capture, and the per-task edit modal)
  parse: (text: string) => Promise<any[]>;
  adjust: (taskJSON: string, instruction: string) => Promise<any>;
  listModels: () => Promise<string[]>;
  // AI — selector-based adjust engine (main/adjust.ts), for the widget's diff
  // preview. Both the resolutions and the undo token live in main; these calls
  // never carry engine objects across the IPC boundary.
  previewAdjust: (instruction: string) => Promise<AdjustPreview>;
  applyAdjust: () => Promise<AdjustApplyResult>;
  undoAdjust: () => Promise<AdjustUndoResult>;
  // Settings + Mode
  getSettings: () => Promise<ToastySettings>;
  setSettings: (patch: Partial<ToastySettings>) => Promise<ToastySettings>;
  setPetSize: (size: "dot" | "full") => Promise<void>;
  // Sprite data (shared folder from Loom, Phase 5)
  loadSpriteData: () => Promise<LoadedSpriteFiles>;
  chooseSpriteFolder: () => Promise<string | null>;
  // Widget window controls
  minimize: () => Promise<void>;
  closeWindow: () => Promise<void>;
  setOpacity: (value: number) => Promise<void>;
  // Capture
  openCapture: () => Promise<void>;
  closeCapture: () => Promise<void>;
  // Chat
  openChat: () => Promise<void>;
  closeChat: () => Promise<void>;
  chat: (messages: Array<{ role: "user" | "assistant"; content: string }>) => Promise<{ reply: string; added: any[] }>;
  // Menu window
  openMenu: () => Promise<void>;
  closeMenu: () => Promise<void>;
  // Cat click — main decides: restore the widget if hidden, else open the menu
  catClicked: () => Promise<void>;
  // Cat right-click — Open Widget/Menu/Quit, in case the tray icon is hidden
  catRightClicked: () => Promise<void>;
  // Auto-launch
  setAutoLaunch: (enabled: boolean) => Promise<boolean>;
  // Skip taskbar
  setSkipTaskbar: (value: boolean) => Promise<void>;
  // Cat state
  onCatState: (cb: (state: string) => void) => () => void;
  // Ollama status
  onOllamaStatus: (cb: (status: "running" | "offline") => void) => () => void;
  checkOllama: () => Promise<"running" | "offline">;
  // Pet drag
  getPetPosition: () => Promise<{ x: number; y: number }>;
  movePet: (x: number, y: number) => Promise<void>;
  setPetIgnore: (ignore: boolean) => Promise<void>;
  // Reminders
  onReminder: (cb: (tasks: any[]) => void) => () => void;
  // App version
  getVersion: () => Promise<string>;
  // Auto-update
  onUpdateStatus: (cb: (status: any) => void) => () => void;
  installUpdate: () => Promise<void>;
  // Reset — UI lives in the menu window's Data & Reset section
  resetSettings: () => Promise<{ backup: string | null }>;
  resetTasks: () => Promise<{ backup: string | null }>;
  resetAll: () => Promise<{ backups: (string | null)[] }>;
  // Fired when the task list changed out from under the widget (a reset, so far)
  onTasksChanged: (cb: () => void) => () => void;
}

declare global {
  interface Window {
    toasty: ToastyAPI;
  }
}

export {};
