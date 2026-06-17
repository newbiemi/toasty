import Head from "next/head";
import { useEffect, useState, useRef } from "react";
import Cat from "../components/Cat";

export default function PetPage() {
  const [catState, setCatState] = useState("idle");
  const [minimized, setMinimized] = useState(false);
  const [hovered, setHovered] = useState(false);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // IPC-based drag state — avoids WebkitAppRegion:"no-drag" covering the entire cat
  const dragRef = useRef({ dragging: false, moved: false, startX: 0, startY: 0, winX: 0, winY: 0 });

  // B2: per-pixel click-through refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ignoreRef = useRef(false);      // current setIgnoreMouseEvents state
  const hasFrameRef = useRef(false);    // true once a sprite frame has been drawn to canvas
  const minimizedRef = useRef(false);   // mirror of minimized state for use inside event handlers

  // Create offscreen canvas once for alpha sampling
  useEffect(() => {
    const c = document.createElement("canvas");
    c.width = 72; c.height = 72;
    canvasRef.current = c;
    return () => { canvasRef.current = null; };
  }, []);

  // Keep minimizedRef in sync; reset to interactive when entering dot mode
  useEffect(() => {
    minimizedRef.current = minimized;
    if (minimized && ignoreRef.current) {
      ignoreRef.current = false;
      window.toasty.setPetIgnore(false);
    }
  }, [minimized]);

  useEffect(() => {
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

      // Per-pixel click-through: dot mode is always a solid circle, skip
      if (minimizedRef.current) return;

      // Minimize button overlay — interactive regardless of alpha
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (el?.closest("[data-min-btn]")) {
        if (ignoreRef.current) { ignoreRef.current = false; window.toasty.setPetIgnore(false); }
        return;
      }

      // No frame loaded yet (emoji fallback or initial load) — stay interactive
      if (!hasFrameRef.current) {
        if (ignoreRef.current) { ignoreRef.current = false; window.toasty.setPetIgnore(false); }
        return;
      }

      // Sample sprite alpha at cursor position.
      // Sprite (72×72) is centered in the 88×88 window → 8px margin on each side.
      const sx = Math.round(e.clientX - 8);
      const sy = Math.round(e.clientY - 8);
      let shouldIgnore: boolean;
      if (sx < 0 || sx >= 72 || sy < 0 || sy >= 72) {
        shouldIgnore = true; // outside sprite box → transparent corner
      } else {
        try {
          const ctx = canvasRef.current?.getContext("2d") ?? null;
          shouldIgnore = ctx ? ctx.getImageData(sx, sy, 1, 1).data[3] < 10 : false;
        } catch {
          shouldIgnore = false; // tainted canvas — treat as opaque
        }
      }

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
    window.toasty.setPetSize(next ? "dot" : "full");
  };

  // B3: called by Cat on each frame load; draws the sprite into the offscreen canvas
  const handleFrameImg = (img: HTMLImageElement | null) => {
    hasFrameRef.current = img !== null;
    if (!img) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, 72, 72);
    ctx.drawImage(img, 0, 0, 72, 72);
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
        window.toasty.openCapture();
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
            width: 88px; height: 88px;
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
            fontSize: 16,
            userSelect: "none",
          } as React.CSSProperties}
          title="Restore Toasty"
        >
          🐱
        </div>
      ) : (
        /* ── Full cat mode ── */
        <div
          onMouseDown={handleMouseDown}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            width: 88, height: 88,  // matches PET_FULL in windows.ts; 100vw/100vh = monitor dims in transparent windows
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
            <Cat
              state={catState}
              size={72}
              onClick={handleCatClick}
              onFrameImg={handleFrameImg}
            />
          </div>
        </div>
      )}
    </>
  );
}
