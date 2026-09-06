import { useState } from "react";
import type { Task } from "@/types/task";
import { mergeAdjusted } from "@/lib/mergeAdjusted";
import { C, pixel, inputStyle, fieldLabel } from "@/lib/theme";

// Extracted from the old TaskDashboard.tsx Kanban view (Phase 3 split). Kept on
// window.toasty.adjust (the single-task, groqAdjust path) deliberately, not
// folded into the selector engine (main/adjust.ts): this modal edits a local
// draft and nothing reaches the DB until SAVE, with a Cancel that discards —
// the selector engine's apply() writes immediately in one transaction. Those
// are different semantics, not the same feature twice.
export default function TaskEditModal({
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
  const [adjustError, setAdjustError] = useState("");
  const [newLink, setNewLink] = useState("");
  const [newSubtask, setNewSubtask] = useState("");

  const set = (patch: Partial<Task>) => setT((prev) => ({ ...prev, ...patch }));

  const handleAdjust = async () => {
    if (!adjustText.trim()) return;
    setAdjusting(true);
    setAdjustError("");
    try {
      const result = await window.toasty.adjust(JSON.stringify(t), adjustText.trim());
      if (Array.isArray(result) && result.length > 0) {
        setT((prev) => mergeAdjusted(prev, result[0]));
      } else if (result && typeof result === "object") {
        setT((prev) => mergeAdjusted(prev, result));
      }
      setAdjustText("");
    } catch (err: any) {
      setAdjustError(err?.message ?? "Adjust failed — check your Groq key in Settings 🐾");
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
          width: 400, maxHeight: "88vh", overflowY: "auto",
          padding: 16, boxSizing: "border-box",
          display: "flex", flexDirection: "column", gap: 10,
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

        {/* AI Adjust — single-task path, see note at top of file */}
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
          {adjustError && (
            <p style={{ margin: "4px 0 0", fontSize: 10, color: "#e06c75" }}>{adjustError}</p>
          )}
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
