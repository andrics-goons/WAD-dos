-- Live session engine: start a class, join it, save checkpoints, end it.
-- Owner: Ying Qi. Spec: design-docs/04 "Key logic", 05 §3, 09 §7.
-- Every write goes through these functions, so the browser can't fake a role, code or seq.


-- Join codes ------------------------------------

-- 6 characters with no 0/O or 1/I/L. Same rule as shared/join-code.js:
-- bytes 248–255 are skipped so every letter is equally likely.
create function public.gen_join_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
    alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    result text := '';
    b int;
begin
    while length(result) < 6 loop
        b := get_byte(extensions.gen_random_bytes(1), 0);
        if b < 248 then
            result := result || substr(alphabet, (b % 31) + 1, 1);
        end if;
    end loop;
    return result;
end $$;

-- only start_session uses it
revoke execute on function public.gen_join_code() from public, anon, authenticated;


-- Start a class ------------------------------------

-- The course prof starts a ready lesson with a fresh join code.
-- A code is only "taken" while its class is live — codes from ended classes can be reused.
create function public.start_session(p_lesson_id uuid) returns public.sessions
language plpgsql security definer set search_path = '' as $$
declare
    l public.lessons;
    s public.sessions;
    v_code text;
    tries int := 0;
begin
    if auth.uid() is null then
        raise exception 'UNAUTHENTICATED|Log in first' using errcode = 'P0001';
    end if;

    select * into l from public.lessons where id = p_lesson_id;
    if not found then
        raise exception 'NOT_FOUND|Lesson not found' using errcode = 'P0001';
    elsif not public.is_course_prof(l.course_id) then
        raise exception 'FORBIDDEN|Only the course prof can start a class' using errcode = 'P0001';
    elsif l.status is distinct from 'ready'
          or not exists (select 1 from public.steps where lesson_id = l.id) then
        raise exception 'CONFLICT|Mark the lesson ready and add at least one step first'
            using errcode = 'P0001';
    end if;

    loop
        tries := tries + 1;
        v_code := public.gen_join_code();

        -- skip codes a live class is already using
        if not exists (select 1 from public.sessions where join_code = v_code and status = 'live') then
            begin
                insert into public.sessions (lesson_id, course_id, started_by, join_code)
                values (l.id, l.course_id, auth.uid(), v_code)
                returning * into s;
                exit;
            exception when unique_violation then
                null;   -- another class grabbed the same code at the same moment: try another
            end;
        end if;

        if tries >= 5 then
            raise exception 'CONFLICT|Couldn''t find a free join code — please try again'
                using errcode = 'P0001';
        end if;
    end loop;

    return s;
end $$;


-- Join a class ------------------------------------

-- Finds the live class for a code and tells the caller whether they're staff or a student.
create function public.join_session(p_join_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    s public.sessions;
    v_role text;
begin
    if auth.uid() is null then
        raise exception 'UNAUTHENTICATED|Log in first' using errcode = 'P0001';
    end if;

    -- exact match: the join page only lets students type capital letters and allowed digits
    select * into s from public.sessions where join_code = p_join_code and status = 'live';
    if not found then
        raise exception 'NOT_FOUND|No live class with that code' using errcode = 'P0001';
    end if;

    v_role := case
        when public.is_course_staff(s.course_id) then 'staff'
        when public.is_enrolled(s.course_id) then 'student'
    end;
    if v_role is null then
        raise exception 'FORBIDDEN|You''re not in this course' using errcode = 'P0001';
    end if;

    return jsonb_build_object('session_id', s.id, 'role', v_role);
end $$;


-- Save a checkpoint ------------------------------------

-- The prof saves their code for a step. Numbers it, moves the class to that step,
-- and tells every student straight away.
create function public.save_checkpoint(
    p_session_id uuid, p_step_id uuid, p_files jsonb, p_note text default null
) returns public.checkpoints
language plpgsql security definer set search_path = '' as $$
declare
    s public.sessions;
    st public.steps;
    c public.checkpoints;
begin
    if auth.uid() is null then
        raise exception 'UNAUTHENTICATED|Log in first' using errcode = 'P0001';
    end if;

    -- "for update" makes two quick saves wait for each other, so they can't get the same seq
    select * into s from public.sessions where id = p_session_id for update;
    if not found then
        raise exception 'NOT_FOUND|Class not found' using errcode = 'P0001';
    elsif not public.is_course_prof(s.course_id) then
        raise exception 'FORBIDDEN|Only the course prof can save checkpoints' using errcode = 'P0001';
    elsif s.status is distinct from 'live' then
        raise exception 'CONFLICT|This class has ended' using errcode = 'P0001';
    end if;

    select * into st from public.steps where id = p_step_id and lesson_id = s.lesson_id;
    if not found then
        raise exception 'BAD_REQUEST|That step isn''t part of this lesson' using errcode = 'P0001';
    end if;

    insert into public.checkpoints (session_id, step_id, seq, files, note, created_by)
    values (
        s.id, st.id,
        (select coalesce(max(seq), 0) + 1 from public.checkpoints where session_id = s.id),
        p_files, p_note, auth.uid()
    )
    returning * into c;

    update public.sessions set current_step_id = st.id where id = s.id;

    -- the files aren't sent: students fetch them by checkpointId only if they load it,
    -- and filesHash lets them skip the download if they already have that version
    perform realtime.send(
        jsonb_build_object(
            'sessionId', s.id, 'checkpointId', c.id, 'seq', c.seq, 'stepId', st.id,
            'stepOrder', st."order", 'title', st.title, 'filesHash', c.files_hash,
            'createdAt', c.created_at
        ),
        'checkpoint:new', 'session:' || s.id, true
    );
    return c;
end $$;


-- End a class ------------------------------------

create function public.end_session(p_session_id uuid) returns public.sessions
language plpgsql security definer set search_path = '' as $$
declare
    s public.sessions;
begin
    if auth.uid() is null then
        raise exception 'UNAUTHENTICATED|Log in first' using errcode = 'P0001';
    end if;

    select * into s from public.sessions where id = p_session_id for update;
    if not found then
        raise exception 'NOT_FOUND|Class not found' using errcode = 'P0001';
    elsif not public.is_course_prof(s.course_id) then
        raise exception 'FORBIDDEN|Only the course prof can end a class' using errcode = 'P0001';
    elsif s.status is distinct from 'live' then
        raise exception 'CONFLICT|This class has already ended' using errcode = 'P0001';
    end if;

    update public.sessions set status = 'ended', ended_at = now()
     where id = s.id
    returning * into s;

    -- the browser adds its own site address in front of replayUrl
    perform realtime.send(
        jsonb_build_object('sessionId', s.id, 'replayUrl', '/replays/' || s.id),
        'session:ended', 'session:' || s.id, true
    );
    return s;
end $$;


-- Settings broadcast ------------------------------------

-- The prof changes settings with a normal update; this tells every student straight away.
create function public.broadcast_session_settings() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    perform realtime.send(
        jsonb_build_object(
            'sessionId', new.id,
            'allowCatchUp', (new.settings->>'allowCatchUp')::boolean,
            'hintsEnabled', (new.settings->>'hintsEnabled')::boolean
        ),
        'session:settings', 'session:' || new.id, true
    );
    return null;
end $$;

create trigger broadcast_session_settings
    after update of settings on public.sessions
    for each row when (old.settings is distinct from new.settings)
    execute function public.broadcast_session_settings();
