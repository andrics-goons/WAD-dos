-- DRAFT — not a migration yet (the Supabase CLI only runs supabase/migrations/).
-- autosave_patch: merge a student's changed files into their single autosave snapshot.
-- Called by src/api/workspace.api.js; contract in design-docs/09 §7, design in 05 §2.
--
-- Needs from Andric's schema first: public.sessions, public.snapshots (with the files_hash
-- generated column and the one-autosave-per-student partial unique index), is_enrolled()
-- and files_valid(). Once those are on main, copy this into a new numbered migration.

create or replace function public.autosave_patch(p_session_id uuid, p_upsert jsonb, p_delete text[])
returns table (files_hash text)
language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions;
  upserts jsonb := coalesce(p_upsert, '[]'::jsonb);
  merged jsonb;
begin
  -- Only an enrolled student of a live session can autosave, and only into their own row
  select * into s from public.sessions where id = p_session_id;
  if not found or not public.is_enrolled(s.course_id) then
    raise exception 'FORBIDDEN|You are not a student in this class' using errcode = 'P0001';
  end if;
  if s.status <> 'live' then
    raise exception 'CONFLICT|This class has ended — your work is saved' using errcode = 'P0001';
  end if;
  if jsonb_typeof(upserts) <> 'array' then
    raise exception 'BAD_REQUEST|p_upsert must be a list of files' using errcode = 'P0001';
  end if;

  -- Lock my autosave row, so two open tabs can't merge over each other
  perform 1 from public.snapshots
   where session_id = p_session_id and student_id = auth.uid() and reason = 'autosave'
   for update;

  -- Saved files that weren't deleted or replaced, plus the new versions
  select coalesce(jsonb_agg(x.f order by x.f->>'path'), '[]'::jsonb) into merged
  from (
    select e as f
      from public.snapshots sn, jsonb_array_elements(sn.files) e
     where sn.session_id = p_session_id and sn.student_id = auth.uid() and sn.reason = 'autosave'
       and not (e->>'path' = any (coalesce(p_delete, '{}')))
       and not exists (select 1 from jsonb_array_elements(upserts) u where u->>'path' = e->>'path')
    union all
    select u from jsonb_array_elements(upserts) u
  ) x;

  -- One autosave row per student per session. The files_valid() and 200 KB checks on
  -- snapshots.files reject a bad merged result (error 23514), so nothing invalid is stored.
  insert into public.snapshots as sn (session_id, student_id, step_id, reason, files)
  values (p_session_id, auth.uid(), s.current_step_id, 'autosave', merged)
  on conflict (session_id, student_id) where reason = 'autosave'
  do update set files = excluded.files, step_id = excluded.step_id
  returning sn.files_hash into files_hash;

  return next;
end $$;

-- Signed-in users only; an anonymous caller would be refused anyway, but don't offer it
revoke execute on function public.autosave_patch(uuid, jsonb, text[]) from public, anon;
grant execute on function public.autosave_patch(uuid, jsonb, text[]) to authenticated;
