-- Class announcement: the prof posts a short notice that every student sees at the top of
-- their workspace. Stored as well as broadcast, so a student who joins or reconnects later
-- still sees it. Passing no text clears it.
-- Spec: design-docs/04-pages-routes-and-events.md ("announce"), 09-integration-contracts.md

create function public.announce(p_session_id uuid, p_text text default null)
returns public.sessions
language plpgsql security definer set search_path = '' as $$
declare
    s       public.sessions;
    v_text  text := nullif(trim(coalesce(p_text, '')), '');
    v_at    timestamptz := now();
begin
    if auth.uid() is null then
        raise exception 'UNAUTHENTICATED|Log in first' using errcode = 'P0001';
    end if;

    select * into s from public.sessions where id = p_session_id for update;
    if not found then
        raise exception 'NOT_FOUND|Class not found' using errcode = 'P0001';
    elsif not public.is_course_prof(s.course_id) then
        raise exception 'FORBIDDEN|Only the course prof can announce' using errcode = 'P0001';
    elsif s.status is distinct from 'live' then
        raise exception 'CONFLICT|This class has ended' using errcode = 'P0001';
    end if;

    -- the column's own check keeps it to 200 characters
    update public.sessions
       set announcement = case when v_text is null then null
                               else jsonb_build_object('text', v_text, 'at', v_at) end
     where id = s.id
    returning * into s;

    perform realtime.send(
        jsonb_build_object('sessionId', s.id, 'text', v_text, 'at', v_at),
        'session:announce', 'session:' || s.id, true
    );
    return s;
end $$;
