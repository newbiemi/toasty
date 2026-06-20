import Head from "next/head";
import React, { useState, useEffect, useRef } from "react";

const C = {
  cream: "#f4e4c1",
  panel: "#ecd9b0",
  border: "#5a3e2b",
  text: "#5a3e2b",
  muted: "#9a7a5a",
  orange: "#e8943b",
};

type Message = { role: "user" | "assistant"; content: string; tasksSaved?: number };

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const next: Message[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const { reply, added } = await window.toasty.chat(next);
      setMessages((prev) => [...prev, { role: "assistant", content: reply, tasksSaved: added.length }]);
    } catch (err: any) {
      const msg = err?.message
        ? `(${err.message})`
        : "(Toasty is offline or timed out — check Ollama)";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: msg },
      ]);
    }
    setLoading(false);
    inputRef.current?.focus();
  };

  return (
    <>
      <Head>
        <style>{`
          html, body, #__next {
            margin: 0; padding: 0; overflow: hidden;
            background: ${C.panel};
            font-family: 'JetBrains Mono', monospace;
            width: 360px; height: 460px;
          }
          * { box-sizing: border-box; }
          ::-webkit-scrollbar { width: 4px; }
          ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 0; }
          textarea::placeholder { color: ${C.muted}; }
        `}</style>
      </Head>

      <div style={{
        width: 360, height: 460,
        display: "flex", flexDirection: "column",
        border: `3px solid ${C.border}`,
        overflow: "hidden",
      }}>
        {/* Drag bar / header */}
        <div style={{
          height: 30, background: C.border, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 8px",
          WebkitAppRegion: "drag",
          userSelect: "none",
        } as React.CSSProperties}>
          <span style={{
            color: C.cream, fontSize: 8,
            fontFamily: "'Press Start 2P', monospace",
          }}>
            🐱 toasty chat
          </span>
          <button
            onClick={() => window.toasty.closeChat()}
            style={{
              WebkitAppRegion: "no-drag",
              background: "transparent", border: "none",
              color: C.cream, cursor: "pointer",
              fontSize: 14, lineHeight: 1, padding: "0 2px",
            } as React.CSSProperties}
          >
            ✕
          </button>
        </div>

        {/* Message list */}
        <div style={{
          flex: 1, overflowY: "auto",
          padding: "8px 8px 4px",
          display: "flex", flexDirection: "column", gap: 6,
        }}>
          {messages.length === 0 && !loading && (
            <div style={{
              color: C.muted, fontSize: 8,
              fontFamily: "'Press Start 2P', monospace",
              textAlign: "center", marginTop: 48, lineHeight: 2,
            }}>
              meow! what&apos;s on your mind?
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "85%",
            }}>
              <div style={{
                background: m.role === "user" ? C.orange : C.cream,
                color: m.role === "user" ? "#fff" : C.text,
                border: `2px solid ${C.border}`,
                padding: "6px 8px",
                fontSize: 11, lineHeight: 1.5,
                whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}>
                {m.content}
              </div>
              {!!m.tasksSaved && m.tasksSaved > 0 && (
                <div style={{
                  fontSize: 8, color: C.orange,
                  fontFamily: "'Press Start 2P', monospace",
                  marginTop: 3,
                }}>
                  ✓ {m.tasksSaved} task{m.tasksSaved > 1 ? "s" : ""} saved to dashboard
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div style={{ alignSelf: "flex-start", maxWidth: "85%" }}>
              <div style={{
                background: C.cream, border: `2px solid ${C.border}`,
                padding: "6px 8px", fontSize: 11, color: C.muted,
              }}>
                thinking…
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div style={{
          height: 52, flexShrink: 0,
          display: "flex", alignItems: "center",
          borderTop: `2px solid ${C.border}`,
          padding: "0 6px", gap: 4,
          background: C.panel,
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
              if (e.key === "Escape") window.toasty.closeChat();
            }}
            placeholder="message toasty… (Enter to send)"
            disabled={loading}
            rows={2}
            style={{
              flex: 1, resize: "none",
              background: "transparent", border: "none", outline: "none",
              color: C.text, fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
              padding: "4px 2px", lineHeight: 1.4,
            }}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            style={{
              background: loading || !input.trim() ? C.panel : C.orange,
              color: loading || !input.trim() ? C.muted : "#fff",
              border: `2px solid ${C.border}`,
              padding: "4px 8px", fontSize: 8,
              cursor: loading || !input.trim() ? "default" : "pointer",
              fontFamily: "'Press Start 2P', monospace",
              flexShrink: 0, alignSelf: "center",
            }}
          >
            {loading ? "…" : "SEND"}
          </button>
        </div>
      </div>
    </>
  );
}
