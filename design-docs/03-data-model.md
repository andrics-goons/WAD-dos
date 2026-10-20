# CodeAlong — Data Model & Authorization (Supabase / Postgres)

## Entity Overview

Fifteen tables in Supabase Postgres (plus a test-only outbox), joined by `uuid` foreign keys. Owner of the schema — tables, constraints, indexes, triggers, RLS policies and the derived views: **Andric**. Feature owners write their own RPCs in their own new migrations, and Andric reviews every migration PR, so the schema stays consistent.

```
                  auth.users (Supabase Auth)
                        │ 1:1 trigger
                  ┌─────▼─────┐
                  │  profiles │◄──────────────────────────────────────┐
                  └─────┬─────┘                                       │
        owner_id        │        course_staff / course_students        │
                  ┌─────▼─────┐   1:N   ┌─────────┐   1:N   ┌────────┐│
                  │  courses  │────────▶│ lessons │────────▶│sessions││
                  └───────────┘         └────┬────┘         └───┬────┘│
                                             │ 1:N              │     │
                                        ┌────▼────┐             │     │
                                        │  steps  │◄────────────┤     │
                                        └─────────┘             │     │
        ┌──────────────┬──────────────┬───────────────┬─────────┴──┬──┴──────────┐
        ▼              ▼              ▼               ▼            ▼             ▼
┌─────────────┐ ┌──────────────┐ ┌───────────┐ ┌──────────────┐ ┌───────┐ ┌───────────────┐
│ checkpoints │ │student_status│ │ snapshots │ │ help_requests│ │ notes │ │session_reports│
│  seq, files │ │ 1 per student│ │ attempts  │ │ → snapshot_id│ │per user│ │ 1 per session │
└─────────────┘ └──────┬───────┘ └───────────┘ └──────────────┘ └───────┘ └───────────────┘
                       │ 1:N
                ┌──────▼───────┐        VIEWS (no storage)
                │status_history│        session_tiles    ← derives tile state
                └──────────────┘        session_summary  ← counts + lost_count only
```

**How a course is organised.** Every course belongs to the one prof who created it (`courses.owner_id`) and is invisible to anyone who isn't in it. Inside it:

```
Course  (one prof, their TAs, their enrolled students)
 ├── Lessons    the reusable plans: starter files + ordered steps
 └── Sessions   every live class the prof has started in this course — each one a run of a lesson
       └── checkpoints, statuses, snapshots, help requests, notes, report
```

A session points at **both** its lesson (what was taught) and its course (`sessions.course_id`), so the course page can list every session started in it, live and past, without going through lessons. Lessons sit in between so the same plan can be taught again — next week to another section, or next term — and the runs compared in the insights report.

**Changes from the MongoDB design** (read this before you port anything):

| Was | Now | Why |
|---|---|---|
| `Course.staff[]`, `Course.students[]` embedded arrays | `course_staff`, `course_students` tables | Policies and joins need real rows; `$addToSet` has no SQL equivalent worth emulating |
| `Lesson.steps[]` sub-documents | `steps` table | `checkpoints`, `student_status`, `help_requests`, `notes` all reference a step by id — that needs a FK target |
| `StudentStatus.state` (written by the server) | **gone** — derived in `session_tiles` | A client can write its own status row, so a stored `state` would be forgeable. No column, nothing to forge |
| `StudentStatus.stateHistory[]` capped at 200 | `status_history` table | Append-only rows; the funnel reads them with SQL instead of unwinding an array |
| `files` as a sub-document array | `jsonb` | Same `[{ path, language, content }]` shape; validated by a `check` constraint |
| `User.passwordHash` | **gone** | Supabase Auth owns credentials; `profiles` holds only app data |
| `Lesson.mockApi` | **gone** | Students get a real Node server in WebContainer, so lessons ship their own endpoint instead of us faking one |
| — | `files_hash` generated columns | A few bytes the client can check before deciding to download 200 KB — this is what makes the IndexedDB cache cheap |
| ObjectId | `uuid` | `gen_random_uuid()`; `profiles.id` **is** `auth.users.id` |

---

## Shared Shape: `files` (jsonb)

Used in `lessons.files`, `checkpoints.files`, `snapshots.files`.

```json
[{ "path": "js/app.js", "language": "js", "content": "…" }]
```

| Key | Rules |
|---|---|
| `path` | required, max 120, matches `^[A-Za-z0-9_\-./]+$`, relative (no leading `/`), no `..`, **unique within the list** |
| `language` | one of `html`, `css`, `js`, `vue`, `json`, `md` — `vue` is new: lessons are now SFC projects, and it selects the CodeMirror mode |
| `content` | required, must be a string (may be empty) |

**Why 40 and not 20.** A bare Vite + Vue scaffold is already ~10 files before the student writes anything, and Mini Cart ships ~12. The old limit of 20 was sized for three hand-written files. The **byte** cap stays at 200 KB, because source files are a few KB each and that cap is what protects the egress budget — see [02](./02-tech-stack.md#the-egress-rule-free-tier-5-gbmonth).

**What is never in `files`.** The working tree in WebContainer also holds `node_modules/`, `dist/`, `.vite/` and the lockfile. `Limits.SYNC_IGNORE` excludes them from every write, so dependency bytes never reach Postgres. Autosave is an allowlist walk, not a tree walk.

Enforced by two helpers plus a size cap, created by the **lessons migration** and reused by checkpoints and snapshots:

```sql
create function public.files_valid(f jsonb) returns boolean
language sql immutable set search_path = '' as $$
    select case
        when f is null or jsonb_typeof(f) <> 'array' then false
        when jsonb_array_length(f) not between 1 and 40 then false      -- Limits.MAX_FILES
        else not exists (
                select 1 from jsonb_array_elements(f) e
                where jsonb_typeof(e) <> 'object'
                   or e->>'path' is null
                   or length(e->>'path') > 120
                   or e->>'path' !~ '^[A-Za-z0-9_\-./]+$'
                   or e->>'path' like '%..%'          -- no climbing out of the project
                   or e->>'path' like '/%'            -- relative paths only
                   or e->>'language' is null
                   or e->>'language' not in ('html', 'css', 'js', 'vue', 'json', 'md')
                   or jsonb_typeof(e->'content') is distinct from 'string'
             )
             and (select count(distinct e->>'path') from jsonb_array_elements(f) e)
                 = jsonb_array_length(f)              -- no two files with the same path
    end
$$;

-- Does the list contain this path? Used to check that entry_file points at a real file.
create function public.files_include(f jsonb, p text) returns boolean
language sql immutable set search_path = '' as $$
    select case
        when f is null or jsonb_typeof(f) <> 'array' then false
        else exists (select 1 from jsonb_array_elements(f) e where e->>'path' = p)
    end
$$;

-- used as:  check (public.files_valid(files) and octet_length(files::text) <= 200000)
```

> **Why `case` and not `and`.** SQL does not promise to evaluate `and` left to right, so `jsonb_typeof(f) = 'array' and jsonb_array_length(f) …` can call `jsonb_array_length` on a non-list and **crash** with an error instead of returning `false`. `case` is evaluated in order, so a bad value always fails the check cleanly (error `23514`, which `mapError` shows as "Some of that information is not valid").

---

## profiles

One row per account, created by the `on_auth_user_created` trigger in [09](./09-integration-contracts.md#2-auth).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK → `auth.users(id)` on delete cascade | Same id as the auth user |
| `name` | `text not null check (char_length(name) between 2 and 60)` | Display name |
| `role` | `text not null default 'student' check (role in ('student','ta','prof','admin'))` | Account type. Set at sign-up to `student` or `prof` (the user's choice — "Educator" in the UI); `ta` comes only from `add_course_staff`; `admin` only from the seed or another admin |
| `telegram_chat_id` | `text` | Set when the user links the bot |
| `telegram_link_code` | `text unique` | One-time code |
| `telegram_link_code_expires_at` | `timestamptz` | 10 minutes after issue |
| `created_at` / `updated_at` | `timestamptz default now()` | `updated_at` kept current by the shared `set_updated_at()` trigger (added in the lessons migration) |

Email lives in `auth.users` — we never duplicate it.

```sql
alter table public.profiles enable row level security;

-- I can always read myself
create policy "read own profile" on public.profiles for select using (id = auth.uid());

-- names are visible to people I share a course with (tiles, help queue, people tab):
-- everyone in a course sees its staff; staff see their students.
-- Students do NOT see each other's names.          (added by the courses migration)
create policy "read coursemates" on public.profiles for select using (
  exists (select 1 from public.course_staff cs
          where cs.user_id = profiles.id and public.is_course_member(cs.course_id))
  or exists (select 1 from public.course_students st
             where st.user_id = profiles.id and public.is_course_staff(st.course_id))
);

-- I may edit my own name and Telegram fields, but NOT my role
create policy "update own profile" on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and role = public.app_role());

-- plus `admin reads all` (select using public.is_admin())
```

> **Why `role = public.app_role()` and not a subquery.** The profiles migration first wrote this check as `role = (select role from public.profiles where id = auth.uid())`. That worked until "read coursemates" arrived: a policy on `profiles` that queries `profiles` makes Postgres expand `profiles`' read policies inside it, and once one of those contains subqueries of its own, Postgres refuses with **`42P17` "infinite recursion detected in policy"** — on *every* profile update, even a rename. `app_role()` is `security definer`, so it reads the current role without going back through RLS. The courses migration drops and recreates the policy this way. **Rule of thumb: a policy on a table must never query that same table directly — go through a `security definer` helper.**

> **How roles are assigned.**
> - **At sign-up the user picks Student or Educator.** The sign-up trigger in [09 §2](./09-integration-contracts.md#2-auth) reads that choice from the sign-up metadata through an allow-list: `prof` is accepted, and *anything* else — missing, `ta`, `admin`, junk — becomes `student`. The browser sends that metadata, so the trigger never trusts it beyond the allow-list.
> - **After sign-up the role is locked.** The `with check` clause on the update policy above rejects any change to your own role, so a student cannot later promote themselves and a mis-click on "Educator" cannot be undone by the user — an admin fixes it.
> - **`ta`** is granted per course by its prof, through `rpc('add_course_staff')`.
> - **`admin`** is never self-selectable: it comes from `seed.sql`, from one SQL statement run by the project owner on the cloud project, or from another admin via `rpc('admin_set_role')`.
>
> Policies must read the role from `profiles`, **never** from the user's auth metadata or token: a user can edit their own auth metadata at any time with `auth.updateUser({ data })`. The trigger is safe only because it reads that metadata once, at sign-up.

---

## courses

Built by the **courses migration** (`supabase/migrations/…_courses.sql`).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK default `gen_random_uuid()` | |
| `code` | `text not null check (code ~ '^[A-Z0-9]{2,12}$')` | e.g. `IS216`; `create_course` upper-cases it |
| `title` | `text not null check (char_length(title) between 1 and 100)` | |
| `term` | `text not null check (char_length(term) between 1 and 30)` | e.g. `AY2026/27 T1` — lets insights compare terms |
| `section` | `text not null check (char_length(section) between 1 and 10)` | e.g. `G2` |
| `owner_id` | `uuid not null → profiles(id)` | The prof who created it |
| `enrol_code` | `text not null unique check (char_length(enrol_code) = 6)` | Generated by the server, never chosen by the browser |
| `archived` | `boolean not null default false` | Archived courses are read-only, and can't be enrolled in |
| `created_at` / `updated_at` | `timestamptz not null default now()` | |

**Indexes:** `unique (owner_id, code, term, section)`; `unique (enrol_code)`.

Courses are **per prof**, not global. The uniqueness rule includes `owner_id`, so it only stops a prof duplicating *their own* course — two profs can both run "IS216 · AY2026/27 T1 · G2" without colliding, or learning that the other exists. `enrol_code` stays unique system-wide on purpose: it is the lookup key a student types, so two courses cannot share one.

### course_staff / course_students

| Table | Columns |
|---|---|
| `course_staff` | `course_id uuid → courses` on delete cascade, `user_id uuid → profiles` on delete cascade, `role text check (role in ('prof','ta'))`, `added_at timestamptz`, `primary key (course_id, user_id)` |
| `course_students` | `course_id uuid → courses` on delete cascade, `user_id uuid → profiles` on delete cascade, `enrolled_at timestamptz`, `primary key (course_id, user_id)` |

Both get an index on `(user_id)` so "my courses" is a single index scan.

### Policies

```sql
alter table public.courses         enable row level security;
alter table public.course_staff    enable row level security;
alter table public.course_students enable row level security;

-- courses — NO insert policy: courses are created only by rpc('create_course')
create policy "members read course" on public.courses
  for select using (public.is_course_member(id));
create policy "owner edits course" on public.courses
  for update using (owner_id = auth.uid())
  with check (owner_id = auth.uid());               -- can't hand the course to someone else
create policy "owner deletes course" on public.courses
  for delete using (owner_id = auth.uid());

create policy "members read staff list" on public.course_staff
  for select using (public.is_course_member(course_id));
create policy "staff read students, students read own row" on public.course_students
  for select using (public.is_course_staff(course_id) or user_id = auth.uid());

-- plus `admin reads all` (select using public.is_admin()) on each of the three tables
```

Nothing writes to `course_staff` or `course_students` from the browser — every write goes through the RPCs below.

### Why there is no insert policy on `courses`

A plain `insert` from the browser looks simpler, and it is a trap:

1. **The new course would be invisible to its own creator.** "members read course" is based on `course_staff`, and nothing would have added the prof there yet.
2. **`insert(...).select()` would fail outright.** Supabase only returns a newly inserted row if your *read* policies allow it, so the insert would report `new row violates row-level security policy` even though it was allowed.

So courses are created by one `security definer` function that does everything in a single transaction.

### RPCs

| RPC | Who | What it does | Refuses with |
|---|---|---|---|
| `create_course(p_code, p_title, p_term, p_section)` | Profs | Generates a random enrol code (retrying on a clash), inserts the course **and** the caller's `course_staff` row as `prof`, returns the course | `FORBIDDEN` if not a prof (admins included) · `CONFLICT` if this prof already has that code/term/section |
| `enrol_with_code(p_code)` | Students **and TAs** | Finds a non-archived course by code (case-insensitive) and adds the caller to `course_students`; enrolling twice is harmless | `NOT_FOUND` wrong or archived code · `FORBIDDEN` for profs and admins · `CONFLICT` if already on that course's staff |
| `add_course_staff(p_course_id, p_email)` | The course owner | Adds the account with that email as a `ta`; a `student` account is promoted to `ta`, a prof or admin account keeps its role | `FORBIDDEN` not the owner (or no such course) · `NOT_FOUND` no account with that email · `CONFLICT` already staff, **or currently enrolled as a student in this course** · `BAD_REQUEST` adding yourself |
| `remove_course_student(p_course_id, p_user_id)` | The course owner | Removes the enrolment; past statuses and snapshots stay, so old reports still add up | `FORBIDDEN` not the owner · `NOT_FOUND` not enrolled |

All four check for a logged-in caller first (`UNAUTHENTICATED`). Two decisions worth knowing:

- **TAs can enrol.** Someone who TAs one course may be a student in another, so `enrol_with_code` accepts `ta` accounts as well as `student`.
- **Nobody is both staff and student in the same course.** `enrol_with_code` refuses staff, and `add_course_staff` refuses enrolled students — otherwise the permission rules for that person would contradict each other.

`gen_enrol_code()` makes the codes: 6 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no 0/O, 1/I/L, because they are read off a projector), from `extensions.gen_random_bytes` because an enrol code is what lets someone into a course. Its `execute` permission is revoked from browser roles, so only `create_course` can call it.

> **Null-safe guards.** Every check in these functions uses `is distinct from` or an explicit `auth.uid() is null` test, never `<>`. For a logged-out caller `auth.uid()` is `null`, `null <> owner` is `null`, and an `if` on `null` is skipped — a `<>` guard in `add_course_staff` would have let an anonymous caller add TAs to any course.

---

## lessons

Built by the **lessons migration** (`supabase/migrations/…_lessons.sql`), together with `steps`, the `files_valid()` / `files_include()` helpers and the shared `set_updated_at()` trigger.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `course_id` | `uuid not null → courses` on delete cascade | |
| `title` | `text not null check (char_length(title) between 1 and 100)` | e.g. "Week 6 · Mini Cart" |
| `week` | `int check (week between 1 and 13)` | Optional; orders the library |
| `description` | `text check (char_length(description) <= 500)` | |
| `files` | `jsonb not null check (public.files_valid(files) and octet_length(files::text) <= 200000)` | Starter code with TODOs — a real Vite project, source files only |
| `files_hash` | `text generated always as (md5(files::text)) stored` | Cheap change check for the IndexedDB cache — the client selects this, not `files` |
| `entry_file` | `text not null` | `index.html` for the dev server; checked by the `entry_file_exists` constraint |
| `dev_command` | `text not null default 'pnpm dev'` (1–200 chars) | What WebContainer spawns |
| `source` | `jsonb` | `{ type: 'upload' \| 'github', repo, ref, dir }` |
| `status` | `text not null default 'draft' check (status in ('draft','ready','archived'))` | Only `ready` can start a session; **students never see `draft`** |
| `created_by` | `uuid not null default auth.uid() → profiles` | Filled in automatically; the insert policy refuses anyone else's id |
| `created_at` / `updated_at` | `timestamptz not null default now()` | `updated_at` maintained by `set_updated_at()` |

**Constraint:** `entry_file_exists check (public.files_include(files, entry_file))` — a check constraint, not a trigger, so a bad entry file fails with `23514` like every other invalid value.

**Indexes:** `(course_id, week)`.

## steps

Promoted from a sub-document, because other tables point at a step — see the explanation below.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | Referenced by checkpoints, sessions, snapshots and help requests |
| `lesson_id` | `uuid not null → lessons` on delete cascade | |
| `order` | `int not null check ("order" >= 1)` | 1-based, always contiguous (1, 2, 3…) |
| `title` | `text not null check (char_length(title) between 1 and 120)` | Defaults to the TODO text |
| `description` | `text check (char_length(description) <= 1000)` | |
| `todo_refs` | `jsonb not null default '[]'` | `[{ file, line }]` — one step can span files |
| `checks` | `jsonb not null default '[]'` | Automatic step checks (COULD) |

**Constraint:** `unique (lesson_id, "order") deferrable initially deferred`.

> **Why deferrable.** A normal unique constraint is checked **row by row, in the middle of an update**. Moving step 3 to position 1 briefly gives two steps `order = 1`, so the change fails even though the finished result is fine. A deferred constraint is checked only when the transaction commits, by which time every order is unique again. Copying a plain `unique (lesson_id, "order")` into any future migration brings that bug back.

> `order` is a reserved word — always quote it as `"order"` in SQL. The API layer exposes it as `order` in camelCase JS.

**Why steps are a separate table.** Other tables point at a *specific* step (a help request is "stuck on this step"; a checkpoint is saved "for this step"), and in Postgres that pointer is a foreign key — which can only target a row in a table, not an item inside a JSON list. It also keeps a step's identity stable when steps are reordered, and lets one step be edited without rewriting its lesson's 200 KB of files.

### Helpers

```sql
-- Staff see every lesson; enrolled students see everything except drafts.
create function public.can_read_lesson(lid uuid) returns boolean
language sql security definer stable set search_path = '' as $$
    select exists (
        select 1 from public.lessons l
        where l.id = lid
          and (public.is_course_staff(l.course_id)
               or (public.is_enrolled(l.course_id) and l.status <> 'draft'))
    )
$$;

-- Only the course's prof edits a lesson or its steps (not TAs).
create function public.can_edit_lesson(lid uuid) returns boolean
language sql security definer stable set search_path = '' as $$
    select exists (
        select 1 from public.lessons l
        where l.id = lid and public.is_course_prof(l.course_id)
    )
$$;
```

Every steps policy goes through these, so the "can this person see / edit that lesson?" rule lives in one place. Use them in any later policy that needs the same question.

### Policies

```sql
alter table public.lessons enable row level security;
alter table public.steps   enable row level security;

-- lessons
create policy "staff read lessons, students read non-drafts" on public.lessons
  for select using (public.is_course_staff(course_id)
                    or (public.is_enrolled(course_id) and status <> 'draft'));
create policy "prof creates lessons" on public.lessons
  for insert with check (public.is_course_prof(course_id) and created_by = auth.uid());
create policy "prof edits lessons" on public.lessons
  for update using (public.is_course_prof(course_id))
  with check (public.is_course_prof(course_id));     -- can't move a lesson into a course you don't run
create policy "prof deletes lessons" on public.lessons
  for delete using (public.is_course_prof(course_id));

-- steps
create policy "readers of the lesson read its steps" on public.steps
  for select using (public.can_read_lesson(lesson_id));
create policy "prof writes steps" on public.steps
  for all using (public.can_edit_lesson(lesson_id)) with check (public.can_edit_lesson(lesson_id));

-- plus `admin reads all` on both tables
```

**Two reading rules worth knowing:**

- **Students never see draft lessons**, nor their steps — a half-finished plan doesn't belong in the student's library. Ready and archived lessons stay visible, so replays of past classes keep their titles.
- **Students can read a non-draft lesson's starter `files`.** RLS controls *rows*, not columns, so it can't hide one column from some readers; students also need the starter files the moment class starts. Starter code is the *unfinished* exercise — the prof's worked solutions live in checkpoints, which are session-scoped. (This replaces an earlier plan for a `lesson_files_for_member` gate, which was never built.)

### RPCs

**`replace_steps(p_lesson_id, p_steps)`** — save a lesson's whole step list in one transaction. `p_steps` is `[{ id?, title, description?, todo_refs? }, …]` in display order.

1. Not logged in → `UNAUTHENTICATED`
2. Not this course's prof (TAs included) → `FORBIDDEN`
3. `p_steps` isn't a list → `BAD_REQUEST`
4. Any step with an empty title → `VALIDATION_FAILED`
5. A step `id` belonging to **another lesson** → `BAD_REQUEST` (otherwise a prof could rewrite someone else's lesson through it)
6. Steps whose `id` is missing from the list are **deleted**
7. Steps with an `id` are **updated** at their position in the list
8. Steps without an `id` are **created**
9. **Any `order` sent is ignored** — steps are always renumbered 1, 2, 3… by list position
10. Returns the lesson's steps in order

**`delete_step(p_step_id)`** — delete one step and close the gap (1, 2, 4 → 1, 2, 3). `FORBIDDEN` for anyone but the course's prof, including for a step that doesn't exist.

Single-step edits (renaming one step) are a direct `update` on `steps`, allowed by the "prof writes steps" policy — no RPC needed.

### Once a lesson has been taught

Its step numbers become history: `student_status.done_step_order`, `status_history.step_order` and every checkpoint mean "step N". So the sessions migration adds guards (see [Guards on taught lessons](#guards-on-taught-lessons)). **Until a lesson has a session, everything above applies unchanged.**

---

## sessions

Migration: `supabase/migrations/20261018153107_sessions.sql`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `lesson_id` | `uuid not null → lessons` | No cascade |
| `course_id` | `uuid not null → courses` | Denormalised so every policy is one hop. `start_session` copies it from the lesson |
| `started_by` | `uuid not null → profiles` | |
| `join_code` | `text not null check (join_code ~ '^[A-Z0-9]{6}$')` | From `JOIN_CODE_ALPHABET` |
| `status` | `text not null default 'live' check (status in ('live','ended'))` | |
| `current_step_id` | `uuid → steps` | Step of the latest checkpoint |
| `settings` | `jsonb not null default '{"allowCatchUp":true,"hintsEnabled":false,"idleAfterSec":180}' check (session_settings_valid(settings))` | Prof toggles during class. **All three keys are required on every update**, and `idleAfterSec` must be a number from 30 to 3600 — the view casts it, so one bad value would break every tile |
| `spotlight` | `jsonb check (≤ 20 000 bytes)` | Anonymised excerpt, or null |
| `announcement` | `jsonb check (announcement is null or char_length(announcement->>'text') between 1 and 200)` | `{ text, at }` — the prof's current class announcement, or null. Stored so late joiners and reconnecting students see it, not just whoever was subscribed at the moment it was sent. Written only by `rpc('announce')`, so the broadcast always accompanies the write |
| `started_at` | `timestamptz not null default now()` | |
| `ended_at` | `timestamptz` | |

**Indexes:** `unique (join_code) where status = 'live'` (partial); `(course_id, started_at desc)`; `(lesson_id)`.

**Policies:** "members read sessions" (`is_course_member`), "prof updates sessions" (`is_course_prof`, `using` and `with check`), "admin reads all". No insert or delete policy: sessions are created by `start_session` and never deleted.

The prof writes `settings` and `spotlight` directly (see [04](./04-pages-routes-and-events.md)); everything else on a session is changed by the session RPCs. The update policy's `with check` stops a prof moving a session into a course they don't run.

`start_session`, `join_session`, `save_checkpoint` and `end_session` (Ying Qi), `announce` (Karin) and `catch_up` (Ray Yien) are RPCs — a client cannot be trusted to allocate a unique join code or decide its own role. Full bodies in [05-core-logic.md](./05-core-logic.md#3-session-lifecycle). **They are not in this migration**; each owner adds theirs. Until `start_session` exists, tests create sessions with the service role.

### Session helpers

All `security definer`, for the same reason as the course helpers.

| Helper | True when |
|---|---|
| `is_session_member(sid)` | The caller is staff or an enrolled student of the session's course |
| `is_session_staff(sid)` | The caller is the prof or a TA of the session's course |
| `is_live_session_student(sid)` | The caller is **enrolled** in the session's course **and** the session is `live` |
| `session_lost_count(sid)` | Returns the number of raised "I'm lost" flags — to staff and admins. Returns `null` to anyone else |
| `is_session_channel_member(topic)` | `topic` is exactly `session:<uuid>` and the caller is a member. Anything else is `false`, never a cast error |

---

## checkpoints

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `session_id` | `uuid not null → sessions` on delete cascade | |
| `step_id` | `uuid not null → steps` | Must be a step of the session's lesson (trigger, `BAD_REQUEST`) |
| `seq` | `int not null check (seq >= 1)` | 1, 2, 3… in save order |
| `files` | `jsonb not null check (public.files_valid(files) and octet_length(files::text) <= 200000)` | Full snapshot of the prof's code |
| `files_hash` | `text generated always as (md5(files::text)) stored` | Cache key; also how the client detects that `package.json` changed between checkpoints |
| `note` | `text check (char_length(note) <= 500)` | Shown in replay |
| `created_by` | `uuid not null → profiles` | |
| `created_at` | `timestamptz not null default now()` | |

**Indexes:** `unique (session_id, seq)`.

**Policies:** "members read checkpoints" (`is_session_member`), "admin reads all". Inserts only via `rpc('save_checkpoint')`: it allocates `seq`, sets `current_step_id` and broadcasts.

> Two "Save checkpoint" clicks at once would race for the same `seq`. `save_checkpoint` locks the session row first (`select … for update`), so the second save waits and takes the next number; the unique index is the backstop.

---

## student_status (latest state only — one row per student per session)

**There is no `state` column.** This is the deliberate difference from the Mongo design: the student's own client writes this row, so anything stored here is forgeable. Only raw signals are stored; the tile state is derived in `session_tiles`.

**There is no `lost` column either.** Staff can read these rows, and staff receive them whole over Postgres Changes, so a column here could never be hidden from them. "I'm lost" lives in [`lost_flags`](#lost_flags) instead.

| Column | Type | Notes |
|---|---|---|
| `session_id` | `uuid not null → sessions` on delete cascade | `primary key (session_id, student_id)` |
| `student_id` | `uuid not null → profiles` | |
| `done_step_order` | `int not null default 0 check (done_step_order >= 0)` | Highest step marked Done |
| `error` | `jsonb check (null, or an object whose message ≤ 300)` | `{ source: 'runtime' \| 'build', name, message, file, line, key, shapeKey, at }`. Send SQL `null` to clear it. **Build errors have their code frame stripped before they get here** — see [05 §1](./05-core-logic.md#1-client-side-runtime-webcontainer) |
| `checks` | `jsonb` | `{ passed, total }` — only when automatic checks exist (COULD) |
| `catch_ups` | `int not null default 0` | Times the student loaded a checkpoint. Incremented by `rpc('catch_up')` |
| `last_seen_at` | `timestamptz not null default now()` | Heartbeat or any event |
| `joined_at` | `timestamptz not null default now()` | Attendance for digests |

**Indexes:** the primary key (it starts with `session_id`). Added to the `supabase_realtime` publication, so staff can subscribe to it.

**Policies:**

| Policy | Rule |
|---|---|
| "student reads own status" | `select`: `student_id = auth.uid()` |
| "student creates own status" | `insert`: own row, and `is_live_session_student(session_id)` |
| "student updates own status" | `update`: own row, and still `is_live_session_student` — so nothing changes after the class ends |
| "staff read statuses" | `select`: `is_session_staff(session_id)` |
| "admin reads all" | `select` |

No delete policy: the row is the attendance record. Staff can't write a row, because they aren't enrolled.

## lost_flags

One row means this student has tapped "I'm lost" and not cleared it. **Readable only by its owner (and admins).**

| Column | Type |
|---|---|
| `session_id` | `uuid not null → sessions` on delete cascade, `primary key (session_id, student_id)` |
| `student_id` | `uuid not null → profiles` |
| `at` | `timestamptz not null default now()` |

**Policies:** "student reads own flag" (`select`), "student raises flag" (`insert`: own row, `is_live_session_student`), "student clears flag" (`delete`: own row), "admin reads all". **There is no staff policy.** Staff get only `session_summary.lost_count`, through `session_lost_count()`.

Raise = `insert`, clear = `delete`. A second tap while the flag is up is a primary-key `CONFLICT`, which the client can ignore.

## status_history

Append-only; replaces the capped `stateHistory[]` array. Written only by triggers.

| Column | Type |
|---|---|
| `id` | `bigint generated always as identity` PK |
| `session_id` | `uuid not null → sessions` on delete cascade |
| `student_id` | `uuid not null → profiles` |
| `state` | `text not null check (state in ('error','behind','in_progress','done'))` — never `idle`, see below |
| `step_order` | `int not null` — the student's `done_step_order` at that moment |
| `error_key` | `text` — the error's `key` when `state = 'error'`, else null. Added by the help/notes/reports migration so the report can count its top errors after class: `student_status` keeps only the latest error |
| `at` | `timestamptz not null default now()` |

**Indexes:** `(session_id, student_id, at)`.

**Policies:** "staff read history" (`is_session_staff`), "admin reads all". Students can't read it.

Two triggers write it:

| Trigger | Fires on | Appends |
|---|---|---|
| `record_status_change` | insert, or update of `done_step_order` / `error`, on `student_status` | One row, if that student's derived state differs from **their last history row** — or the state is still `error` but with a different `error_key`. Compared with the last row, not `OLD`, so a heartbeat upsert that changes nothing writes nothing |
| `record_checkpoint_states` | update of `sessions.current_step_id` | One row for **every** student whose state the new checkpoint changed. Without this, history would miss every "behind", because the students who fell behind never wrote anything |

`idle` is never recorded. It depends on `now()`, so no write ever happens at the moment a student becomes idle.

### Views: `session_tiles` and `session_summary`

`session_tiles` is the only thing the dashboard reads. The classifier from [05](./05-core-logic.md#4-status-classifier) lives in one SQL function, `tile_state(done, error, target)`, which the view **and** both history triggers call, so the three can never disagree:

```sql
create function public.tile_state(p_done int, p_error jsonb, p_target int) returns text
language sql immutable set search_path = '' as $$
    select case
        when p_error is not null       then 'error'
        when p_target = 0              then case when p_done >= 1 then 'done' else 'in_progress' end
        when p_done >= p_target        then 'done'
        when p_done = p_target - 1     then 'in_progress'
        else 'behind'
    end
$$;

create view public.session_tiles with (security_invoker = true) as
select
    ss.session_id,
    ss.student_id,
    p.name,
    coalesce(st."order", 0)              as target_order,
    ss.done_step_order                   as step_order,
    ss.error->>'source'                  as error_source,
    ss.error->>'key'                     as error_key,
    left(ss.error->>'message', 120)      as error_preview,
    ss.checks,
    ss.last_seen_at,
    case
        when now() - ss.last_seen_at >
             make_interval(secs => (s.settings->>'idleAfterSec')::numeric) then 'idle'
        else public.tile_state(ss.done_step_order, ss.error, coalesce(st."order", 0))
    end                                  as state
from public.student_status ss
join public.sessions s on s.id = ss.session_id
join public.profiles p on p.id = ss.student_id
left join public.steps st on st.id = s.current_step_id;
```

`security_invoker = true` makes the view run with the caller's rights, so the RLS policies above still apply — **without it a view would leak every session's rows.** A student querying it sees only their own tile.

The help/notes/reports migration appends one more column, `passed_steps int[]`: the step orders this student's `check` requests were **passed** on, e.g. `{1,3}`. (`create or replace view` can only add columns at the end, so it comes after `state`.)

```sql
create view public.session_summary with (security_invoker = true) as
select
    session_id,
    count(*)                                        as total,
    count(*) filter (where state = 'done')          as done,
    count(*) filter (where state = 'in_progress')   as in_progress,
    count(*) filter (where state = 'error')         as error,
    count(*) filter (where state = 'behind')        as behind,
    count(*) filter (where state = 'idle')          as idle,
    public.session_lost_count(session_id)           as lost_count
from public.session_tiles
group by session_id;
```

`lost_count` is a number from a function that reads `lost_flags` on the caller's behalf, so **no query a staff member can write returns who is lost.** That is the whole mechanism for T-PRIV-04. A student reading the summary gets `lost_count = null`.

### Guards on taught lessons

"Taught" means at least one session exists for the lesson. All raise `CONFLICT`, so the UI can offer Archive or explain:

| Trigger | Refuses |
|---|---|
| `guard_taught_lesson` | Deleting a taught lesson, or moving it to another course |
| `guard_taught_course` | Deleting a course that has any session. It fires before the delete cascades into the lessons, so the message talks about the course |
| `guard_taught_steps` | Deleting a step, changing a step's `order`, or inserting a step anywhere but after the last one. **Rewording a step and appending new steps still work** — including through `replace_steps` and `delete_step` |

To restructure a taught lesson, the prof makes a new lesson. The foreign keys back the triggers up: `sessions → lessons/courses` and `checkpoints → steps` do not cascade.

---

## snapshots (a student's code)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `session_id` | `uuid not null → sessions` on delete cascade | |
| `student_id` | `uuid not null → profiles` | |
| `step_id` | `uuid → steps` | Step the student was on |
| `reason` | `text not null check (reason in ('autosave','before_catchup','help_request'))` | |
| `files` | `jsonb not null check (public.files_valid(files) and octet_length(files::text) <= 200000)` | Source files only — `SYNC_IGNORE` keeps `node_modules/`, `dist/` and `.vite/` out |
| `files_hash` | `text generated always as (md5(files::text)) stored` | Cache key |
| `created_at` | `timestamptz default now()` | |

**Rules**
- `autosave`: **one per student per session** — `unique (session_id, student_id) where reason = 'autosave'`, written by `rpc('autosave_patch')`, which merges only the files that changed into the existing `files` jsonb rather than replacing the whole set. Debounced 5 s on the client; see [05 §2](./05-core-logic.md#2-files-cache--dependencies).
- `before_catchup` and `help_request`: a new row each time, never updated. Students have no write policy at all, so only the RPCs can write snapshots.
- Staff read a snapshot **only** through the help request that references it.

**Indexes:** the partial unique above; `(session_id, student_id, reason, created_at desc)`.

Migration: `supabase/migrations/20261018154409_help_notes_reports.sql` (snapshots, help requests, notes, reports).

```sql
alter table public.snapshots enable row level security;

-- students only READ: autosave_patch, catch_up and the help RPCs write every row, so a
-- snapshot already sent to a TA can't be edited afterwards
create policy "student reads own snapshots" on public.snapshots
    for select using (student_id = auth.uid());

-- THE privacy rule. Staff reach a snapshot only via a help request pointing at it.
create policy "staff read sent snapshots" on public.snapshots
    for select using (public.is_sent_to_staff(id));

create policy "admin reads all" on public.snapshots for select using (public.is_admin());
```

`is_sent_to_staff(snap)` is a `security definer` helper: true when a help request with `snapshot_id = snap` exists in a session the caller staffs. It's a helper rather than an inline subquery so the policy doesn't depend on `help_requests`' own RLS.

> **Changed from the first draft:** the policy was `own snapshots … for all`, which let a student update or delete a snapshot after sending it for help. Every write path is an RPC anyway, so students get `select` only.

---

## help_requests

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `session_id` | `uuid not null → sessions` on delete cascade | |
| `student_id` | `uuid not null → profiles` | |
| `step_id` | `uuid not null → steps` | |
| `type` | `text not null check (type in ('check','help'))` | |
| `snapshot_id` | `uuid not null → snapshots` | Created in the same RPC, `reason = 'help_request'` |
| `message` | `text check (char_length(message) <= 300)` | The student's opening message |
| `in_person` | `boolean not null default false` | `help` only — triggers a Telegram ping |
| `seat` | `text check (char_length(seat) <= 20)` | Required when `in_person` |
| `status` | `text not null default 'open' check (status in ('open','claimed','passed','replied','resolved','cancelled'))` | |
| `claimed_by` | `uuid → profiles` | Cleared when the student follows up, so any staff member can pick it back up |
| `thread` | `jsonb not null default '[]'` | Append-only exchange after the opening message: `[{ role: 'staff' \| 'student', author_id, body, at }]`. Staff replies ≤ 1000 chars, student follow-ups ≤ 300. **Text only — never code** |
| `follow_ups` | `int not null default 0 check (follow_ups <= 3)` | `Limits.MAX_FOLLOW_UPS`. Stops a request turning into a chat |
| `telegram_notified_at` | `timestamptz` | |
| `created_at` / `updated_at` | `timestamptz` | `created_at` drives queue order — **a follow-up keeps its original place** |

**Allowed transitions** (enforced inside `rpc('transition_help_request')`, except the follow-up, which has its own RPC)

| From | To | Who |
|---|---|---|
| `open` | `claimed` | Staff |
| `open` | `cancelled` | The student who created it |
| `claimed` | `passed` | Claiming staff (only `type = 'check'`) |
| `claimed` | `replied` | Claiming staff |
| `claimed` | `resolved` | Claiming staff (in-person done) |
| `claimed` | `open` | Claiming staff (release) |
| `replied` | `open` | **The student who created it — a follow-up**, via `rpc('follow_up_help_request')`, at most `MAX_FOLLOW_UPS` (3) times |

`passed`, `resolved` and `cancelled` stay terminal: a passed check needs no follow-up, and in-person help was resolved face to face.

**Indexes:** `(session_id, status, created_at)`; `unique (session_id, student_id, type) where status in ('open','claimed')` — one active request per type per student, which is how T-HELP-06 returns a conflict without any application code.

**Checks the table enforces itself:**

| Rule | How | Error |
|---|---|---|
| In person only for `help`, and needs a seat | `check (not in_person or (type = 'help' and seat is set))` | `23514` |
| `follow_ups` 0–3, `message` ≤ 300 | column checks | `23514` |
| `snapshot_id` is **this student's own `help_request` snapshot from this session** — never someone else's, and never their autosave row, which keeps changing (staff would be watching live code) | trigger `check_help_snapshot` | `BAD_REQUEST` |

The status transitions (only a `check` can be `passed`, `claimed` needs a claimer, …) are enforced by Karin's `transition_help_request`, not by the table.

```sql
alter table public.help_requests enable row level security;

create policy "student reads own requests" on public.help_requests
    for select using (student_id = auth.uid());
create policy "staff read queue" on public.help_requests
    for select using (public.is_session_staff(session_id));
create policy "admin reads all" on public.help_requests for select using (public.is_admin());
-- all writes via rpc (Karin): create_help_request, claim_help_request,
--                             transition_help_request, follow_up_help_request
```

`help_requests` is in the `supabase_realtime` publication, so the queue and the student's own requests update live. **The RPCs themselves are Karin's** and come in her migration; the two bodies below are the design.

Claiming is race-free in one statement — zero rows updated **is** the conflict:

```sql
create function public.claim_help_request(p_request_id uuid) returns public.help_requests
language plpgsql security definer set search_path = '' as $$
declare r public.help_requests;
begin
  update public.help_requests set status = 'claimed', claimed_by = auth.uid(), updated_at = now()
   where id = p_request_id and status = 'open'
     and public.is_course_staff((select course_id from public.sessions where id = session_id))
  returning * into r;
  if not found then
    raise exception 'CONFLICT|Someone else is already on this one' using errcode = 'P0001';
  end if;
  return r;
end $$;
```

### Follow-ups

Before this, `replied` was terminal — a student whose problem wasn't fixed by the reply had to open a brand-new request, go to the back of the queue, and probably reach a different TA with none of the context. A follow-up reopens **the same request** instead:

```sql
create function public.follow_up_help_request(p_request_id uuid, p_message text, p_files jsonb)
returns public.help_requests
language plpgsql security definer set search_path = '' as $$
declare r public.help_requests; snap uuid;
begin
  -- 1. fresh snapshot of the student's CURRENT code — the reply may have prompted changes
  insert into public.snapshots (session_id, student_id, step_id, reason, files)
  select session_id, student_id, step_id, 'help_request', p_files
    from public.help_requests where id = p_request_id and student_id = auth.uid()
  returning id into snap;
  if snap is null then
    raise exception 'FORBIDDEN|You can only follow up on your own request' using errcode = 'P0001';
  end if;

  -- 2. reopen: only from 'replied', only under the cap
  update public.help_requests set
      status      = 'open',
      claimed_by  = null,
      snapshot_id = snap,
      follow_ups  = follow_ups + 1,
      thread      = thread || jsonb_build_array(jsonb_build_object(
                      'role','student','author_id',auth.uid(),'body',p_message,'at',now())),
      updated_at  = now()
   where id = p_request_id and status = 'replied' and follow_ups < 3
  returning * into r;
  if not found then
    raise exception 'BAD_REQUEST|You can follow up on a replied request up to 3 times — ask for in-person help instead'
      using errcode = 'P0001';
  end if;
  return r;
end $$;
```

| Decision | Why |
|---|---|
| **Same row, original `created_at`** | The problem is the original one, still unsolved, so it keeps its place in the oldest-first queue rather than going to the back |
| **`claimed_by` cleared** | Any TA can claim it. The card shows "Follow-up · last handled by Ana", derived from the latest staff entry in `thread` — no extra column |
| **A fresh snapshot is attached** | The student has usually changed their code since the reply, so the TA reviews what they have *now* |
| **Only the latest snapshot stays visible to staff** | The `snapshots` privacy policy admits a row only via `help_requests.snapshot_id`, which now points at the new one. The earlier snapshot becomes unreadable to staff. We kept the policy simple rather than widen it — staff see the minimum code needed, which is the privacy design working as intended |
| **`thread` is text only, in the same row** | No new table, so **no new RLS policy**: the existing "student reads own" and "staff read queue" policies already cover it. This is what keeps follow-ups cheap compared with a full message table |
| **Capped at 3** | Past that, the TA should walk over. The cap is what stops this becoming a chat feature |
| **Partial unique index still applies** | If the student opened another request of the same type meanwhile, reopening raises `CONFLICT` — no special case needed |

The waiting-time badge on the card counts from the latest `thread` entry, not `created_at`, so a follow-up doesn't instantly show as 20 minutes overdue.

---

## notes

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid not null → profiles` | Private to the author |
| `session_id` | `uuid not null → sessions` on delete cascade | |
| `checkpoint_id` | `uuid → checkpoints` | Anchor in the replay |
| `kind` | `text not null check (kind in ('note','bookmark'))` | |
| `body` | `text check (char_length(body) <= 2000)` | Required for `note` |
| `created_at` / `updated_at` | `timestamptz` | |

**Indexes:** `(user_id, session_id)`; GIN full-text on `to_tsvector('english', body)` for search. **`search()` must use that exact expression**, or Postgres can't use the index.

- `user_id` defaults to `auth.uid()`, so the client never sends it.
- A `note` needs a non-blank `body`; a `bookmark` doesn't (`23514`).
- `user_id` cascades on delete: a note is private data that belongs to its author.

```sql
alter table public.notes enable row level security;
create policy "own notes" on public.notes for all
    using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "admin reads all" on public.notes for select using (public.is_admin());
```

T-PRIV-05 passes by construction — a note belonging to someone else is not a 404 we have to remember to return, it simply isn't in the result set.

---

## session_reports

| Column | Type | Notes |
|---|---|---|
| `session_id` | `uuid` PK → `sessions` on delete cascade | One per ended session |
| `course_id`, `lesson_id` | `uuid` | For cross-term trends |
| `attendance` | `jsonb` | `{ joined, enrolled }` |
| `steps` | `jsonb` | Per-step funnel — see [05](./05-core-logic.md#10-insights-report): `[{ order, stepId, title, reachedDone, dropOff, errorStudents, peakBehind, medianMinutesToDone, catchUps, helpRequests, trouble }]` (the shape `seed.sql` writes and `buildReport` must produce) |
| `top_errors` | `jsonb` | Top 5, counts only: `[{ key, students, stepOrder }]` |
| `lost_peak` | `int` | Max simultaneous "I'm lost" |
| `generated_at` | `timestamptz default now()` | |
| `digest` | `jsonb` | `{ sentAt, recipients }` — counts only |

Written by the `end-session` Edge Function (triggered by a Database Webhook when `sessions.status` becomes `ended`). The report page polls until the row exists.

`session_id → sessions` on delete cascade; `course_id → courses` and `lesson_id → lessons` for trends. `attendance` is required; `steps` and `top_errors` default to `[]`, `lost_peak` to 0. Index `(course_id, lesson_id)` for trends.

```sql
alter table public.session_reports enable row level security;
create policy "staff read reports" on public.session_reports
    for select using (public.is_session_staff(session_id));
create policy "admin reads all" on public.session_reports for select using (public.is_admin());
```

The policy checks the **session**, not the row's `course_id`, so it can never disagree with where the session really ran.

## lost_events (for `lost_peak`)

`lost_flags` deletes a row when a student clears "I'm lost", so by the end of class the peak would be gone. A trigger on `lost_flags` appends `+1` on raise and `-1` on clear:

| Column | Type |
|---|---|
| `id` | `bigint generated always as identity` PK |
| `session_id` | `uuid not null → sessions` on delete cascade |
| `delta` | `smallint not null check (delta in (1, -1))` |
| `at` | `timestamptz not null default now()` |

**No `student_id`.** Its only policy is `admin reads all`: even anonymous timestamps, next to the live tile grid, could hint at who tapped. Staff and the `end-session` function get the number from `session_lost_peak(sid)` — a `security definer` running sum, the peak for staff and admins, `null` for anyone else.

## test_outbox (local + test only)

When `EXTERNAL_APIS=mock`, Edge Functions append here instead of calling Telegram/GitHub. E2E tests assert against it, replacing the old `GET /api/__test__/outbox`.

| Column | Type |
|---|---|
| `id` | `bigint generated always as identity` PK |
| `channel` | `text` (`telegram` \| `github` \| `llm`) |
| `payload` | `jsonb` |
| `created_at` | `timestamptz default now()` |

An ordinary migration (`…_test_outbox.sql`), applied everywhere including production: with RLS on and no policy for ordinary users it is unreachable from the app, and with `EXTERNAL_APIS=live` nothing ever writes to it. Its only policy is `admin reads all`. Edge Functions write it and tests read it with the service-role key; `readOutbox()` and `outboxMark()` in `tests/unit/rls/_helpers.js` do the reading. `channel` is checked against `('telegram', 'github', 'llm')`.

---

## Admin

An **admin** manages user accounts and can **read everything** in the system. Admins cannot *act* in a course — they cannot start sessions, save checkpoints, claim help requests or edit lessons — because every one of those writes goes through an RPC or policy that checks course membership, and admin access is deliberately read-only outside user management.

### Helpers

```sql
-- The caller's account role. Named app_role, NOT current_role: `current_role` without
-- a schema prefix is a built-in Postgres keyword that returns the *database* role
-- ('authenticated', 'postgres'), so a missing `public.` would silently compare
-- against the wrong thing.
create function public.app_role() returns text
language sql security definer stable set search_path = '' as $$
  select role from public.profiles where id = auth.uid()
$$;

create function public.is_admin() returns boolean
language sql security definer stable set search_path = '' as $$
  select coalesce(public.app_role() = 'admin', false)
$$;
```

Both are `security definer` for the same reason as every other helper: they read `profiles`, and they are called from policies **on** `profiles`, which would otherwise call themselves in a loop. `is_admin()` coalesces to `false`, so a logged-out caller (whose role is `null`) is never mistaken for an admin.

### Read access: one extra policy per table

Rather than editing every existing policy, each table gets **one additional `select` policy**. Policies combine with OR, so the existing rules are untouched and admin access is a single, greppable line per table:

```sql
create policy "admin reads all" on public.<table> for select using (public.is_admin());
-- applied to every table in public, plus the Realtime channel policy on realtime.messages
```

There is **no** admin `insert` / `update` / `delete` policy on any table. Admin writes happen only through the functions below. The schema sweep test checks both halves: every table has an `admin reads all` policy, and no admin policy exists for any other command.

### Managing users

The one thing an admin writes is **another user's account role**. There is no account disabling, audit log or password-reset tool — out of scope for this project.

| Action | Mechanism | Notes |
|---|---|---|
| List every user — name, email, role, joined | `rpc('admin_list_users')` | Emails live in `auth.users`, which the browser cannot read; this `security definer` function joins them in after checking `is_admin()` |
| Change a user's role | `rpc('admin_set_role', user_id, role)` | Validates the role (`VALIDATION_FAILED`), refuses the caller's own (`BAD_REQUEST`), `NOT_FOUND` for no such user. **It changes the account type only** — who runs or takes a course comes from `course_staff` / `course_students`, which it doesn't touch |

Migration: `supabase/migrations/20261018164039_admin.sql`. Both are RPCs: they touch only our own tables, so nothing needs the service-role key and there is no admin Edge Function.

**"You can't change your own role"** is the only lock-out guard needed: only an admin can demote an admin, and nobody can demote themselves, so at least one admin always remains.

All admin guards use `is distinct from` / `is_admin()`, never `<> 'admin'`: for a logged-out caller the role is `null`, and `null <> 'admin'` is `null`, which a guard would treat as *not* blocked.

**Policy sweep.** `admin_policy_sweep()` returns one row per `public` table: RLS on, the number of `admin reads all` select policies, and the number of admin policies for any other command. T-ADM-09 asserts every table is `true / 1 / 0`, so a new table that forgets its admin policy (or adds an admin write) fails the suite. It reads the catalog, so it is granted to `service_role` only.

**Admin actions are not logged.** Postgres can't trigger on `select`, and role changes aren't recorded either — keep the number of admin accounts to the minimum the demo needs.

---

## Delete Cascades

Handled by `on delete cascade` on the foreign keys, so there is no controller-side cascade to forget.

| Deleting | Also deletes |
|---|---|
| Course (owner prof only) | Its lessons → steps, sessions → everything under each session |
| Lesson | Its steps. **Will be** blocked by a trigger if any session exists — archived instead, so replays keep working. The trigger arrives with the sessions migration; until then, deletion is allowed |
| Session (owner prof, ended only) | Checkpoints, statuses, history, snapshots, help requests, notes, report |
| Removing a student from a course | Their `course_students` row only; past statuses/snapshots stay for the report |

---

## Authorization Matrix

The contract, enforced by RLS policies and `security definer` RPCs. **Admin** is a platform-operator account, not a course role: it reads everything, writes only user accounts.

| Action | Student (enrolled) | TA (staff) | Prof (staff) | Admin |
|---|:---:|:---:|:---:|:---:|
| Register (as Student or Educator) / log in / edit own profile / link Telegram | ✅ | ✅ | ✅ | ✅ |
| Enrol in a course with `enrol_code` (or the enrol link) | ✅ | ✅ in courses they don't staff | — | — |
| View course + lesson library | ✅ | ✅ | ✅ | ✅ (every course) |
| **Create / edit / archive** course | ❌ | ❌ | ✅ (own courses only) | ❌ |
| Add TA to course | ❌ | ❌ | ✅ (owner) | ❌ |
| **Create / edit / delete** lesson, edit steps, import from GitHub | ❌ | ❌ | ✅ | ❌ |
| Start / end a live session, save checkpoints, Spotlight | ❌ | ❌ | ✅ | ❌ |
| Post / clear a class announcement | ❌ | ❌ | ✅ | ❌ |
| Join a live session | ✅ | ✅ (as staff) | ✅ | — |
| Report own status, tap Done, toggle "I'm lost", autosave, catch up | ✅ | — | — | — |
| View class dashboard (tiles, counts, error groups) | ❌ | ✅ | ✅ | ✅ (read-only) |
| See which student tapped "I'm lost" (`lost_flags`) | ❌ | ❌ | ❌ | ✅ |
| Send Check my work / Ask for help | ✅ | — | — | — |
| Follow up on own replied request (max 3) | ✅ | — | — | — |
| View help queue | ❌ | ✅ | ✅ | ✅ (read-only) |
| Claim, pass, reply, resolve help requests | ❌ | ✅ | ✅ | ❌ |
| View a student's code | ❌ | Only via a help request the student sent | Only via a help request the student sent | ✅ any |
| View replay of a session | ✅ (if enrolled) | ✅ | ✅ | ✅ |
| Notes / bookmarks | Own only | Own only | Own only | Read all |
| Export replay to GitHub | ✅ (own account) | ✅ | ✅ | — |
| View insights report, send Telegram digest | ❌ | ✅ view | ✅ view + send | ✅ view |
| **List users, change their roles** | ❌ | ❌ | ❌ | ✅ |
| Change own role | ❌ | ❌ | ❌ | ❌ |

---

## Validation Rules Summary

Each rule exists **twice**: a zod schema in `src/validators/` for the per-field form message, and a constraint or RPC guard so the rule holds even without the UI. The constraint is what the tests assert.

| Form / payload | Required | Rules | Backstop |
|---|---|---|---|
| Register | name, email, password, role choice | email format; password ≥ 8; role is Student or Educator | Supabase Auth + the trigger's allow-list (`prof`, else `student`) |
| Login | email, password | generic "Invalid email or password" | Supabase Auth (rate-limited by the platform) |
| Course | code, title, term, section | code uppercase A–Z0–9 | `unique (owner_id, code, term, section)` — per prof |
| Lesson | title, files, entry_file | 1–40 files; safe relative paths; no duplicate paths; `entry_file` exists; ≤ 200 KB | `files_valid()` + `octet_length` check + `entry_file_exists` constraint |
| Step edit | title | 1–120 chars; order unique and contiguous | deferred `unique (lesson_id, "order")` + `replace_steps` |
| GitHub import | repo URL | `https://github.com/<owner>/<repo>[/tree/<ref>/<dir>]`; only `.html/.css/.js/.json/.md` | `github-import` function |
| Start session | lesson_id | lesson `ready`, ≥ 1 step, caller is prof staff | `start_session` RPC |
| Join session | join_code | 6 chars; live session; caller is a member | `join_session` RPC |
| Checkpoint | step_id, files | step belongs to the lesson; session live | `save_checkpoint` RPC |
| Status update | done_step_order, error? | within 0…steps.length; message ≤ 300; no code frame in a build error | `student_status` policy + check; T-PRIV-09 |
| Help request | type, step_id, files | one active per type; seat required if in_person | partial unique index |
| Help reply | reply | 1–1000 chars; claiming staff only; appended to `thread` | `transition_help_request` |
| Help follow-up | message, files | 1–300 chars; own request; status `replied`; ≤ 3 follow-ups | `follow_up_help_request` + `follow_ups` check |
| Announcement | text | 1–200 chars; prof of the course; session live | `announce` RPC + `announcement` check |
| Note | kind, body | body ≤ 2000 | `check` constraint |
