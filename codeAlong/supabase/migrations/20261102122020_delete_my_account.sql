-- "Delete account" on the profile page: removes the caller's account and everything that would
-- otherwise block it. A prof's courses go too, with every lesson, class, replay and report in
-- them, for all their students (the page says so and asks them to type DELETE).
-- The tables below point at profiles without on delete cascade, so a class's history never
-- disappears by accident; this is the one place that clears them on purpose.
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
    v_uid uuid := auth.uid();
begin
    if v_uid is null then
        raise exception 'UNAUTHENTICATED|Log in first' using errcode = 'P0001';
    end if;

    -- a prof's courses, and every class, lesson and report in them
    delete from public.session_reports
     where course_id in (select id from public.courses where owner_id = v_uid);
    delete from public.sessions
     where started_by = v_uid
        or course_id in (select id from public.courses where owner_id = v_uid);
    delete from public.lessons where created_by = v_uid;
    delete from public.courses where owner_id = v_uid;

    -- their own part in other people's classes
    update public.help_requests set claimed_by = null where claimed_by = v_uid;
    delete from public.help_requests where student_id = v_uid;
    delete from public.snapshots where student_id = v_uid;
    delete from public.status_history where student_id = v_uid;
    delete from public.slow_down_flags where student_id = v_uid;
    delete from public.student_status where student_id = v_uid;

    -- the account: its profile, enrolments, staff roles and notes cascade from here
    delete from auth.users where id = v_uid;
end $$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
