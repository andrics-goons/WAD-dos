-- Admin: list users and change their roles (+ a policy sweep for the tests)
-- Spec: design-docs/03-data-model.md#admin
--
-- Admins READ everything through the one "admin reads all" policy each table already has.
-- The only thing they WRITE is another user's account role, through admin_set_role.


-- RPCs ------------------------------------

-- Every account, with the email the browser can't read itself (it lives in auth.users).
create function public.admin_list_users()
returns table (id uuid, email text, name text, role text, created_at timestamptz)
language plpgsql security definer stable set search_path = '' as $$
begin
    if auth.uid() is null then
        raise exception 'UNAUTHENTICATED|Log in first' using errcode = 'P0001';
    end if;
    if not public.is_admin() then
        raise exception 'FORBIDDEN|Only an admin can list users' using errcode = 'P0001';
    end if;

    return query
        select p.id, u.email::text, p.name, p.role, u.created_at
          from public.profiles p
          join auth.users u on u.id = p.id
         order by p.name, u.email;
end $$;

-- Change another user's account role. Your own is refused, so an admin can never demote
-- the last admin by accident: only another admin can change an admin.
create function public.admin_set_role(p_user_id uuid, p_role text)
returns table (id uuid, name text, role text)
language plpgsql security definer set search_path = '' as $$
begin
    if auth.uid() is null then
        raise exception 'UNAUTHENTICATED|Log in first' using errcode = 'P0001';
    end if;
    if not public.is_admin() then
        raise exception 'FORBIDDEN|Only an admin can change roles' using errcode = 'P0001';
    end if;
    if p_user_id is not distinct from auth.uid() then
        raise exception 'BAD_REQUEST|You can''t change your own role' using errcode = 'P0001';
    end if;
    if p_role is null or p_role not in ('student', 'ta', 'prof', 'admin') then
        raise exception 'VALIDATION_FAILED|Pick student, ta, prof or admin' using errcode = 'P0001';
    end if;

    update public.profiles p set role = p_role where p.id = p_user_id;
    if not found then
        raise exception 'NOT_FOUND|No such user' using errcode = 'P0001';
    end if;

    return query select p.id, p.name, p.role from public.profiles p where p.id = p_user_id;
end $$;


-- Policy sweep ------------------------------------
-- For T-ADM-09: one row per public table. The test checks every table has RLS on,
-- exactly one "admin reads all" select policy, and no admin policy for any other command.
-- It reads the catalog, which PostgREST can't, so only the service role may call it.

create function public.admin_policy_sweep()
returns table (table_name text, rls_enabled boolean, admin_select_policies int, admin_write_policies int)
language sql security definer stable set search_path = '' as $$
    select t.tablename::text,
           c.relrowsecurity,
           (select count(*) from pg_catalog.pg_policies p
             where p.schemaname = 'public' and p.tablename = t.tablename
               and p.policyname = 'admin reads all' and p.cmd = 'SELECT'
               -- with search_path = '' the catalog prints it schema-qualified
               and p.qual in ('is_admin()', 'public.is_admin()'))::int,
           (select count(*) from pg_catalog.pg_policies p
             where p.schemaname = 'public' and p.tablename = t.tablename
               and p.cmd <> 'SELECT'
               and (coalesce(p.qual, '') like '%is_admin%' or coalesce(p.with_check, '') like '%is_admin%'))::int
      from pg_catalog.pg_tables t
      join pg_catalog.pg_class c on c.relname = t.tablename
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
     where t.schemaname = 'public'
     order by 1
$$;

revoke execute on function public.admin_policy_sweep() from public, anon, authenticated;
grant execute on function public.admin_policy_sweep() to service_role;
