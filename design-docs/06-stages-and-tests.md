# CodeAlong — Stage Gates & Test Plan

## Stage Gates

This is the progress tracker. Each stage has a one-line gate: **don't move on until the gate passes** (ideally as an automated test). Week numbers follow the IS216 schedule — progress pitch materials are due **Week 9 Monday 23:59**; final submission is **Week 12 Friday 9:00 am** (we aim for Thursday).

| # | Stage | Target | Gate (must be true before moving on) |
|---|---|---|---|
| 0 | Design lock | Week 8 | All nine design docs reviewed by all six members; open questions in [08-workload-split.md](./08-workload-split.md#open-questions) answered |
| 1 | Skeleton | Week 8 | `supabase start` + `pnpm dev` boots; `supabase db reset` applies every migration from scratch; the app reads one seeded row through RLS; **a WebContainer boots and serves a preview**; one Playwright smoke test passes |
| 2 | Platform | Week 8 | Register/login/logout via Supabase Auth, course create + enrol, role guards; **every table has RLS enabled and one negative test** |
| 3 | **Live session core (pitch demo)** | Week 9 Mon | Prof starts session → 3 students join by code → **their containers boot and the preview runs** → checkpoint broadcast reaches all 3 → a typo turns a tile red → student loads checkpoint → tile turns green |
| 4 | Lessons | Week 9 | Upload starter → review files → edit starter files and details → lesson `ready` |
| 5 | Status & dashboard | Week 10 | `session_tiles` returns correct state for all 5 cases; idle derives without a write; filters; anonymous slow-down count |
| 6 | Catch-up | Week 10 | Load checkpoint warns first, offers a .zip download, then replaces the code with the checkpoint |
| 7 | Help flow | Week 10 | Check my work → pass/reply; Ask for help → claim/resolve; **a replied request can be followed up**; Telegram ping (mock in tests) |
| 8 | Replay & GitHub | Week 11 | Replay steps through all checkpoints; notes; download a checkpoint's code; import + export (one commit per checkpoint) |
| 9 | ~~Error groups~~ | Week 11 | Dropped: live Common errors and Spotlight removed; the AI help summary (AIH) replaces them |
| 10 | Insights | Week 11 | Report built in SQL when the class ends; trouble score + trends; digest sent (mock in tests) |
| 11 | Hardening | Week 11–12 | Validation + error states everywhere; responsive pass 375 → 1440 px; load test 40 students passes **inside the Realtime free-tier cap** |
| 12 | Demo ready | Week 12 | Fresh clone → README steps → `supabase db reset` → all journeys green → deployed URL works (incl. the `/join/:code` deep link) → keep-alive scheduled → video recorded |

### Pattern checks per stage (reviewer ticks these in the PR)

| Stage | Required pattern |
|---|---|
| 1 | Migrations are additive and re-runnable; `supabase db reset` passes from zero; COOP/COEP headers present in dev and on Vercel |
| 2 | **No table without `enable row level security`**; credentials handled only by Supabase Auth (nothing password-shaped in our tables); views declared `security_invoker = true`; the sign-up trigger allow-lists the role; every table has an `admin reads all` policy and no other admin policy |
| 3 | Writes go through RPCs where the client must not decide; broadcasts sent from the RPC, not the client; reconnect re-subscribes and re-reads |
| 4 | Parser is a pure function in `shared/` with unit tests; prof reviews before saving |
| 5 | **No `state` column anywhere**; tile state derived in `session_tiles`; staff queries select no code columns; **build errors pass through `parseBuildError()` before `normalizeError()`** |
| 6 | The student is warned and can download before anything is replaced; a `package.json` change tells them to run `pnpm install` |
| 7 | Claim is a single conditional update (zero rows = conflict); the Telegram webhook cannot fail the student's request; replies append to `thread`, never overwrite |
| 8 | No GitHub token in any row we own; import limited to safe file types and size |
| 9 | ~~Spotlight only uses help-request snapshots~~ (Spotlight dropped) |
| 10 | Report contains counts only, no `student_id` |
| 11 | Every page usable at 375 px; every interactive element has a `data-testid` |

---

## Testing

The tests are few and each one earns its place. **The six Playwright journeys are the main suite.** Each follows one person or one class through a whole story, in the browser, against the local stack. Underneath them sit a small set of database tests for who may see what, and a set of unit tests for logic that has many edge cases and no screen.

| Layer | Tool | Count | What it proves |
|---|---|---:|---|
| **E2E journeys** (main) | Playwright, Chromium | 6 journeys, 54 steps | The app's main user stories work, with several browser contexts at once (prof + TAs + students) |
| **RLS / privacy** | Vitest + `supabase-js` | 42 | Authorization lives in the database, so sign in as the wrong person and assert **zero rows** |
| **Unit** | Vitest | 148 | Pure logic (`shared/`, the parsers, the cache and autosave) and the Edge Function handlers, run with fakes |
| Load | `scripts/simulate-class.js` (not written) | 0 | 40 Realtime clients in one class, inside the free-tier cap |

Not tested on purpose: how a component renders, what a store holds, and what an API function passes to `supabase`. A journey fails when any of those break, and then says which step.

### Why RLS gets its own layer

The browser queries Postgres directly, so "a student cannot read another student's code" is true only because of a policy. A single missing `enable row level security` makes a table world-readable through the public anon key. A journey cannot see that, because it only ever signs in as people who are allowed. So the privacy tests sign in as the wrong person:

```js
it("a student cannot read another student's autosave", async () => {
  const { data } = await bea.from('snapshots').select('*').eq('student_id', alexId)
  expect(data).toEqual([])            // not an error: the rows simply do not exist
})
```

A sweep over the schema stops a new table or view being merged without its policy: `tables_without_rls()` and the view sweep must be empty, and every table has exactly one `admin reads all` policy and no other admin policy (T-PRIV-06, T-PRIV-07, T-ADM-09).

---

## The journeys

Every journey makes its own people and its own classes (`e2e/classroom.js`) and deletes them afterwards, so the seeded demo data (Prof Lee's course, the live class CART42) is never changed. Prof Tan's course and its Mini Cart lesson are the only seeded rows they use, read-only. Each journey is split into `test.step`s named in plain words, so a failure says which part of the story broke.

| # | Journey | The story | Time |
|---|---|---|---:|
| 1 | A student's account, from signing up to deleting it | Sign up and land where they were going. Kept out of prof pages. Join a class with its code, which enrols them. Archive the course (its classes won't open), restore it, leave it. Rename, change the password (a wrong current one is refused), log in with the new one, delete the account | 3 s |
| 2 | A prof sets up a course and teaches a whole class | A new prof creates a course, uploads a project folder as a lesson, starts a class. Three students arrive: one mistypes the code, one uses the QR link, one only has the class link and is turned away until they use the code. Announce, a late joiner sees it, clear it. A student edits and moves files, and it is all saved. Done and Slow down reach the prof as numbers. A checkpoint resets Done and a student loads it. End the class: the report (attendance, funnel, hardest checkpoint), saving stops, the old code is refused. Afterwards a student keeps a note in the replay, finds it by search, sees their own code, downloads it and exports it to GitHub (a mock) | 45 s |
| 3 | Students get help from the TAs in every way the help bar offers | Check my work (arrives without code, claimed, a second TA turned away, passed, cancelled). Ask for help (AI analysis, the student's code opened in the TA's own tab, a reply, a follow-up with a fresh copy of the code, a second reply that keeps the first). In-person requests: nobody on Telegram, then a ping to the TA's phone. Then the AI summary of what the class is stuck on, the report's "stuck on" list, and the digest | 9 s |
| 4 | A student runs the code, breaks it and fixes it, and the prof watches | `pnpm i && pnpm dev` in the real terminal and the app appears in the preview. A bad line puts the student in the prof's **Error** group, with no help request. Fixing it takes them out. Done moves them to **Done**. Needs the npm registry | 30 s |
| 5 | A prof manages their course, its people and its lessons | Enrol code, link, QR and Copy. A student enrols from the link, another mistypes first. Remove a student. Add a TA by email (an unknown email is refused) and remove them. Hide a lesson from students and bring it back. Move it to another week (not a taken one). Edit its files and details. Archive, unarchive and delete a lesson. A lesson that has been taught can only be archived. Rename, archive and restore the course. Delete an empty one | 26 s |
| 6 | On a phone (`@responsive`, 375 px only) | No sideways scrolling, the ☰ menu, the editor and the preview switch, and the Teach view's Dashboard and Editor tabs | 2 s |

**Journeys 2 and 3 are the stage 3 gate and the demo script**: a prof starts a class, three students join, a checkpoint reaches them, one catches up, and the help queue works.

### What the journeys cannot reach

- **Admin page, Present mode, the free-tier limit pop-up:** no journey yet. Listed so nobody assumes they are covered.
- **Anything that needs a real GitHub or Telegram login:** GitHub sign-in and the role chooser, linking Telegram from Profile. The mock functions cover export, import and the pings; the sign-in screens are checked by hand.
- **Dropping a whole folder on New lesson:** Playwright cannot fake a dragged folder. Journey 2 uploads a folder through the file picker.
- **A page asking for files from before a deploy:** `router-errors` was removed with the component tests. Check it by hand after a deploy.

---

## Privacy and permission tests (`tests/unit/rls/`)

They run against the local stack and each starts `// @vitest-environment node`. Names starting `T-PRIV` come from the privacy contract in [09 §5](./09-integration-contracts.md).

| File | What it checks |
|---|---|
| `schema` | Every table has RLS on; every view is `security_invoker` (T-PRIV-06, T-PRIV-07) |
| `admin` | Every table has exactly one `admin reads all` select policy and no other admin policy (T-ADM-09) |
| `profiles` | A student cannot promote themselves, sees only their own profile, and editing auth metadata changes nothing (T-PLAT-10, T-PLAT-13) |
| `courses` | A prof never sees another prof's course (T-PLAT-15); a student cannot create one; a student sees their staff but never other students (T-PRIV-11) |
| `sessions` | A status row has no `state` and no code, a student reads only their own row and tile, and who asked to slow down is never readable (T-STAT-09, T-PRIV-01, T-PRIV-04) |
| `help_notes_reports` | Staff read the snapshot sent with a help request; other courses' staff and classmates cannot (T-PRIV-03); a student reads only their own requests; notes are private (T-PRIV-05); reports are not readable by students; raw Slow down events are admin-only |
| `help_rpcs`, `session-rpcs`, `lessons`, `session_report` | The second TA to claim is refused; a TA or student cannot start, checkpoint or end a class; a student sees only ready lessons; another prof never sees my trends |
| `slow_down_present`, `tile-state` | Slow down stays a count; the SQL classifier agrees with `classify()` in `shared/` |
| `autosave`, `session-channel`, `test_outbox`, `delete_account`, `github-export` | Staff and outsiders cannot write a student's autosave; outsiders cannot join a class channel; the outbox is not readable by users; deleting an account removes only the caller's rows; no GitHub token is stored |
| `seed` | The documented accounts log in with their roles; a seeded student cannot read a classmate's code |

## Logic tests (`tests/unit/`)

| Area | Files |
|---|---|
| The tile-state rule | `tile-state` |
| Errors | `error-normalizer` (grouping), `build-error` (what reaches the dashboard, never code), `mapError` |
| Code in and out | `lesson-files`, `lesson-template` (the error probe), `sync-files` (what may be synced), `utils/imports` |
| Diffs | `diff-summary`, `diff-rows` |
| Join codes and Telegram | `join-code`, `telegram` |
| Saving and caching | `autosave`, `files-cache`, `idb`, `runtime/install` (the package cache), `runtime/sync` |
| Navigation | `router-guards` |
| Edge Functions, run with fakes | `analyze-help`, `summarize-help`, `telegram-functions`, `digest-function`, `github-export`, `github-import`, `outbox` |

A test ID in a test's name (T-HELP-05, T-SBX-19) is a label from an earlier version of this document, kept so the tests can still be found in old issues and PRs. It is not a promise that a matching entry exists here. New tests do not need one.

---

## Making tests repeatable and stable

| Ask | How |
|---|---|
| Repeatable | `supabase start` runs Postgres, Auth, Realtime and Functions locally. Every journey makes its own data and deletes it, so they can run in any order, twice in a row, and leave no trace. `workers: 1` |
| No external flakiness | `EXTERNAL_APIS=mock` makes the Telegram, GitHub and LLM functions append to `test_outbox` instead of calling out. **The Edge Functions must be served in mock mode** (below), or the AI analysis calls the real model. Only journey 4 touches the network, for `pnpm i` |
| Stable selectors | `getByTestId()`, `getByRole()` and visible text, never CSS classes. The ids are in [09](./09-integration-contracts.md#9-data-testid-convention). An icon's glyph is part of a button's role name, so a few buttons are found by their text |
| No arbitrary waits | `expect(...).toHaveText()` auto-waits. A 15 s action timeout makes a missing button fail at once instead of at the end of a long journey |
| Logging in | `login(email)` plants a Supabase session in `localStorage` (no form), and `login(email, { githubToken })` does it as if the user had signed in with GitHub. Journey 1 uses the real forms, because it signs out |
| Responsive | Two projects: `desktop-chrome` (1280×800, skips `@responsive`) and `mobile-chrome` (375×667, runs only `@responsive`) |

## How to run (goes in the README)

```bash
# Docker must be running; the local stack needs it
cd codeAlong
pnpm install
pnpm exec playwright install chromium
pnpm exec supabase start                  # Postgres + Auth + Realtime + Functions
pnpm exec supabase db reset               # migrations + seed.sql (wipes local data)

pnpm exec vitest run                      # unit + RLS tests, ~20 s (the RLS ones need the stack)

# in a second terminal, so the Edge Functions run in mock mode
pnpm exec supabase functions serve --env-file e2e/functions.env
pnpm test:e2e                             # the six journeys, ~3 min; starts `pnpm dev` itself
pnpm exec playwright show-report          # HTML report with traces for any failure
```

If the stack is not running, `pnpm test:e2e` stops at once with a message saying so.
