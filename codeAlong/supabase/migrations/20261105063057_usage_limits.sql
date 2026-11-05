-- Usage limits (Andric) · the free-tier guardrails, so one user can't use up what every class shares.
-- The numbers match Limits in shared/constants.js, which the app uses for its messages.
-- LIMIT_REACHED errors open the app's limit pop-up (src/components/ui/LimitModal.vue).


-- 1. A student's error: cap the whole object, not just its message. The app's own errors are
--    under 1 KB; without this a student could write megabytes that go to every staff dashboard.

alter table public.student_status
    add constraint student_status_error_size check (error is null or octet_length(error::text) <= 4000);


-- 2. LLM calls: at most 30 a minute across the whole site. The analyze-help and summarize-help
--    Edge Functions claim a slot before each call, and skip the call when there's none left.

create table public.llm_calls (
    id  bigint generated always as identity primary key,
    at  timestamptz not null default now()
);

alter table public.llm_calls enable row level security;

create policy "admin reads all" on public.llm_calls
    for select using (public.is_admin());

create function public.claim_llm_call() returns boolean
language plpgsql security definer set search_path = '' as $$
begin
    -- one claim at a time, so two calls can't both take the last slot
    perform pg_advisory_xact_lock(hashtext('llm_calls'));
    delete from public.llm_calls where at < now() - interval '1 hour';
    if (select count(*) from public.llm_calls where at > now() - interval '1 minute') >= 30 then
        return false;
    end if;
    insert into public.llm_calls default values;
    return true;
end $$;
revoke execute on function public.claim_llm_call() from public, anon, authenticated;
grant execute on function public.claim_llm_call() to service_role;


-- 3. At most 30 lessons a course. Each is already capped at 200 KB, so this stops a prof filling
--    the database by importing project after project. Archived lessons count: they still take space.

create function public.check_lesson_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    -- lock the course, so two uploads at once can't both be the 30th
    perform 1 from public.courses where id = new.course_id for update;
    if (select count(*) from public.lessons
         where course_id = new.course_id and id is distinct from new.id) >= 30 then
        raise exception 'LIMIT_REACHED|This course already has 30 lessons, the most it can have. Delete one to add another'
            using errcode = 'P0001';
    end if;
    return new;
end $$;

create trigger check_lesson_limit
    before insert or update of course_id on public.lessons
    for each row execute function public.check_lesson_limit();


-- 4. Storage: the free tier allows 500 MB. Past 450 MB, nothing that adds code can be saved
--    (lessons, checkpoints, and snapshots: autosave, help requests, catch-ups). The margin leaves
--    room for the small rows (statuses, help replies) that keep a class going.

create function public.check_storage_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    if pg_database_size(current_database()) > 450 * 1024 * 1024 then
        raise exception 'LIMIT_REACHED|CodeAlong has used up its free storage, so new work can''t be saved right now. Tell your instructor'
            using errcode = 'P0001';
    end if;
    return new;
end $$;

create trigger check_storage_limit before insert on public.lessons
    for each row execute function public.check_storage_limit();
create trigger check_storage_limit before insert on public.checkpoints
    for each row execute function public.check_storage_limit();
create trigger check_storage_limit before insert on public.snapshots
    for each row execute function public.check_storage_limit();
