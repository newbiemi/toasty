# 🐱 Toasty — Local Pixel-Cat Task Companion

> A comnyang-style desktop pet that accompanies you while vibe-coding.
> Holds your tasks, reminds you of deadlines, chats, and captures thoughts — all **100% offline**.

---

## What Toasty Does

| Feature | Description |
|---|---|
| **Pixel-cat companion** | Animated sprite (idle / thinking / alert / happy / sleep) lives on your screen while you code |
| **Task management** | Add, adjust, and view tasks in list / kanban / calendar views |
| **Chat companion** | Click the cat → chat with it; ask it to add or adjust tasks in natural language |
| **Task reminders** | Cat switches to *alert* state + speech bubble when a task is due |
| **Quick capture** | Click the cat in pet mode → type a thought → AI parses it into a task |
| **Fully offline** | No Supabase, no cloud AI — local SQLite + Ollama on your machine |

---

## Stack

| Layer | Tech |
|---|---|
| **Shell** | Electron (via Nextron) |
| **UI** | Next.js 14, React 18, TypeScript — inline styles, JetBrains Mono, dark theme |
| **Storage** | `better-sqlite3` → `%APPDATA%/Toasty/toasty.db` |
| **AI** | Ollama (`llama3.2:3b` by default) — parse tasks, chat, adjust |
| **Window modes** | Pet overlay (transparent, always-on-top) ↔ Normal window — toggleable |

---

## Current State

> **Phase 0** — legacy Next.js web app (Supabase + cloud AI). Still functional for task parsing
> but being replaced by the Electron + Ollama architecture described here.

Active phases:

- [ ] **Phase 1** — Nextron scaffold + SQLite migration (replace Supabase, dashboard stays intact)
- [ ] **Phase 2** — Pixel cat + window modes (pet overlay ↔ normal window)
- [ ] **Phase 3** — Chat + reminders (cat animation) + click-to-capture

---

## Quick Start (Phase 0 — legacy web app)

Prerequisites: Node.js 18+, a running Groq/Gemini/Claude API key.

```bash
cd personal_projects/pet_assistant/toasty
npm install
cp .env.local.example .env.local
# Fill in your AI_PROVIDER + API key in .env.local
npm run dev
# Open http://localhost:3000
```

---

## Ollama Setup (Phase 1+)

```bash
# Install Ollama → https://ollama.com
ollama pull llama3.2:3b
ollama serve
# Toasty calls localhost:11434 — no API key needed
```

---

## Sprite Assets

Drop your pixel-cat frames into `public/cat/<state>/`:

```
public/cat/
  idle/       idle_01.png … idle_04.png
  thinking/   thinking_01.png …
  alert/      alert_01.png …
  happy/      happy_01.png …
  sleep/      sleep_01.png …
```

See `public/cat/PROMPTS.md` for ready-to-use nano-banana-pro generation prompts.

---

## Project Structure

```
main/               Electron main process (SQLite, Ollama, reminders, windows)
preload/            IPC bridge → window.toasty.*
renderer/           Next.js UI (TaskDashboard, Cat, ChatPanel, QuickCapture)
  app/
  components/
  lib/
  types/
  public/cat/       Sprite assets
```

---

Built by Fahmi — a $0/month, internet-optional coding companion.
