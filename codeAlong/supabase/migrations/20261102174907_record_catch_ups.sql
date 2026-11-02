-- Catch-ups count again in the report (design-docs/05 §10). "Load latest checkpoint" replaces
-- a student's code with the prof's, a strong "I'm stuck" signal, but since the catch-up redesign
-- (05 §7) nothing recorded it, so every report had catchUps = 0. Now the workspace adds 1 to the
-- student's student_status.catch_ups, and the trigger logs a 'catch_up' history row at the class's
-- current checkpoint. The report counts the students who did it at each checkpoint (once each,
-- however often they loaded it) and puts them back in the trouble score.
-- Counts only: the report still never says who.
--
-- Each checkpoint also gets its own slow-down peak (slowDownPeak): the most students asking to
-- slow down at once while it was the latest, so the prof can see which parts felt too fast.

-- a new kind of history row
alter table public.status_history drop constraint status_history_state_check;
alter table public.status_history add constraint status_history_state_check
    check (state in ('error', 'in_progress', 'done', 'catch_up'));

-- the status trigger also logs catch-ups. Its "only log a real change" check now skips
-- catch_up rows, or the next status change would look new and be logged twice
create or replace function public.record_status_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
    v_target int;
    v_state  text;
    v_key    text := new.error->>'key';
    v_last   public.status_history;
begin
    select s.checkpoint_seq into v_target from public.sessions s where s.id = new.session_id;
    v_state := public.tile_state(new.done_seq, new.error, v_target);

    select * into v_last from public.status_history h
     where h.session_id = new.session_id and h.student_id = new.student_id
       and h.state <> 'catch_up'
     order by h.at desc, h.id desc limit 1;

    if v_last.state is distinct from v_state
       or (v_state = 'error' and v_last.error_key is distinct from v_key) then
        insert into public.status_history (session_id, student_id, state, checkpoint_seq, error_key)
        values (new.session_id, new.student_id, v_state, v_target,
                case when v_state = 'error' then v_key end);
    end if;

    -- loaded the latest checkpoint: log which one it was
    if tg_op = 'UPDATE' and new.catch_ups > old.catch_ups then
        insert into public.status_history (session_id, student_id, state, checkpoint_seq)
        values (new.session_id, new.student_id, 'catch_up', v_target);
    end if;
    return null;
end $$;

drop trigger record_status_change on public.student_status;
create trigger record_status_change
    after insert or update of done_seq, error, catch_ups on public.student_status
    for each row execute function public.record_status_change();

-- the report counts them per checkpoint (the rest is unchanged from 20261101135315)
create or replace function public.build_session_report(p_session_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
    s           public.sessions;
    v_joined    int;
    v_enrolled  int;
    v_funnel    jsonb;
    v_errors    jsonb;
    v_peak      int;
begin
    select * into s from public.sessions where id = p_session_id;
    if not found then
        return;
    end if;

    -- attendance: everyone with a status row joined; enrolled is the course roll
    select count(*) into v_joined from public.student_status where session_id = s.id;
    select count(*) into v_enrolled from public.course_students where course_id = s.course_id;

    -- one entry per checkpoint. Done counts for the checkpoint that was the latest when the
    -- student clicked it, which is the checkpoint_seq on their 'done' history row.
    with slow as (
        -- how many were asking to slow down after each click, and when
        select e.at, sum(e.delta) over (order by e.id) as running
          from public.slow_down_events e
         where e.session_id = s.id
    ),
    cps as (
        -- each checkpoint is the latest from when it's saved until the next one
        select c.*, lead(c.created_at) over (order by c.seq) as until
          from public.checkpoints c
         where c.session_id = s.id
    ),
    first_done as (
        select h.checkpoint_seq as seq, h.student_id, min(h.at) as at
          from public.status_history h
         where h.session_id = s.id and h.state = 'done'
         group by 1, 2
    ),
    per as (
        select c.seq, c.title,
               (select count(*) from first_done d where d.seq = c.seq) as reached,
               (select count(distinct h.student_id) from public.status_history h
                 where h.session_id = s.id and h.state = 'error' and h.checkpoint_seq = c.seq) as err,
               (select percentile_cont(0.5) within group (
                           order by extract(epoch from d.at - c.created_at) / 60)
                  from first_done d where d.seq = c.seq) as median_min,
               (select count(*) from public.help_requests r
                 where r.session_id = s.id and r.checkpoint_seq = c.seq) as help,
               (select count(distinct h.student_id) from public.status_history h
                 where h.session_id = s.id and h.state = 'catch_up'
                   and h.checkpoint_seq = c.seq) as catch,
               -- the most at once while it was the latest: the level it started at (flags still
               -- up from before), or any higher one reached during it
               greatest(
                   coalesce((select r.running from slow r where r.at < c.created_at
                              order by r.at desc limit 1), 0),
                   coalesce((select max(r.running) from slow r where r.at >= c.created_at
                               and (c.until is null or r.at < c.until)), 0)
               ) as slow_peak
          from cps c
    ),
    funnel as (
        -- drop-off: Done on the previous checkpoint but not on this one (0 for the first)
        select per.*,
               greatest(coalesce(lag(reached) over (order by seq), reached) - reached, 0) as drop_off
          from per
    )
    select coalesce(jsonb_agg(jsonb_build_object(
               'seq', seq,
               'title', title,
               'reachedDone', reached,
               'dropOff', drop_off,
               'errorStudents', err,
               'medianMinutesToDone', round(median_min::numeric, 1),
               'catchUps', catch,
               'slowDownPeak', slow_peak,
               'helpRequests', help,
               -- trouble = (0.4 × errors + 0.3 × drop-off + 0.2 × catch-ups + 0.1 × help) / joined
               'trouble', round((0.4 * err + 0.3 * drop_off + 0.2 * catch + 0.1 * help)::numeric
                                / greatest(v_joined, 1), 3)
           ) order by seq), '[]'::jsonb)
      into v_funnel
      from funnel;

    -- the five mistakes the most students hit, and the checkpoint where they hit it most
    select coalesce(jsonb_agg(jsonb_build_object('key', key, 'students', students, 'seq', seq)
                              order by students desc, key), '[]'::jsonb)
      into v_errors
      from (
          select h.error_key as key,
                 count(distinct h.student_id) as students,
                 mode() within group (order by h.checkpoint_seq) as seq
            from public.status_history h
           where h.session_id = s.id and h.state = 'error' and h.error_key is not null
           group by h.error_key
           order by 2 desc, 1
           limit 5
      ) top;

    -- the most students asking to slow down at the same moment
    select coalesce(max(running), 0) into v_peak
      from (select sum(delta) over (order by id) as running
              from public.slow_down_events where session_id = s.id) x;

    insert into public.session_reports
        (session_id, course_id, lesson_id, attendance, checkpoints, top_errors, slow_down_peak, generated_at)
    values
        (s.id, s.course_id, s.lesson_id,
         jsonb_build_object('joined', v_joined, 'enrolled', v_enrolled),
         v_funnel, v_errors, v_peak, now())
    on conflict (session_id) do update set
        attendance     = excluded.attendance,
        checkpoints    = excluded.checkpoints,
        top_errors     = excluded.top_errors,
        slow_down_peak = excluded.slow_down_peak,
        generated_at   = excluded.generated_at;   -- a digest already sent is kept
end $$;
