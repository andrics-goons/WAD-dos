create table public.profiles (
    id          uuid primary key references auth.users(id) on delete cascade,
    name        text not null check (char_length(name) between 2 and 60),
    role        text not null default 'student' check (role in ('prof','ta','student')),
    telegram_chat_id               text,
    telegram_link_code             text unique,
    telegram_link_code_expires_at  timestamptz,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "read own profile" on public.profiles
    for select using (id = auth.uid());

-- can edit own row but cant change role
create policy "update own profile" on public.profiles
    for update using (id = auth.uid())
    with check (id = auth.uid()
        and role = (select role from public.profiles where id = auth.uid()));

-- default new users profiles to student
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    insert into public.profiles (id, name)
    values (new.id, coalesce(new.raw_user_meta_data->>'name', 'Student'));
    return new;
end $$;

create trigger on_auth_user_created
    after insert on auth.users for each row execute function public.handle_new_user();
