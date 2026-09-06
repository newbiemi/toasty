import { useEffect, useState } from "react";
import type { Task } from "@/types/task";
import { buildTaskFromParsed } from "@/lib/taskFromParsed";
import TaskEditModal from "@/components/TaskEditModal";
import { C, pixel, inputStyle } from "@/lib/theme";

type UpdateStatus =
  | { type: "checking" }
  | { type: "available"; version: string }
  | { type: "not-available" }
  | { type: "progress"; percent: number }
  | { type: "downloaded"; version: string }
  | { type: "error"; message: string };

type AdjustPreview = { summary: string[]; questions: string[]; canApply: boolean };

const TABS: { id: Task["status"]; label: string }[] = [
  { id: "todo", label: "TO DO" },
  { id: "in_progress", label: "DOING" },
  { id: "done", label: "DONE" },
];

function nextIds(tasks: Task[], count: number): string[] {
  const max = tasks.reduce((m, t) => {
    const n = t.id.match(/^t(\d+)$/);
    return n ? Math.max(m, parseInt(n[1], 10)) : m;
  }, 0);
  return Array.from({ length: count }, (_, i) => `t${String(max + 1 + i).padStart(3, "0")}`);
}

export default function WidgetPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Task["status"]>("todo");
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // ── Prompt mode: parse (add) vs. adjust (bulk instruction + diff preview) ──
  const [mode, setMode] = useState<"add" | "adjust">("add");
  const [input, setInput] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const [adjustText, setAdjustText] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<AdjustPreview | null>(null);
  const [applying, setApplying] = useState(false);
  const [lastApplied, setLastApplied] = useState<string[] | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  const [ollamaStatus, setOllamaStatus] = useState<"running" | "offline" | "checking">("checking");
  const [groqApiKey, setGroqApiKey] = useState("");
  const [opacity, setOpacityState] = useState(1.0);
  const [reminderTasks, setReminderTasks] = useState<any[]>([]);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [catState, setCatState] = useState("idle");

  const refreshTasks = () => window.toasty.listTasks().then((t) => { setTasks(t); setLoaded(true); });

  useEffect(() => {
    refreshTasks();
    const unsubCat = window.toasty.onCatState((s) => setCatState(s));
    const unsubOllama = window.toasty.onOllamaStatus((s) => setOllamaStatus(s));
    const unsubReminder = window.toasty.onReminder((due) => {
      setReminderTasks(due);
      setTimeout(() => setReminderTasks([]), 5 * 60_000);
    });
    const unsubUpdate = window.toasty.onUpdateStatus((s) => setUpdateStatus(s));
    // A reset in the menu window changes tasks (and can invalidate a pending
    // undo) without this window's React state knowing — reload and drop any
    // adjust state in flight rather than show stale rows or a dead Undo button.
    const unsubTasksChanged = window.toasty.onTasksChanged(() => {
      refreshTasks();
      setPreview(null);
      setLastApplied(null);
      setCanUndo(false);
    });
    window.toasty.getSettings().then((s) => {
      setOpacityState(s.opacity ?? 1.0);
      setGroqApiKey(s.groqApiKey ?? "");
    });
    window.toasty.checkOllama().then((s) => setOllamaStatus(s));
    return () => { unsubCat(); unsubOllama(); unsubReminder(); unsubUpdate(); unsubTasksChanged(); };
  }, []);

  // ── Add / parse ──────────────────────────────
  const handleAdd = async () => {
    const text = input.trim();
    if (!text) return;
    setParsing(true); setParseError(null);
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
      const now = new Date().toISOString();
      const [id] = nextIds(tasks, 1);
      const t: Task = {
        id, title: text, subtasks: [], priority: "medium",
        startDate: null, dueDate: null, dueTime: null, category: "",
        status: "todo", createdAt: now, updatedAt: now, notes: text, links: [],
      };
      await window.toasty.saveTask(t);
      setTasks((prev) => [t, ...prev]);
      setInput("");
      setParseError("AI parse failed — added as plain task");
      setTimeout(() => setParseError(null), 4000);
    }
    setParsing(false);
  };

  // ── Adjust: preview → apply/cancel → undo ────
  const handlePreview = async () => {
    const text = adjustText.trim();
    if (!text) return;
    setPreviewing(true); setAdjustError(null); setLastApplied(null);
    try {
      const result = await window.toasty.previewAdjust(text);
      setPreview(result);
    } catch (err: any) {
      setAdjustError(err?.message ?? "Couldn't read that instruction — try rephrasing it.");
      setPreview(null);
    }
    setPreviewing(false);
  };

  const handleApply = async () => {
    if (!preview?.canApply) return;
    setApplying(true);
    try {
      const result = await window.toasty.applyAdjust();
      setLastApplied(result.summary);
      setCanUndo(true);
      setPreview(null);
      setAdjustText("");
      await refreshTasks();
    } catch (err: any) {
      setAdjustError(err?.message ?? "Apply failed.");
    }
    setApplying(false);
  };

  const handleCancelPreview = () => {
    setPreview(null);
    setAdjustText("");
  };

  const handleUndo = async () => {
    await window.toasty.undoAdjust();
    setCanUndo(false);
    setLastApplied(null);
    await refreshTasks();
  };

  // ── Task list actions ─────────────────────────
  const advance = async (t: Task) => {
    const next: Task["status"] = t.status === "todo" ? "in_progress" : t.status === "in_progress" ? "done" : "todo";
    const updated = { ...t, status: next, updatedAt: new Date().toISOString() };
    setTasks((prev) => prev.map((x) => (x.id === t.id ? updated : x)));
    await window.toasty.saveTask(updated);
  };
  const deleteTask = async (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await window.toasty.deleteTask(id);
  };
  const clearDone = async () => {
    setTasks((prev) => prev.filter((t) => t.status !== "done"));
    await window.toasty.clearDone();
  };
  const saveEdited = async (u: Task) => {
    setTasks((prev) => prev.map((t) => (t.id === u.id ? u : t)));
    await window.toasty.saveTask(u);
  };

  const handleOpacity = (v: number) => {
    setOpacityState(v);
    window.toasty.setOpacity(v);
  };

  const counts = {
    todo: tasks.filter((t) => t.status === "todo").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    done: tasks.filter((t) => t.status === "done").length,
  };
  const shown = tasks.filter((t) => t.status === tab);

  return (
    <div style={{
      width: "100vw", height: "100vh", overflow: "hidden",
      display: "flex", flexDirection: "column",
      background: C.cream, color: C.text, fontFamily: "var(--font-mono)",
      border: `3px solid ${C.border}`, boxSizing: "border-box",
    }}>
      {/* ── Drag bar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "6px 10px",
        background: C.panel, borderBottom: `3px solid ${C.border}`, flexShrink: 0,
        WebkitAppRegion: "drag",
      } as React.CSSProperties}>
        <span style={{ fontFamily: "var(--font-pixel)", fontSize: 13, letterSpacing: "0.06em" }}>
          TOASTY
        </span>
        <span style={{ fontFamily: "var(--font-pixel)", fontSize: 8, color: C.muted }}>
          {counts.todo}·{counts.in_progress}·{counts.done}
        </span>
        {groqApiKey ? (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 3,
            fontFamily: "var(--font-pixel)", fontSize: 7, color: C.done,
            border: `1px solid ${C.done}`, padding: "1px 4px",
          }}>
            <span style={{ width: 4, height: 4, borderRadius: "50%", background: C.done }} />
            GROQ
          </span>
        ) : (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 3,
            fontFamily: "var(--font-pixel)", fontSize: 7,
            color: ollamaStatus === "running" ? C.medium : C.muted,
            border: `1px solid ${ollamaStatus === "running" ? C.medium : C.muted}`, padding: "1px 4px",
          }}>
            <span style={{ width: 4, height: 4, borderRadius: "50%", background: ollamaStatus === "running" ? C.medium : C.muted }} />
            {ollamaStatus === "running" ? "OLLAMA" : "NO AI"}
          </span>
        )}
        {catState === "thinking" && (
          <span style={{ fontFamily: "var(--font-pixel)", fontSize: 7, color: C.orange }}>…thinking</span>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 6, WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          <input
            type="range" min="0.2" max="1" step="0.05"
            value={opacity}
            onChange={(e) => handleOpacity(parseFloat(e.target.value))}
            style={{ width: 44, cursor: "pointer", accentColor: C.orange }}
            title="Opacity"
          />
          <button onClick={() => window.toasty.openMenu()} style={{ ...pixel(), fontSize: 8 }} title="Menu">
            ☰
          </button>
          <button onClick={() => window.toasty.minimize()} style={{ ...pixel(), fontSize: 9, padding: "4px 8px" }} title="Minimize">—</button>
          <button onClick={() => window.toasty.closeWindow()} style={{ ...pixel(), fontSize: 9, padding: "4px 8px", color: C.high }} title="Hide to tray">✕</button>
        </div>
      </div>

      {/* ── Banners ── */}
      {updateStatus?.type === "downloaded" && (
        <div style={{ background: "#3d8b40", color: "#fff", padding: "5px 10px", fontFamily: "var(--font-pixel)", fontSize: 8, cursor: "pointer" }}
          onClick={() => window.toasty.installUpdate()}>
          🐾 v{(updateStatus as any).version} ready — click to restart
        </div>
      )}
      {reminderTasks.length > 0 && (
        <div style={{ background: C.high, color: "#fff", padding: "5px 10px", fontFamily: "var(--font-pixel)", fontSize: 8, display: "flex", justifyContent: "space-between" }}>
          <span>⏰ DUE: {reminderTasks.map((t: any) => t.title).join(", ")}</span>
          <span onClick={() => setReminderTasks([])} style={{ cursor: "pointer" }}>✕</span>
        </div>
      )}

      {/* ── Mode toggle: Add vs Adjust ── */}
      <div style={{ display: "flex", gap: 0, padding: "8px 10px 0" }}>
        <button
          onClick={() => setMode("add")}
          style={{ ...pixel(mode === "add"), flex: 1, fontSize: 9, borderRight: "none" }}
        >
          + ADD
        </button>
        <button
          onClick={() => setMode("adjust")}
          style={{ ...pixel(mode === "adjust"), flex: 1, fontSize: 9 }}
        >
          ADJUST
        </button>
      </div>

      <div style={{ padding: "8px 10px" }}>
        {mode === "add" ? (
          <>
            <div style={{ display: "flex", gap: 0 }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleAdd()}
                placeholder={parsing ? "Parsing…" : "Add a task — Enter"}
                disabled={parsing}
                style={{ ...inputStyle, fontSize: 11, borderRight: "none" }}
              />
              <button
                onClick={handleAdd}
                disabled={parsing || !input.trim()}
                style={{ ...pixel(true), fontSize: 9, padding: "4px 10px", background: parsing ? C.panel : C.orange, color: parsing ? C.muted : "#fff" }}
              >
                {parsing ? "…" : "ADD"}
              </button>
            </div>
            {parseError && <div style={{ fontSize: 9, color: C.medium, marginTop: 4, fontFamily: "var(--font-pixel)" }}>⚠ {parseError}</div>}
          </>
        ) : (
          <>
            <div style={{ display: "flex", gap: 0 }}>
              <input
                value={adjustText}
                onChange={(e) => setAdjustText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handlePreview()}
                placeholder={previewing ? "Reading…" : "e.g. clear everything overdue"}
                disabled={previewing || !!preview}
                style={{ ...inputStyle, fontSize: 11, borderRight: "none" }}
              />
              <button
                onClick={handlePreview}
                disabled={previewing || !adjustText.trim() || !!preview}
                style={{ ...pixel(true), fontSize: 9, padding: "4px 10px", background: previewing ? C.panel : C.orange, color: previewing ? C.muted : "#fff" }}
              >
                {previewing ? "…" : "PREVIEW"}
              </button>
            </div>

            {adjustError && <div style={{ fontSize: 9, color: C.medium, marginTop: 4, fontFamily: "var(--font-pixel)" }}>⚠ {adjustError}</div>}

            {/* ── Diff preview ── */}
            {preview && (
              <div style={{ marginTop: 8, border: `2px solid ${C.border}`, background: C.tan, padding: 8 }}>
                {preview.summary.length > 0 && (
                  <div style={{ marginBottom: preview.questions.length > 0 ? 6 : 0 }}>
                    <div style={{ fontFamily: "var(--font-pixel)", fontSize: 8, color: C.muted, marginBottom: 4 }}>WILL DO:</div>
                    {preview.summary.map((line, i) => (
                      <div key={i} style={{ fontSize: 11, marginBottom: 2 }}>• {line}</div>
                    ))}
                  </div>
                )}
                {preview.questions.length > 0 && (
                  <div>
                    <div style={{ fontFamily: "var(--font-pixel)", fontSize: 8, color: C.high, marginBottom: 4 }}>NEEDS ANSWERING (skipped):</div>
                    {preview.questions.map((q, i) => (
                      <div key={i} style={{ fontSize: 11, color: C.high, marginBottom: 2 }}>? {q}</div>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", gap: 6, marginTop: 8, justifyContent: "flex-end" }}>
                  <button onClick={handleCancelPreview} style={{ ...pixel(), fontSize: 9 }}>CANCEL</button>
                  <button
                    onClick={handleApply}
                    disabled={!preview.canApply || applying}
                    style={{
                      ...pixel(true), fontSize: 9,
                      background: preview.canApply && !applying ? C.orange : C.panel,
                      color: preview.canApply && !applying ? "#fff" : C.muted,
                    }}
                  >
                    {applying ? "…" : "APPLY"}
                  </button>
                </div>
              </div>
            )}

            {/* ── Applied confirmation + undo ── */}
            {lastApplied && (
              <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, color: C.done }}>
                <span>✓ {lastApplied.length} change{lastApplied.length !== 1 ? "s" : ""} applied</span>
                {canUndo && <button onClick={handleUndo} style={{ ...pixel(), fontSize: 8 }}>UNDO</button>}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Task list ── */}
      <div style={{ display: "flex", gap: 4, padding: "0 10px" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{ ...pixel(tab === t.id), flex: 1, fontSize: 8 }}
          >
            {t.label} ({counts[t.id]})
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}>
        {!loaded ? (
          <div style={{ fontSize: 10, color: C.muted, textAlign: "center", marginTop: 20 }}>loading…</div>
        ) : shown.length === 0 ? (
          <div style={{ fontSize: 10, color: C.muted, textAlign: "center", marginTop: 20, fontFamily: "var(--font-pixel)" }}>empty</div>
        ) : (
          shown.map((t) => {
            const overdue = t.dueDate != null && t.status !== "done" && t.dueDate < new Date().toISOString().split("T")[0];
            return (
              <div
                key={t.id}
                onClick={() => setEditingTask(t)}
                style={{
                  background: C.tan, border: `2px solid ${C.border}`,
                  borderLeft: `4px solid ${overdue ? C.high : C.orange}`,
                  padding: "6px 8px", marginBottom: 6, cursor: "pointer",
                  display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
                }}
                title="Click to open — edit details, due date, notes"
              >
                {/* Own hit target so it doesn't swallow the row's open-modal click
                    (that was the bug: this used to be the title span itself,
                    covering nearly the whole row and stopping propagation). */}
                <span
                  onClick={(e) => { e.stopPropagation(); advance(t); }}
                  title="Click to advance status"
                  style={{
                    width: 14, height: 14, borderRadius: "50%", flexShrink: 0,
                    border: `2px solid ${t.status === "done" ? C.done : C.border}`,
                    background: t.status === "done" ? C.done : t.status === "in_progress" ? C.doing : "transparent",
                    cursor: "pointer",
                  }}
                />
                <span
                  style={{
                    fontSize: 12, flex: 1, lineHeight: 1.3,
                    textDecoration: t.status === "done" ? "line-through" : "none",
                    color: overdue ? C.high : C.text,
                  }}
                >
                  {t.title}
                  {overdue && <span style={{ marginLeft: 5, fontSize: 8, color: C.high, fontFamily: "var(--font-pixel)" }}>OVERDUE</span>}
                </span>
                <span
                  onClick={(e) => { e.stopPropagation(); deleteTask(t.id); }}
                  style={{ color: C.muted, cursor: "pointer", fontSize: 10, flexShrink: 0 }}
                >
                  ✕
                </span>
              </div>
            );
          })
        )}
        {tab === "done" && shown.length > 0 && (
          <button onClick={clearDone} style={{ ...pixel(), fontSize: 8, width: "100%" }}>CLEAR DONE</button>
        )}
      </div>

      {editingTask && (
        <TaskEditModal task={editingTask} onSave={saveEdited} onClose={() => setEditingTask(null)} />
      )}
    </div>
  );
}
