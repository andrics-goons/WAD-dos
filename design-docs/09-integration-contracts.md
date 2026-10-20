# CodeAlong — Integration Contracts (Shared)

This is the **single source of truth** for anything two or more people depend on. If a task card or another doc disagrees with this file, **this file wins**. Changing anything here needs a message in the team channel and a PR reviewed by everyone it affects.

**Architecture in one line:** Vue 3 SPA on Vercel talks directly to Supabase (Postgres + Auth + Realtime), with a handful of Edge Functions for the jobs that need secrets or elevated rights. There is no Express server and no Socket.IO.

---

## 1. Shared Constants & Pure Logic — `shared/`

`shared/` is imported by **both** the Vue app (Vite) and the Edge Functions (Deno). Nothing in it may touch the DOM, `window`, `Deno`, or the network — that is what keeps it unit-testable and reusable in both runtimes.

```
shared/
├── constants.js         ← the enums below
├── todo-parser.js       ← Evan
├── error-normalizer.js  ← Evan
├── tile-state.js        ← Evan (classify(), must agree with Andric's SQL view)
├── diff-summary.js      ← Ray Yien
├── spotlight.js         ← Evan (excerpt + anonymise)
├── build-error.js       ← Dylan (strips the code frame before normalising)
├── report-builder.js    ← Andric
└── join-code.js         ← Ying Qi
```

```js
export const Role = Object.freeze({ PROF: 'prof', TA: 'ta', STUDENT: 'student', ADMIN: 'admin' })
// How each role is named in the UI
export const RoleLabel = Object.freeze({ prof: 'Educator', ta: 'TA', student: 'Student', admin: 'Admin' })
export const SignupRole = Object.freeze({ STUDENT: 'student', EDUCATOR: 'prof' })   // the only two a user may pick
export const CourseRole = Object.freeze({ PROF: 'prof', TA: 'ta' })

export const LessonStatus = Object.freeze({ DRAFT: 'draft', READY: 'ready', ARCHIVED: 'archived' })
export const SessionStatus = Object.freeze({ LIVE: 'live', ENDED: 'ended' })

export const TileState = Object.freeze({
  DONE: 'done', IN_PROGRESS: 'in_progress', ERROR: 'error', BEHIND: 'behind', IDLE: 'idle',
})
export const TileStateOrder = [TileState.ERROR, TileState.BEHIND, TileState.IN_PROGRESS, TileState.IDLE, TileState.DONE] // grid sort

export const SnapshotReason = Object.freeze({ AUTOSAVE: 'autosave', BEFORE_CATCHUP: 'before_catchup', HELP_REQUEST: 'help_request' })

export const HelpType = Object.freeze({ CHECK: 'check', HELP: 'help' })
export const HelpStatus = Object.freeze({
  OPEN: 'open', CLAIMED: 'claimed', PASSED: 'passed', REPLIED: 'replied', RESOLVED: 'resolved', CANCELLED: 'cancelled',
})

export const NoteKind = Object.freeze({ NOTE: 'note', BOOKMARK: 'bookmark' })

export const Limits = Object.freeze({
  MAX_FILES: 40,                 // a bare Vite scaffold is already ~10 files
  MAX_SNAPSHOT_BYTES: 200_000,   // unchanged — this is what protects the 5 GB egress budget
  // Never synced to Postgres: dependency and build output live only in WebContainer
  SYNC_IGNORE: ['node_modules/**', 'dist/**', '.vite/**', '.cache/**', 'pnpm-lock.yaml', '*.log'],
  BOOT_TIMEOUT_MS: 30_000,       // no server-ready → "your project didn't start"
  INSTALL_TIMEOUT_MS: 120_000,   // still streaming, but show a "still installing" state
  JOIN_CODE_LENGTH: 6,
  JOIN_CODE_ALPHABET: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789',
  HEARTBEAT_MS: 30_000,
  IDLE_AFTER_SEC_DEFAULT: 180,
  SUMMARY_THROTTLE_MS: 1_000,
  STATUS_WRITE_THROTTLE_MS: 2_000,
  AUTOSAVE_DEBOUNCE_MS: 5_000,   // fires 5 s after the last keystroke
  AUTOSAVE_FLUSH_ON_HIDE: true,  // plus an immediate flush on blur / visibilitychange / unload
  RUN_DEBOUNCE_MS: 1_500,
  RUN_TIMEOUT_MS: 5_000,
  ERROR_MESSAGE_MAX: 300,
  ERROR_GROUP_MIN: 2,
  MAX_FOLLOW_UPS: 3,             // per help request; past this the TA should walk over
  FOLLOW_UP_MAX_CHARS: 300,
  ANNOUNCE_MAX_CHARS: 200,
})

// Realtime broadcast event names (channel `session:<id>`)
export const RtEvent = Object.freeze({
  CHECKPOINT_NEW: 'checkpoint:new',
  SESSION_SETTINGS: 'session:settings',
  SESSION_ENDED: 'session:ended',
  SPOTLIGHT_SHOW: 'spotlight:show',
  SPOTLIGHT_HIDE: 'spotlight:hide',
  ANNOUNCE: 'session:announce',     // text null = cleared
})

// Edge Function names (supabase.functions.invoke)
export const Fn = Object.freeze({
  GITHUB_IMPORT: 'github-import',
  GITHUB_EXPORT: 'github-export',
  SPOTLIGHT: 'spotlight',
  HINT: 'hint',
  DIGEST: 'digest',
})
```

---

## 2. Auth

### Supabase Auth, not our own JWT

- Email + password through `supabase.auth.signUp()` / `signInWithPassword()`. **We never hash passwords ourselves** — no bcrypt, no `jsonwebtoken`, no `ca_token` cookie.
- `supabase-js` stores the session in `localStorage` and refreshes it automatically. The same session authenticates Postgres queries, Realtime subscriptions and Edge Function calls — nothing extra to wire up.
- At sign-up the user chooses **Student** or **Educator**, sent as `options: { data: { name, role } }`. A trigger on `auth.users` inserts the matching `profiles` row, passing the role through an **allow-list**, because sign-up metadata comes straight from the browser:

```sql
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'Student'),
    case new.raw_user_meta_data->>'role'
      when 'prof' then 'prof'      -- "Educator" in the UI
      else 'student'               -- anything else: missing, 'ta', 'admin', junk
    end
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();
```

### Who am I, in the client

```js
// src/stores/auth.js
const { data: { user } } = await supabase.auth.getUser()
const { data: profile } = await supabase.from('profiles').select('id, name, role').eq('id', user.id).single()
```

`authStore.user = { id, name, role }`. The router guard in [04](./04-pages-routes-and-events.md#route-guards) reads `role` from the profile. A missing or expired session sends the user to `/login?returnTo=…`. The store also listens to `supabase.auth.onAuthStateChange` (supabase-js syncs it across tabs): `SIGNED_OUT` from elsewhere clears the store and leaves any page that needs a login. The handler runs on the next tick, because awaiting another supabase call inside that callback can deadlock.

### Who am I, inside Postgres

`auth.uid()` is the signed-in user's id in every policy and RPC. Role and membership come from these **`security definer`** helpers (definer is required — a policy on `course_staff` that itself queries `course_staff` would otherwise recurse):

```sql
-- NOT named current_role: without a `public.` prefix that is a built-in Postgres keyword
-- returning the *database* role, so a forgotten prefix would silently compare the wrong thing.
create function public.app_role() returns text
language sql security definer stable set search_path = '' as $$
  select role from public.profiles where id = auth.uid()
$$;

create function public.is_admin() returns boolean
language sql security definer stable set search_path = '' as $$
  select coalesce(public.app_role() = 'admin', false)   -- never true for a logged-out caller
$$;

create function public.is_course_staff(cid uuid) returns boolean
language sql security definer stable set search_path = '' as $$
  select exists (select 1 from public.course_staff where course_id = cid and user_id = auth.uid())
$$;

create function public.is_course_prof(cid uuid) returns boolean
language sql security definer stable set search_path = '' as $$
  select exists (select 1 from public.course_staff
                 where course_id = cid and user_id = auth.uid() and role = 'prof')
$$;

create function public.is_enrolled(cid uuid) returns boolean
language sql security definer stable set search_path = '' as $$
  select exists (select 1 from public.course_students where course_id = cid and user_id = auth.uid())
$$;

create function public.is_course_member(cid uuid) returns boolean
language sql security definer stable set search_path = '' as $$
  select public.is_course_staff(cid) or public.is_enrolled(cid)
$$;
```

> **Account bootstrap.** Users pick **Student** or **Educator** (`prof`) at sign-up; the trigger's allow-list makes those the only two outcomes. After that, `profiles.role` is **not** self-updatable (see the policy in [03](./03-data-model.md#profiles)) — a mis-pick is fixed by an admin. `ta` is granted per course through `rpc('add_course_staff')`. `admin` comes only from `supabase/seed.sql`, one SQL statement on the cloud project, or another admin via `rpc('admin_set_role')`.
>
> **Never read the role from auth metadata or the JWT in a policy.** A user can rewrite their own auth metadata at any time (`auth.updateUser({ data })`). The trigger is safe only because it reads that metadata once, at sign-up; every policy reads `profiles` through `app_role()` / `is_admin()`.

### Realtime authorization

Private Broadcast channels are authorized by RLS on `realtime.messages`, so a student cannot subscribe to another course's session channel:

```sql
-- true only for exactly 'session:<uuid>' where the caller is a member; a malformed
-- topic is false rather than a uuid cast error
create function public.is_session_channel_member(topic text) returns boolean ...

create policy "members read session channel" on realtime.messages
    for select to authenticated
    using (public.is_session_channel_member(realtime.topic()) or public.is_admin());

create policy "members track presence" on realtime.messages
    for insert to authenticated
    with check (extension = 'presence' and public.is_session_channel_member(realtime.topic()));
```

Only Edge Functions and `security definer` RPCs **broadcast** on these channels; clients subscribe. Tracking presence is a write, though, so members may insert presence messages and nothing else. Admins can listen but not track presence, so they never inflate the attendance count.

Clients must subscribe with `{ config: { private: true } }`, or the channel is public and none of this applies.

---

## 3. Response & Error Envelope

`supabase-js` already returns `{ data, error }`, which is the envelope we wanted anyway. Every call goes through one mapper so stores and forms handle failures identically.

```js
// src/api/mapError.js
const BY_CODE = {
  '23505': { code: 'CONFLICT',   status: 409 },  // unique violation
  '23503': { code: 'NOT_FOUND',  status: 404 },  // FK violation
  '42501': { code: 'FORBIDDEN',  status: 403 },  // RLS refused the write
  'PGRST116': { code: 'NOT_FOUND', status: 404 }, // .single() matched no row
}

export function mapError(error) {
  if (!error) return null
  // Domain errors raised by our RPCs:  raise exception using errcode='P0001', message='CONFLICT|…'
  const [code, message] = String(error.message).split('|')
  if (error.code === 'P0001' && message) return { code, message, status: STATUS[code] ?? 400 }
  const known = BY_CODE[error.code]
  return known ? { ...known, message: error.message } : { code: 'INTERNAL', status: 500, message: 'Something went wrong' }
}
```

**RPCs raise domain failures as `CODE|user-facing message`:**

```sql
raise exception 'CONFLICT|That request has already been claimed' using errcode = 'P0001';
```

| `code` | When the user sees it |
|---|---|
| `VALIDATION_FAILED` | zod failed client-side; `fields` shown under each input (never reaches Postgres) |
| `BAD_REQUEST` | Valid shape, invalid action (e.g. Pass on a `help` request) |
| `UNAUTHENTICATED` | No/expired session → redirect to `/login?returnTo=…` |
| `FORBIDDEN` | RLS refused, or an RPC rejected the caller |
| `NOT_FOUND` | No row matched — **including rows RLS hid**, which is the point |
| `CONFLICT` | Already claimed, session ended, duplicate active request, lesson already taught |
| `PAYLOAD_TOO_LARGE` | Files over `MAX_SNAPSHOT_BYTES` (check constraint, or client pre-check) |
| `UPSTREAM_UNAVAILABLE` | An Edge Function could not reach Telegram/GitHub/LLM |
| `INTERNAL` | Anything else |

> **Validation moved to the client.** With no Express layer there is no `validate(schema)` middleware. zod schemas live in `src/validators/` and run **before** the write, so forms still get per-field messages. Postgres `check` constraints and RPC guards are the backstop that makes the rule true even if someone bypasses the UI — so every rule exists in both places, and the constraint is the one the tests assert.

---

## 4. Authorization Layering

Three layers, in this order:

1. **Router guard** (`meta.auth`, `meta.roles`) — UX only. It stops a student *navigating* to `/s/:id/teach`. It is not security.
2. **RLS policies** — the real boundary. Every table has `enable row level security` and one policy per command. A query for rows you may not see returns **zero rows**, not an error.
3. **`security definer` RPCs / Edge Functions** — for anything a client cannot be trusted to do in steps: matching an enrol code, allocating a checkpoint `seq`, claiming a help request, building an anonymised excerpt.

| Check | Helper |
|---|---|
| Prof-only course actions | `is_course_prof(course_id)`, or `courses.owner_id = auth.uid()` for edit/delete/add-staff |
| Staff actions | `is_course_staff(course_id)` |
| Student actions | `is_enrolled(course_id)` |
| Viewer actions (replay, library) | `is_course_member(course_id)` |
| Admin: read anything | `is_admin()` — **one extra `select` policy per table**, never folded into the helpers above |
| Admin: manage users | `is_admin()` inside `admin_list_users` and `admin_set_role` |

**Why admin isn't folded into `is_course_staff()`:** those helpers also guard *writes* (claiming help requests, saving checkpoints). Making them return true for admins would quietly give admins every staff write too. Keeping admin as a separate, `select`-only policy makes "admins read everything, write only accounts" true by construction — and the schema sweep test checks that no admin policy exists for any command but `select`.

**Rule for every PR that adds a table:** policies land in the same migration, and the PR includes a negative test (`tests/unit/rls/*.test.js`) proving the wrong user gets zero rows. A table without RLS enabled is a security bug, because the anon key ships in the Vue bundle.

---

## 5. Privacy Contract (our unique feature — every PR is checked against this)

This is the section the architecture change affects most. Previously three of these rules were enforced by *absence* ("there is no endpoint that returns another student's autosave"). The browser now queries Postgres directly, so **absence is no longer a mechanism** — each rule is a policy, a view, or a column that does not exist.

> **Scope: these rules protect students from course staff and from each other. Admins are excluded by design.** An admin is a platform operator who can read every table, including students' code and who tapped "I'm lost". So every claim below is about *staff and students*, and must be stated that way in the slides and Q&A — "the prof can't see your code unless you send it", never "nobody can". Admin actions are not logged. Keep the number of admin accounts to the minimum the demo needs.

| Rule | Enforced by | Test |
|---|---|---|
| Staff never read a student's autosave or `before_catchup` snapshot | `snapshots` SELECT policy: own rows, **or** a row referenced by a `help_requests` the staff can see | T-PRIV-02 |
| A student's code reaches staff **only** via a help request they sent, or an anonymised Spotlight excerpt | Same policy + `spotlight` Edge Function | T-PRIV-03 |
| Dashboard data contains no code | `student_status` has **no** `files` column, and `session_tiles` selects none | T-PRIV-01 |
| "I'm lost" is only ever a count **to staff** | The flag is a row in `lost_flags`, readable only by its owner (and admins) — not a column of `student_status`, which staff read and receive over Postgres Changes. Staff read `session_summary`, which exposes `lost_count` and no ids | T-PRIV-04 |
| A student cannot forge their tile state | There is **no** `state` column. `session_tiles` derives it in SQL from `done_step_order`, `error`, `last_seen_at` | T-STAT-09 |
| Notes are private to the author (admins excepted) | `notes` policies keyed on `user_id = auth.uid()` | T-PRIV-05 |
| **Admins read, but write only accounts** | One `admin reads all` `select` policy per table; no admin policy for any other command; admin writes only through the admin functions | T-ADM-* |
| Reports contain counts only | `session_reports` built by the `end-session` function from aggregates; no `student_id` anywhere in the row | T-INS-05 |
| No keystroke logging | Client writes `student_status` only on change + a 30 s heartbeat | Code review |
| **A build error's code frame never leaves the browser** | `parseBuildError()` in `shared/build-error.js` keeps only `{ name, message, file, line }` and drops every code-frame line *before* `normalizeError()` runs. Truncating to `ERROR_MESSAGE_MAX` is not sufficient — 300 chars of a code frame is still code | T-PRIV-09 |
| Terminal output is never transmitted | `pnpm install` / dev-server output renders locally only; nothing writes it to Postgres | Code review |

---

## 6. Realtime Contracts

Three mechanisms, each for one job. Channel name is always `session:<sessionId>`.

### a) Broadcast — prof actions that must arrive instantly

Sent from `security definer` RPCs and Edge Functions via `realtime.send()`; clients only subscribe.

```js
'checkpoint:new'   { sessionId, seq, stepId, stepOrder, title, createdAt }
'session:settings' { sessionId, allowCatchUp, hintsEnabled }
'session:ended'    { sessionId, replayUrl }
'spotlight:show'   { sessionId, errorPreview, excerpt: { path, startLine, code }, fix: { path, startLine, code } }
'spotlight:hide'   { sessionId }
'session:announce' { sessionId, text, at }      // text: null means the prof cleared it
```

Announcements are also written to `sessions.announcement`, so a student who joins or reconnects after it was sent still sees it on bootstrap — a broadcast alone only reaches whoever was subscribed at that moment.

### b) Postgres Changes — rows that staff or a student watch

RLS applies to the subscription, so a student receives only their own rows.

| Subscription | Who | Replaces |
|---|---|---|
| `student_status` where `session_id = eq.<id>` | Staff → re-render that tile | `dashboard:tile` |
| `help_requests` where `session_id = eq.<id>` | Staff → queue card appears/updates | `help:new`, `help:updated` |
| `help_requests` where `student_id = eq.<me>` | The student → sees the reply or tick, and can follow up | `help:updated` to `user:<id>` |

**Tiles are read from the `session_tiles` view, not the raw table.** A change event tells the staff client *which* `student_id` moved; the client re-reads that row from the view (or recomputes with `shared/tile-state.js`) so the derived state always matches the SQL.

The old `dashboard:summary` event is gone: counts, `lost_count` and error groups are a Vue `computed` over the tile list, throttled client-side to `Limits.SUMMARY_THROTTLE_MS`.

### c) Presence — attendance and "who is in the room"

Each student tracks `{ userId, name }` on join. Staff read presence for the attendance count; `joined_at` is still written to `student_status` so the report survives after everyone disconnects. Presence is **not** used for idle — idle is `now() - last_seen_at > idle_after_sec`, computed in the view.

### Connection lifecycle

```
supabase-js connects with the session JWT → RLS applies to subscriptions
subscribe('session:<id>')  → broadcast + postgres_changes + presence
token refresh              → supabase.realtime.setAuth() (handled by supabase-js)
disconnect                 → status unchanged; the view reports `idle` once last_seen_at ages out
reconnect (automatic)      → re-subscribe, re-read latest checkpoint + own status
```

---

## 7. Cross-Owner Signatures

| Function | Owner | Called by | Signature |
|---|---|---|---|
| `rpc('create_course')` | Andric | Courses page | `(p_code text, p_title text, p_term text, p_section text) → course row` — prof only; generates the enrol code; adds the caller to `course_staff` as `prof` |
| `rpc('enrol_with_code')` | Andric | Enrol page | `(p_code text) → course row` — students and TAs; `NOT_FOUND` for a wrong or archived code |
| `rpc('admin_list_users')` | Andric | Admin page | `() → [{ id, email, name, role, created_at }]` — `FORBIDDEN` unless admin |
| `rpc('admin_set_role')` | Andric | Admin page | `(p_user_id uuid, p_role text) → [{ id, name, role }]` — refuses the caller's own role |
| `rpc('add_course_staff')` | Andric | Course people page | `(p_course_id uuid, p_email text) → staff row` — owner only; `CONFLICT` if already staff or enrolled as a student |
| `rpc('remove_course_student')` | Andric | Course people page | `(p_course_id uuid, p_user_id uuid) → void` — owner only |
| `rpc('start_session')` | Ying Qi | Teach view | `(p_lesson_id uuid) → { session, join_code }` |
| `rpc('join_session')` | Ying Qi | Join view | `(p_join_code text) → { session_id, role }` |
| `rpc('save_checkpoint')` | Ying Qi | Teach view | `(p_session_id uuid, p_step_id uuid, p_files jsonb, p_note text) → checkpoint row` |
| `rpc('end_session')` | Ying Qi | Teach view | `(p_session_id uuid) → session row` |
| `rpc('announce')` | Karin | Teach view (Karin's `AnnounceInput`, embedded by Evan) | `(p_session_id uuid, p_text text \| null) → session row` — sets `sessions.announcement` and broadcasts `session:announce`; `null` clears |
| `rpc('catch_up')` | Ray Yien | Workspace store | `(p_session_id uuid, p_files jsonb) → { checkpoint, attempt_snapshot_id }` |
| `rpc('autosave_patch')` | Ray Yien | `src/cache/autosave.js` | `(p_session_id uuid, p_upsert jsonb, p_delete text[]) → { files_hash }` — merges changed files into the autosave row; see [05 §2](./05-core-logic.md#2-files-cache--dependencies) |
| `rpc('claim_help_request')` | Karin | Help queue | `(p_request_id uuid) → request row` (raises `CONFLICT\|…` if taken) |
| `rpc('transition_help_request')` | Karin | Help review | `(p_request_id uuid, p_to text, p_reply text) → request row` — a reply is **appended to `thread`**, never overwritten |
| `rpc('follow_up_help_request')` | Karin | Student help panel | `(p_request_id uuid, p_message text, p_files jsonb) → request row` — `replied → open`, fresh snapshot, max `MAX_FOLLOW_UPS` |
| `rpc('replace_steps')` | Andric (written with the lessons schema; Evan calls it) | Lesson editor | `(p_lesson_id uuid, p_steps jsonb) → steps[]` — renumbers 1…n by list position, ignoring any `order` sent; refuses blank titles and other lessons' step ids |
| `rpc('delete_step')` | Andric (with the lessons schema) | Lesson editor | `(p_step_id uuid) → void` — deletes and renumbers |
| `view session_tiles` | Andric | Evan (dashboard) | `(session_id, student_id, name, state, target_order, step_order, error_source, error_key, error_preview, passed_steps, checks, last_seen_at)` — `error_source` is `'runtime'` or `'build'`, so the dashboard can label a group "won't compile" vs "throws". `passed_steps` is `int[]` of step orders whose `check` was passed, and comes last in the actual column order |
| `view session_summary` | Andric | Evan (summary bar) | `(session_id, total, done, in_progress, error, behind, idle, lost_count)` — `lost_count` is `null` for anyone but staff and admins |
| `normalizeError` | Evan | Dylan (before writing status) | `({ name, message }) => { key, shapeKey }` |
| `parseBuildError` | Dylan | Dylan (dev-server output) | `(stdout: string) => { name, message, file, line } \| null` — **drops the code frame**; run before `normalizeError` |
| `container.mount(files)` / `boot()` | Dylan | Evan (teach preview), Ray Yien (replay preview) | The one WebContainer runtime; nobody builds a second |
| `loadFiles(kind, id, hash)` | Ray Yien | Dylan (workspace boot) | `→ files` — IndexedDB first, Supabase only on a hash miss |
| `autosave(tree)` | Ray Yien | Dylan (editor changes) | Debounced 5 s; sends only changed files |
| `catchUp(sessionId, files)` | Ray Yien | Dylan (Load checkpoint) | `→ { checkpoint, attemptSnapshotId, depsChanged }` — Dylan reinstalls when `depsChanged` |
| `groupErrors` | Evan | Evan (client summary) | `(tiles, { min, presentCount }) => errorGroups[]` |
| `classify` | Evan | Evan (dashboard re-derive) — must agree with Andric's `session_tiles` | `({ doneStepOrder, error, lastSeenAt, targetOrder, now, idleAfterMs }) => TileState` |
| `parseTodos` | Evan | Ray Yien (`github-import`), Andric (seed) | `(files, entryFile) => steps[]` |
| `diffSummary` | Ray Yien | Dylan, Karin | `(beforeFiles, afterFiles) => { files: [{ path, added, removed, firstDiffLine, hunks }] }` |
| `<DiffView>` | Ray Yien | Dylan, Karin | props `before`, `after`, `mode` |
| `fn('github-import')` | Ray Yien | Lesson new view | `{ repoUrl } → { files, entryFile, source }` |
| `fn('github-export')` | Ray Yien | Replay view | `{ sessionId, repoName, private } → { repoUrl }` |
| `fn('spotlight')` | Evan | Teach view | `{ sessionId, errorKey, helpRequestId? } → { excerpt, fix, errorPreview }` |
| `fn('digest')` | Andric (content) / Karin (send) | Report view (Evan) | `{ sessionId, audience: ['tas','absent'] } → { sent, failed }` |
| `buildReport` | Andric | `end-session` function, seed | `(rows) => sessionReport` |

---

## 8. Naming & Access Rules

- **Postgres is `snake_case`; JavaScript is `camelCase`.** Conversion happens once, in `src/api/*.api.js`. Stores and components only ever see camelCase.
- Ids are `uuid` (`gen_random_uuid()`), except `profiles.id` which **is** `auth.users.id`. There are no ObjectIds, so the old `validateObjectId` middleware is gone — a malformed uuid is a `22P02` error mapped to `NOT_FOUND`.
- `files` is `jsonb`: `[{ path, language, content }]`, same shape as before.
- **No `supabase` import inside a component.** Components → Pinia store → `src/api/*.api.js` → `supabase`. This is what keeps queries reviewable in one place.
- One `api` module per domain, mirroring the old route files: `auth`, `courses`, `lessons`, `sessions`, `checkpoints`, `workspace`, `dashboard`, `help`, `replays`, `notes`, `reports`.

---

## 9. `data-testid` Convention

Unchanged from the Mongo design — tests must not care which backend is underneath. Format: `<area>-<element>[-<id>]`, kebab-case.

| Area | Examples |
|---|---|
| Navigation | `nav-courses`, `nav-replays`, `nav-profile`, `nav-connection-pill` |
| Courses | `course-card-<code>`, `btn-new-course`, `btn-enrol-course`, `input-enrol-code`, `btn-enrol`, `enrol-link`, `btn-copy-enrol-link`, `enrol-qr` |
| Lessons | `lesson-row-<slug>`, `lesson-start-<slug>`, `step-item-<order>`, `btn-step-up-<order>` |
| Session | `join-code`, `join-qr`, `input-join-code`, `btn-save-checkpoint`, `btn-end-session`, `toast-checkpoint`, `input-announce`, `btn-announce`, `btn-clear-announce`, `announcement-banner` |
| Workspace | `editor`, `file-tab-<path>`, `preview-frame`, `console-entry`, `status-pill`, `btn-done`, `btn-lost`, `btn-help`, `btn-load-checkpoint`, `what-you-missed`, `workspace-step-current`, `tab-code`, `tab-preview`, `tab-console`, `tab-steps` |
| Dashboard | `tile-<studentId>` (with `data-state="<TileState>"`), `summary-<state>`, `lost-count`, `error-group-<index>`, `btn-spotlight-<index>`, `spotlight-panel` |
| Help | `help-card-<requestId>`, `btn-claim`, `btn-pass`, `btn-reply`, `input-reply`, `help-status`, `help-thread`, `btn-follow-up`, `input-follow-up`, `badge-follow-up` |
| Replay | `timeline-step-<seq>`, `diff-view`, `btn-add-note`, `note-item`, `input-search`, `btn-export-github` |
| Reports | `report-funnel`, `report-top-errors`, `btn-send-digest` |
| Auth | `input-name`, `input-email`, `input-password`, `radio-role-student`, `radio-role-educator`, `btn-register`, `btn-login`, `link-register`, `link-login` |
| Profile | `input-profile-name`, `btn-save-name`, `input-current-password`, `input-new-password`, `btn-change-password`, `btn-logout` |
| Admin | `admin-user-row-<userId>`, `select-role-<userId>`, `input-user-search` |

---

## 10. Environment & Ports

| Where | Variable | Notes |
|---|---|---|
| Vercel (build) | `VITE_SUPABASE_URL` | Public by design |
| Vercel (build) | `VITE_SUPABASE_ANON_KEY` | **Public — baked into the bundle. RLS is the only thing protecting the data.** |
| Supabase secrets | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` | `supabase secrets set` — never in Vercel |
| Supabase secrets | `GITHUB_TOKEN`, `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` | Server-side imports + replay export |
| Supabase secrets | `LLM_API_KEY` | Optional; hints fall back to the rule table when empty |
| Supabase secrets | `APP_URL` | Used in QR codes, Telegram links, replay links |
| Supabase (auto) | `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` | Injected into Edge Functions; **never** sent to the client |
| Function env | `EXTERNAL_APIS` | `live` \| `mock` — `mock` writes to `test_outbox` instead of calling out |
| Local dev | Vite `5173`, Supabase API `54321`, Postgres `54322`, Studio `54323` | `supabase start` |

Full list in [02-tech-stack.md](./02-tech-stack.md#environment-variables).

---

## 11. Definition of Done (every PR)

- [ ] Follows the pattern in [08-workload-split.md](./08-workload-split.md#non-negotiable-implementation-pattern)
- [ ] **Any new table ships with RLS enabled, a policy per command, and a negative test**
- [ ] Privacy contract (§5) respected
- [ ] Uses constants from `shared/constants.js`
- [ ] zod validation client-side **and** a `check` constraint or RPC guard behind it
- [ ] Validation + loading + empty + error states in the UI
- [ ] Works at 375 px and 1280 px (screenshots in the PR)
- [ ] `data-testid` on interactive elements
- [ ] Tests added and passing against `supabase start`; CI green
- [ ] Migration is additive and re-runnable from scratch (`supabase db reset` passes)
- [ ] Third-party snippets credited in a code comment

---

## Integration Checklist (before Week 12 sign-off)

- [ ] Landing page loads at `/` on the deployed Vercel URL
- [ ] **Deep links work on the deployed URL** — `/join/<code>` from the QR, and a refresh on `/s/:id/code` (needs the `vercel.json` rewrite)
- [ ] Register → enrol → join a live session works end to end
- [ ] Prof imports/uploads a lesson, edits steps, starts a session
- [ ] Checkpoint broadcast reaches every student; reconnect recovers missed checkpoints
- [ ] Runtime error turns a tile red with the right file/line; Done turns it green
- [ ] Idle and behind states appear at the right times (derived in `session_tiles`)
- [ ] "I'm lost" count correct and anonymous
- [ ] Load checkpoint keeps the attempt; "What you missed" points at the right line
- [ ] Check my work → pass/reply; Ask for help → Telegram ping → resolve
- [ ] A replied request can be followed up (same request, original queue place, fresh code), up to 3 times
- [ ] Prof announcement reaches every student, and a late joiner still sees it
- [ ] Error groups merge the same mistake; Spotlight is anonymised
- [ ] Ending a session shows the replay link; replay, notes, search work
- [ ] GitHub export creates one commit per checkpoint
- [ ] Insights report + digest correct (counts only)
- [ ] **No RLS policy missing:** every table in `public` reports `relrowsecurity = true`
- [ ] Every table has exactly one `admin reads all` `select` policy, and no admin policy for any other command
- [ ] Signing up as Educator gives `prof`; signing up with any other role value gives `student`
- [ ] An admin can change another user's role, but not their own
- [ ] Negative RLS tests pass (student cannot read another student's snapshot/status/notes)
- [ ] Every page usable 375 → 1440 px, portrait and landscape, in Chrome
- [ ] Load test: 40 simulated students within latency target, inside the Realtime free-tier cap
- [ ] `supabase db reset` repeatable; `pnpm test:e2e` green from a fresh clone
- [ ] **Keep-alive scheduled** so the free-tier Supabase project does not pause before Week 18
