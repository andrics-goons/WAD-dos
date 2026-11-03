-- One lesson per week in a course, so the library has no two "Week 6" lessons.
-- Lessons without a week, and archived ones, don't count: archiving last term's Week 6 frees it.
-- A clash is a unique violation (23505); lessons.api.js turns it into a friendly CONFLICT.
-- Spec: design-docs/03-data-model.md#lessons

create unique index lessons_course_week_key on public.lessons (course_id, week)
    where week is not null and status is distinct from 'archived';
