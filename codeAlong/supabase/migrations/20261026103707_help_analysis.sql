-- LLM analysis of "Ask for help" requests (Evan) · design-docs/05 §8a
--
-- When a student asks for help, the analyze-help Edge Function reads the code they chose to
-- send, asks the LLM why they're stuck, and stores the answer on the request. The prof's
-- dashboard reads it from here. Only help requests are analysed: that is the student opting in
-- to staff seeing their code (09 §5), so no other snapshot ever reaches the LLM.
--
-- The column inherits help_requests' policies: session staff and the requesting student read it,
-- and only the Edge Function (service role) writes it.

-- { summary, rootCause, category, stuckAt: { step, file, line }, confidence, model, analyzedAt }
-- or { status: 'failed', reason }
alter table public.help_requests
    add column analysis jsonb check (analysis is null or octet_length(analysis::text) <= 4000);

-- Same pattern as ping_in_person_help: the address and key come from Vault, and until they're
-- set the trigger does nothing. Fires on a new help request and on a follow-up (which swaps
-- in a new snapshot), never on the function's own write to `analysis`.
create function public.analyze_help_request() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
    v_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url');
    v_key text := (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key');
begin
    if v_url is null or v_key is null then
        return null; -- not set up in this environment
    end if;
    perform net.http_post(
        url     := v_url || '/functions/v1/analyze-help',
        body    := jsonb_build_object('requestId', new.id),
        headers := jsonb_build_object('Content-Type', 'application/json',
                                      'Authorization', 'Bearer ' || v_key)
    );
    return null;
end $$;

create trigger analyze_help_request
    after insert or update of snapshot_id on public.help_requests
    for each row when (new.type = 'help')
    execute function public.analyze_help_request();
