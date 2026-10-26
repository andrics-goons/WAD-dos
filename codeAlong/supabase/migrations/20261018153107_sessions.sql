-- Sessions: sessions, checkpoints, student_status, slow_down_flags, status_history
--           + the session_tiles / session_summary views and the Realtime channel policy
-- Spec: design-docs/03-data-model.md#sessions
-- Order matters: helpers → tables → session helpers → RLS + policies → views → triggers
--                → Realtime
--
-- The session RPCs (start_session, join_session, save_checkpoint, end_session, announce,
-- catch_up) belong to their owners (see 09 §7) and come in their own migrations.
-- Until then, no client can create a session — tests insert them with the service role.


-- Helpers ------------------------------------

-- The prof's in-class toggles. Checked because the view casts idleAfterSec:
-- one bad value would break the dashboard for the whole class.
create function public.session_settings_valid(s jsonb) returns boolean
language sql immutable set search_path = '' as $$
    select case
        when s is null or jsonb_typeof(s) <> 'object' then false
        when jsonb_typeof(s->'allowCatchUp') is distinct from 'boolean' then false
        when jsonb_typeof(s->'hintsEnabled') is distinct from 'boolean' then false
        when jsonb_typeof(s->'idleAfterSec') is distinct from 'number' then false
        else (s->>'idleAfterSec')::numeric between 30 and 3600
    end
$$;

-- The classifier from 05 §4, minus idle (idle needs now(), so only the view can know it).
-- The view and the status_history triggers both call this, so there is one copy of the rule.
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


-- Tables ------------------------------------

create table public.sessions (
    id               uuid primary key default gen_random_uuid(),
    -- no cascade: a lesson or course with class history is archived, never deleted
    lesson_id        uuid not null references public.lessons(id),
    course_id        uuid not null references public.courses(id),
    started_by       uuid not null references public.profiles(id),
    join_code        text not null check (join_code ~ '^[A-Z0-9]{6}$'),
    status           text not null default 'live' check (status in ('live', 'ended')),
    current_step_id  uuid references public.steps(id),            -- step of the latest checkpoint
    settings         jsonb not null
                     default '{"allowCatchUp": true, "hintsEnabled": false, "idleAfterSec": 180}'
                     check (public.session_settings_valid(settings)),
    spotlight        jsonb check (spotlight is null or octet_length(spotlight::text) <= 20000),
    announcement     jsonb check (announcement is null
                                  or char_length(announcement->>'text') between 1 and 200),
    started_at       timestamptz not null default now(),
    ended_at         timestamptz
);

-- a code is reusable next term, but only one live class answers to it
create unique index sessions_live_join_code_idx on public.sessions (join_code) where status = 'live';
create index sessions_course_started_idx on public.sessions (course_id, started_at desc);
create index sessions_lesson_idx on public.sessions (lesson_id);

create table public.checkpoints (
    id          uuid primary key default gen_random_uuid(),
    session_id  uuid not null references public.sessions(id) on delete cascade,
    step_id     uuid not null references public.steps(id),
    seq         int not null check (seq >= 1),                    -- 1, 2, 3… in save order
    files       jsonb not null check (
                    public.files_valid(files) and octet_length(files::text) <= 200000
                ),
    files_hash  text generated always as (md5(files::text)) stored,
    note        text check (char_length(note) <= 500),
    created_by  uuid not null references public.profiles(id),
    created_at  timestamptz not null default now(),
    unique (session_id, seq)
);

-- Raw signals only. NO state column: the student's own browser writes this row, so a
-- stored state would be forgeable. session_tiles derives it.
-- NO slow-down column either: staff can read these rows (and receive them over Postgres
-- Changes), so "Slow down" lives in slow_down_flags, which they can't.
create table public.student_status (
    session_id       uuid not null references public.sessions(id) on delete cascade,
    student_id       uuid not null references public.profiles(id),
    done_step_order  int not null default 0 check (done_step_order >= 0),
    -- { source: 'runtime' | 'build', name, message, file, line, key, shapeKey, at }
    error            jsonb check (
                         error is null or (
                             jsonb_typeof(error) = 'object'
                             and coalesce(char_length(error->>'message'), 0) <= 300
                         )
                     ),
    checks           jsonb,                                       -- { passed, total } (COULD)
    catch_ups        int not null default 0 check (catch_ups >= 0),
    last_seen_at     timestamptz not null default now(),
    joined_at        timestamptz not null default now(),
    primary key (session_id, student_id)
);

-- One row = this student has tapped "Slow down" and not cleared it.
-- Readable only by its owner (and admins); staff only ever get the count.
create table public.slow_down_flags (
    session_id  uuid not null references public.sessions(id) on delete cascade,
    student_id  uuid not null references public.profiles(id),
    at          timestamptz not null default now(),
    primary key (session_id, student_id)
);

-- Append-only. Written by the triggers below whenever a student's derived state changes.
create table public.status_history (
    id          bigint generated always as identity primary key,
    session_id  uuid not null references public.sessions(id) on delete cascade,
    student_id  uuid not null references public.profiles(id),
    state       text not null check (state in ('error', 'behind', 'in_progress', 'done')),
    step_order  int not null,
    at          timestamptz not null default now()
);

create index status_history_student_idx on public.status_history (session_id, student_id, at);


-- Session helpers ------------------------------------
-- security definer so policies can look at sessions without RLS in the way

create function public.is_session_member(sid uuid) returns boolean
language sql security definer stable set search_path = '' as $$
    select coalesce(
        (select public.is_course_member(s.course_id) from public.sessions s where s.id = sid),
        false
    )
$$;

create function public.is_session_staff(sid uuid) returns boolean
language sql security definer stable set search_path = '' as $$
    select coalesce(
        (select public.is_course_staff(s.course_id) from public.sessions s where s.id = sid),
        false
    )
$$;

-- An enrolled student of this session's course, and the class is still running.
create function public.is_live_session_student(sid uuid) returns boolean
language sql security definer stable set search_path = '' as $$
    select exists (
        select 1 from public.sessions s
        where s.id = sid and s.status = 'live' and public.is_enrolled(s.course_id)
    )
$$;

-- "Slow down" as a number: the count for staff and admins, null for anyone else.
-- security definer because nobody but the student can read slow_down_flags rows.
create function public.session_slow_down_count(sid uuid) returns bigint
language sql security definer stable set search_path = '' as $$
    select case
        when public.is_session_staff(sid) or public.is_admin()
        then (select count(*) from public.slow_down_flags where session_id = sid)
    end
$$;


-- Policies ------------------------------------

alter table public.sessions       enable row level security;
alter table public.checkpoints    enable row level security;
alter table public.student_status enable row level security;
alter table public.slow_down_flags     enable row level security;
alter table public.status_history enable row level security;

-- sessions (inserts only via start_session; no deletes — class history is kept)
create policy "members read sessions" on public.sessions
    for select using (public.is_course_member(course_id));

create policy "prof updates sessions" on public.sessions
    for update using (public.is_course_prof(course_id))
    with check (public.is_course_prof(course_id));

create policy "admin reads all" on public.sessions
    for select using (public.is_admin());

-- checkpoints (inserts only via save_checkpoint: it allocates seq and broadcasts)
create policy "members read checkpoints" on public.checkpoints
    for select using (public.is_session_member(session_id));

create policy "admin reads all" on public.checkpoints
    for select using (public.is_admin());

-- student_status: a student writes ONLY their own row, only while the class is live.
-- No delete: the row is the attendance record.
create policy "student reads own status" on public.student_status
    for select using (student_id = auth.uid());

create policy "student creates own status" on public.student_status
    for insert with check (student_id = auth.uid() and public.is_live_session_student(session_id));

create policy "student updates own status" on public.student_status
    for update using (student_id = auth.uid())
    with check (student_id = auth.uid() and public.is_live_session_student(session_id));

create policy "staff read statuses" on public.student_status
    for select using (public.is_session_staff(session_id));

create policy "admin reads all" on public.student_status
    for select using (public.is_admin());

-- slow_down_flags: owner only. Raise = insert, clear = delete.
create policy "student reads own flag" on public.slow_down_flags
    for select using (student_id = auth.uid());

create policy "student raises flag" on public.slow_down_flags
    for insert with check (student_id = auth.uid() and public.is_live_session_student(session_id));

create policy "student clears flag" on public.slow_down_flags
    for delete using (student_id = auth.uid());

create policy "admin reads all" on public.slow_down_flags
    for select using (public.is_admin());

-- status_history (written only by triggers)
create policy "staff read history" on public.status_history
    for select using (public.is_session_staff(session_id));

create policy "admin reads all" on public.status_history
    for select using (public.is_admin());


-- Views ------------------------------------
-- security_invoker: the view runs with the CALLER's rights, so the policies above still
-- apply. Without it a view runs as its owner and would leak every session's rows.

-- The only thing the dashboard reads. target_order = the step of the latest checkpoint.
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

-- Counts for the summary bar. slow_down_count is a number, so no query staff can write
-- returns WHO asked to slow down (T-PRIV-04).
create view public.session_summary with (security_invoker = true) as
select
    session_id,
    count(*)                                        as total,
    count(*) filter (where state = 'done')          as done,
    count(*) filter (where state = 'in_progress')   as in_progress,
    count(*) filter (where state = 'error')         as error,
    count(*) filter (where state = 'behind')        as behind,
    count(*) filter (where state = 'idle')          as idle,
    public.session_slow_down_count(session_id)           as slow_down_count
from public.session_tiles
group by session_id;


-- Triggers ------------------------------------

-- status_history: append a row when a student's derived state changes.
-- Compared with their LAST HISTORY ROW, not OLD, so a heartbeat upsert that changes
-- nothing writes nothing.
create function public.record_status_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
    v_state text;
begin
    select public.tile_state(new.done_step_order, new.error, coalesce(st."order", 0))
      into v_state
      from public.sessions s
      left join public.steps st on st.id = s.current_step_id
     where s.id = new.session_id;

    if v_state is distinct from (
        select h.state from public.status_history h
         where h.session_id = new.session_id and h.student_id = new.student_id
         order by h.at desc, h.id desc limit 1
    ) then
        insert into public.status_history (session_id, student_id, state, step_order)
        values (new.session_id, new.student_id, v_state, new.done_step_order);
    end if;
    return null;
end $$;

create trigger record_status_change
    after insert or update of done_step_order, error on public.student_status
    for each row execute function public.record_status_change();

-- A new checkpoint moves the target step, which re-derives EVERY student's state without
-- any of them writing. Record those changes too, or history misses every "behind".
create function public.record_checkpoint_states() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
    v_target int;
begin
    select coalesce(max("order"), 0) into v_target from public.steps where id = new.current_step_id;

    insert into public.status_history (session_id, student_id, state, step_order)
    select ss.session_id, ss.student_id, x.state, ss.done_step_order
      from public.student_status ss
     cross join lateral (
         select public.tile_state(ss.done_step_order, ss.error, v_target) as state
     ) x
     where ss.session_id = new.id
       and x.state is distinct from (
           select h.state from public.status_history h
            where h.session_id = ss.session_id and h.student_id = ss.student_id
            order by h.at desc, h.id desc limit 1
       );
    return null;
end $$;

create trigger record_checkpoint_states
    after update of current_step_id on public.sessions
    for each row when (old.current_step_id is distinct from new.current_step_id)
    execute function public.record_checkpoint_states();

-- A lesson that has been taught keeps its history: it can't be deleted or moved to
-- another course. CONFLICT, so the UI can offer Archive instead.
create function public.guard_taught_lesson() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    if exists (select 1 from public.sessions where lesson_id = old.id) then
        if tg_op = 'DELETE' then
            raise exception 'CONFLICT|This lesson has been taught, so it can''t be deleted — archive it instead'
                using errcode = 'P0001';
        elsif new.course_id is distinct from old.course_id then
            raise exception 'CONFLICT|This lesson has been taught, so it can''t move to another course'
                using errcode = 'P0001';
        end if;
    end if;
    return case tg_op when 'DELETE' then old else new end;
end $$;

create trigger guard_taught_lesson before delete or update of course_id on public.lessons
    for each row execute function public.guard_taught_lesson();

-- Same for a course: deleting it would cascade into its lessons, so say so in course terms.
create function public.guard_taught_course() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    if exists (select 1 from public.sessions where course_id = old.id) then
        raise exception 'CONFLICT|This course has class history, so it can''t be deleted — archive it instead'
            using errcode = 'P0001';
    end if;
    return old;
end $$;

create trigger guard_taught_course before delete on public.courses
    for each row execute function public.guard_taught_course();

-- Once taught, a lesson's step numbers are history: done_step_order, status_history and
-- checkpoints all mean "step N". So steps can be reworded and added at the end, but not
-- removed or reordered. (replace_steps and delete_step hit this too.)
create function public.guard_taught_steps() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
    v_lesson uuid := case tg_op when 'DELETE' then old.lesson_id else new.lesson_id end;
begin
    if not exists (select 1 from public.sessions where lesson_id = v_lesson) then
        return case tg_op when 'DELETE' then old else new end;
    end if;

    if tg_op = 'DELETE' then
        raise exception 'CONFLICT|This lesson has been taught, so its steps can''t be removed'
            using errcode = 'P0001';
    elsif tg_op = 'UPDATE' and (new."order" is distinct from old."order"
                                or new.lesson_id is distinct from old.lesson_id) then
        raise exception 'CONFLICT|This lesson has been taught, so its steps can''t be reordered'
            using errcode = 'P0001';
    elsif tg_op = 'INSERT' and new."order" <= (
        select coalesce(max("order"), 0) from public.steps where lesson_id = v_lesson
    ) then
        raise exception 'CONFLICT|This lesson has been taught, so new steps can only go at the end'
            using errcode = 'P0001';
    end if;
    return new;
end $$;

create trigger guard_taught_steps before insert or delete or update of "order", lesson_id
    on public.steps
    for each row execute function public.guard_taught_steps();


-- Realtime ------------------------------------

-- Staff watch student_status over Postgres Changes (RLS applies to each subscriber).
alter publication supabase_realtime add table public.student_status;

-- Private channels are named session:<uuid>. Anything else, or a malformed id, is refused
-- rather than erroring on the uuid cast.
create function public.is_session_channel_member(topic text) returns boolean
language sql stable set search_path = '' as $$
    select case
        when topic ~ '^session:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.is_session_member(substr(topic, 9)::uuid)
        else false
    end
$$;

-- Members (and admins) receive broadcasts and presence on their session's channel.
create policy "members read session channel" on realtime.messages
    for select to authenticated
    using (public.is_session_channel_member(realtime.topic()) or public.is_admin());

-- Clients never broadcast — only RPCs and Edge Functions send — but tracking presence
-- is a write, so members may write presence and nothing else.
create policy "members track presence" on realtime.messages
    for insert to authenticated
    with check (extension = 'presence' and public.is_session_channel_member(realtime.topic()));
