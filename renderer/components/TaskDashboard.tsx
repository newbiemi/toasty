import { useState, useEffect, useRef } from "react";
import type { Task, Subtask } from "@/types/task";
import Cat from "./Cat";
import { buildTaskFromParsed, safeDate } from "@/lib/taskFromParsed";

// ─── Palette ─────────────────────────────────
const C = {
  cream: "#f4e4c1",
  tan: "#f8eed5",
  panel: "#ecd9b0",
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

const STATUS_COLS: { key: Task["status"]; label: string; color: string }[] = [
  { key: "todo",        label: "TO DO",       color: C.todo },
  { key: "in_progress", label: "IN PROGRESS", color: C.doing },
  { key: "done",        label: "DONE",        color: C.done },
];

const PRI_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  high:   { bg: "#fde8e4", text: C.high,   border: C.high },
  medium: { bg: "#fef5e0", text: C.medium, border: C.medium },
  low:    { bg: "#edf5e8", text: C.low,    border: C.low },
};

const monthDay = (ds: string) =>
  new Date(ds + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

const todayStr = () => new Date().toISOString().split("T")[0];
const isOverdue = (due: string | null, status: string) =>
  due != null && status !== "done" && due < todayStr();


function nextIds(tasks: Task[], count: number): string[] {
  const max = tasks.reduce((m, t) => {
    const n = t.id.match(/^t(\d+)$/);
    return n ? Math.max(m, parseInt(n[1], 10)) : m;
  }, 0);
  return Array.from({ length: count }, (_, i) => `t${String(max + 1 + i).padStart(3, "0")}`);
}
function nextId(tasks: Task[]): string {
  return nextIds(tasks, 1)[0];
}

// ─── Styles ──────────────────────────────────
const pixel = (active = false): React.CSSProperties => ({
  fontFamily: "var(--font-pixel)",
  background: active ? C.orange : C.panel,
  color: active ? "#fff" : C.text,
  border: `2px solid ${C.border}`,
  padding: "4px 10px",
  borderRadius: 0,
  cursor: "pointer",
  fontSize: 10,
  letterSpacing: "0.05em",
});

const card: React.CSSProperties = {
  background: C.tan,
  border: `2px solid ${C.border}`,
  borderRadius: 0,
  padding: "8px 10px",
  marginBottom: 6,
  cursor: "grab",
};

const inputStyle: React.CSSProperties = {
  background: C.tan,
  border: `2px solid ${C.border}`,
  borderRadius: 0,
  color: C.text,
  padding: "8px 12px",
  fontFamily: "var(--font-mono)",
  fontSize: 13,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const fieldLabel: React.CSSProperties = {
  fontFamily: "var(--font-pixel)",
  fontSize: 9,
  color: C.muted,
  letterSpacing: "0.06em",
  display: "block",
  marginBottom: 3,
};

// ─── Kanban Card ─────────────────────────────
function KanbanCard({
  task,
  onDelete,
  onClick,
}: {
  task: Task;
  onDelete: () => void;
  onClick: () => void;
}) {
  const overdue = isOverdue(task.dueDate, task.status);
  const pc = PRI_COLORS[task.priority] ?? PRI_COLORS.medium;
  const subs = task.subtasks ?? [];
  const doneSubs = subs.filter((s) => s.done).length;

  return (
    <div
      draggable
      onClick={onClick}
      style={{
        ...card,
        borderLeft: `4px solid ${overdue ? C.high : pc.border}`,
        opacity: task.status === "done" ? 0.65 : 1,
      }}
      data-task-id={task.id}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
        <div style={{
          fontSize: 12, fontFamily: "var(--font-mono)", color: overdue ? C.high : C.text,
          fontWeight: 600, flex: 1, lineHeight: 1.4,
          textDecoration: task.status === "done" ? "line-through" : "none",
        }}>
          {task.title}
          {overdue && (
            <span style={{ marginLeft: 6, fontSize: 9, color: C.high, fontFamily: "var(--font-pixel)" }}>
              OVERDUE
            </span>
          )}
        </div>
        <span
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          style={{ color: C.muted, cursor: "pointer", fontSize: 11, flexShrink: 0, lineHeight: 1 }}
        >
          ✕
        </span>
      </div>

      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6, alignItems: "center" }}>
        <span style={{
          fontSize: 9, fontFamily: "var(--font-pixel)",
          background: pc.bg, color: pc.text,
          border: `1px solid ${pc.border}`, padding: "1px 5px",
        }}>
          {task.priority.toUpperCase()}
        </span>
        {task.category && (
          <span style={{ fontSize: 9, color: C.muted, fontFamily: "var(--font-pixel)" }}>
            {task.category}
          </span>
        )}
        {task.dueDate && (
          <span style={{ fontSize: 9, color: overdue ? C.high : C.muted, fontFamily: "var(--font-pixel)" }}>
            {monthDay(task.dueDate)}{task.dueTime ? ` ${task.dueTime}` : ""}
          </span>
        )}
        {task.startDate && !task.dueDate && (
          <span style={{ fontSize: 9, color: C.muted, fontFamily: "var(--font-pixel)" }}>
            from {monthDay(task.startDate)}
          </span>
        )}
        {task.notes && (
          <span style={{ fontSize: 9, color: C.muted, fontFamily: "var(--font-pixel)" }} title={task.notes}>
            📝
          </span>
        )}
        {(task.links ?? []).length > 0 && (
          <span style={{ fontSize: 9, color: C.muted, fontFamily: "var(--font-pixel)" }}>
            🔗{task.links.length}
          </span>
        )}
        {subs.length > 0 && (
          <span style={{ fontSize: 9, color: C.muted, fontFamily: "var(--font-pixel)", marginLeft: "auto" }}>
            {doneSubs}/{subs.length}✓
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Edit Modal ───────────────────────────────
function TaskModal({
  task,
  onSave,
  onClose,
}: {
  task: Task;
  onSave: (t: Task) => Promise<void>;
  onClose: () => void;
}) {
  const [t, setT] = useState<Task>({ ...task });
  const [adjustText, setAdjustText] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [newLink, setNewLink] = useState("");
  const [newSubtask, setNewSubtask] = useState("");

  const set = (patch: Partial<Task>) => setT((prev) => ({ ...prev, ...patch }));

  const mergeAdjusted = (prev: Task, patch: any): Task => {
    // Normalize subtasks: model may return string[] even though we ask for {text,done}[]
    const rawSubs = patch.subtasks;
    const subtasks: Subtask[] = Array.isArray(rawSubs)
      ? rawSubs.map((s: any) => typeof s === "string" ? { text: s, done: false } : s)
      : prev.subtasks;
    return {
      ...prev, ...patch,
      id: prev.id, createdAt: prev.createdAt,
      updatedAt: new Date().toISOString(),
      subtasks,
      dueDate: safeDate(patch.dueDate ?? prev.dueDate),
      startDate: safeDate(patch.startDate ?? prev.startDate),
      dueTime: patch.dueTime ?? prev.dueTime ?? null,
    };
  };

  const handleAdjust = async () => {
    if (!adjustText.trim()) return;
    setAdjusting(true);
    try {
      const result = await window.toasty.adjust(JSON.stringify(t), adjustText.trim());
      if (Array.isArray(result) && result.length > 0) {
        setT((prev) => mergeAdjusted(prev, result[0]));
      } else if (result && typeof result === "object") {
        setT((prev) => mergeAdjusted(prev, result));
      }
      setAdjustText("");
    } catch {
      // silently ignore — modal stays open
    } finally {
      setAdjusting(false);
    }
  };

  const addLink = () => {
    const l = newLink.trim();
    if (!l) return;
    set({ links: [...(t.links ?? []), l] });
    setNewLink("");
  };

  const addSubtask = () => {
    const s = newSubtask.trim();
    if (!s) return;
    set({ subtasks: [...(t.subtasks ?? []), { text: s, done: false }] });
    setNewSubtask("");
  };

  const toggleSubtask = (i: number) => {
    const next = (t.subtasks ?? []).map((s, idx) => idx === i ? { ...s, done: !s.done } : s);
    set({ subtasks: next });
  };

  const removeSubtask = (i: number) => {
    set({ subtasks: (t.subtasks ?? []).filter((_, idx) => idx !== i) });
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: C.overlay,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.cream, border: `3px solid ${C.border}`,
          width: 520, maxHeight: "88vh", overflowY: "auto",
          padding: 20, boxSizing: "border-box",
          display: "flex", flexDirection: "column", gap: 12,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: "var(--font-pixel)", fontSize: 11, color: C.text, letterSpacing: "0.06em" }}>
            EDIT TASK
          </span>
          <span onClick={onClose} style={{ cursor: "pointer", color: C.muted, fontSize: 13 }}>✕</span>
        </div>

        {/* Title */}
        <div>
          <label style={fieldLabel}>TITLE</label>
          <input
            value={t.title}
            onChange={(e) => set({ title: e.target.value })}
            style={{ ...inputStyle, fontSize: 13 }}
          />
        </div>

        {/* Priority + Status + Category — row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <div>
            <label style={fieldLabel}>PRIORITY</label>
            <select
              value={t.priority}
              onChange={(e) => set({ priority: e.target.value as Task["priority"] })}
              style={{ ...inputStyle, fontSize: 11 }}
            >
              <option value="high">HIGH</option>
              <option value="medium">MEDIUM</option>
              <option value="low">LOW</option>
            </select>
          </div>
          <div>
            <label style={fieldLabel}>STATUS</label>
            <select
              value={t.status}
              onChange={(e) => set({ status: e.target.value as Task["status"] })}
              style={{ ...inputStyle, fontSize: 11 }}
            >
              <option value="todo">TO DO</option>
              <option value="in_progress">IN PROGRESS</option>
              <option value="done">DONE</option>
            </select>
          </div>
          <div>
            <label style={fieldLabel}>CATEGORY</label>
            <input
              value={t.category ?? ""}
              onChange={(e) => set({ category: e.target.value })}
              style={{ ...inputStyle, fontSize: 11 }}
            />
          </div>
        </div>

        {/* Dates — row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <div>
            <label style={fieldLabel}>START DATE</label>
            <input
              type="date"
              value={t.startDate ?? ""}
              onChange={(e) => set({ startDate: e.target.value || null })}
              style={{ ...inputStyle, fontSize: 11 }}
            />
          </div>
          <div>
            <label style={fieldLabel}>DUE DATE</label>
            <input
              type="date"
              value={t.dueDate ?? ""}
              onChange={(e) => set({ dueDate: e.target.value || null })}
              style={{ ...inputStyle, fontSize: 11 }}
            />
          </div>
          <div>
            <label style={fieldLabel}>DUE TIME</label>
            <input
              type="time"
              value={t.dueTime ?? ""}
              onChange={(e) => set({ dueTime: e.target.value || null })}
              disabled={!t.dueDate}
              style={{ ...inputStyle, fontSize: 11, opacity: t.dueDate ? 1 : 0.4 }}
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label style={fieldLabel}>NOTES</label>
          <textarea
            value={t.notes ?? ""}
            onChange={(e) => set({ notes: e.target.value })}
            rows={3}
            style={{ ...inputStyle, fontSize: 12, resize: "vertical", minHeight: 56 }}
          />
        </div>

        {/* Links */}
        <div>
          <label style={fieldLabel}>LINKS</label>
          {(t.links ?? []).map((link, i) => (
            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 4, alignItems: "center" }}>
              <span style={{ flex: 1, fontSize: 11, fontFamily: "var(--font-mono)", color: C.muted,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {link}
              </span>
              <span onClick={() => set({ links: (t.links ?? []).filter((_, j) => j !== i) })}
                style={{ cursor: "pointer", color: C.muted, fontSize: 10, flexShrink: 0 }}>✕</span>
            </div>
          ))}
          <div style={{ display: "flex", gap: 0, marginTop: 4 }}>
            <input
              value={newLink}
              onChange={(e) => setNewLink(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addLink()}
              placeholder="https://..."
              style={{ ...inputStyle, fontSize: 11, borderRight: "none" }}
            />
            <button onClick={addLink} style={{ ...pixel(), borderLeft: "none", fontSize: 9, padding: "4px 10px" }}>
              + ADD
            </button>
          </div>
        </div>

        {/* Subtasks */}
        <div>
          <label style={fieldLabel}>SUBTASKS</label>
          {(t.subtasks ?? []).map((sub, i) => (
            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 4, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={sub.done}
                onChange={() => toggleSubtask(i)}
                style={{ accentColor: C.orange, cursor: "pointer" }}
              />
              <span style={{ flex: 1, fontSize: 11, fontFamily: "var(--font-mono)", color: sub.done ? C.muted : C.text,
                textDecoration: sub.done ? "line-through" : "none" }}>
                {sub.text}
              </span>
              <span onClick={() => removeSubtask(i)}
                style={{ cursor: "pointer", color: C.muted, fontSize: 10, flexShrink: 0 }}>✕</span>
            </div>
          ))}
          <div style={{ display: "flex", gap: 0, marginTop: 4 }}>
            <input
              value={newSubtask}
              onChange={(e) => setNewSubtask(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addSubtask()}
              placeholder="Add subtask…"
              style={{ ...inputStyle, fontSize: 11, borderRight: "none" }}
            />
            <button onClick={addSubtask} style={{ ...pixel(), borderLeft: "none", fontSize: 9, padding: "4px 10px" }}>
              + ADD
            </button>
          </div>
        </div>

        {/* AI Adjust */}
        <div>
          <label style={fieldLabel}>ASK AI TO ADJUST</label>
          <div style={{ display: "flex", gap: 0 }}>
            <input
              value={adjustText}
              onChange={(e) => setAdjustText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleAdjust()}
              placeholder={adjusting ? "Adjusting…" : "e.g. move due date to next Friday"}
              disabled={adjusting}
              style={{ ...inputStyle, fontSize: 11, borderRight: "none" }}
            />
            <button
              onClick={handleAdjust}
              disabled={adjusting || !adjustText.trim()}
              style={{
                ...pixel(true), borderLeft: "none", fontSize: 9, padding: "4px 10px",
                background: adjusting ? C.panel : C.orange,
                color: adjusting ? C.muted : "#fff",
              }}
            >
              {adjusting ? "..." : "GO"}
            </button>
          </div>
        </div>

        {/* Save / Cancel */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <button onClick={onClose} style={{ ...pixel(), fontSize: 10 }}>
            CANCEL
          </button>
          <button
            onClick={async () => {
              await onSave({ ...t, updatedAt: new Date().toISOString() });
              onClose();
            }}
            style={{ ...pixel(true), fontSize: 10 }}
          >
            SAVE
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────
export default function TaskDashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catState, setCatState] = useState("idle");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<Task["status"] | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [ollamaStatus, setOllamaStatus] = useState<"running" | "offline" | "checking">("checking");
  const [opacity, setOpacityState] = useState(1.0);
  const [openAtLogin, setOpenAtLogin] = useState(false);
  const [skipTaskbar, setSkipTaskbarState] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [reminderTasks, setReminderTasks] = useState<any[]>([]);
  const [model, setModel] = useState("llama3.2:3b");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [appVersion, setAppVersion] = useState("");
  const [groqApiKey, setGroqApiKey] = useState("");
  const [groqKeyDraft, setGroqKeyDraft] = useState("");

  useEffect(() => {
    window.toasty.listTasks().then((t) => { setTasks(t); setLoaded(true); });
    const unsubCat = window.toasty.onCatState((s) => setCatState(s));
    const unsubOllama = window.toasty.onOllamaStatus((s) => setOllamaStatus(s));
    const unsubReminder = window.toasty.onReminder((due) => {
      setReminderTasks(due);
      // Auto-dismiss banner after 5 min
      setTimeout(() => setReminderTasks([]), 5 * 60_000);
    });
    window.toasty.getSettings().then((s) => {
      setOpacityState(s.opacity ?? 1.0);
      setOpenAtLogin(s.openAtLogin ?? false);
      setSkipTaskbarState(s.skipTaskbar ?? false);
      setModel(s.model ?? "llama3.2:3b");
      const key = s.groqApiKey ?? "";
      setGroqApiKey(key);
      setGroqKeyDraft(key);
    });
    // Populate model datalist from Ollama
    window.toasty.listModels().then(setAvailableModels);
    window.toasty.getVersion().then(setAppVersion);
    // Initial check — main process pushes after 2s but do an eager one too
    window.toasty.checkOllama().then((s) => setOllamaStatus(s));
    return () => { unsubCat(); unsubOllama(); unsubReminder(); };
  }, []);

  // ── Add / parse ──────────────────────────────
  const handleAdd = async () => {
    const text = input.trim();
    if (!text) return;
    setParsing(true); setError(null);
    let aiOk = false;
    try {
      const parsed = await window.toasty.parse(text);
      if (parsed.length > 0) {
        const now = new Date().toISOString();
        const ids = nextIds(tasks, parsed.length);
        const newTasks: Task[] = parsed.map((t: any, i: number) =>
          buildTaskFromParsed(t, { id: ids[i], now, rawText: text })
        );
        await Promise.all(newTasks.map((t) => window.toasty.saveTask(t)));
        setTasks((prev) => [...newTasks, ...prev]);
        setInput("");
        aiOk = true;
      }
    } catch {
      // AI failed — fall through to manual add
    }
    if (!aiOk) {
      // Plain manual add + visible feedback
      const now = new Date().toISOString();
      const id = nextId(tasks);
      const t: Task = {
        id, title: text, subtasks: [], priority: "medium",
        startDate: null, dueDate: null, dueTime: null, category: "",
        status: "todo", createdAt: now, updatedAt: now, notes: text, links: [],
      };
      await window.toasty.saveTask(t);
      setTasks((prev) => [t, ...prev]);
      setInput("");
      setError("AI parse failed — added as plain task");
      setTimeout(() => setError(null), 4000);
    }
    setParsing(false);
  };

  // ── Update / delete ──────────────────────────
  const updateTask = async (u: Task) => {
    setTasks((prev) => prev.map((t) => (t.id === u.id ? u : t)));
    await window.toasty.saveTask(u);
  };
  const deleteTask = async (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await window.toasty.deleteTask(id);
  };
  const clearDone = async () => {
    setTasks((prev) => prev.filter((t) => t.status !== "done"));
    await window.toasty.clearDone();
  };

  // ── Opacity ──────────────────────────────────
  const handleOpacity = (v: number) => {
    setOpacityState(v);
    window.toasty.setOpacity(v);
  };

  // ── Auto-launch toggle ───────────────────────
  const handleAutoLaunch = async (v: boolean) => {
    setOpenAtLogin(v);
    await window.toasty.setAutoLaunch(v);
  };

  // ── Skip taskbar toggle ──────────────────────
  const handleSkipTaskbar = async (v: boolean) => {
    setSkipTaskbarState(v);
    await window.toasty.setSkipTaskbar(v);
  };

  // ── Drag & drop between columns ──────────────
  const onDragStart = (id: string) => setDragId(id);
  const onDragEnd = () => { setDragId(null); setDropTarget(null); };
  const onColumnDragOver = (e: React.DragEvent, status: Task["status"]) => {
    e.preventDefault();
    setDropTarget(status);
  };
  const onColumnDrop = (e: React.DragEvent, status: Task["status"]) => {
    e.preventDefault();
    if (!dragId) return;
    const task = tasks.find((t) => t.id === dragId);
    if (task && task.status !== status) updateTask({ ...task, status });
    setDragId(null); setDropTarget(null);
  };

  const counts = {
    todo:        tasks.filter((t) => t.status === "todo").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    done:        tasks.filter((t) => t.status === "done").length,
  };

  return (
    <div style={{ minHeight: "100vh", background: C.cream, color: C.text, fontFamily: "var(--font-mono)" }}>

      {/* ── Custom drag bar (replaces OS title bar) ── */}
      <div
        style={{
          display: "flex", alignItems: "center", gap: 10, padding: "6px 14px",
          background: C.panel, borderBottom: `3px solid ${C.border}`,
          WebkitAppRegion: "drag",
        } as React.CSSProperties}
      >
        {/* Left: cat + title + counts + Ollama status — no-drag so cat is still clickable */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          <Cat state={catState} size={40} style={{ flexShrink: 0 }} />
          <span style={{ fontFamily: "var(--font-pixel)", fontSize: 16, fontWeight: 700, color: C.text, letterSpacing: "0.06em" }}>
            TOASTY
          </span>
          <span style={{ fontFamily: "var(--font-pixel)", fontSize: 9, color: C.muted, marginLeft: 2 }}>
            {counts.todo} todo · {counts.in_progress} doing · {counts.done} done
          </span>
          {/* AI status indicator — Groq if key is set, else Ollama (chat fallback) */}
          {groqApiKey ? (
            <span
              title="Groq AI active — task parse & chat via cloud"
              style={{
                display: "inline-flex", alignItems: "center", gap: 3,
                fontFamily: "var(--font-pixel)", fontSize: 8,
                color: C.done,
                border: `1px solid ${C.done}`,
                padding: "1px 5px", marginLeft: 4,
              }}
            >
              <span style={{ width: 5, height: 5, borderRadius: "50%", flexShrink: 0, background: C.done }} />
              GROQ
            </span>
          ) : (
            <span
              title={`Ollama (chat fallback): ${ollamaStatus}`}
              style={{
                display: "inline-flex", alignItems: "center", gap: 3,
                fontFamily: "var(--font-pixel)", fontSize: 8,
                color: ollamaStatus === "running" ? C.medium : C.muted,
                border: `1px solid ${ollamaStatus === "running" ? C.medium : C.muted}`,
                padding: "1px 5px", marginLeft: 4,
              }}
            >
              <span style={{
                width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
                background: ollamaStatus === "running" ? C.medium : C.muted,
              }} />
              {ollamaStatus === "running" ? "OLLAMA" : "NO AI"}
            </span>
          )}
        </div>

        {/* Right: controls — no-drag */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          {/* Opacity note: setOpacity dims our own UI too — this is a find-the-sweet-spot slider */}
          <span style={{ fontFamily: "var(--font-pixel)", fontSize: 8, color: C.muted }}>OPACITY</span>
          <input
            type="range" min="0.2" max="1" step="0.05"
            value={opacity}
            onChange={(e) => handleOpacity(parseFloat(e.target.value))}
            style={{ width: 64, cursor: "pointer", accentColor: C.orange }}
          />
          <button
            onClick={() => window.toasty.toggleMode()}
            style={{ ...pixel(), fontSize: 8 }}
          >
            PET
          </button>
          <button
            onClick={() => setShowSettings((v) => !v)}
            style={{ ...pixel(showSettings), fontSize: 8 }}
          >
            ⚙
          </button>
          <button
            onClick={() => window.toasty.minimize()}
            style={{ ...pixel(), fontSize: 9, padding: "4px 8px" }}
            title="Minimize"
          >
            —
          </button>
          <button
            onClick={() => window.toasty.closeWindow()}
            style={{ ...pixel(), fontSize: 9, padding: "4px 8px", color: C.high }}
            title="Hide to tray"
          >
            ✕
          </button>
        </div>
      </div>

      {/* ── Settings panel (inline dropdown) ── */}
      {showSettings && (
        <div style={{
          background: C.panel, borderBottom: `2px solid ${C.border}`,
          padding: "8px 18px", display: "flex", gap: 16, alignItems: "center",
          fontFamily: "var(--font-pixel)", fontSize: 9,
        }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={openAtLogin}
              onChange={(e) => handleAutoLaunch(e.target.checked)}
              style={{ accentColor: C.orange }}
            />
            <span style={{ color: C.text }}>START ON LOGIN</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={skipTaskbar}
              onChange={(e) => handleSkipTaskbar(e.target.checked)}
              style={{ accentColor: C.orange }}
            />
            <span style={{ color: C.text }}>HIDE FROM TASKBAR</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: C.text }}>MODEL</span>
            <input
              list="ollama-models"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              onBlur={() => { if (model.trim()) window.toasty.setSettings({ model: model.trim() }); }}
              placeholder="llama3.2:1b"
              style={{
                fontFamily: "var(--font-pixel)", fontSize: 8,
                background: C.tan, border: `1px solid ${C.border}`,
                color: C.text, padding: "2px 6px", width: 140,
              }}
            />
            <datalist id="ollama-models">
              {availableModels.map((m) => <option key={m} value={m} />)}
            </datalist>
          </label>
          {/* ── Groq API key ── */}
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: C.text }}>GROQ KEY</span>
            <input
              type="password"
              value={groqKeyDraft}
              onChange={(e) => setGroqKeyDraft(e.target.value)}
              onBlur={() => {
                const trimmed = groqKeyDraft.trim();
                setGroqApiKey(trimmed);
                window.toasty.setSettings({ groqApiKey: trimmed });
              }}
              placeholder="gsk_…"
              style={{
                fontFamily: "var(--font-pixel)", fontSize: 8,
                background: C.tan, border: `1px solid ${C.border}`,
                color: C.text, padding: "2px 6px", width: 160,
              }}
            />
            <span style={{
              color: groqApiKey ? C.done : C.muted,
              fontSize: 8,
            }}>
              {groqApiKey ? "✓ active" : "not set — using rules"}
            </span>
          </label>
          <span style={{ color: C.muted }}>
            (opacity slider dims Toasty too — find a sweet spot)
          </span>
          {appVersion && (
            <span style={{ color: C.muted, marginLeft: "auto" }}>
              v{appVersion}
            </span>
          )}
        </div>
      )}

      {/* ── Reminder banner ── */}
      {reminderTasks.length > 0 && (
        <div style={{
          background: C.high, color: "#fff",
          padding: "6px 18px", display: "flex", alignItems: "center", justifyContent: "space-between",
          fontFamily: "var(--font-pixel)", fontSize: 9, letterSpacing: "0.04em",
        }}>
          <span>⏰ DUE NOW: {reminderTasks.map((t: any) => t.title).join(", ")}</span>
          <span onClick={() => setReminderTasks([])} style={{ cursor: "pointer", marginLeft: 12 }}>✕</span>
        </div>
      )}

      <div style={{ padding: "14px 18px" }}>
        {/* ── Add bar ── */}
        <div style={{ display: "flex", gap: 0, marginBottom: 14 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleAdd()}
            placeholder={parsing ? "Parsing…" : "Add a task — press Enter (AI parses it)"}
            disabled={parsing}
            style={{ ...inputStyle, borderRight: "none" }}
          />
          <button
            onClick={handleAdd}
            disabled={parsing || !input.trim()}
            style={{
              ...pixel(true),
              background: parsing ? C.panel : C.orange,
              color: parsing ? C.muted : "#fff",
              padding: "8px 16px", fontSize: 11,
              border: `2px solid ${C.border}`,
            }}
          >
            {parsing ? "..." : "+ ADD"}
          </button>
        </div>
        {error && (
          <div style={{ fontSize: 10, color: C.medium, marginBottom: 8, fontFamily: "var(--font-pixel)" }}>
            ⚠ {error}
          </div>
        )}

        {/* ── Kanban columns ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, alignItems: "start" }}>
          {STATUS_COLS.map(({ key, label, color }) => {
            const col = tasks.filter((t) => t.status === key);
            const isTarget = dropTarget === key;
            return (
              <div
                key={key}
                onDragOver={(e) => onColumnDragOver(e, key)}
                onDragLeave={() => setDropTarget(null)}
                onDrop={(e) => onColumnDrop(e, key)}
                style={{
                  background: isTarget ? C.panel : "transparent",
                  border: isTarget ? `2px dashed ${C.border}` : "2px dashed transparent",
                  minHeight: 120, padding: isTarget ? 6 : 0,
                  transition: "all 0.1s",
                }}
              >
                {/* Column header */}
                <div style={{
                  fontFamily: "var(--font-pixel)", fontSize: 10, fontWeight: 700,
                  color, letterSpacing: "0.06em",
                  borderBottom: `3px solid ${color}`,
                  padding: "4px 0 6px",
                  marginBottom: 8,
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <span>{label}</span>
                  <span style={{ opacity: 0.5, fontWeight: 400 }}>{col.length}</span>
                </div>

                {/* Cards */}
                {col.map((task) => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={() => onDragStart(task.id)}
                    onDragEnd={onDragEnd}
                    style={{ opacity: dragId === task.id ? 0.4 : 1, transition: "opacity 0.1s" }}
                  >
                    <KanbanCard
                      task={task}
                      onDelete={() => deleteTask(task.id)}
                      onClick={() => setEditingTask(task)}
                    />
                  </div>
                ))}

                {col.length === 0 && !isTarget && (
                  <div style={{
                    fontSize: 10, color: C.muted, textAlign: "center",
                    padding: "20px 0", fontFamily: "var(--font-pixel)",
                  }}>
                    empty
                  </div>
                )}

                {key === "done" && col.length > 0 && (
                  <button onClick={clearDone} style={{ ...pixel(), fontSize: 9, marginTop: 6, width: "100%" }}>
                    CLEAR DONE
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Empty state */}
        {tasks.length === 0 && loaded && (
          <div style={{ textAlign: "center", padding: "48px 0", color: C.muted, fontFamily: "var(--font-pixel)", fontSize: 11 }}>
            type a task above and press enter
          </div>
        )}
      </div>

      {/* ── Edit Modal ── */}
      {editingTask && (
        <TaskModal
          task={editingTask}
          onSave={updateTask}
          onClose={() => setEditingTask(null)}
        />
      )}
    </div>
  );
}
