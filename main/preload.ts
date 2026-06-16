import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("toasty", {
  listTasks: () => ipcRenderer.invoke("db:list"),
  saveTask: (task: any) => ipcRenderer.invoke("db:save", task),
  deleteTask: (id: string) => ipcRenderer.invoke("db:delete", id),
  clearDone: () => ipcRenderer.invoke("db:clearDone"),
  parse: (text: string) => ipcRenderer.invoke("ai:parse", text),
  adjust: (taskJSON: string, instruction: string) =>
    ipcRenderer.invoke("ai:adjust", taskJSON, instruction),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (patch: any) => ipcRenderer.invoke("settings:set", patch),
  toggleMode: () => ipcRenderer.invoke("window:toggleMode"),
  setPetSize: (size: "dot" | "full") => ipcRenderer.invoke("pet:setSize", size),
  onCatState: (cb: (state: string) => void) => {
    const handler = (_e: any, state: string) => cb(state);
    ipcRenderer.on("cat:state", handler);
    return () => ipcRenderer.removeListener("cat:state", handler);
  },
});
