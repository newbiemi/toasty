import * as fs from "fs";
import * as path from "path";
import { dialog } from "electron";
import { getSettings } from "./settings";

// Fixed filenames inside the configured shared folder — the same names
// Loom's grid/variants/motion export buttons produce (a slugged project
// name), so Fahmi renames the downloaded file to match on the way in.
const FILES = {
  grid: "toasty-cat-grid.json",
  faces: "toasty-faces-grid.json",
  motion: "toasty-motion.json",
} as const;

function readJsonSafe(filePath: string): any | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

export interface LoadedSpriteFiles {
  folder: string;
  grid: { cols: number; rows: number; cells: Record<string, string> } | null;
  faces: { cols: number; rows: number; variants: Record<string, Record<string, string>>; rig?: unknown } | null;
  motion: Record<string, unknown> | null;
}

/** Reads the three sprite JSON files from the configured shared folder.
 *  Missing folder or missing/invalid individual files just come back null —
 *  the renderer (lib/spriteData.ts) falls back to the bundled cat per file,
 *  not all-or-nothing. */
export function loadSpriteFiles(): LoadedSpriteFiles {
  const folder = getSettings().spriteFolder?.trim() || "";
  if (!folder) return { folder: "", grid: null, faces: null, motion: null };
  return {
    folder,
    grid: readJsonSafe(path.join(folder, FILES.grid)),
    faces: readJsonSafe(path.join(folder, FILES.faces)),
    motion: readJsonSafe(path.join(folder, FILES.motion)),
  };
}

export async function chooseSpriteFolder(): Promise<string | null> {
  const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
}
