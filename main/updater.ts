// Auto-update module — electron-updater generic provider.
// On app launch: checks once; downloads automatically; prompts user to install.
// Local testing: create dev-app-update.yml pointing to http://localhost:8090
//   then run `npx serve dist/ -p 8090` after building a newer version.
import { autoUpdater } from "electron-updater";
import { app } from "electron";
import { pushUpdateStatus } from "./windows";

export type UpdateStatus =
  | { type: "checking" }
  | { type: "available"; version: string }
  | { type: "not-available" }
  | { type: "progress"; percent: number }
  | { type: "downloaded"; version: string }
  | { type: "error"; message: string };

export function initAutoUpdater(): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("checking-for-update", () => {
    pushUpdateStatus({ type: "checking" });
  });
  autoUpdater.on("update-available", (info: any) => {
    pushUpdateStatus({ type: "available", version: info.version });
  });
  autoUpdater.on("update-not-available", () => {
    pushUpdateStatus({ type: "not-available" });
  });
  autoUpdater.on("download-progress", (progress: any) => {
    pushUpdateStatus({ type: "progress", percent: Math.round(progress.percent) });
  });
  autoUpdater.on("update-downloaded", (info: any) => {
    pushUpdateStatus({ type: "downloaded", version: info.version });
  });
  autoUpdater.on("error", (err: Error) => {
    // Don't surface config errors (dev mode without dev-app-update.yml)
    const silent = err.message.includes("dev-app-update") || err.message.includes("ERR_CONNECTION_REFUSED");
    if (!silent) pushUpdateStatus({ type: "error", message: err.message });
  });
}

/** Check for updates once. Safe to call in both dev (reads dev-app-update.yml if present)
 *  and production (reads embedded app-update.yml). Errors are swallowed — update is optional. */
export function checkForUpdates(): void {
  autoUpdater.checkForUpdates().catch((err: Error) => {
    console.warn("[toasty updater] check failed:", err.message);
  });
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall(false, true);
}
