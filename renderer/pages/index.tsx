// No window loads "/" any more — the widget (renderer/pages/widget.tsx) and
// menu (renderer/pages/menu.tsx) windows replaced the old full-window
// dashboard as of Phase 3. This page is a harmless fallback for anyone who
// navigates here directly in dev.
export default function Home() {
  return (
    <div style={{ padding: 24, fontFamily: "var(--font-mono)" }}>
      Toasty runs from the tray — see the widget or right-click the tray icon.
    </div>
  );
}
