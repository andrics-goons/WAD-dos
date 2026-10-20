-- Help RPCs: create, claim, transition and follow up on a help request
-- Spec: design-docs/03-data-model.md#help_requests, 05-core-logic.md §8
--
-- help_requests and snapshots have no insert/update policy, so these four functions are the
-- only way to write them. Each is security definer and does its own checks.
-- Failures are raised as 'CODE|message' with errcode P0001, which mapError turns into an AppError.


-- create_help_request ------------------------------------
-- Snapshot + request in one transaction: if the request is refused (e.g. a duplicate), the
-- snapshot rolls back with it, so no orphan snapshot is left behind.
create function public.create_help_request(
    p_session_id  uuid,
    p_step_id     uuid,
    p_type        text,
    p_files       jsonb,
    p_message     text default null,
    p_in_person   boolean default false,
    p_seat        text default null
) returns public.help_requests
language plpgsql security definer set search_path = '' as $$
declare
    sess  public.sessions;
    snap  uuid;
    r     public.help_requests;
    msg   text := nullif(trim(coalesce(p_message, '')), '');
    seat  text := nullif(trim(coalesce(p_seat, '')), '');
begin
    if auth.uid() is null then
        raise exception 'UNAUTHENTICATED|Log in first' using errcode = 'P0001';
    end if;
    if p_type is null or p_type not in ('check', 'help') then
        raise exception 'VALIDATION_FAILED|Pick Check my work or Ask for help' using errcode = 'P0001';
    end if;
    if p_files is null or jsonb_typeof(p_files) <> 'array' then
        raise exception 'VALIDATION_FAILED|Your code couldn''t be read' using errcode = 'P0001';
    end if;
    if msg is not null and char_length(msg) > 300 then
        raise exception 'VALIDATION_FAILED|Keep your message under 300 characters' using errcode = 'P0001';
    end if;
    if coalesce(p_in_person, false) then
        if p_type <> 'help' then
            raise exception 'BAD_REQUEST|Only Ask for help can be in person' using errcode = 'P0001';
        end if;
        if seat is null then
            raise exception 'VALIDATION_FAILED|Enter your seat so the TA can find you' using errcode = 'P0001';
        end if;
    else
        seat := null;
    end if;

    select * into sess from public.sessions where id = p_session_id;
    -- not enrolled looks the same as not existing, so session ids can't be probed
    if not found or not public.is_enrolled(sess.course_id) then
        raise exception 'NOT_FOUND|That class wasn''t found' using errcode = 'P0001';
    end if;
    -- checked here, not by a trigger: the step must belong to this class's lesson
    if p_step_id is null or not exists (
        select 1 from public.steps st where st.id = p_step_id and st.lesson_id = sess.lesson_id
    ) then
        raise exception 'BAD_REQUEST|That step belongs to a different lesson' using errcode = 'P0001';
    end if;

    begin
        insert into public.snapshots (session_id, student_id, step_id, reason, files)
        values (p_session_id, auth.uid(), p_step_id, 'help_request', p_files)
        returning id into snap;

        insert into public.help_requests
            (session_id, student_id, step_id, type, snapshot_id, message, in_person, seat)
        values
            (p_session_id, auth.uid(), p_step_id, p_type, snap, msg, coalesce(p_in_person, false), seat)
        returning * into r;
    exception when unique_violation then
        raise exception 'CONFLICT|You already have an open % request on this class', p_type
            using errcode = 'P0001';
    end;

    return r;
end $$;


-- claim_help_request ------------------------------------
-- open → claimed in one conditional update. Zero rows updated IS the conflict, so two TAs
-- can't take the same request.
create function public.claim_help_request(p_request_id uuid)
returns public.help_requests
language plpgsql security definer set search_path = '' as $$
declare r public.help_requests;
begin
    if auth.uid() is null then
        raise exception 'UNAUTHENTICATED|Log in first' using errcode = 'P0001';
    end if;

    update public.help_requests hr
       set status = 'claimed', claimed_by = auth.uid()
     where hr.id = p_request_id
       and hr.status = 'open'
       and public.is_session_staff(hr.session_id)
    returning * into r;

    if not found then
        -- tell "already taken" apart from "not yours to see"
        if exists (
            select 1 from public.help_requests hr
             where hr.id = p_request_id and public.is_session_staff(hr.session_id)
        ) then
            raise exception 'CONFLICT|Someone else is already on this one' using errcode = 'P0001';
        end if;
        raise exception 'NOT_FOUND|That request wasn''t found' using errcode = 'P0001';
    end if;
    return r;
end $$;


-- transition_help_request ------------------------------------
-- p_to is one of: open (release), passed, replied, resolved, cancelled.
-- Staff transitions need the caller to be the claiming TA; cancel is the student's, on open.
-- A reply is appended to thread, never overwritten, so it survives a follow-up.
create function public.transition_help_request(
    p_request_id  uuid,
    p_to          text,
    p_reply       text default null
) returns public.help_requests
language plpgsql security definer set search_path = '' as $$
declare
    r      public.help_requests;
    reply  text := nullif(trim(coalesce(p_reply, '')), '');
begin
    if auth.uid() is null then
        raise exception 'UNAUTHENTICATED|Log in first' using errcode = 'P0001';
    end if;
    if p_to is null or p_to not in ('open', 'passed', 'replied', 'resolved', 'cancelled') then
        raise exception 'VALIDATION_FAILED|Unknown action' using errcode = 'P0001';
    end if;
    if reply is not null and char_length(reply) > 1000 then
        raise exception 'VALIDATION_FAILED|Keep your reply under 1000 characters' using errcode = 'P0001';
    end if;

    -- lock the row so two simultaneous actions can't both pass the checks below
    select * into r from public.help_requests where id = p_request_id for update;
    if not found
       or not (r.student_id = auth.uid() or public.is_session_staff(r.session_id)) then
        raise exception 'NOT_FOUND|That request wasn''t found' using errcode = 'P0001';
    end if;

    if p_to = 'cancelled' then
        if r.student_id is distinct from auth.uid() then
            raise exception 'FORBIDDEN|Only the student can cancel their request' using errcode = 'P0001';
        end if;
        if r.status <> 'open' then
            raise exception 'BAD_REQUEST|Only a request nobody has claimed can be cancelled'
                using errcode = 'P0001';
        end if;
    else
        if not public.is_session_staff(r.session_id) then
            raise exception 'FORBIDDEN|Only staff can do that' using errcode = 'P0001';
        end if;
        if r.status <> 'claimed' then
            raise exception 'BAD_REQUEST|Claim the request first' using errcode = 'P0001';
        end if;
        if r.claimed_by is distinct from auth.uid() then
            raise exception 'FORBIDDEN|Another TA has claimed this request' using errcode = 'P0001';
        end if;
        if p_to = 'passed' and r.type <> 'check' then
            raise exception 'BAD_REQUEST|Only a Check my work request can be passed' using errcode = 'P0001';
        end if;
        if p_to = 'replied' and reply is null then
            raise exception 'VALIDATION_FAILED|Write a reply first' using errcode = 'P0001';
        end if;
    end if;

    update public.help_requests hr
       set status     = p_to,
           claimed_by = case when p_to = 'open' then null else hr.claimed_by end,
           thread     = case when reply is null then hr.thread
                             else hr.thread || jsonb_build_array(jsonb_build_object(
                                      'role', case when p_to = 'cancelled' then 'student' else 'staff' end,
                                      'author_id', auth.uid(),
                                      'body', reply,
                                      'at', now()))
                        end
     where hr.id = p_request_id
    returning * into r;

    return r;
end $$;


-- follow_up_help_request ------------------------------------
-- replied → open on the SAME request: a fresh snapshot of the student's current code, the
-- message appended to thread, claimed_by cleared, created_at untouched (original queue place).
create function public.follow_up_help_request(
    p_request_id  uuid,
    p_message     text,
    p_files       jsonb
) returns public.help_requests
language plpgsql security definer set search_path = '' as $$
declare
    r     public.help_requests;
    snap  uuid;
    msg   text := nullif(trim(coalesce(p_message, '')), '');
begin
    if auth.uid() is null then
        raise exception 'UNAUTHENTICATED|Log in first' using errcode = 'P0001';
    end if;
    if msg is null or char_length(msg) > 300 then
        raise exception 'VALIDATION_FAILED|Say what''s still wrong, in under 300 characters'
            using errcode = 'P0001';
    end if;
    if p_files is null or jsonb_typeof(p_files) <> 'array' then
        raise exception 'VALIDATION_FAILED|Your code couldn''t be read' using errcode = 'P0001';
    end if;

    select * into r from public.help_requests where id = p_request_id for update;
    -- someone else's request looks the same as a missing one
    if not found or r.student_id is distinct from auth.uid() then
        raise exception 'FORBIDDEN|You can only follow up on your own request' using errcode = 'P0001';
    end if;
    if r.status <> 'replied' then
        raise exception 'BAD_REQUEST|You can only follow up once the TA has replied'
            using errcode = 'P0001';
    end if;
    if r.follow_ups >= 3 then
        raise exception 'BAD_REQUEST|You''ve followed up 3 times — ask for in-person help instead'
            using errcode = 'P0001';
    end if;
    begin
        insert into public.snapshots (session_id, student_id, step_id, reason, files)
        values (r.session_id, r.student_id, r.step_id, 'help_request', p_files)
        returning id into snap;

        update public.help_requests hr
           set status      = 'open',
               claimed_by  = null,
               snapshot_id = snap,
               follow_ups  = hr.follow_ups + 1,
               thread      = hr.thread || jsonb_build_array(jsonb_build_object(
                                 'role', 'student', 'author_id', auth.uid(), 'body', msg, 'at', now()))
         where hr.id = p_request_id
        returning * into r;
    exception when unique_violation then
        -- they opened another request of the same type while waiting for this reply
        raise exception 'CONFLICT|You already have an open % request on this class', r.type
            using errcode = 'P0001';
    end;

    return r;
end $$;


-- Grants ------------------------------------
-- Only signed-in users call these; anon gets a permission error instead of reaching the body.
revoke execute on function public.create_help_request(uuid, uuid, text, jsonb, text, boolean, text)
    from public, anon;
revoke execute on function public.claim_help_request(uuid) from public, anon;
revoke execute on function public.transition_help_request(uuid, text, text) from public, anon;
revoke execute on function public.follow_up_help_request(uuid, text, jsonb) from public, anon;
grant execute on function public.create_help_request(uuid, uuid, text, jsonb, text, boolean, text)
    to authenticated;
grant execute on function public.claim_help_request(uuid) to authenticated;
grant execute on function public.transition_help_request(uuid, text, text) to authenticated;
grant execute on function public.follow_up_help_request(uuid, text, jsonb) to authenticated;
