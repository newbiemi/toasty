"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import type { Task, Subtask } from "@/types/task";
import { supabase } from "@/lib/supabase";

// ─── Constants ──────────────────────────────
const PRIORITIES: Task["priority"][] = ["high", "medium", "low"];
const STATUS_ORDER: Task["status"][] = ["todo", "in_progress", "done"];
const STATUS_LABELS: Record<string, string> = { todo: "To Do", in_progress: "In Progress", done: "Done" };
const STATUS_ICONS: Record<string, string> = { todo: "○", in_progress: "◐", done: "●" };

const P: Record<string, { bg: string; border: string; dot: string; text: string }> = {
  high: { bg: "#2a1519", border: "#6b2f3a", dot: "#f05365", text: "#f5a0ab" },
  medium: { bg: "#2a2215", border: "#6b5a2f", dot: "#f0b853", text: "#f5d8a0" },
  low: { bg: "#152a1a", border: "#2f6b3f", dot: "#53f078", text: "#a0f5b5" },
};
const S_COLORS: Record<string, string> = { todo: "#666", in_progress: "#f0b853", done: "#53f078" };

const SORT_MODES = [
  { key: "urgency", label: "🔥 Urgency", desc: "Overdue → high priority → nearest due" },
  { key: "timeline", label: "📅 Timeline", desc: "Earliest due date first" },
  { key: "category", label: "🏷️ Category", desc: "Grouped by category" },
];

async function nextId(): Promise<string> {
  const { data } = await supabase.from("tasks").select("id").like("id", "t%").order("id", { ascending: false }).limit(1);
  let next = 1;
  if (data && data.length > 0) { const m = data[0].id.match(/^t(\d+)$/); if (m) next = parseInt(m[1], 10) + 1; }
  return `t${String(next).padStart(3, "0")}`;
}
async function nextIds(count: number): Promise<string[]> {
  const { data } = await supabase.from("tasks").select("id").like("id", "t%").order("id", { ascending: false }).limit(1);
  let next = 1;
  if (data && data.length > 0) { const m = data[0].id.match(/^t(\d+)$/); if (m) next = parseInt(m[1], 10) + 1; }
  return Array.from({ length: count }, (_, i) => `t${String(next + i).padStart(3, "0")}`);
}
const todayStr = () => new Date().toISOString().split("T")[0];
const addDays = (d: string, n: number) => { const dt = new Date(d); dt.setDate(dt.getDate() + n); return dt.toISOString().split("T")[0]; };
const isOverdue = (due: string | null, status: string) => due != null && status !== "done" && due < todayStr();
const dayName = (ds: string) => new Date(ds + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" });
const monthDay = (ds: string) => new Date(ds + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

function smartSort(tasks: Task[], mode: string): Task[] {
  const t = todayStr();
  const priVal: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const dateSortVal = (d: string | null) => d || "9999-12-31";
  if (mode === "urgency") {
    return [...tasks].sort((a, b) => {
      const aOver = a.dueDate && a.status !== "done" && a.dueDate < t ? 0 : 1;
      const bOver = b.dueDate && b.status !== "done" && b.dueDate < t ? 0 : 1;
      if (aOver !== bOver) return aOver - bOver;
      const aDone = a.status === "done" ? 1 : 0;
      const bDone = b.status === "done" ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      if (priVal[a.priority] !== priVal[b.priority]) return priVal[a.priority] - priVal[b.priority];
      return dateSortVal(a.dueDate).localeCompare(dateSortVal(b.dueDate));
    });
  }
  if (mode === "timeline") {
    return [...tasks].sort((a, b) => {
      const aDone = a.status === "done" ? 1 : 0;
      const bDone = b.status === "done" ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      return dateSortVal(a.dueDate).localeCompare(dateSortVal(b.dueDate));
    });
  }
  if (mode === "category") {
    return [...tasks].sort((a, b) => {
      const aDone = a.status === "done" ? 1 : 0;
      const bDone = b.status === "done" ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      const aCat = (a.category || "zzz").toLowerCase();
      const bCat = (b.category || "zzz").toLowerCase();
      if (aCat !== bCat) return aCat.localeCompare(bCat);
      return priVal[a.priority] - priVal[b.priority];
    });
  }
  return tasks;
}

// ─── Styles ─────────────────────────────────
const css = {
  glass: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10 },
  btn: (active: boolean) => ({
    padding: "5px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)",
    background: active ? "rgba(255,255,255,0.1)" : "transparent",
    color: active ? "#fff" : "#666", fontSize: 12, fontWeight: 500 as const, cursor: "pointer" as const,
    fontFamily: "inherit", transition: "all 0.15s",
  }),
  input: {
    background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6,
    color: "#ddd", padding: "8px 12px", fontSize: 13, outline: "none", fontFamily: "inherit",
  },
  tag: (color: { bg: string; border: string; text: string }) => ({
    display: "inline-flex" as const, alignItems: "center" as const, gap: 3, padding: "1px 7px", borderRadius: 4,
    fontSize: 10, fontWeight: 600 as const, letterSpacing: "0.04em",
    background: color.bg, border: `1px solid ${color.border}`, color: color.text,
    cursor: "pointer" as const, userSelect: "none" as const,
  }),
};

// ─── API Calls (through backend) ─────────────
async function apiParse(text: string) {
  const res = await fetch("/api/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data.tasks;
}

async function apiAdjust(task: Task, instruction: string) {
  const res = await fetch("/api/adjust", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task, instruction }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data.result;
}

// ─── Supabase CRUD ───────────────────────────
async function loadTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) { console.error(error); return []; }
  return (data || []).map((r: any) => ({
    id: r.id, title: r.title, subtasks: r.subtasks || [], priority: r.priority,
    status: r.status, startDate: r.start_date, dueDate: r.due_date,
    category: r.category || "", notes: r.notes || "", links: r.links || [],
    createdAt: r.created_at, updatedAt: r.updated_at,
  }));
}

async function saveToDB(task: Task) {
  const { error } = await supabase.from("tasks").upsert({
    id: task.id, title: task.title, subtasks: task.subtasks, priority: task.priority,
    status: task.status, start_date: task.startDate, due_date: task.dueDate,
    category: task.category, notes: task.notes, links: task.links,
    updated_at: new Date().toISOString(), created_at: task.createdAt,
  });
  if (error) console.error("Save error:", error);
}

async function deleteFromDB(id: string) {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) console.error("Delete error:", error);
}

async function deleteDoneFromDB() {
  const { error } = await supabase.from("tasks").delete().eq("status", "done");
  if (error) console.error("Delete done error:", error);
}

// ─── Quick Date Picker ───────────────────────
function QuickDatePicker({ value, onChange, label, taskStatus }: {
  value: string | null; onChange: (v: string | null) => void; label: string; taskStatus?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);
  const shortcuts = [
    { label: "Today", val: todayStr() }, { label: "Tomorrow", val: addDays(todayStr(), 1) },
    { label: "+3 days", val: addDays(todayStr(), 3) }, { label: "Next week", val: addDays(todayStr(), 7) },
    { label: "Clear", val: null },
  ];
  const overdue = label === "Due" && isOverdue(value, taskStatus || "todo");
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <span onClick={() => setOpen(!open)} style={{
        fontSize: 11, color: overdue ? "#f05365" : value ? "#aaa" : "#555", cursor: "pointer",
        padding: "2px 6px", borderRadius: 4, background: open ? "rgba(255,255,255,0.05)" : "transparent",
        border: `1px solid ${open ? "rgba(255,255,255,0.1)" : "transparent"}`, whiteSpace: "nowrap",
      }}>
        {label}: {value ? monthDay(value) : "—"}
      </span>
      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 100,
          background: "#1a1a1e", border: "1px solid #333", borderRadius: 8, padding: 8,
          display: "flex", flexDirection: "column", gap: 2, minWidth: 140, boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        }}>
          {shortcuts.map((s) => (
            <div key={s.label} onClick={() => { onChange(s.val); setOpen(false); }} style={{
              padding: "5px 8px", borderRadius: 4, fontSize: 11,
              color: s.val === value ? "#fff" : "#aaa",
              background: s.val === value ? "rgba(255,255,255,0.08)" : "transparent", cursor: "pointer",
            }}>
              {s.label} {s.val && <span style={{ opacity: 0.4, marginLeft: 4 }}>{dayName(s.val)}</span>}
            </div>
          ))}
          <hr style={{ border: "none", borderTop: "1px solid #2a2a2a", margin: "4px 0" }} />
          <input type="date" value={value || ""} onChange={(e) => { onChange(e.target.value || null); setOpen(false); }}
            style={{ background: "transparent", border: "1px solid #333", borderRadius: 4, color: "#aaa", fontSize: 11, padding: "4px 6px", fontFamily: "inherit", colorScheme: "dark" as any }}
          />
        </div>
      )}
    </div>
  );
}

// ─── AI Adjust Panel ─────────────────────────
function AdjustPanel({ task, onApply, onCancel }: {
  task: Task; onApply: (result: any) => void; onCancel: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleAdjust = async () => {
    if (!prompt.trim()) return;
    setLoading(true); setError(null); setPreview(null);
    try {
      const result = await apiAdjust(task, prompt);
      setPreview(result);
    } catch (e) {
      setError("Adjust failed. Try again.");
      console.error(e);
    }
    setLoading(false);
  };

  const isArray = Array.isArray(preview);
  const previewList = isArray ? preview : preview ? [preview] : [];

  return (
    <div style={{
      marginTop: 8, padding: 10, borderRadius: 8,
      background: "rgba(83,240,120,0.03)", border: "1px solid rgba(83,240,120,0.12)",
    }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <input
          ref={inputRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleAdjust()}
          placeholder='e.g. "got feedback, add subtasks for options A/B/C" or "push deadline to next Friday"'
          style={{ ...css.input, flex: 1, fontSize: 12, padding: "6px 10px", border: "1px solid rgba(83,240,120,0.15)", background: "rgba(0,0,0,0.4)" }}
        />
        <button onClick={handleAdjust} disabled={loading || !prompt.trim()} style={{
          ...css.btn(true), background: loading ? "#222" : "#53f078", color: loading ? "#666" : "#0e0e10",
          fontWeight: 700, border: "none", padding: "6px 14px", fontSize: 11,
        }}>
          {loading ? "..." : "🤖 Adjust"}
        </button>
        <button onClick={onCancel} style={{ ...css.btn(false), padding: "6px 10px", fontSize: 11 }}>✕</button>
      </div>

      {error && <div style={{ fontSize: 11, color: "#f05365", marginBottom: 6 }}>{error}</div>}

      {preview && (
        <div>
          <div style={{ fontSize: 10, color: "#53f078", fontWeight: 600, marginBottom: 6, letterSpacing: "0.05em" }}>
            PREVIEW {isArray ? `(${previewList.length} tasks)` : "(updated)"}
          </div>
          {previewList.map((p: any, i: number) => (
            <div key={i} style={{
              padding: "8px 10px", marginBottom: 4, borderRadius: 6,
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
            }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: "#e0e0e0", marginBottom: 3 }}>{p.title}</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center", marginBottom: 3 }}>
                <span style={css.tag(P[p.priority || "medium"])}>
                  <span style={{ color: P[p.priority || "medium"].dot }}>●</span> {p.priority || "medium"}
                </span>
                {p.category && <span style={{ fontSize: 9, color: "#666", background: "rgba(255,255,255,0.04)", padding: "0 5px", borderRadius: 3 }}>{p.category}</span>}
                {p.startDate && <span style={{ fontSize: 9, color: "#888" }}>Start: {monthDay(p.startDate)}</span>}
                {p.dueDate && <span style={{ fontSize: 9, color: "#888" }}>Due: {monthDay(p.dueDate)}</span>}
              </div>
              {(p.subtasks || []).length > 0 && (
                <div style={{ marginLeft: 8 }}>
                  {(p.subtasks || []).map((s: any, j: number) => (
                    <div key={j} style={{ fontSize: 11, color: "#aaa", padding: "1px 0" }}>
                      ○ {typeof s === "string" ? s : s.text}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button onClick={() => onApply(preview)} style={{
              ...css.btn(true), background: "#53f078", color: "#0e0e10", fontWeight: 700, border: "none", fontSize: 11, padding: "5px 16px",
            }}>
              ✓ Apply {isArray ? "all" : "changes"}
            </button>
            <button onClick={() => setPreview(null)} style={{ ...css.btn(false), fontSize: 11 }}>Try again</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Task Card (List) ────────────────────────
function TaskCard({ task, onUpdate, onDelete, onAdjust, dragHandlers }: {
  task: Task;
  onUpdate: (t: Task) => void;
  onDelete: () => void;
  onAdjust: (id: string, result: any) => void;
  dragHandlers?: {
    onDragStart: () => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragEnd: () => void;
  } | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [newSub, setNewSub] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [newLink, setNewLink] = useState("");
  const [editNotes, setEditNotes] = useState(task.notes || "");
  const overdue = isOverdue(task.dueDate, task.status);
  const done = task.status === "done";

  const cyclePri = () => { const i = (PRIORITIES.indexOf(task.priority) + 1) % 3; onUpdate({ ...task, priority: PRIORITIES[i] }); };
  const cycleStat = () => { const i = (STATUS_ORDER.indexOf(task.status) + 1) % 3; onUpdate({ ...task, status: STATUS_ORDER[i] }); };

  const subs = task.subtasks || [];
  const links = task.links || [];
  const doneCount = subs.filter((s) => s.done).length;
  const pc = P[task.priority];
  const hasDetails = (task.notes || "").length > 0 || links.length > 0;

  const handleApplyAdjust = (result: any) => { onAdjust(task.id, result); setAdjusting(false); };

  const addLink = () => {
    if (!newLink.trim()) return;
    onUpdate({ ...task, links: [...links, newLink.trim()] });
    setNewLink("");
  };

  return (
    <div
      draggable={!!dragHandlers && !adjusting && !showDetails}
      onDragStart={dragHandlers?.onDragStart}
      onDragOver={dragHandlers?.onDragOver}
      onDragEnd={dragHandlers?.onDragEnd}
      style={{
        ...css.glass, padding: "10px 12px", opacity: done ? 0.5 : 1,
        borderLeft: overdue ? "3px solid #f05365" : adjusting ? "3px solid #53f078" : "3px solid transparent",
        transition: "all 0.15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        {dragHandlers && (
          <span style={{ color: "#333", fontSize: 12, cursor: "grab", lineHeight: "22px", userSelect: "none" }}>⠿</span>
        )}
        <span onClick={cycleStat} style={{
          cursor: "pointer", fontSize: 16, lineHeight: "22px", color: S_COLORS[task.status], transition: "color 0.15s", flexShrink: 0,
        }}>
          {STATUS_ICONS[task.status]}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
              onBlur={() => { if (editTitle.trim()) onUpdate({ ...task, title: editTitle.trim() }); setEditing(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} autoFocus
              style={{ ...css.input, width: "100%", padding: "2px 6px", fontSize: 13 }}
            />
          ) : (
            <div onClick={() => { setEditTitle(task.title); setEditing(true); }} style={{
              fontSize: 13, fontWeight: 500, color: done ? "#666" : overdue ? "#f5a0ab" : "#e0e0e0",
              textDecoration: done ? "line-through" : "none", cursor: "text", lineHeight: "22px",
            }}>
              {task.title}
              {overdue && <span style={{ fontSize: 9, color: "#f05365", marginLeft: 6, fontWeight: 700, letterSpacing: "0.05em" }}>OVERDUE</span>}
            </div>
          )}
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 5, alignItems: "center" }}>
            <span style={css.tag(pc)} onClick={cyclePri}><span style={{ color: pc.dot }}>●</span> {task.priority}</span>
            {task.category && (
              <span style={{ fontSize: 10, color: "#666", background: "rgba(255,255,255,0.04)", padding: "1px 6px", borderRadius: 3, border: "1px solid rgba(255,255,255,0.06)" }}>
                {task.category}
              </span>
            )}
            <QuickDatePicker label="Start" value={task.startDate} onChange={(v) => onUpdate({ ...task, startDate: v })} taskStatus={task.status} />
            <QuickDatePicker label="Due" value={task.dueDate} onChange={(v) => onUpdate({ ...task, dueDate: v })} taskStatus={task.status} />
            {subs.length > 0 && (
              <span onClick={() => setExpanded(!expanded)} style={{ fontSize: 10, color: "#555", cursor: "pointer" }}>
                {doneCount}/{subs.length} ✓ {expanded ? "▾" : "▸"}
              </span>
            )}
            <span
              onClick={() => setShowDetails(!showDetails)}
              style={{
                fontSize: 10, color: showDetails ? "#888" : hasDetails ? "#777" : "#444", cursor: "pointer",
                padding: "1px 6px", borderRadius: 3,
                border: `1px solid ${showDetails ? "rgba(255,255,255,0.1)" : "transparent"}`,
                background: showDetails ? "rgba(255,255,255,0.03)" : "transparent",
              }}
            >
              📎 {hasDetails ? `${links.length + (task.notes ? 1 : 0)}` : ""}
            </span>
            <span
              onClick={() => setAdjusting(!adjusting)}
              style={{
                fontSize: 10, color: adjusting ? "#53f078" : "#444", cursor: "pointer",
                padding: "1px 6px", borderRadius: 3, border: `1px solid ${adjusting ? "rgba(83,240,120,0.2)" : "transparent"}`,
                background: adjusting ? "rgba(83,240,120,0.05)" : "transparent",
                transition: "all 0.15s",
              }}
            >
              🤖 Adjust
            </span>
          </div>
        </div>
        <span onClick={onDelete} style={{ cursor: "pointer", color: "#444", fontSize: 13, lineHeight: "22px", padding: "0 2px" }}>✕</span>
      </div>

      {/* Subtasks */}
      {expanded && (
        <div style={{ marginTop: 6, marginLeft: 32 }}>
          {subs.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", fontSize: 12, color: s.done ? "#555" : "#bbb", textDecoration: s.done ? "line-through" : "none" }}>
              <span onClick={() => { const ns = [...subs]; ns[i] = { ...ns[i], done: !ns[i].done }; onUpdate({ ...task, subtasks: ns }); }} style={{ cursor: "pointer", fontSize: 10 }}>
                {s.done ? "●" : "○"}
              </span>
              <span style={{ flex: 1 }}>{s.text}</span>
              <span onClick={() => { const ns = [...subs]; ns.splice(i, 1); onUpdate({ ...task, subtasks: ns }); }} style={{ cursor: "pointer", opacity: 0.3, fontSize: 10 }}>✕</span>
            </div>
          ))}
          <input value={newSub} onChange={(e) => setNewSub(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && newSub.trim()) { onUpdate({ ...task, subtasks: [...subs, { text: newSub.trim(), done: false }] }); setNewSub(""); } }}
            placeholder="+ subtask"
            style={{ width: "100%", marginTop: 3, background: "transparent", border: "none", borderBottom: "1px solid #222", color: "#888", fontSize: 11, padding: "3px 0", outline: "none", fontFamily: "inherit" }}
          />
        </div>
      )}

      {/* Details: Notes + Links */}
      {showDetails && (
        <div style={{ marginTop: 8, marginLeft: 32, padding: 10, borderRadius: 6, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ fontSize: 10, color: "#555", fontWeight: 600, marginBottom: 4, letterSpacing: "0.04em" }}>NOTES</div>
          <textarea
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            onBlur={() => onUpdate({ ...task, notes: editNotes })}
            placeholder="Add notes, context, details..."
            rows={2}
            style={{
              width: "100%", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 4, color: "#bbb", padding: "6px 8px", fontSize: 11, lineHeight: 1.5,
              resize: "vertical", outline: "none", fontFamily: "inherit", boxSizing: "border-box",
            }}
          />
          <div style={{ fontSize: 10, color: "#555", fontWeight: 600, marginTop: 8, marginBottom: 4, letterSpacing: "0.04em" }}>LINKS</div>
          {links.map((link, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
              <span style={{ fontSize: 10, color: "#555" }}>🔗</span>
              <a href={link.startsWith("http") ? link : `https://${link}`} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 11, color: "#6bb3f0", textDecoration: "none", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
              >
                {link.replace(/^https?:\/\//, "").slice(0, 60)}{link.replace(/^https?:\/\//, "").length > 60 ? "..." : ""}
              </a>
              <span onClick={() => onUpdate({ ...task, links: links.filter((_, j) => j !== i) })} style={{ cursor: "pointer", color: "#444", fontSize: 10 }}>✕</span>
            </div>
          ))}
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            <input
              value={newLink}
              onChange={(e) => setNewLink(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addLink()}
              placeholder="+ add link (URL, Slack link, etc.)"
              style={{
                flex: 1, background: "transparent", border: "none", borderBottom: "1px solid #222",
                color: "#888", fontSize: 11, padding: "3px 0", outline: "none", fontFamily: "inherit",
              }}
            />
          </div>
        </div>
      )}

      {adjusting && (
        <AdjustPanel task={task} onApply={handleApplyAdjust} onCancel={() => setAdjusting(false)} />
      )}
    </div>
  );
}

// ─── Kanban Card ─────────────────────────────
function KanbanCard({ task, onUpdate, onDelete, onAdjust }: {
  task: Task;
  onUpdate: (t: Task) => void;
  onDelete: () => void;
  onAdjust: (id: string, result: any) => void;
}) {
  const [adjusting, setAdjusting] = useState(false);
  const pc = P[task.priority];
  const overdue = isOverdue(task.dueDate, task.status);

  return (
    <div style={{
      ...css.glass, padding: "8px 10px",
      borderLeft: `3px solid ${overdue ? "#f05365" : pc.dot}`, marginBottom: 6,
    }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: overdue ? "#f5a0ab" : "#ddd", marginBottom: 4 }}>
        {task.title}
        {overdue && <span style={{ fontSize: 8, color: "#f05365", marginLeft: 4, fontWeight: 700 }}>OVERDUE</span>}
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ ...css.tag(pc), fontSize: 9, padding: "0 5px" }}>
          <span style={{ color: pc.dot }}>●</span> {task.priority}
        </span>
        {task.category && <span style={{ fontSize: 9, color: "#555", background: "rgba(255,255,255,0.03)", padding: "0 5px", borderRadius: 3 }}>{task.category}</span>}
        {task.dueDate && <span style={{ fontSize: 9, color: overdue ? "#f05365" : "#555" }}>{monthDay(task.dueDate)}</span>}
      </div>
      {(task.subtasks || []).length > 0 && (
        <div style={{ fontSize: 9, color: "#444", marginTop: 3 }}>
          {(task.subtasks || []).filter(s => s.done).length}/{(task.subtasks || []).length} subtasks
        </div>
      )}
      <div style={{ display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap" }}>
        {STATUS_ORDER.filter(s => s !== task.status).map(s => (
          <span key={s} onClick={() => onUpdate({ ...task, status: s })} style={{
            fontSize: 9, color: "#555", cursor: "pointer", padding: "1px 5px", borderRadius: 3, border: "1px solid #222", transition: "color 0.1s",
          }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#aaa")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#555")}
          >→ {STATUS_LABELS[s]}</span>
        ))}
        <span onClick={() => setAdjusting(!adjusting)} style={{
          fontSize: 9, color: adjusting ? "#53f078" : "#444", cursor: "pointer", padding: "1px 5px", borderRadius: 3,
          border: `1px solid ${adjusting ? "rgba(83,240,120,0.2)" : "#222"}`,
        }}>🤖</span>
        <span onClick={() => onDelete()} style={{ fontSize: 9, color: "#444", cursor: "pointer", marginLeft: "auto", padding: "1px 5px" }}>✕</span>
      </div>
      {adjusting && (
        <AdjustPanel task={task} onApply={(result) => { onAdjust(task.id, result); setAdjusting(false); }} onCancel={() => setAdjusting(false)} />
      )}
    </div>
  );
}

// ─── Calendar View ────────────────────────────
function CalendarView({ tasks, onUpdate }: { tasks: Task[]; onUpdate: (t: Task) => void }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const startOfWeek = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1 + weekOffset * 7); return d;
  }, [weekOffset]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek); d.setDate(d.getDate() + i); return d.toISOString().split("T")[0];
  }), [startOfWeek]);

  const tasksByDay = useMemo(() => {
    const map: Record<string, (Task & { _calLabel: string })[]> = {};
    days.forEach((d) => { map[d] = []; });
    tasks.forEach((t) => {
      if (t.dueDate && map[t.dueDate] !== undefined) map[t.dueDate].push({ ...t, _calLabel: "due" });
      if (t.startDate && map[t.startDate] !== undefined && t.startDate !== t.dueDate) map[t.startDate].push({ ...t, _calLabel: "start" });
    });
    return map;
  }, [tasks, days]);

  const unscheduled = tasks.filter(t => !t.startDate && !t.dueDate && t.status !== "done");

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <button onClick={() => setWeekOffset(w => w - 1)} style={css.btn(false)}>← Prev</button>
        <span style={{ fontSize: 13, color: "#888" }}>
          {monthDay(days[0])} — {monthDay(days[6])}
          {weekOffset === 0 && <span style={{ color: "#53f078", marginLeft: 6, fontSize: 10 }}>THIS WEEK</span>}
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          {weekOffset !== 0 && <button onClick={() => setWeekOffset(0)} style={css.btn(false)}>Today</button>}
          <button onClick={() => setWeekOffset(w => w + 1)} style={css.btn(false)}>Next →</button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr) repeat(2, 0.6fr)", gap: 6, alignItems: "start" }}>
        {days.map((d) => {
          const isToday = d === todayStr();
          const dayTasks = tasksByDay[d] || [];
          const isEmpty = dayTasks.length === 0;
          return (
            <div key={d} style={{
              ...css.glass,
              padding: isEmpty ? "6px 8px" : 8,
              minHeight: isEmpty ? 0 : undefined,
              borderTop: isToday ? "2px solid #53f078" : "2px solid transparent",
              opacity: isEmpty ? 0.45 : 1,
            }}>
              <div style={{ fontSize: 10, color: isToday ? "#53f078" : "#666", marginBottom: isEmpty ? 0 : 6, fontWeight: 600 }}>
                {dayName(d)} <span style={{ fontWeight: 400 }}>{monthDay(d)}</span>
              </div>
              {dayTasks.map((t, idx) => {
                const pc = P[t.priority]; const od = isOverdue(t.dueDate, t.status);
                return (
                  <div key={t.id + "-" + idx} style={{
                    padding: "4px 6px", marginBottom: 3, borderRadius: 4,
                    background: od ? "rgba(240,83,101,0.1)" : pc.bg,
                    borderLeft: `2px solid ${od ? "#f05365" : pc.dot}`, fontSize: 10, color: od ? "#f5a0ab" : "#ccc", cursor: "pointer",
                  }}
                    title={`${t.title} (${t._calLabel})`}
                    onClick={() => { const i = (STATUS_ORDER.indexOf(t.status) + 1) % 3; onUpdate({ ...t, status: STATUS_ORDER[i] }); }}
                  >
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {STATUS_ICONS[t.status]} {t.title}
                    </div>
                    <div style={{ fontSize: 8, color: "#555", marginTop: 1 }}>
                      {t._calLabel === "start" ? "▶ starts" : "◼ due"}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      {unscheduled.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, color: "#555", marginBottom: 6, fontWeight: 600 }}>UNSCHEDULED ({unscheduled.length})</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {unscheduled.map((t) => (
              <div key={t.id} style={{ ...css.glass, padding: "4px 8px", fontSize: 11, color: "#888", borderLeft: `2px solid ${P[t.priority].dot}` }}>
                {t.title}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────
export default function TaskDashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState("list");
  const [input, setInput] = useState("");
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState("ai");
  const [manualTitle, setManualTitle] = useState("");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortMode, setSortMode] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [exportText, setExportText] = useState<string | null>(null);

  // Load from Supabase on mount
  useEffect(() => { loadTasks().then((t) => { setTasks(t); setLoaded(true); }); }, []);

  const handleParse = async () => {
    if (!input.trim()) return;
    setParsing(true); setError(null);
    try {
      const parsed = await apiParse(input);
      const now = new Date().toISOString();
      const ids = await nextIds(parsed.length);
      const newTasks: Task[] = parsed.map((t: any, i: number) => ({
        id: ids[i], title: t.title,
        subtasks: (t.subtasks || []).map((s: any) => typeof s === "string" ? { text: s, done: false } : s),
        priority: t.priority || "medium", startDate: t.startDate || null, dueDate: t.dueDate || null,
        category: t.category || "", status: "todo" as const, createdAt: now, updatedAt: now,
        notes: t.notes || "", links: t.links || [],
      }));
      // Save new tasks to DB, then prepend to state
      await Promise.all(newTasks.map(saveToDB));
      setTasks((prev) => [...newTasks, ...prev]);
      setInput("");
    } catch (e) { setError(`Parse failed: ${(e as Error).message || "check input and retry."}`); console.error(e); }
    setParsing(false);
  };

  const handleManualAdd = async () => {
    if (!manualTitle.trim()) return;
    const now = new Date().toISOString();
    const id = await nextId();
    const newTask: Task = {
      id, title: manualTitle.trim(), subtasks: [], priority: "medium",
      startDate: null, dueDate: null, category: "", status: "todo", createdAt: now, updatedAt: now,
      notes: "", links: [],
    };
    await saveToDB(newTask);
    setTasks((prev) => [newTask, ...prev]);
    setManualTitle("");
  };

  const updateTask = async (u: Task) => {
    setTasks((prev) => prev.map((t) => (t.id === u.id ? u : t)));
    await saveToDB(u);
  };

  const deleteTask = async (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await deleteFromDB(id);
  };

  const clearDone = async () => {
    setTasks((prev) => prev.filter((t) => t.status !== "done"));
    await deleteDoneFromDB();
  };

  const handleAdjust = async (taskId: string, result: any) => {
    const isArr = Array.isArray(result);
    const results = isArr ? result : [result];
    const now = new Date().toISOString();
    const ids = await nextIds(results.length);
    const newTaskObjects: Task[] = results.map((r: any, i: number) => ({
      id: ids[i], title: r.title,
      subtasks: (r.subtasks || []).map((s: any) => typeof s === "string" ? { text: s, done: false } : s),
      priority: r.priority || "medium", startDate: r.startDate || null, dueDate: r.dueDate || null,
      category: r.category || "", status: r.status || "todo", createdAt: now, updatedAt: now,
      notes: r.notes || "", links: r.links || [],
    }));

    // Delete the original from DB, save the replacement(s)
    await deleteFromDB(taskId);
    await Promise.all(newTaskObjects.map(saveToDB));

    setTasks((prev) => {
      const idx = prev.findIndex((t) => t.id === taskId);
      if (idx === -1) return prev;
      const next = [...prev];
      next.splice(idx, 1, ...newTaskObjects);
      return next;
    });
  };

  const exportTasks = () => {
    const text = tasks.map((t) => {
      const lines: string[] = [];
      const status = STATUS_LABELS[t.status] || t.status;
      lines.push(`[${status}] [${t.priority.toUpperCase()}] ${t.title}`);
      if (t.category) lines.push(`  Category: ${t.category}`);
      if (t.startDate) lines.push(`  Start: ${t.startDate}`);
      if (t.dueDate) lines.push(`  Due: ${t.dueDate}`);
      if (t.notes) lines.push(`  Notes: ${t.notes}`);
      (t.links || []).forEach(l => lines.push(`  Link: ${l}`));
      (t.subtasks || []).forEach(s => lines.push(`  ${s.done ? "✓" : "○"} ${s.text}`));
      return lines.join("\n");
    }).join("\n\n");
    setExportText(text);
  };

  const exportToXlsx = () => {
    const rows = tasks.map((t) => ({
      Status: STATUS_LABELS[t.status] || t.status,
      Priority: t.priority.charAt(0).toUpperCase() + t.priority.slice(1),
      Title: t.title,
      Category: t.category || "",
      "Start Date": t.startDate || "",
      "Due Date": t.dueDate || "",
      Subtasks: (t.subtasks || []).map(s => `${s.done ? "✓" : "○"} ${s.text}`).join("\n"),
      Notes: t.notes || "",
      Links: (t.links || []).join("\n"),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 12 }, { wch: 8 }, { wch: 40 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 40 }, { wch: 40 }, { wch: 40 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tasks");
    XLSX.writeFile(wb, "task_organizer.xlsx");
  };

  const filtered = useMemo(() => {
    let f = tasks;
    if (search) {
      const q = search.toLowerCase();
      f = f.filter((t) =>
        t.title.toLowerCase().includes(q) ||
        (t.category || "").toLowerCase().includes(q) ||
        (t.notes || "").toLowerCase().includes(q) ||
        (t.links || []).some(l => l.toLowerCase().includes(q))
      );
    }
    if (filterStatus !== "all") f = f.filter((t) => t.status === filterStatus);
    if (sortMode) f = smartSort(f, sortMode);
    return f;
  }, [tasks, search, filterStatus, sortMode]);

  const counts = {
    all: tasks.length,
    todo: tasks.filter((t) => t.status === "todo").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    done: tasks.filter((t) => t.status === "done").length,
  };

  const handleDragStart = (i: number) => setDragIdx(i);
  const handleDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === i) return;
    const allIds = tasks.map(t => t.id);
    const from = allIds.indexOf(filtered[dragIdx].id);
    const to = allIds.indexOf(filtered[i].id);
    if (from === -1 || to === -1) return;
    setTasks((prev) => { const n = [...prev]; const [item] = n.splice(from, 1); n.splice(to, 0, item); return n; });
    setDragIdx(i);
  };
  const handleDragEnd = () => setDragIdx(null);

  return (
    <div style={{ minHeight: "100vh", background: "#0e0e10", color: "#e0e0e0", fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 24px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 8 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "#fff", letterSpacing: "-0.03em" }}>
              <span style={{ color: "#53f078" }}>⚡</span> Task Parser
            </h1>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: "#444" }}>
              {counts.todo} pending · {counts.in_progress} active · {counts.done} done
            </p>
          </div>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {([["list", "☰ List"], ["kanban", "▥ Kanban"], ["calendar", "📅 Calendar"]] as const).map(([v, label]) => (
              <button key={v} onClick={() => setView(v)} style={css.btn(view === v)}>{label}</button>
            ))}
            {tasks.length > 0 && (<>
              <button onClick={exportTasks} style={{ ...css.btn(false), fontSize: 11, marginLeft: 4 }}>📋 Text</button>
              <button onClick={exportToXlsx} style={{ ...css.btn(false), fontSize: 11 }}>📊 .xlsx</button>
            </>)}
          </div>
        </div>

        {/* Input */}
        <div style={{ ...css.glass, padding: 14, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <button onClick={() => setMode("ai")} style={css.btn(mode === "ai")}>🤖 AI Parse</button>
            <button onClick={() => setMode("manual")} style={css.btn(mode === "manual")}>✏️ Manual</button>
          </div>
          {mode === "manual" ? (
            <div style={{ display: "flex", gap: 8 }}>
              <input value={manualTitle} onChange={(e) => setManualTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleManualAdd()} placeholder="Task title..."
                style={{ ...css.input, flex: 1 }} />
              <button onClick={handleManualAdd} style={{ ...css.btn(true), background: "#53f078", color: "#0e0e10", fontWeight: 700, border: "none" }}>Add</button>
            </div>
          ) : (
            <>
              <textarea value={input} onChange={(e) => setInput(e.target.value)}
                placeholder={'Paste a Slack message, email, or describe tasks...\n\nExample: "Update landing page by Friday, review Q1 budget ASAP, and schedule team sync next week"'}
                rows={4} style={{ ...css.input, width: "100%", resize: "vertical", lineHeight: 1.5, boxSizing: "border-box" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                <span style={{ fontSize: 10, color: "#333" }}>{input.length > 0 && `${input.length} chars`}</span>
                <button onClick={handleParse} disabled={parsing || !input.trim()} style={{
                  ...css.btn(true), background: parsing ? "#222" : "#53f078", color: parsing ? "#666" : "#0e0e10",
                  fontWeight: 700, padding: "7px 20px", border: "none",
                }}>
                  {parsing ? "Parsing..." : "⚡ Parse"}
                </button>
              </div>
            </>
          )}
          {error && <div style={{ marginTop: 6, fontSize: 11, color: "#f05365" }}>{error}</div>}
        </div>

        {/* Search + Filters + Sort */}
        {tasks.length > 0 && (<>
          <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Search..."
              style={{ ...css.input, flex: 1, minWidth: 140, padding: "5px 10px", fontSize: 12 }} />
            <div style={{ display: "flex", gap: 3 }}>
              {([["all", "All"], ["todo", "To Do"], ["in_progress", "Active"], ["done", "Done"]] as const).map(([k, l]) => (
                <button key={k} onClick={() => setFilterStatus(k)} style={css.btn(filterStatus === k)}>
                  {l} <span style={{ opacity: 0.4 }}>{counts[k]}</span>
                </button>
              ))}
            </div>
            {counts.done > 0 && <button onClick={clearDone} style={{ ...css.btn(false), fontSize: 10, color: "#444" }}>Clear done</button>}
          </div>
          <div style={{ display: "flex", gap: 3, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
            <span style={{ fontSize: 10, color: "#444", marginRight: 2 }}>Sort:</span>
            <button onClick={() => setSortMode(null)} style={{ ...css.btn(sortMode === null), fontSize: 10, padding: "3px 8px" }}>Manual</button>
            {SORT_MODES.map((m) => (
              <button key={m.key} onClick={() => setSortMode(m.key)} title={m.desc} style={{ ...css.btn(sortMode === m.key), fontSize: 10, padding: "3px 8px" }}>{m.label}</button>
            ))}
          </div>
        </>)}

        {/* Views */}
        {view === "list" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {filtered.map((task, i) => (
              <TaskCard key={task.id} task={task} onUpdate={updateTask} onDelete={() => deleteTask(task.id)}
                onAdjust={handleAdjust}
                dragHandlers={sortMode ? null : {
                  onDragStart: () => handleDragStart(i),
                  onDragOver: (e) => handleDragOver(e, i),
                  onDragEnd: handleDragEnd,
                }}
              />
            ))}
          </div>
        )}

        {view === "kanban" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {STATUS_ORDER.map((status) => {
              const col = filtered.filter((t) => t.status === status);
              return (
                <div key={status}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: S_COLORS[status], marginBottom: 8,
                    padding: "4px 8px", borderBottom: `2px solid ${S_COLORS[status]}`,
                    display: "flex", justifyContent: "space-between",
                  }}>
                    <span>{STATUS_LABELS[status]}</span>
                    <span style={{ opacity: 0.4 }}>{col.length}</span>
                  </div>
                  {col.map((t) => (
                    <KanbanCard key={t.id} task={t} onUpdate={updateTask} onDelete={() => deleteTask(t.id)} onAdjust={handleAdjust} />
                  ))}
                  {col.length === 0 && <div style={{ fontSize: 11, color: "#333", textAlign: "center", padding: 20 }}>Empty</div>}
                </div>
              );
            })}
          </div>
        )}

        {view === "calendar" && <CalendarView tasks={filtered} onUpdate={updateTask} />}

        {tasks.length === 0 && loaded && (
          <div style={{ textAlign: "center", padding: "48px 20px", color: "#333", fontSize: 13 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
            Paste a message and hit Parse to get started.
          </div>
        )}

        <div style={{ marginTop: 28, fontSize: 10, color: "#2a2a2a", textAlign: "center", lineHeight: 1.6 }}>
          ○/◐/● cycle status · badge cycles priority · click title to edit · drag ⠿ to reorder · 📎 for notes/links · 🤖 Adjust for AI changes
        </div>

        {/* Export Modal */}
        {exportText !== null && (
          <div style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.7)", zIndex: 1000,
            display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
          }} onClick={() => setExportText(null)}>
            <div onClick={(e) => e.stopPropagation()} style={{
              background: "#1a1a1e", border: "1px solid #333", borderRadius: 12,
              padding: 20, maxWidth: 600, width: "100%", maxHeight: "80vh", display: "flex", flexDirection: "column",
              boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>📋 Exported Tasks</span>
                <span onClick={() => setExportText(null)} style={{ cursor: "pointer", color: "#666", fontSize: 16 }}>✕</span>
              </div>
              <p style={{ fontSize: 11, color: "#555", margin: "0 0 8px" }}>Select all (Ctrl+A) and copy (Ctrl+C):</p>
              <textarea
                readOnly value={exportText}
                onFocus={(e) => e.target.select()}
                style={{
                  flex: 1, minHeight: 200, background: "#111", border: "1px solid #2a2a2a", borderRadius: 6,
                  color: "#ccc", padding: 12, fontSize: 12, lineHeight: 1.6, fontFamily: "inherit",
                  resize: "none", outline: "none", boxSizing: "border-box",
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
