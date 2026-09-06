import Head from "next/head";
import { useEffect, useState, useRef } from "react";
import CatSvg from "../components/CatSvg";
import { ensureSpriteDataLoaded, getMotion } from "../lib/spriteData";
import type { FaceExpression } from "../lib/toastyFaces";

// Fixed canvas — kept at its Phase-1/2 size even though the menu moved into its
// own window (Phase 3): shrinking it would mean re-tuning the DPI-drift-tested
// size-lock constants in main/windows.ts for no functional gain.
// Must match PET_W/PET_H in main/windows.ts.
const PET_W = 340;
const PET_H = 300;
const CAT_BOX = 88; // cat's own hit-region within the canvas — matches PET_CAT in windows.ts

export default function PetPage() {
  const [catState, setCatState] = useState("idle");
  const [minimized, setMinimized] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [interaction, setInteraction] = useState<"petting" | "tapped" | "dragging" | null>(null);
  const [postDragGrumpy, setPostDragGrumpy] = useState(false);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const grumpyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // IPC-based drag state — avoids WebkitAppRegion:"no-drag" covering the entire cat
  const dragRef = useRef({ dragging: false, moved: false, startX: 0, startY: 0, winX: 0, winY: 0 });
  // Pet-detector: sideways stroke direction flips over the cat, within a rolling window
  const pettingRef = useRef({ overCat: false, lastX: 0, lastSign: 0, flips: [] as number[], holdTimer: null as ReturnType<typeof setTimeout> | null });

  const ignoreRef = useRef(false);      // current setIgnoreMouseEvents state
  const minimizedRef = useRef(false);   // mirror of minimized state for use inside event handlers
  const interactionRef = useRef<typeof interaction>(null); // mirror of interaction for use inside event handlers

  // Keep minimizedRef in sync; reset to interactive when entering dot mode
  useEffect(() => {
    minimizedRef.current = minimized;
    if (minimized && ignoreRef.current) {
      ignoreRef.current = false;
      window.toasty.setPetIgnore(false);
    }
  }, [minimized]);

  useEffect(() => { interactionRef.current = interaction; }, [interaction]);

  useEffect(() => {
    // window.toasty is injected by Electron's preload/contextBridge and can be
    // transiently absent during dev (nextron's main-process build and the
    // renderer's `next dev` share the same `app/` distDir and can race/clobber
    // each other's output — see windows.ts). Guard so a missing bridge degrades
    // to a static (non-interactive) render instead of throwing in this mount
    // effect and tearing down the whole tree.
    if (!window.toasty) return;
    ensureSpriteDataLoaded(); // kick off the shared-folder load early — getMotion() falls back to bundled defaults until it resolves
    window.toasty.getSettings().then((s) => setMinimized(s.petMinimized));
    const unsub = window.toasty.onCatState((s) => setCatState(s));

    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (d.dragging) {
        const dx = e.screenX - d.startX;
        const dy = e.screenY - d.startY;
        if (!d.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
          d.moved = true;
          setInteraction("dragging");
        }
        if (d.moved) window.toasty.movePet(d.winX + dx, d.winY + dy);
        // Always interactive while dragging — never let a drag flip to click-through
        if (ignoreRef.current) { ignoreRef.current = false; window.toasty.setPetIgnore(false); }
        return;
      }

      // Dot mode is always a solid circle, skip
      if (minimizedRef.current) return;

      // Click-through via SVG DOM hit-testing: the cat is an inline SVG (no
      // rasterized frame to alpha-sample), so instead we ask "is the element
      // under the cursor part of the painted cat, or the minimize button?"
      // Anything else in the fixed PET_W×PET_H canvas is empty canvas and
      // should pass clicks through to whatever is behind Toasty. (The menu is
      // its own window now, not an in-canvas panel, so it no longer needs a
      // hit-test exception here.)
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const catHit = el?.closest("[data-cat-hit]");
      const hit = el?.closest("[data-min-btn]") || catHit;
      const shouldIgnore = !hit;

      if (shouldIgnore !== ignoreRef.current) {
        ignoreRef.current = shouldIgnore;
        window.toasty.setPetIgnore(shouldIgnore);
      }

      // Petting detector: sideways stroke direction flips over the cat, within
      // MOTION.petting.windowMs, trigger the purr/heart interaction. Stops
      // the instant the cursor leaves the cat.
      const p = pettingRef.current;
      if (catHit) {
        if (!p.overCat) { p.overCat = true; p.lastX = e.screenX; p.lastSign = 0; p.flips = []; }
        else {
          const dx = e.screenX - p.lastX;
          p.lastX = e.screenX;
          if (Math.abs(dx) > 2) {
            const sign = dx > 0 ? 1 : -1;
            if (p.lastSign !== 0 && sign !== p.lastSign) {
              const now = Date.now();
              const petting = getMotion().petting ?? { windowMs: 1000, flipsToTrigger: 4, holdMs: 900 };
              p.flips = [...p.flips, now].filter((t) => now - t <= petting.windowMs);
              if (p.flips.length >= petting.flipsToTrigger) {
                setInteraction("petting");
                if (p.holdTimer) clearTimeout(p.holdTimer);
                p.holdTimer = setTimeout(() => {
                  setInteraction((cur) => (cur === "petting" ? null : cur));
                  p.flips = [];
                }, petting.holdMs);
              }
            }
            p.lastSign = sign;
          }
        }
      } else if (p.overCat) {
        p.overCat = false;
        p.flips = [];
        p.lastSign = 0;
        if (p.holdTimer) { clearTimeout(p.holdTimer); p.holdTimer = null; }
        if (interactionRef.current === "petting") setInteraction(null);
      }
    };
    const onUp = () => {
      const d = dragRef.current;
      const wasRealDrag = d.moved && interactionRef.current === "dragging";
      d.dragging = false;
      if (wasRealDrag) {
        setInteraction(null);
        setPostDragGrumpy(true);
        if (grumpyTimerRef.current) clearTimeout(grumpyTimerRef.current);
        grumpyTimerRef.current = setTimeout(() => setPostDragGrumpy(false), 2000);
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      unsub();
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (pettingRef.current.holdTimer) clearTimeout(pettingRef.current.holdTimer);
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      if (grumpyTimerRef.current) clearTimeout(grumpyTimerRef.current);
    };
  }, []);

  const handleMouseDown = async (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault(); // prevent browser native image drag-and-drop
    // Get position from main process — window.screenLeft/Top is unreliable in
    // transparent Electron windows under Windows DPI scaling
    const pos = await window.toasty.getPetPosition();
    dragRef.current = {
      dragging: true, moved: false,
      startX: e.screenX, startY: e.screenY,
      winX: pos.x, winY: pos.y,
    };
  };

  const handleMinimize = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !minimized;
    setMinimized(next);
    window.toasty.setPetSize(next ? "dot" : "full");
  };

  // Dot mode never wired up dragging at all — onMouseDown alone starts the
  // drag; whether the click that follows should restore Toasty depends on
  // whether that mousedown turned into an actual drag (same guard full mode's
  // handleCatClick already uses).
  const handleDotClick = (e: React.MouseEvent) => {
    if (dragRef.current.moved) { dragRef.current.moved = false; return; }
    handleMinimize(e);
  };

  // A click brings the widget back if it's hidden, or opens the menu if the
  // widget's already up — main process decides which, since it holds the
  // widget's actual visibility state. No more double-click mode toggle (that
  // whole window/pet mode split is gone as of Phase 3).
  const handleCatClick = () => {
    // Ignore if this was a drag (mouse moved more than 3px)
    if (dragRef.current.moved) { dragRef.current.moved = false; return; }
    setInteraction("tapped");
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => {
      setInteraction((cur) => (cur === "tapped" ? null : cur));
    }, getMotion().squash?.ms ?? 180);
    window.toasty.catClicked();
  };

  // Priority: alert > post-drag grumpy > petting/happy smile > idle-hover curious.
  const expression: FaceExpression | null =
    catState === "alert" ? "startled" :
    postDragGrumpy ? "grumpy" :
    (interaction === "petting" || catState === "happy") ? "smile" :
    (hovered && catState === "idle") ? "curious" :
    null;

  return (
    <>
      <Head>
        <style>{`
          html, body, #__next {
            background: transparent !important;
            margin: 0; padding: 0; overflow: hidden;
            width: ${PET_W}px; height: ${PET_H}px;
          }
        `}</style>
      </Head>

      {minimized ? (
        /* ── Dot mode ── */
        <div
          onMouseDown={handleMouseDown}
          onClick={handleDotClick}
          onContextMenu={(e) => { e.preventDefault(); window.toasty.catRightClicked(); }}
          style={{
            width: 34, height: 34,
            borderRadius: "50%",
            background: "#e8943b",
            border: "3px solid #5a3e2b",
            cursor: "grab",
            WebkitAppRegion: "no-drag",
            display: "flex", alignItems: "center", justifyContent: "center",
            userSelect: "none",
          } as React.CSSProperties}
          title="Drag to move — click to restore Toasty"
        >
          <CatSvg variant="head" size={26} />
        </div>
      ) : (
        /* ── Full mode: fixed canvas holding the cat + (optionally) the menu ── */
        <div style={{ position: "relative", width: PET_W, height: PET_H }}>
          <div
            onMouseDown={handleMouseDown}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onContextMenu={(e) => { e.preventDefault(); window.toasty.catRightClicked(); }}
            style={{
              position: "absolute", left: 0, top: 0,
              width: CAT_BOX, height: CAT_BOX,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "grab",
              overflow: "hidden",
            }}
          >
            {/* Wrapper sized to the cat — keeps minimize button anchored to the sprite */}
            <div style={{ position: "relative", width: 72, height: 72, flexShrink: 0 }}>
              {hovered && (
                <div
                  data-min-btn="1"
                  onClick={handleMinimize}
                  style={{
                    position: "absolute", top: -2, right: -2,
                    width: 20, height: 14,
                    background: "#e8943b",
                    border: "2px solid #5a3e2b",
                    borderRadius: 3,
                    cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, lineHeight: 1, color: "#fff", fontWeight: 900,
                    userSelect: "none",
                  } as React.CSSProperties}
                >
                  _
                </div>
              )}
              <CatSvg state={catState} size={72} interaction={interaction} expression={expression} onClick={handleCatClick} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
