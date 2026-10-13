# CodeAlong — Workload Split (6 members)

> Based on the "Who do what?" table in our proposal. The Q&A slides ask for **distinct** responsibilities (no "Alice & Bob are responsible for the database"), roughly one meaningful feature per person, and a visible contribution from everyone. Items marked **(proposed)** weren't in the proposal table — confirm them at the next meeting (see [Open questions](#open-questions)).

## Summary

| Member | Owns | Feature | Tier | Also owns |
|---|---|---|:---:|---|
| **Ying Qi** | Live session engine: join codes + QR, session RPCs, checkpoint broadcast, Realtime channels, reconnection | F1 | 2 | **RLS policies + the derived views** (`session_tiles`, `session_summary`), load simulator **(proposed)** |
| **Dylan** | Student workspace: **WebContainer runtime, IDE shell**, editor, preview, terminal, error capture, Done, load checkpoint | F2 | **3** | **All Postgres migrations** (tables, constraints, indexes); the IndexedDB file cache; automatic step checks (COULD) |
| **Karin** | Help flow: Check my work / Ask for help, TA queue, side-by-side view, pass ticks, Telegram bot | F3 | 2 | `telegram-webhook` + `telegram-notify` functions used by others; AI hints (COULD) **(proposed)** |
| **Evan** | Prof view: editor, lesson plan from TODOs, class dashboard | F4 | **3** | Error normaliser + grouping, `spotlight` function **(proposed)** |
| **Ray Yien** | Replay, lesson library, search, "What you missed" diff, GitHub import + export | F5 | 2 | `diffSummary` + `DiffView` used by Dylan and Karin |
| **Andric** | Accounts, courses, roles, insights report, deployment, UI consistency | F6 + platform | 2–3 | Playwright config/fixtures, `seed.sql`, COOP/COEP + Vercel config, README assembly **(proposed)** |

Everyone writes the **E2E specs, unit tests and RLS negative tests for their own feature** (test IDs in [06-stages-and-tests.md](./06-stages-and-tests.md)). Andric owns the shared test setup.

### What the Supabase rewrite changed about these roles

Worth reading before you look at your own card — three scopes moved.

| Member | Before | After |
|---|---|---|
| **Ying Qi** | Socket.IO server, rooms, cookie-JWT handshake, in-memory `dashboard-cache.js`, idle sweep | Realtime channels (thin — `supabase-js` does the transport), **plus RLS policies and the two derived views**. The cache and the sweep are gone: tile state is derived in SQL, so a new checkpoint re-classifies 40 students with zero writes. The scope is smaller in code and larger in responsibility — the policies *are* the privacy contract |
| **Dylan** | All Mongoose models; `srcdoc` sandbox + probe + mock API + `localStorage` shim | All Postgres migrations (a direct translation, but `steps` is its own table and `files` is `jsonb`), **plus the WebContainer runtime, the IDE shell and the IndexedDB cache**. The `srcdoc` builder, the mock API and the `localStorage` shim are all deleted. Net: the riskiest browser detail is gone, but the card grew — **left unbalanced for now, to be revisited** |
| **Karin** | Telegram long-polling loop | Telegram **webhook** Edge Function + the secret-token check. Same size job, different shape |
| **Evan** | Dashboard reading the server's cache | Dashboard reading `session_tiles`; grouping now runs in his own browser as a `computed`. Slightly simpler, and more Vue-idiomatic |
| **Ray Yien** | GitHub service with a hand-rolled OAuth flow | Two Edge Functions; export uses Supabase Auth's GitHub provider instead of the custom OAuth dance |
| **Andric** | Express app, middleware, auth, deployment to a Node host | Vue shell and router guards (unchanged), Supabase Auth, `seed.sql`, Vercel + Supabase deployment, **and the two new platform risks**: the Realtime free-tier cap and the idle-pause keep-alive |

Nobody lost a feature. The `routes/ → middleware/ → controllers/` layer that disappeared was shared boilerplate, not anyone's headline contribution.

---

## Non-Negotiable Implementation Pattern

Every task card follows the same pattern so the codebase reads like one person wrote it:

1. **Data access:** component → Pinia store action → `src/api/*.api.js` → `supabase`. **Never** import `supabase` in a component.
2. **Trusted writes:** anything multi-step, or that decides a role, code, sequence number or state transition, is a `security definer` RPC or an Edge Function — never a sequence of client calls.
3. **Every table ships with RLS** enabled and a policy per command, in the same migration, with a negative test in the same PR. Views are always `security_invoker = true`.
4. **Realtime:** write to Postgres first; broadcasts are sent from the RPC that did the write, never from the client.
5. **Pure logic lives in `shared/`** — no DOM, no network, no `Deno` — so it runs in the browser and in Edge Functions and is unit-tested once.
6. **Validation twice:** a zod schema in `src/validators/` for the per-field form message, and a `check` constraint or RPC guard behind it. The constraint is what the test asserts.
7. **UI:** Bootstrap + `tokens.css`; shared components from `components/ui`; works at 375 px before it's "done".
8. Every interactive element gets a `data-testid` (convention in [09-integration-contracts.md](./09-integration-contracts.md#9-data-testid-convention)).
9. PR includes its tests and a 375 px + 1280 px screenshot.

---

## Timeline

| Week | Goal | Everyone |
|---|---|---|
| **8** (now → pitch) | Stages 0–3: design lock, skeleton, platform, **live session core** | Day 1: review these docs together and confirm the Supabase rewrite. Day 2: Dylan pushes migrations, Ying Qi pushes policies + views, Andric pushes the app shell; others build against seeded data |
| **9** | Pitch (materials due **Mon 23:59**); stage 4 lesson plan; start MUST features | Pitch: Ying Qi drives the 4-laptop demo; each member presents their job scope |
| **10** | Stages 5–7: dashboard, catch-up, help flow | Mid-week integration day; first full E2E run |
| **11** | Stages 8–10: replay + GitHub, error groups + Spotlight, insights | Feature freeze for MUST + SHOULD at end of week. **Realtime free-tier check must be done by now** |
| **12** | Stage 11–12: hardening, responsive pass, load test, README, slides, video | Record by Wednesday; **submit Thursday** (deadline Fri 9:00 am, no extensions) |

> Raise any teammate issue with the teaching team **at least 3 weeks before the deadline** (i.e. by Week 9) — later than that may be too late for them to act.

### Week 8 unblocking order

The schema is now a shared dependency with two owners, so the order matters more than it used to:

```
Dylan: 0001_tables.sql ──┐
                         ├─▶ Ying Qi: 0003_rls.sql + 0004_views.sql ──▶ everyone
Andric: Supabase project ┘        (nobody can read anything until the
        + Auth + app shell         policies exist — an RLS-enabled table
                                   with no policy returns zero rows)
```

**Day 1 deliverable:** a migration that creates the tables *and* a permissive-but-real policy set, even if some policies are tightened later. An RLS-enabled table with no policies looks exactly like a bug to everyone else on the team.

### Week 9 pitch: what each person must have running

The pitch rubric gives 25% for "a functioning task". Each member shows one working sub-feature:

| Member | Working at the pitch |
|---|---|
| Ying Qi | Start session → join by code → checkpoint broadcast to 3 laptops |
| Dylan | Editor + sandboxed preview + console capturing a real error; Load checkpoint |
| Karin | Telegram bot linked to a TA account; a message sent from the `telegram-notify` function |
| Evan | Basic dashboard tiles updating live from `session_tiles`; TODO parser on the Mini Cart starter |
| Ray Yien | GitHub import of a public repo into a draft lesson |
| Andric | Register/login, courses, enrol by code, role guards; app deployed to Vercel once (even if early) |

---

## Task Cards

### 🟣 Ying Qi — "Live Session Engine + Authorization" (F1)

| What | File(s) | Done |
|---|---|:---:|
| RLS policies for every table | `supabase/migrations/0003_rls.sql` | ⬜ |
| Membership helpers (`is_course_staff`, `is_session_member`, …) | `supabase/migrations/0002_helpers.sql` | ⬜ |
| **`session_tiles` + `session_summary` views** (`security_invoker`) | `supabase/migrations/0004_views.sql` | ⬜ |
| Session RPCs: start / join / end / settings / **announce** | `supabase/migrations/0005_rpc.sql` | ⬜ |
| Checkpoint RPC + broadcast | `supabase/migrations/0005_rpc.sql` | ⬜ |
| Join codes (JS + SQL, same alphabet) | `shared/join-code.js`, `gen_join_code()` | ⬜ |
| Realtime channel policy on `realtime.messages` | `supabase/migrations/0003_rls.sql` | ⬜ |
| `classify()` mirroring the view, + the agreement test | `shared/tile-state.js` | ⬜ |
| Client channel wrapper + session store | `src/realtime/sessionChannel.js`, `src/stores/session.js` | ⬜ |
| Join page, join code card, QR, checkpoint toast, connection pill | `views/JoinView.vue`, `components/session/*` | ⬜ |
| **Announcement banner** (embedded by Dylan in the workspace) + store action | `components/session/AnnouncementBanner.vue`, `stores/session.js` | ⬜ |
| Load simulator **(proposed)** | `scripts/simulate-class.js` | ⬜ |
| Tests | T-SESS-*, T-STAT-*, T-LOAD-*, RLS suite | ⬜ |

**Boundary:** owns who-can-see-what and the live session pipeline. Does not render tiles (Evan) or the workspace (Dylan), and does not create tables (Dylan).
**Hands to others:** `session_tiles` / `session_summary` to read, `sessionChannel` to subscribe, `classify()` to re-derive.
**Watch out:** your policies are the privacy contract in [09](./09-integration-contracts.md#5-privacy-contract-our-unique-feature--every-pr-is-checked-against-this). A missing `enable row level security` is a security bug, not a style issue.

---

### 🔵 Dylan — "Student Workspace" (F2) + Schema

| What | File(s) | Done |
|---|---|:---:|
| **All tables, constraints, indexes** (incl. `files_hash` generated columns) | `supabase/migrations/0001_tables.sql` | ⬜ |
| `files_valid()` constraint helper + size caps | `supabase/migrations/0002_helpers.sql` | ⬜ |
| Triggers: new-user profile, `status_history`, lesson-delete guard | `supabase/migrations/0006_triggers.sql` | ⬜ |
| **WebContainer runtime: boot, mount, spawn, server-ready → preview URL** | `src/runtime/container.js` | ⬜ |
| **Install flow + streamed terminal output + boot/install states** | `src/runtime/install.js`, `terminal.js`, `components/workspace/BootState.vue` | ⬜ |
| **`parseBuildError()` — strips the code frame before normalising** | `shared/build-error.js` | ⬜ |
| **IndexedDB file cache keyed by `files_hash`** | `src/cache/files.js` | ⬜ |
| **Delta autosave (5 s debounce, changed files only)** | `src/cache/autosave.js`, `autosave_patch` RPC | ⬜ |
| Workspace data access: catch-up RPC, my attempts | `src/api/workspace.api.js`, `catch_up` RPC | ⬜ |
| **IDE shell** (tree rail at lg, offcanvas at xs; tabs; panes) | `views/WorkspaceView.vue` | ⬜ |
| **File tree** (create/rename/delete; `SYNC_IGNORE` paths hidden) | `components/workspace/FileTree.vue` | ⬜ |
| CodeMirror wrapper (incl. `vue` mode), open-file tabs | `components/workspace/CodeEditor.vue`, `FileTabs.vue` | ⬜ |
| Preview iframe pointed at the dev server + runtime probe | `components/workspace/PreviewFrame.vue`, lesson `src/ca-probe.js` | ⬜ |
| Console panel, terminal panel, error gutter, status pill | `components/workspace/ConsolePanel.vue`, `TerminalPanel.vue` | ⬜ |
| Done / I'm lost / Help bottom bar; status upsert on change + heartbeat | `components/workspace/DoneButton.vue`, `stores/workspace.js` | ⬜ |
| Load checkpoint + restore attempt, **incl. the reinstall path** (uses Ray Yien's `DiffView`) | `stores/workspace.js` | ⬜ |
| Unsupported-browser guard (`crossOriginIsolated`) | `views/WorkspaceView.vue` | ⬜ |
| Automatic step checks (COULD) | `src/runtime/checks.js` | ⬜ |
| Tests | T-SBX-*, T-CATCH-01/02/03/06/07/09/10, T-PRIV-09/10 | ⬜ |

**Boundary:** owns everything inside the student's workspace and every migration that creates or alters a table. Others request schema changes by PR to Dylan; **policies on those tables are Ying Qi's**.

**Spike first (Week 8) — four unknowns, all cheap, all blocking:**

| # | Question | If the answer is bad |
|:---:|---|---|
| 1 | Does WebContainer's service worker fight the SPA catch-all rewrite, or serve a stale `index.html`? | Scope the SW, or adjust the Vercel rewrite |
| 2 | Does pnpm's symlinked `node_modules` work in the virtual FS? | `node-linker=hoisted` in `.npmrc` |
| 3 | **How long is a cold `pnpm install` for Mini Cart?** | > ~15 s → build the IndexedDB dependency cache ([05 §2](./05-core-logic.md#2-files-cache--dependencies)) |
| 4 | Is the preview origin really cross-origin to our app? | T-SBX-05 needs a different mechanism, and the privacy story needs rewriting |

Answers to #3 go in the README either way — the measurement is the decision record.

---

### 🟠 Karin — "Help Flow + Telegram" (F3)

| What | File(s) | Done |
|---|---|:---:|
| Help RPCs: create, claim, transition (conditional updates; replies append to `thread`) | `supabase/migrations/0005_rpc.sql` | ⬜ |
| **Follow-up RPC** (`replied → open`, fresh snapshot, cap of 3, original queue place) | `follow_up_help_request` in `0005_rpc.sql` | ⬜ |
| `telegram-webhook` function: `/start <code>`, `/stop`, `/help`, secret-token check | `supabase/functions/telegram-webhook/` | ⬜ |
| `telegram-notify` function: send queue, HTML escaping, 429 retry | `supabase/functions/telegram-notify/` | ⬜ |
| Database Webhook wiring for in-person pings | `supabase/migrations/0006_triggers.sql` + dashboard config | ⬜ |
| Link code RPC + profile card | `issue_telegram_link_code()`, `components/help/TelegramLinkCard.vue` | ⬜ |
| Student help panel (send, cancel, see reply/tick, **follow up**) | `components/help/StudentHelpPanel.vue`, `FollowUpForm.vue` | ⬜ |
| **Thread view** for student and reviewing TA; "Follow-up · last handled by …" badge | `components/help/HelpThread.vue`, `HelpRequestCard.vue` | ⬜ |
| TA queue page + review page (side-by-side via `DiffView`) | `views/HelpQueueView.vue`, `views/HelpReviewView.vue`, `components/help/*` | ⬜ |
| Queue subscription (Postgres Changes on `help_requests`) | `src/api/help.api.js` | ⬜ |
| `digest` send path used by Andric's report | `supabase/functions/digest/` | ⬜ |
| AI hints (COULD) **(proposed)** | `supabase/functions/hint/`, `shared/hint-rules.js` | ⬜ |
| Tests | T-HELP-*, T-TG-* | ⬜ |

**Boundary:** owns the help lifecycle and every outgoing Telegram message. Andric decides digest *content*; Karin's function sends it.
**Note:** a webhook URL is public. The secret-token check is not optional — T-TG-05 asserts it.

---

### 🟢 Evan — "Prof View: Lesson Plan + Dashboard" (F4)

| What | File(s) | Done |
|---|---|:---:|
| Lessons + steps data access (upload, edit, reorder, delete) | `src/api/lessons.api.js`, `replace_steps` / `delete_step` RPCs | ⬜ |
| TODO parser | `shared/todo-parser.js` | ⬜ |
| New lesson (upload tab) + lesson editor | `views/LessonNewView.vue`, `views/LessonEditView.vue`, `components/lesson/*` | ⬜ |
| Teach view: prof editor, plan, Save checkpoint, summary bar, **announce box** (calls Ying Qi's `announce`) | `views/TeachView.vue`, `components/session/AnnounceInput.vue` | ⬜ |
| Tiles, grid, filters, lost count — reading `session_tiles` | `components/dashboard/*`, `stores/dashboard.js` | ⬜ |
| Error normaliser + grouping (client-side `computed`) **(proposed)** | `shared/error-normalizer.js` | ⬜ |
| `spotlight` function (pick snapshot, anonymise, broadcast) **(proposed)** | `supabase/functions/spotlight/`, `shared/spotlight.js` | ⬜ |
| Tests | T-LES-*, T-TODO-*, T-DASH-*, T-ERRG-* | ⬜ |

**Boundary:** owns what the prof sees during class. Reads Ying Qi's views; does not write policies or alter tables.
**Note:** re-parse is now a pure function call in the browser — there is no round-trip to build.

---

### 🟡 Ray Yien — "Replay, Library, Diff, GitHub" (F5)

| What | File(s) | Done |
|---|---|:---:|
| Diff utility + `DiffView` (split/unified) | `shared/diff-summary.js`, `components/replay/DiffView.vue` | ⬜ |
| "What you missed" panel (embedded in Dylan's workspace) | `components/replay/WhatYouMissed.vue` | ⬜ |
| Lesson library (search, list) in course page | `components/lesson/LessonLibrary.vue` | ⬜ |
| `github-import` function | `supabase/functions/github-import/` | ⬜ |
| `github-export` function (Git Data API, one commit per checkpoint) | `supabase/functions/github-export/` | ⬜ |
| GitHub identity link via Supabase Auth provider | `src/api/replays.api.js` (`linkIdentity`) | ⬜ |
| Import tab in New lesson | `components/lesson/GithubImportTab.vue` | ⬜ |
| Replay + notes data access; `search()` RPC | `src/api/replays.api.js`, `notes.api.js`, `0005_rpc.sql` | ⬜ |
| Replay list + viewer, timeline, notes drawer, export dialog | `views/ReplayListView.vue`, `views/ReplayView.vue`, `components/replay/*` | ⬜ |
| Tests | T-REP-*, T-GH-*, T-CATCH-04/05/08 | ⬜ |

**Boundary:** owns everything after class except insights.
**Contract change to flag at the design lock:** export no longer holds the GitHub token server-side for 10 minutes — Supabase Auth holds it on the session and it reaches the browser. We still never persist it, and T-GH-06 asserts that. See [05](./05-core-logic.md#11-replay--github-import--export).

---

### 🔴 Andric — "Platform, Insights, Deployment, UI Consistency" (F6)

| What | File(s) | Done |
|---|---|:---:|
| Supabase project, Auth config, local stack setup | `supabase/config.toml`, Supabase dashboard | ⬜ |
| Supabase client + error mapper | `src/lib/supabase.js`, `src/api/mapError.js` | ⬜ |
| Auth + profile + courses data access; enrol / add-staff RPCs | `src/api/auth.api.js`, `courses.api.js`, `0005_rpc.sql` | ⬜ |
| Vue app shell, router + guards, auth/courses stores | `src/main.js`, `App.vue`, `router/index.js`, `stores/auth.js`, `stores/courses.js` | ⬜ |
| UI kit + tokens (navbar, toast, modal, empty state, status pill) | `components/ui/*`, `styles/tokens.css` | ⬜ |
| Landing, login, register, courses, course page shell, profile, 404 | `views/*` (those pages) | ⬜ |
| Report builder + `end-session` function + trends RPC + report page | `shared/report-builder.js`, `supabase/functions/end-session/`, `views/ReportView.vue`, `components/insights/*` | ⬜ |
| Seed data | `supabase/seed.sql` (lesson fixture files written with Evan) | ⬜ |
| Playwright config + the localStorage session fixture **(proposed)** | `playwright.config.js`, `tests/e2e/fixtures.js` | ⬜ |
| `tables_without_rls()` helper + the schema sweep test | `0003_rls.sql`, `tests/unit/rls/schema.test.js` | ⬜ |
| **Vercel + Supabase deployment, SPA rewrite, keep-alive** **(proposed)** | `vercel.json`, GitHub Actions cron | ⬜ |
| **Realtime free-tier verification** (by Week 11) | — | ⬜ |
| README assembly **(proposed)** | `README.md` | ⬜ |
| Tests | T-PLAT-*, T-INS-*, T-VAL-*, T-RESP-05, T-SEED-*, T-SMOKE-01, T-PRIV-06/07 | ⬜ |

**Boundary:** owns the frame everyone builds inside and the final responsive/consistency pass (reviews every PR's screenshots).
**Two new platform risks are yours:** the free-tier project pausing before Week 18, and the Realtime concurrent-connection cap versus the 40-student load test. Both are in [02](./02-tech-stack.md#risks-specific-to-this-stack); neither can be left to Week 12.

---

## Dependencies & Unblocking

```
Dylan:   tables ───────────┐
Ying Qi: policies + views ─┼──▶ everyone (no reads work until policies exist)
Andric:  Supabase project ─┘
         + Auth + app shell

Ying Qi: sessionChannel ───────▶ Evan (dashboard), Karin (queue), Dylan (status)
Ray Yien: diffSummary/DiffView ─▶ Dylan (What you missed), Karin (side-by-side)
Karin:   telegram-notify ───────▶ Andric (digest)
Evan:    parseTodos ────────────▶ Ray Yien (github-import), Andric (seed)
```

| Risk | Mitigation |
|---|---|
| Schema/policies late → everyone blocked | Contracts in [09](./09-integration-contracts.md) are fixed on Day 1; Day 1 migration ships tables **and** real policies, so nobody debugs an empty result set |
| A missing policy silently exposes student code | `tables_without_rls()` sweep test + an RLS negative test required in every PR that adds a table |
| **WebContainer integration is now on F2's critical path** | Dylan's four spikes above land in Week 8 before the IDE shell is built. Dylan's card is knowingly heavy — flagged, to be rebalanced once the spikes report |
| **Cold install makes joining or catching up feel broken** | Explicit streamed installing state; dependency cache if the measurement is bad |
| **A build error's code frame leaks code to the dashboard** | `parseBuildError()` strips it before `normalizeError()`; T-PRIV-09 asserts it on real Vite output |
| **Realtime free tier too small for 40 students** | Verify by Week 11. Fallback: add one small Node service owning only dashboard fan-out — auth, CRUD, RLS and functions stay as they are |
| **Supabase project pauses before Week 18** | External weekly keep-alive ping; verify the inactivity window; budget for the paid tier if unsure |
| Docker needed for the local stack on six machines + the markers' | README documents it; E2E can also run against a throwaway cloud test project |
| Migrations drift from the deployed project | `supabase db reset` in CI proves migrations apply from zero; deploy order is migrations → functions → frontend |
| Scope creep | COULD items only after the full MUST demo passes (stage gate) |

---

## Git Workflow

| Rule | Detail |
|---|---|
| Branches | `main` (protected, always deployable) · `feat/<name>-<topic>` e.g. `feat/karin-help-queue` |
| Pull requests | Small; one reviewer who isn't the author; CI (unit + RLS + E2E) must pass |
| Commits | `feat:`, `fix:`, `test:`, `docs:`, `refactor:` |
| Shared files | Changes to `shared/constants.js`, migrations or contracts need a ping in the team channel first |
| Migrations | **Never edit a merged migration** — add a new numbered one. CI runs `supabase db reset` to prove they apply from zero |
| Deploy order | migrations (`db:push`) → functions (`fn:deploy`) → frontend (push to `main`). A Vue change that needs a migration is not deployable until the migration is pushed |
| Weekly | Integration + redeploy every Friday; update the "Done" columns above |

---

## Open Questions

Answer these before Stage 0 is ticked:

1. Confirm the **(proposed)** items: RLS + views → Ying Qi; migrations → Dylan; error groups + Spotlight → Evan; AI hints → Karin; test setup + deployment + README → Andric.
2. ~~AWS or Render for deployment?~~ **Answered by the architecture:** Vercel (static) + Supabase. Nothing long-running to host.
3. Do all six members appear in the video? (FAQ 9 — check with our section's instructional team.)
4. Will a prof or TA try CodeAlong in one lab before Week 12? (The proposal plans a classmate poll + TA chat to validate the problem.)
5. LLM provider for hints — or drop hints and keep the rule table only?
6. **New:** is Dylan's card rebalanced after the Week 8 spikes, and if so what moves? (WebContainer + IDE shell + cache + all migrations is the heaviest card; left as-is by decision for now.)
7. **New:** free or paid Supabase tier through Week 18? Depends on the pausing policy and the Realtime cap — Andric to report by Week 11.
8. **New:** does the teaching team consider "Supabase + Edge Functions" to satisfy requirement #5 ("dynamic site with a backend data store")? We read it as yes — it is a hosted Postgres with server-side functions — but it is one message to confirm, and cheaper to ask in Week 8 than to discover in Week 12.
