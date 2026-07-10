# App Brief: Toasty (pixel-cat desktop companion)

_Owner sections: 1–2 = app-architect · 3 = ui-ux-advisor · 4 = brand-designer
· 5 = stakeholder-comms + app-lab · 6 = app-lab (append-only) · 7 = stakeholder-comms_

_This brief was backfilled onto an existing codebase (Phase 11 already shipped)
via `/app-architect continue`, not created from a fresh scaffold. Sections 1–2
were inferred from `toasty/CLAUDE.md` and confirmed with Fahmi on 2026-07-10._

## 1. Product
- **One-sentence job:** An on-screen pixel-cat desktop companion that holds
  your tasks/reminders and chats via cloud AI (Groq), with a deterministic
  offline fallback so it never freezes the machine.
- **Audience:** Just Fahmi today, but **may be shared with others later** —
  design/scale decisions should keep that door open rather than assume
  permanently single-user.
- **Repo root:** `personal_projects/` (already placed correctly, no change).
- **Platforms today:** Windows only (Electron via Nextron, NSIS installer,
  tray, autostart, global hotkey). **Gap vs. the standing Windows+Android+
  iPhone goal:** Electron does not extend to mobile — Fahmi confirmed he's
  thinking about bringing Toasty to phone later (see Section 2 forward note).
- **Budget ceiling:** Currently on Groq's free tier — fine for now; watch
  token usage if usage grows or if this is ever shared with others (free-tier
  rate limits are typically per-account, so multiple users sharing one key
  would hit them faster than Fahmi solo).
- **Cutting-edge vs proven preference:** Confirmed — Toasty is explicitly an
  ongoing phase-by-phase experiment (SVG cat lab, iterative rewrites), not a
  "just needs to work reliably" utility. Bias toward exploration here is
  intentional, unlike the general default in `reference/stack-selection.md`.

## 2. Stack & rationale
- **Chosen stack (current, Phase 10–11):** Electron (via Nextron) shell +
  Next.js 14 (Pages Router) / React 18 / TypeScript renderer + `better-sqlite3`
  local storage + Groq cloud API (primary AI: parse/chat/adjust) + Ollama
  (local, chat-only fallback, explicit opt-in).
- **Why:** The product needs OS-level capabilities no PWA can offer — a
  frameless always-on-top transparent overlay, system tray, autostart,
  global hotkey (`Ctrl+Shift+T`), and per-pixel click-through hit-testing.
  This is the correct call per `reference/stack-selection.md`'s Tauri/Electron
  guidance for "desktop-first, phone secondary/none" — which was true when
  this stack was chosen.
- **Rejected/superseded alternatives (from project history):**
  - Original web app (Next.js + Supabase) — dropped because a browser tab
    can't provide the always-on-top pet overlay or tray presence that's
    core to the product.
  - Fully-local Ollama on the parse/chat hot path — reverted (Phase 10) after
    CPU-inference freeze risk on non-GPU hardware; replaced with Groq cloud
    as primary + a deterministic rule-parser fallback that can never freeze.
- **Forward-looking note (not yet decided, flagged for a future session):**
  Fahmi is thinking about bringing Toasty to phone, and its audience may
  expand beyond himself. Two things about the *current* stack matter for
  that future decision, per `reference/scalability.md`'s migrate-trigger
  guidance:
  1. **Local-only SQLite is the real blocker for both moves**, not Electron
     itself — a phone companion and/or multiple users both need task data
     to live somewhere syncable, not solely in one machine's
     `%APPDATA%/Roaming/toasty/toasty.db`. The existing one-time
     Supabase→SQLite migration script shows Toasty already has a path back
     to a shared cloud DB if/when that's wanted.
  2. **Electron itself cannot become the phone app** — reaching iPhone/Android
     will mean a second, separate codebase (most likely Expo/React Native,
     per `reference/stack-selection.md`), sharing the *concept* and possibly
     the cloud data layer, not the Electron shell.
  This is intentionally **not scoped or built now** — it's a decision for a
  dedicated future `/app-architect` session once Fahmi is ready to commit to
  it, so as not to scope-creep this backfill pass.

## 3. Design system

_Reviewed 2026-07-10 via `/ui-ux-advisor` — scope: the main dashboard flow
(`renderer/components/TaskDashboard.tsx`). This flow already exists and
ships; this pass is a review + token extraction, not a redesign._

**Information architecture:** already sound — one primary action (the Add
bar) above the fold, kanban board as the main view, full task detail pushed
into `TaskModal` rather than crowding the card. No rework needed.

**Design-system tokens (extracted from existing code, not newly designed):**
- Palette (`const C` in `TaskDashboard.tsx`): `cream #f4e4c1` (page bg),
  `tan #f8eed5` (input/card bg), `panel #ecd9b0` (chrome bg), `border/text
  #5a3e2b`, `muted #9a7a5a`, `orange #e8943b` / `orangeDark #d96b27`
  (primary accent), status colors `todo #a8855c` / `doing #e8943b` /
  `done #7a9b4e`, priority colors `high #c0492f` / `medium #c8880a` /
  `low #5a7a3a`.
- Type: `--font-pixel` (headers/labels/badges, small sizes 8-11px, wide
  letter-spacing) + `--font-mono` (body/input text, 11-13px). No formal
  scale beyond these two roles and ad hoc sizes today.
- Primitives: `borderRadius: 0` everywhere (deliberate — hard-edged pixel
  aesthetic), `2px solid` borders as the standard component edge.
- **Not yet formalized as CSS custom properties / theme config** — values
  live as a local `const C` object in this one file. Fine at current scale;
  worth centralizing if a second component needs the same palette.

**Interaction-state findings (logged, not fixed per Fahmi's call):**
1. **Real gap — silent stuck state:** `handleAdd`'s manual-add fallback
   (`TaskDashboard.tsx` ~line 573-587) calls `await window.toasty.saveTask(t)`
   with no `try/catch`. If that IPC call throws, `setParsing(false)` (line
   588) never runs — input stays disabled, button stuck on "...", no error
   shown, no recovery short of restarting the app. Suggested fix when
   picked up: wrap in try/catch mirroring the AI-parse path just above it.
2. **Minor:** no explicit loading state before `loaded` flips true — kanban
   columns briefly show "empty" instead of a loading indicator. Usually
   invisible given fast local SQLite IPC.

**Accessibility findings (baseline level — audience is "just Fahmi today,
may share later"):**
- `KanbanCard`'s root `<div onClick>` (opens edit modal) and the delete
  `<span onClick>` are mouse-only — no `tabIndex`/keyboard handler, so
  unreachable via keyboard. (Header buttons — PET/⚙/minimize/close — are
  real `<button>`s and are fine.)
- `C.muted (#9a7a5a)` on `C.cream` background, used pervasively at 9-11px
  for dates/categories, looks like it may be under WCAG AA contrast at that
  size — not verified with a contrast tool yet; worth checking before this
  is ever shared with someone else.

**Brand note:** Toasty already has a distinctive, intentional identity (the
cream/tan/orange pixel palette + `--font-pixel`) — it just isn't documented
in Section 4 yet. That's `/brand-designer`'s job to formalize (document, not
rebrand). No fresh aesthetic decision was needed for this pass, so the
`frontend-design` process wasn't invoked here — there was nothing new to
design on an already-shipped, already-distinctive screen.

**Next up:** `/brand-designer` to formally document the existing identity
into Section 4.

## 4. Brand

_Documented 2026-07-10 via `/brand-designer` — Toasty already has a
distinctive, intentional identity (confirmed both by code inspection and by
`/ui-ux-advisor`'s Section 3 note). This is a **documentation pass, not a
rebrand.** No new logo/mark was designed — see Logo below._

**Palette** (source: `renderer/pages/_document.tsx` global styles +
`TaskDashboard.tsx`'s `const C`):
| Role | Hex | Used for |
|---|---|---|
| Background | `#f4e4c1` (cream) | page bg |
| Surface | `#f8eed5` (tan) | inputs/cards |
| Chrome | `#ecd9b0` (panel) | title bar, panels |
| Text / border | `#5a3e2b` | primary text, all borders |
| Muted text | `#9a7a5a` | secondary/meta text |
| Accent | `#e8943b` (orange) / `#d96b27` (orangeDark) | primary action |
| Status | todo `#a8855c` · doing `#e8943b` · done `#7a9b4e` | kanban columns |
| Priority | high `#c0492f` · medium `#c8880a` · low `#5a7a3a` | task badges |

**Contrast — actual WCAG ratios (relative-luminance formula, Step 4), not
eyeballed:**
- Text `#5a3e2b` on cream `#f4e4c1`: **7.73:1** — comfortably passes (needs 4.5:1).
- Muted `#9a7a5a` on cream `#f4e4c1`: **3.15:1** — **fails** for the small
  (9-11px) text it's used on (needs 4.5:1; only clears the 3:1 large-text/UI
  floor). Confirms `/ui-ux-advisor`'s Section 3 suspicion with real numbers.
- White `#fff` on accent orange `#e8943b` (the active "+ ADD" button text):
  **2.40:1** — **fails even the 3:1 UI-component floor.** This is a new
  finding `/ui-ux-advisor`'s pass didn't catch (it flagged muted-text only) —
  the primary action's own button text is the lowest-contrast pairing in the
  app.
- High-priority badge text `#c0492f` on badge bg `#fde8e4`: **4.22:1** — a
  near-miss just under the 4.5:1 floor for its ~9px all-caps label.
- **Logged as findings only, not fixed** — same "advise, don't silently
  rewrite shipped code" discipline `/ui-ux-advisor` used. If picked up later:
  darkening `muted` and/or using `orangeDark`/`text` instead of white-on-orange
  for button text are the cheapest fixes.

**Type pairing** (source: `_document.tsx` `@font-face` + CSS vars):
- Display/pixel role (`--font-pixel`): **Silkscreen** (self-hosted
  `.woff2`, offline-safe — no Google Fonts), falling back to JetBrains Mono
  → monospace. Used for headers, labels, badges at small sizes (8-11px)
  with wide letter-spacing — this is the "pixel-craft" voice of the app.
- Body/mono role (`--font-mono`): **JetBrains Mono**, falling back to Fira
  Code → monospace. Used for input text, task titles, body content.
- Both fonts are self-hosted/system fallbacks only — consistent with
  Toasty's fully-offline-safe design constraint (no external font CDN calls).

**Logo / mark:** `renderer/components/CatSvg.tsx` (inline pixel-grid SVG,
two variants — `full` for the pet overlay, `head` for the dot-mode icon) is
already Toasty's mark, with `scripts/generate-icons.js` deriving the app/tray
PNG icons from the *same* cell data so the mark and icons can't drift apart.
This is exactly the hand-authored-SVG pattern this skill would otherwise
recommend building from scratch — **no new logo needed.**

**Naming:** "Toasty" — settled. Already used throughout commits, the app's
own `app.setName("toasty")` call, and all prior conversation; not
re-litigated per this skill's own guidance not to second-guess a name
already in shipped use.

**Tone/voice:** Warm, playful, present-but-unobtrusive companion voice —
evidenced by the cat's named emotional states (`idle`/`thinking`/`alert`/
`happy`/`sleep`) driving real UI feedback, and the "comnyang-style" character
design language referenced in the project's own `CLAUDE.md`. Matches Section
1's "just Fahmi today" personal-tool audience — informal and characterful is
the right register here, per `reference/naming-and-tone.md`.

## 5. Roadmap

_Shared by /app-lab and /stakeholder-comms — each item tagged with its
source so neither skill clobbers the other's entries. This brief predates
the Now/Next/Later convention, so /app-lab created these subheads on its
first pass (2026-07-10)._

### Now
- [app-lab] Fix silent-hang in `handleAdd`'s manual-save fallback
  (`TaskDashboard.tsx`, no `try/catch` around `saveTask`) — small effort,
  code-level confirmed reachable (see Section 6); prevents a full add-task
  UI lockup on any DB write failure.

### Next
- [app-lab] Contrast fixes: muted text 3.15:1 and primary button text
  2.40:1 (see Section 4) both need real fixes, not just documentation —
  small effort each, touch shared style constants, worth batching together.
- [app-lab] Near-miss: high-priority badge text at 4.22:1 vs. 4.5:1 needed —
  small effort, lower urgency than the two failures above.
- [stakeholder] Before Toasty is shown to anyone beyond Fahmi, fix the
  Now-tier silent-hang bug first — a stuck "..." button with no explanation
  is a bad first impression for a future stakeholder, even though it's a
  minor annoyance for Fahmi alone today.

### Later
- [app-lab] Formalize the `const C` palette into CSS custom properties —
  only worth it once a second component needs the same values (per Section 3).
- [app-lab] Toasty-to-phone / multi-user expansion — already flagged in
  Section 2 as a real but deliberately unscoped future decision; local-only
  SQLite is the actual blocker, not Electron itself. Not re-scoped here.

## 6. Test log

_Append-only. New entries added below; prior entries are never edited or
removed, even once a finding is fixed — a follow-up entry notes the fix._

**2026-07-10 — `/app-lab`, Electron desktop path (per `reference/testing-by-stack.md`):**
- **Method, stated honestly:** started the real dev server (`npm run dev`,
  Nextron + Electron) via `Bash` and read its console output. **Not
  Chrome-MCP-drivable** (that MCP only reaches Chrome tabs, not a separate
  Electron window), and no desktop-GUI-automation tool was available in this
  session to click through the live window myself — so this pass verifies
  what boot logs and source code can confirm, not a full interactive click-
  through. That gap is named honestly below rather than glossed over.
- **Findings:**
  1. Clean boot — Next.js renderer compiled and started (`Ready in 2.2s`),
     Electron main process launched, `/pet` route rendered `200`. No startup
     errors, no IPC registration failures visible in the log.
  2. **Verified `/ui-ux-advisor`'s logged silent-hang finding at the code
     level** (not just taking it on faith): read `main/db.ts` — `saveTask`
     is a synchronous `better-sqlite3` call with no surrounding try/catch at
     any layer (not in `db.ts`, and `TaskDashboard.tsx`'s fallback path
     doesn't wrap its call either). A real write failure (disk I/O, a locked
     WAL file, a constraint violation) would throw and reject the IPC
     promise uncaught — confirms the failure mode is real and reachable,
     not hypothetical. Promoted from "logged" to "code-verified" in the
     Section 5 entry above.
  3. **Not tested (tool gap, not skipped by choice):** live add/edit/drag
     interaction, the actual visual contrast issues on screen, and the
     always-on-top/tray/global-hotkey behaviors — all need a human hand on
     the real window. A manual test script for these was handed to Fahmi
     directly in conversation rather than fabricated here.
- **Caution for whoever runs the manual script:** dev and packaged builds
  share the same `toasty.db` (`app.setName("toasty")` unifies the path per
  the project's own `CLAUDE.md`) — any task added while testing lands in
  Fahmi's real task list, not a sandboxed test DB. Use an obviously-fake
  title and delete it after.

## 7. Stakeholders

_Mapped 2026-07-10 via `/stakeholder-comms`. Kept deliberately light — per
`reference/stakeholder-mapping.md`, a personal tool's stakeholder map should
be proportionate to its actual audience, not a formal register built ahead
of need._

- **Fahmi (primary, today):** high interest, high influence — he's both the
  sole user and the sole decision-maker. Cares about the app staying
  reliable and not freezing (already the driving design decision behind the
  Groq/rule-parser fallback in Section 2) and about it continuing to be a
  space for experimentation (Section 1's confirmed "phase-by-phase" mode).
  No pitch/persuasion needed for this tier — see `pitch-and-demo.md`'s
  Personal tier.
- **Future stakeholder(s) — not yet concrete:** Section 1 explicitly leaves
  the door open to sharing Toasty with others later, but no specific person
  or group has been named yet. Not fabricating a stakeholder here — revisit
  this section for real once Fahmi has someone specific in mind, per this
  skill's own "ask, don't assume" guidance (deferred rather than pressed,
  since Fahmi's flagged this as a topic for a dedicated future Toasty
  session, not this pass).

**One `[stakeholder]` roadmap addition** (Section 5, `### Next`, added this
pass): before Toasty is shown to anyone beyond Fahmi, the Now-tier bug (silent
hang in `handleAdd`'s fallback save) should be fixed first — a stuck "..."
button with no explanation is a bad first impression for a future stakeholder
even though it's a minor annoyance for Fahmi alone today.

**No pitch/demo script or requirement-gathering deliverable was built this
pass** — none was asked for, and with the only real stakeholder being Fahmi
himself today, persuasion framing doesn't apply yet (per the Personal tier
in `pitch-and-demo.md`). Revisit when a concrete future stakeholder exists.
