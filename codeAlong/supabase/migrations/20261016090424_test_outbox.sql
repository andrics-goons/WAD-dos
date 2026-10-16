-- test_outbox: where Edge Functions write the messages they WOULD have sent
-- (Telegram, GitHub, LLM) when EXTERNAL_APIS=mock — local development and tests.
-- Tests read it back to check what was "sent", without touching anyone's phone.
-- Spec: design-docs/03-data-model.md#test_outbox-local--test-only
--
-- It is created in every environment, including production, on purpose: with RLS
-- on and no policies for ordinary users it is unreachable from the app, and with
-- EXTERNAL_APIS=live nothing ever writes to it.

create table public.test_outbox (
    id          bigint generated always as identity primary key,
    channel     text not null check (channel in ('telegram', 'github', 'llm')),
    payload     jsonb not null,                     -- the message that would have gone out
    created_at  timestamptz not null default now()
);

-- RLS on. No insert/update/delete policy at all: only the service-role key (the Edge
-- Functions writing, the test helpers reading) can touch it, because it bypasses RLS.
alter table public.test_outbox enable row level security;

-- Admins read every table (design-docs/09 §4), this one included.
create policy "admin reads all" on public.test_outbox
    for select using (public.is_admin());
