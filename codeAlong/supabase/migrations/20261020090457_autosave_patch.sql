-- Autosave: merge a student's changed files into their one autosave snapshot.
-- Owner: Ray Yien. Spec: design-docs/05 §2, 09 §7. Called by src/cache/autosave.js, which
-- sends only the files that changed (p_upsert) and the paths that were deleted (p_delete).

create function public.autosave_patch(p_session_id uuid, p_upsert jsonb, p_delete text[])
returns table (files_hash text)
language plpgsql security definer set search_path = '' as $$
declare
    s public.sessions;
    merged jsonb;
begin
    if auth.uid() is null then
        raise exception 'UNAUTHENTICATED|Log in first' using errcode = 'P0001';
    end if;

    -- A missing session leaves s empty, so is_enrolled() is false and this refuses it too
    select * into s from public.sessions where id = p_session_id;
    if not public.is_enrolled(s.course_id) then
        raise exception 'FORBIDDEN|You''re not a student in this class' using errcode = 'P0001';
    end if;
    if s.status is distinct from 'live' then
        raise exception 'CONFLICT|This class has ended — your work is saved' using errcode = 'P0001';
    end if;

    -- Lock my autosave row, so two open tabs can't merge over each other
    perform 1 from public.snapshots
     where session_id = p_session_id and student_id = auth.uid() and reason = 'autosave'
     for update;

    -- The saved files that weren't deleted or replaced, plus the new versions
    select coalesce(jsonb_agg(x.f order by x.f->>'path'), '[]'::jsonb) into merged
    from (
        select e as f
          from public.snapshots sn, jsonb_array_elements(sn.files) e
         where sn.session_id = p_session_id and sn.student_id = auth.uid() and sn.reason = 'autosave'
           and not (e->>'path' = any (coalesce(p_delete, '{}')))
           and not exists (
               select 1 from jsonb_array_elements(coalesce(p_upsert, '[]')) u
                where u->>'path' = e->>'path'
           )
        union all
        select u from jsonb_array_elements(coalesce(p_upsert, '[]')) u
    ) x;

    -- One autosave row per student per session. The files_valid() and 200 KB checks on
    -- snapshots.files reject a bad result, so nothing invalid is ever stored.
    insert into public.snapshots as sn (session_id, student_id, step_id, reason, files)
    values (p_session_id, auth.uid(), s.current_step_id, 'autosave', merged)
    on conflict (session_id, student_id) where reason = 'autosave'
    do update set files = excluded.files, step_id = excluded.step_id
    returning sn.files_hash into files_hash;

    return next;
end $$;
