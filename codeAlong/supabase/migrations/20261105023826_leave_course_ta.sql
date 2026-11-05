-- A TA can leave a course too (the course page). For a TA it's what the owner's "remove TA" does
-- (20261103074729_remove_course_staff.sql), done to themselves: their TA row goes, help requests
-- they had claimed here go back to the queue, and a 'ta' account that no longer TAs anywhere goes
-- back to 'student'. Their past replies stay. A student leaving is unchanged
-- (20261103083611_leave_course.sql): their own data in the course is deleted.
create or replace function public.leave_course(p_course_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
    if auth.uid() is null then
        raise exception 'UNAUTHENTICATED|Log in first' using errcode = 'P0001';
    end if;

    -- a TA of this course
    delete from public.course_staff
     where course_id = p_course_id and user_id = auth.uid() and role = 'ta';
    if found then
        update public.help_requests hr
           set status = 'open', claimed_by = null
          from public.sessions s
         where s.id = hr.session_id and s.course_id = p_course_id
           and hr.claimed_by = auth.uid() and hr.status = 'claimed';

        update public.profiles set role = 'student', updated_at = now()
         where id = auth.uid() and role = 'ta'
           and not exists (select 1 from public.course_staff where user_id = auth.uid());
        return;
    end if;

    -- a student of this course
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
