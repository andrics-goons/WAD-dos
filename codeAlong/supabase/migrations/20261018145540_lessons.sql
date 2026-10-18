-- Lessons: lessons, steps
-- Spec: design-docs/03-data-model.md#lessons
-- Order matters: shared helpers → tables → lesson helpers → RLS + policies → RPCs → triggers
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

create table public.steps (
    id           uuid primary key default gen_random_uuid(),
    lesson_id    uuid not null references public.lessons(id) on delete cascade,
    "order"      int not null check ("order" >= 1),       -- "order" is a reserved word: always quote it
    title        text not null check (char_length(title) between 1 and 120),
    description  text check (char_length(description) <= 1000),
    todo_refs    jsonb not null default '[]',             -- [{ file, line }]: one step can span files
    checks       jsonb not null default '[]',             -- automatic step checks (COULD)
    -- DEFERRABLE: reordering swaps orders around, and a normal unique constraint is
    -- checked row by row, so "move 3 to 1" would clash halfway. Deferred, it's only
    -- checked when the transaction commits, by which time every order is unique again.
    constraint steps_lesson_order_unique unique (lesson_id, "order") deferrable initially deferred
);


-- Lesson helpers ------------------------------------
-- security definer so step policies can look at the lesson without RLS in the way

-- Staff see every lesson; enrolled students see everything except drafts.
create function public.can_read_lesson(lid uuid) returns boolean
language sql security definer stable set search_path = '' as $$
    select exists (
        select 1 from public.lessons l
        where l.id = lid
          and (public.is_course_staff(l.course_id)
               or (public.is_enrolled(l.course_id) and l.status <> 'draft'))
    )
$$;

-- Only the course's prof edits a lesson or its steps (not TAs).
create function public.can_edit_lesson(lid uuid) returns boolean
language sql security definer stable set search_path = '' as $$
    select exists (
        select 1 from public.lessons l
        where l.id = lid and public.is_course_prof(l.course_id)
    )
$$;


-- Policies ------------------------------------

alter table public.lessons enable row level security;
alter table public.steps enable row level security;

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

-- steps (bulk changes go through replace_steps / delete_step; single edits are direct)
create policy "readers of the lesson read its steps" on public.steps
    for select using (public.can_read_lesson(lesson_id));

create policy "prof writes steps" on public.steps
    for all using (public.can_edit_lesson(lesson_id))
    with check (public.can_edit_lesson(lesson_id));

create policy "admin reads all" on public.steps
    for select using (public.is_admin());


-- RPCs ------------------------------------

-- Save a lesson's whole step list in one go: add, edit, reorder and remove.
-- p_steps: [{ id?, title, description?, todo_refs? }, …] in display order.
--   * a step with an id is updated, one without is created
--   * existing steps whose id is missing from the list are deleted
--   * orders are always rewritten 1, 2, 3… from the array position (any "order" sent is ignored)
create function public.replace_steps(p_lesson_id uuid, p_steps jsonb)
returns setof public.steps
language plpgsql security definer set search_path = '' as $$
begin
    if auth.uid() is null then
        raise exception 'UNAUTHENTICATED|Log in first' using errcode = 'P0001';
    end if;
    if not public.can_edit_lesson(p_lesson_id) then
        raise exception 'FORBIDDEN|Only the course prof can edit steps' using errcode = 'P0001';
    end if;
    if p_steps is null or jsonb_typeof(p_steps) <> 'array' then
        raise exception 'BAD_REQUEST|Steps must be a list' using errcode = 'P0001';
    end if;

    if exists (
        select 1 from jsonb_array_elements(p_steps) e
        where nullif(trim(e->>'title'), '') is null
    ) then
        raise exception 'VALIDATION_FAILED|Every step needs a title' using errcode = 'P0001';
    end if;

    -- every id sent must belong to THIS lesson, or a prof could rewrite another lesson's steps
    if exists (
        select 1 from jsonb_array_elements(p_steps) e
        where e ? 'id' and e->>'id' is not null
          and not exists (
              select 1 from public.steps s
              where s.id = (e->>'id')::uuid and s.lesson_id = p_lesson_id
          )
    ) then
        raise exception 'BAD_REQUEST|One of those steps belongs to a different lesson'
            using errcode = 'P0001';
    end if;

    -- 1. remove steps that are no longer in the list
    delete from public.steps
     where lesson_id = p_lesson_id
       and id not in (
           select (e->>'id')::uuid from jsonb_array_elements(p_steps) e
           where e->>'id' is not null
       );

    -- 2. update the steps that stay, at their new positions
    update public.steps s set
        "order"     = x.pos,
        title       = x.step->>'title',
        description = nullif(x.step->>'description', ''),
        todo_refs   = coalesce(x.step->'todo_refs', s.todo_refs)
      from jsonb_array_elements(p_steps) with ordinality as x(step, pos)
     where x.step->>'id' is not null
       and s.id = (x.step->>'id')::uuid;

    -- 3. insert the new ones
    insert into public.steps (lesson_id, "order", title, description, todo_refs)
    select p_lesson_id, x.pos, x.step->>'title', nullif(x.step->>'description', ''),
           coalesce(x.step->'todo_refs', '[]'::jsonb)
      from jsonb_array_elements(p_steps) with ordinality as x(step, pos)
     where x.step->>'id' is null;

    return query
        select * from public.steps where lesson_id = p_lesson_id order by "order";
end $$;

-- Delete one step and close the gap: 1, 2, 4 becomes 1, 2, 3.
create function public.delete_step(p_step_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
    v_lesson uuid;
begin
    if auth.uid() is null then
        raise exception 'UNAUTHENTICATED|Log in first' using errcode = 'P0001';
    end if;

    select lesson_id into v_lesson from public.steps where id = p_step_id;
    if v_lesson is null or not public.can_edit_lesson(v_lesson) then
        raise exception 'FORBIDDEN|Only the course prof can edit steps' using errcode = 'P0001';
    end if;

    delete from public.steps where id = p_step_id;

    update public.steps s set "order" = r.pos
      from (
          select id, row_number() over (order by "order") as pos
            from public.steps where lesson_id = v_lesson
      ) r
     where s.id = r.id;
end $$;


-- Triggers ------------------------------------

create trigger set_updated_at before update on public.lessons
    for each row execute function public.set_updated_at();

-- earlier tables that already had an updated_at column nothing was maintaining
create trigger set_updated_at before update on public.profiles
    for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.courses
    for each row execute function public.set_updated_at();
