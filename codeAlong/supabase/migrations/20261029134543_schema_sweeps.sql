-- The independent RLS sweep (T-PRIV-06, T-PRIV-07). Owner: Ying Qi; schema review: Andric.
-- Both read the catalog, which PostgREST can't, so only the service role may call them.


-- T-PRIV-06: every table in public must have RLS on. Returns the ones that don't.
create function public.tables_without_rls()
returns setof text
language sql security definer stable set search_path = '' as $$
    select c.relname::text
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
     order by 1
$$;

revoke execute on function public.tables_without_rls() from public, anon, authenticated;
grant execute on function public.tables_without_rls() to service_role;


-- T-PRIV-07: every view in public must be "security_invoker = true", or it runs with
-- the owner's rights and skips RLS. One row per view, so the test can also check it found them.
create function public.view_security_sweep()
returns table (view_name text, security_invoker boolean)
language sql security definer stable set search_path = '' as $$
    select c.relname::text,
           coalesce('security_invoker=true' = any(c.reloptions), false)
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v'
     order by 1
$$;

revoke execute on function public.view_security_sweep() from public, anon, authenticated;
grant execute on function public.view_security_sweep() to service_role;
