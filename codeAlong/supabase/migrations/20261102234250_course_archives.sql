-- Archiving a course is personal: it moves the course out of your own list and changes nothing
-- for anyone else. A row here means "this person has archived this course".

create table public.course_archives (
    course_id   uuid not null references public.courses(id) on delete cascade,
    user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
    archived_at timestamptz not null default now(),
    primary key (course_id, user_id)
);

alter table public.course_archives enable row level security;

create policy "members read own archives" on public.course_archives
    for select using (user_id = auth.uid());

create policy "members archive for themselves" on public.course_archives
    for insert with check (user_id = auth.uid() and public.is_course_member(course_id));

create policy "members restore for themselves" on public.course_archives
    for delete using (user_id = auth.uid());

create policy "admin reads all" on public.course_archives
    for select using (public.is_admin());

-- courses that were archived for everyone stay archived for the people in them
insert into public.course_archives (course_id, user_id)
select id, owner_id from public.courses where archived
union
select st.course_id, st.user_id from public.course_staff st
  join public.courses c on c.id = st.course_id where c.archived
union
select cs.course_id, cs.user_id from public.course_students cs
  join public.courses c on c.id = cs.course_id where c.archived;

-- the enrol code keeps working, since one person archiving a course doesn't close it
create or replace function public.enrol_with_code(p_code text) returns public.courses
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

    select * into c from public.courses where enrol_code = upper(trim(p_code));
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

alter table public.courses drop column archived;
