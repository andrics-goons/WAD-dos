# CodeAlong — Workload Split (6 members)

> Based on the "Who do what?" table in our proposal. The Q&A slides ask for **distinct** responsibilities (no "Alice & Bob are responsible for the database"), roughly one meaningful feature per person, and a visible contribution from everyone. Items marked **(proposed)** weren't in the proposal table — confirm them at the next meeting (see [Open questions](#open-questions)).

## Summary

| Member | Owns | Feature | Tier | Also owns |
|---|---|---|:---:|---|
| **Ying Qi** | Live session engine + the frontend platform: session + checkpoint RPCs, Realtime channels, app shell, router, UI kit, core pages | F1 + platform | 2–3 | Vercel deployment, responsive/consistency review, the independent RLS sweep, load simulator + Realtime cap check, README assembly **(proposed)** |
| **Dylan** | Student workspace runtime + IDE: WebContainer boot / install / run, terminal, preview, build-error capture, editor, Done / Lost / Help bar | F2 | **3** | `CodeEditor` used by Evan, Ray Yien and Karin; the Week 8 WebContainer spikes; automatic step checks (COULD) |
| **Karin** | Help + communication: Check my work / Ask for help, follow-ups, TA queue + review, Telegram, class announcements | F3 | 2 | Student-facing session UI (join page, checkpoint toast, connection pill, announcement banner); Playwright setup; AI hints (COULD) **(proposed)** |
| **Evan** | Prof view: lessons + TODO plan, teach view (incl. live preview), class dashboard, insights report page | F4 | **3** | Error normaliser + grouping, `classify()`, Spotlight, the Mini Cart lesson project **(proposed)** |
| **Ray Yien** | Files over time: IndexedDB cache, delta autosave, catch-up, diff / "What you missed", replay, GitHub import + export | F5 | 2–3 | `FileTree` and `DiffView`, used by Dylan and Karin |
| **Andric** | Database, auth + insights data: **the whole schema** (tables, constraints, RLS, views, triggers), auth, accounts + courses data access, report builder | F6 + data platform | 2–3 | `seed.sql`, migration review, the free-tier keep-alive **(proposed)** |

Everyone writes the **E2E specs, unit tests and RLS negative tests for their own feature** (test IDs on each card below and in [06-stages-and-tests.md](./06-stages-and-tests.md)). Karin owns the shared Playwright setup. **Everyone writes the README section for their own feature** — they are the ones who must explain it in Q&A; Ying Qi only assembles.

### Rebalance (Week 8)

After the Supabase + WebContainer rewrites, Dylan's card was carrying more than twice the lightest cards. Rough relative sizes, tests included — deliberately coarse (S = 1, M = 2, L = 3, XL = 5):

| Member | Before | After |
|---|---:|---:|
| Dylan | ~40 | ~25 |
| Andric | ~27 | ~23 → **~28** after the sign-up-role and admin additions |
| Ying Qi | ~23 | ~24 |
| Ray Yien | ~16 | ~24 |
| Evan | ~16 | ~24 |
| Karin | ~18 | ~24 |

**Andric's card grew after the rebalance** — sign-up roles and the admin role (about +5) both belong to auth, so they went to its owner. It is now the heaviest by points; the admin page is the first thing to hand to Ying Qi if it runs late, since it is plain UI on top of his functions.

**Watch Evan's card.** It is level on points but carries the most *risk*: the Tier 3 algorithm (error grouping), the heaviest page (the teach view) and now the report page. If anything slips, the report page is the first thing to hand to Ying Qi — its charts are built on her UI kit anyway.

**What moved, and why each seam was chosen** — the rule was to move whole subsystems with a clean interface, never scatter single items:

| What moved | From → to | Why this seam |
|---|---|---|
| The schema: tables, constraints, `files_valid()` + helpers, RLS policies, views, triggers, migration review | Dylan + Ying Qi → **Andric** | One owner for the whole database contract. Removes the hand-off between whoever creates a table and whoever writes its policies — which sat on the Week 8 critical path |
| App shell, router + stores, UI kit + tokens, the core pages, responsive/consistency review, Vercel config | Andric → **Ying Qi** | The frontend platform moves as one block, to the person who already owns the client-side session plumbing (`sessionChannel`, session store) and who has the capacity once the schema left her card |
| Report page + insights components | Andric → **Evan** | Staff-facing analytics, next to his dashboard. Andric still builds the data behind it |
| Playwright config + the session fixture | Andric → **Karin** | Her help flow is the most multi-context E2E in the suite (a TA, several students, the Telegram outbox), so she needs the fixture first |
| Independent `tables_without_rls()` sweep | Andric → **Ying Qi** | Andric now writes the policies, so the check moves to someone who isn't their author |
| README assembly | Andric → **Ying Qi** | Goes with reviewing every PR's screenshots — one person sees all of it. Each member still writes their own section |
| IndexedDB file cache, delta autosave + `autosave_patch`, `catch_up` + my attempts + restore | Dylan → **Ray Yien** | "Versions of files over time" was already Ray Yien's domain (diff, What you missed, checkpoint replay). The interface is clean: `loadFiles()`, `autosave()` and `catchUp()` hand files to Dylan's `mount()` |
| `FileTree` | Dylan → **Ray Yien** | Self-contained (props in, events out), and reused read-only in the replay viewer |
| Class announcements (RPC, banner, input box) | Ying Qi + Evan → **Karin** | Announcements are communication — the same domain as help replies, follow-ups and Telegram |
| Join page, checkpoint toast, connection pill | Ying Qi → **Karin** | Student-facing session UI; all of it subscribes to Ying Qi's `sessionChannel`, so no interface changes |
| Join code card + QR display | Ying Qi → **Evan** | They live on Evan's teach view |
| `classify()` + its SQL/JS agreement test | Ying Qi → **Evan** | The dashboard's client-side re-derivation; Andric owns the SQL view it must agree with |
| Mini Cart lesson project (Vite + Express, the eight TODOs) | **unassigned** → Evan | He owns the TODO parser and the lesson editor; Dylan supplies `src/ca-probe.js` |
| The prof's live preview on the teach view | **unassigned** → Evan | His page; it reuses Dylan's `container.js` rather than building a second runtime |
| Realtime free-tier verification | Andric → **Ying Qi** | It *is* a run of her load simulator against her channels |

**What deliberately did not move:** Dylan keeps the whole WebContainer runtime. It is the largest and riskiest item in the project, and splitting a runtime between two people would be worse than one person owning it end to end. `CodeEditor` stays with him too — it is the core of the workspace, and three other people embed it.

**One deliberate separation:** Andric writes every policy, so Ying Qi runs the `tables_without_rls()` sweep and its test. A missing policy is caught by someone other than its author.

The earlier Supabase rewrite also removed the `routes/ → middleware/ → controllers/` layer. That was shared boilerplate rather than anyone's headline feature, so nobody lost a feature in either change.

---

## Non-Negotiable Implementation Pattern

Every task card follows the same pattern so the codebase reads like one person wrote it:

1. **Data access:** component → Pinia store action → `src/api/*.api.js` → `supabase`. **Never** import `supabase` in a component.
2. **Trusted writes:** anything multi-step, or that decides a role, code, sequence number or state transition, is a `security definer` RPC or an Edge Function — never a sequence of client calls. **Each feature owner writes their own RPCs, in a new numbered migration; Andric reviews every migration PR** because he owns the schema they touch.
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

The schema has a single owner, so it is one sequence rather than a hand-off:

```
Andric:  Supabase project + Auth → 0001 tables → 0002 helpers → 0003 policies → 0004 views ──▶ everyone
                                    (nobody can read anything until the policies exist —
                                     an RLS-enabled table with no policy returns zero rows)
Ying Qi: app shell + router + UI kit ─────────────────────────────────────────────────────▶ everyone
                                    (every page is built inside it)
Dylan:   the four WebContainer spikes  ← in parallel; the runtime needs neither to start
```

**Day 1 deliverable (Andric):** a migration that creates the tables *and* a permissive-but-real policy set, even if some policies are tightened later. An RLS-enabled table with no policies looks exactly like a bug to everyone else on the team.

### Week 9 pitch: what each person must have running

The pitch rubric gives 25% for "a functioning task". Each member shows one working sub-feature:

| Member | Working at the pitch |
|---|---|
| Ying Qi | Start session → join by code → checkpoint broadcast to 3 laptops; app deployed to Vercel once (even if early) |
| Dylan | Editor + sandboxed preview + console capturing a real error; Load checkpoint |
| Karin | Telegram bot linked to a TA account; a message sent from the `telegram-notify` function |
| Evan | Basic dashboard tiles updating live from `session_tiles`; TODO parser on the Mini Cart starter |
| Ray Yien | GitHub import of a public repo into a draft lesson |
| Andric | Schema + RLS live on the cloud project; register / log in and enrol by code working through RLS against it |

---

## Task Cards

Items marked **(moved)** changed owner in the [Week 8 rebalance](#rebalance-week-8); **(was unassigned)** were gaps nobody owned.

### 🟣 Ying Qi — "Live Session Engine + Frontend Platform" (F1 + platform)

| What | File(s) | Done |
|---|---|:---:|
| Session RPCs: start / join / end / settings (own migration, reviewed by Andric) | new migration | ⬜ |
| Checkpoint RPC + broadcast | new migration | ⬜ |
| Join codes (JS + SQL, same alphabet) | `shared/join-code.js`, `gen_join_code()` | ⬜ |
| Client channel wrapper + session store | `src/realtime/sessionChannel.js`, `src/stores/session.js` | ⬜ |
| **Vue app shell, router + guards, auth/courses stores** **(moved)** | `src/main.js`, `App.vue`, `router/index.js`, `stores/auth.js`, `stores/courses.js` | ⬜ |
| **UI kit + tokens** (navbar, toast, modal, empty state, status pill) **(moved)** | `components/ui/*`, `styles/tokens.css` | ⬜ |
| **Landing, login, register, courses, course page shell, profile, 404** **(moved)** — register includes the **Student / Educator** choice; login and register both honour `returnTo` | `views/*` (those pages) | ⬜ |
| **"Share enrolment" card** on the course page (owner only): enrol code, Copy link, QR **(new)** | `views/CourseView.vue` | ⬜ |
| **Responsive + consistency review** — every PR's 375 px and 1280 px screenshots **(moved)** | — | ⬜ |
| **Vercel deployment**: `vercel.json` (SPA rewrite + COOP/COEP headers), env vars **(moved)** | `vercel.json` | ⬜ |
| **Independent `tables_without_rls()` sweep** + its test **(moved)** | `tests/unit/rls/schema.test.js` | ⬜ |
| Load simulator **(proposed)** | `scripts/simulate-class.js` | ⬜ |
| Realtime free-tier verification against the 40-student load test, by Week 11 **(moved)** | — | ⬜ |
| **README assembly** — each member writes their own section **(moved)** | `README.md` | ⬜ |
| Tests | T-SESS-01, 02, 06–13 · T-PLAT-01, 02, 04–08 · T-VAL-02–05 · T-RESP-05 · T-SMOKE-01 · T-PRIV-06, 07 · T-LOAD-01–03 | ⬜ |

**Boundary:** owns the live session pipeline and the frame every page is built inside — shell, router, UI kit, tokens, the core pages, and the final responsive/consistency pass. Owns no tables; her session RPCs go in her own migrations, reviewed by Andric.
**Hands to others:** `sessionChannel` to subscribe, the session store, the UI kit, the router.
**Note:** she runs the independent RLS sweep over Andric's policies — deliberately not written by the policies' author.

---

### 🔵 Dylan — "Student Workspace Runtime + IDE" (F2)

| What | File(s) | Done |
|---|---|:---:|
| **WebContainer runtime: boot, mount, spawn, server-ready → preview URL** | `src/runtime/container.js` | ⬜ |
| Install flow + streamed terminal output + boot/install states | `src/runtime/install.js`, `terminal.js`, `components/workspace/BootState.vue` | ⬜ |
| Dependency-change detection and reinstall on catch-up; the IndexedDB dependency cache **only if** spike #3 says so | `src/runtime/install.js` | ⬜ |
| `parseBuildError()` — strips the code frame before normalising | `shared/build-error.js` | ⬜ |
| Runtime probe, shipped in the lesson template | lesson `src/ca-probe.js` | ⬜ |
| IDE shell (tree rail at lg, offcanvas at xs; tabs; panes) — embeds Ray Yien's `FileTree` | `views/WorkspaceView.vue` | ⬜ |
| CodeMirror wrapper (incl. `vue` mode) + open-file tabs — **shared with Evan, Ray Yien and Karin** | `components/workspace/CodeEditor.vue`, `FileTabs.vue` | ⬜ |
| Preview iframe pointed at the dev server | `components/workspace/PreviewFrame.vue` | ⬜ |
| Console panel, terminal panel, error gutter, status pill | `components/workspace/ConsolePanel.vue`, `TerminalPanel.vue` | ⬜ |
| Done / I'm lost / Help bottom bar; status upsert on change + heartbeat | `components/workspace/DoneButton.vue`, `stores/workspace.js` | ⬜ |
| Unsupported-browser guard (`crossOriginIsolated`) | `views/WorkspaceView.vue` | ⬜ |
| Automatic step checks (COULD) | `src/runtime/checks.js` | ⬜ |
| Tests | T-SBX-01–10, 12, 17 · T-CATCH-09, 10 · T-PRIV-09, 10 · T-RESP-01, 02, 06 · T-LOAD-05 | ⬜ |

**Boundary:** owns everything that *runs* the student's project, and the IDE frame around it. Gets files from Ray Yien's layer (`loadFiles`, `catchUp`) and mounts them; hands edits back through Ray Yien's `autosave()`. Owns no tables any more.

**Spike first (Week 8) — four unknowns, all cheap, all blocking:**

| # | Question | If the answer is bad |
|:---:|---|---|
| 1 | Does WebContainer's service worker fight the SPA catch-all rewrite, or serve a stale `index.html`? | Scope the SW, or adjust the Vercel rewrite |
| 2 | Does pnpm's symlinked `node_modules` work in the virtual FS? | `node-linker=hoisted` in `.npmrc` |
| 3 | **How long is a cold `pnpm install` for Mini Cart?** | > ~15 s → build the IndexedDB dependency cache ([05 §2](./05-core-logic.md#2-files-cache--dependencies)) |
| 4 | Is the preview origin really cross-origin to our app? | T-SBX-05 needs a different mechanism, and the privacy story needs rewriting |

Answers to #3 go in the README either way — the measurement is the decision record.

---

### 🟠 Karin — "Help, Communication & Notifications" (F3)

| What | File(s) | Done |
|---|---|:---:|
| Help RPCs: create, claim, transition (conditional updates; replies append to `thread`) | new migration, reviewed by Ying Qi | ⬜ |
| Follow-up RPC (`replied → open`, fresh snapshot, cap of 3, original queue place) | `follow_up_help_request` | ⬜ |
| `telegram-webhook` function: `/start <code>`, `/stop`, `/help`, secret-token check | `supabase/functions/telegram-webhook/` | ⬜ |
| `telegram-notify` function: send queue, HTML escaping, 429 retry | `supabase/functions/telegram-notify/` | ⬜ |
| Database Webhook wiring for in-person pings | migration + dashboard config | ⬜ |
| Link code RPC + profile card | `issue_telegram_link_code()`, `components/help/TelegramLinkCard.vue` | ⬜ |
| Student help panel (send, cancel, see reply/tick, follow up) | `components/help/StudentHelpPanel.vue`, `FollowUpForm.vue` | ⬜ |
| Thread view; "Follow-up · last handled by …" badge | `components/help/HelpThread.vue`, `HelpRequestCard.vue` | ⬜ |
| TA queue page + review page (side-by-side via Ray Yien's `DiffView`) | `views/HelpQueueView.vue`, `views/HelpReviewView.vue`, `components/help/*` | ⬜ |
| Queue subscription (Postgres Changes on `help_requests`) | `src/api/help.api.js` | ⬜ |
| **Class announcements: `announce` RPC, banner, input box** (Evan embeds the input in the teach view) **(moved)** | `components/session/AnnouncementBanner.vue`, `AnnounceInput.vue` | ⬜ |
| **Join page** — 6-box code input, `/join/:code` pre-fill, auto-submit **(moved)** | `views/JoinView.vue` | ⬜ |
| **Checkpoint toast + connection pill** **(moved)** | `components/session/CheckpointToast.vue`, `ConnectionPill.vue` | ⬜ |
| `digest` send path used by Andric's report | `supabase/functions/digest/` | ⬜ |
| **Playwright config + the localStorage session fixture** (prof, TA and N students logged in) **(moved)** | `playwright.config.js`, `tests/e2e/fixtures.js` | ⬜ |
| AI hints (COULD) **(proposed)** | `supabase/functions/hint/`, `shared/hint-rules.js` | ⬜ |
| Tests | T-HELP-* · T-TG-* · T-SESS-03–05, 14–18 | ⬜ |

**Boundary:** owns the help lifecycle, every outgoing Telegram message, and every student-facing session notification — joining, toasts, connection state, announcements. Uses Ying Qi's `sessionChannel`; does not own the transport.
**Note:** a webhook URL is public. The secret-token check is not optional — T-TG-05 asserts it.

---

### 🟢 Evan — "Prof View: Lessons, Teach & Dashboard" (F4)

| What | File(s) | Done |
|---|---|:---:|
| Lessons + steps data access (upload, edit, reorder, delete) | `src/api/lessons.api.js`, `replace_steps` / `delete_step` RPCs | ⬜ |
| TODO parser | `shared/todo-parser.js` | ⬜ |
| New lesson (upload tab) + lesson editor | `views/LessonNewView.vue`, `views/LessonEditView.vue`, `components/lesson/*` | ⬜ |
| **Mini Cart lesson project** — Vite + Express, the eight TODOs; Dylan supplies `ca-probe.js` **(was unassigned)** | `scripts/fixtures/mini-cart/` | ⬜ |
| Teach view: prof editor, plan, Save checkpoint, summary bar, session bar (embeds Karin's announce input) | `views/TeachView.vue` | ⬜ |
| **Prof's live preview** — reuses Dylan's `container.js` and `CodeEditor` **(was unassigned)** | `views/TeachView.vue` | ⬜ |
| **Join code card + QR display** **(moved)** | `components/session/JoinCodeCard.vue`, `QrDisplay.vue` | ⬜ |
| Tiles, grid, filters, lost count — reading `session_tiles` | `components/dashboard/*`, `stores/dashboard.js` | ⬜ |
| **`classify()` + the SQL/JS agreement test** **(moved)** | `shared/tile-state.js` | ⬜ |
| Error normaliser + grouping (client-side `computed`) **(proposed)** | `shared/error-normalizer.js` | ⬜ |
| `spotlight` function (pick snapshot, anonymise, broadcast) **(proposed)** | `supabase/functions/spotlight/`, `shared/spotlight.js` | ⬜ |
| **Insights report page** — funnel, top errors, recurring steps, digest panel; reads Andric's `session_reports` **(moved)** | `views/ReportView.vue`, `components/insights/*` | ⬜ |
| Tests | T-LES-* · T-TODO-* · T-DASH-* · T-ERRG-* · T-STAT-01–06, 10 · T-RESP-03, 04 · T-INS-04 | ⬜ |

**Boundary:** owns what the prof sees during and after class, and the lesson content itself. Reads Andric's views and report data; reuses Dylan's runtime and editor rather than building his own.
**Note:** re-parse is a pure function call in the browser — there is no round-trip to build.

---

### 🟡 Ray Yien — "Files Over Time: Cache, Sync, Catch-up, Replay, GitHub" (F5)

| What | File(s) | Done |
|---|---|:---:|
| **IndexedDB file cache keyed by `files_hash`** **(moved)** | `src/cache/files.js` | ⬜ |
| **Delta autosave** (5 s debounce, changed files only) + `autosave_patch` RPC **(moved)** | `src/cache/autosave.js` | ⬜ |
| **`catch_up` RPC, my attempts, restore attempt** **(moved)** | `src/api/workspace.api.js` | ⬜ |
| **`FileTree`** (create/rename/delete; `SYNC_IGNORE` hidden; read-only mode for replay) **(moved)** | `components/workspace/FileTree.vue` | ⬜ |
| Diff utility + `DiffView` (split/unified) | `shared/diff-summary.js`, `components/replay/DiffView.vue` | ⬜ |
| "What you missed" panel (embedded in Dylan's workspace) | `components/replay/WhatYouMissed.vue` | ⬜ |
| Lesson library (search, list) in course page | `components/lesson/LessonLibrary.vue` | ⬜ |
| `github-import` function + import tab in New lesson | `supabase/functions/github-import/`, `components/lesson/GithubImportTab.vue` | ⬜ |
| `github-export` function (Git Data API, one commit per checkpoint) + GitHub identity link | `supabase/functions/github-export/`, `linkIdentity` | ⬜ |
| Replay + notes data access; `search()` RPC | `src/api/replays.api.js`, `notes.api.js` | ⬜ |
| Replay list + viewer, timeline, notes drawer, export dialog | `views/ReplayListView.vue`, `views/ReplayView.vue`, `components/replay/*` | ⬜ |
| Tests | T-REP-* · T-GH-* · T-CATCH-01–08 · T-SBX-11, 13–16, 18–23 · T-LOAD-04 | ⬜ |

**Boundary:** owns every version of a file after it leaves the editor — cached, synced, snapshotted, diffed, replayed, exported. Hands Dylan files to mount; takes edits back through `autosave()`.
**Contract change to flag at the design lock:** export no longer holds the GitHub token server-side for 10 minutes — Supabase Auth holds it on the session and it reaches the browser. We still never persist it, and T-GH-06 asserts that. See [05](./05-core-logic.md#11-replay--github-import--export).

---

### 🔴 Andric — "Database, Auth & Insights Data" (F6 + data platform)

| What | File(s) | Done |
|---|---|:---:|
| Supabase project, Auth config, local stack setup | `supabase/config.toml`, Supabase dashboard | ⬜ |
| **All tables, constraints, indexes** (incl. `files_hash` generated columns) **(moved)** | `supabase/migrations/0001_tables.sql` | ⬜ |
| **`files_valid()` + membership helpers** (`is_course_staff`, `is_session_member`, …) **(moved)** | `supabase/migrations/0002_helpers.sql` | ⬜ |
| **RLS policies for every table + the Realtime channel policy** **(moved)** | `supabase/migrations/0003_rls.sql` | ⬜ |
| **`session_tiles` + `session_summary` views** (`security_invoker`) **(moved)** | `supabase/migrations/0004_views.sql` | ⬜ |
| **Triggers**: new-user profile, `status_history`, lesson-delete guard **(moved)** | `supabase/migrations/0006_triggers.sql` | ⬜ |
| **Review every migration PR** — feature owners write their own RPCs **(moved)** | — | ⬜ |
| Supabase client + error mapper | `src/lib/supabase.js`, `src/api/mapError.js` | ⬜ |
| Auth + profile + courses data access; enrol / add-staff RPCs | `src/api/auth.api.js`, `courses.api.js` | ⬜ |
| **Enrol page** — typed code and `/enrol/:code` link, auto-submit **(new)** | `views/EnrolView.vue` | ⬜ |
| Report builder + `end-session` function + trends RPC (the page is Evan's) | `shared/report-builder.js`, `supabase/functions/end-session/` | ⬜ |
| Seed data + `seed:generate` (uses Evan's Mini Cart fixture) | `supabase/seed.sql`, `scripts/seed-generate.js` | ⬜ |
| Keep-alive cron so the free-tier project can't pause before Week 18 | GitHub Actions cron | ⬜ |
| **Sign-up role choice**: trigger allow-list (`prof`, else `student`) + `register({ role })` **(new)** | sign-up migration, `src/api/auth.api.js` | ⬜ |
| **Admin role**: `app_role()` / `is_admin()`, one `admin reads all` policy per table, `admin_audit` **(new)** | `0002_helpers.sql`, `0003_rls.sql`, new migration | ⬜ |
| **Admin user management**: `admin_list_users`, `admin_set_role`, `admin-users` Edge Function **(new)** | new migration, `supabase/functions/admin-users/`, `src/api/admin.api.js` | ⬜ |
| **Admin users page** — your one Vue page **(new)** | `views/AdminUsersView.vue` | ⬜ |
| Tests | T-PLAT-03, 09–18 · T-STAT-07–09, 11, 12 · T-PRIV-01–05, 08 · T-INS-01–03, 05–08 · T-VAL-01, 06–08 · T-SEED-* · T-ADM-* · RLS suite | ⬜ |

**Boundary:** owns the whole database contract — every table, policy, view and trigger — plus auth, sign-up roles, the admin role, the accounts/courses data layer, the insights data and the seed. Builds one page: `/admin/users`. Others request schema changes by PR to Andric.
**Hands to others:** the tables and views, `mapError()`, `auth.api` / `courses.api`, and `session_reports` for Evan's report page.
**Watch out:** your policies are the privacy contract in [09](./09-integration-contracts.md#5-privacy-contract-our-unique-feature--every-pr-is-checked-against-this). A missing `enable row level security` is a security bug, not a style issue — and Ying Qi's independent sweep is there to catch exactly that.

---

## Dependencies & Unblocking

```
Andric:   Supabase project + Auth ─┐
          + schema + policies + views├──▶ everyone (no reads work until policies exist)
Ying Qi:  app shell + router + UI kit┘    (every page is built inside it)
Karin:    Playwright fixture ─────────▶ everyone's E2E specs

Ying Qi:  sessionChannel ────────────▶ Evan (dashboard), Karin (queue, toasts, banner), Dylan (status)
Dylan:    container.js + CodeEditor ─▶ Evan (teach preview), Ray Yien (replay preview), Karin (review)
Ray Yien: loadFiles / autosave / catchUp ─▶ Dylan (workspace)
Ray Yien: FileTree / DiffView ───────▶ Dylan (IDE, What you missed), Karin (side-by-side)
Karin:    telegram-notify ───────────▶ Andric (digest)
Evan:     parseTodos + Mini Cart ────▶ Ray Yien (github-import), Andric (seed)
```

| Risk | Mitigation |
|---|---|
| Schema/policies late → everyone blocked | One owner now (Andric), so there is no hand-off. Contracts in [09](./09-integration-contracts.md) are fixed on Day 1; the Day 1 migration ships tables **and** real policies, so nobody debugs an empty result set |
| A missing policy silently exposes student code | Ying Qi's **independent** `tables_without_rls()` sweep (not written by the policy author) + an RLS negative test required in every PR that adds a table |
| **WebContainer integration is on F2's critical path** | Dylan's four spikes land in Week 8 before the IDE shell is built. After the rebalance his card is the runtime and the IDE only, so the spikes get real attention |
| **The file layer and the runtime now have different owners** | The seam is three functions (`loadFiles`, `autosave`, `catchUp`) and one (`mount`). Fix their signatures on Day 1 in [09 §7](./09-integration-contracts.md#7-cross-owner-signatures) so Dylan and Ray Yien can build against stubs |
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
| Migrations | **Never edit a merged migration** — add a new numbered one. Feature owners write their own RPCs in their own new migration; **Andric reviews every migration PR**. CI runs `supabase db reset` to prove they apply from zero |
| Deploy order | migrations (`db:push`) → functions (`fn:deploy`) → frontend (push to `main`). A Vue change that needs a migration is not deployable until the migration is pushed |
| Weekly | Integration + redeploy every Friday; update the "Done" columns above |

---

## Open Questions

Answer these before Stage 0 is ticked:

1. Confirm the **(proposed)** items and the **[Week 8 rebalance](#rebalance-week-8)**: the whole schema → Andric; the frontend platform (shell, router, UI kit, core pages, Vercel) → Ying Qi; the file layer + `FileTree` → Ray Yien; announcements, student session UI and Playwright setup → Karin; Mini Cart, teach preview, join code card, `classify()` and the report page → Evan; AI hints → Karin.
2. ~~AWS or Render for deployment?~~ **Answered by the architecture:** Vercel (static) + Supabase. Nothing long-running to host.
3. Do all six members appear in the video? (FAQ 9 — check with our section's instructional team.)
4. Will a prof or TA try CodeAlong in one lab before Week 12? (The proposal plans a classmate poll + TA chat to validate the problem.)
5. LLM provider for hints — or drop hints and keep the rule table only?
6. ~~Is Dylan's card rebalanced?~~ **Done** — see [Rebalance (Week 8)](#rebalance-week-8). Revisit only if a spike comes back badly (e.g. the dependency cache turns out to be needed)
7. **New:** free or paid Supabase tier through Week 18? Depends on the pausing policy (Andric) and the Realtime cap (Ying Qi) — both to report by Week 11.
8. **New:** does the teaching team consider "Supabase + Edge Functions" to satisfy requirement #5 ("dynamic site with a backend data store")? We read it as yes — it is a hosted Postgres with server-side functions — but it is one message to confirm, and cheaper to ask in Week 8 than to discover in Week 12.
