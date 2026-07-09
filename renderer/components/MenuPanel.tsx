import { useEffect, useRef, useState } from "react";
import type { Task } from "@/types/task";
import { buildTaskFromParsed } from "@/lib/taskFromParsed";

/**
 * The comnyang-style side menu — a thin left rail of sections + a content area,
 * docked beside Toasty. Lives inside the pet window (see pet.tsx) so it drags
 * with the cat for free. `SECTIONS` is the extensibility point: add an entry
 * here to add a new menu; no other scaffolding changes needed.
 */

const C = {
  panel: "#ecd9b0",
  rail: "#e2cd9e",
  railActive: "#f5e6d3",
  border: "#5a3e2b",
  text: "#5a3e2b",
  muted: "#9a7a5a",
  orange: "#e8943b",
};

const FONT = "'Cascadia Code', Consolas, ui-monospace, monospace";

type SectionId = "tasks" | "capture" | "chat" | "settings";

const SECTIONS: { id: SectionId; label: string; icon: string; Component: React.ComponentType }[] = [
  { id: "tasks", label: "Tasks", icon: "☑", Component: TasksSection },
  { id: "capture", label: "Add", icon: "+", Component: CaptureSection },
  { id: "chat", label: "Chat", icon: "💬", Component: ChatSection },
  { id: "settings", label: "Set", icon: "⚙", Component: SettingsSection },
];

function deriveIds(existing: Task[], count: number): string[] {
  const max = existing.reduce((m, t) => {
    const n = t.id.match(/^t(\d+)$/);
    return n ? Math.max(m, parseInt(n[1], 10)) : m;
  }, 0);
  return Array.from({ length: count }, (_, i) => `t${String(max + 1 + i).padStart(3, "0")}`);
}

export default function MenuPanel() {
  const [activeId, setActiveId] = useState<SectionId>("tasks");
  const active = SECTIONS.find((s) => s.id === activeId) ?? SECTIONS[0];
  const Active = active.Component;

  return (
    <div
      data-menu-hit="1"
      style={{
        display: "flex",
        width: 248,
        height: 208,
        background: C.panel,
        border: `2px solid ${C.border}`,
        fontFamily: FONT,
        color: C.text,
        boxSizing: "border-box",
        overflow: "hidden",
        WebkitAppRegion: "no-drag",
      } as React.CSSProperties}
    >
      {/* left rail */}
      <div style={{ display: "flex", flexDirection: "column", width: 40, background: C.rail, borderRight: `2px solid ${C.border}`, flexShrink: 0 }}>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveId(s.id)}
            title={s.label}
            style={{
              background: s.id === activeId ? C.railActive : "transparent",
              border: "none",
              borderBottom: `1px solid ${C.border}22`,
              padding: "8px 0",
              cursor: "pointer",
              fontSize: 13,
              color: C.text,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
            }}
          >
            <span style={{ fontSize: 13 }}>{s.icon}</span>
            <span style={{ fontSize: 7, letterSpacing: "0.02em" }}>{s.label}</span>
          </button>
        ))}
      </div>

      {/* content */}
      <div style={{ flex: 1, minWidth: 0, padding: 8, overflow: "auto" }}>
        <Active />
      </div>
    </div>
  );
}

// ── Tasks: read + click-to-advance ───────────────────────────────────────
function TasksSection() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [subTab, setSubTab] = useState<Task["status"]>("todo");
  const [loading, setLoading] = useState(true);

  const load = () => {
    window.toasty.listTasks().then((t) => { setTasks(t as Task[]); setLoading(false); });
  };
  useEffect(() => { load(); }, []);

  const advance = async (t: Task) => {
    const next: Task["status"] = t.status === "todo" ? "in_progress" : t.status === "in_progress" ? "done" : "todo";
    const updated = { ...t, status: next, updatedAt: new Date().toISOString() };
    setTasks((prev) => prev.map((x) => (x.id === t.id ? updated : x))); // optimistic
    await window.toasty.saveTask(updated as any);
  };

  const TABS: { id: Task["status"]; label: string }[] = [
    { id: "todo", label: "to do" },
    { id: "in_progress", label: "on progress" },
    { id: "done", label: "done" },
  ];
  const counts = TABS.reduce((acc, t) => {
    acc[t.id] = tasks.filter((x) => x.status === t.id).length;
    return acc;
  }, {} as Record<Task["status"], number>);
  const shown = tasks.filter((t) => t.status === subTab);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 6, flexShrink: 0 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            style={{
              flex: 1,
              fontSize: 8,
              padding: "3px 2px",
              background: subTab === t.id ? C.orange : "transparent",
              color: subTab === t.id ? "#fff" : C.muted,
              border: `1px solid ${C.border}`,
              cursor: "pointer",
              fontFamily: FONT,
            }}
          >
            {t.label} ({counts[t.id]})
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        {loading ? (
          <div style={{ fontSize: 10, color: C.muted }}>loading…</div>
        ) : shown.length === 0 ? (
          <div style={{ fontSize: 10, color: C.muted }}>nothing here</div>
        ) : (
          shown.map((t) => (
            <div
              key={t.id}
              onClick={() => advance(t)}
              title="Click to advance status"
              style={{
                fontSize: 10,
                padding: "4px 5px",
                marginBottom: 3,
                background: "#fff8ea",
                border: `1px solid ${C.border}55`,
                cursor: "pointer",
                textDecoration: t.status === "done" ? "line-through" : "none",
                opacity: t.status === "done" ? 0.65 : 1,
              }}
            >
              {t.title}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Quick-capture: mirrors capture.tsx's parse→save flow, inline ─────────
function CaptureSection() {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"idle" | "ok" | "fallback">("idle");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = async () => {
    const text = input.trim();
    if (!text) return;
    setBusy(true);
    setStatus("idle");
    let aiOk = false;
    try {
      const parsed = await window.toasty.parse(text);
      if (parsed.length > 0) {
        const now = new Date().toISOString();
        const existing = await window.toasty.listTasks();
        const ids = deriveIds(existing as Task[], parsed.length);
        const newTasks = parsed.map((t: any, i: number) =>
          buildTaskFromParsed(t, { id: ids[i], now, rawText: text })
        );
        await Promise.all(newTasks.map((t) => window.toasty.saveTask(t)));
        aiOk = true;
      }
    } catch {
      // AI failed — fall through to plain add
    }
    if (!aiOk) {
      const now = new Date().toISOString();
      const existing = await window.toasty.listTasks();
      const [id] = deriveIds(existing as Task[], 1);
      await window.toasty.saveTask({
        id, title: text, subtasks: [], priority: "medium",
        startDate: null, dueDate: null, dueTime: null, category: "",
        status: "todo", createdAt: now, updatedAt: now, notes: "", links: [],
      } as any);
    }
    setStatus(aiOk ? "ok" : "fallback");
    setInput("");
    setBusy(false);
    inputRef.current?.focus();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
        placeholder={busy ? "parsing…" : status === "ok" ? "✓ added!" : status === "fallback" ? "⚠ added as plain task" : "type a task…"}
        disabled={busy}
        style={{
          width: "100%",
          fontSize: 10,
          fontFamily: FONT,
          padding: "5px 6px",
          border: `1px solid ${C.border}`,
          background: "#fff8ea",
          color: C.text,
          boxSizing: "border-box",
        }}
      />
      <button
        onClick={handleAdd}
        disabled={busy || !input.trim()}
        style={{
          fontSize: 9,
          padding: "4px 0",
          background: busy ? C.panel : C.orange,
          color: busy ? C.muted : "#fff",
          border: `1px solid ${C.border}`,
          cursor: "pointer",
          fontFamily: FONT,
        }}
      >
        {busy ? "…" : "ADD"}
      </button>
    </div>
  );
}

// ── Chat: entry point to the existing chat window ─────────────────────────
function ChatSection() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 10, color: C.muted }}>
      <span>Chat with Toasty in its own window.</span>
      <button
        onClick={() => window.toasty.openChat()}
        style={{
          fontSize: 9,
          padding: "5px 0",
          background: C.orange,
          color: "#fff",
          border: `1px solid ${C.border}`,
          cursor: "pointer",
          fontFamily: FONT,
        }}
      >
        OPEN CHAT →
      </button>
    </div>
  );
}

// ── Settings: compact subset; deep settings stay in the dashboard ────────
function SettingsSection() {
  const [opacity, setOpacityState] = useState(1);
  const [autoLaunch, setAutoLaunch] = useState(false);

  useEffect(() => {
    window.toasty.getSettings().then((s) => {
      setOpacityState(s.opacity ?? 1);
      setAutoLaunch(s.openAtLogin ?? false);
    });
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 10 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        opacity ({Math.round(opacity * 100)}%)
        <input
          type="range"
          min={0.3}
          max={1}
          step={0.05}
          value={opacity}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            setOpacityState(v);
            window.toasty.setOpacity(v);
          }}
        />
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input
          type="checkbox"
          checked={autoLaunch}
          onChange={(e) => {
            const v = e.target.checked;
            setAutoLaunch(v);
            window.toasty.setAutoLaunch(v);
          }}
        />
        start on login
      </label>
    </div>
  );
}
