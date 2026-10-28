-- Link a Telegram account: the profile page asks for a one-time code, the user sends it to
-- the bot as /start <code>, and telegram-webhook saves their chat id (T-TG-01).
-- Spec: design-docs/04-pages-routes-and-events.md ("Auth & profile")

-- Returns the link to open, e.g. https://t.me/TeleHelp123bot?start=1a2b3c4d5e6f. The code works
-- for 10 minutes, and asking again replaces it.
create function public.issue_telegram_link_code()
returns text
language plpgsql security definer set search_path = '' as $$
declare
    v_code text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
begin
    if auth.uid() is null then
        raise exception 'UNAUTHENTICATED|Log in first' using errcode = 'P0001';
    end if;

    update public.profiles
       set telegram_link_code = v_code,
           telegram_link_code_expires_at = now() + interval '10 minutes'
     where id = auth.uid();

    return 'https://t.me/TeleHelp123bot?start=' || v_code;
end $$;
