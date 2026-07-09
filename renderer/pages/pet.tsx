import Head from "next/head";
import { useEffect, useState, useRef } from "react";
import CatSvg from "../components/CatSvg";
import MenuPanel from "../components/MenuPanel";

// Fixed canvas big enough to hold the cat + an open menu, so opening the menu
// never resizes the OS window (which would fight the size-lock in windows.ts).
// Must match PET_W/PET_H in main/windows.ts.
const PET_W = 340;
const PET_H = 300;
const CAT_BOX = 88; // cat's own hit-region within the canvas — matches PET_CAT in windows.ts

export default function PetPage() {
  const [catState, setCatState] = useState("idle");
  const [minimized, setMinimized] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // IPC-based drag state — avoids WebkitAppRegion:"no-drag" covering the entire cat
  const dragRef = useRef({ dragging: false, moved: false, startX: 0, startY: 0, winX: 0, winY: 0 });

  const ignoreRef = useRef(false);      // current setIgnoreMouseEvents state
  const minimizedRef = useRef(false);   // mirror of minimized state for use inside event handlers
  const menuOpenRef = useRef(false);    // mirror of menuOpen for use inside event handlers

  // Keep minimizedRef in sync; reset to interactive when entering dot mode
  useEffect(() => {
    minimizedRef.current = minimized;
    if (minimized && ignoreRef.current) {
      ignoreRef.current = false;
      window.toasty.setPetIgnore(false);
    }
  }, [minimized]);

  useEffect(() => { menuOpenRef.current = menuOpen; }, [menuOpen]);

  useEffect(() => {
    // window.toasty is injected by Electron's preload/contextBridge and can be
    // transiently absent during dev (nextron's main-process build and the
    // renderer's `next dev` share the same `app/` distDir and can race/clobber
    // each other's output — see windows.ts). Guard so a missing bridge degrades
    // to a static (non-interactive) render instead of throwing in this mount
    // effect and tearing down the whole tree.
    if (!window.toasty) return;
    window.toasty.getSettings().then((s) => setMinimized(s.petMinimized));
    const unsub = window.toasty.onCatState((s) => setCatState(s));

    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (d.dragging) {
        const dx = e.screenX - d.startX;
        const dy = e.screenY - d.startY;
        if (!d.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) d.moved = true;
        if (d.moved) window.toasty.movePet(d.winX + dx, d.winY + dy);
        // Always interactive while dragging — never let a drag flip to click-through
        if (ignoreRef.current) { ignoreRef.current = false; window.toasty.setPetIgnore(false); }
        return;
      }

      // Dot mode is always a solid circle, skip
      if (minimizedRef.current) return;

      // Click-through via SVG DOM hit-testing: the cat is an inline SVG (no
      // rasterized frame to alpha-sample), so instead we ask "is the element
      // under the cursor part of the painted cat, the minimize button, or the
      // open menu?" Anything else in the fixed PET_W×PET_H canvas is empty
      // canvas and should pass clicks through to whatever is behind Toasty.
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const hit =
        el?.closest("[data-min-btn]") ||
        el?.closest("[data-cat-hit]") ||
        (menuOpenRef.current && el?.closest("[data-menu-hit]"));
      const shouldIgnore = !hit;

      if (shouldIgnore !== ignoreRef.current) {
        ignoreRef.current = shouldIgnore;
        window.toasty.setPetIgnore(shouldIgnore);
      }
    };
    const onUp = () => { dragRef.current.dragging = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      unsub();
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
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
    if (next) setMenuOpen(false);
    window.toasty.setPetSize(next ? "dot" : "full");
  };

  const handleCatClick = () => {
    // Ignore if this was a drag (mouse moved more than 3px)
    if (dragRef.current.moved) { dragRef.current.moved = false; return; }
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      window.toasty.toggleMode();
    } else {
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null;
        setMenuOpen((o) => !o);
      }, 250);
    }
  };

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
          onClick={handleMinimize}
          style={{
            width: 34, height: 34,
            borderRadius: "50%",
            background: "#e8943b",
            border: "3px solid #5a3e2b",
            cursor: "pointer",
            WebkitAppRegion: "no-drag",
            display: "flex", alignItems: "center", justifyContent: "center",
            userSelect: "none",
          } as React.CSSProperties}
          title="Restore Toasty"
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
              <CatSvg state={catState} size={72} onClick={handleCatClick} />
            </div>
          </div>

          {menuOpen && (
            <div style={{ position: "absolute", left: CAT_BOX + 8, top: 0 }}>
              <MenuPanel />
            </div>
          )}
        </div>
      )}
    </>
  );
}
