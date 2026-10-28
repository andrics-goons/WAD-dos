-- Search across replays: checkpoint titles in my classes, and my own notes.
-- Owner: Ray Yien. Spec: design-docs/05 §11, 04 "Replay, notes, search". Called by
-- src/api/replays.api.js. Only ended classes, because every result links to a replay.
-- p_q is a parameter, so regex or tsquery characters in it are plain text (T-REP-06).

create function public.search(p_q text, p_course_id uuid default null)
returns table (
    kind          text,        -- 'checkpoint' or 'note'
    session_id    uuid,
    checkpoint_id uuid,
    seq           int,
    title         text,        -- the checkpoint's title (null if the prof gave none)
    body          text,        -- the note's text; null for a checkpoint
    lesson_title  text,
    course_code   text,
    started_at    timestamptz,
    rank          real
)
language plpgsql security definer stable set search_path = '' as $$
declare
    q tsquery;
begin
    if auth.uid() is null then
        raise exception 'UNAUTHENTICATED|Log in first' using errcode = 'P0001';
    end if;

    -- websearch_to_tsquery never fails on odd input; it drops what it can't use
    q := websearch_to_tsquery('english', coalesce(p_q, ''));
    if numnode(q) = 0 then
        return;
    end if;

    return query
    select x.kind, x.session_id, x.checkpoint_id, x.seq, x.title, x.body,
           l.title, c.code, s.started_at, x.rank
      from (
            select 'checkpoint'::text as kind, cp.session_id, cp.id as checkpoint_id, cp.seq,
                   cp.title, null::text as body,
                   ts_rank(to_tsvector('english', cp.title), q) as rank
              from public.checkpoints cp
             where to_tsvector('english', cp.title) @@ q
               and public.is_session_member(cp.session_id)
            union all
            -- the same expression as notes_body_search_idx, so the index is used
            select 'note', n.session_id, n.checkpoint_id, cp.seq, cp.title, n.body,
                   ts_rank(to_tsvector('english', n.body), q)
              from public.notes n
              left join public.checkpoints cp on cp.id = n.checkpoint_id
             where to_tsvector('english', n.body) @@ q
               and n.user_id = auth.uid()
           ) x
      join public.sessions s on s.id = x.session_id
      join public.lessons l on l.id = s.lesson_id
      join public.courses c on c.id = s.course_id
     where s.status = 'ended'
       and (p_course_id is null or s.course_id = p_course_id)
     order by x.rank desc, s.started_at desc, x.seq
     limit 20;
end $$;
