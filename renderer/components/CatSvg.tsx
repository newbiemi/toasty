import { useEffect, useRef, useState } from "react";
import { CAT_CELLS, EYE_L_BOX, EYE_R_BOX, DARK, FUR } from "../lib/toastyCatGrid";
import { FACE_VARIANTS, type FaceExpression } from "../lib/toastyFaces";

/**
 * Toasty as an inline pixel-SVG — Phase 12: the character is no longer a
 * generated silhouette. Every cell comes from Fahmi's hand-painted grid
 * (cat-lab/toasty-cat-grid.json, painted in the A1/A2 pixel-editor artifacts,
 * approved as REV.07). This component just renders that data and re-attaches
 * the motion rig: breathe, scheduled blink, cursor-tracking eyes.
 *
 * Phase 13 adds expression overlays (cat-lab/toasty-faces-grid.json, painted
 * in the A3 editor): the head region is split into a `face-default` group
 * (the blinking/eye-tracking rig, used normally) plus one static `face-<name>`
 * group per FaceExpression, all built once and toggled by CSS via the
 * `expr-<name>` class — no DOM rebuild on expression change.
 *
 * Phase 13 also adds interactive motion (pet/tap/drag/jump), tuned by Fahmi
 * in the toasty-motion-lab artifact and accepted as-is (defaults). Values
 * live in `MOTION` below and cat-lab/toasty-motion.json (edit there,
 * re-transcribe here — this module doesn't read the JSON at runtime).
 * `interaction` classes (`int-tapped`/`int-petting`/`int-dragging`) are
 * driven by pet.tsx; `int-settling` is managed internally by this component
 * as a short-lived echo when `interaction` drops out of "dragging".
 *
 * Two variants:
 *  - "full"  — the whole cat (pet window). Expression overlays apply here only.
 *  - "head"  — rows <= HEAD_MAX_ROW only (dot-mode icon; scripts/generate-icons.js
 *              reads the same JSON — regenerate icons if the grid changes).
 *              Always renders the default face — no expression or interaction.
 *
 * The tail is fused into the painted body outline — no independent tail rig
 * this revision.
 */

/* values from cat-lab/toasty-motion.json (Fahmi-tuned via the motion lab,
   2026-07-11) — edit the JSON, re-transcribe both here and in CAT_CSS below. */
export const MOTION = {
  breathe: { periodMs: 1600, scaleY: 1.018 },
  bounce: { periodMs: 600, px: 10 },
  jump: { heightPx: 40, periodMs: 470, repeats: 2, squashLand: 0.91 },
  squash: { scaleX: 1.06, scaleY: 0.92, ms: 180 },
  purr: { amp: 2.8, periodMs: 320 },
  scrunch: { scale: 0.94, rotateDeg: -3 },
  settle: { ms: 260, overshoot: 1.03 },
  petting: { flipsToTrigger: 4, windowMs: 1000, holdMs: 900 },
  /* thinking-dots row painted onto the curious face (cat-lab/toasty-faces-grid.json,
     2026-07-11) — 5 dot cells split by x-range in buildCat() and staggered via
     per-element animation-delay = staggerMs * index. */
  thinkDots: { staggerMs: 500, pulseMs: 1500 },
} as const;

// Exact cells of the 5 painted dot blobs on the curious face (cat-lab/toasty-faces-grid.json).
// Not a y<=3 heuristic — the base head has legitimate ear-tip cells up there too
// (e.g. "11,3"), so the dot set must be the literal painted coordinates.
const DOT_CELLS = new Set([
  "7,0", "8,0", "9,0", "10,0", "11,0", "12,0", "13,0", "14,0", "15,0", "16,0",
  "17,0", "18,0", "19,0", "20,0", "21,0", "22,0", "23,0", "24,0", "25,0", "26,0",
  "7,1", "8,1", "9,1", "10,1", "11,1", "12,1", "13,1", "14,1", "15,1", "16,1",
  "17,1", "18,1", "19,1", "20,1", "21,1", "22,1", "23,1", "24,1", "25,1", "26,1",
  "7,2", "8,2", "9,2", "10,2", "11,2", "12,2", "13,2", "14,2", "15,2", "16,2",
  "17,2", "18,2", "19,2", "20,2", "21,2", "22,2", "23,2", "24,2", "25,2", "26,2",
  "9,3", "10,3", "14,3", "15,3", "16,3", "17,3", "18,3", "19,3", "20,3", "21,3",
  "22,3", "23,3", "24,3",
]);
// x-ranges (inclusive) bucketing DOT_CELLS into 5 separate blobs for staggered timing.
const DOT_X_RANGES: Array<[number, number]> = [[7, 10], [11, 14], [15, 18], [19, 22], [23, 26]];

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

function isHeadCell(x: number, y: number) {
  return y <= HEAD_MAX_ROW && x <= HEAD_MAX_COL;
}

/** Build the static DOM structure once. Mutates `critterGroup`.
 *  Splits cells into a `torso` group (unaffected by expression) and a
 *  `face-default` group (head region + the blink/eye-track rig), then — for
 *  the full variant only — adds one static `face-<name>` group per
 *  FaceExpression from FACE_VARIANTS. CSS toggles which face group is
 *  visible; only face-default ever gets the live eye rig. */
function buildCat(critterGroup: SVGGElement, variant: "full" | "head") {
  const torso = document.createElementNS(svgNS, "g");
  torso.setAttribute("class", "torso");
  const faceDefault = document.createElementNS(svgNS, "g");
  faceDefault.setAttribute("class", "face face-default");

  Object.keys(CAT_CELLS).forEach((key) => {
    const [x, y] = key.split(",").map(Number);
    if (variant === "head" && (y > HEAD_MAX_ROW || x > HEAD_MAX_COL)) return;
    const head = isHeadCell(x, y);
    // eye cells in the default face are painted by the eye rig below, not this pass
    if (head && CAT_CELLS[key] === DARK && (inBox(x, y, EYE_L_BOX) || inBox(x, y, EYE_R_BOX))) return;
    (head ? faceDefault : torso).appendChild(rect(x, y, CAT_CELLS[key]));
  });
  faceDefault.appendChild(buildEye(EYE_L_BOX, "pupil-l"));
  faceDefault.appendChild(buildEye(EYE_R_BOX, "pupil-r"));

  critterGroup.appendChild(torso);
  critterGroup.appendChild(faceDefault);

  if (variant === "full") {
    (Object.keys(FACE_VARIANTS) as FaceExpression[]).forEach((name) => {
      const g = document.createElementNS(svgNS, "g");
      g.setAttribute("class", `face face-${name}`);
      const cells = FACE_VARIANTS[name];

      if (name === "curious") {
        // Split the painted thinking-dots row (y<=DOT_ROW_MAX_Y) into 5
        // sub-groups by x-range so each can pulse on its own staggered delay;
        // everything else in the face is one static base group.
        const base = document.createElementNS(svgNS, "g");
        base.setAttribute("class", "dots-base");
        const dotGroups = DOT_X_RANGES.map((_, i) => {
          const dg = document.createElementNS(svgNS, "g");
          dg.setAttribute("class", `dot-${i + 1}`);
          dg.style.animationDelay = `${i * MOTION.thinkDots.staggerMs}ms`;
          return dg;
        });
        Object.keys(cells).forEach((key) => {
          const [x, y] = key.split(",").map(Number);
          if (DOT_CELLS.has(key)) {
            const idx = DOT_X_RANGES.findIndex(([lo, hi]) => x >= lo && x <= hi);
            if (idx >= 0) { dotGroups[idx].appendChild(rect(x, y, cells[key])); return; }
          }
          base.appendChild(rect(x, y, cells[key]));
        });
        g.appendChild(base);
        dotGroups.forEach((dg) => g.appendChild(dg));
      } else {
        Object.keys(cells).forEach((key) => {
          const [x, y] = key.split(",").map(Number);
          g.appendChild(rect(x, y, cells[key]));
        });
      }

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
      const t = setTimeout(() => setSettling(false), MOTION.settle.ms + 40);
      prevInteractionRef.current = interaction;
      return () => clearTimeout(t);
    }
    prevInteractionRef.current = interaction;
  }, [interaction]);

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
      <style dangerouslySetInnerHTML={{ __html: CAT_CSS }} />
      <svg
        ref={svgRef}
        className={classes}
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
          <text x="430" y="60" className={`state-fx-text${petting ? " heart-pulse" : ""}`} textAnchor="middle">{glyph}</text>
        )}
      </svg>
    </>
  );
}

const CAT_CSS = `
.toasty-cat {
  shape-rendering: crispEdges;
}

.toasty-cat .critter { transform-box: view-box; transform-origin: 300px 570px; animation: t-breathe 1600ms ease-in-out infinite; }
.toasty-cat.state-thinking .critter { animation: t-breathe-slow 6s ease-in-out infinite; }
.toasty-cat.state-sleep .critter { animation: t-breathe-slow 7s ease-in-out infinite; }
.toasty-cat.state-happy .critter { animation: t-bounce 0.6s ease-in-out infinite; }
.toasty-cat.state-alert .critter { animation: t-jump 470ms ease-in-out 2; }

/* Interactive motion (Phase 13) — pet/tap/drag, tuned in the motion-lab
   artifact (cat-lab/toasty-motion.json). int-settling is a one-shot echo
   CatSvg applies itself right after a drag ends (see the settling effect
   above) — it is never set directly by pet.tsx. */
.toasty-cat.int-tapped .critter { animation: t-squash 180ms ease-out 1; }
.toasty-cat.int-petting .critter { animation: t-purr 320ms ease-in-out infinite; }
.toasty-cat.int-dragging .critter { animation: none; transform: scale(0.94) rotate(-3deg); }
.toasty-cat.int-settling .critter { animation: t-settle 260ms ease-out 1; }

@keyframes t-breathe { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(1.018); } }
@keyframes t-breathe-slow { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(1.009); } }
@keyframes t-bounce { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-10px); } }
@keyframes t-jump {
  0%, 100% { transform: translateY(0px) scaleY(1); }
  35% { transform: translateY(-40px) scaleY(1.02); }
  70% { transform: translateY(0px) scaleY(0.91); }
  85% { transform: translateY(0px) scaleY(1.01); }
}
@keyframes t-squash {
  0% { transform: scale(1,1); }
  40% { transform: scale(1.06, 0.92); }
  100% { transform: scale(1,1); }
}
@keyframes t-purr { 0%, 100% { transform: translateX(0px); } 50% { transform: translateX(2.8px); } }
@keyframes t-settle {
  0% { transform: scale(0.94) rotate(-3deg); }
  55% { transform: scale(1.03) rotate(0deg); }
  100% { transform: scale(1) rotate(0deg); }
}

.toasty-cat .eye-open { display: block; }
.toasty-cat .eye-closed { display: none; }
.toasty-cat.blinking .eye-open { display: none; }
.toasty-cat.blinking .eye-closed { display: block; }
.toasty-cat.state-sleep .eye-open { display: none; }
.toasty-cat.state-sleep .eye-closed { display: block; }

/* Expression overlays (Phase 13) — face-default is the live blink/eye-track
   rig and shows unless an expr-* class picks a static painted face instead. */
.toasty-cat .face-default { display: block; }
.toasty-cat .face-smile, .toasty-cat .face-curious,
.toasty-cat .face-startled, .toasty-cat .face-grumpy { display: none; }
.toasty-cat.expr-smile .face-default { display: none; }
.toasty-cat.expr-smile .face-smile { display: block; }
.toasty-cat.expr-curious .face-default { display: none; }
.toasty-cat.expr-curious .face-curious { display: block; }
.toasty-cat.expr-startled .face-default { display: none; }
.toasty-cat.expr-startled .face-startled { display: block; }
.toasty-cat.expr-grumpy .face-default { display: none; }
.toasty-cat.expr-grumpy .face-grumpy { display: block; }

/* Thinking-dots row painted onto the curious face — pulses whenever curious
   is shown (no separate trigger; display:none pauses/resets the animation
   on the other 4 faces for free). Stagger comes from the per-group
   animation-delay set in buildCat(), not from CSS. */
.toasty-cat .face-curious .dot-1, .toasty-cat .face-curious .dot-2,
.toasty-cat .face-curious .dot-3, .toasty-cat .face-curious .dot-4,
.toasty-cat .face-curious .dot-5 {
  transform-box: fill-box; transform-origin: center;
  animation: t-think-dot 1500ms ease-in-out infinite;
}
@keyframes t-think-dot { 0%, 100% { opacity: 0.35; transform: scale(0.85); } 50% { opacity: 1; transform: scale(1.05); } }

.toasty-cat .pupil-l, .toasty-cat .pupil-r { transform-box: fill-box; transform-origin: center; transition: transform 0.14s ease-out; }
.toasty-cat.state-sleep .pupil-l, .toasty-cat.state-sleep .pupil-r { transition: none; }

.toasty-cat .state-fx-text { font-family: "Cascadia Code", Consolas, ui-monospace, monospace; font-size: 46px; fill: #1f1a17; opacity: 0.85; transform-box: fill-box; transform-origin: center; }
.toasty-cat .state-fx-text.heart-pulse { animation: t-heart-pulse 600ms ease-in-out infinite; fill: #c4828a; }
@keyframes t-heart-pulse { 0%, 100% { opacity: 0.6; transform: translateY(0px) scale(1); } 50% { opacity: 1; transform: translateY(-6px) scale(1.15); } }

@media (prefers-reduced-motion: reduce) {
  .toasty-cat .critter { animation: none !important; transform: none !important; }
  .toasty-cat .pupil-l, .toasty-cat .pupil-r { transition: none !important; }
  .toasty-cat .state-fx-text.heart-pulse { animation: none !important; }
  .toasty-cat .face-curious .dot-1, .toasty-cat .face-curious .dot-2,
  .toasty-cat .face-curious .dot-3, .toasty-cat .face-curious .dot-4,
  .toasty-cat .face-curious .dot-5 { animation: none !important; opacity: 1 !important; }
}
`;
