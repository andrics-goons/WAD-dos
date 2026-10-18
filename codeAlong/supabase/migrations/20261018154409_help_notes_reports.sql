-- The last layer: snapshots, help_requests, notes, session_reports, lost_events
--   + session_tiles.passed_steps, status_history.error_key
-- Spec: design-docs/03-data-model.md#snapshots-a-students-code
-- Order matters: tables → helpers → policies → views → triggers → Realtime
--
-- The RPCs that write these tables belong to their owners (see 09 §7) and come in their
-- own migrations: create/claim/transition/follow_up_help_request (Karin), autosave_patch
-- and catch_up (Ray Yien), and the end-session Edge Function writes session_reports.
-- Until then, tests insert rows with the service role.


-- Tables ------------------------------------

-- A student's code. Students only READ their snapshots: every write is an RPC, so a
-- snapshot sent to a TA can't be edited afterwards.
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
    updated_at  timestamptz not null default now()                  -- moves only for autosave
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
    -- the ONLY way staff can read a student's code; a trigger checks it is this
    -- student's own help_request snapshot from this session
    snapshot_id           uuid not null references public.snapshots(id),
    message               text check (char_length(message) <= 300),
    in_person             boolean not null default false,
    seat                  text check (char_length(seat) <= 20),
    status                text not null default 'open' check (
                              status in ('open', 'claimed', 'passed', 'replied', 'resolved', 'cancelled')
                          ),
    claimed_by            uuid references public.profiles(id),
    -- [{ role: 'staff' | 'student', author_id, body, at }], text only — never code
    thread                jsonb not null default '[]' check (
                              jsonb_typeof(thread) = 'array' and octet_length(thread::text) <= 50000
                          ),
    follow_ups            int not null default 0 check (follow_ups between 0 and 3),   -- MAX_FOLLOW_UPS
    telegram_notified_at  timestamptz,
    created_at            timestamptz not null default now(),       -- queue order; a follow-up keeps it
    updated_at            timestamptz not null default now(),
    constraint help_in_person_needs_seat
        check (not in_person or (type = 'help' and nullif(trim(seat), '') is not null)),
    constraint help_only_checks_pass check (status <> 'passed' or type = 'check'),
    constraint help_claimed_has_claimer check (status <> 'claimed' or claimed_by is not null)
);

create index help_requests_queue_idx on public.help_requests (session_id, status, created_at);
-- one active request per type per student: a second one is a 23505 → CONFLICT (T-HELP-06)
create unique index help_requests_one_active_idx on public.help_requests (session_id, student_id, type)
    where status in ('open', 'claimed');

-- lets a note's checkpoint be checked against the note's session
alter table public.checkpoints add constraint checkpoints_id_session_unique unique (id, session_id);

create table public.notes (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid not null default auth.uid() references public.profiles(id) on delete cascade,
    session_id     uuid not null references public.sessions(id) on delete cascade,
    checkpoint_id  uuid,                                             -- anchor in the replay
    kind           text not null check (kind in ('note', 'bookmark')),
    body           text check (char_length(body) <= 2000),
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),
    constraint notes_body_required check (kind = 'bookmark' or nullif(trim(body), '') is not null),
    -- the checkpoint must be from the same session (unchecked while checkpoint_id is null)
    constraint notes_checkpoint_fk foreign key (checkpoint_id, session_id)
        references public.checkpoints (id, session_id) on delete set null (checkpoint_id)
);

create index notes_user_session_idx on public.notes (user_id, session_id);
-- search() must use this exact expression to hit the index
create index notes_body_search_idx on public.notes using gin (to_tsvector('english', body));

-- lets a report's course and lesson be checked against its session
alter table public.sessions add constraint sessions_id_course_lesson_unique unique (id, course_id, lesson_id);

-- One per ended session, counts only — no student_id anywhere (T-INS-05).
-- Written by the end-session Edge Function with the service role.
create table public.session_reports (
    session_id    uuid primary key,
    course_id     uuid not null,                                     -- for cross-term trends
    lesson_id     uuid not null,
    attendance    jsonb not null,                                    -- { joined, enrolled }
    steps         jsonb not null default '[]',                       -- per-step funnel (05 §10)
    top_errors    jsonb not null default '[]',                       -- top 5, counts only
    lost_peak     int not null default 0 check (lost_peak >= 0),
    generated_at  timestamptz not null default now(),
    digest        jsonb,                                             -- { sentAt, recipients }
    constraint session_reports_session_fk foreign key (session_id, course_id, lesson_id)
        references public.sessions (id, course_id, lesson_id) on delete cascade
);

create index session_reports_course_lesson_idx on public.session_reports (course_id, lesson_id);

-- "I'm lost" over time, for lost_peak. lost_flags deletes a row when the student clears
-- it, so without this the peak would be gone by the end of class.
-- No student_id: each row is just +1 or -1 at a moment.
create table public.lost_events (
    id          bigint generated always as identity primary key,
    session_id  uuid not null references public.sessions(id) on delete cascade,
    delta       smallint not null check (delta in (1, -1)),
    at          timestamptz not null default now()
);

create index lost_events_session_idx on public.lost_events (session_id, id);

-- Error groups for the report's "top errors": student_status keeps only the latest error.
alter table public.status_history add column error_key text;


-- Helpers ------------------------------------

-- THE privacy rule: staff reach a snapshot only through a help request pointing at it.
-- security definer so the snapshots policy can look at help_requests without RLS.
create function public.is_sent_to_staff(snap uuid) returns boolean
language sql security definer stable set search_path = '' as $$
    select exists (
        select 1 from public.help_requests hr
        where hr.snapshot_id = snap and public.is_session_staff(hr.session_id)
    )
$$;

-- The most students lost at once: the count for staff and admins, null for anyone else.
create function public.session_lost_peak(sid uuid) returns bigint
language sql security definer stable set search_path = '' as $$
    select case
        when public.is_session_staff(sid) or public.is_admin()
        then (
            select coalesce(max(running), 0) from (
                select sum(delta) over (order by id) as running
                  from public.lost_events where session_id = sid
            ) x
        )
    end
$$;


-- Policies ------------------------------------

alter table public.snapshots       enable row level security;
alter table public.help_requests   enable row level security;
alter table public.notes           enable row level security;
alter table public.session_reports enable row level security;
alter table public.lost_events     enable row level security;

-- snapshots (writes only via autosave_patch, catch_up and the help RPCs)
create policy "student reads own snapshots" on public.snapshots
    for select using (student_id = auth.uid());

create policy "staff read sent snapshots" on public.snapshots
    for select using (public.is_sent_to_staff(id));

create policy "admin reads all" on public.snapshots
    for select using (public.is_admin());

-- help_requests (all writes via the help RPCs)
create policy "student reads own requests" on public.help_requests
    for select using (student_id = auth.uid());

create policy "staff read queue" on public.help_requests
    for select using (public.is_session_staff(session_id));

create policy "admin reads all" on public.help_requests
    for select using (public.is_admin());

-- notes: private to the author, and only on sessions they belong to
create policy "own notes" on public.notes
    for select using (user_id = auth.uid());

create policy "write own notes" on public.notes
    for insert with check (user_id = auth.uid() and public.is_session_member(session_id));

create policy "edit own notes" on public.notes
    for update using (user_id = auth.uid())
    with check (user_id = auth.uid() and public.is_session_member(session_id));

create policy "delete own notes" on public.notes
    for delete using (user_id = auth.uid());

create policy "admin reads all" on public.notes
    for select using (public.is_admin());

-- session_reports
create policy "staff read reports" on public.session_reports
    for select using (public.is_session_staff(session_id));

create policy "admin reads all" on public.session_reports
    for select using (public.is_admin());

-- lost_events: nobody but admins. Staff get session_lost_peak(); timestamps next to the
-- tile grid could hint at who tapped.
create policy "admin reads all" on public.lost_events
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

-- Only the autosave row changes. A before_catchup or help_request snapshot is a record of
-- what the student had at that moment, even for the RPCs that bypass RLS.
create function public.guard_snapshot_immutable() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    if old.reason <> 'autosave' or new.reason <> 'autosave' then
        raise exception 'CONFLICT|That snapshot is a saved record and can''t be changed'
            using errcode = 'P0001';
    end if;
    return new;
end $$;

create trigger guard_snapshot_immutable before update on public.snapshots
    for each row execute function public.guard_snapshot_immutable();

-- A help request may only expose the requester's own help_request snapshot from the same
-- session. Never their autosave row: that keeps changing, so staff would see live code.
create function public.check_help_snapshot() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    if not exists (
        select 1 from public.snapshots sn
         where sn.id = new.snapshot_id
           and sn.student_id = new.student_id
           and sn.session_id = new.session_id
           and sn.reason = 'help_request'
    ) then
        raise exception 'BAD_REQUEST|A help request must carry its own help snapshot'
            using errcode = 'P0001';
    end if;
    return new;
end $$;

create trigger check_help_snapshot
    before insert or update of snapshot_id, student_id, session_id on public.help_requests
    for each row execute function public.check_help_snapshot();

-- check_session_step (from the sessions migration) now also covers snapshots and help
-- requests: every table but sessions names its columns step_id / session_id.
create or replace function public.check_session_step() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
    -- through jsonb because the tables name their columns differently, and plpgsql
    -- errors on new.step_id for a sessions row even inside a branch that never runs
    r      jsonb := to_jsonb(new);
    v_step uuid  := (case tg_table_name when 'sessions' then r->>'current_step_id' else r->>'step_id' end)::uuid;
    v_sid  uuid  := (case tg_table_name when 'sessions' then r->>'id' else r->>'session_id' end)::uuid;
begin
    if v_step is not null and not exists (
        select 1 from public.steps st
          join public.sessions s on s.lesson_id = st.lesson_id
         where st.id = v_step and s.id = v_sid
    ) then
        raise exception 'BAD_REQUEST|That step belongs to a different lesson' using errcode = 'P0001';
    end if;
    return new;
end $$;

create trigger check_session_step before insert or update of step_id on public.snapshots
    for each row execute function public.check_session_step();

create trigger check_session_step before insert or update of step_id on public.help_requests
    for each row execute function public.check_session_step();

-- lost_events: +1 when a flag is raised, -1 when it's cleared
create function public.record_lost_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    if tg_op = 'INSERT' then
        insert into public.lost_events (session_id, delta) values (new.session_id, 1);
    -- skip when the session itself is being deleted: the event would point at nothing
    elsif exists (select 1 from public.sessions where id = old.session_id) then
        insert into public.lost_events (session_id, delta) values (old.session_id, -1);
    end if;
    return null;
end $$;

create trigger record_lost_event after insert or delete on public.lost_flags
    for each row execute function public.record_lost_event();

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
