import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "⚡ Task Parser",
  description: "AI-powered task organizer — paste messages, get structured tasks",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <style dangerouslySetInnerHTML={{ __html: `
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            background: #0e0e10;
            color: #e0e0e0;
            font-family: 'JetBrains Mono', 'Fira Code', monospace;
            min-height: 100vh;
          }
          ::-webkit-scrollbar { width: 6px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
          ::selection { background: rgba(83,240,120,0.2); }
          input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.6); }
        ` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
