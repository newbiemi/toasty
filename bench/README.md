# bench/ — does Toasty actually understand what you type?

Three checks, all headless. No window opens.

```bash
npm run bench          # the gate: does task capture read dates, times and links right?
npm run bench:adjust   # does "clear everything overdue" change the right rows — and undo?
npm run bench:chat     # does the chat cat still answer sensibly? (calls Groq for real)

npm run bench:live     # re-record Groq's answers for the parse benchmark
npm run bench:adjust -- "push the payroll file to Friday"   # try one instruction by hand
```

They run under Electron, not plain `node`. `better-sqlite3` is compiled against
Electron's ABI and will not load otherwise — `npm run bench` compiles `main/` into
`bench/.build/` and runs it under `electron` for you.

## Why the parse benchmark scores three things, not one

`npm run bench` reports the same 40 phrases three ways:

| Track | What it is |
|---|---|
| **Groq on its own** | what the cloud model answered, untouched |
| **Rule parser on its own** | what `main/parseRules.ts` finds with no model at all |
| **What the app uses** | the two combined, exactly as `providers/groq.ts` does it |

Combining them into one number hides the failure that actually matters. The app
cross-checks the model against the rule parser, so a date the model got *right* is
thrown away whenever the regexes miss it — and that looks identical to the model
being wrong. Split out, the report says which one to go fix. The output has a
section for each cause: right answers the safety check threw away, answers Groq
got wrong, and answers where the two disagreed.

## Today's numbers

Recorded 2026-09-06, model `openai/gpt-oss-120b`:

```
Groq on its own           52 of 64     81%   made things up: 0   usable titles: 40/40
Rule parser on its own    64 of 64    100%   made things up: 0   usable titles: 34/40
What the app uses         64 of 64    100%   made things up: 0   usable titles: 40/40
```

Each side is better at a different half of the job. The rule parser reads dates
off words that are literally in the text, so it cannot fabricate one and cannot
get weekday arithmetic wrong — it gets 33/33 due dates where Groq gets 21/33.
Groq is better at the judgement calls: it writes a usable title for all 40 phrases
where the rule parser manages 34. So `crossCheck()` takes dates, times and links
from the rules and everything else from Groq.

## The pass bar

`bar.json`, agreed with Fahmi on 2026-09-06:

- at least **60 of 64** details right (94%)
- **zero** invented details — the app may never produce a date, time or link that
  wasn't in what the user typed
- at most **2 of 40** unusable titles

The four-miss headroom is deliberate: the rule parser was fixed against these
exact 40 phrases, so 100% today is partly self-fulfilling. New fixtures should be
able to land without the gate going red. The zero-invention line never moves.

## Adding a fixture

Add an entry to `fixtures/parse.json`. A key inside `expect` is scored; a key you
leave out is not. `"dueDate": null` is a real check — it means "must not invent
one". After adding fixtures with new phrasings, re-record Groq's side:

```bash
npm run bench:live
```

## Dates are pinned, not live

`fixtures/parse.json` sets `referenceDate` to 2026-09-16, and everything —
`ruleParse`, the prompt Groq sees, the expected answers — resolves against that
one date via `setNow()` in `main/dateUtils.ts`. A fixture that expects "tomorrow"
therefore scores the same on any day the benchmark is run. Change the reference
date and you must re-record, and the runner refuses to replay a stale recording
rather than quietly scoring against the wrong day.

Two other things that would otherwise make runs non-reproducible are also pinned:
the category list (`setKnownCategories()` — otherwise it reads whatever tasks are
in the real database that week) and, in `adjust-smoke.js`, the database itself,
which is seeded fresh in a temp directory and never touches
`%APPDATA%\Roaming\toasty\toasty.db`.

## Rate limits

Groq's free tier caps **tokens** per minute (8,000), not requests, and one parse
costs about 1,000. `bench:live` paces itself at 9 seconds between calls and
retries on a 429, so a full recording takes about six minutes. Fire them off
back-to-back and most come back rate-limited, which in the report looks exactly
like the model refusing to answer.
