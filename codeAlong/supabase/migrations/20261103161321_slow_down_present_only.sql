-- "Slow down" counts only the students who are still here. A flag stays on its row until the
-- student takes it back, so a student who closed their tab or lost their connection kept
-- counting. Their heartbeat (student_status.last_seen_at, every 30 s while the tab is open) says
-- whether they're here, with the same window the dashboard uses for Idle: the class's
-- idleAfterSec (180 s by default). A flag from someone who hasn't been seen for longer stops
-- counting, and counts again if they come back. Still only a count: staff never learn who.
-- After the class ends nothing is "here", so an ended class keeps counting every flag.
create or replace function public.session_slow_down_count(sid uuid) returns bigint
language sql security definer stable set search_path = '' as $$
    select case
        when public.is_session_staff(sid) or public.is_admin()
        then (
            select count(*)
              from public.slow_down_flags f
              join public.sessions s on s.id = f.session_id
              left join public.student_status st
                     on st.session_id = f.session_id and st.student_id = f.student_id
             where f.session_id = sid
               and (s.status <> 'live'
                    or st.last_seen_at > now()
                       - make_interval(secs => coalesce((s.settings->>'idleAfterSec')::numeric, 180)))
        )
    end
$$;
