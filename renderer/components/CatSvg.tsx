import { useEffect, useRef } from "react";
import { CAT_CELLS, EYE_L_BOX, EYE_R_BOX, DARK, FUR } from "../lib/toastyCatGrid";

/**
 * Toasty as an inline pixel-SVG — Phase 12: the character is no longer a
 * generated silhouette. Every cell comes from Fahmi's hand-painted grid
 * (cat-lab/toasty-cat-grid.json, painted in the A1/A2 pixel-editor artifacts,
 * approved as REV.07). This component just renders that data and re-attaches
 * the motion rig: breathe, scheduled blink, cursor-tracking eyes.
 *
 * Two variants:
 *  - "full"  — the whole cat (pet window).
 *  - "head"  — rows <= HEAD_MAX_ROW only (dot-mode icon; scripts/generate-icons.js
 *              reads the same JSON — regenerate icons if the grid changes).
 *
 * The tail is fused into the painted body outline — no independent tail rig
 * this revision (revisit in the interactive-motion pass).
 */

const svgNS = "http://www.w3.org/2000/svg";
const CELL = 10;
// rows 2-22 AND cols <= 34 are the head — the tail tip also rises into rows
// 18-22 further right, so the head crop needs both bounds (mirrored in
// scripts/generate-icons.js).
const HEAD_MAX_ROW = 22;
const HEAD_MAX_COL = 34;

const FULL_VIEWBOX = "0 0 600 580";
const FULL_ASPECT = 580 / 600;
const HEAD_VIEWBOX = "15 15 330 220";
const HEAD_ASPECT = 220 / 330;

type EyeBox = { xmin: number; xmax: number; ymin: number; ymax: number };

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
function buildEye(box: EyeBox, pupilClass: string) {
  const wrap = document.createElementNS(svgNS, "g");
  const open = document.createElementNS(svgNS, "g");
  open.setAttribute("class", `eye-open ${pupilClass}`);
  Object.keys(CAT_CELLS).forEach((key) => {
    const [x, y] = key.split(",").map(Number);
    if (CAT_CELLS[key] === DARK && inBox(x, y, box)) open.appendChild(rect(x, y, DARK));
  });
  const closed = document.createElementNS(svgNS, "g");
  closed.setAttribute("class", "eye-closed");
  const midY = Math.round((box.ymin + box.ymax) / 2);
  for (let y = box.ymin; y <= box.ymax; y++) {
    for (let x = box.xmin; x <= box.xmax; x++) {
      if (y !== midY) closed.appendChild(rect(x, y, FUR));
    }
  }
  for (let x = box.xmin; x <= box.xmax; x++) closed.appendChild(rect(x, midY, DARK));
  wrap.appendChild(open);
  wrap.appendChild(closed);
  return wrap;
}

/** Build the static DOM structure once. Mutates `critterGroup`. */
function buildCat(critterGroup: SVGGElement, variant: "full" | "head") {
  Object.keys(CAT_CELLS).forEach((key) => {
    const [x, y] = key.split(",").map(Number);
    if (variant === "head" && (y > HEAD_MAX_ROW || x > HEAD_MAX_COL)) return;
    // eye cells are painted by the eye rig groups below, not the body pass
    if (CAT_CELLS[key] === DARK && (inBox(x, y, EYE_L_BOX) || inBox(x, y, EYE_R_BOX))) return;
    critterGroup.appendChild(rect(x, y, CAT_CELLS[key]));
  });
  critterGroup.appendChild(buildEye(EYE_L_BOX, "pupil-l"));
  critterGroup.appendChild(buildEye(EYE_R_BOX, "pupil-r"));
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
  onClick?: () => void;
}

export default function CatSvg({ state = "idle", size = 72, variant = "full", onClick }: CatSvgProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const critterRef = useRef<SVGGElement | null>(null);
  const pupilLRef = useRef<SVGGElement | null>(null);
  const pupilRRef = useRef<SVGGElement | null>(null);

  // Build the static structure once.
  useEffect(() => {
    const critter = critterRef.current;
    if (!critter) return;
    buildCat(critter, variant);
    pupilLRef.current = critter.querySelector<SVGGElement>(".pupil-l");
    pupilRRef.current = critter.querySelector<SVGGElement>(".pupil-r");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);

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

  const aspect = variant === "head" ? HEAD_ASPECT : FULL_ASPECT;
  const glyph = variant === "full" ? STATE_GLYPH[state] ?? null : null;

  return (
    <>
      {/* dangerouslySetInnerHTML, not children — <style> is a raw-text element the HTML
          parser never entity-decodes, so React's escaped SSR string (quotes -> &quot;)
          permanently mismatches the client's raw string on hydration otherwise. Same
          fix as _document.tsx's global CSS. */}
      <style dangerouslySetInnerHTML={{ __html: CAT_CSS }} />
      <svg
        ref={svgRef}
        className={`toasty-cat state-${state}`}
        width={size}
        height={Math.round(size * aspect)}
        viewBox={variant === "head" ? HEAD_VIEWBOX : FULL_VIEWBOX}
        onClick={onClick}
        style={{ cursor: onClick ? "pointer" : "default", userSelect: "none", overflow: "visible" }}
      >
        {variant === "full" && (
          <ellipse cx="280" cy="574" rx="240" ry="8" fill="#000" opacity="0.22" />
        )}
        <g ref={critterRef} className="critter" data-cat-hit="1" />
        {glyph && (
          <text x="430" y="60" className="state-fx-text" textAnchor="middle">{glyph}</text>
        )}
      </svg>
    </>
  );
}

const CAT_CSS = `
.toasty-cat {
  shape-rendering: crispEdges;
}

.toasty-cat .critter { transform-box: view-box; transform-origin: 300px 570px; animation: t-breathe 4s ease-in-out infinite; }
.toasty-cat.state-thinking .critter { animation: t-breathe-slow 6s ease-in-out infinite; }
.toasty-cat.state-sleep .critter { animation: t-breathe-slow 7s ease-in-out infinite; }
.toasty-cat.state-happy .critter { animation: t-bounce 0.6s ease-in-out infinite; }
.toasty-cat.state-alert .critter { animation: t-shake 0.4s ease-in-out infinite; }

@keyframes t-breathe { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(1.018); } }
@keyframes t-breathe-slow { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(1.009); } }
@keyframes t-bounce { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-10px); } }
@keyframes t-shake { 0%, 100% { transform: translateX(0px); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }

.toasty-cat .eye-open { display: block; }
.toasty-cat .eye-closed { display: none; }
.toasty-cat.blinking .eye-open { display: none; }
.toasty-cat.blinking .eye-closed { display: block; }
.toasty-cat.state-sleep .eye-open { display: none; }
.toasty-cat.state-sleep .eye-closed { display: block; }

.toasty-cat .pupil-l, .toasty-cat .pupil-r { transform-box: fill-box; transform-origin: center; transition: transform 0.14s ease-out; }
.toasty-cat.state-sleep .pupil-l, .toasty-cat.state-sleep .pupil-r { transition: none; }

.toasty-cat .state-fx-text { font-family: "Cascadia Code", Consolas, ui-monospace, monospace; font-size: 46px; fill: #1f1a17; opacity: 0.85; }

@media (prefers-reduced-motion: reduce) {
  .toasty-cat .critter { animation: none !important; }
  .toasty-cat .pupil-l, .toasty-cat .pupil-r { transition: none !important; }
}
`;
