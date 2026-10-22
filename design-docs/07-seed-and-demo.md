# CodeAlong — Seed Data, Demo Script & Submission

## Seed Data

`supabase/seed.sql` (applied by `pnpm db:reset`) gives every teammate, every test and the markers the same starting point: users → course → lesson → past session (with checkpoints, statuses, help requests, notes, report). It is **idempotent by construction** — `db:reset` re-creates the schema from the migrations before seeding, so there is no clear-up step to get wrong.

All names below are fictional — don't use classmates' names in submitted data.

### Seed users (password for all: `pass1234`)

| # | Name | Email | Role | Notes |
|---|---|---|---|---|
| 1 | Prof Lee | `prof@codealong.test` | prof | Owns IS216 G2; Telegram linked in demo env |
| 2 | Ana Lim | `ta.ana@codealong.test` | ta | Staff of IS216 G2 |
| 3 | Ben Ong | `ta.ben@codealong.test` | ta | Staff of IS216 G2 |
| 4 | Alex Tan | `alex@codealong.test` | student | Enrolled — used for the live demo |
| 5 | Bea Koh | `bea@codealong.test` | student | Enrolled — second live laptop |
| 6 | Chen Wei | `chen@codealong.test` | student | Enrolled — third live laptop |
| 7–14 | Dana, Eli, Faye, Gus, Hana, Ivan, Jae, Kim | `<first>@codealong.test` | student | Enrolled — appear in the past session |
| 15 | Zoe Ng | `zoe@codealong.test` | student | **Not** enrolled — for the "not in this course" check |
| 16 | Prof Tan | `prof.tan@codealong.test` | prof | Owns a **different** course (IS216 G1) — proves profs can't see each other's courses (T-PLAT-14/15, T-INS-08) |
| 17 | Ada Admin | `admin@codealong.test` | admin | The one admin account. Keep it to one: admins can read everything, including students' code |

> These credentials go in the README (the briefing asks for any username/password details there). Passwords are hashed by Supabase Auth — we never store or hash a password ourselves.

### Seed course

| Code | Title | Term | Section | Enrol code | Staff | Students |
|---|---|---|---|---|---|---|
| IS216 | Web Application Development II | AY2026/27 T1 | G2 | `WAD2G2` | Prof Lee, Ana, Ben | Alex … Kim (11) |

A second course, **IS216 G2 · AY2025/26 T1** (archived, enrol code `WADG25`, Prof Lee + Ana), holds one past session of the same lesson so "recurring trouble steps across terms" has data.

A third course, **IS216 G1 · AY2026/27 T1** (enrol code `TANWAD`), belongs to **Prof Tan** and holds one past session of a same-titled Mini Cart lesson. It exists to prove the per-prof boundary: Prof Lee must never see it, and Prof Lee's trends must never count its sessions.

### Seed lesson: "Week 6 · Mini Cart" (status `ready`)

Now a **real Vite + Vue project**, not three CDN files. This is forced by dropping the mock API: steps 2 and 8 need something to call, and students get a real Node server, so the lesson ships its own.

**Starter files (12)** — written by the team, source only:

```
package.json            vite + vue + axios + express as devDependency; "dev" runs both processes
vite.config.js          proxy /api → http://localhost:3001
index.html
src/main.js
src/App.vue             ← most TODOs live here
src/components/ItemCard.vue
src/style.css
src/ca-probe.js         ← our runtime probe, imported by main.js (see 05 §1)
server/api.js           ← tiny Express app: /api/categories, /api/items?category=, POST /api/checkout
server/data.json
.npmrc                  ← only if the WebContainer symlink spike needs node-linker=hoisted
README.md               ← one paragraph: what you're building
```

Two processes run in the container: Vite on 5173 and the Express endpoint on 3001, with Vite proxying `/api` so student code calls a relative path. This is also what makes the lesson teach the real thing — `axios.get('/api/items')` against an actual server, which is what IS216 does anyway.

**The eight steps survive almost unchanged**, now against SFCs instead of a global build:

| Step | TODO title | File |
|:---:|---|---|
| 1 | Create the Vue app with a list of categories | `src/App.vue` |
| 2 | Fetch items for the selected category with axios | `src/App.vue` |
| 3 | Create the `ItemCard` component with an `items` prop | `src/components/ItemCard.vue`, `src/App.vue` |
| 4 | Emit `add-to-cart` from `ItemCard` | `src/components/ItemCard.vue` |
| 5 | Add the item to the cart in the parent (increase quantity if it's already there) | `src/App.vue` |
| 6 | Show the cart total with a computed property | `src/App.vue` |
| 7 | Save the cart to localStorage and load it on start | `src/App.vue` |
| 8 | Add Reset and Checkout buttons (POST `/api/checkout`) | `src/App.vue`, `server/api.js` |

Step 4 stays the deliberate trouble step — `props.items` vs `items` — which is what the seeded past session, the error-grouping demo and the Spotlight demo are all built on.

Two things this changes:

- **`localStorage` in step 7 now just works.** The old lesson needed our in-memory shim because an opaque-origin iframe throws on `localStorage`. The WebContainer preview is served from a real origin, so the shim is gone.
- **Step 3 is where build errors show up.** A half-finished SFC import fails to compile, so the tile turns red with `source: 'build'` before the student has even run anything — a new and genuinely useful signal for the prof.

### Seed past session (ended, current term)

`MNCART`, Sunday 12 Oct 2026 14:00–15:35. Checkpoint *k* lands at 14:00 + 10*k* min; each student marks it Done a few minutes later.

| Data | Contents | Demonstrates |
|---|---|---|
| 8 checkpoints | One per step, with short prof notes. **Each is the real code at that step**: the starter with TODOs 1…*k* solved, so replay shows the project growing | Replay, GitHub export |
| 11 `student_status` rows + 176 `status_history` rows | 8 finish; **6 hit `ReferenceError: items is not defined` at Step 4** (`items` instead of `props.items`); **3 never finish Step 7** and end `behind`. History is written exactly as the triggers would have, with real timestamps | Insights funnel, Step 4 as top trouble step |
| 18 snapshots | Everyone's autosave, 2 `before_catchup` (Eli, Ivan), 5 `help_request` | Privacy: a TA sees only the 5 sent ones |
| 5 help requests | 2 passed checks, 2 replied helps on the Step 4 bug, 1 in-person resolved (Gus, seat C14) | Help history in replay; Spotlight source |
| 4 notes/bookmarks | Alex's notes on Steps 4 and 7, anchored to those checkpoints | Notes + search |
| 12 `lost_events` | Three lost at once during Step 4, three again near the end | `lost_peak` = 3 |
| `session_reports` row | Literal counts matching the history above, per the [05 §10](./05-core-logic.md#10-insights-report) definitions: Step 4 trouble 0.236 (top), Step 7 drop-off 3. `seed.test.js` checks them against the history | Report page renders immediately |

### Seed older reports (for trends)

| Session | Course | Report | Why |
|---|---|---|---|
| `MNCT25`, Oct 2025 | IS216 G2 · AY2025/26 T1 (archived), Prof Lee | 24 of 27 joined; **Step 4 top trouble again** | "Recurring trouble across terms" has something to find |
| `TANMCT`, Oct 2026 | IS216 G1 · AY2026/27 T1, Prof Tan | 30 of 32 joined; Step 2 top trouble | Must **never** appear in Prof Lee's reports or trends (T-INS-08) |

These two have report rows only — no checkpoints or history — because a report is counts only.

### Seed live session — `CART42`

Until `start_session` exists, nobody can start a class from the app, so the seed leaves one running in IS216 G2: 3 checkpoints, an announcement, and five students showing one of each tile state.

| Student | `done_step_order` | Tile |
|---|:---:|---|
| Alex, Eli | 3 | `done` |
| Chen | 2 | `in_progress` — and has tapped **I'm lost** (staff see `lost_count = 1`) |
| Bea | 2 | `error`, `source: 'build'` — mistyped the `ItemCard` import; her help request is **open** in the queue |
| Dana | 1 | `behind` |

The live session's `idleAfterSec` is **3600**, not 180, so the tiles stay un-idle for an hour after `pnpm db:reset`; after that they all show `idle`. **End it or reset before recording the demo**, which starts its own session.

### How `seed.sql` is built

`supabase/seed.sql` runs automatically after the migrations on every `supabase db reset`, so "reset" and "seed" are the same command and there is nothing to clean up. **T-SEED-01:** two resets in a row give identical counts in every table.

| Part | How |
|---|---|
| Accounts | Inserted into `auth.users` **and `auth.identities`** with `crypt('pass1234', gen_salt('bf'))` — the same bcrypt Supabase Auth uses. The token columns are set to `''`, not null; Supabase Auth can't log in a user whose tokens are null. The `on_auth_user_created` trigger makes each profile; one `update` then sets the roles |
| Fixed ids | Grouped by table, readable: users `…0000-0000000000NN` (NN = the # above), courses `…0001-…N`, lessons `…0002-…N`, steps `…0003-00000000N00K`, sessions `…0004-…N` |
| Starter files | **Copied from Dylan's `src/stores/seed/miniCartSeed.js`**, the same project the workspace boots — one source for both. If that project changes, re-copy the list |
| Checkpoint code | A table of patches (step, file, exact text → replacement). The code at checkpoint *k* = the starter with patches 1…*k* applied. **A patch whose text is missing raises an error**, so a change to the starter breaks the seed loudly instead of seeding wrong code |
| Steps' `todo_refs` | Computed from the starter: every file and line containing `TODO k:` — what `parseTodos` produces |
| The reports | Plain `insert`s of literal counts. The past session's match its history, and `seed.test.js` checks that they still do |
| Helpers | Built in a scratch `seed` schema that the file drops at the end |

`tests/unit/rls/seed.test.js` checks it all (T-SEED-02/03 plus the privacy rules on the seeded data). It skips itself when the database hasn't been seeded.

> **Still to do — `pnpm seed:generate`.** The plan was to generate the steps and the report with the real `parseTodos` and `buildReport`. Neither exists yet, so the steps are derived in SQL and the reports are written out by hand. Once they land, a small Node script should check the seed against them.

---

## Demo Setup (before recording or presenting)

| ✓ | Step |
|:---:|---|
| ☐ | `pnpm db:reset` locally for the recording, or re-seed the deployed Supabase project |
| ☐ | Prof, TA and three students **already logged in** in five Chrome profiles — **no login/registration on screen** (Q&A slide 11) |
| ☐ | **Containers already booted and dependencies installed** in each student window — the cold `pnpm install` must not appear on camera |
| ☐ | One student window docked in DevTools device mode at **575 px** with the **console open** (Q&A slide 11) |
| ☐ | `pnpm simulate --session <code> --students 25` ready in a terminal, so the dashboard looks like a real class |
| ☐ | Supabase project **awake** (it pauses when idle) — open the dashboard and run one query the day before |
| ☐ | Telegram open on a phone (screen-mirrored) logged in as the TA |
| ☐ | The two Vault secrets for the in-person ping are set on that database ([03, "In-person ping"](./03-data-model.md#in-person-ping)) — `db:reset` wipes them |
| ☐ | GitHub repo page open in a tab (Q&A slide 11) |
| ☐ | Screen recording at 1920×1080, browser zoom 110% for readability |
| ☐ | Notifications off on every device |

---

## Video Script (≤ 12 minutes, YouTube unlisted, 1080p)

Every member presents the part they built (check your section's rule on who must appear).

### 0:00–1:15 · The problem (Evan)

| Show | Say |
|---|---|
| Slide: a lab photo + the three pain points | One typo at step 2 and you're lost for the rest of the lesson; the prof can't see who's stuck; the file sent afterwards hides the steps |
| Slide: why chat / Live Share / ChatGPT don't fix it | Nobody shows the prof the room |
| One-sentence pitch | "CodeAlong helps IS216 profs and TAs see who is falling behind during live coding and get them back on track…" |

### 1:15–2:30 · Prof prepares the lesson (Evan, Ray Yien)

| Step | Action | What to show |
|:---:|---|---|
| 1 | Prof opens IS216 G2 → New lesson → **Import from GitHub** | Repo URL → files appear (GitHub API) |
| 2 | Review steps | 8 TODOs became an ordered plan; reorder one, edit a title |
| 3 | **Explain:** TODO parser rules (numbers, multiple files) | Code: `shared/todo-parser.js` + its unit test |

### 2:30–5:30 · Live class (Ying Qi, Dylan, Evan)

| Step | Action | What to show |
|:---:|---|---|
| 4 | Start session | Join code + QR on the "projector" |
| 5 | Three students join by code; simulator adds 25 more | Tiles fill in live |
| 6 | Prof completes Step 3, clicks **Save checkpoint** | Every student gets the toast instantly |
| 7 | Alex (575 px window) types `items` instead of `props.items` | Console shows the real error; gutter marker; Alex's tile turns **red** |
| 8 | Several simulated students hit the same error | Error group "`items is not defined` ×7" |
| 9 | Bea and Chen tap **I'm lost** | Lost count 2 — no names anywhere |
| 10 | **Explain:** WebContainer runtime, status derivation, error normaliser | Diagram slide + `session_tiles` view, `shared/error-normalizer.js`; mention that a build error's code frame is stripped before it ever leaves the browser |

### 5:30–7:00 · Catch up (Dylan, Ray Yien)

| Step | Action | What to show |
|:---:|---|---|
| 11 | Alex clicks **Load checkpoint** | "What you missed": the exact line he got wrong |
| 12 | Alex taps **Done** | Tile turns **green** on the prof's screen |
| 13 | Alex restores his old attempt to compare, then switches back | Nothing lost |
| 14 | Resize to 375 px and rotate | Workspace switches to tabs; bottom bar stays usable |

### 7:00–8:45 · Help (Karin, Evan)

| Step | Action | What to show |
|:---:|---|---|
| 15 | Bea → **Check my work** | TA queue shows the card instantly (no code until opened) |
| 16 | TA claims → side-by-side → **Pass** | Bea's step gets a tick |
| 17 | Chen → **Ask for help** → "Come to my seat" Row C 4 | Telegram message arrives on the TA's phone (Telegram Bot API) |
| 18 | Prof clicks **Spotlight** on the error group | Anonymised excerpt + fix on every screen |
| 19 | **Explain:** privacy by design — prof sees status, not code | Slide: what each role can see |

### 8:45–10:15 · After class (Ray Yien, Andric)

| Step | Action | What to show |
|:---:|---|---|
| 20 | Prof ends session | Students see "Class ended — open replay" |
| 21 | Replay: step through checkpoints, add a note, search | Changed lines highlighted |
| 22 | **Export to GitHub** | GitHub commits page: one commit per step |
| 23 | Insights report (seeded past session) | Funnel; Step 4 top trouble step; recurring across terms |
| 24 | Send digest | Telegram: TA summary + absent-student message |

### 10:15–11:45 · How it's built & tested (Andric, all)

| Slide | Content |
|---|---|
| Architecture | Vue 3 + Pinia + Bootstrap ↔ `supabase-js` ↔ Supabase Postgres + Realtime + Edge Functions; **StackBlitz WebContainer running the student's project in-browser**; Telegram + GitHub APIs. No server of our own |
| Data store | 15 Postgres tables and what's in each; **the RLS policy that is the privacy rule** — show the `snapshots` policy on screen |
| Responsive & styling | Breakpoint table; workspace tabs vs panes; tokens; colour + icon + label |
| Testing | Playwright run with prof + 3 students in one test (clip of the HTML report), 137 tests, unit tests for core logic |
| Credits & AI use | Libraries table; what AI was (and wasn't) used for |

### 11:45–12:00 · Close

What we'd do next (automatic step checks, VS Code reporter) + thanks.

---

## Presentation Slides (~10, PPTX or PDF)

| # | Slide | Content |
|:---:|---|---|
| 1 | Title | CodeAlong · T4 · G2 · members · **YouTube link** (required on slide 1) |
| 2 | Problem | Three pain points + why existing tools fall short |
| 3 | Solution & users | One-sentence pitch; prof/TA/student roles; core loop |
| 4 | Features & tiers | F1–F6 mapped to tiers; signature algorithm highlighted |
| 5 | Architecture | Stack diagram; direct queries vs RPCs vs Edge Functions; WebContainer as the student runtime; why no server was needed |
| 6 | Data store | Tables, relationships, RLS as the privacy mechanism, derived tile state |
| 7 | Core logic | Sandbox + classifier + error grouping (diagram) |
| 8 | External APIs | Telegram (pings, digests), GitHub (import, export as commits) — integration details |
| 9 | Design & responsiveness | Screens at 375 px and 1280 px; IDP rules applied |
| 10 | Testing | Strategy, repeatability, stable selectors, how to run |
| 11 | Credits, AI use, next steps | |

---

## Live Q&A Prep (at the front, with the app open)

Before Q&A: log in first, open pages at 575 px in DevTools with the console visible, have the GitHub repo open (Q&A slide 11).

| Likely question | Who answers | Short answer |
|---|---|---|
| Why not just use VS Code Live Share? | Evan | Live Share shows the prof's editor to students; it gives the prof no view of the class, no checkpoints to catch up to, no replay |
| Isn't this surveillance? | Karin | Status only, no keystrokes; **course staff** see code only when a student sends it — enforced by a database policy, not by our good intentions; "I'm lost" is only ever an aggregate to staff. One platform admin account can read everything, the way any system's operator can — its role changes and account actions are logged, and we keep it to a single account |
| Can't anyone just sign up as a prof? | Andric | Yes — and that's safe, because being a prof only lets you create *your own* course. Every other course, its sessions and its students' code stay invisible to you; access is checked per course, not by account type |
| How does the tile know I'm stuck? | Andric | Errors are caught in your sandbox; Done is your own tap; a database view compares your progress with the latest checkpoint — the state is computed, never stored, so nobody can fake it |
| What stops student code from breaking the app? | Dylan | It runs in a WebContainer — a WASM Node sandbox in the browser — and the preview is a separate origin, so it cannot reach our login session, DOM or database. A hung loop hangs that iframe, not the app |
| Why run Node in the browser at all? | Dylan | So lessons are real projects: real `import`s, a real `pnpm install`, a real dev server. It also gives us compile errors as a dashboard signal, which a plain iframe never could |
| How do you keep inside Supabase's free tier? | Andric | Only source files cross the network — dependencies come from npm straight to the browser. Reads are cached in IndexedDB and re-checked with a hash, so a rejoin costs almost nothing; autosave sends only the files that changed |
| How do you group errors? | Evan | Normalise volatile parts, group by step + key, merge by shape — walk through the unit test |
| What happens with 40 students? | Ying Qi | Updates only on change, throttled to one write per 2 s; summaries computed in the browser ≤ 1/s; a new checkpoint re-classifies everyone with zero extra writes because the state is derived; load-tested with 40 simulated students |
| Where's the external API used? | Karin / Ray Yien | Telegram pings + digests; GitHub import + export via the Git Data API |
| How are tests repeatable? | Andric | A local Supabase stack reset by migration per spec — a real Postgres with the real policies — plus mocked external APIs and `data-testid` selectors |
| What did you use AI for? | Any | Lower-order only (boilerplate, test data, debugging hints); listed in the README |

---

## README Skeleton

```markdown
# CodeAlong — live coding classes where nobody gets left behind
IS216 G2 · Team T4 · Andric Ang, Yew Ying Qi, Dylan Shuck, Evan Sim, Karin Tan, Tan Ray Yien

**Deployed app:** https://<url>            **Repository:** https://github.com/<org>/codealong
**Video:** https://youtu.be/<id>

## Demo accounts (password for all: pass1234)
| Role | Email |
| Prof | prof@codealong.test |
| TA | ta.ana@codealong.test |
| Student | alex@codealong.test (also bea@, chen@) |
| Second prof (separate course) | prof.tan@codealong.test |
| Admin | admin@codealong.test |
New sign-ups can choose Student or Educator.
Enrol code for IS216 G2: WAD2G2

## Set up
1. **Node ^22.18 or >=24.12** (see `engines`), **pnpm 10** (`corepack enable`), and **Docker**
   running (the local Supabase stack needs it)
2. `pnpm install`
3. Copy `.env.example` to `.env.local` and fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
   (both are printed by `pnpm supabase start`; Telegram/GitHub keys are optional — the functions
   run with EXTERNAL_APIS=mock locally)
4. `pnpm supabase start`
5. `pnpm db:reset` — applies every migration, then the seed

> **Browser:** the workspace needs Chrome or Edge. It runs the student's project in a
> StackBlitz WebContainer, which requires cross-origin isolation and `SharedArrayBuffer`;
> Safari may not start it. Other pages work everywhere.

## Run
- Development: `pnpm dev:local` → http://localhost:5173 (local Supabase — **use this by default**;
  pointing day-to-day work at the cloud project burns the free-tier egress budget)
- Production build: `pnpm build && pnpm preview` (landing page at the root)
- Deployed: see the link at the top

## Test
- `pnpm dlx playwright install chromium`
- Unit + authorization: `pnpm test:unit` (pure logic in `shared/`, plus RLS negative tests)
- End-to-end: `pnpm test:e2e` (local Supabase + mocked APIs; no keys needed) → `pnpm dlx playwright show-report`
- Load: start a session, then `pnpm simulate --session <joinCode> --students 40` (local stack)
- Test case list: docs/06-stages-and-tests.md

Note on the load test: the 40 simulated students write status rows directly — they cannot each
boot a WebContainer. It proves Supabase and Realtime hold up under a class's worth of traffic;
it does not prove 40 real laptops each running a dev server stay responsive.

## External APIs
Telegram Bot API — TA pings + digests · GitHub REST API — starter import + replay export

## Third-party libraries
(table from docs/02-tech-stack.md)

## Use of AI
(per member: what was AI-assisted, per IS216 FAQ 20)

## How the student workspace works
Each student's lesson runs as a real Vite project inside a StackBlitz WebContainer (Node compiled
to WebAssembly) in their own browser. Only **source files** ever cross the network: dependencies
are fetched from the npm registry straight to the browser, never stored in or served from Supabase.
Files are cached in IndexedDB and re-checked with a content hash, so rejoining a session costs
almost no bandwidth, and autosave (5 s after you stop typing) uploads only the files that changed.

**Measured on this project:** cold `pnpm install` for the Mini Cart lesson takes ~__s, and one
40-student session costs ~__MB of Supabase egress against the 5 GB monthly budget.

**Possible improvement — caching dependencies locally.** The first boot of a lesson pays for a
full `pnpm install`, and loading a checkpoint that changed `package.json` pays for it again. If
that proves slow in practice, the installed tree can be exported from the container into IndexedDB
and re-mounted on later boots, keyed by a hash of `package.json` + `pnpm-lock.yaml` — turning a
reinstall into a mount. We deliberately did not build this up front: it costs 50–120 MB of local
storage per dependency set, it adds a cache-invalidation path, and WebContainer installs are
already several times faster than a local npm. It is worth building **only if the measured cold
install above is painful**, and it would cost nothing in Supabase egress because the cache is
entirely local.

## Known limitations
The workspace requires Chrome or Edge (WebContainer needs cross-origin isolation and
`SharedArrayBuffer`); dependencies are reinstalled on a fresh device or after a cache eviction;
the free-tier Supabase project pauses when idle (a weekly keep-alive ping is scheduled); local
tests require Docker
```

---

## Submission Checklist (Week 12 Friday 9:00 am — no extensions; aim for Thursday)

| ✓ | Item |
|:---:|---|
| ☐ | Zip contains **slides** (PPTX/PDF, YouTube link on slide 1), **README**, **application** source |
| ☐ | Video ≤ 12:00, ≥ 720p (1080p), unlisted or public, plays logged out |
| ☐ | Deployed link submitted the way our section faculty asked |
| ☐ | Fresh clone → README steps → app runs → `pnpm test:e2e` green |
| ☐ | `.env.local` not in the zip/repo; no service role key anywhere in the repo; demo credentials in the README |
| ☐ | Third-party credits in slides and code comments |
| ☐ | AI usage section complete |
| ☐ | Deployed app left running, untouched, until Week 18 — **keep-alive ping scheduled and verified**, so the Supabase project cannot pause |
