import { useState, useEffect } from "react";
import type { Task } from "@/types/task";
import Cat from "./Cat";

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

// ─── Kanban Card ─────────────────────────────
function KanbanCard({ task, onDelete }: { task: Task; onDelete: () => void }) {
  const overdue = isOverdue(task.dueDate, task.status);
  const pc = PRI_COLORS[task.priority] ?? PRI_COLORS.medium;
  const subs = task.subtasks ?? [];
  const doneSubs = subs.filter((s) => s.done).length;

  return (
    <div
      draggable
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
          onClick={onDelete}
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
            {monthDay(task.dueDate)}
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

  useEffect(() => {
    window.toasty.listTasks().then((t) => { setTasks(t); setLoaded(true); });
    const unsub = window.toasty.onCatState((s) => setCatState(s));
    return () => unsub();
  }, []);

  // ── Add / parse ──────────────────────────────
  const handleAdd = async () => {
    const text = input.trim();
    if (!text) return;
    setParsing(true); setError(null);
    try {
      const parsed = await window.toasty.parse(text);
      const now = new Date().toISOString();
      const ids = nextIds(tasks, parsed.length);
      const newTasks: Task[] = parsed.map((t: any, i: number) => ({
        id: ids[i], title: t.title,
        subtasks: (t.subtasks || []).map((s: any) =>
          typeof s === "string" ? { text: s, done: false } : s),
        priority: t.priority || "medium",
        startDate: t.startDate || null, dueDate: t.dueDate || null,
        category: t.category || "", status: "todo" as const,
        createdAt: now, updatedAt: now, notes: t.notes || "", links: t.links || [],
      }));
      await Promise.all(newTasks.map((t) => window.toasty.saveTask(t)));
      setTasks((prev) => [...newTasks, ...prev]);
      setInput("");
    } catch (e) {
      // fallback: plain manual add if Ollama fails
      const now = new Date().toISOString();
      const id = nextId(tasks);
      const t: Task = {
        id, title: text, subtasks: [], priority: "medium",
        startDate: null, dueDate: null, category: "",
        status: "todo", createdAt: now, updatedAt: now, notes: "", links: [],
      };
      await window.toasty.saveTask(t);
      setTasks((prev) => [t, ...prev]);
      setInput("");
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
      {/* ── Header ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "10px 18px",
        background: C.panel, borderBottom: `3px solid ${C.border}`,
      }}>
        <Cat state={catState} size={48} style={{ flexShrink: 0 }} />
        <span style={{ fontFamily: "var(--font-pixel)", fontSize: 18, fontWeight: 700, color: C.text, letterSpacing: "0.06em" }}>
          TOASTY
        </span>
        <span style={{ fontFamily: "var(--font-pixel)", fontSize: 9, color: C.muted, marginLeft: 4 }}>
          {counts.todo} todo · {counts.in_progress} doing · {counts.done} done
        </span>
        <button
          onClick={() => window.toasty.toggleMode()}
          style={{ ...pixel(), marginLeft: "auto", fontSize: 9 }}
        >
          PET MODE
        </button>
      </div>

      <div style={{ padding: "16px 18px" }}>
        {/* ── Add bar ── */}
        <div style={{ display: "flex", gap: 0, marginBottom: 18 }}>
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
        {error && <div style={{ fontSize: 11, color: C.high, marginBottom: 8, fontFamily: "var(--font-pixel)" }}>{error}</div>}

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
    </div>
  );
}
