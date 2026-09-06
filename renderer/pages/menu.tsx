import { useEffect, useState } from "react";
import { C, pixel, inputStyle, fieldLabel } from "@/lib/theme";

type SectionId = "settings" | "ai" | "appearance" | "data" | "about";

const SECTIONS: { id: SectionId; label: string; icon: string }[] = [
  { id: "settings", label: "Settings", icon: "⚙" },
  { id: "ai", label: "AI", icon: "🤖" },
  { id: "appearance", label: "Look", icon: "🎨" },
  { id: "data", label: "Data", icon: "🗑" },
  { id: "about", label: "About", icon: "ℹ" },
];

type UpdateStatus =
  | { type: "checking" }
  | { type: "available"; version: string }
  | { type: "not-available" }
  | { type: "progress"; percent: number }
  | { type: "downloaded"; version: string }
  | { type: "error"; message: string };

const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 };
const label: React.CSSProperties = { fontFamily: "var(--font-pixel)", fontSize: 9, color: C.text, minWidth: 100 };

export default function MenuPage() {
  const [activeId, setActiveId] = useState<SectionId>("settings");

  // Settings
  const [openAtLogin, setOpenAtLogin] = useState(false);
  const [skipTaskbar, setSkipTaskbar] = useState(false);
  const [quietEnabled, setQuietEnabled] = useState(false);
  const [quietFrom, setQuietFrom] = useState(22);
  const [quietTo, setQuietTo] = useState(6);

  // AI
  const [model, setModel] = useState("");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [groqKeyDraft, setGroqKeyDraft] = useState("");
  const [groqApiKey, setGroqApiKey] = useState("");
  const [geminiKeyDraft, setGeminiKeyDraft] = useState("");
  const [aiProvider, setAiProvider] = useState<"groq" | "ollama">("groq");
  const [ollamaStatus, setOllamaStatus] = useState<"running" | "offline" | "checking">("checking");

  // Appearance
  const [opacity, setOpacity] = useState(1.0);
  const [spriteFolder, setSpriteFolder] = useState("");
  const [spriteFolderDraft, setSpriteFolderDraft] = useState("");

  // Data & Reset
  const [resetBusy, setResetBusy] = useState<"" | "settings" | "tasks" | "all">("");
  const [resetMsg, setResetMsg] = useState("");

  // About
  const [appVersion, setAppVersion] = useState("");
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    window.toasty.getSettings().then((s) => {
      setOpenAtLogin(s.openAtLogin ?? false);
      setSkipTaskbar(s.skipTaskbar ?? false);
      setQuietEnabled(s.quietHoursEnabled ?? false);
      setQuietFrom(s.quietFrom ?? 22);
      setQuietTo(s.quietTo ?? 6);
      setModel(s.model ?? "");
      const key = s.groqApiKey ?? "";
      setGroqApiKey(key);
      setGroqKeyDraft(key);
      setGeminiKeyDraft(s.geminiApiKey ?? "");
      setAiProvider(s.aiProvider ?? "groq");
      setOpacity(s.opacity ?? 1.0);
      setSpriteFolder(s.spriteFolder ?? "");
      setSpriteFolderDraft(s.spriteFolder ?? "");
    });
    window.toasty.listModels().then(setAvailableModels);
    window.toasty.getVersion().then(setAppVersion);
    window.toasty.checkOllama().then(setOllamaStatus);
    const unsubOllama = window.toasty.onOllamaStatus(setOllamaStatus);
    const unsubUpdate = window.toasty.onUpdateStatus(setUpdateStatus);
    return () => { unsubOllama(); unsubUpdate(); };
  }, []);

  const handleAutoLaunch = (v: boolean) => { setOpenAtLogin(v); window.toasty.setAutoLaunch(v); };
  const handleSkipTaskbar = (v: boolean) => { setSkipTaskbar(v); window.toasty.setSkipTaskbar(v); };
  const handleQuietEnabled = (v: boolean) => { setQuietEnabled(v); window.toasty.setSettings({ quietHoursEnabled: v }); };
  const handleQuietFrom = (v: number) => { setQuietFrom(v); window.toasty.setSettings({ quietFrom: v }); };
  const handleQuietTo = (v: number) => { setQuietTo(v); window.toasty.setSettings({ quietTo: v }); };
  const handleOpacity = (v: number) => { setOpacity(v); window.toasty.setOpacity(v); };
  const saveSpriteFolder = (path: string) => {
    setSpriteFolder(path);
    setSpriteFolderDraft(path);
    window.toasty.setSettings({ spriteFolder: path });
  };
  const browseSpriteFolder = async () => {
    const picked = await window.toasty.chooseSpriteFolder();
    if (picked) saveSpriteFolder(picked);
  };
  const handleAiProvider = (v: "groq" | "ollama") => { setAiProvider(v); window.toasty.setSettings({ aiProvider: v }); };

  const runReset = async (which: "settings" | "tasks" | "all") => {
    const warnings: Record<typeof which, string> = {
      settings: "Reset all settings except your Groq key? A backup is kept.",
      tasks: "Delete every task? A backup is kept, but this can't be undone from here.",
      all: "Wipe EVERYTHING — settings, Groq key, and every task? A backup is kept.",
    } as const;
    if (!window.confirm(warnings[which])) return;
    setResetBusy(which);
    setResetMsg("");
    try {
      if (which === "settings") {
        const r = await window.toasty.resetSettings();
        setResetMsg(r.backup ? `Done — backup at ${r.backup}` : "Done — nothing to back up");
      } else if (which === "tasks") {
        const r = await window.toasty.resetTasks();
        setResetMsg(r.backup ? `Done — backup at ${r.backup}` : "Done — nothing to back up");
      } else {
        const r = await window.toasty.resetAll();
        setResetMsg(`Done — ${r.backups.filter(Boolean).length} backup(s) kept`);
      }
    } catch (err: any) {
      setResetMsg(err?.message ?? "Reset failed");
    }
    setResetBusy("");
  };

  return (
    <div style={{
      width: "100vw", height: "100vh", overflow: "hidden",
      display: "flex", background: C.cream, color: C.text,
      fontFamily: "var(--font-mono)", border: `3px solid ${C.border}`, boxSizing: "border-box",
    }}>
      {/* Left rail */}
      <div style={{
        display: "flex", flexDirection: "column", width: 68, flexShrink: 0,
        background: C.rail, borderRight: `2px solid ${C.border}`,
        WebkitAppRegion: "drag",
      } as React.CSSProperties}>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveId(s.id)}
            style={{
              background: s.id === activeId ? C.railActive : "transparent",
              border: "none", borderBottom: `1px solid ${C.border}33`,
              padding: "10px 0", cursor: "pointer", color: C.text,
              display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
              WebkitAppRegion: "no-drag",
            } as React.CSSProperties}
          >
            <span style={{ fontSize: 15 }}>{s.icon}</span>
            <span style={{ fontSize: 7, fontFamily: "var(--font-pixel)" }}>{s.label}</span>
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => window.toasty.closeMenu()}
          style={{
            border: "none", background: "transparent", color: C.muted,
            padding: "10px 0", cursor: "pointer", fontSize: 12,
            WebkitAppRegion: "no-drag",
          } as React.CSSProperties}
          title="Close"
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0, padding: 16, overflowY: "auto" }}>
        {activeId === "settings" && (
          <div>
            <label style={{ ...row, cursor: "pointer" }}>
              <input type="checkbox" checked={openAtLogin} onChange={(e) => handleAutoLaunch(e.target.checked)} style={{ accentColor: C.orange }} />
              <span style={{ fontSize: 11 }}>Start on login</span>
            </label>
            <label style={{ ...row, cursor: "pointer" }}>
              <input type="checkbox" checked={skipTaskbar} onChange={(e) => handleSkipTaskbar(e.target.checked)} style={{ accentColor: C.orange }} />
              <span style={{ fontSize: 11 }}>Hide from taskbar</span>
            </label>
            <div style={{ borderTop: `1px solid ${C.border}33`, margin: "10px 0" }} />
            <label style={{ ...row, cursor: "pointer" }}>
              <input type="checkbox" checked={quietEnabled} onChange={(e) => handleQuietEnabled(e.target.checked)} style={{ accentColor: C.orange }} />
              <span style={{ fontSize: 11 }}>Quiet hours (cat sleeps)</span>
            </label>
            {quietEnabled && (
              <div style={row}>
                <span style={label}>FROM</span>
                <input type="number" min={0} max={23} value={quietFrom}
                  onChange={(e) => handleQuietFrom(Math.max(0, Math.min(23, parseInt(e.target.value) || 0)))}
                  style={{ ...inputStyle, fontSize: 11, width: 56 }} />
                <span style={label}>TO</span>
                <input type="number" min={0} max={23} value={quietTo}
                  onChange={(e) => handleQuietTo(Math.max(0, Math.min(23, parseInt(e.target.value) || 0)))}
                  style={{ ...inputStyle, fontSize: 11, width: 56 }} />
                <span style={{ fontSize: 9, color: C.muted }}>24h, e.g. 22 → 6</span>
              </div>
            )}
          </div>
        )}

        {activeId === "ai" && (
          <div>
            <div style={row}>
              <span style={label}>PROVIDER</span>
              <select value={aiProvider} onChange={(e) => handleAiProvider(e.target.value as "groq" | "ollama")} style={{ ...inputStyle, fontSize: 11, width: 140 }}>
                <option value="groq">Groq (cloud)</option>
                <option value="ollama">Ollama (local)</option>
              </select>
            </div>
            <div style={row}>
              <span style={label}>GROQ KEY</span>
              <input
                type="password" value={groqKeyDraft}
                onChange={(e) => setGroqKeyDraft(e.target.value)}
                onBlur={() => { const v = groqKeyDraft.trim(); setGroqApiKey(v); window.toasty.setSettings({ groqApiKey: v }); }}
                placeholder="gsk_…" style={{ ...inputStyle, fontSize: 11, width: 180 }}
              />
              <span style={{ fontSize: 9, color: groqApiKey ? C.done : C.muted }}>{groqApiKey ? "✓ active" : "not set"}</span>
            </div>
            <div style={row}>
              <span style={label}>GEMINI KEY</span>
              <input
                type="password" value={geminiKeyDraft}
                onChange={(e) => setGeminiKeyDraft(e.target.value)}
                onBlur={() => window.toasty.setSettings({ geminiApiKey: geminiKeyDraft.trim() })}
                placeholder="optional fallback leg" style={{ ...inputStyle, fontSize: 11, width: 180 }}
              />
            </div>
            <div style={row}>
              <span style={label}>OLLAMA MODEL</span>
              <input
                list="ollama-models" value={model}
                onChange={(e) => setModel(e.target.value)}
                onBlur={() => { if (model.trim()) window.toasty.setSettings({ model: model.trim() }); }}
                placeholder="llama3.2:1b" style={{ ...inputStyle, fontSize: 11, width: 140 }}
              />
              <datalist id="ollama-models">{availableModels.map((m) => <option key={m} value={m} />)}</datalist>
              <span style={{ fontSize: 9, color: ollamaStatus === "running" ? C.done : C.muted }}>
                {ollamaStatus === "running" ? "✓ running" : "offline"}
              </span>
            </div>
          </div>
        )}

        {activeId === "appearance" && (
          <div>
            <div style={row}>
              <span style={label}>OPACITY</span>
              <input type="range" min={0.2} max={1} step={0.05} value={opacity}
                onChange={(e) => handleOpacity(parseFloat(e.target.value))}
                style={{ width: 140, accentColor: C.orange }} />
              <span style={{ fontSize: 10 }}>{Math.round(opacity * 100)}%</span>
            </div>
            <p style={{ fontSize: 9, color: C.muted, maxWidth: 260 }}>
              Applies to the widget, this menu, capture, and chat — the cat stays fully opaque.
            </p>
            <div style={{ borderTop: `1px solid ${C.border}33`, margin: "10px 0" }} />
            <div style={row}>
              <span style={label}>SPRITE FOLDER</span>
              <input
                value={spriteFolderDraft}
                onChange={(e) => setSpriteFolderDraft(e.target.value)}
                onBlur={() => saveSpriteFolder(spriteFolderDraft.trim())}
                placeholder="(built-in cat)" style={{ ...inputStyle, fontSize: 11, width: 180 }}
              />
              <button onClick={browseSpriteFolder} style={{ ...pixel(), fontSize: 9 }}>BROWSE</button>
            </div>
            {spriteFolder && (
              <button onClick={() => saveSpriteFolder("")} style={{ ...pixel(), fontSize: 9, marginBottom: 6 }}>
                USE BUILT-IN CAT
              </button>
            )}
            <p style={{ fontSize: 9, color: C.muted, maxWidth: 260 }}>
              A folder holding toasty-cat-grid.json / toasty-faces-grid.json / toasty-motion.json
              exported from Loom (the sprite editor). Restart Toasty after changing this.
            </p>
          </div>
        )}

        {activeId === "data" && (
          <div>
            <div style={{ marginBottom: 14 }}>
              <button onClick={() => runReset("settings")} disabled={!!resetBusy} style={{ ...pixel(), fontSize: 9, width: 220 }}>
                {resetBusy === "settings" ? "…" : "RESET SETTINGS"}
              </button>
              <p style={{ fontSize: 9, color: C.muted, margin: "4px 0 0" }}>Keeps your Groq key. Backs up first.</p>
            </div>
            <div style={{ marginBottom: 14 }}>
              <button onClick={() => runReset("tasks")} disabled={!!resetBusy} style={{ ...pixel(), fontSize: 9, width: 220, color: C.high }}>
                {resetBusy === "tasks" ? "…" : "DELETE ALL TASKS"}
              </button>
              <p style={{ fontSize: 9, color: C.muted, margin: "4px 0 0" }}>Backs up the database first.</p>
            </div>
            <div style={{ marginBottom: 14 }}>
              <button onClick={() => runReset("all")} disabled={!!resetBusy} style={{ ...pixel(), fontSize: 9, width: 220, color: C.high }}>
                {resetBusy === "all" ? "…" : "FACTORY RESET"}
              </button>
              <p style={{ fontSize: 9, color: C.muted, margin: "4px 0 0" }}>Wipes settings (incl. your key) and tasks.</p>
            </div>
            {resetMsg && <p style={{ fontSize: 10, color: C.done }}>{resetMsg}</p>}
          </div>
        )}

        {activeId === "about" && (
          <div>
            <p style={{ fontSize: 12, fontFamily: "var(--font-pixel)", marginBottom: 10 }}>Toasty v{appVersion}</p>
            {updateStatus?.type === "downloaded" && (
              <div style={{ marginBottom: 10 }}>
                <p style={{ fontSize: 10, color: C.done, marginBottom: 4 }}>v{(updateStatus as any).version} downloaded and ready.</p>
                <button onClick={() => window.toasty.installUpdate()} style={{ ...pixel(true), fontSize: 9 }}>RESTART &amp; INSTALL</button>
              </div>
            )}
            {updateStatus?.type === "available" && <p style={{ fontSize: 10, color: C.muted }}>⬇ Downloading v{(updateStatus as any).version}…</p>}
            {updateStatus?.type === "progress" && <p style={{ fontSize: 10, color: C.muted }}>⬇ {(updateStatus as any).percent}%</p>}
            {(!updateStatus || updateStatus.type === "not-available") && <p style={{ fontSize: 10, color: C.muted }}>Up to date.</p>}
            {updateStatus?.type === "error" && <p style={{ fontSize: 10, color: C.high }}>Update check failed: {(updateStatus as any).message}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
