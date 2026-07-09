import { useEffect, useRef } from "react";

/**
 * Toasty as an inline pixel-SVG, ported from cat-lab/toasty-svg-playground.html.
 * Replaces the PNG sprite animator (Cat.tsx) on the pet overlay.
 *
 * Two variants share ONE silhouette builder (buildSilhouetteAndMarks):
 *  - "full"  — the whole cat (ears/face/body/paws/tail), used on the pet window.
 *  - "head"  — ears+face+eyes only (silhouette/marks rows filtered to <= HEAD_MAX_ROW,
 *              tail/paws skipped), used for dot-mode and as the source crop for the
 *              generated app/tray icon (scripts/generate-icons.js mirrors this data —
 *              keep the two in sync if the shape changes).
 */

const svgNS = "http://www.w3.org/2000/svg";
const CELL = 10, CENTER = 10.5;
const HEAD_MAX_ROW = 11; // rows 0-11: ears + face + eyes; excludes belly/paws/tail

const FULL_VIEWBOX = "0 0 240 220";
const FULL_ASPECT = 220 / 240;
const HEAD_VIEWBOX = "10 -15 200 150";
const HEAD_ASPECT = 150 / 200;

type CellMap = Record<string, string>;

function mirror(x: number) {
  return 2 * CENTER - x;
}
function addSpan(map: CellMap, y: number, lo: number, hi: number, color: string) {
  for (let x = lo; x <= hi; x++) map[`${x},${y}`] = color;
}
function addMirroredSpan(map: CellMap, y: number, lo: number, hi: number, color: string) {
  addSpan(map, y, lo, hi, color);
  addSpan(map, y, mirror(hi), mirror(lo), color);
}

// Dilate a cell map by one grid step in each direction — this is what produces the
// 1px outline: paint the dilated set in edge color first, then the original cells in
// fur color on top, leaving only the surrounding ring visible.
function dilate(map: CellMap): Record<string, true> {
  const d: Record<string, true> = {};
  Object.keys(map).forEach((key) => {
    const [xs, ys] = key.split(",");
    const x = +xs, y = +ys;
    ([[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const).forEach(([ox, oy]) => {
      d[`${x + ox},${y + oy}`] = true;
    });
  });
  return d;
}

function filterByMaxRow(map: CellMap, maxRow: number): CellMap {
  const out: CellMap = {};
  Object.keys(map).forEach((key) => {
    const y = +key.split(",")[1];
    if (y <= maxRow) out[key] = map[key];
  });
  return out;
}

// ---- fused silhouette: body + ears + paws in ONE map, hand-authored per row ----
function buildSilhouetteAndMarks() {
  const BODY_ROWS: [number, number, number][] = [
    [3, 8, 13], [4, 6, 15], [5, 5, 16], [6, 4, 17], [7, 4, 17], [8, 4, 17],
    [9, 3, 18], [10, 3, 18], [11, 4, 17], [12, 3, 18], [13, 2, 19], [14, 2, 19],
    [15, 2, 19], [16, 2, 19], [17, 3, 18], [18, 4, 17], [19, 5, 16],
  ];
  const silhouette: CellMap = {};
  BODY_ROWS.forEach((r) => addSpan(silhouette, r[0], r[1], r[2], "F"));

  // ears — two triangles fused directly into the body map
  const EAR_ROWS: [number, number, number][] = [[0, 5, 5], [1, 4, 6], [2, 3, 7], [3, 3, 7], [4, 4, 6]];
  EAR_ROWS.forEach((r) => addMirroredSpan(silhouette, r[0], r[1], r[2], "F"));

  // paws — also fused so they pick up the same outline as the body
  [19, 20].forEach((y) => addMirroredSpan(silhouette, y, 6, 8, "P"));

  const marks: CellMap = {};
  // forelock
  addSpan(marks, 4, 9, 12, "M");
  addSpan(marks, 5, 10, 11, "M");
  // ear-inner
  addMirroredSpan(marks, 1, 5, 5, "M");
  addMirroredSpan(marks, 2, 4, 6, "M");
  addMirroredSpan(marks, 3, 4, 6, "M");
  // belly
  ([[13, 8, 13], [14, 7, 14], [15, 7, 14], [16, 7, 14], [17, 8, 13], [18, 9, 12], [19, 9, 12]] as const)
    .forEach((r) => addSpan(marks, r[0], r[1], r[2], "B"));

  return { silhouette, marks };
}

function rect(x: number, y: number, fill: string, opacity?: number) {
  const r = document.createElementNS(svgNS, "rect");
  r.setAttribute("x", String(x * CELL));
  r.setAttribute("y", String(y * CELL));
  r.setAttribute("width", String(CELL));
  r.setAttribute("height", String(CELL));
  r.setAttribute("fill", fill);
  if (opacity) r.setAttribute("fill-opacity", String(opacity));
  return r;
}

function paintPart(target: SVGGElement, solidMap: CellMap, colorFor: Record<string, string>, markMap?: CellMap) {
  const outline = dilate(solidMap);
  Object.keys(outline).forEach((key) => {
    const [x, y] = key.split(",").map(Number);
    target.appendChild(rect(x, y, "var(--fur-edge)"));
  });
  Object.keys(solidMap).forEach((key) => {
    const [x, y] = key.split(",").map(Number);
    target.appendChild(rect(x, y, colorFor[solidMap[key]]));
  });
  if (markMap) {
    Object.keys(markMap).forEach((key) => {
      const [x, y] = key.split(",").map(Number);
      target.appendChild(rect(x, y, colorFor[markMap[key]], 0.9));
    });
  }
}

function eyeGroup(cx: number, pupilClass: string) {
  const wrap = document.createElementNS(svgNS, "g");
  const open = document.createElementNS(svgNS, "g");
  open.setAttribute("class", `eye-open ${pupilClass}`);
  ([[cx, 7], [cx + 1, 7], [cx + 2, 7], [cx, 8], [cx + 1, 8], [cx + 2, 8], [cx, 9], [cx + 1, 9], [cx + 2, 9]] as const)
    .forEach((c) => open.appendChild(rect(c[0], c[1], "var(--eye)")));
  open.appendChild(rect(cx, 7, "var(--eye-hi)"));
  const closed = document.createElementNS(svgNS, "g");
  closed.setAttribute("class", "eye-closed");
  [cx, cx + 1, cx + 2].forEach((x) => closed.appendChild(rect(x, 8, "var(--fur-edge)")));
  wrap.appendChild(open);
  wrap.appendChild(closed);
  return wrap;
}

/** Build the static DOM structure once. Mutates `critterGroup` and (for "full") `tailGroup`. */
function buildCat(critterGroup: SVGGElement, tailGroup: SVGGElement | null, variant: "full" | "head") {
  const colorFor: Record<string, string> = { F: "var(--fur)", P: "var(--fur-paw)", M: "var(--fur-mark)", B: "var(--fur-belly)" };
  const { silhouette, marks } = buildSilhouetteAndMarks();

  const bodySil = variant === "head" ? filterByMaxRow(silhouette, HEAD_MAX_ROW) : silhouette;
  const bodyMarks = variant === "head" ? filterByMaxRow(marks, HEAD_MAX_ROW) : marks;
  paintPart(critterGroup, bodySil, colorFor, bodyMarks);

  // blush
  function blushBlock(cx: number) {
    for (let x = cx; x <= cx + 1; x++) for (let y = 10; y <= 11; y++) critterGroup.appendChild(rect(x, y, "var(--blush)", 0.6));
  }
  blushBlock(4);
  blushBlock(mirror(5));

  // eyes
  critterGroup.appendChild(eyeGroup(6, "pupil-l"));
  critterGroup.appendChild(eyeGroup(13, "pupil-r"));

  if (variant === "full") {
    // whiskers — free vector lines, not grid-locked
    const whiskerSvg = document.createElementNS(svgNS, "g");
    whiskerSvg.setAttribute("stroke", "var(--fur-edge)");
    whiskerSvg.setAttribute("stroke-width", "1.3");
    whiskerSvg.setAttribute("stroke-linecap", "round");
    whiskerSvg.setAttribute("opacity", "0.4");
    const whisker = (x1: number, y1: number, x2: number, y2: number) => {
      const l = document.createElementNS(svgNS, "line");
      l.setAttribute("x1", String(x1)); l.setAttribute("y1", String(y1));
      l.setAttribute("x2", String(x2)); l.setAttribute("y2", String(y2));
      whiskerSvg.appendChild(l);
    };
    whisker(32, 87, 8, 82);
    whisker(32, 97, 8, 100);
    whisker(178, 87, 202, 82);
    whisker(178, 97, 202, 100);
    critterGroup.appendChild(whiskerSvg);

    // tail — its own rig, sways independently
    if (tailGroup) {
      const tail: CellMap = {};
      ([[19, 14], [20, 14], [20, 13], [21, 13], [21, 12], [22, 12], [22, 11], [21, 10], [20, 10]] as const)
        .forEach((c) => { tail[`${c[0]},${c[1]}`] = "F"; });
      paintPart(tailGroup, tail, colorFor, { "22,11": "M", "21,10": "M" });
    }
  }
}

const STATE_GLYPH: Record<string, string | null> = {
  idle: null,
  thinking: "?",
  happy: "✦", // ✦
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
  const tailRef = useRef<SVGGElement | null>(null);
  const pupilLRef = useRef<SVGGElement | null>(null);
  const pupilRRef = useRef<SVGGElement | null>(null);

  // Build the static structure once.
  useEffect(() => {
    const critter = critterRef.current;
    if (!critter) return;
    buildCat(critter, tailRef.current, variant);
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
      const t = `translate(${(dx * 2.2).toFixed(2)}px,${(dy * 1.6).toFixed(2)}px)`;
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
          <ellipse cx="105" cy="212" rx="54" ry="7" fill="#000" opacity="0.22" />
        )}
        {variant === "full" && (
          <g ref={tailRef} className="tail-rig" />
        )}
        <g ref={critterRef} className="critter" data-cat-hit="1" />
        {glyph && (
          <text x="150" y="26" className="state-fx-text" textAnchor="middle">{glyph}</text>
        )}
      </svg>
    </>
  );
}

const CAT_CSS = `
.toasty-cat {
  --fur: #f5e6d3;
  --fur-belly: #faf1e2;
  --fur-edge: #5b4636;
  --fur-paw: #e6d2b4;
  --fur-mark: #e8a87c;
  --blush: #f7b7c4;
  --eye: #3a2e28;
  --eye-hi: #fffaf0;
  shape-rendering: crispEdges;
}

.toasty-cat .critter { transform-box: view-box; transform-origin: 120px 210px; animation: t-breathe 4s ease-in-out infinite; }
.toasty-cat.state-thinking .critter { animation: t-breathe-slow 6s ease-in-out infinite; }
.toasty-cat.state-sleep .critter { animation: t-breathe-slow 7s ease-in-out infinite; }
.toasty-cat.state-happy .critter { animation: t-bounce 0.6s ease-in-out infinite; }
.toasty-cat.state-alert .critter { animation: t-shake 0.4s ease-in-out infinite; }

.toasty-cat .tail-rig { transform-box: view-box; transform-origin: 190px 140px; animation: t-tail-sway 4.4s ease-in-out infinite; }
.toasty-cat.state-happy .tail-rig { animation: t-tail-sway 1.3s ease-in-out infinite; }
.toasty-cat.state-sleep .tail-rig, .toasty-cat.state-thinking .tail-rig { animation: none; }

@keyframes t-breathe { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(1.022); } }
@keyframes t-breathe-slow { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(1.01); } }
@keyframes t-bounce { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-4px); } }
@keyframes t-shake { 0%, 100% { transform: translateX(0px); } 25% { transform: translateX(-2px); } 75% { transform: translateX(2px); } }
@keyframes t-tail-sway {
  0%, 100% { transform: translate(0px, 0px); }
  42% { transform: translate(7px, -8px); }
  58% { transform: translate(6px, -7px); }
}

.toasty-cat .eye-open { display: block; }
.toasty-cat .eye-closed { display: none; }
.toasty-cat.blinking .eye-open { display: none; }
.toasty-cat.blinking .eye-closed { display: block; }
.toasty-cat.state-sleep .eye-open { display: none; }
.toasty-cat.state-sleep .eye-closed { display: block; }

.toasty-cat .pupil-l, .toasty-cat .pupil-r { transform-box: fill-box; transform-origin: center; transition: transform 0.14s ease-out; }
.toasty-cat.state-sleep .pupil-l, .toasty-cat.state-sleep .pupil-r { transition: none; }

.toasty-cat .state-fx-text { font-family: "Cascadia Code", Consolas, ui-monospace, monospace; font-size: 20px; fill: var(--fur-edge); opacity: 0.85; }

@media (prefers-reduced-motion: reduce) {
  .toasty-cat .critter, .toasty-cat .tail-rig { animation: none !important; }
  .toasty-cat .pupil-l, .toasty-cat .pupil-r { transition: none !important; }
}
`;
