-- The bot is @TeleHelpbot. 20261026115559 was edited in place to say TeleHelp123bot after
-- some databases had already applied it, so they disagree; this sets every one to the real bot.
-- Same body as before, only the link changes.
create or replace function public.issue_telegram_link_code()
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

    return 'https://t.me/TeleHelpbot?start=' || v_code;
end $$;
