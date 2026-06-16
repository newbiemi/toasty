import * as fs from "fs";
import * as path from "path";
import { app } from "electron";

export interface ToastySettings {
  mode: "window" | "pet";
  catX: number;
  catY: number;
  petMinimized: boolean;
  quietHoursEnabled: boolean;
  quietFrom: number;
  quietTo: number;
  model: string;
}

const DEFAULTS: ToastySettings = {
  mode: "window",
  catX: 50,
  catY: 50,
  petMinimized: false,
  quietHoursEnabled: false,
  quietFrom: 22,
  quietTo: 6,
  model: "llama3.2:3b",
};

let _cache: ToastySettings | null = null;

function settingsPath(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

export function getSettings(): ToastySettings {
  if (!_cache) {
    try {
      const raw = fs.readFileSync(settingsPath(), "utf-8");
      _cache = { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {
      _cache = { ...DEFAULTS };
    }
  }
  return { ..._cache };
}

export function setSettings(patch: Partial<ToastySettings>): ToastySettings {
  _cache = { ...getSettings(), ...patch };
  try { fs.writeFileSync(settingsPath(), JSON.stringify(_cache, null, 2)); } catch {}
  return { ..._cache };
}
