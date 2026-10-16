-- Courses: courses, course_staff, course_students
-- Spec: design-docs/03-data-model.md#courses
-- Order matters: tables → helpers → RLS + policies → RPCs
--
-- Every guard below is written to be safe when auth.uid() is null (a logged-out
-- caller): `is distinct from` instead of `<>`, and an explicit login check first.
-- In SQL, `null <> x` is null, and an `if null` branch is skipped — so a careless
-- `<>` guard would let an anonymous caller straight through.


-- Tables ------------------------------------

create table public.courses (
    id          uuid primary key default gen_random_uuid(),
    code        text not null check (code ~ '^[A-Z0-9]{2,12}$'),          -- e.g. IS216
    title       text not null check (char_length(title) between 1 and 100),
    term        text not null check (char_length(term) between 1 and 30),  -- e.g. AY2026/27 T1
    section     text not null check (char_length(section) between 1 and 10), -- e.g. G2
    owner_id    uuid not null references public.profiles(id),
    enrol_code  text not null unique check (char_length(enrol_code) = 6),
    archived    boolean not null default false,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    -- per prof, not global: two profs may both run "IS216 · AY2026/27 T1 · G2"
    unique (owner_id, code, term, section)
);

create table public.course_staff (
    course_id   uuid not null references public.courses(id) on delete cascade,
    user_id     uuid not null references public.profiles(id) on delete cascade,
    role        text not null check (role in ('prof', 'ta')),
    added_at    timestamptz not null default now(),
    primary key (course_id, user_id)
);

create table public.course_students (
    course_id   uuid not null references public.courses(id) on delete cascade,
    user_id     uuid not null references public.profiles(id) on delete cascade,
    enrolled_at timestamptz not null default now(),
    primary key (course_id, user_id)
);

-- "my courses" looks memberships up by user, so index that side too
create index course_staff_user_id_idx on public.course_staff (user_id);
create index course_students_user_id_idx on public.course_students (user_id);


-- Helper functions ------------------------------------
-- security definer so policies can call them without recursing into RLS

create function public.is_course_staff(cid uuid) returns boolean
language sql security definer stable set search_path = '' as $$
    select exists (
        select 1 from public.course_staff where course_id = cid and user_id = auth.uid()
    )
$$;

create function public.is_course_prof(cid uuid) returns boolean
language sql security definer stable set search_path = '' as $$
    select exists (
        select 1 from public.course_staff
        where course_id = cid and user_id = auth.uid() and role = 'prof'
    )
$$;

create function public.is_enrolled(cid uuid) returns boolean
language sql security definer stable set search_path = '' as $$
    select exists (
        select 1 from public.course_students where course_id = cid and user_id = auth.uid()
    )
$$;

create function public.is_course_member(cid uuid) returns boolean
language sql security definer stable set search_path = '' as $$
    select public.is_course_staff(cid) or public.is_enrolled(cid)
$$;

-- 6 characters, no look-alikes (0/O, 1/I/L): read off a projector, typed by hand.
-- Cryptographically random, because an enrol code is what lets someone into a course.
create function public.gen_enrol_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
    alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    bytes bytea := extensions.gen_random_bytes(6);
    result text := '';
begin
    for i in 0..5 loop
        result := result || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
    end loop;
    return result;
end $$;

-- internal only: called by create_course, never directly from the browser
revoke execute on function public.gen_enrol_code() from public, anon, authenticated;


-- Policies ------------------------------------

alter table public.courses enable row level security;
alter table public.course_staff enable row level security;
alter table public.course_students enable row level security;

-- courses
-- (no insert policy: courses are created only through create_course)
create policy "members read course" on public.courses
    for select using (public.is_course_member(id));

create policy "owner edits course" on public.courses
    for update using (owner_id = auth.uid())
    with check (owner_id = auth.uid());          -- can't hand the course to someone else

create policy "owner deletes course" on public.courses
    for delete using (owner_id = auth.uid());

create policy "admin reads all" on public.courses
    for select using (public.is_admin());

-- course_staff (writes only through create_course / add_course_staff)
create policy "members read staff list" on public.course_staff
    for select using (public.is_course_member(course_id));

create policy "admin reads all" on public.course_staff
    for select using (public.is_admin());

-- course_students (writes only through enrol_with_code / remove_course_student)
create policy "staff read students, students read own row" on public.course_students
    for select using (public.is_course_staff(course_id) or user_id = auth.uid());

create policy "admin reads all" on public.course_students
    for select using (public.is_admin());

-- profiles: rewrite "update own profile" BEFORE adding "read coursemates".
-- The original compared against a subquery on profiles itself. Once profiles has a
-- read policy containing subqueries (read coursemates, below), Postgres can no longer
-- expand profiles' policies inside a profiles policy and raises 42P17 "infinite
-- recursion detected in policy" on every profile update. app_role() is security
-- definer, so it reads the current role without going back through RLS.
drop policy "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
    for update using (id = auth.uid())
    with check (id = auth.uid() and role = public.app_role());   -- can't change your own role

-- profiles: names are visible to people you share a course with —
-- everyone in a course sees its staff; staff see their students.
-- Students do NOT see each other's names.
create policy "read coursemates" on public.profiles
    for select using (
        exists (
            select 1 from public.course_staff cs
            where cs.user_id = profiles.id and public.is_course_member(cs.course_id)
        )
        or exists (
            select 1 from public.course_students st
            where st.user_id = profiles.id and public.is_course_staff(st.course_id)
        )
    );


-- RPCs ------------------------------------

-- A prof creates a course. One transaction: the course AND the prof's staff row,
-- so the new course is never invisible to the person who just made it.
create function public.create_course(p_code text, p_title text, p_term text, p_section text)
returns public.courses
language plpgsql security definer set search_path = '' as $$
declare
    c public.courses;
    v_code text := upper(trim(p_code));
    tries int := 0;
begin
    if auth.uid() is null then
        raise exception 'UNAUTHENTICATED|Log in first' using errcode = 'P0001';
    end if;
    if public.app_role() is distinct from 'prof' then
        raise exception 'FORBIDDEN|Only educators can create courses' using errcode = 'P0001';
    end if;
    if exists (
        select 1 from public.courses
        where owner_id = auth.uid() and code = v_code and term = trim(p_term) and section = trim(p_section)
    ) then
        raise exception 'CONFLICT|You already have a course with that code, term and section'
            using errcode = 'P0001';
    end if;

    loop
        tries := tries + 1;
        begin
            insert into public.courses (code, title, term, section, owner_id, enrol_code)
            values (v_code, trim(p_title), trim(p_term), trim(p_section), auth.uid(), public.gen_enrol_code())
            returning * into c;
            exit;
        exception when unique_violation then
            if tries >= 5 then raise; end if;    -- enrol code collided 5 times: give up
        end;
    end loop;

    insert into public.course_staff (course_id, user_id, role) values (c.id, auth.uid(), 'prof');
    return c;
end $$;

-- A student joins a course they can't read yet, by typing its enrol code.
create function public.enrol_with_code(p_code text) returns public.courses
language plpgsql security definer set search_path = '' as $$
declare
    c public.courses;
begin
    if auth.uid() is null then
        raise exception 'UNAUTHENTICATED|Log in first' using errcode = 'P0001';
    end if;
    -- students and TAs (a TA in one course can be a student in another); not profs or admins
    if coalesce(public.app_role(), '') not in ('student', 'ta') then
        raise exception 'FORBIDDEN|Only students can enrol with a code' using errcode = 'P0001';
    end if;

    select * into c from public.courses where enrol_code = upper(trim(p_code)) and not archived;
    if not found then
        raise exception 'NOT_FOUND|No course with that code' using errcode = 'P0001';
    end if;
    if public.is_course_staff(c.id) then
        raise exception 'CONFLICT|You''re already on the staff of this course' using errcode = 'P0001';
    end if;

    insert into public.course_students (course_id, user_id) values (c.id, auth.uid())
        on conflict do nothing;                  -- enrolling twice is harmless
    return c;
end $$;

-- The course owner adds a TA by email. A student account is promoted to 'ta';
-- a prof or admin account keeps its role.
create function public.add_course_staff(p_course_id uuid, p_email text) returns public.course_staff
language plpgsql security definer set search_path = '' as $$
declare
    v_owner uuid;
    v_target uuid;
    s public.course_staff;
begin
    if auth.uid() is null then
        raise exception 'UNAUTHENTICATED|Log in first' using errcode = 'P0001';
    end if;

    select owner_id into v_owner from public.courses where id = p_course_id;
    if v_owner is distinct from auth.uid() then   -- also covers "no such course"
        raise exception 'FORBIDDEN|Only the course owner can add TAs' using errcode = 'P0001';
    end if;

    select id into v_target from auth.users where lower(email) = lower(trim(p_email));
    if v_target is null then
        raise exception 'NOT_FOUND|No account with that email' using errcode = 'P0001';
    end if;
    if v_target = auth.uid() then
        raise exception 'BAD_REQUEST|You''re already this course''s prof' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.course_students where course_id = p_course_id and user_id = v_target) then
        raise exception 'CONFLICT|That person is enrolled as a student in this course'
            using errcode = 'P0001';
    end if;

    insert into public.course_staff (course_id, user_id, role) values (p_course_id, v_target, 'ta')
        on conflict (course_id, user_id) do nothing
        returning * into s;
    if s is null then
        raise exception 'CONFLICT|That person is already on the staff' using errcode = 'P0001';
    end if;

    update public.profiles set role = 'ta', updated_at = now()
     where id = v_target and role = 'student';
    return s;
end $$;

-- The course owner removes a student. Their past statuses and snapshots stay,
-- so reports for sessions they attended still add up.
create function public.remove_course_student(p_course_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
    if auth.uid() is null then
        raise exception 'UNAUTHENTICATED|Log in first' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.courses where id = p_course_id and owner_id = auth.uid()) then
        raise exception 'FORBIDDEN|Only the course owner can remove students' using errcode = 'P0001';
    end if;

    delete from public.course_students where course_id = p_course_id and user_id = p_user_id;
    if not found then
        raise exception 'NOT_FOUND|That student isn''t enrolled in this course' using errcode = 'P0001';
    end if;
end $$;
