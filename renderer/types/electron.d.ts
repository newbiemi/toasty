import type { Task } from "./task";

interface ToastyAPI {
  listTasks: () => Promise<Task[]>;
  saveTask: (task: Task) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  clearDone: () => Promise<void>;
  parse: (text: string) => Promise<any[]>;
  adjust: (taskJSON: string, instruction: string) => Promise<any>;
}

declare global {
  interface Window {
    toasty: ToastyAPI;
  }
}

export {};
