import Head from "next/head";
import { useState, useEffect, useRef } from "react";
import { buildTaskFromParsed } from "@/lib/taskFromParsed";

const C = {
  cream: "#f4e4c1",
  panel: "#ecd9b0",
  border: "#5a3e2b",
  text: "#5a3e2b",
  muted: "#9a7a5a",
  orange: "#e8943b",
  medium: "#c8880a",
};

export default function CapturePage() {
  const [input, setInput] = useState("");
  const [parsing, setParsing] = useState(false);
  const [status, setStatus] = useState<"idle" | "ok" | "fallback">("idle");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-focus so paste works immediately after clicking Toasty
    inputRef.current?.focus();
  }, []);

  const handleAdd = async () => {
    const text = input.trim();
    if (!text) return;
    setParsing(true);
    setStatus("idle");
    let aiOk = false;
    try {
      const parsed = await window.toasty.parse(text);
      if (parsed.length > 0) {
        const now = new Date().toISOString();
        // Generate IDs relative to existing tasks
        const existingTasks = await window.toasty.listTasks();
        const max = existingTasks.reduce((m: number, t: any) => {
          const n = t.id.match(/^t(\d+)$/);
          return n ? Math.max(m, parseInt(n[1], 10)) : m;
        }, 0);
        const newTasks = parsed.map((t: any, i: number) =>
          buildTaskFromParsed(t, {
            id: `t${String(max + 1 + i).padStart(3, "0")}`,
            now,
            rawText: text,
          })
        );
        await Promise.all(newTasks.map((t: any) => window.toasty.saveTask(t)));
        aiOk = true;
      }
    } catch {
      // AI failed — fall through to plain add
    }
    if (!aiOk) {
      const now = new Date().toISOString();
      const existingTasks = await window.toasty.listTasks();
      const max = existingTasks.reduce((m: number, t: any) => {
        const n = t.id.match(/^t(\d+)$/);
        return n ? Math.max(m, parseInt(n[1], 10)) : m;
      }, 0);
      const id = `t${String(max + 1).padStart(3, "0")}`;
      await window.toasty.saveTask({
        id, title: text, subtasks: [], priority: "medium",
        startDate: null, dueDate: null, dueTime: null, category: "",
        status: "todo", createdAt: now, updatedAt: now, notes: "", links: [],
      } as any);
    }
    setStatus(aiOk ? "ok" : "fallback");
    setInput("");
    setParsing(false);
    // Auto-close after brief confirmation
    setTimeout(() => window.toasty.closeCapture(), 900);
  };

  return (
    <>
      <Head>
        <style>{`
          html, body, #__next {
            margin: 0; padding: 0; overflow: hidden;
            background: ${C.panel};
            font-family: 'JetBrains Mono', monospace;
            width: 380px; height: 52px;
          }
          * { box-sizing: border-box; }
        `}</style>
      </Head>

      <div style={{
        width: 380, height: 52,
        display: "flex", alignItems: "center",
        background: C.panel,
        border: `3px solid ${C.border}`,
        padding: "0 6px",
        gap: 0,
        boxSizing: "border-box",
        overflow: "hidden",
      }}>
        <span style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 8, color: C.muted, marginRight: 6, flexShrink: 0,
          userSelect: "none",
        }}>
          🐱
        </span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) handleAdd();
            if (e.key === "Escape") window.toasty.closeCapture();
          }}
          placeholder={
            parsing ? "parsing…" :
            status === "ok" ? "✓ added!" :
            status === "fallback" ? "⚠ added as plain task" :
            "paste or type a task…"
          }
          disabled={parsing}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: status === "fallback" ? C.medium : C.text,
            fontSize: 12,
            fontFamily: "'JetBrains Mono', monospace",
            padding: "0 4px",
          }}
        />
        <button
          onClick={handleAdd}
          disabled={parsing || !input.trim()}
          style={{
            background: parsing ? C.panel : C.orange,
            color: parsing ? C.muted : "#fff",
            border: `2px solid ${C.border}`,
            borderRadius: 0,
            padding: "2px 8px",
            fontSize: 9,
            cursor: "pointer",
            fontFamily: "'Press Start 2P', monospace",
            flexShrink: 0,
          }}
        >
          {parsing ? "…" : "ADD"}
        </button>
      </div>
    </>
  );
}
