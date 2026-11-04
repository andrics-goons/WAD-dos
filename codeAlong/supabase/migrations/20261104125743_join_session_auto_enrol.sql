-- Joining a live class with its code also enrols a student who isn't in the course yet,
-- so the code on the projector is all they need. The same people enrol_with_code lets in:
-- students and TAs (a TA in one course can be a student in another), not profs or admins,
-- and not into an archived course. Staff of the course still join as staff.
create or replace function public.join_session(p_join_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    s public.sessions;
    v_role text;
begin
    if auth.uid() is null then
        raise exception 'UNAUTHENTICATED|Log in first' using errcode = 'P0001';
    end if;

    -- "cart42" or " CART42" from a link or a paste still finds CART42
    select * into s from public.sessions
     where join_code = upper(trim(p_join_code)) and status = 'live';
    if not found then
        raise exception 'NOT_FOUND|No live class with that code' using errcode = 'P0001';
    end if;

    v_role := case
        when public.is_course_staff(s.course_id) then 'staff'
        when public.is_enrolled(s.course_id) then 'student'
    end;

    if v_role is null
       and coalesce(public.app_role(), '') in ('student', 'ta')
       and exists (select 1 from public.courses where id = s.course_id and not archived) then
        insert into public.course_students (course_id, user_id) values (s.course_id, auth.uid())
            on conflict do nothing;
        v_role := 'student';
    end if;

    if v_role is null then
        raise exception 'FORBIDDEN|You''re not in this course' using errcode = 'P0001';
    end if;

    return jsonb_build_object('session_id', s.id, 'role', v_role);
end $$;
