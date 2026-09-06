import type { CSSProperties } from "react";

// Shared palette + style helpers for every Toasty window. Union of the four
// palettes that used to be duplicated (TaskDashboard, MenuPanel, capture, chat)
// with divergent keys — this is the merged superset so no window is missing a
// token it needs.
export const C = {
  cream: "#f4e4c1",
  tan: "#f8eed5",
  panel: "#ecd9b0",
  rail: "#e2cd9e",
  railActive: "#f5e6d3",
  border: "#5a3e2b",
  text: "#5a3e2b",
  muted: "#9a7a5a",
  orange: "#e8943b",
  orangeDark: "#d96b27",
  todo: "#a8855c",
  doing: "#e8943b",
  done: "#7a9b4e",
  high: "#c0492f",
  medium: "#c8880a",
  low: "#5a7a3a",
  overlay: "rgba(0,0,0,0.5)",
};

export const PRI_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  high: { bg: "#fde8e4", text: C.high, border: C.high },
  medium: { bg: "#fef5e0", text: C.medium, border: C.medium },
  low: { bg: "#edf5e8", text: C.low, border: C.low },
};

// Real @font-face fonts, declared in pages/_document.tsx. Any window requesting
// a bare 'Press Start 2P' or 'Cascadia Code' string renders in generic
// monospace instead — always go through these vars.
export const FONT_PIXEL = "var(--font-pixel)";
export const FONT_MONO = "var(--font-mono)";

export const pixel = (active = false): CSSProperties => ({
  fontFamily: FONT_PIXEL,
  background: active ? C.orange : C.panel,
  color: active ? "#fff" : C.text,
  border: `2px solid ${C.border}`,
  padding: "4px 10px",
  borderRadius: 0,
  cursor: "pointer",
  fontSize: 10,
  letterSpacing: "0.05em",
});

export const card: CSSProperties = {
  background: C.tan,
  border: `2px solid ${C.border}`,
  borderRadius: 0,
  padding: "8px 10px",
  marginBottom: 6,
  cursor: "grab",
};

export const inputStyle: CSSProperties = {
  background: C.tan,
  border: `2px solid ${C.border}`,
  borderRadius: 0,
  color: C.text,
  padding: "8px 12px",
  fontFamily: FONT_MONO,
  fontSize: 13,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

export const fieldLabel: CSSProperties = {
  fontFamily: FONT_PIXEL,
  fontSize: 9,
  color: C.muted,
  letterSpacing: "0.06em",
  display: "block",
  marginBottom: 3,
};

export const todayStr = () => new Date().toISOString().split("T")[0];
export const isOverdue = (due: string | null, status: string) =>
  due != null && status !== "done" && due < todayStr();
export const monthDay = (ds: string) =>
  new Date(ds + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
