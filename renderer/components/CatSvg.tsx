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

/* values from cat-lab/toasty-motion.json (Fahmi-tuned, accepted as defaults
   2026-07-11) — edit the JSON, re-transcribe both here and in CAT_CSS below. */
export const MOTION = {
  breathe: { periodMs: 4000, scaleY: 1.018 },
  bounce: { periodMs: 600, px: 10 },
  jump: { heightPx: 22, periodMs: 700, repeats: 2, squashLand: 0.94 },
  squash: { scaleX: 1.06, scaleY: 0.92, ms: 180 },
  purr: { amp: 1.2, periodMs: 320 },
  scrunch: { scale: 0.94, rotateDeg: -3 },
  settle: { ms: 260, overshoot: 1.03 },
  petting: { flipsToTrigger: 4, windowMs: 1000, holdMs: 900 },
} as const;

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
      Object.keys(cells).forEach((key) => {
        const [x, y] = key.split(",").map(Number);
        g.appendChild(rect(x, y, cells[key]));
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

.toasty-cat .critter { transform-box: view-box; transform-origin: 300px 570px; animation: t-breathe 4s ease-in-out infinite; }
.toasty-cat.state-thinking .critter { animation: t-breathe-slow 6s ease-in-out infinite; }
.toasty-cat.state-sleep .critter { animation: t-breathe-slow 7s ease-in-out infinite; }
.toasty-cat.state-happy .critter { animation: t-bounce 0.6s ease-in-out infinite; }
.toasty-cat.state-alert .critter { animation: t-jump 700ms ease-in-out 2; }

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
  35% { transform: translateY(-22px) scaleY(1.02); }
  70% { transform: translateY(0px) scaleY(0.94); }
  85% { transform: translateY(0px) scaleY(1.01); }
}
@keyframes t-squash {
  0% { transform: scale(1,1); }
  40% { transform: scale(1.06, 0.92); }
  100% { transform: scale(1,1); }
}
@keyframes t-purr { 0%, 100% { transform: translateX(0px); } 50% { transform: translateX(1.2px); } }
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

.toasty-cat .pupil-l, .toasty-cat .pupil-r { transform-box: fill-box; transform-origin: center; transition: transform 0.14s ease-out; }
.toasty-cat.state-sleep .pupil-l, .toasty-cat.state-sleep .pupil-r { transition: none; }

.toasty-cat .state-fx-text { font-family: "Cascadia Code", Consolas, ui-monospace, monospace; font-size: 46px; fill: #1f1a17; opacity: 0.85; transform-box: fill-box; transform-origin: center; }
.toasty-cat .state-fx-text.heart-pulse { animation: t-heart-pulse 600ms ease-in-out infinite; fill: #c4828a; }
@keyframes t-heart-pulse { 0%, 100% { opacity: 0.6; transform: translateY(0px) scale(1); } 50% { opacity: 1; transform: translateY(-6px) scale(1.15); } }

@media (prefers-reduced-motion: reduce) {
  .toasty-cat .critter { animation: none !important; transform: none !important; }
  .toasty-cat .pupil-l, .toasty-cat .pupil-r { transition: none !important; }
  .toasty-cat .state-fx-text.heart-pulse { animation: none !important; }
}
`;
