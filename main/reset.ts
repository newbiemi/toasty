import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import { settingsFilePath, resetSettingsPreservingKey, resetSettingsFull } from "./settings";
import { dbFilePath, clearTasks, closeDB } from "./db";

function backupsDir(): string {
  const dir = path.join(app.getPath("userData"), "backups");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/** Copies srcPath into userData/backups/ with a restrictive mode (backups can hold the plaintext Groq key). */
function backupFile(srcPath: string, label: string): string | null {
  if (!fs.existsSync(srcPath)) return null;
  const dest = path.join(backupsDir(), `${label}-${timestamp()}${path.extname(srcPath)}`);
  fs.copyFileSync(srcPath, dest);
  try { fs.chmodSync(dest, 0o600); } catch {}
  return dest;
}

export function resetSettings(): { backup: string | null } {
  const backup = backupFile(settingsFilePath(), "settings");
  resetSettingsPreservingKey();
  return { backup };
}

export function resetTasks(): { backup: string | null } {
  const backup = backupFile(dbFilePath(), "tasks");
  clearTasks();
  return { backup };
}

export function resetAll(): { backups: (string | null)[] } {
  const settingsBackup = backupFile(settingsFilePath(), "settings");
  const dbBackup = backupFile(dbFilePath(), "tasks");
  closeDB();
  for (const suffix of ["", "-wal", "-shm"]) {
    try { fs.unlinkSync(dbFilePath() + suffix); } catch {}
  }
  resetSettingsFull();
  return { backups: [settingsBackup, dbBackup] };
}
