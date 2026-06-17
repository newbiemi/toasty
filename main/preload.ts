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
  movePet: (x: number, y: number) => ipcRenderer.invoke("window:movePet", x, y),

  // ── Reminders ──
  onReminder: (cb: (tasks: any[]) => void) => {
    const handler = (_e: any, tasks: any[]) => cb(tasks);
    ipcRenderer.on("toasty:reminder", handler);
    return () => ipcRenderer.removeListener("toasty:reminder", handler);
  },
});
