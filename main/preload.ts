import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("toasty", {
  // ── DB ──
  listTasks: () => ipcRenderer.invoke("db:list"),
  saveTask: (task: any) => ipcRenderer.invoke("db:save", task),
  deleteTask: (id: string) => ipcRenderer.invoke("db:delete", id),
  clearDone: () => ipcRenderer.invoke("db:clearDone"),

  // ── AI ──
  parse: (text: string) => ipcRenderer.invoke("ai:parse", text),
  adjust: (taskJSON: string, instruction: string) =>
    ipcRenderer.invoke("ai:adjust", taskJSON, instruction),
  listModels: () => ipcRenderer.invoke("ai:models"),

  // ── Settings + Mode ──
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (patch: any) => ipcRenderer.invoke("settings:set", patch),
  toggleMode: () => ipcRenderer.invoke("window:toggleMode"),
  setPetSize: (size: "dot" | "full") => ipcRenderer.invoke("pet:setSize", size),

  // ── Window controls (custom drag bar) ──
  minimize: () => ipcRenderer.invoke("window:minimize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  setOpacity: (value: number) => ipcRenderer.invoke("window:setOpacity", value),

  // ── Capture window ──
  openCapture: () => ipcRenderer.invoke("window:openCapture"),
  closeCapture: () => ipcRenderer.invoke("window:closeCapture"),

  // ── Chat window ──
  openChat: () => ipcRenderer.invoke("window:openChat"),
  closeChat: () => ipcRenderer.invoke("window:closeChat"),
  chat: (messages: any[]) => ipcRenderer.invoke("ai:chat", messages),

  // ── Auto-launch ──
  setAutoLaunch: (enabled: boolean) => ipcRenderer.invoke("window:setAutoLaunch", enabled),

  // ── Skip taskbar ──
  setSkipTaskbar: (value: boolean) => ipcRenderer.invoke("window:setSkipTaskbar", value),

  // ── Cat state subscription ──
  onCatState: (cb: (state: string) => void) => {
    const handler = (_e: any, state: string) => cb(state);
    ipcRenderer.on("cat:state", handler);
    return () => ipcRenderer.removeListener("cat:state", handler);
  },

  // ── Ollama status subscription ──
  onOllamaStatus: (cb: (status: "running" | "offline") => void) => {
    const handler = (_e: any, status: "running" | "offline") => cb(status);
    ipcRenderer.on("ollama:status", handler);
    return () => ipcRenderer.removeListener("ollama:status", handler);
  },
  checkOllama: () => ipcRenderer.invoke("ollama:check"),

  // ── Pet drag ──
  getPetPosition: () => ipcRenderer.invoke("window:getPetPosition"),
  movePet: (x: number, y: number) => ipcRenderer.invoke("window:movePet", x, y),
  setPetIgnore: (ignore: boolean) => ipcRenderer.invoke("window:setPetIgnore", ignore),

  // ── Reminders ──
  onReminder: (cb: (tasks: any[]) => void) => {
    const handler = (_e: any, tasks: any[]) => cb(tasks);
    ipcRenderer.on("toasty:reminder", handler);
    return () => ipcRenderer.removeListener("toasty:reminder", handler);
  },

  // ── App version ──
  getVersion: () => ipcRenderer.invoke("app:version"),

  // ── Auto-update ──
  onUpdateStatus: (cb: (status: any) => void) => {
    const handler = (_e: any, status: any) => cb(status);
    ipcRenderer.on("update:status", handler);
    return () => ipcRenderer.removeListener("update:status", handler);
  },
  installUpdate: () => ipcRenderer.invoke("app:installUpdate"),

  // ── Reset (temporary trigger only — real UI lands in the Phase 3 menu) ──
  resetSettings: () => ipcRenderer.invoke("app:resetSettings"),
  resetTasks: () => ipcRenderer.invoke("app:resetTasks"),
  resetAll: () => ipcRenderer.invoke("app:resetAll"),
});
