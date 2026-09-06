import { useEffect, useReducer } from "react";
import { CAT_COLS, CAT_ROWS, CAT_CELLS, EYE_L_BOX, EYE_R_BOX, DARK, FUR } from "./toastyCatGrid";
import { FACE_HEAD_BOUNDS, FACE_VARIANTS } from "./toastyFaces";

export type CellMap = Record<string, string>;
export type MotionParams = Record<string, number>;
export interface EyeBox { xmin: number; xmax: number; ymin: number; ymax: number }
export interface HeadBounds { xmin?: number; ymin?: number; xmax: number; ymax: number }

export interface SpriteData {
  cols: number;
  rows: number;
  cells: CellMap;
  /** Undefined when the loaded sprite carries no eye-rig metadata — CatSvg
   *  then skips the live blink/eye-track group for that head region entirely
   *  rather than guessing coordinates that don't apply to this shape. */
  eyeL?: EyeBox;
  eyeR?: EyeBox;
  dark: string;
  fur: string;
  headBounds: HeadBounds;
  variants: Record<string, CellMap>;
  motions: Record<string, MotionParams>;
  /** "bundled" = today's generated .ts modules (no shared folder configured,
   *  or its files are missing/invalid). "shared-folder" = at least one file
   *  loaded from the folder in Settings. */
  source: "bundled" | "shared-folder";
}

// Same values CatSvg used to hand-keep — now the fallback, not the source of
// truth, once a shared folder is configured (see main/spriteFolder.ts and
// Settings > Look > Sprite folder).
const BUNDLED_MOTION: Record<string, MotionParams> = {
  breathe: { periodMs: 1600, scaleY: 1.018 },
  bounce: { periodMs: 600, px: 10 },
  jump: { heightPx: 40, periodMs: 470, repeats: 2, squashLand: 0.91 },
  squash: { scaleX: 1.06, scaleY: 0.92, ms: 180 },
  purr: { amp: 2.8, periodMs: 320 },
  scrunch: { scale: 0.94, rotateDeg: -3 },
  settle: { ms: 260, overshoot: 1.03 },
  petting: { flipsToTrigger: 4, windowMs: 1000, holdMs: 900 },
};

function bundledDefaults(): SpriteData {
  return {
    cols: CAT_COLS,
    rows: CAT_ROWS,
    cells: CAT_CELLS,
    eyeL: EYE_L_BOX,
    eyeR: EYE_R_BOX,
    dark: DARK,
    fur: FUR,
    headBounds: FACE_HEAD_BOUNDS,
    variants: FACE_VARIANTS,
    motions: BUNDLED_MOTION,
    source: "bundled",
  };
}

function isEyeBox(v: unknown): v is EyeBox {
  const b = v as EyeBox;
  return !!b && ["xmin", "xmax", "ymin", "ymax"].every((k) => typeof (b as any)[k] === "number");
}

/** Merges a shared-folder load result onto the bundled fallback. Each
 *  category (grid, rig, motion) falls back independently — a folder with
 *  only a motion.json still gets the bundled grid, and vice versa. */
function mergeLoaded(loaded: {
  grid: { cols: number; rows: number; cells: CellMap } | null;
  faces: { cols: number; rows: number; variants: Record<string, CellMap>; rig?: any } | null;
  motion: Record<string, unknown> | null;
}): SpriteData {
  const bundled = bundledDefaults();
  const anyLoaded = !!(loaded.grid || loaded.faces || loaded.motion);
  if (!anyLoaded) return bundled;

  const grid =
    loaded.grid && loaded.grid.cols > 0 && loaded.grid.rows > 0 && loaded.grid.cells
      ? loaded.grid
      : { cols: bundled.cols, rows: bundled.rows, cells: bundled.cells };

  // The bundled eye boxes / head crop are coordinates into the *bundled*
  // 60x58 grid — only safe to reuse as a fallback when the loaded grid is
  // that same shape (e.g. a colors-only edit with no rig data exported yet).
  // A genuinely different-shaped grid with no rig gets no eye rig at all
  // rather than boxes pointing at the wrong cells.
  const shapeMatchesBundled = grid.cols === bundled.cols && grid.rows === bundled.rows;

  const rig = loaded.faces?.rig;
  const eyeL = isEyeBox(rig?.eyeL) ? rig.eyeL : shapeMatchesBundled ? bundled.eyeL : undefined;
  const eyeR = isEyeBox(rig?.eyeR) ? rig.eyeR : shapeMatchesBundled ? bundled.eyeR : undefined;
  const dark = typeof rig?.dark === "string" ? rig.dark : bundled.dark;
  const fur = typeof rig?.fur === "string" ? rig.fur : bundled.fur;
  const headBounds =
    rig?.headBounds && typeof rig.headBounds.xmax === "number" && typeof rig.headBounds.ymax === "number"
      ? rig.headBounds
      : shapeMatchesBundled
        ? bundled.headBounds
        : { xmin: 0, ymin: 0, xmax: grid.cols - 1, ymax: grid.rows - 1 }; // no rig, unknown shape: "head" = whole sprite
  const variants = loaded.faces?.variants ?? bundled.variants;

  const motion = loaded.motion;
  const motions =
    motion && typeof motion === "object"
      ? (Object.fromEntries(Object.entries(motion).filter(([k]) => k !== "version")) as Record<string, MotionParams>)
      : bundled.motions;

  return { ...grid, eyeL, eyeR, dark, fur, headBounds, variants, motions, source: "shared-folder" };
}

let cache: SpriteData = bundledDefaults();
let loadState: "idle" | "loading" | "done" = "idle";
let inflight: Promise<SpriteData> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

/** Kicks off the shared-folder load (once) and resolves with the merged
 *  result. Safe to call from anywhere — event handlers included, not just
 *  components — since the result also lands in the module-level `cache`
 *  that `getSpriteData()`/`getMotion()` read synchronously. */
export function ensureSpriteDataLoaded(): Promise<SpriteData> {
  if (loadState === "done") return Promise.resolve(cache);
  if (!inflight) {
    loadState = "loading";
    inflight = (window.toasty?.loadSpriteData?.() ?? Promise.resolve(null))
      .then((loaded) => (loaded ? mergeLoaded(loaded) : bundledDefaults()))
      .catch(() => bundledDefaults())
      .then((data) => {
        cache = data;
        loadState = "done";
        notify();
        return cache;
      });
  }
  return inflight;
}

/** Synchronous read of whatever is loaded so far (bundled defaults until the
 *  shared-folder load resolves). Used by code outside React render, e.g.
 *  pet.tsx's raw-DOM pointer handlers, which read fresh values on every call
 *  rather than capturing a stale closure. */
export function getSpriteData(): SpriteData {
  return cache;
}

export function getMotion(): Record<string, MotionParams> {
  return cache.motions;
}

/** React binding: re-renders once the shared-folder load resolves (or on any
 *  later reload — there is none yet; restart is how a folder change takes
 *  effect, per this phase's gate). */
export function useSpriteData(): SpriteData {
  const [, force] = useReducer((c: number) => c + 1, 0);
  useEffect(() => {
    ensureSpriteDataLoaded().then(() => force());
    listeners.add(force);
    return () => {
      listeners.delete(force);
    };
  }, []);
  return getSpriteData();
}
