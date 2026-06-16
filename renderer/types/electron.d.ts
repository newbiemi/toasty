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
}

interface ToastyAPI {
  listTasks: () => Promise<Task[]>;
  saveTask: (task: Task) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  clearDone: () => Promise<void>;
  parse: (text: string) => Promise<any[]>;
  adjust: (taskJSON: string, instruction: string) => Promise<any>;
  getSettings: () => Promise<ToastySettings>;
  setSettings: (patch: Partial<ToastySettings>) => Promise<ToastySettings>;
  toggleMode: () => Promise<void>;
  setPetSize: (size: "dot" | "full") => Promise<void>;
  onCatState: (cb: (state: string) => void) => () => void;
}

declare global {
  interface Window {
    toasty: ToastyAPI;
  }
}

export {};
