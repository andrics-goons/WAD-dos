-- Fix: check_session_step refused every session INSERTED with a current_step_id.
--
-- It looked the session up by id to find its lesson, but in a BEFORE INSERT trigger the
-- new session row doesn't exist yet, so the lookup found nothing and raised BAD_REQUEST.
-- (Updates worked, which is why no test caught it.) A sessions row carries its own
-- lesson_id, so use that; checkpoints, snapshots and help_requests still look theirs up.

create or replace function public.check_session_step() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
    -- through jsonb because the tables name their columns differently, and plpgsql
    -- errors on new.step_id for a sessions row even inside a branch that never runs
    r        jsonb := to_jsonb(new);
    v_step   uuid;
    v_lesson uuid;
begin
    if tg_table_name = 'sessions' then
        v_step   := (r->>'current_step_id')::uuid;
        v_lesson := (r->>'lesson_id')::uuid;
    else
        v_step := (r->>'step_id')::uuid;
        select s.lesson_id into v_lesson from public.sessions s where s.id = (r->>'session_id')::uuid;
    end if;

    if v_step is not null and not exists (
        select 1 from public.steps st where st.id = v_step and st.lesson_id = v_lesson
    ) then
        raise exception 'BAD_REQUEST|That step belongs to a different lesson' using errcode = 'P0001';
    end if;
    return new;
end $$;
