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
  opacity: number;        // 0.3–1.0, default 1.0
  openAtLogin: boolean;   // launch on OS startup
  skipTaskbar: boolean;   // hide from Windows taskbar
}

const DEFAULTS: ToastySettings = {
  mode: "window",
  catX: 50,
  catY: 50,
  petMinimized: false,
  quietHoursEnabled: false,
  quietFrom: 22,
  quietTo: 6,
  model: "llama3.2:1b",
  opacity: 1.0,
  openAtLogin: false,
  skipTaskbar: false,
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
    // Phase 9 one-time migration: 3b was the old default (never a deliberate
    // user choice); quietly downgrade to 1b so the resource-safety change
    // actually takes effect for existing installs.
    if (_cache.model === "llama3.2:3b") {
      _cache.model = "llama3.2:1b";
      try { fs.writeFileSync(settingsPath(), JSON.stringify(_cache, null, 2)); } catch {}
    }
  }
  return { ..._cache };
}

export function setSettings(patch: Partial<ToastySettings>): ToastySettings {
  _cache = { ...getSettings(), ...patch };
  try { fs.writeFileSync(settingsPath(), JSON.stringify(_cache, null, 2)); } catch {}
  return { ..._cache };
}
