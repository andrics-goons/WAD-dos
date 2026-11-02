-- The end-of-class report (design-docs/05 §10).
-- When the prof ends a class, a trigger builds its session_reports row straight away from the
-- history the database already keeps: status_history (who clicked Done or hit an error, and when),
-- checkpoints, help_requests and slow_down_events. Counts only: no student id is written
-- (T-INS-05). Plus lesson_trends(), the "keeps tripping students up" list across a prof's own
-- past classes.
--
-- A new migration rather than an edit: the cloud project already has the earlier ones.


-- Build (or rebuild) one session's report ------------------------------------

create function public.build_session_report(p_session_id uuid) returns void
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
    with first_done as (
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
                 where r.session_id = s.id and r.checkpoint_seq = c.seq) as help
          from public.checkpoints c
         where c.session_id = s.id
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
               'catchUps', 0,          -- catch-up is client-only, so nothing counts it (05 §7)
               'helpRequests', help,
               -- trouble = (0.4 × errors + 0.3 × drop-off + 0.2 × catch-ups + 0.1 × help) / joined
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

-- only the trigger below builds reports; no client calls this directly
revoke execute on function public.build_session_report(uuid) from public, anon, authenticated;

-- Ending the class must never fail because of the report: an error here only skips it.
create function public.report_on_end() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    begin
        perform public.build_session_report(new.id);
    exception when others then
        raise warning 'session report for % not built: %', new.id, sqlerrm;
    end;
    return null;
end $$;

create trigger report_on_end
    after update of status on public.sessions
    for each row when (old.status = 'live' and new.status = 'ended')
    execute function public.report_on_end();


-- Recurring trouble across terms ------------------------------------

-- The checkpoints that were among a class's 3 most troublesome in at least two of the
-- caller's past classes of this lesson (or a same-titled lesson in a course with the same
-- code, e.g. last term's copy). Only the CALLER's own courses: one prof never sees another's.
-- Checkpoints are matched by title, since numbering differs between classes.
create function public.lesson_trends(p_lesson_id uuid)
returns table (title text, sessions int, of_sessions int, avg_drop_off numeric)
language sql security definer stable set search_path = '' as $$
    with lesson as (
        select l.id, lower(trim(l.title)) as title, c.code
          from public.lessons l
          join public.courses c on c.id = l.course_id
         where l.id = p_lesson_id
    ),
    mine as (
        select r.session_id, r.checkpoints
          from public.session_reports r
          join public.lessons l on l.id = r.lesson_id
          join public.courses c on c.id = r.course_id
          join lesson on true
         where c.owner_id = auth.uid()
           and (r.lesson_id = lesson.id
                or (lower(trim(l.title)) = lesson.title and c.code = lesson.code))
    ),
    ranked as (
        select m.session_id,
               lower(trim(cp->>'title')) as key,
               cp->>'title' as title,
               (cp->>'dropOff')::numeric as drop_off,
               row_number() over (partition by m.session_id
                                  order by (cp->>'trouble')::numeric desc, (cp->>'seq')::int) as rank
          from mine m, jsonb_array_elements(m.checkpoints) cp
         where nullif(trim(cp->>'title'), '') is not null
           and (cp->>'trouble')::numeric > 0
    )
    select min(title),
           count(distinct session_id)::int,
           (select count(*) from mine)::int,
           round(avg(drop_off), 1)
      from ranked
     where rank <= 3
     group by key
    having count(distinct session_id) >= 2
     order by 2 desc, 1
$$;
