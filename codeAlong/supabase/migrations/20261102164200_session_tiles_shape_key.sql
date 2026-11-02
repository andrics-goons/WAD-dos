-- session_tiles gains error_shape_key: the error with the student's own names blanked out
-- (normalizeError's shapeKey, already saved in student_status.error). The dashboard groups on it,
-- so "items is not defined" and "itmes is not defined" land in one Common errors group
-- (design-docs/05 §6). A new column can only go on the end of an existing view.
create or replace view public.session_tiles with (security_invoker = true) as
select
    ss.session_id,
    ss.student_id,
    p.name,
    s.checkpoint_seq,
    ss.done_seq,
    ss.error->>'source'                  as error_source,
    ss.error->>'key'                     as error_key,
    left(ss.error->>'message', 120)      as error_preview,
    ss.checks,
    ss.last_seen_at,
    case
        when now() - ss.last_seen_at >
             make_interval(secs => (s.settings->>'idleAfterSec')::numeric) then 'idle'
        else public.tile_state(ss.done_seq, ss.error, s.checkpoint_seq)
    end                                  as state,
    array(
        select distinct hr.checkpoint_seq
          from public.help_requests hr
         where hr.session_id = ss.session_id and hr.student_id = ss.student_id
           and hr.type = 'check' and hr.status = 'passed'
         order by hr.checkpoint_seq
    )                                    as passed_seqs,
    ss.error->>'shapeKey'                as error_shape_key
from public.student_status ss
join public.sessions s on s.id = ss.session_id
join public.profiles p on p.id = ss.student_id;
