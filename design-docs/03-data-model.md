# CodeAlong — Data Model & Authorization (Supabase / Postgres)

## Entity Overview

Fourteen tables in Supabase Postgres, joined by `uuid` foreign keys. Owner of `supabase/migrations/*` (tables, constraints, indexes): **Dylan**. Owner of RLS policies and the derived views: **Ying Qi**. Others request changes by PR so the schema stays consistent.

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
| `path` | required, max 120, matches `^[\w\-./]+$`, no `..` |
| `language` | one of `html`, `css`, `js`, `vue`, `json`, `md` — `vue` is new: lessons are now SFC projects, and it selects the CodeMirror mode |
| `content` | required (may be empty) |

**Why 40 and not 20.** A bare Vite + Vue scaffold is already ~10 files before the student writes anything, and Mini Cart ships ~12. The old limit of 20 was sized for three hand-written files. The **byte** cap stays at 200 KB, because source files are a few KB each and that cap is what protects the egress budget — see [02](./02-tech-stack.md#the-egress-rule-free-tier-5-gbmonth).

**What is never in `files`.** The working tree in WebContainer also holds `node_modules/`, `dist/`, `.vite/` and the lockfile. `Limits.SYNC_IGNORE` excludes them from every write, so dependency bytes never reach Postgres. Autosave is an allowlist walk, not a tree walk.

Enforced by one reusable constraint helper plus a size cap:

```sql
create function public.files_valid(f jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(f) = 'array'
     and jsonb_array_length(f) between 1 and 40        -- Limits.MAX_FILES
     and not exists (
       select 1 from jsonb_array_elements(f) e
       where  e->>'path' is null
          or  length(e->>'path') > 120
          or  e->>'path' !~ '^[A-Za-z0-9_\-./]+$'
          or  e->>'path' like '%..%'
          or  e->>'language' not in ('html','css','js','vue','json','md')
          or  e->>'content' is null
     )
$$;

-- used as:  check (public.files_valid(files) and octet_length(files::text) <= 200000)
```

---

## profiles

One row per account, created by the `on_auth_user_created` trigger in [09](./09-integration-contracts.md#2-auth).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK → `auth.users(id)` on delete cascade | Same id as the auth user |
| `name` | `text not null check (char_length(name) between 2 and 60)` | Display name |
| `role` | `text not null default 'student' check (role in ('prof','ta','student'))` | Account type |
| `telegram_chat_id` | `text` | Set when the user links the bot |
| `telegram_link_code` | `text unique` | One-time code |
| `telegram_link_code_expires_at` | `timestamptz` | 10 minutes after issue |
| `created_at` / `updated_at` | `timestamptz default now()` | `updated_at` by trigger |

Email lives in `auth.users` — we never duplicate it.

```sql
alter table profiles enable row level security;

-- I can always read myself
create policy "read own profile" on profiles for select using (id = auth.uid());

-- names are visible to people I share a course with (needed for tiles and the help queue)
create policy "read coursemates" on profiles for select using (
  exists (select 1 from course_staff cs where cs.user_id = profiles.id and public.is_course_member(cs.course_id))
  or exists (select 1 from course_students st where st.user_id = profiles.id and public.is_course_staff(st.course_id))
);

-- I may edit my own name and Telegram fields, but NOT my role
create policy "update own profile" on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from profiles where id = auth.uid()));
```

> The `with check` clause on that last policy is what makes "there is no self-service path to `prof`" true. Promotion happens only inside `rpc('add_course_staff')`, which is `security definer`.

---

## courses

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK default `gen_random_uuid()` | |
| `code` | `text not null` | e.g. `IS216`, uppercase |
| `title` | `text not null check (char_length(title) <= 100)` | |
| `term` | `text not null` | e.g. `AY2026/27 T1` — lets insights compare terms |
| `section` | `text not null` | e.g. `G2` |
| `owner_id` | `uuid not null → profiles(id)` | The prof who created it |
| `enrol_code` | `text not null unique check (char_length(enrol_code) = 6)` | |
| `archived` | `boolean not null default false` | Archived courses are read-only |
| `created_at` | `timestamptz default now()` | |

**Indexes:** `unique (code, term, section)`; `unique (enrol_code)`.

### course_staff / course_students

| Table | Columns |
|---|---|
| `course_staff` | `course_id uuid → courses`, `user_id uuid → profiles`, `role text check (role in ('prof','ta'))`, `primary key (course_id, user_id)` |
| `course_students` | `course_id uuid → courses`, `user_id uuid → profiles`, `enrolled_at timestamptz default now()`, `primary key (course_id, user_id)` |

Both get an index on `(user_id)` so "my courses" is a single index scan.

```sql
alter table courses         enable row level security;
alter table course_staff    enable row level security;
alter table course_students enable row level security;

create policy "members read course" on courses for select
  using (public.is_course_member(id));

create policy "prof creates course" on courses for insert
  with check (owner_id = auth.uid() and public.current_role() = 'prof');

create policy "owner edits course" on courses for update using (owner_id = auth.uid());
create policy "owner deletes course" on courses for delete using (owner_id = auth.uid());

create policy "members read staff list" on course_staff for select
  using (public.is_course_member(course_id));
create policy "members read student list" on course_students for select
  using (public.is_course_staff(course_id) or user_id = auth.uid());
```

Writes to `course_staff` and `course_students` have **no** client policy — they happen only through `rpc('add_course_staff')` and `rpc('enrol_with_code')`. A student must be able to match an enrol code against a course they cannot yet read, which is exactly what `security definer` is for:

```sql
create function public.enrol_with_code(p_code text) returns courses
language plpgsql security definer set search_path = '' as $$
declare c public.courses;
begin
  select * into c from public.courses where enrol_code = upper(p_code) and archived = false;
  if not found then
    raise exception 'NOT_FOUND|No course with that code' using errcode = 'P0001';
  end if;
  insert into public.course_students (course_id, user_id) values (c.id, auth.uid())
    on conflict do nothing;
  return c;
end $$;
```

---

## lessons

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `course_id` | `uuid not null → courses` on delete cascade | |
| `title` | `text not null check (char_length(title) <= 100)` | e.g. "Week 6 · Mini Cart" |
| `week` | `int check (week between 1 and 13)` | For ordering in the library |
| `description` | `text check (char_length(description) <= 500)` | |
| `files` | `jsonb not null check (public.files_valid(files) and octet_length(files::text) <= 200000)` | Starter code with TODOs — a real Vite project, source files only |
| `files_hash` | `text generated always as (md5(files::text)) stored` | Cheap change check for the IndexedDB cache — the client selects this, not `files` |
| `entry_file` | `text not null` | `index.html` for the dev server; trigger checks it exists in `files` |
| `dev_command` | `text not null default 'pnpm dev'` | What WebContainer spawns; a lesson may also declare a second process |
| `source` | `jsonb` | `{ type: 'upload' \| 'github', repo, ref, dir }` |
| `status` | `text not null default 'draft' check (status in ('draft','ready','archived'))` | Only `ready` can start a session |
| `created_by` | `uuid not null → profiles` | |
| `created_at` / `updated_at` | `timestamptz` | |

**Indexes:** `(course_id, week)`.

## steps

Promoted from a sub-document, because four other tables point at a step.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | Referenced by checkpoints, statuses, help requests, notes |
| `lesson_id` | `uuid not null → lessons` on delete cascade | |
| `order` | `int not null check ("order" >= 1)` | 1-based; `unique (lesson_id, "order")` |
| `title` | `text not null check (char_length(title) <= 120)` | Defaults to the TODO text |
| `description` | `text check (char_length(description) <= 1000)` | |
| `todo_refs` | `jsonb default '[]'` | `[{ file, line }]` — one step can span files |
| `checks` | `jsonb default '[]'` | Automatic step checks (COULD) |

> `order` is a reserved word — always quote it as `"order"` in SQL. The API layer exposes it as `order` in camelCase JS.

```sql
alter table lessons enable row level security;
alter table steps   enable row level security;

create policy "members read lessons" on lessons for select
  using (public.is_course_member(course_id));
create policy "prof writes lessons" on lessons for all
  using (public.is_course_prof(course_id)) with check (public.is_course_prof(course_id));

-- Students see steps (that's their plan) but not files until a session starts;
-- the client selects columns explicitly and `lesson_files_for_member` gates the files.
create policy "members read steps" on steps for select using (
  exists (select 1 from lessons l where l.id = steps.lesson_id and public.is_course_member(l.course_id))
);
create policy "prof writes steps" on steps for all using (
  exists (select 1 from lessons l where l.id = steps.lesson_id and public.is_course_prof(l.course_id))
) with check (
  exists (select 1 from lessons l where l.id = steps.lesson_id and public.is_course_prof(l.course_id))
);
```

**Reordering** is one RPC so orders stay contiguous and unique inside a transaction:

```sql
create function public.replace_steps(p_lesson_id uuid, p_steps jsonb) returns setof public.steps
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_course_prof((select course_id from public.lessons where id = p_lesson_id)) then
    raise exception 'FORBIDDEN|Only the course prof can edit steps' using errcode = 'P0001';
  end if;
  delete from public.steps where lesson_id = p_lesson_id
    and id not in (select (e->>'id')::uuid from jsonb_array_elements(p_steps) e where e->>'id' is not null);
  -- upsert each incoming step with its new order (set-based, so no unique clash mid-way)
  …
  return query select * from public.steps where lesson_id = p_lesson_id order by "order";
end $$;
```

---

## sessions

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `lesson_id` | `uuid not null → lessons` | |
| `course_id` | `uuid not null → courses` | Denormalised so every policy is one hop |
| `started_by` | `uuid not null → profiles` | |
| `join_code` | `text not null check (char_length(join_code) = 6)` | From `JOIN_CODE_ALPHABET` |
| `status` | `text not null default 'live' check (status in ('live','ended'))` | |
| `current_step_id` | `uuid → steps` | Step of the latest checkpoint |
| `settings` | `jsonb not null default '{"allowCatchUp":true,"hintsEnabled":false,"idleAfterSec":180}'` | Prof toggles during class |
| `spotlight` | `jsonb` | Anonymised excerpt, or null |
| `announcement` | `jsonb check (announcement is null or char_length(announcement->>'text') between 1 and 200)` | `{ text, at }` — the prof's current class announcement, or null. Stored so late joiners and reconnecting students see it, not just whoever was subscribed at the moment it was sent. Written only by `rpc('announce')`, so the broadcast always accompanies the write |
| `started_at` | `timestamptz default now()` | |
| `ended_at` | `timestamptz` | |

**Indexes:** `unique (join_code) where status = 'live'` (partial); `(course_id, started_at desc)`; `(lesson_id)`.

```sql
create function public.is_session_member(sid uuid) returns boolean
language sql security definer stable set search_path = '' as $$
  select public.is_course_member((select course_id from public.sessions where id = sid))
$$;

alter table sessions enable row level security;
create policy "members read sessions" on sessions for select using (public.is_course_member(course_id));
create policy "prof updates sessions" on sessions for update using (public.is_course_prof(course_id));
```

`start_session`, `join_session` and `end_session` are RPCs — a client cannot be trusted to allocate a unique join code or decide its own role. Full bodies in [05-core-logic.md](./05-core-logic.md#3-session-lifecycle).

---

## checkpoints

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `session_id` | `uuid not null → sessions` on delete cascade | |
| `step_id` | `uuid not null → steps` | |
| `seq` | `int not null check (seq >= 1)` | 1, 2, 3… in save order |
| `files` | `jsonb not null check (public.files_valid(files) and octet_length(files::text) <= 200000)` | Full snapshot of the prof's code |
| `files_hash` | `text generated always as (md5(files::text)) stored` | Cache key; also how the client detects that `package.json` changed between checkpoints |
| `note` | `text check (char_length(note) <= 500)` | Shown in replay |
| `created_by` | `uuid not null → profiles` | |
| `created_at` | `timestamptz default now()` | |

**Indexes:** `unique (session_id, seq)`.

```sql
alter table checkpoints enable row level security;
create policy "members read checkpoints" on checkpoints for select using (public.is_session_member(session_id));
-- inserts only via rpc('save_checkpoint'): it allocates seq, sets current_step_id and broadcasts
```

> Two "Save checkpoint" clicks at once race for the same `seq`. The unique index rejects the second; the RPC retries once with a fresh `seq` inside the same transaction.

---

## student_status (latest state only — one row per student per session)

**There is no `state` column.** This is the deliberate difference from the Mongo design: the student's own client writes this row, so anything stored here is forgeable. Only raw signals are stored; the tile state is derived in `session_tiles`.

| Column | Type | Notes |
|---|---|---|
| `session_id` | `uuid not null → sessions` on delete cascade | `primary key (session_id, student_id)` |
| `student_id` | `uuid not null → profiles` | |
| `done_step_order` | `int not null default 0 check (done_step_order >= 0)` | Highest step marked Done |
| `error` | `jsonb` | `{ source: 'runtime' \| 'build', name, message, file, line, key, shapeKey, at }`, message ≤ 300. **Build errors have their code frame stripped before they get here** — see [05 §1](./05-core-logic.md#1-client-side-runtime-webcontainer) |
| `checks` | `jsonb` | `{ passed, total }` — only when automatic checks exist (COULD) |
| `lost` | `boolean not null default false` | **Readable only by its owner** |
| `catch_ups` | `int not null default 0` | Times the student loaded a checkpoint |
| `last_seen_at` | `timestamptz not null default now()` | Heartbeat or any event |
| `joined_at` | `timestamptz not null default now()` | Attendance for digests |

**Indexes:** `(session_id)`.

## status_history

Append-only; replaces the capped `stateHistory[]` array. Written by a trigger whenever the derived state changes.

| Column | Type |
|---|---|
| `id` | `bigint generated always as identity` PK |
| `session_id` | `uuid not null → sessions` on delete cascade |
| `student_id` | `uuid not null → profiles` |
| `state` | `text not null` |
| `step_order` | `int not null` |
| `at` | `timestamptz not null default now()` |

**Indexes:** `(session_id, student_id, at)`.

```sql
alter table student_status  enable row level security;
alter table status_history  enable row level security;

-- a student writes ONLY their own row, and only while the session is live
create policy "student writes own status" on student_status for all
  using  (student_id = auth.uid())
  with check (student_id = auth.uid()
              and (select status from sessions where id = session_id) = 'live');

-- staff read every status row in their session — but the table holds no code,
-- and `lost` is filtered out by the view they actually query
create policy "staff read statuses" on student_status for select
  using (public.is_course_staff((select course_id from sessions where id = session_id)));

create policy "staff read history" on status_history for select
  using (public.is_course_staff((select course_id from sessions where id = session_id)));
```

### Views: `session_tiles` and `session_summary`

`session_tiles` is the only thing the dashboard reads. It encodes the classifier from [05](./05-core-logic.md#4-status-classifier) in SQL, so the state cannot disagree with the rules:

```sql
create view public.session_tiles with (security_invoker = true) as
select
  ss.session_id,
  ss.student_id,
  p.name,
  coalesce(st."order", 0)                                       as target_order,
  ss.done_step_order                                            as step_order,
  ss.error->>'key'                                              as error_key,
  left(ss.error->>'message', 120)                               as error_preview,
  ss.checks,
  ss.last_seen_at,
  case
    when now() - ss.last_seen_at >
         make_interval(secs => (s.settings->>'idleAfterSec')::int) then 'idle'
    when ss.error is not null                                        then 'error'
    when coalesce(st."order", 0) = 0 then
         case when ss.done_step_order >= 1 then 'done' else 'in_progress' end
    when ss.done_step_order >= coalesce(st."order", 0)               then 'done'
    when ss.done_step_order  = coalesce(st."order", 0) - 1           then 'in_progress'
    else 'behind'
  end                                                           as state
from student_status ss
join sessions s  on s.id = ss.session_id
join profiles p  on p.id = ss.student_id
left join steps st on st.id = s.current_step_id;
```

`security_invoker = true` makes the view run with the caller's rights, so the RLS policies above still apply — **without it a view would leak every session's rows.**

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
  (select count(*) from student_status x
    where x.session_id = t.session_id and x.lost)  as lost_count
from session_tiles t group by session_id;
```

`lost_count` is an aggregate, so **no query a staff member can write returns who is lost.** That is the whole mechanism for T-PRIV-04.

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
- `before_catchup` and `help_request`: immutable, a new row each time.
- Staff read a snapshot **only** through the help request that references it.

**Indexes:** the partial unique above; `(session_id, student_id, reason, created_at desc)`.

```sql
alter table snapshots enable row level security;

create policy "own snapshots" on snapshots for all
  using (student_id = auth.uid()) with check (student_id = auth.uid());

-- THE privacy rule. Staff reach a snapshot only via a help request pointing at it.
create policy "staff read sent snapshots" on snapshots for select using (
  exists (
    select 1 from help_requests hr
    join sessions s on s.id = hr.session_id
    where hr.snapshot_id = snapshots.id
      and public.is_course_staff(s.course_id)
  )
);
```

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

```sql
alter table help_requests enable row level security;

create policy "student reads own requests" on help_requests for select using (student_id = auth.uid());
create policy "staff read queue" on help_requests for select
  using (public.is_course_staff((select course_id from sessions where id = session_id)));
-- all writes via rpc: create_help_request, claim_help_request, transition_help_request,
--                      follow_up_help_request
```

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

**Indexes:** `(user_id, session_id)`; GIN full-text on `to_tsvector('english', body)` for search.

```sql
alter table notes enable row level security;
create policy "own notes" on notes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
```

One policy, and T-PRIV-05 passes — a note belonging to someone else is not a 404 we have to remember to return, it simply isn't in the result set.

---

## session_reports

| Column | Type | Notes |
|---|---|---|
| `session_id` | `uuid` PK → `sessions` on delete cascade | One per ended session |
| `course_id`, `lesson_id` | `uuid` | For cross-term trends |
| `attendance` | `jsonb` | `{ joined, enrolled }` |
| `steps` | `jsonb` | Per-step funnel — see [05](./05-core-logic.md#10-insights-report) |
| `top_errors` | `jsonb` | Top 5, counts only |
| `lost_peak` | `int` | Max simultaneous "I'm lost" |
| `generated_at` | `timestamptz default now()` | |
| `digest` | `jsonb` | `{ sentAt, recipients }` — counts only |

Written by the `end-session` Edge Function (triggered by a Database Webhook when `sessions.status` becomes `ended`). The report page polls until the row exists.

```sql
alter table session_reports enable row level security;
create policy "staff read reports" on session_reports for select using (public.is_course_staff(course_id));
```

## test_outbox (local + test only)

When `EXTERNAL_APIS=mock`, Edge Functions append here instead of calling Telegram/GitHub. E2E tests assert against it, replacing the old `GET /api/__test__/outbox`.

| Column | Type |
|---|---|
| `id` | `bigint generated always as identity` PK |
| `channel` | `text` (`telegram` \| `github` \| `llm`) |
| `payload` | `jsonb` |
| `created_at` | `timestamptz default now()` |

Created in a migration guarded so it is never applied to the production project, and it has **no** select policy for `authenticated` — tests read it with the service role key.

---

## Delete Cascades

Handled by `on delete cascade` on the foreign keys, so there is no controller-side cascade to forget.

| Deleting | Also deletes |
|---|---|
| Course (owner prof only) | Its lessons → steps, sessions → everything under each session |
| Lesson | Blocked by a trigger if any session exists — archived instead, so replays keep working |
| Session (owner prof, ended only) | Checkpoints, statuses, history, snapshots, help requests, notes, report |
| Removing a student from a course | Their `course_students` row only; past statuses/snapshots stay for the report |

---

## Authorization Matrix

Unchanged as a specification — this is still the contract. What changed is *where* it is enforced: RLS policies and `security definer` RPCs rather than controller checks.

| Action | Student (enrolled) | TA (staff) | Prof (staff) |
|---|:---:|:---:|:---:|
| Register / log in / edit own profile / link Telegram | ✅ | ✅ | ✅ |
| Enrol in a course with `enrol_code` | ✅ | — | — |
| View course + lesson library | ✅ | ✅ | ✅ |
| **Create / edit / archive** course | ❌ | ❌ | ✅ (owner) |
| Add TA to course | ❌ | ❌ | ✅ (owner) |
| **Create / edit / delete** lesson, edit steps, import from GitHub | ❌ | ❌ | ✅ |
| Start / end a live session, save checkpoints, Spotlight | ❌ | ❌ | ✅ |
| Post / clear a class announcement | ❌ | ❌ | ✅ |
| Join a live session | ✅ | ✅ (as staff) | ✅ |
| Report own status, tap Done, toggle "I'm lost", autosave, catch up | ✅ | — | — |
| View class dashboard (tiles, counts, error groups) | ❌ | ✅ | ✅ |
| See which student tapped "I'm lost" | ❌ | ❌ | ❌ (nobody — it is an aggregate) |
| Send Check my work / Ask for help | ✅ | — | — |
| Follow up on own replied request (max 3) | ✅ | — | — |
| View help queue, claim, pass, reply, resolve | ❌ | ✅ | ✅ |
| View a student's code | ❌ | Only via a help request the student sent | Only via a help request the student sent |
| View replay of a session | ✅ (if enrolled) | ✅ | ✅ |
| Notes / bookmarks | Own only | Own only | Own only |
| Export replay to GitHub | ✅ (own account) | ✅ | ✅ |
| View insights report, send Telegram digest | ❌ | ✅ view | ✅ view + send |

---

## Validation Rules Summary

Each rule exists **twice**: a zod schema in `src/validators/` for the per-field form message, and a constraint or RPC guard so the rule holds even without the UI. The constraint is what the tests assert.

| Form / payload | Required | Rules | Backstop |
|---|---|---|---|
| Register | name, email, password | email format; password ≥ 8 | Supabase Auth |
| Login | email, password | generic "Invalid email or password" | Supabase Auth (rate-limited by the platform) |
| Course | code, title, term, section | code uppercase A–Z0–9 | `unique (code, term, section)` |
| Lesson | title, files, entry_file | 1–40 files; safe paths; `entry_file` exists; ≤ 200 KB | `files_valid()` + `octet_length` check + trigger |
| Step edit | title | order unique and contiguous | `unique (lesson_id, "order")` + `replace_steps` |
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
