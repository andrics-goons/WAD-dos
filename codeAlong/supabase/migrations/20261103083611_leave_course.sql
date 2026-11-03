-- A student leaves a course (the course page). Unlike the owner removing a student, which keeps
-- their class data for the reports, leaving deletes the student's own data in this course:
-- their code (autosaves and help snapshots), progress, Slow down flags, help requests and notes.
-- The classes themselves, the prof's checkpoints and the reports stay (the reports only hold
-- counts); the replays are the course's, so leaving takes away the student's access to them.
-- Other courses are untouched.
create function public.leave_course(p_course_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
    if auth.uid() is null then
        raise exception 'UNAUTHENTICATED|Log in first' using errcode = 'P0001';
    end if;
    if not exists (
        select 1 from public.course_students
         where course_id = p_course_id and user_id = auth.uid()
    ) then
        raise exception 'NOT_FOUND|You''re not enrolled in this course' using errcode = 'P0001';
    end if;

    -- help requests first: each points at the snapshot of the student's code that came with it
    delete from public.help_requests
     where student_id = auth.uid()
       and session_id in (select id from public.sessions where course_id = p_course_id);
    delete from public.snapshots
     where student_id = auth.uid()
       and session_id in (select id from public.sessions where course_id = p_course_id);
    delete from public.status_history
     where student_id = auth.uid()
       and session_id in (select id from public.sessions where course_id = p_course_id);
    delete from public.slow_down_flags
     where student_id = auth.uid()
       and session_id in (select id from public.sessions where course_id = p_course_id);
    delete from public.student_status
     where student_id = auth.uid()
       and session_id in (select id from public.sessions where course_id = p_course_id);
    delete from public.notes
     where user_id = auth.uid()
       and (session_id in (select id from public.sessions where course_id = p_course_id)
            or checkpoint_id in (
                select c.id from public.checkpoints c
                  join public.sessions s on s.id = c.session_id
                 where s.course_id = p_course_id));

    delete from public.course_students
     where course_id = p_course_id and user_id = auth.uid();
end $$;

revoke execute on function public.leave_course(uuid) from public, anon;
grant execute on function public.leave_course(uuid) to authenticated;
