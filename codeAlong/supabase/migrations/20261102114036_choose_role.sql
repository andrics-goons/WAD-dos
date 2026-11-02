-- "Continue with GitHub" sign-ups pick student or educator on the next page, instead of always
-- being made students (GitHub sends no role). The email form already sends its role.

-- false only for a GitHub sign-up that hasn't picked yet; everyone else (and every existing
-- account) has chosen
alter table public.profiles add column role_chosen boolean not null default true;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    insert into public.profiles (id, name, role, role_chosen)
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
        end,
        -- Supabase Auth sets provider (users can't edit app metadata); the form sends a role
        new.raw_app_meta_data->>'provider' is distinct from 'github'
    );
    return new;
end $$;

-- Pick a role, once, before joining anything. The account must be in no course: a user can set
-- role_chosen back to false on their own row, but that only lets them redo the choice while the
-- account is as empty as a fresh sign-up, which anyone can make with either role.
create function public.choose_role(p_role text) returns text
language plpgsql security definer set search_path = '' as $$
begin
    if auth.uid() is null then
        raise exception 'UNAUTHENTICATED|Log in first' using errcode = 'P0001';
    end if;
    if p_role is null or p_role not in ('student', 'prof') then
        raise exception 'VALIDATION_FAILED|Choose student or educator' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.course_students where user_id = auth.uid())
       or exists (select 1 from public.course_staff where user_id = auth.uid()) then
        raise exception 'CONFLICT|Your role is already set' using errcode = 'P0001';
    end if;

    update public.profiles
       set role = p_role, role_chosen = true
     where id = auth.uid() and role_chosen = false;
    if not found then
        raise exception 'CONFLICT|Your role is already set' using errcode = 'P0001';
    end if;
    return p_role;
end $$;

revoke execute on function public.choose_role(text) from public, anon;
grant execute on function public.choose_role(text) to authenticated;
