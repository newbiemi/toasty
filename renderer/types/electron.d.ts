import type { Task } from "./task";

interface ToastySettings {
  mode: "window" | "pet";
  catX: number;
  catY: number;
  petMinimized: boolean;
  quietHoursEnabled: boolean;
  quietFrom: number;
  quietTo: number;
  model: string;
  opacity: number;
  openAtLogin: boolean;
  skipTaskbar: boolean;
}

interface ToastyAPI {
  // DB
  listTasks: () => Promise<Task[]>;
  saveTask: (task: Task) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  clearDone: () => Promise<void>;
  // AI
  parse: (text: string) => Promise<any[]>;
  adjust: (taskJSON: string, instruction: string) => Promise<any>;
  // Settings + Mode
  getSettings: () => Promise<ToastySettings>;
  setSettings: (patch: Partial<ToastySettings>) => Promise<ToastySettings>;
  toggleMode: () => Promise<void>;
  setPetSize: (size: "dot" | "full") => Promise<void>;
  // Window controls
  minimize: () => Promise<void>;
  closeWindow: () => Promise<void>;
  setOpacity: (value: number) => Promise<void>;
  // Capture
  openCapture: () => Promise<void>;
  closeCapture: () => Promise<void>;
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
  movePet: (x: number, y: number) => Promise<void>;
  // Reminders
  onReminder: (cb: (tasks: any[]) => void) => () => void;
}

declare global {
  interface Window {
    toasty: ToastyAPI;
  }
}

export {};
