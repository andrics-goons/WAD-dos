-- The last layer: snapshots, help_requests, notes, session_reports, slow_down_events
--   + session_tiles.passed_steps, status_history.error_key
-- Spec: design-docs/03-data-model.md#snapshots-a-students-code
-- Order matters: tables → helpers → policies → views → triggers → Realtime
--
-- The RPCs that write these tables belong to their owners (see 09 §7) and come in their
-- own migrations: create/claim/transition/follow_up_help_request (Karin), autosave_patch
-- and catch_up (Ray Yien), and the end-session Edge Function writes session_reports.
-- Until then, tests insert rows with the service role.


-- Tables ------------------------------------

-- A student's code. The student and their course's staff read it (staff need it to help
-- troubleshoot); classmates and other courses' staff never do. Every write is an RPC, so a
-- copy sent with a help request can't be edited afterwards.
create table public.snapshots (
    id          uuid primary key default gen_random_uuid(),
    session_id  uuid not null references public.sessions(id) on delete cascade,
    student_id  uuid not null references public.profiles(id),
    step_id     uuid references public.steps(id),                   -- step the student was on
    reason      text not null check (reason in ('autosave', 'before_catchup', 'help_request')),
    files       jsonb not null check (
                    public.files_valid(files) and octet_length(files::text) <= 200000
                ),
    files_hash  text generated always as (md5(files::text)) stored,
    created_at  timestamptz not null default now(),
    -- when the code was last saved: moves on every autosave, so staff can tell how fresh
    -- it is ("as of 10 s ago"). Help and catch-up copies never change, so it equals created_at.
    updated_at  timestamptz not null default now()
);

-- one autosave row per student per session; autosave_patch merges into it
create unique index snapshots_one_autosave_idx on public.snapshots (session_id, student_id)
    where reason = 'autosave';
create index snapshots_student_idx on public.snapshots (session_id, student_id, reason, created_at desc);

create table public.help_requests (
    id                    uuid primary key default gen_random_uuid(),
    session_id            uuid not null references public.sessions(id) on delete cascade,
    student_id            uuid not null references public.profiles(id),
    step_id               uuid not null references public.steps(id),
    type                  text not null check (type in ('check', 'help')),
    -- the copy of the student's code sent with this request (create_help_request saves it)
    snapshot_id           uuid not null references public.snapshots(id),
    message               text check (char_length(message) <= 300),
    in_person             boolean not null default false,
    seat                  text check (char_length(seat) <= 20),
    status                text not null default 'open' check (
                              status in ('open', 'claimed', 'passed', 'replied', 'resolved', 'cancelled')
                          ),
    claimed_by            uuid references public.profiles(id),
    -- [{ role: 'staff' | 'student', author_id, body, at }], text only — never code
    thread                jsonb not null default '[]',
    follow_ups            int not null default 0 check (follow_ups between 0 and 3),   -- MAX_FOLLOW_UPS
    telegram_notified_at  timestamptz,
    created_at            timestamptz not null default now(),       -- queue order; a follow-up keeps it
    updated_at            timestamptz not null default now(),
    constraint help_in_person_needs_seat
        check (not in_person or (type = 'help' and nullif(trim(seat), '') is not null))
);

create index help_requests_queue_idx on public.help_requests (session_id, status, created_at);
-- one active request per type per student: a second one is a 23505 → CONFLICT (T-HELP-06)
create unique index help_requests_one_active_idx on public.help_requests (session_id, student_id, type)
    where status in ('open', 'claimed');

create table public.notes (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid not null default auth.uid() references public.profiles(id) on delete cascade,
    session_id     uuid not null references public.sessions(id) on delete cascade,
    checkpoint_id  uuid references public.checkpoints(id),           -- anchor in the replay
    kind           text not null check (kind in ('note', 'bookmark')),
    body           text check (char_length(body) <= 2000),
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),
    constraint notes_body_required check (kind = 'bookmark' or nullif(trim(body), '') is not null)
);

create index notes_user_session_idx on public.notes (user_id, session_id);
-- search() must use this exact expression to hit the index
create index notes_body_search_idx on public.notes using gin (to_tsvector('english', body));

-- One per ended session, counts only — no student_id anywhere (T-INS-05).
-- Written by the end-session Edge Function with the service role.
create table public.session_reports (
    session_id    uuid primary key references public.sessions(id) on delete cascade,
    course_id     uuid not null references public.courses(id),       -- for cross-term trends
    lesson_id     uuid not null references public.lessons(id),
    attendance    jsonb not null,                                    -- { joined, enrolled }
    steps         jsonb not null default '[]',                       -- per-step funnel (05 §10)
    top_errors    jsonb not null default '[]',                       -- top 5, counts only
    slow_down_peak     int not null default 0 check (slow_down_peak >= 0),
    generated_at  timestamptz not null default now(),
    digest        jsonb                                              -- { sentAt, recipients }
);

create index session_reports_course_lesson_idx on public.session_reports (course_id, lesson_id);

-- "Slow down" requests over time, for slow_down_peak. slow_down_flags deletes a row when the student clears
-- it, so without this the peak would be gone by the end of class.
-- No student_id: each row is just +1 or -1 at a moment.
create table public.slow_down_events (
    id          bigint generated always as identity primary key,
    session_id  uuid not null references public.sessions(id) on delete cascade,
    delta       smallint not null check (delta in (1, -1)),
    at          timestamptz not null default now()
);

create index slow_down_events_session_idx on public.slow_down_events (session_id, id);

-- Error groups for the report's "top errors": student_status keeps only the latest error.
alter table public.status_history add column error_key text;


-- Helpers ------------------------------------

-- The most students asking to slow down at once: the count for staff and admins, null for anyone else.
create function public.session_slow_down_peak(sid uuid) returns bigint
language sql security definer stable set search_path = '' as $$
    select case
        when public.is_session_staff(sid) or public.is_admin()
        then (
            select coalesce(max(running), 0) from (
                select sum(delta) over (order by id) as running
                  from public.slow_down_events where session_id = sid
            ) x
        )
    end
$$;


-- Policies ------------------------------------

alter table public.snapshots       enable row level security;
alter table public.help_requests   enable row level security;
alter table public.notes           enable row level security;
alter table public.session_reports enable row level security;
alter table public.slow_down_events     enable row level security;

-- snapshots (writes only via autosave_patch, catch_up and the help RPCs)
create policy "student reads own snapshots" on public.snapshots
    for select using (student_id = auth.uid());

-- the prof and TAs read every student's code in their own courses, to help troubleshoot
create policy "staff read snapshots" on public.snapshots
    for select using (public.is_session_staff(session_id));

create policy "admin reads all" on public.snapshots
    for select using (public.is_admin());

-- help_requests (all writes via the help RPCs)
create policy "student reads own requests" on public.help_requests
    for select using (student_id = auth.uid());

create policy "staff read queue" on public.help_requests
    for select using (public.is_session_staff(session_id));

create policy "admin reads all" on public.help_requests
    for select using (public.is_admin());

-- notes: private to the author
create policy "own notes" on public.notes
    for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "admin reads all" on public.notes
    for select using (public.is_admin());

-- session_reports
create policy "staff read reports" on public.session_reports
    for select using (public.is_session_staff(session_id));

create policy "admin reads all" on public.session_reports
    for select using (public.is_admin());

-- slow_down_events: nobody but admins. Staff get session_slow_down_peak(); timestamps next to the
-- tile grid could hint at who tapped.
create policy "admin reads all" on public.slow_down_events
    for select using (public.is_admin());


-- Views ------------------------------------

-- session_tiles gains passed_steps: the step orders this student's checks were passed on.
-- create or replace can only ADD columns at the end, so everything before is unchanged.
create or replace view public.session_tiles with (security_invoker = true) as
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
    end                                  as state,
    array(
        select distinct ps."order"
          from public.help_requests hr
          join public.steps ps on ps.id = hr.step_id
         where hr.session_id = ss.session_id and hr.student_id = ss.student_id
           and hr.type = 'check' and hr.status = 'passed'
         order by ps."order"
    )                                    as passed_steps
from public.student_status ss
join public.sessions s on s.id = ss.session_id
join public.profiles p on p.id = ss.student_id
left join public.steps st on st.id = s.current_step_id;


-- Triggers ------------------------------------

create trigger set_updated_at before update on public.snapshots
    for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.help_requests
    for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.notes
    for each row execute function public.set_updated_at();

-- slow_down_events: +1 when a flag is raised, -1 when it's cleared
create function public.record_slow_down_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    if tg_op = 'INSERT' then
        insert into public.slow_down_events (session_id, delta) values (new.session_id, 1);
    -- skip when the session itself is being deleted: the event would point at nothing
    elsif exists (select 1 from public.sessions where id = old.session_id) then
        insert into public.slow_down_events (session_id, delta) values (old.session_id, -1);
    end if;
    return null;
end $$;

create trigger record_slow_down_event after insert or delete on public.slow_down_flags
    for each row execute function public.record_slow_down_event();

-- status_history now records the error key too, and a new row when the key changes
-- while the state stays 'error' (a different error is a different group in the report).
create or replace function public.record_status_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
    v_state text;
    v_key   text := new.error->>'key';
    v_last  public.status_history;
begin
    select public.tile_state(new.done_step_order, new.error, coalesce(st."order", 0))
      into v_state
      from public.sessions s
      left join public.steps st on st.id = s.current_step_id
     where s.id = new.session_id;

    select * into v_last from public.status_history h
     where h.session_id = new.session_id and h.student_id = new.student_id
     order by h.at desc, h.id desc limit 1;

    if v_last.state is distinct from v_state
       or (v_state = 'error' and v_last.error_key is distinct from v_key) then
        insert into public.status_history (session_id, student_id, state, step_order, error_key)
        values (new.session_id, new.student_id, v_state, new.done_step_order,
                case when v_state = 'error' then v_key end);
    end if;
    return null;
end $$;

create or replace function public.record_checkpoint_states() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
    v_target int;
begin
    select coalesce(max("order"), 0) into v_target from public.steps where id = new.current_step_id;

    insert into public.status_history (session_id, student_id, state, step_order, error_key)
    select ss.session_id, ss.student_id, x.state, ss.done_step_order,
           case when x.state = 'error' then ss.error->>'key' end
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


-- Realtime ------------------------------------

-- Staff watch the queue; a student watches their own requests (RLS applies per subscriber).
alter publication supabase_realtime add table public.help_requests;
