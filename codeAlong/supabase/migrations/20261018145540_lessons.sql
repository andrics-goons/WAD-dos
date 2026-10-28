-- Lessons: a title and its starter files. There are no steps: the prof saves checkpoints
-- whenever they like during class (the sessions migration).
-- Spec: design-docs/03-data-model.md#lessons
-- Order matters: shared helpers → tables → RLS + policies → triggers
--
-- Guards are null-safe like the courses migration: an explicit login check first,
-- and `is distinct from` rather than `<>`.


-- Shared helpers ------------------------------------
-- files_valid() is used again later by checkpoints and snapshots.

-- The `files` jsonb shape: [{ path, language, content }], 1–40 files.
-- CASE (not AND) so the checks run in order — SQL doesn't promise AND short-circuits,
-- and jsonb_array_length() errors on anything that isn't an array.
create function public.files_valid(f jsonb) returns boolean
language sql immutable set search_path = '' as $$
    select case
        when f is null or jsonb_typeof(f) <> 'array' then false
        when jsonb_array_length(f) not between 1 and 40 then false
        else not exists (
                select 1 from jsonb_array_elements(f) e
                where jsonb_typeof(e) <> 'object'
                   or e->>'path' is null
                   or length(e->>'path') > 120
                   or e->>'path' !~ '^[A-Za-z0-9_\-./]+$'
                   or e->>'path' like '%..%'          -- no climbing out of the project
                   or e->>'path' like '/%'            -- relative paths only
                   or e->>'language' is null
                   or e->>'language' not in ('html', 'css', 'js', 'vue', 'json', 'md')
                   or jsonb_typeof(e->'content') is distinct from 'string'
             )
             -- no two files with the same path
             and (select count(distinct e->>'path') from jsonb_array_elements(f) e)
                 = jsonb_array_length(f)
    end
$$;

-- Does the file list contain this path? (entry_file must point at a real file)
create function public.files_include(f jsonb, p text) returns boolean
language sql immutable set search_path = '' as $$
    select case
        when f is null or jsonb_typeof(f) <> 'array' then false
        else exists (select 1 from jsonb_array_elements(f) e where e->>'path' = p)
    end
$$;

-- Keeps updated_at honest on every UPDATE. Attached to lessons below, and to the
-- tables from earlier migrations that already have an updated_at column.
create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
    new.updated_at := now();
    return new;
end $$;


-- Tables ------------------------------------

create table public.lessons (
    id           uuid primary key default gen_random_uuid(),
    course_id    uuid not null references public.courses(id) on delete cascade,
    title        text not null check (char_length(title) between 1 and 100),   -- "Week 6 · Mini Cart"
    week         int check (week between 1 and 13),                            -- library ordering
    description  text check (char_length(description) <= 500),
    files        jsonb not null check (
                     public.files_valid(files) and octet_length(files::text) <= 200000
                 ),
    -- the IndexedDB cache checks this tiny hash before ever downloading `files`
    files_hash   text generated always as (md5(files::text)) stored,
    entry_file   text not null,
    dev_command  text not null default 'pnpm dev' check (char_length(dev_command) between 1 and 200),
    source       jsonb,                                                       -- { type: 'upload' | 'github', repo, ref, dir }
    status       text not null default 'draft' check (status in ('draft', 'ready', 'archived')),
    created_by   uuid not null default auth.uid() references public.profiles(id),
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    constraint entry_file_exists check (public.files_include(files, entry_file))
);

create index lessons_course_week_idx on public.lessons (course_id, week);


-- Policies ------------------------------------

alter table public.lessons enable row level security;

-- lessons
create policy "staff read lessons, students read non-drafts" on public.lessons
    for select using (
        public.is_course_staff(course_id)
        or (public.is_enrolled(course_id) and status <> 'draft')
    );

create policy "prof creates lessons" on public.lessons
    for insert with check (public.is_course_prof(course_id) and created_by = auth.uid());

create policy "prof edits lessons" on public.lessons
    for update using (public.is_course_prof(course_id))
    with check (public.is_course_prof(course_id));   -- can't move a lesson into a course you don't run

create policy "prof deletes lessons" on public.lessons
    for delete using (public.is_course_prof(course_id));
    -- the sessions migration adds a trigger refusing to delete a lesson that was ever taught

create policy "admin reads all" on public.lessons
    for select using (public.is_admin());


-- Triggers ------------------------------------

create trigger set_updated_at before update on public.lessons
    for each row execute function public.set_updated_at();

-- earlier tables that already had an updated_at column nothing was maintaining
create trigger set_updated_at before update on public.profiles
    for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.courses
    for each row execute function public.set_updated_at();
