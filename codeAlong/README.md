# CodeAlong

**Code along live. Nobody gets left behind.**

CodeAlong is a live-coding classroom. A prof codes, students follow in a browser IDE that runs real Node, and staff can see who's stuck and help them without leaving the page. When class ends, students keep a replay and the prof gets a report on where the class struggled.

IS216 Web Application Development II · Section G2 · Team T4
Andric Ang, Yew Ying Qi, Dylan Shuck, Evan Sim, Karin Tan, Tan Ray Yien

| | |
| --- | --- |
| **Deployed app** | https://code-along-andrics-goons.vercel.app |
| **Video** | https://www.youtube.com/watch?v=t_L6mUZ0DQM |
| **Repository** | https://github.com/andrics-goons/WAD-dos |

## Demo accounts

The password for every seeded account is `pass1234`. These are fake accounts that exist only as seed data.

| Role | Email | Notes |
| --- | --- | --- |
| Prof | `prof@codealong.test` | Owns IS216 G2 |
| Prof (second) | `prof.tan@codealong.test` | Owns a different course, to show profs can't see each other's courses |
| TA | `ta.ana@codealong.test` | TA of IS216 G2. `ta.ben@codealong.test` also works |
| Student | `alex@codealong.test` | Enrolled in IS216 G2. `bea@` and `chen@` also work |
| Student (not enrolled) | `zoe@codealong.test` | Joining with `CART42` auto-enrols her into IS216 G2 |
| Admin | `admin@codealong.test` | Can read everything, including students' code |

- **Live class join code:** `CART42`
- **Course enrol code (IS216 G2):** `WAD2G2`
- New sign-ups can choose Student or Educator.

### Try it in five minutes

Use two browser windows (or one normal and one private window) so you can be the prof and a student at once.

1. **Prof:** sign in as `prof@codealong.test`, open IS216 G2 and open the live class (join code `CART42`) to reach the teach view.
2. **Student:** in the other window, sign in as `alex@codealong.test`, choose **Join a class** and enter `CART42`. Alex lands in the workspace.
3. **Prof:** type a message in **Announce** and send it. Alex sees it as a banner and can close it.
4. **Student:** press **Help**, choose **Ask for help**, describe the problem and send it.
5. **TA:** in a third window, sign in as `ta.ana@codealong.test` and open the help queue. The request is there. Claim it, reply, and Alex sees the reply.
6. **Prof:** end the class. The report builds itself on the report page.

## Features

- **Browser IDE:** students get an editor, terminal and live preview. Their project runs in a StackBlitz WebContainer on their own machine, with nothing to install.
- **Teach and present:** the prof codes live, saves checkpoints and sends announcements. Students can pull a checkpoint to catch up.
- **Live class dashboard:** staff see each student's status, and "Slow down" reaches staff only as a count.
- **Help queue with AI diagnosis:** a student asks for help, and a TA claims the request and sees the changed code with an AI suggestion, including from a phone.
- **End-of-class report:** help requests are grouped to show which steps and errors caused the most trouble.
- **Replay:** students revisit a past class, write their own notes and export to GitHub.
- **Telegram and GitHub:** Telegram sends pings and digests, and lessons can be imported from a GitHub repo.

### Help, Telegram and announcements

**Help (student side).** The **Help** button in the workspace opens two choices: **Check my work** (the TA sees a side-by-side of the student's code against the class's checkpoint, with no message needed) and **Ask for help** (a short description, with an option to ask a TA to come to their seat and a seat number). A student has one active request of each kind, can cancel an open one, and can send up to three follow-ups on a reply. A follow-up goes back into the queue with a fresh snapshot of their code.

**Help (TA side).** The queue updates live. A TA claims a request, reads the thread, replies, or passes the check. If two TAs claim the same request, the second is told "Someone else is already on this one". A follow-up shows a badge saying who last handled it.

**Telegram.**
- **Linking:** open **Profile**, press the Telegram link card, and send the bot the one-time `/start <code>` it shows (the code expires after 10 minutes). The bot is `@TeleHelpbot`. The code is the only thing that ties a Telegram account to a CodeAlong account.
- **In-person pings:** when a student asks for help in person, the course's staff who have linked Telegram get a message with the student's name, seat, checkpoint and a link to the request. If nobody can be pinged, the request still appears in the queue and the student sees "TA notified in app only".
- **Digest:** after a class ends, the prof presses **Send digest** on the report page. Course staff get the summary, and enrolled students who missed the class and linked Telegram get where to start in the replay. It can be sent once per class.
- **Without a bot token:** with `EXTERNAL_APIS=mock` the functions write each message to the `test_outbox` table instead of calling Telegram, which is how the end-to-end tests check them.

**Announcements.** The prof opens **Announce** in the teach view's session bar and sends up to 200 characters. Every student sees it as a banner at the top of the workspace, and a student who joins later sees it too. A blank message cannot be sent. A student can close the banner, and the next announcement shows again. The prof can take the current one down with **Clear announcement**.

### How the AI pipeline works

1. **AI identifies the issue.** `analyze-help` diagnoses each help request into a fixed category.
2. **Our code groups the results.** `groupAnalyses()` in `supabase/functions/summarize-help/summary.ts` groups diagnoses by checkpoint and category and counts them. No AI is involved in this step.
3. **AI writes it up for the prof.** `summarize-help` turns the groups into a headline, explanations and teaching tips. It receives only diagnoses, never names or code, and falls back to rule-based text if the LLM call fails.

## Tech stack

| Layer | Tools |
| --- | --- |
| Frontend | Vue 3, Vite, Vue Router, Pinia, Bootstrap 5, Bootstrap Icons |
| In-browser coding | WebContainer API, CodeMirror 6, xterm.js |
| Backend | Supabase: Postgres with Row Level Security, Auth, Realtime, Edge Functions (Deno + TypeScript), `pg_net` + Vault |
| External APIs | Groq LLM API, Telegram Bot API, GitHub REST API |
| Deployment | Vercel (frontend), Supabase cloud (backend) |
| Testing and quality | Vitest, Playwright, ESLint, oxlint, Prettier |

There is no server of ours. The Vue app talks directly to Supabase, and Row Level Security decides what each user can read or write. Edge Functions handle the jobs that need secrets or elevated rights.

```text
Vue SPA (Vercel) ──► Supabase: Postgres + RLS, Auth, Realtime
       │                       │
       │                       └─ DB triggers (pg_net) ─┐
       └────────────────────────► Edge Functions ◄──────┘
                                       │
                                       └─► Groq, Telegram, GitHub
```

## Setup

### Requirements

- Node `^22.18.0` or `>=24.12.0`
- pnpm (`corepack enable`). This project uses pnpm only.
- Docker, running (needed for the local Supabase stack)
- Chrome or Edge

> **Browser:** the student workspace needs a Chromium browser. WebContainer requires cross-origin isolation and `SharedArrayBuffer`, and Safari may not start it. Other pages work in any browser.

### Run locally

Run every command in the path of this folder.

```sh
pnpm install
pnpm exec supabase start
pnpm exec supabase db reset      # applies every migration, then the seed data
pnpm exec supabase status -o env # prints API_URL and PUBLISHABLE_KEY
```

The app reads its Supabase URL and key from `.env.local` in this folder, using the two values printed above:

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH
```

Then start the app:

```sh
pnpm dev
```

Open http://localhost:5173 and sign in with a demo account.

`pnpm exec supabase start` also serves the Edge Functions with the secrets in `supabase/functions/.env`. The AI help diagnosis and Telegram messages are triggered by the database and are configured on the deployed app only.

`supabase db reset` wipes the local database, so only use it for first-time setup or when you want a fresh start.

### Environment files

Local keys and secrets live in three files, none of which are committed to the repository.

| File | What's in it |
| --- | --- |
| `.env.local` | The local Supabase URL and key for the app |
| `supabase/.env` | The GitHub OAuth app's client ID and secret, for "Continue with GitHub" on the local stack |
| `supabase/functions/.env` | The Groq API key (`LLM_API_KEY`) and `APP_URL`, for the Edge Functions on the local stack |

`pnpm exec supabase start` reads the two `supabase/` files. After changing either one, restart the stack with `pnpm exec supabase stop`, then `pnpm exec supabase start`.

Telegram needs `TELEGRAM_BOT_TOKEN`, which is set on the deployed app only.

### Environment variables

Never commit real values, and never put a secret in a `VITE_` variable, because Vite ships those to the browser.

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | `.env.local`, Vercel | Connects the app to Supabase |
| `APP_URL` | Function secret | Builds links for QR codes, Telegram and replays |
| `LLM_API_KEY`, `LLM_MODEL` (optional) | Function secret | Groq key and model override |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` | Function secret | Telegram bot and webhook check |
| `EXTERNAL_APIS` | Function secret | Set to `mock` to fake external APIs in tests |
| `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` | `supabase/.env` | GitHub sign-in on the local stack (see below) |

Set function secrets with `pnpm exec supabase secrets set NAME=value`. Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` to functions automatically.

### GitHub sign-in (optional)

"Continue with GitHub" and "Connect GitHub" use Supabase Auth's GitHub provider. On the local stack, the OAuth app's client ID and secret are read from `supabase/.env`. Without that file the app still runs, but the GitHub buttons fail. To use your own OAuth app:

1. Create a GitHub OAuth app (GitHub → Settings → Developer settings → OAuth Apps) with the homepage URL `http://localhost:5173` and the callback URL `http://127.0.0.1:54321/auth/v1/callback`.
2. Create `supabase/.env` with the app's client ID and a client secret:

   ```env
   GITHUB_OAUTH_CLIENT_ID=your-client-id
   GITHUB_OAUTH_CLIENT_SECRET=your-client-secret
   ```

3. Restart the stack: `pnpm exec supabase stop`, then `pnpm exec supabase start`.

On the cloud project, the ID and secret go in the Supabase dashboard under Authentication → Sign In / Providers → GitHub, with **Allow manual linking** turned on.

## Tests

### Before you start

Run every command in the path of this folder. Follow [Run locally](#run-locally) first, so the stack is running, the seed data is loaded and `.env.local` exists.

### 1. Unit tests (no Docker needed)

```sh
pnpm exec vitest run --exclude "tests/unit/rls/**"
```

Expected: **25 files, 148 tests passed**, in about 20 seconds.

### 2. Database security (RLS) tests

Needs the local stack running (`pnpm exec supabase start`).

```sh
pnpm exec vitest run tests/unit/rls
```

Expected: all 18 files pass. These sign in as real users of each role against the local database and check that each one can read and write only what it should. For example, a classmate can never read another student's code, and staff only ever see "Slow down" as a count.

### 3. End-to-end tests (Playwright)

`supabase start` serves the Edge Functions with real keys. The end-to-end tests need them in mock mode instead, so run these steps in order:

1. Start the local stack, if it isn't running: `pnpm exec supabase start`.
2. In a **second terminal**, serve the Edge Functions in mock mode, so the tests never call Groq, Telegram or GitHub and no keys are needed. This command keeps running; leave that terminal open:

   ```sh
   pnpm exec supabase functions serve --env-file e2e/functions.env
   ```

3. Back in the first terminal, run the tests:

   ```sh
   pnpm exec playwright install chromium   # first time only
   pnpm test:e2e
   ```

Expected: **6 passed** (Journeys 1 to 5 on desktop, Journey 6 at phone width). Journey 4 installs real npm packages, so it needs the internet and takes the longest.

- Run the desktop project only: `pnpm test:e2e --project=desktop-chrome`. Add a file name such as `journey-3` to run one journey.
- Watch a run step by step: `pnpm test:e2e --project=desktop-chrome --ui`. Open the last report with `pnpm exec playwright show-report`.

### 4. Lint

```sh
pnpm lint
```

### The six end-to-end journeys

| File | What it covers | Edge cases checked |
| --- | --- | --- |
| `journey-1-student-account.spec.js` | One student's account, from signing up to deleting it, including joining a class | Wrong current password when changing it |
| `journey-2-run-a-class.spec.js` | A new prof sets up a course and teaches a whole class to three students, then a student uses the replay, a note, search and the GitHub export | Wrong join code; joining after the class has ended |
| `journey-3-help.spec.js` | Three students get help from two TAs in every way the help bar offers, including in-person pings | A second TA claiming a request that's already taken; nobody to ping on Telegram |
| `journey-4-run-the-code.spec.js` | A student runs the project in the browser, makes a mistake, and the prof sees it on the dashboard | The error reaches the dashboard without the student reporting it |
| `journey-5-manage-a-course.spec.js` | A prof looks after a course between classes: its students, its TAs and which lessons students can see | Wrong enrol code; unknown TA email; a taught lesson can't be deleted |
| `journey-6-phone.spec.js` | A live class at phone width (runs only in the `mobile-chrome` project) | Nothing on the page is wider than a 375 px screen |

Every feature in [Features](#features) is covered by a journey, except GitHub import, which is covered by a unit test (`tests/unit/github-import.test.js`).

### How the tests are kept reliable

- **Repeatable:** each journey makes its own users and classes (`e2e/classroom.js`) and deletes them afterwards, so the demo data is never changed and runs don't affect each other.
- **Stable selectors:** tests find elements by `data-testid` and by visible text, not by CSS classes or page structure.
- **No guessing at timing:** tests wait for real events, like the realtime channel being confirmed before anyone broadcasts, instead of fixed pauses.
- **Clear failures:** setup stops with a plain message if Docker or Supabase isn't running.
- **No real external calls:** in mock mode, Telegram, GitHub and AI calls are written to the `test_outbox` table, and the tests check that table. Edge Function logic is also unit-tested with fake clients.
- **One at a time:** the specs share one database, so they run with `workers: 1`.
- **Several people in one test:** `login()` in `e2e/fixtures.js` signs people in by planting a Supabase session, so one test can drive a prof, TAs and students in separate browsers.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `supabase start` fails, or a command says it cannot connect to Docker | Start Docker Desktop, wait until it is running, then try again |
| The app shows errors after pulling new code | New migrations need applying. `pnpm exec supabase migration up --include-all` keeps your data. `pnpm exec supabase db reset` starts fresh but wipes it |
| Playwright says Local Supabase is not running | Run `pnpm exec supabase start` first |
| Playwright cannot find its browser | Run `pnpm exec playwright install chromium` |
| The workspace stays blank or the preview never loads | Use Chrome or Edge. WebContainer needs cross-origin isolation |
| Journey 3 fails at the Telegram or AI steps | The Edge Functions aren't in mock mode. Run `pnpm exec supabase functions serve --env-file e2e/functions.env` in a second terminal, then run the tests again |
| Many `tests/unit/rls` files fail at once | The local stack isn't running. Run `pnpm exec supabase start`, or run only the unit tests with `--exclude "tests/unit/rls/**"` |
| Tests can't find a seeded account or course | Run `pnpm exec supabase db reset` to reload the demo data |
| Journey 4 times out | It downloads real npm packages. Check your internet connection and run it again |

## Third-party libraries

| Library | Licence | Used for |
| --- | --- | --- |
| Vue, Vue Router, Pinia | MIT | Frontend framework, routing, state |
| Bootstrap, Bootstrap Icons | MIT | Styling, icons |
| CodeMirror 6 | MIT | In-browser editor |
| xterm.js | MIT | Terminal panel |
| StackBlitz WebContainer API | Free for personal, educational and open-source use | Running student projects in the browser |
| `supabase-js` | MIT | Data access, auth, realtime, function calls |
| Supabase platform (Postgres, Auth, Realtime, Edge Runtime) | Apache-2.0 / PostgreSQL | Database, auth, realtime, functions |
| diff (jsdiff) | BSD-3 | Line diffs for the TA review and the replay |
| qrcode | MIT | QR join codes |
| fflate | MIT | Zipping a project for download |
| Inter, JetBrains Mono (`@fontsource`) | OFL | Self-hosted fonts |
| Playwright, Vitest, Supabase CLI | Apache-2.0 / MIT | Testing and local stack |
| Groq API, Telegram Bot API, GitHub REST API | Service terms | AI diagnosis, messages, import and export |

## Deployment

A push to `main` deploys only the frontend. Deploy in this order:

1. **Migrations:** `pnpm exec supabase db push`
2. **Functions:** `pnpm exec supabase functions deploy`
3. **Frontend:** push to `main`

On Vercel, set the Root Directory to `codeAlong` (this folder) and add the two `VITE_` variables. `vercel.json` provides the SPA rewrite and the COOP/COEP headers that WebContainer needs.

## Project structure

```text
src/api/              the only code that calls Supabase
src/stores/           Pinia stores
src/views/            pages
src/components/ui/    shared UI kit
src/router/           routes and guards
shared/               used by both the Vue app and Edge Functions
supabase/migrations/  schema, RLS policies, RPCs, triggers
supabase/functions/   Edge Functions
supabase/seed.sql     demo data
tests/unit/           Vitest, including RLS tests
e2e/                  Playwright
```

Code flows one way: component → Pinia store → `src/api/*.api.js` → Supabase.

## Known limitations

- The student workspace needs a Chromium browser.
- AI diagnosis depends on Groq and its rate limits. The prof's summary falls back to rule-based text if the LLM call fails.
- Free-tier limits: at most 30 AI calls a minute across the whole site and 30 lessons per course, and new data is refused once the database passes 450 MB. Hitting a limit shows a pop-up.
- `lessonTrends()` and the `lesson_trends` RPC exist, but no page uses them yet.
- There is no CI. Tests and migrations are run by hand.

## AI usage

- Andric Ang: Used Claude to help draft and review Postgres migrations and Row Level Security policies, generate seed data, and debug SQL errors. Checked policies with RLS tests against the local Supabase stack.
- Yew Ying Qi: Used Claude to scaffold UI components and core pages, explain Supabase Realtime behaviour, and debug session and checkpoint logic. Tested changes in the running app.
- Dylan Shuck: Used Claude to understand the WebContainer API and debug the editor, terminal and preview integration. Tested the workspace in the browser.
- Evan Sim: Used Claude to learn how to connect the app to the LLM through Supabase Edge Functions, work through the logic for grouping and summarising AI diagnoses on the prof's dashboard, debug errors and review my implementation approach. Also used Claude to help prepare the pitch deck content, and guidance on the presentation.
- Tan Ray Yien: Used Claude to help with the IndexedDB cache, autosave and diff logic, and to debug GitHub import and export. Checked the work with unit tests.
- Karin Tan: Used Claude to help build the help queue and Telegram integration, and to set up and debug Playwright tests. Checked the flows with end-to-end tests using mocked APIs.
