# CodeAlong — Stage Gates & Test Plan

## Stage Gates

This is the progress tracker. Each stage has a one-line gate: **don't move on until the gate passes** (ideally as an automated test). Week numbers follow the IS216 schedule — progress pitch materials are due **Week 9 Monday 23:59**; final submission is **Week 12 Friday 9:00 am** (we aim for Thursday).

| # | Stage | Target | Gate (must be true before moving on) |
|---|---|---|---|
| 0 | Design lock | Week 8 | All nine design docs reviewed by all six members; open questions in [08-workload-split.md](./08-workload-split.md#open-questions) answered |
| 1 | Skeleton | Week 8 | `supabase start` + `pnpm dev` boots; `pnpm db:reset` applies every migration from scratch; the app reads one seeded row through RLS; **a WebContainer boots and serves a preview**; one Playwright smoke test passes |
| 2 | Platform | Week 8 | Register/login/logout via Supabase Auth, course create + enrol, role guards; **every table has RLS enabled and one negative test** |
| 3 | **Live session core (pitch demo)** | Week 9 Mon | Prof starts session → 3 students join by code → **their containers boot and the preview runs** → checkpoint broadcast reaches all 3 → a typo turns a tile red → student loads checkpoint → tile turns green |
| 4 | Lessons | Week 9 | Upload starter → review files → edit starter files and details → lesson `ready` |
| 5 | Status & dashboard | Week 10 | `session_tiles` returns correct state for all 5 cases; idle derives without a write; filters; anonymous slow-down count |
| 6 | Catch-up | Week 10 | Load checkpoint warns first, offers a .zip download, then replaces the code with the checkpoint |
| 7 | Help flow | Week 10 | Check my work → pass/reply; Ask for help → claim/resolve; **a replied request can be followed up**; Telegram ping (mock in tests) |
| 8 | Replay & GitHub | Week 11 | Replay steps through all checkpoints; notes/bookmarks; import + export (one commit per checkpoint) |
| 9 | Error groups & Spotlight | Week 11 | Grouping matches unit-test expectations; Spotlight shows an anonymised excerpt to everyone |
| 10 | Insights | Week 11 | Report written by the `end-session` function; trouble score + trends; digest sent (mock in tests) |
| 11 | Hardening | Week 11–12 | Validation + error states everywhere; responsive pass 375 → 1440 px; load test 40 students passes **inside the Realtime free-tier cap** |
| 12 | Demo ready | Week 12 | Fresh clone → README steps → `db:reset` → all E2E green → deployed URL works (incl. the `/join/:code` deep link) → keep-alive scheduled → video recorded |

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
| 9 | Spotlight only uses help-request snapshots; names and comments removed |
| 10 | Report contains counts only, no `student_id` |
| 11 | Every page usable at 375 px; every interactive element has a `data-testid` |

---

## Testing Strategy

| Layer | Tool | Scope | Why it matters for the rubric |
|---|---|---|---|
| **E2E** (main) | Playwright, Chromium | Every main user journey, with **multiple browser contexts in one test** (prof + TA + students) | "Tests cover the app's main user journeys" |
| Unit | Vitest | Pure logic in `shared/`: classifier, normaliser, checkpoint labels, diff summary, build-error parser, report builder, spotlight excerpt; plus the IndexedDB cache and delta-autosave logic | Shows understanding of testing concepts; fast feedback |
| **RLS** (new) | Vitest + `supabase-js` | Authorization as data: sign in as the wrong user, assert **zero rows** | Authorization is now the database's job, so it needs its own tests |
| Load | `scripts/simulate-class.js` | 40 Realtime clients in one session | Proves the live dashboard holds up in a real class, and that we fit the free tier |

### Why RLS gets its own layer

In the Express design, "a student cannot read another student's code" was true because **no route existed**. T-PRIV-02 asserted a 404. The browser now queries Postgres directly, so absence proves nothing — the guarantee lives entirely in policies, and a single missing `enable row level security` makes a table world-readable through the public anon key.

So every policy gets a test that signs in as the wrong person and asserts the row is invisible:

```js
// tests/unit/rls/snapshots.test.js
it("a student cannot read another student's autosave", async () => {
  const bea = await signIn('bea@codealong.test')
  const { data } = await bea.from('snapshots').select('*').eq('student_id', alexId)
  expect(data).toEqual([])            // not an error — the rows simply do not exist
})

it('staff can read a snapshot the student sent via a help request', async () => {
  const ta = await signIn('ta.ana@codealong.test')
  const { data } = await ta.from('snapshots').select('*').eq('id', sentSnapshotId)
  expect(data).toHaveLength(1)
})
```

A companion test sweeps the schema so a new table cannot be merged without policies:

```js
it('every public table has RLS enabled', async () => {
  const { data } = await admin.rpc('tables_without_rls')   // helper defined in a migration
  expect(data).toEqual([])
})
```

### Making tests repeatable and stable

| Rubric ask | How |
|---|---|
| Repeatable | `supabase start` runs Postgres + Auth + Realtime + Functions locally; `supabase db reset` re-applies all migrations and `seed.sql` before each spec file; E2E runs with `workers: 1` |
| No external flakiness | `EXTERNAL_APIS=mock` makes the Telegram/GitHub/LLM functions append to `test_outbox`; tests read that table with the service role key |
| Stable selectors | Only `getByTestId()` and `getByRole()` — never CSS classes or text that may change. Convention in [09-integration-contracts.md](./09-integration-contracts.md#9-data-testid-convention) |
| No arbitrary waits | `await expect(locator).toHaveText(...)` auto-waits; no `waitForTimeout` except the idle-state test, which shortens `idleAfterSec` via session settings |
| Clear structure | One spec file per feature; `test.describe` per journey; Arrange → Act → Assert comments; shared fixtures |
| Responsive | Two Playwright projects: `desktop-chrome` (1280×800) and `mobile-chrome` (375×667, `isMobile`, `hasTouch`). Specs tagged `@responsive` run on both |
| Docker dependency | `supabase start` needs Docker. The README documents it, and `pnpm test:e2e` fails with a clear message if the daemon is not running |

### Fixture sketch — `tests/e2e/fixtures.js`

```js
import { test as base, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const URL = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY

// Sign in through Supabase Auth, then plant the session in localStorage so the
// page is already logged in — the equivalent of the old API-login shortcut.
async function loginContext(browser, email, password = 'pass1234') {
  const sb = createClient(URL, ANON)
  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  expect(error).toBeNull()

  const context = await browser.newContext()
  await context.addInitScript(([key, session]) => {
    window.localStorage.setItem(key, JSON.stringify(session))
  }, [`sb-${new URL(URL).hostname.split('.')[0]}-auth-token`, data.session])

  return { context, page: await context.newPage() }
}

export const test = base.extend({
  prof:     async ({ browser }, use) => { const s = await loginContext(browser, 'prof@codealong.test'); await use(s.page); await s.context.close() },
  ta:       async ({ browser }, use) => { const s = await loginContext(browser, 'ta.ana@codealong.test'); await use(s.page); await s.context.close() },
  students: async ({ browser }, use) => {
    const emails = ['alex@codealong.test', 'bea@codealong.test', 'chen@codealong.test']
    const sessions = await Promise.all(emails.map(e => loginContext(browser, e)))
    await use(sessions.map(s => s.page))
    await Promise.all(sessions.map(s => s.context.close()))
  },
})
export { expect }
```

> The one fiddly part of this rewrite: the Supabase session lives in `localStorage` under a project-scoped key, not in a cookie, so `addInitScript` replaces `context.request.post('/api/auth/login')`. **Owner: Karin**, and worth getting right in Week 8 — every E2E spec depends on it.

### Example journey — `tests/e2e/live-session.spec.js`

Unchanged from the Mongo design, which is the point: the tests describe behaviour, not plumbing.

```js
test('a typo turns the tile red and catching up turns it green', async ({ prof, students }) => {
  const [alex] = students
  // Arrange: prof starts the seeded Mini Cart lesson
  await prof.goto('/courses')
  await prof.getByTestId('course-card-IS216').click()
  await prof.getByTestId('lesson-start-mini-cart').click()
  const code = await prof.getByTestId('join-code').innerText()

  // Act: Alex joins, prof saves checkpoint 1, Alex introduces a typo
  await alex.goto(`/join/${code}`)
  await expect(alex.getByTestId('workspace-checkpoint')).toContainText('Checkpoint 1')
  await prof.getByTestId('btn-save-checkpoint').click()
  await alex.getByTestId('editor').click()
  await alex.keyboard.type('itmes.push(1)')
  await alex.keyboard.press('Control+S')

  // Assert: red on the prof's dashboard, with the grouped error
  const tile = prof.getByTestId(/tile-.*/).filter({ hasText: 'Alex' })
  await expect(tile).toHaveAttribute('data-state', 'error')

  // Act + Assert: catch up → green after Done
  await alex.getByTestId('btn-load-checkpoint').click()
  await alex.getByRole('button', { name: 'Replace my code' }).click()
  await alex.getByTestId('btn-done').click()
  await expect(tile).toHaveAttribute('data-state', 'done')
})
```

---

## Test Plan

**Layer:** E2E = Playwright · Unit = Vitest on `shared/` · **DB** = `supabase-js` signed in as a specific user (replaces the old "Int" API-level layer) · RLS = negative authorization test · Load = simulator. Each ID maps to the spec file in brackets.

### PLAT — Accounts, courses, roles (platform) · `platform.spec.js`

| ID | Test | Layer | Expected |
|---|---|:---:|---|
| T-PLAT-01 | Register as Student, and as Educator | E2E | `profiles.role` is `student` / `prof` respectively, set by the trigger; lands on `/courses` |
| T-PLAT-02 | Register duplicate email / short password | E2E | zod field errors shown; values kept; Supabase rejects the duplicate |
| T-PLAT-03 | Login wrong password vs unknown email | DB | Both fail with the same generic message |
| T-PLAT-04 | Protected page while logged out | E2E | Redirect to `/login?returnTo=…`; after login, back to that page |
| T-PLAT-05 | Prof creates course | E2E | Course card shows enrol code |
| T-PLAT-06 | Student enrols with code / wrong code | E2E | Course appears / "No course with that code" from `enrol_with_code` |
| T-PLAT-07 | Prof adds TA by email | E2E | TA sees the course; `profiles.role` becomes `ta` |
| T-PLAT-08 | Student opens prof-only route | E2E | Toast + redirect; the equivalent query returns zero rows |
| T-PLAT-09 | **Credentials never touch our schema** | DB | No column in any `public` table holds a password or hash; `auth.users` is not readable with the anon key |
| T-PLAT-10 | **A student cannot promote themselves** | RLS | `update profiles set role='prof'` on own row is rejected by the policy's `with check` |
| T-PLAT-11 | Login rate limit | DB | Repeated failures throttled by Supabase Auth (platform-provided) |
| T-PLAT-12 | **Sign-up role allow-list** | DB | Sign-up metadata `role: 'admin'`, `'ta'`, `'xyz'` or missing → `student`; only `'prof'` → `prof` |
| T-PLAT-13 | **Editing auth metadata later changes nothing** | RLS | `auth.updateUser({ data: { role: 'prof' } })` after sign-up leaves `profiles.role` = `student` |
| T-PLAT-14 | **Course uniqueness is per prof** | DB | Two profs can each create "IS216 · AY2026/27 T1 · G2"; the same prof creating it twice → `CONFLICT` |
| T-PLAT-15 | **A prof never sees another prof's course** | RLS | Prof B selecting Prof A's course, lessons or sessions gets zero rows |
| T-PLAT-16 | **Enrol link** while logged in | E2E | `/enrol/<code>` enrols without typing and lands on the course page |
| T-PLAT-17 | **Enrol link as a brand-new student** | E2E | Link → log in → "Create an account" → register → back on the enrol link → enrolled (`returnTo` survives login *and* register) |
| T-PLAT-18 | A prof opens an enrol link | E2E | Toast + redirect (the route is students and TAs only; `enrol_with_code` would refuse anyway) |
| T-PLAT-19 | **A prof sees their course immediately after creating it** | RLS | `create_course` returns it, and a `select` on `courses` as that prof finds it (regression guard for the no-insert-policy design) |
| T-PLAT-20 | **Staff/student separation** | DB | A TA can enrol in a course they don't staff; enrolling in one they staff → `CONFLICT`; adding an enrolled student as TA → `CONFLICT` |
| T-PLAT-21 | **Profile updates still work alongside "read coursemates"** | RLS | A student renaming themselves succeeds and promoting themselves fails with `42501` — never `42P17` (regression guard for the recursion fix) |

### LESSON — Lessons · `lessons.spec.js`, `lesson-edit-view.test.js`

| ID | Test | Layer | Expected |
|---|---|:---:|---|
| T-LES-01 | Upload starter files → draft lesson | E2E | Lesson created as a draft with its files; opens in the editor |
| T-LES-02 | Edit a starter file and the lesson details | E2E | Saved; persists after reload |
| T-LES-03 | ~~Reorder steps~~ | — | Removed with lesson steps |
| T-LES-04 | ~~Delete step~~ | — | Removed with lesson steps |
| T-LES-05 | Unsafe path / > 20 files / > 200 KB | DB | `files_valid()` / `octet_length` constraint rejects the insert |
| T-LES-06 | Delete a lesson that was taught | DB | Trigger raises `CONFLICT` → UI offers Archive |
| T-LES-07 | What an enrolled student can read | RLS | A **draft** lesson: zero rows. A **ready** lesson: visible, with its starter `files` (RLS can't hide one column; starter files aren't secret — see [03](./03-data-model.md#policies-1)) |
| T-TODO-* | ~~TODO parser~~ | — | Removed with lesson steps |

### SESS — Live session engine · `live-session.spec.js`

| ID | Test | Layer | Expected |
|---|---|:---:|---|
| T-SESS-01 | Prof starts session | E2E | Join code (6 chars, no 0/O/1/I/L) + QR visible |
| T-SESS-02 | Start on a draft lesson | DB | `start_session` raises `CONFLICT` |
| T-SESS-03 | Student joins via code input and via `/join/:code` | E2E | Lands in the workspace on the latest checkpoint (or "Starter code") |
| T-SESS-04 | Non-enrolled user joins | E2E | "You're not in this course" |
| T-SESS-05 | Wrong / ended code | E2E | "No live class with that code" |
| T-SESS-06 | Checkpoint broadcast to 3 students | E2E | All 3 see the toast + the new checkpoint (and its title) within 2 s, and their status is back to In progress |
| T-SESS-07 | Student reconnects (go offline → online) | E2E | Pill shows Reconnecting… then Live; status re-read; checkpoint missed while offline is shown |
| T-SESS-08 | Two quick checkpoint saves | DB | Distinct `seq` 1, 2 — the unique index plus the RPC retry |
| T-SESS-09 | **Realtime subscribe without a session** | RLS | Anon client cannot subscribe to `session:<id>`; no messages received |
| T-SESS-10 | **Subscribe to another course's session channel** | RLS | Rejected by the `realtime.messages` policy |
| T-SESS-11 | Prof ends session | E2E | Students see "Class ended" banner with replay link |
| T-SESS-12 | Settings toggle (catch-up off) | E2E | Students' Load checkpoint button disabled with tooltip |
| T-SESS-13 | **Student calls `save_checkpoint`** | RLS | `FORBIDDEN` — the RPC checks `is_course_prof` |
| T-SESS-14 | Prof posts an announcement | E2E | Every student sees `announcement-banner` with the text within 2 s |
| T-SESS-15 | **Late joiner sees the current announcement** | E2E | A student who joins after it was sent sees it on load (read from `sessions.announcement`, not the broadcast) |
| T-SESS-16 | Prof clears the announcement | E2E | Banner disappears for everyone |
| T-SESS-17 | Student or TA calls `announce` | RLS | `FORBIDDEN` |
| T-SESS-18 | Announcement over 200 chars | DB | Check constraint rejects it |

### SBX — Workspace, runtime & cache · `workspace.spec.js`, `build-error.test.js`, `files-cache.test.js`

Rewritten for WebContainer. T-SBX-01/02/06 (srcdoc builder) and the old mock-API tests are gone; boot, install, build errors and the cache replace them.

| ID | Test | Layer | Expected |
|---|---|:---:|---|
| T-SBX-01 | Container boots and the dev server comes up | E2E | `BootState` goes booting → installing → starting → ready; preview renders the app |
| T-SBX-02 | `crossOriginIsolated` is true on the app origin | E2E | COOP/COEP headers present; without them the boot is skipped with a clear message |
| T-SBX-03 | Runtime error shown in console, gutter and status pill | E2E | File + line match the typo; `error.source === 'runtime'` |
| T-SBX-04 | `console.log` appears in the console panel | E2E | Entry visible |
| T-SBX-05 | **Preview cannot read our Supabase session** | E2E | The preview is a different origin: `localStorage` there is the project's own; `parent.document` access throws |
| T-SBX-06 | **Build error turns the tile red** | E2E | A broken `import` produces `error.source === 'build'` with file + line |
| T-SBX-07 | **Build error carries no code frame** | Unit | `parseBuildError()` on real Vite output returns `{name,message,file,line}` and **no** source lines |
| T-SBX-08 | Boot timeout | E2E | No `server-ready` within `BOOT_TIMEOUT_MS` → "Your project didn't start" + terminal tail + Retry |
| T-SBX-09 | Terminal output never leaves the browser | DB | After an install, no row in any table contains install/dev-server output |
| T-SBX-10 | `localStorage` works in the student's project | E2E | Cart persists across a reload — natively, with no shim |
| T-SBX-11 | Autosave + refresh | E2E | Edits restored after reload |
| T-SBX-18 | **Autosave fires 5 s after the last keystroke** | E2E | No write while typing continues; one write 5 s after it stops |
| T-SBX-19 | **Only changed files are sent** | Unit | Editing one file of twelve produces a one-entry `p_upsert` |
| T-SBX-20 | **An unchanged tree sends no request** | Unit | Debounce tick with no hash change issues zero calls |
| T-SBX-21 | **A failed save retries the same delta** | Unit | Synced hashes are not advanced on failure; the next tick resends |
| T-SBX-22 | Flush on tab close | E2E | `visibilitychange` writes immediately, losing none of the 5 s window |
| T-SBX-23 | Deleted file is removed server-side | E2E | Path appears in `p_delete`; gone from the autosave row |
| T-SBX-12 | Done disabled while the last run has an error | E2E | Button disabled with reason (runtime **or** build) |
| T-SBX-13 | **`SYNC_IGNORE` respected** | DB | After an install, no saved row contains a `node_modules/`, `dist/` or `.vite/` path |
| T-SBX-14 | **Cache hit costs no network** | Unit | Matching `files_hash` → `loadFiles` returns from IndexedDB with zero fetches |
| T-SBX-15 | **Cache miss and eviction** | Unit | Changed hash refetches; a wiped store still loads correctly (cache, not source of truth) |
| T-SBX-16 | File tree create / rename / delete | E2E | Reflected in the container FS and in the next autosave |
| T-SBX-17 | Unsupported browser | E2E | With isolation disabled, "The workspace needs Chrome or Edge" — not a blank pane |

### STAT — Status & derived state · `tile-state.test.js`, `dashboard.spec.js`

| ID | Test | Layer | Expected |
|---|---|:---:|---|
| T-STAT-01 | Before first checkpoint | Unit | `in_progress` (or `done` if Done on the starter, `done_seq = 0`) |
| T-STAT-02 | `done_seq` = latest checkpoint | Unit | `done` |
| T-STAT-03 | `done_seq` is an older checkpoint, or null | Unit | `in_progress` |
| T-STAT-04 | ~~Two or more behind~~ | — | Removed: there is no `behind` state; each checkpoint resets everyone |
| T-STAT-05 | Error overrides done | Unit | `error` |
| T-STAT-06 | Idle overrides everything | Unit | `idle` |
| T-STAT-07 | New checkpoint resets the class | E2E | Every Done (green) tile turns In progress (amber) with no status writes |
| T-STAT-08 | Idle after `idleAfterSec` (set to 5 s in test) | E2E | Tile grey; returns on activity |
| T-STAT-09 | **A student cannot forge their state** | DB | `student_status` has no `state` column; writing one is rejected |
| T-STAT-10 | **`shared/tile-state.js` agrees with `session_tiles`** | DB+Unit | Same inputs → same state from SQL and JS, across all 6 cases |
| T-STAT-11 | **A student cannot write another student's status** | RLS | Rejected by the `student_id = auth.uid()` policy |
| T-STAT-12 | **A student cannot write status after the session ends** | RLS | Policy requires `status = 'live'` |

### DASH — Dashboard · `dashboard.spec.js`

| ID | Test | Layer | Expected |
|---|---|:---:|---|
| T-DASH-01 | Summary card loads for a running session | E2E | Counts for the joined students |
| T-DASH-02 | Counts are what students clicked | Unit + DB | Done = Done on the latest checkpoint (even with an error since); help / check = open or claimed requests |
| T-DASH-03 | ~~Filter by clicking a summary segment~~ | — | Removed: no per-student tiles to filter |
| T-DASH-04 | "Slow down" from 2 students | E2E | Slow-down count = 2; nothing on the dashboard shows who |
| T-DASH-05 | Student un-taps "Slow down" | E2E | Count decrements |
| T-DASH-06 | TA (staff) can view dashboard; student cannot | RLS | TA gets tile rows; a student gets zero rows from `session_tiles` |
| T-DASH-07 | ~~Tiles show icon + label~~ | — | Removed: no per-student tiles |

### ERRG — Error groups & Spotlight · `error-normalizer.test.js`, `spotlight.test.js`, `spotlight.spec.js`

| ID | Test | Layer | Expected |
|---|---|:---:|---|
| T-ERRG-01 | Line/col and URLs stripped | Unit | Same `key` for two stacks differing only in line |
| T-ERRG-02 | Numbers masked | Unit | `status code <n>` |
| T-ERRG-03 | `items` vs `itmes is not defined` | Unit | Different `key`, same `shapeKey` |
| T-ERRG-04 | Group threshold (≥ 2 or ≥ 10%) | Unit | Singletons excluded |
| T-ERRG-05 | Same typo by 2 students | E2E | One group "×2" on the dashboard |
| T-ERRG-06 | Spotlight with an eligible help snapshot | E2E | All students see excerpt + fix |
| T-ERRG-07 | Excerpt anonymised | Unit | No student names, no comments, ≤ 30 lines |
| T-ERRG-08 | Spotlight with no help snapshot | E2E | Error + fix only, with explanation to prof |
| T-ERRG-09 | **Student invokes the `spotlight` function** | DB | `FORBIDDEN` — the function checks `is_course_prof` before using the service role |

### AIH — Help request analysis · `analyze-help.test.js`

| ID | Test | Layer | Expected |
|---|---|:---:|---|
| T-AIH-01 | Prompt has the checkpoint, the error, the student's code and the checkpoint region | Unit | All four present |
| T-AIH-02 | Comment lines dropped, `TODO` kept | Unit | A name in a comment never reaches the prompt |
| T-AIH-03 | Huge file | Unit | Prompt stays under the 6,000-character cap |
| T-AIH-04 | Valid reply | Unit | Fields kept; `stuckAt.checkpoint` from the request, not the model |
| T-AIH-05 | Unknown category, code block in `rootCause` | Unit | `other`; code block removed |
| T-AIH-06 | Help request analysed | Unit | `analysis` saved with `model` and `analyzedAt` |
| T-AIH-07 | "Check my work" request | Unit | Skipped; no LLM call |
| T-AIH-08 | Provider 429 or non-JSON reply | Unit | `{ status: 'failed' }` saved; nothing thrown |
| T-AIH-09 | `EXTERNAL_APIS=mock` | Unit | Prompt in `test_outbox` (`channel = 'llm'`); model never called |
| T-AIH-20 | No error: only the files that differ from the reference are sent | Unit | A changed file reaches the model however many unchanged files there are |
| T-AIH-21 | No error and code identical to the reference | Unit | Prompt says so; the model is told not to invent a mistake |
| T-AIH-22 | Files left out of the prompt | Unit | Listed by name, so the model never assumes they're missing |
| T-AIH-10 | Class summary grouping (`summarize-help.test.js`) | Unit | Students counted per `(checkpoint, category)` in code, biggest first |
| T-AIH-11 | Prompt 2 | Unit | Each group's key and count listed; diagnoses treated as data |
| T-AIH-12 | Prompt 2 reply | Unit | Model words on our groups; counts unchanged; skipped group keeps plain text |
| T-AIH-13 | Caller is not session staff | Unit | `FORBIDDEN`, nothing read, no model call |
| T-AIH-14 | Summary returned | Unit | `source: 'llm'`, true counts, `pendingCount` |
| T-AIH-15 | Model fails or replies badly | Unit | `source: 'rules'`: the same groups with plain text |
| T-AIH-16 | Dashboard panel (`help-summary-panel.test.js`) | Unit | Loads on open and on Refresh; shows headline, groups, pending count |

### CATCH — Catch-up · `catch-up.spec.js`, `stores/workspace.test.js`, `downloadProject.test.js`

| ID | Test | Layer | Expected |
|---|---|:---:|---|
| T-CATCH-01 | Load checkpoint | E2E | A warning names the checkpoint; after **Replace my code** the editor shows the checkpoint's code |
| T-CATCH-02 | Download first | E2E + Unit | **Download my project** saves a .zip with every file at its path, and nothing is replaced until the student confirms |
| T-CATCH-03 | Autosave follows | DB | After loading, the student's autosave row has the checkpoint's `files_hash`, so a refresh keeps it |
| T-CATCH-04 | Files the checkpoint doesn't have | Unit | Removed from the editor and the WebContainer; the entry file opens if the open file is gone |
| T-CATCH-05 | Still in progress | E2E | The tile stays `in_progress` until the student clicks Done |
| T-CATCH-06 | Catch-up before any checkpoint | E2E | Button disabled |
| T-CATCH-07 | Catch-up when `allowCatchUp` is false | E2E | Button disabled |
| T-CATCH-08 | The warning readable at 375 px | E2E `@responsive` | Buttons stacked, no horizontal page scroll |
| T-CATCH-09 | **Checkpoint with an unchanged `package.json`** | E2E | Files written, HMR picks them up, plain "Loaded" toast |
| T-CATCH-10 | **Checkpoint that changed `package.json`** | Unit + E2E | Toast tells the student to run `pnpm install`, then `pnpm dev` |

### HELP — Help flow · `help.spec.js`

| ID | Test | Layer | Expected |
|---|---|:---:|---|
| T-HELP-01 | Student sends Check my work | E2E | TA queue shows card instantly via Postgres Changes (name, checkpoint, type — no code) |
| T-HELP-02 | TA claims → side-by-side view | E2E | Student code vs the checkpoint the class was on when they asked |
| T-HELP-03 | Pass | E2E | Student sees a tick for that checkpoint; tile shows passed |
| T-HELP-04 | Reply | E2E | Student sees reply in their help panel |
| T-HELP-05 | Two TAs claim the same request | E2E | Second gets "already on this one" (zero rows updated) |
| T-HELP-06 | Duplicate active request of same type | DB | Partial unique index → `CONFLICT` |
| T-HELP-07 | Student cancels open request | E2E | Card disappears from queue |
| T-HELP-08 | In-person help → Telegram ping | E2E | `test_outbox` has a message with name, seat, step, link |
| T-HELP-09 | Telegram mock set to fail | E2E | Request still exists (committed before the webhook); student sees "notified in app only" |
| T-HELP-10 | Another student reads a help request | RLS | Zero rows |
| T-HELP-11 | Pass on a `help` (not `check`) request | DB | `BAD_REQUEST` from `transition_help_request` |
| T-HELP-12 | Non-claiming TA replies | DB | `FORBIDDEN` |
| T-HELP-13 | **Student follows up on a replied request** | E2E | Same request returns to the queue **in its original place**, badged "Follow-up · last handled by Ana"; the TA sees the full thread |
| T-HELP-14 | **Follow-up attaches the student's current code** | E2E | The TA's side-by-side shows the new snapshot, not the original |
| T-HELP-15 | **Earlier snapshot still readable by the course's staff** | RLS | After a follow-up, the request points at the new snapshot; staff can still read the previous one (staff read every snapshot in their course), a classmate can't |
| T-HELP-16 | **Fourth follow-up rejected** | DB | `BAD_REQUEST` "ask for in-person help instead"; `follow_ups` stays 3 |
| T-HELP-17 | Follow-up on a `passed` / `resolved` / `cancelled` request | DB | `BAD_REQUEST` — only `replied` reopens |
| T-HELP-18 | Another student follows up on someone else's request | RLS | `FORBIDDEN`, and no snapshot is left behind (the function rolls back) |
| T-HELP-19 | Earlier replies survive a follow-up | E2E | Second reply is appended to `thread`; the first is still shown |

### TG — Telegram linking & webhook · `telegram.test.js`, `insights.spec.js`

| ID | Test | Layer | Expected |
|---|---|:---:|---|
| T-TG-01 | Link code → `/start <code>` binds `telegram_chat_id` | Unit | Chat id set; code cleared |
| T-TG-02 | Expired code | Unit | Not bound; bot replies "code expired" |
| T-TG-03 | User text HTML-escaped | Unit | `<script>` sent as `&lt;script&gt;` |
| T-TG-04 | 429 handling | Unit | Waits `retry_after`, retries once |
| T-TG-05 | **Webhook without the secret token header** | Unit | Rejected with 401; nothing written |

### REPLAY — Replay, notes, search · `replay.spec.js`

| ID | Test | Layer | Expected |
|---|---|:---:|---|
| T-REP-01 | Replay lists checkpoints in order | E2E | Step titles 1…n |
| T-REP-02 | Changed lines highlighted vs previous checkpoint | E2E | Highlight count matches diff |
| T-REP-03 | Read-only preview runs | E2E | Preview renders the app at that step |
| T-REP-04 | Add / edit / delete note and bookmark | E2E | Persist after reload; private to author |
| T-REP-05 | Search finds a step title and a note | E2E | Both in results with links |
| T-REP-06 | Search with regex characters | DB | No crash; literal match (parameterised RPC) |
| T-REP-07 | Non-member reads a replay | RLS | Zero checkpoints returned |

### GH — GitHub import/export · `github-export.test.js`, `replay.spec.js`

| ID | Test | Layer | Expected |
|---|---|:---:|---|
| T-GH-01 | Import public repo (mock) | E2E | Draft lesson with filtered files + steps |
| T-GH-02 | Import filters unsafe types / > 20 files | Unit | Only allowed files kept |
| T-GH-03 | Export creates one commit per checkpoint | Unit | Mock records 1 repo + n trees + n commits + 1 ref update, in order |
| T-GH-04 | Commit messages `Step k: <title>` | Unit | Match |
| T-GH-05 | Repo name taken (422) | E2E | UI asks for another name |
| T-GH-06 | **Token never persisted in our schema** | DB | No GitHub token in any row of any `public` table after an export |

### INS — Insights · `report-builder.test.js`, `insights.spec.js`

| ID | Test | Layer | Expected |
|---|---|:---:|---|
| T-INS-01 | `reachedDone` and `dropOff` from fixture histories | Unit | Match hand-computed values |
| T-INS-02 | Trouble score formula | Unit | Matches expected ranking |
| T-INS-03 | Recurring trouble across 2 seeded past sessions | Unit | Step flagged |
| T-INS-04 | Report written when the session ends | E2E | Page polls, then shows funnel + top errors |
| T-INS-05 | Report has no per-student data | DB | No `student_id` anywhere in the row |
| T-INS-06 | Digest to TAs and absent students | E2E | `test_outbox`: TA summary + messages only to linked, absent students |
| T-INS-07 | Student reads a report | RLS | Zero rows |
| T-INS-08 | **Trends stay inside one prof's courses** | DB | With two profs teaching a same-titled lesson, each prof's `lesson_trends` includes only their own sessions |

### PRIV — Privacy by design · `privacy.spec.js`, `tests/unit/rls/*`

The section the architecture change affects most. Each rule that used to be "no endpoint exists" is now a policy with a negative test.

| ID | Test | Layer | Expected |
|---|---|:---:|---|
| T-PRIV-01 | Tile and summary payloads contain no code | DB | `session_tiles` / `session_summary` expose no `files` column at all |
| T-PRIV-02 | **Course staff read a student's autosave and catch-up attempts** | RLS | The rows are returned, so staff can troubleshoot |
| T-PRIV-03 | Staff of another course, or a classmate, read a student's snapshot | RLS | Zero rows |
| T-PRIV-04 | **Who asked to slow down is never retrievable by staff** | RLS | Staff reading `slow_down_flags` get zero rows; `student_status` has no slow-down column; `session_summary.slow_down_count` is an aggregate (admins can read the flags — T-ADM-07) |
| T-PRIV-05 | Notes private | RLS | Another non-admin user's note is invisible |
| T-PRIV-06 | **Every `public` table has RLS enabled** | RLS | `tables_without_rls()` returns empty |
| T-PRIV-07 | **Every view uses `security_invoker`** | RLS | A view without it would leak all sessions; assert none exist |
| T-PRIV-08 | No keystroke logging | Review | Status written only on change + 30 s heartbeat |
| T-PRIV-11 | **Students don't see each other's names** | RLS | A student reads the names of their course's staff, never of other students in it |
| T-PRIV-09 | **No build-error code frame reaches staff** | Unit+DB | Real Vite error output → `student_status.error` holds the message only; no source line appears in `session_tiles` |
| T-PRIV-10 | **Terminal output never persisted** | DB | No table holds `pnpm install` or dev-server text |

### ADM — Admin · `admin.spec.js`, `tests/unit/rls/admin.test.js`

Admins read everything and write only accounts. Most of these are negative tests, because the risk with an all-seeing role is an admin power leaking somewhere it shouldn't.

| ID | Test | Layer | Expected |
|---|---|:---:|---|
| T-ADM-01 | Student, TA or prof calls `admin_list_users` / `admin_set_role` | RLS | `FORBIDDEN` for both |
| T-ADM-02 | Admin lists users | DB | Every account, with email and role |
| T-ADM-03 | Admin changes a user's role | DB | Role updated, and it takes effect (a promoted prof can create a course) |
| T-ADM-04 | **Admin changes their own role** | DB | `BAD_REQUEST`; role unchanged |
| T-ADM-07 | Admin reads any table | RLS | Snapshots, notes, `slow_down_flags` and another prof's course all readable |
| T-ADM-08 | **Admin cannot act inside a course** | RLS | `save_checkpoint`, `claim_help_request`, lesson updates and course edits by an admin → `FORBIDDEN` or zero rows |
| T-ADM-09 | **Policy sweep** | RLS | Every `public` table has exactly one `admin reads all` `select` policy, and no admin policy for any other command |
| T-ADM-10 | Logged-out caller is never an admin | RLS | `is_admin()` is `false` (not `null`) for the anon key |
| T-ADM-11 | Admin users page at 375 px and 1280 px | E2E `@responsive` | Users stack on xs, one row each on lg; the admin's own role is locked |

### RESP — Responsive (Chrome) · tagged `@responsive`

| ID | Test | Layer | Expected |
|---|---|:---:|---|
| T-RESP-01 | Workspace at 375 px | E2E | Tabs Code/Preview/Terminal/Steps; **file tree is an offcanvas drawer**; sticky bottom bar; no horizontal scroll |
| T-RESP-02 | Workspace at 1280 px | E2E | File tree rail + editor + preview, terminal docked below |
| T-RESP-03 | Teach view at 375 px | E2E | Dashboard-first layout; editor behind tab |
| T-RESP-04 | Teach view at 1280 px | E2E | Editor + checkpoints + class summary card visible together |
| T-RESP-05 | No page has horizontal scroll at 375 px | E2E | `scrollWidth <= innerWidth` on every route |
| T-RESP-06 | Landscape 667×375 workspace | E2E | Usable; bottom bar doesn't cover editor |

### VALID — Validation & error handling · `errors.spec.js`

| ID | Test | Layer | Expected |
|---|---|:---:|---|
| T-VAL-01 | Malformed uuid in a route param | DB | Mapped to `NOT_FOUND`, no crash (replaces the old ObjectId check) |
| T-VAL-02 | Row exists but is not mine | E2E | Empty/forbidden state on the page, not a spinner or a crash |
| T-VAL-03 | Unknown client route | E2E | Friendly 404 page |
| T-VAL-04 | **Deep link on the deployed URL** | E2E | `/join/<code>` and a refresh on `/s/:id/code` work (SPA rewrite) |
| T-VAL-05 | XSS in step title / note / reply / follow-up / announcement | E2E | Rendered as text (Vue escaping); never executed |
| T-VAL-06 | Oversized payload | DB | `octet_length` constraint → `PAYLOAD_TOO_LARGE` |
| T-VAL-07 | Upstream (GitHub) down | E2E | Feature message; rest of app works |
| T-VAL-08 | Every zod rule has a constraint behind it | Review | Each row of the validation table in [03](./03-data-model.md#validation-rules-summary) has both |

### LOAD & SEED

| ID | Test | Layer | Expected |
|---|---|:---:|---|
| T-LOAD-01 | 40 simulated students, update every 3 s, 5 minutes | Load | p95 tile latency < 500 ms; no dropped subscriptions |
| T-LOAD-02 | 40 students receive a checkpoint broadcast | Load | All within 2 s |
| T-LOAD-03 | **Load test fits the Realtime free tier** | Load | Concurrent connections and message count stay inside the cap; recorded in the README |
| T-LOAD-04 | **Egress per session measured** | Load | One full session's Supabase egress recorded against the 5 GB budget; cached rejoin costs ~0 |
| T-LOAD-05 | **Cold install time measured** | Load | Recorded in the README; decides whether the dependency cache in [05 §2](./05-core-logic.md#2-files-cache--dependencies) gets built |

> **What the load test does not prove.** The 40 simulated students write status rows directly; they cannot each boot a WebContainer. So T-LOAD-01/02 show that Supabase and Realtime hold up under a class's worth of traffic — they say nothing about whether 40 real laptops each running a Vite dev server stay responsive. Those are two different questions and only the first is testable here. Say so in the README rather than letting "load-tested with 40 students" imply more than it does.
| T-SEED-01 | `pnpm db:reset` twice | DB | Same counts both times (migrations + `seed.sql` are idempotent by construction) |
| T-SEED-02 | Seeded accounts log in with documented passwords | DB | All roles correct |
| T-SEED-03 | Seeded past session has replay + report | E2E | Both pages render |
| T-SMOKE-01 | `/` loads landing in the production build | E2E | Title + "Join a class" visible |

---

## Test Summary

| Area | Count | Main stage |
|---|---:|---|
| PLAT | 21 | 2 |
| LESSON + TODO | 14 | 4 |
| SESS | 18 | 3 |
| SBX | 23 | 3 |
| STAT | 12 | 5 |
| DASH | 7 | 5 |
| ERRG | 9 | 9 |
| CATCH | 10 | 6 |
| HELP | 19 | 7 |
| TG | 5 | 7 |
| REPLAY | 7 | 8 |
| GH | 6 | 8 |
| INS | 8 | 10 |
| PRIV | 11 | 5–9 |
| ADM | 11 | 2 |
| RESP | 6 | 11 |
| VALID | 8 | 11 |
| LOAD + SEED + SMOKE | 9 | 11–12 |
| **Total** | **204** | |

Up from 137 in the Mongo design: 15 came from authorization moving into the database (RLS negative tests — the cheapest in the suite, a sign-in and an `expect(data).toEqual([])`), and 17 more from the WebContainer runtime (boot, install, build errors, the file cache, delta autosave, and the two privacy tests that keep code frames and terminal output out of the dashboard), plus 12 for help follow-ups and class announcements, and 16 for sign-up roles, per-prof courses and the admin role.

**Must be green for the video:** every E2E test tagged on a MUST feature (PLAT, LESSON, SESS, SBX, STAT, DASH, CATCH, HELP, REPLAY, PRIV, RESP, VALID).

### How to run (goes in the README)

```bash
# Docker must be running — the local stack needs it
pnpm install
pnpm dlx playwright install chromium
pnpm supabase start                  # Postgres + Auth + Realtime + Functions on localhost
pnpm db:reset                        # migrations + seed.sql

pnpm test:unit                       # Vitest: shared/ logic + RLS negative tests — ~10 s
pnpm test:e2e                        # builds, runs Playwright against the local stack (EXTERNAL_APIS=mock)
pnpm dlx playwright show-report      # HTML report with traces for any failure
pnpm simulate --session ABC234 --students 40   # load test (local stack — see the egress rule in 02)
```
