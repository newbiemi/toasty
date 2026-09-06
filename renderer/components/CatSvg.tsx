import { useEffect, useRef, useState } from "react";
import { useSpriteData } from "../lib/spriteData";
import { buildMotionCss } from "../lib/motionCss";
import type { FaceExpression } from "../lib/toastyFaces";

/**
 * Toasty as an inline pixel-SVG. Every cell comes from a loaded sprite —
 * either the shared folder configured in Settings (edited in Loom, the
 * sprite-lab pixel editor) or, when that folder is unset/missing files, the
 * bundled cat data in lib/toastyCatGrid.ts / lib/toastyFaces.ts. See
 * lib/spriteData.ts for the load + fallback logic.
 *
 * The grid can be any cols x rows (Loom allows 4-128) — viewBox, the head
 * crop, and the shadow/transform-origin are all derived from the loaded
 * shape at build time, not hardcoded to the original 60x58 cat.
 *
 * Two variants:
 *  - "full"  — the whole cat (pet window). Expression overlays apply here only.
 *  - "head"  — the headBounds crop only (dot-mode icon). Always renders the
 *              default face — no expression or interaction.
 *
 * The tail is fused into the painted body outline — no independent tail rig
 * this revision.
 */

const svgNS = "http://www.w3.org/2000/svg";

// CSS transforms on SVG elements resolve `px` as user-space units of the
// coordinate system the element sits in, not real screen pixels. MOTION's
// params (bounce.px, jump.heightPx, the eye-tracking translate(2.4px,1.8px),
// etc.) were tuned assuming 1 cell = 10 of those units — a viewBox of
// `0 0 (cols*10) (rows*10)`, matching the original hand-authored 600x580 for
// the 60x58 cat. Rendering at 1 unit per cell instead (viewBox `0 0 cols
// rows`) makes every one of those pixel amounts move things 10x too far
// relative to the grid — e.g. a tracking-eye translate that should nudge the
// pupil a fraction of its socket instead throws it most of the way to the
// ears. Keep this scale so motion/eye-tracking numbers stay meaningful.
const CELL = 10;

type EyeBox = { xmin: number; xmax: number; ymin: number; ymax: number };
type HeadBounds = { xmin?: number; ymin?: number; xmax: number; ymax: number };

function rect(x: number, y: number, fill: string) {
  const r = document.createElementNS(svgNS, "rect");
  r.setAttribute("x", String(x * CELL));
  r.setAttribute("y", String(y * CELL));
  r.setAttribute("width", String(CELL));
  r.setAttribute("height", String(CELL));
  r.setAttribute("fill", fill);
  return r;
}

function inBox(x: number, y: number, b: EyeBox) {
  return b.xmin <= x && x <= b.xmax && b.ymin <= y && y <= b.ymax;
}

/** Open = the painted dark eye cells (cursor-trackable group).
 *  Closed = fur over the socket + a dark lid line at the eye's middle row. */
function buildEye(box: EyeBox, pupilClass: string, cells: Record<string, string>, dark: string, fur: string) {
  const wrap = document.createElementNS(svgNS, "g");
  const open = document.createElementNS(svgNS, "g");
  open.setAttribute("class", `eye-open ${pupilClass}`);
  Object.keys(cells).forEach((key) => {
    const [x, y] = key.split(",").map(Number);
    if (cells[key] === dark && inBox(x, y, box)) open.appendChild(rect(x, y, dark));
  });
  const closed = document.createElementNS(svgNS, "g");
  closed.setAttribute("class", "eye-closed");
  const midY = Math.round((box.ymin + box.ymax) / 2);
  for (let y = box.ymin; y <= box.ymax; y++) {
    for (let x = box.xmin; x <= box.xmax; x++) {
      if (y !== midY) closed.appendChild(rect(x, y, fur));
    }
  }
  for (let x = box.xmin; x <= box.xmax; x++) closed.appendChild(rect(x, midY, dark));
  wrap.appendChild(open);
  wrap.appendChild(closed);
  return wrap;
}

function isHeadCell(x: number, y: number, head: HeadBounds) {
  return x >= (head.xmin ?? 0) && x <= head.xmax && y >= (head.ymin ?? 0) && y <= head.ymax;
}

/** Build the static DOM structure once. Mutates `critterGroup`.
 *  Splits cells into a `torso` group (unaffected by expression) and a
 *  `face-default` group (head region + the blink/eye-track rig, when eye
 *  boxes are known), then — for the full variant only — adds one static
 *  `face-<name>` group per loaded variant. CSS toggles which face group is
 *  visible; only face-default ever gets the live eye rig. */
function buildCat(
  critterGroup: SVGGElement,
  variant: "full" | "head",
  cells: Record<string, string>,
  head: HeadBounds,
  eyeL: EyeBox | undefined,
  eyeR: EyeBox | undefined,
  dark: string,
  fur: string,
  variants: Record<string, Record<string, string>>
) {
  const torso = document.createElementNS(svgNS, "g");
  torso.setAttribute("class", "torso");
  const faceDefault = document.createElementNS(svgNS, "g");
  faceDefault.setAttribute("class", "face face-default");

  Object.keys(cells).forEach((key) => {
    const [x, y] = key.split(",").map(Number);
    if (variant === "head" && !isHeadCell(x, y, head)) return;
    const inHead = isHeadCell(x, y, head);
    // eye cells in the default face are painted by the eye rig below instead, when one exists
    const isEyeCell =
      inHead && cells[key] === dark && eyeL && eyeR && (inBox(x, y, eyeL) || inBox(x, y, eyeR));
    if (isEyeCell) return;
    (inHead ? faceDefault : torso).appendChild(rect(x, y, cells[key]));
  });
  if (eyeL && eyeR) {
    faceDefault.appendChild(buildEye(eyeL, "pupil-l", cells, dark, fur));
    faceDefault.appendChild(buildEye(eyeR, "pupil-r", cells, dark, fur));
  }

  critterGroup.appendChild(torso);
  critterGroup.appendChild(faceDefault);

  if (variant === "full") {
    Object.keys(variants).forEach((name) => {
      const g = document.createElementNS(svgNS, "g");
      g.setAttribute("class", `face face-${name}`);
      const vCells = variants[name];
      Object.keys(vCells).forEach((key) => {
        const [x, y] = key.split(",").map(Number);
        g.appendChild(rect(x, y, vCells[key]));
      });
      critterGroup.appendChild(g);
    });
  }
}

const STATE_GLYPH: Record<string, string | null> = {
  idle: null,
  thinking: "?",
  happy: "✦",
  alert: "!",
  sleep: "z z z",
};

interface CatSvgProps {
  state?: string;
  size?: number;
  variant?: "full" | "head";
  expression?: FaceExpression | null;
  interaction?: "petting" | "tapped" | "dragging" | null;
  onClick?: () => void;
}

export default function CatSvg({ state = "idle", size = 72, variant = "full", expression = null, interaction = null, onClick }: CatSvgProps) {
  const sprite = useSpriteData();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const critterRef = useRef<SVGGElement | null>(null);
  const pupilLRef = useRef<SVGGElement | null>(null);
  const pupilRRef = useRef<SVGGElement | null>(null);
  const [settling, setSettling] = useState(false);
  const prevInteractionRef = useRef<CatSvgProps["interaction"]>(null);

  // Settle is a visual echo of a drag ending — purely local choreography, not
  // something pet.tsx needs to time itself. Fires once when `interaction`
  // drops out of "dragging".
  useEffect(() => {
    if (prevInteractionRef.current === "dragging" && interaction !== "dragging") {
      setSettling(true);
      const t = setTimeout(() => setSettling(false), (sprite.motions.settle?.ms ?? 260) + 40);
      prevInteractionRef.current = interaction;
      return () => clearTimeout(t);
    }
    prevInteractionRef.current = interaction;
  }, [interaction, sprite.motions.settle]);

  // Build the static structure once per (variant, loaded sprite).
  useEffect(() => {
    const critter = critterRef.current;
    if (!critter) return;
    while (critter.firstChild) critter.removeChild(critter.firstChild);
    buildCat(critter, variant, sprite.cells, sprite.headBounds, sprite.eyeL, sprite.eyeR, sprite.dark, sprite.fur, sprite.variants);
    pupilLRef.current = critter.querySelector<SVGGElement>(".pupil-l");
    pupilRRef.current = critter.querySelector<SVGGElement>(".pupil-r");
  }, [variant, sprite]);

  // Blink scheduler + cursor-tracking pupils — only for the interactive full cat,
  // and not while asleep (eyes stay shut regardless).
  useEffect(() => {
    if (variant !== "full") return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || state === "sleep") return;

    let blinkTimer: ReturnType<typeof setTimeout> | null = null;
    function scheduleBlink() {
      const delay = 2600 + Math.random() * 3200;
      blinkTimer = setTimeout(() => {
        svgRef.current?.classList.add("blinking");
        blinkTimer = setTimeout(() => {
          svgRef.current?.classList.remove("blinking");
          scheduleBlink();
        }, 130);
      }, delay);
    }
    scheduleBlink();

    let rafPending = false;
    function updatePupils(clientX: number, clientY: number) {
      const box = svgRef.current?.getBoundingClientRect();
      if (!box) return;
      const dx = Math.max(-1, Math.min(1, (clientX - (box.left + box.width / 2)) / (box.width / 2)));
      const dy = Math.max(-1, Math.min(1, (clientY - (box.top + box.height / 2)) / (box.height / 2)));
      const t = `translate(${(dx * 2.4).toFixed(2)}px,${(dy * 1.8).toFixed(2)}px)`;
      if (pupilLRef.current) pupilLRef.current.style.transform = t;
      if (pupilRRef.current) pupilRRef.current.style.transform = t;
    }
    const onPointerMove = (e: PointerEvent) => {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => { updatePupils(e.clientX, e.clientY); rafPending = false; });
    };
    document.addEventListener("pointermove", onPointerMove);

    return () => {
      if (blinkTimer) clearTimeout(blinkTimer);
      document.removeEventListener("pointermove", onPointerMove);
    };
  }, [variant, state]);

  const headW = sprite.headBounds.xmax - (sprite.headBounds.xmin ?? 0) + 1;
  const headH = sprite.headBounds.ymax - (sprite.headBounds.ymin ?? 0) + 1;
  const fullViewBox = `0 0 ${sprite.cols * CELL} ${sprite.rows * CELL}`;
  const headViewBox = `${(sprite.headBounds.xmin ?? 0) * CELL} ${(sprite.headBounds.ymin ?? 0) * CELL} ${headW * CELL} ${headH * CELL}`;
  const aspect = variant === "head" ? headH / headW : sprite.rows / sprite.cols;

  const petting = variant === "full" && interaction === "petting";
  const glyph = variant === "full" ? (petting ? "♥" : STATE_GLYPH[state] ?? null) : null;
  const classes = [
    "toasty-cat",
    `state-${state}`,
    expression ? `expr-${expression}` : null,
    interaction ? `int-${interaction}` : null,
    settling ? "int-settling" : null,
  ].filter(Boolean).join(" ");

  return (
    <>
      {/* dangerouslySetInnerHTML, not children — <style> is a raw-text element the HTML
          parser never entity-decodes, so React's escaped SSR string (quotes -> &quot;)
          permanently mismatches the client's raw string on hydration otherwise. Same
          fix as _document.tsx's global CSS. */}
      <style dangerouslySetInnerHTML={{ __html: buildCatCss(sprite.motions, Object.keys(sprite.variants)) }} />
      <svg
        ref={svgRef}
        className={classes}
        width={size}
        height={Math.round(size * aspect)}
        viewBox={variant === "head" ? headViewBox : fullViewBox}
        onClick={onClick}
        style={{ cursor: onClick ? "pointer" : "default", userSelect: "none", overflow: "visible" }}
      >
        {variant === "full" && (
          <ellipse cx="47%" cy="99%" rx="40%" ry="1.4%" fill="#000" opacity="0.22" />
        )}
        <g ref={critterRef} className="critter" data-cat-hit="1" />
        {glyph && (
          <text
            x="72%"
            y="10%"
            className={`state-fx-text${petting ? " heart-pulse" : ""}`}
            textAnchor="middle"
            // Absolute unit, not %: SVG resolves text-relative % font-sizes
            // inconsistently. Scaled to the viewBox width so it stays
            // proportionate to the sprite, at the original cat's 46-over-600 ratio.
            style={{ fontSize: sprite.cols * CELL * (46 / 600) }}
          >
            {glyph}
          </text>
        )}
      </svg>
    </>
  );
}

function buildCatCss(motions: Record<string, Record<string, number>>, variantNames: string[]): string {
  const exprRules = variantNames
    .map(
      (name) => `
.toasty-cat.expr-${name} .face-default { display: none; }
.toasty-cat.expr-${name} .face-${name} { display: block; }`
    )
    .join("");
  const exprDefaults = variantNames.map((name) => `.toasty-cat .face-${name}`).join(", ");

  return `
.toasty-cat {
  shape-rendering: crispEdges;
}

.toasty-cat .critter { transform-box: view-box; transform-origin: 50% 98%; }
${buildMotionCss(motions)}

.toasty-cat .eye-open { display: block; }
.toasty-cat .eye-closed { display: none; }
.toasty-cat.blinking .eye-open { display: none; }
.toasty-cat.blinking .eye-closed { display: block; }
.toasty-cat.state-sleep .eye-open { display: none; }
.toasty-cat.state-sleep .eye-closed { display: block; }

/* Expression overlays — face-default is the live blink/eye-track rig and
   shows unless an expr-* class picks a static painted face instead. Rules
   are generated per loaded variant name, not a fixed list of four. */
.toasty-cat .face-default { display: block; }
${exprDefaults ? `${exprDefaults} { display: none; }` : ""}
${exprRules}

.toasty-cat .pupil-l, .toasty-cat .pupil-r { transform-box: fill-box; transform-origin: center; transition: transform 0.14s ease-out; }
.toasty-cat.state-sleep .pupil-l, .toasty-cat.state-sleep .pupil-r { transition: none; }

.toasty-cat .state-fx-text { font-family: "Cascadia Code", Consolas, ui-monospace, monospace; fill: #1f1a17; opacity: 0.85; transform-box: fill-box; transform-origin: center; }
.toasty-cat .state-fx-text.heart-pulse { animation: t-heart-pulse 600ms ease-in-out infinite; fill: #c4828a; }
@keyframes t-heart-pulse { 0%, 100% { opacity: 0.6; transform: translateY(0px) scale(1); } 50% { opacity: 1; transform: translateY(-6px) scale(1.15); } }

@media (prefers-reduced-motion: reduce) {
  .toasty-cat .critter { animation: none !important; transform: none !important; }
  .toasty-cat .pupil-l, .toasty-cat .pupil-r { transition: none !important; }
  .toasty-cat .state-fx-text.heart-pulse { animation: none !important; }
}
`;
}
