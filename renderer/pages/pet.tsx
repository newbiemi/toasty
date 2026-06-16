import Head from "next/head";
import { useEffect, useState } from "react";
import Cat from "../components/Cat";

export default function PetPage() {
  const [catState, setCatState] = useState("idle");
  const [minimized, setMinimized] = useState(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    // Restore persisted minimized state
    window.toasty.getSettings().then((s) => setMinimized(s.petMinimized));
    const unsub = window.toasty.onCatState((s) => setCatState(s));
    return () => unsub();
  }, []);

  const handleMinimize = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !minimized;
    setMinimized(next);
    window.toasty.setPetSize(next ? "dot" : "full");
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
          style={{
            width: "100vw", height: "100vh",
            display: "flex", alignItems: "center", justifyContent: "center",
            WebkitAppRegion: "drag",
            position: "relative",
          } as React.CSSProperties}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {/* Minimize pill — appears on hover */}
          {hovered && (
            <div
              onClick={handleMinimize}
              style={{
                position: "absolute", top: 2, right: 2,
                width: 18, height: 12,
                background: "#e8943b",
                border: "2px solid #5a3e2b",
                borderRadius: 2,
                cursor: "pointer",
                WebkitAppRegion: "no-drag",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 8, color: "#5a3e2b", fontWeight: 700,
                userSelect: "none",
              } as React.CSSProperties}
              title="Minimize to dot"
            >
              –
            </div>
          )}

          <div style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
            <Cat
              state={catState}
              size={72}
              onClick={() => window.toasty.toggleMode()}
            />
          </div>
        </div>
      )}
    </>
  );
}
