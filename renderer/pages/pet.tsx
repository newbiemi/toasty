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

  useEffect(() => {
    window.toasty.getSettings().then((s) => setMinimized(s.petMinimized));
    const unsub = window.toasty.onCatState((s) => setCatState(s));

    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d.dragging) return;
      const dx = e.screenX - d.startX;
      const dy = e.screenY - d.startY;
      if (!d.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) d.moved = true;
      if (d.moved) window.toasty.movePet(d.winX + dx, d.winY + dy);
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
          html, body {
            background: transparent !important;
            margin: 0; padding: 0; overflow: hidden;
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
            width: "100vw", height: "100vh",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "grab",
          }}
        >
          {/* Wrapper sized to the cat — keeps minimize button anchored to the sprite */}
          <div style={{ position: "relative", width: 72, height: 72, flexShrink: 0 }}>
            {hovered && (
              <div
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
            />
          </div>
        </div>
      )}
    </>
  );
}
