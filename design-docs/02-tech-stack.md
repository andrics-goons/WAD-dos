# CodeAlong — Tech Stack & Project Structure

## Technology Stack

**Shape of the system:** a Vue 3 single-page app on Vercel talking straight to Supabase (Postgres + Auth + Realtime), plus a handful of Edge Functions for the jobs that need secrets or elevated rights. Student code runs in a **StackBlitz WebContainer** — real Node, in the student's own browser. There is no Express server, no Socket.IO and no Node process of ours to host.

| Layer | Technology | Why | Course link |
|---|---|---|---|
| Markup / styling | HTML5, CSS3, **Bootstrap 5** + Bootstrap Icons | Responsive grid and components out of the box; our own CSS tokens on top | WAD2 (Bootstrap, responsive design), IDP (UI patterns) |
| Frontend framework | **Vue 3** (Composition API, SFCs) | Reactive dashboard and workspace; covered in WAD2 and the final exam | WAD2 |
| Routing | **Vue Router** | Client-side pages with route guards by role | WAD2 |
| Client state | **Pinia** | One store per domain, shared without prop drilling | WAD2 (state management) |
| Build tool | **Vite** | Dev server with hot reload; builds the static bundle Vercel serves | New (tooling only) |
| In-browser editor | **CodeMirror 6** | Lightweight, mobile-friendly editor with gutter markers for error lines | New — credited |
| Database | **Supabase Postgres** | Relational model fits courses → lessons → sessions; free tier; RLS enforces our privacy rule *in the database* | IS113 (SQL), new (Postgres/RLS) |
| Data access | **`supabase-js` v2** (PostgREST) | Async HTTP from Vue with `{ data, error }`; no hand-written CRUD layer | WAD2 (async, HTTP clients) |
| Auth | **Supabase Auth** (email + password) | Issues the JWT that authorises Postgres, Realtime and Functions alike | IS113 (auth concepts) |
| Authorization | **Row Level Security** policies | The rule lives next to the data, so no handler can forget it | New — credited |
| Realtime | **Supabase Realtime** (Broadcast · Postgres Changes · Presence) | Checkpoint fan-out, live tiles, help queue, attendance | New — credited |
| Server-side logic | **Supabase Edge Functions** (Deno + TypeScript) | The only place our API secrets exist; also the trusted path for Spotlight and reports | New — credited |
| Validation | **zod** (client) + Postgres `check` constraints | Per-field form messages, with a constraint behind each one | New — credited |
| Diffing | **diff** (jsdiff) | Line diffs for "What you missed" and replay | New — credited |
| QR codes | **qrcode** | Join-code QR on the projector | New — credited |
| External APIs | **Telegram Bot API**, **GitHub REST API**, LLM API (KIV) | Called from Edge Functions — see [05-core-logic.md](./05-core-logic.md) | Briefing requirement |
| Testing | **Playwright** (E2E), **Vitest** (unit), **Supabase CLI** local stack | Multi-browser-context E2E; a real Postgres per run, reset by migration | Briefing requirement |
| Hosting | **Vercel** (static) + **Supabase** (DB, Auth, Realtime, Functions) | Nothing to keep awake on the web tier; no WebSocket proxy to configure | — |
| Dev tooling | Supabase CLI, ESLint + Prettier | Local stack, consistent style | — |

**Note on axios.** The app itself does not use axios — `supabase-js` is the HTTP path. axios still appears in the project, inside the *lesson starter code* students write against (the Mini Cart lesson calls `axios.get`), served from a CDN inside the sandbox and intercepted by our mock API. That is deliberate: it is the lesson's dependency, not ours.

### Why not Express + MongoDB?

That was the original plan (IS113 stack). We moved to Supabase because three things got structurally better and one got worse:

- **Our privacy promise became enforceable.** "Staff never see a student's code unless they sent it" used to be a check each controller had to remember. It is now one RLS policy on `snapshots` that applies to every query automatically.
- **No long-running process to deploy.** Socket.IO needs a persistent Node server, which rules out most free hosting and needs WebSocket support on a load balancer. Supabase Realtime removes that entirely.
- **Much less code to finish by Week 12.** The whole `models/`, `controllers/`, `middleware/`, `validators/` and `sockets/` layer — roughly 66 REST endpoints — collapses into direct queries plus a set of RPCs and 9 functions.
- **What got worse:** the anon key ships in the browser bundle, so a table without RLS is readable by anyone. RLS is no longer an optimisation, it is the entire security boundary. Hence the hard rule in [09](./09-integration-contracts.md#4-authorization-layering): no table lands without policies and a negative test.

### Why not React / plain HTML pages?

Vue is covered in the syllabus (so the teaching team can help us) and in the final exam (FAQ 3). Plain multi-page HTML would make the live dashboard and workspace far harder to keep reactive.

---

## Project Folder Structure

One app, no workspaces — the former `server/` has no successor.

```
codeAlong/                       ← project root; Vercel "Root Directory" points here
├── package.json                 ← "packageManager": "pnpm@10.x" so Corepack pins it for everyone
├── pnpm-lock.yaml               ← committed; Vercel detects pnpm from this file
├── .npmrc                       ← node-linker=hoisted only if the WebContainer spike needs it
├── vercel.json                  ← SPA rewrite + COOP/COEP headers (see Deployment)
├── index.html
├── vite.config.js
├── playwright.config.js         ← projects: desktop-chrome (1280px), mobile-chrome (375px)
├── vitest.config.js
├── .env.example                 ← VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
│
├── shared/                      ← imported by BOTH src/ (Vite) and supabase/functions/ (Deno)
│   ├── constants.js             ← Roles, tile states, help statuses, limits, event names
│   ├── checkpoint-label.js      ← Andric
│   ├── error-normalizer.js      ← Evan
│   ├── tile-state.js            ← Evan — classify(), must agree with Andric's session_tiles SQL
│   ├── diff-summary.js          ← Ray Yien
│   ├── spotlight.js             ← Evan — excerpt + anonymise
│   ├── report-builder.js        ← Andric
│   └── join-code.js             ← Ying Qi
│
├── src/                         ← the Vue app
│   ├── main.js
│   ├── App.vue
│   ├── router/index.js          ← routes + role guards
│   ├── lib/supabase.js          ← createClient(url, anonKey) — the only place it is constructed
│   ├── api/                     ← one module per domain; the ONLY place supabase is queried
│   │   ├── mapError.js          ← Postgres/PostgREST error → { code, message }
│   │   ├── auth.api.js   courses.api.js   lessons.api.js   sessions.api.js
│   │   ├── checkpoints.api.js   workspace.api.js   dashboard.api.js
│   │   └── help.api.js   replays.api.js   notes.api.js   reports.api.js
│   ├── stores/                  ← Pinia: auth, courses, session, workspace, dashboard, help, replay
│   ├── validators/              ← zod schemas, one per form
│   ├── views/                   ← one file per page (see 04-pages-routes-and-events.md)
│   ├── components/
│   │   ├── ui/                  ← AppNavbar, AppToast, ConfirmModal, EmptyState, StatusPill (Ying Qi)
│   │   ├── workspace/           ← CodeEditor, FileTabs, PreviewFrame, ConsolePanel, DoneButton (Dylan); FileTree (Ray Yien)
│   │   ├── dashboard/           ← StudentTile, TileGrid, ErrorGroupList, ClassSummaryBar (Evan)
│   │   ├── lesson/              ← LessonLibrary, StarterUpload (Evan)
│   │   ├── session/             ← CheckpointToast, ConnectionPill, AnnouncementBanner, AnnounceInput (Karin); JoinCodeCard, QrDisplay (Evan)
│   │   ├── help/                ← HelpQueue, HelpRequestCard, SideBySideView (Karin)
│   │   ├── replay/              ← CheckpointTimeline, DiffView, NoteEditor (Ray Yien)
│   │   └── insights/            ← CheckpointFunnelChart, TopErrorsTable (Evan)
│   ├── composables/             ← useSandbox, useAutosave, useBreakpoint, useCountdown
│   ├── runtime/                 ← WebContainer integration (Dylan)
│   │   ├── container.js         ← boot, mount, spawn, server-ready → preview URL
│   │   ├── install.js           ← pnpm install, streamed; skipped when the tree is unchanged
│   │   └── terminal.js          ← xterm-style output panel wiring
│   ├── cache/                   ← the file layer (Ray Yien)
│   │   ├── files.js             ← IndexedDB cache keyed by files_hash (§2 of 05)
│   │   └── autosave.js          ← 5 s debounce, changed files only
│   └── styles/
│       ├── tokens.css           ← colours, spacing, radii, tile-state colours
│       └── main.css
│
├── supabase/                    ← everything that is not the browser
│   ├── config.toml
│   ├── migrations/              ← ONE FILE PER LAYER, each holding that layer's tables, helpers,
│   │   │                           policies and RPCs; named by `supabase migration new <name>`
│   │   │                           (<timestamp>_<name>.sql). Schema owned by Andric; feature
│   │   │                           owners add their own RPC migrations, which Andric reviews
│   │   ├── …_profiles.sql       ← profiles, sign-up trigger, app_role(), is_admin()
│   │   ├── …_courses.sql        ← courses, course_staff, course_students, is_course_*(),
│   │   │                           create_course / enrol_with_code / add_course_staff / remove_course_student
│   │   ├── …_test_outbox.sql    ← where mocked Edge Functions record what they'd have sent
│   │   └── (next)               ← lessons → sessions, checkpoints, status + the two views
│   │                               → snapshots, help requests, notes, reports
│   ├── functions/               ← Deno; one folder per function
│   │   ├── _shared/cors.ts, supabaseAdmin.ts, outbox.ts
│   │   ├── telegram-webhook/    ← Karin — receives /start <code>, /stop, /help
│   │   ├── telegram-notify/     ← Karin — in-person ping (called by a pg_net trigger)
│   │   ├── github-import/       ← Ray Yien
│   │   ├── github-export/       ← Ray Yien — one commit per checkpoint
│   │   ├── spotlight/           ← Evan — anonymised excerpt
│   │   ├── end-session/         ← Andric — builds the report (invoked by DB webhook)
│   │   ├── digest/              ← Andric content, Karin send
│   │   ├── hint/                ← Karin (COULD)
│   └── seed.sql                 ← demo data (07-seed-and-demo.md); applied by `supabase db reset`
│
├── scripts/
│   ├── simulate-class.js        ← N fake students over supabase-js (Ying Qi)
│   ├── seed-generate.js         ← prints seed rows using the real shared/ functions (Andric)
│   └── fixtures/mini-cart/      ← the Mini Cart lesson project (Evan)
│
└── tests/
    ├── e2e/                     ← Playwright specs (see 06-stages-and-tests.md)
    │   ├── fixtures.js          ← profPage, taPage, studentPages(n), db reset
    │   └── *.spec.js
    └── unit/
        ├── *.test.js            ← shared/ pure logic
        └── rls/*.test.js        ← negative authorization tests (service role vs user role)
```

---

## How Everything Connects

### Read / write flow

```
Vue component
   │  calls store action            (components never import supabase)
   ▼
Pinia store ──▶ src/api/*.api.js ──▶ supabase-js  ──▶  PostgREST
                      │                                    │
                      │                              RLS policies
                      │                            (auth.uid() decides
                      │                             which rows exist)
                      │                                    │
                      │                                 Postgres
                      │
                      └──▶ supabase.rpc(…)        for trusted multi-step writes
                      └──▶ supabase.functions.invoke(…)   for secrets / external APIs
                                     │
                                     ▼
                            Edge Function (Deno)
                              secrets: TELEGRAM_BOT_TOKEN, GITHUB_TOKEN, …
                              service role key (never leaves the function)
                                     │
                                     ▼
                            Telegram / GitHub / LLM
```

Errors come back as `{ error }` and pass through `mapError()` once, so every store and form handles failure the same way — see [09](./09-integration-contracts.md#3-response--error-envelope).

### Realtime flow

```
Student browser                       Supabase                          Prof / TA browser
───────────────                       ────────                          ─────────────────
supabase.auth session (JWT)
subscribe('session:<id>') ──────────▶ RLS on realtime.messages
                                      + postgres_changes on student_status
edits → probe reports error / Done
upsert student_status (throttled 2 s)─▶ row written
                                      postgres_changes ────────────────▶ tile re-reads session_tiles
                                      trigger → status_history            counts = Vue computed (≤1/s)

                                      rpc('save_checkpoint') ◀────────── "Save checkpoint"
                                        insert + set checkpoint_seq
                                        realtime.send('checkpoint:new')
                       ◀──── broadcast checkpoint:new                 ◀── (staff get it too)
                            every tile's target_order changes,
                            so Done students drop back to in_progress with no extra writes
```

The last line is the part worth noticing: because the tile state is **derived** from `sessions.checkpoint_seq`, a new checkpoint re-classifies all 40 students with no fan-out writes at all. The old design needed an in-memory cache and a re-classify sweep to do the same thing.

### Concrete example: prof saves a checkpoint

1. **Prof** clicks **Save checkpoint** in `TeachView.vue` → `sessionStore.saveCheckpoint()` → `sessions.api.js` → `supabase.rpc('save_checkpoint', { p_session_id, p_files, p_title })` — any time, title optional.
2. **The RPC** (`security definer`) checks `is_course_prof(course_id)` and `status = 'live'`, allocates `seq` (locking the session row so two saves can't take the same number), inserts the `checkpoints` row, sets `sessions.checkpoint_seq`, and calls `realtime.send()` on `session:<id>` with `checkpoint:new`.
3. **Students' browsers** receive the broadcast: a toast appears, the "Load checkpoint" button updates, and their status goes back to In progress until they click Done.
4. **Staff browsers** receive the same broadcast and re-read `session_summary`; every Done tile comes back as `in_progress` from the view, because `checkpoint_seq` changed.
5. **Postgres** has the checkpoint; replay later reads them in `seq` order.

Compare with the old flow: one RPC replaces a route file, a validator, a controller, a broadcast helper and a cache invalidation.

---

## Coding Conventions

| Concern | Convention |
|---|---|
| File names | kebab-case; Vue views `PascalCaseView.vue`, components `PascalCase.vue`; api modules `*.api.js`; migrations `NNNN_topic.sql` |
| SQL ↔ JS casing | Postgres is `snake_case`, JS is `camelCase`; converted once in `src/api/*.api.js` — stores never see snake_case |
| Data access | Component → store → `api/*.api.js` → supabase. **Never** import `supabase` in a component |
| Trusted writes | Anything multi-step, or that decides a role/code/sequence, is an RPC or an Edge Function — never a sequence of client calls |
| RLS | Every table: `enable row level security` + a policy per command, in the same migration, with a negative test |
| Views | Always `with (security_invoker = true)`, or the view bypasses RLS |
| Domain errors | `raise exception 'CODE\|user-facing message' using errcode = 'P0001'` |
| Validation | zod in `src/validators/` for the form message; a `check` constraint or RPC guard behind every rule |
| Pure logic | Lives in `shared/`, no DOM and no network, unit-tested with Vitest |
| Vue components | Props typed with `defineProps`; events declared with `defineEmits`; no data access |
| CSS | Bootstrap utilities first; custom styles only via `tokens.css`; mobile-first |
| Commits | Conventional prefixes: `feat:`, `fix:`, `test:`, `docs:`, `refactor:` |

---

## WAD2 Concepts Mapped to the Project

Useful for the "explain how you used JS/Vue/CSS" part of the video.

| Concept | Where we use it |
|---|---|
| Vue reactivity (`ref`, `reactive`) | Workspace file buffers, dashboard tiles |
| `computed` | Tile counts per state, filtered tiles, error groups, progress %, changed-line counts in "What you missed" |
| `watch` | Autosave debounce on editor changes; re-run preview when files change |
| Components, props, emits | `StudentTile` (props: tile) → emits `select`; `CodeEditor` emits `update:modelValue`, `save` |
| `v-for`, `v-if`, `v-model`, `:class` | Tile grid, filter chips, checkpoint list, state colours |
| Lifecycle hooks | `onMounted` subscribes to the session channel; `onBeforeUnmount` unsubscribes and clears timers |
| Vue Router + guards | Role-guarded routes (`meta.roles`), `/join/:code` deep link from QR |
| Pinia | Shared session state between editor, toolbar, console and checkpoint list |
| Async JS (`async/await`, Promises) | Every `supabase` call, `rpc`, `functions.invoke`, and the Edge Functions' own `fetch` to Telegram/GitHub |
| JSON / JSONB | `files`, `error`, `settings`, report payloads; socket-free realtime messages |
| Relational data + SQL | Tables, joins, foreign keys, partial unique indexes, aggregate views, RLS policies |
| DOM events / `postMessage` | Sandbox iframe ↔ parent communication |
| `localStorage` | Supabase session storage (by the client library) + remembered editor font size and last-open file |
| Bootstrap grid + breakpoints | Workspace 3 panes (lg+) → tabs (< md); tile grid columns per breakpoint |

---

## Responsive Breakpoints (Bootstrap 5)

| Name | Min width | Our test width | Must look right |
|---|---:|---:|---|
| xs | 0 | **375 px** (iPhone 6) and **575 px** (demo width) | Every page; workspace in tab mode |
| sm | 576 px | 600 px | Forms two-column where useful |
| md | 768 px | 800 px | Tile grid 4 columns |
| lg | 992 px | 1024 px | Workspace three panes; teach view editor + side panel |
| xl | 1200 px | 1280 px | Full teach view: editor, plan, dashboard |
| xxl | 1400 px | 1440 px | No stretched lines (max content width) |

Both portrait and landscape are checked at xs (FAQ 17).

---

## Third-Party Libraries (credit these)

FAQ 6 requires every public library to be named in the presentation and in code comments.

| Library | Licence | Used for |
|---|---|---|
| Vue, Vue Router, Pinia | MIT | Frontend framework, routing, state |
| Bootstrap, Bootstrap Icons | MIT | Styling, icons |
| CodeMirror 6 | MIT | In-browser editor |
| `supabase-js` | MIT | Data access, auth, realtime, function calls |
| **StackBlitz WebContainer API** | **Free for personal / educational / open-source; commercial use needs a licence — not MIT** | Running student projects in the browser |
| Supabase platform (Postgres, GoTrue, Realtime, Edge Runtime) | Apache-2.0 / PostgreSQL | Database, auth, realtime, functions |
| zod | MIT | Validation |
| diff (jsdiff) | BSD-3 | Line diffs |
| qrcode | MIT | QR join codes |
| axios | MIT | **Inside lesson starter code only**, not in the app |
| Playwright, Vitest, Supabase CLI | Apache-2.0 / MIT | Testing and local stack |

---

## Environment Variables

Two separate places, and mixing them up is a security bug.

### Client — Vercel project settings (and `.env.local` for dev)

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

Both are **public** — Vite inlines any `VITE_`-prefixed variable into the bundle. That is expected: the anon key is designed to be shipped, *provided every table has RLS*. Never put a service role key or an API secret here.

### Functions — `supabase secrets set`

```env
APP_URL=https://<app>.vercel.app          # QR codes, Telegram links, replay links
TELEGRAM_BOT_TOKEN=<from @BotFather>
TELEGRAM_BOT_USERNAME=CodeAlongBot
TELEGRAM_WEBHOOK_SECRET=<long random>     # verified on every webhook request
GITHUB_TOKEN=<fine-grained, public-repo read>
LLM_API_KEY=                              # optional (KIV); hints fall back to rules when empty
EXTERNAL_APIS=live                        # live | mock  (local + tests use mock)
```

The GitHub OAuth app's ID and secret are **not** function secrets: Supabase Auth holds them (see "GitHub sign-in" below).

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected into every function automatically — use them there and nowhere else.

> `.env.local` and `.env` are in `.gitignore`. Only `.env.example` is committed. Credentials the markers need go in the README.

### npm scripts

| Script | What it does |
|---|---|
| `pnpm install` | Installs the app |
| `pnpm dev` | Vite on 5173 against whichever Supabase project `.env.local` points at |
| `pnpm dev:local` | `supabase start` + Vite — full local stack, no cloud. **Use this by default** (see the egress rule below) |
| `pnpm build` | Builds `dist/` |
| `pnpm db:reset` | `supabase db reset` — re-applies all migrations + `seed.sql` (this is our "seed" command) |
| `pnpm db:push` | `supabase db push` — applies new migrations to the linked cloud project |
| `pnpm fn:deploy` | `supabase functions deploy` — all Edge Functions |
| `pnpm test:unit` | Vitest (`shared/` logic + RLS negative tests) |
| `pnpm test:e2e` | Starts the local stack with `EXTERNAL_APIS=mock`, builds, runs Playwright |
| `pnpm simulate --session ABC234 --students 40` | Load test / fills the dashboard for demos. **Against the local stack unless you mean to spend egress** |

---

## Deployment

Two targets. A `git push` deploys **only the frontend** — schema and functions are separate commands, which means a teammate can ship a Vue change that depends on a migration nobody ran. Deploy in this order: migrations → functions → frontend.

| What | Where | Command |
|---|---|---|
| Vue bundle | Vercel | automatic on push to `main` |
| Schema + RLS + RPCs | Supabase | `pnpm db:push` |
| Edge Functions | Supabase | `pnpm fn:deploy` |

### GitHub sign-in (local and cloud)

"Continue with GitHub" (login, register) and "Connect GitHub" (profile) both go through **Supabase Auth's GitHub provider**, so one GitHub OAuth app per environment covers them. The client ID and secret never go in `config.toml` or the repo.

| | Local stack | Cloud project |
|---|---|---|
| GitHub OAuth app callback URL | `http://127.0.0.1:54321/auth/v1/callback` | `https://<ref>.supabase.co/auth/v1/callback` |
| Homepage URL | `http://localhost:5173` | the Vercel URL |
| Where the ID + secret go | `supabase/.env` (copy `supabase/.env.example`), then `supabase stop` + `start` | Dashboard → Authentication → Sign In / Providers → GitHub |
| Manual linking ("Connect GitHub") | `enable_manual_linking = true` in `config.toml` | Dashboard → Authentication → Sign In / Providers → **Allow manual linking** |
| Redirect allow-list | `additional_redirect_urls` in `config.toml` (any path on the Vite dev server) | Dashboard → Authentication → URL Configuration → add `https://<app>.vercel.app/**` |

Each developer can make their own OAuth app for the local stack (GitHub allows one callback URL per app). Without `supabase/.env` the stack still starts; only the GitHub buttons fail, at GitHub's "application not found" page.

### One-time setup

- **Vercel → Root Directory = `codeAlong`** (the app is not at the repo root)
- **`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`** in Vercel env vars
- **`pnpm-lock.yaml` committed inside `codeAlong/`** — Vercel picks the package manager from the lockfile, and Root Directory is `codeAlong`
- **`vercel.json`** with the SPA rewrite — without it, a refresh on `/s/:id/code` and, critically, **the `/join/:code` QR deep link** both return a Vercel 404:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],
  "headers": [{
    "source": "/(.*)",
    "headers": [
      { "key": "Cross-Origin-Embedder-Policy", "value": "credentialless" },
      { "key": "Cross-Origin-Opener-Policy",   "value": "same-origin" }
    ]
  }]
}
```

- **Those two headers are what make WebContainer work** — it needs `SharedArrayBuffer`, which needs the page cross-origin isolated. We use `credentialless` rather than `require-corp` because `require-corp` additionally demands a `Cross-Origin-Resource-Policy` header on *every* cross-origin subresource, which would break any CDN asset. Self-host fonts rather than loading Google Fonts.

- **Supabase → Auth → URL Configuration:** Site URL and redirect allowlist set to the Vercel domain, or confirmation and OAuth redirects bounce to localhost
- **`supabase secrets set`** for every function secret above
- **Telegram `setWebhook`** once, pointing at the deployed `telegram-webhook` URL, with `secret_token` = `TELEGRAM_WEBHOOK_SECRET`. One webhook per bot token, so local and deployed cannot both be registered — the same conflict the old design had with two pollers
- **GitHub OAuth app** callback URL set to the deployed domain

### The egress rule (free tier, 5 GB/month)

Supabase only ever carries **source files** — never `node_modules`. WebContainer fetches packages from the npm registry straight to the browser, so dependency traffic is **entirely off our budget**. With the 200 KB / 40-file cap and the `files_hash` cache in [05 §2](./05-core-logic.md#2-files-cache--dependencies), a realistic 40-student session costs roughly:

| Traffic | Per session |
|---|---|
| Starter files, 40 students (once per device, then cached) | ~8 MB |
| Catch-up checkpoint fetches | a few MB |
| Realtime messages | ~1 MB |
| Replay afterwards, 1.6 MB per viewer | up to 64 MB if everyone replays |

Call it 15–30 MB realistic, ~140 MB pathological — so 5 GB is well over a hundred sessions. **Classroom traffic is not the risk; development traffic is.** Running the 40-student simulator against the cloud project a few dozen times, or re-fetching files on every hot reload, is how 5 GB actually disappears.

> **Hard rule:** day-to-day development and *every* run of `pnpm simulate` point at the **local** stack (`pnpm dev:local`). Only deliberate integration runs touch the cloud project. This matters more than any other egress decision we make.

### Risks specific to this stack

| Risk | Mitigation |
|---|---|
| **Free-tier Supabase projects pause when idle.** The briefing requires the app to run untouched until Week 18, and markers test after the deadline — a paused project is a dead app | Verify the current inactivity window, then schedule an **external** weekly ping (a GitHub Actions cron hitting a trivial query is enough; an internal `pg_cron` job may not count as activity). Budget for the paid tier through Week 18 if in doubt. **Owner: Andric** |
| Realtime free-tier caps on concurrent connections and monthly messages | Check the caps against the 40-student load test *before* Week 11. If 40 concurrent subscribers does not fit, the fallback is one small Node service owning only the dashboard fan-out — auth, CRUD, RLS and functions stay untouched |
| Anon key is public, so a table without RLS is world-readable | Hard PR rule in [09](./09-integration-contracts.md#4-authorization-layering) + an integration check that every `public` table reports `relrowsecurity = true` |
| Local stack needs Docker on six machines and the markers' | README documents `supabase start`; E2E also runnable against a throwaway cloud test project |
| **WebContainer needs cross-origin isolation** | COOP/COEP headers in `vercel.json`; `credentialless` so CDN assets still load; fonts self-hosted. Dylan spikes the service-worker interaction with the SPA rewrite in Week 8 |
| **WebContainer may not start on Safari** | Grading is Chrome-only (FAQ 5), but feature-detect `crossOriginIsolated` and show "the workspace needs Chrome or Edge" instead of a blank pane |
| **Cold `pnpm install` makes joining or catching up feel broken** | Explicit installing state streamed to the terminal; if the spike measures > ~15 s, build the local dependency cache in [05 §2](./05-core-logic.md#2-files-cache--dependencies) |
| **Load test no longer reflects the real client** | 40 simulated students write status rows; they cannot each boot a WebContainer. The load test proves Supabase and Realtime hold up — it says nothing about 40 laptops each running a dev server. Say so rather than implying otherwise |
| Migrations drift from what is deployed | `supabase db reset` in CI proves migrations apply from scratch; deploy order documented above |

Checklist (owner: Ying Qi; the keep-alive item: Andric):
- [ ] `pnpm build` works on a clean clone with only the two `VITE_` vars
- [ ] Deployed URL loads the landing page at `/`
- [ ] `/join/<code>` and a refresh on `/s/:id/code` work on the deployed URL (SPA rewrite)
- [ ] Realtime connects over `wss://` in production (DevTools → Network → WS)
- [ ] `crossOriginIsolated === true` on the deployed app, and a WebContainer boots there
- [ ] Cold install time measured and recorded in the README
- [ ] Telegram webhook registered against the deployed function, not localhost
- [ ] Seeded demo accounts work on the deployed project
- [ ] Keep-alive scheduled; project will not pause before Week 18
- [ ] Don't redeploy after submission unless the teaching team asks
