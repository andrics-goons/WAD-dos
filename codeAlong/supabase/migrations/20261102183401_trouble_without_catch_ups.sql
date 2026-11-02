-- The trouble score goes back to the formula from 20261101135315_session_report.sql:
-- (0.4 × errors + 0.3 × drop-off + 0.1 × help) / joined, without the catch-ups term that
-- 20261102174907_record_catch_ups.sql added. The digest and lesson_trends rank checkpoints by
-- this score, so it stays exactly as their owners built it. Catch-ups are still counted per
-- checkpoint (catchUps), which the report page uses on its own.

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
               -- trouble = (0.4 × errors + 0.3 × drop-off + 0.1 × help) / joined
               'trouble', round((0.4 * err + 0.3 * drop_off + 0.1 * help)::numeric
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
