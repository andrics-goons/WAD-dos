-- A lesson has one live class at a time. Clicking Start class again (say the prof left the page
-- and came back) returns the class that's already live, instead of splitting the students
-- across two. Owner: Ying Qi. Spec: design-docs/04 "Key logic".

create or replace function public.start_session(p_lesson_id uuid) returns public.sessions
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

    -- "for update" makes a double-click wait, so the second click finds the class the first made
    select * into l from public.lessons where id = p_lesson_id for update;
    if not found then
        raise exception 'NOT_FOUND|Lesson not found' using errcode = 'P0001';
    elsif not public.is_course_prof(l.course_id) then
        raise exception 'FORBIDDEN|Only the course prof can start a class' using errcode = 'P0001';
    elsif l.status is distinct from 'ready' then
        raise exception 'CONFLICT|Mark the lesson ready first' using errcode = 'P0001';
    end if;

    -- already live: back to that class (the newest, if older data has more than one)
    select * into s from public.sessions
     where lesson_id = l.id and status = 'live'
     order by started_at desc
     limit 1;
    if found then
        return s;
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
