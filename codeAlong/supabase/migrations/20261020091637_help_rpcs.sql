-- Help RPCs: create, claim, transition and follow up on a help request
-- Spec: design-docs/03-data-model.md#help_requests, 05-core-logic.md §8
--
-- help_requests and snapshots have no insert/update policy, so these four functions are the
-- only way to write them. The table's own constraints and unique index are the backstop for
-- bad input (23514 / 23505, which mapError turns into VALIDATION_FAILED / CONFLICT).


-- Snapshot + request in one transaction: if the request is refused (e.g. a duplicate), the
-- snapshot rolls back with it.
create function public.create_help_request(
    p_session_id  uuid,
    p_type        text,
    p_files       jsonb,
    p_message     text default null,
    p_in_person   boolean default false,
    p_seat        text default null
) returns public.help_requests
language plpgsql security definer set search_path = '' as $$
declare
    s     public.sessions;
    snap  uuid;
    r     public.help_requests;
begin
    if auth.uid() is null then
        raise exception 'UNAUTHENTICATED|Log in first' using errcode = 'P0001';
    end if;
    -- not enrolled looks the same as not existing, so session ids can't be probed
    select * into s from public.sessions where id = p_session_id;
    if not found or not public.is_enrolled(s.course_id) then
        raise exception 'NOT_FOUND|That class wasn''t found' using errcode = 'P0001';
    end if;
    if s.status is distinct from 'live' then
        raise exception 'CONFLICT|This class has ended' using errcode = 'P0001';
    end if;
    insert into public.snapshots (session_id, student_id, reason, files)
    values (p_session_id, auth.uid(), 'help_request', p_files)
    returning id into snap;

    -- which checkpoint they were working towards: the class's latest, from the server, so
    -- the TA compares their code with what the prof had then
    insert into public.help_requests
        (session_id, student_id, checkpoint_seq, type, snapshot_id, message, in_person, seat)
    values
        (p_session_id, auth.uid(), s.checkpoint_seq, p_type, snap, p_message, p_in_person, p_seat)
    returning * into r;

    return r;
end $$;


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
        raise exception 'CONFLICT|Someone else is already on this one' using errcode = 'P0001';
    end if;

    return r;
end $$;


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
    if char_length(reply) > 1000 then
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
        if r.status is distinct from 'open' then
            raise exception 'BAD_REQUEST|Only a request nobody has claimed can be cancelled'
                using errcode = 'P0001';
        end if;
    else
        if not public.is_session_staff(r.session_id) then
            raise exception 'FORBIDDEN|Only staff can do that' using errcode = 'P0001';
        end if;
        if r.status is distinct from 'claimed' then
            raise exception 'BAD_REQUEST|Claim the request first' using errcode = 'P0001';
        end if;
        if r.claimed_by is distinct from auth.uid() then
            raise exception 'FORBIDDEN|Another TA has claimed this request' using errcode = 'P0001';
        end if;
        if p_to = 'passed' and r.type is distinct from 'check' then
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
begin
    if auth.uid() is null then
        raise exception 'UNAUTHENTICATED|Log in first' using errcode = 'P0001';
    end if;
    if nullif(trim(coalesce(p_message, '')), '') is null then
        raise exception 'VALIDATION_FAILED|Say what''s still not working' using errcode = 'P0001';
    end if;
    if char_length(p_message) > 300 then
        raise exception 'VALIDATION_FAILED|Keep your message under 300 characters' using errcode = 'P0001';
    end if;

    select * into r from public.help_requests where id = p_request_id for update;
    -- someone else's request looks the same as a missing one
    if not found or r.student_id is distinct from auth.uid() then
        raise exception 'FORBIDDEN|You can only follow up on your own request' using errcode = 'P0001';
    end if;
    if r.status is distinct from 'replied' then
        raise exception 'BAD_REQUEST|You can only follow up once the TA has replied'
            using errcode = 'P0001';
    end if;
    if r.follow_ups >= 3 then
        raise exception 'BAD_REQUEST|You''ve followed up 3 times — ask for in-person help instead'
            using errcode = 'P0001';
    end if;

    insert into public.snapshots (session_id, student_id, reason, files)
    values (r.session_id, r.student_id, 'help_request', p_files)
    returning id into snap;

    update public.help_requests hr
       set status      = 'open',
           claimed_by  = null,
           snapshot_id = snap,
           follow_ups  = hr.follow_ups + 1,
           thread      = hr.thread || jsonb_build_array(jsonb_build_object(
                             'role', 'student', 'author_id', auth.uid(), 'body', p_message, 'at', now()))
     where hr.id = p_request_id
    returning * into r;

    return r;
end $$;


-- In-person ping ------------------------------------
-- A new in-person request calls the telegram-notify Edge Function, which messages the
-- course's staff. pg_net sends it after the transaction commits, so creating the request
-- never waits on Telegram.
--
-- The function's address and the service-role key come from Vault, so no secret is in this
-- file. Set them once per environment (03-data-model.md, "In-person ping"); until then the
-- trigger does nothing.

create extension if not exists pg_net with schema extensions;

create function public.ping_in_person_help() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
    v_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url');
    v_key text := (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key');
begin
    if v_url is null or v_key is null then
        return null; -- not set up in this environment
    end if;
    perform net.http_post(
        url     := v_url || '/functions/v1/telegram-notify',
        body    := jsonb_build_object('requestId', new.id),
        headers := jsonb_build_object('Content-Type', 'application/json',
                                      'Authorization', 'Bearer ' || v_key)
    );
    return null;
end $$;

create trigger ping_in_person_help
    after insert on public.help_requests
    for each row when (new.in_person)
    execute function public.ping_in_person_help();
