import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("toasty", {
  listTasks: () => ipcRenderer.invoke("db:list"),
  saveTask: (task: any) => ipcRenderer.invoke("db:save", task),
  deleteTask: (id: string) => ipcRenderer.invoke("db:delete", id),
  clearDone: () => ipcRenderer.invoke("db:clearDone"),
  parse: (text: string) => ipcRenderer.invoke("ai:parse", text),
  adjust: (taskJSON: string, instruction: string) =>
    ipcRenderer.invoke("ai:adjust", taskJSON, instruction),
});
