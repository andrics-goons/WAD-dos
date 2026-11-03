-- A week can hold several lessons. Drops lessons_course_week_key, which local databases got from
-- the first version of 20261102154613_lesson_week_unique.sql (the cloud never had it).
-- Spec: design-docs/03-data-model.md#lessons
drop index if exists public.lessons_course_week_key;
