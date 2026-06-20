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
  listModels: () => Promise<string[]>;
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
  // Chat
  openChat: () => Promise<void>;
  closeChat: () => Promise<void>;
  chat: (messages: Array<{ role: "user" | "assistant"; content: string }>) => Promise<{ reply: string; added: any[] }>;
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
}

declare global {
  interface Window {
    toasty: ToastyAPI;
  }
}

export {};
