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

`npm run bench` reports the same 43 phrases three ways:

| Track | What it is |
|---|---|
| **Groq on its own** | what the cloud model answered, untouched |
| **Rule parser on its own** | what `main/parseRules.ts` finds with no model at all |
| **What the app uses** | the two combined, exactly as `providers/groq.ts` does it |

Combining them into one number hides the failure that actually matters. The rule
parser is authoritative for dates, times and links, so a date the model got
*right* is discarded whenever the regexes disagree — and in a single number that
looks identical to the model being wrong. Split out, the report says which side to
go fix. The output has a section per cause: right answers the cross-check threw
away, answers Groq got wrong, and answers where the two disagreed.

## Today's numbers

Recorded 2026-09-06, model `openai/gpt-oss-120b`, 43 phrases / 69 details:

```
Groq on its own           59 of 69     86%   made things up: 0   usable titles: 43/43
Rule parser on its own    69 of 69    100%   made things up: 0   usable titles: 34/43
What the app uses         69 of 69    100%   made things up: 0   usable titles: 43/43
```

Each side is better at a different half of the job. The rule parser reads dates
off words that are literally in the text, so it cannot fabricate one and cannot
get weekday arithmetic wrong — it gets 35/35 due dates where Groq gets 25/35.
Groq is better at the judgement calls: it writes a usable title for all 43 phrases
where the rule parser manages 34. So `crossCheck()` takes dates, times and links
from the rules and everything else from Groq.

## The pass bar

`bar.json`, agreed with Fahmi on 2026-09-06:

- at least **94%** of details right (65 of 69 today)
- **zero** invented details — the app may never produce a date, time or link that
  wasn't in what the user typed
- at most **2** unusable titles

The headroom is deliberate: the rule parser was fixed against these exact phrases,
so 100% today is partly self-fulfilling. New fixtures should be able to land
without the gate going red. The zero-invention line never moves.

Three fixtures exist specifically to defend that line, because the rule parser is
now authoritative over Groq for dates — which means a regex false positive doesn't
just add a wrong date, it overrides a right one. `ordinal-not-a-date` ("review the
3rd candidate"), `ordinal-round-not-a-date` ("the 2nd interview round") and
`number-not-a-time` ("look at 5 applications") all expect nothing at all.

## Adding a fixture

Add an entry to `fixtures/parse.json`. A key inside `expect` is scored; a key you
leave out is not. `"dueDate": null` is a real check — it means "must not invent
one". After adding fixtures with new phrasings, re-record Groq's side:

```bash
npm run bench:live
```

## Dates are pinned, not live

`fixtures/parse.json` sets `referenceDate` to 2026-09-16 (a Wednesday, so weekday
arithmetic has somewhere to go in both directions), and everything —
`ruleParse`, the prompt Groq sees, the expected answers — resolves against that
one date via `setNow()` in `main/dateUtils.ts`. A fixture that expects "tomorrow"
therefore scores the same on any day the benchmark is run. Change the reference
date and you must re-record; the runner refuses to replay a recording made against
a different reference date or a different model, rather than quietly scoring
against the wrong day or the wrong answers.

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
