create table public.profiles (
    id          uuid primary key references auth.users(id) on delete cascade,
    name        text not null check (char_length(name) between 2 and 60),
    role        text not null default 'student' check (role in ('prof','ta','student','admin')),
    telegram_chat_id               text,
    telegram_link_code             text unique,
    telegram_link_code_expires_at  timestamptz,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Helper functions ------------------------------------

create function public.app_role() returns text
language sql security definer stable set search_path = '' as $$
    select role from public.profiles where id = auth.uid()
$$;

create function public.is_admin() returns boolean
language sql security definer stable set search_path = '' as $$
    select coalesce(public.app_role() = 'admin', false)
$$;


-- Policies ------------------------------------

create policy "read own profile" on public.profiles
    for select using (id = auth.uid());

-- can edit own row but cant change role
create policy "update own profile" on public.profiles
    for update using (id = auth.uid())
    with check (id = auth.uid()
        and role = (select role from public.profiles where id = auth.uid()));

-- allow admin to read all
create policy "admin reads all" on public.profiles
    for select using (public.is_admin());


-- Triggers ------------------------------------

-- create user in public.profiles on registration: the email form, or "Continue with GitHub".
-- GitHub sends no role, so a GitHub sign-up is always a student.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    insert into public.profiles (id, name, role)        -- ← the missing line
    values (
        new.id,
        coalesce(
            new.raw_user_meta_data->>'name',       -- the sign-up form, or the GitHub display name
            new.raw_user_meta_data->>'user_name',  -- the GitHub username, if they have no display name
            'Student'
        ),
        case new.raw_user_meta_data->>'role'
            when 'prof' then 'prof'
            else 'student'
        end
    );
    return new;
end $$;

create trigger on_auth_user_created
    after insert on auth.users for each row execute function public.handle_new_user();
