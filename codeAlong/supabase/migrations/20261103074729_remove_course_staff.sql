-- The course owner removes a TA (the People tab). The opposite of add_course_staff:
--   - only a TA row, never the owner's own prof row
--   - help requests they had claimed in this course go back to the queue, so none are stuck
--   - a 'ta' account that no longer TAs anywhere goes back to 'student'
-- Their past replies and notes stay.
create function public.remove_course_staff(p_course_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
    if auth.uid() is null then
        raise exception 'UNAUTHENTICATED|Log in first' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.courses where id = p_course_id and owner_id = auth.uid()) then
        raise exception 'FORBIDDEN|Only the course owner can remove TAs' using errcode = 'P0001';
    end if;

    delete from public.course_staff
     where course_id = p_course_id and user_id = p_user_id and role = 'ta';
    if not found then
        raise exception 'NOT_FOUND|That person isn''t a TA in this course' using errcode = 'P0001';
    end if;

    update public.help_requests hr
       set status = 'open', claimed_by = null
      from public.sessions s
     where s.id = hr.session_id and s.course_id = p_course_id
       and hr.claimed_by = p_user_id and hr.status = 'claimed';

    update public.profiles set role = 'student', updated_at = now()
     where id = p_user_id and role = 'ta'
       and not exists (select 1 from public.course_staff where user_id = p_user_id);
end $$;

revoke execute on function public.remove_course_staff(uuid, uuid) from public, anon;
grant execute on function public.remove_course_staff(uuid, uuid) to authenticated;
