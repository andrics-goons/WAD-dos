-- Was: one lesson per week in a course (a unique index on lessons (course_id, week)).
-- Dropped before it reached the cloud: a week holds several lessons (the library shows each
-- week as a folder of files, with "Start new session" to add another), and the cloud already
-- had two Week 6 lessons, so the index couldn't be built there.
-- Local databases that ran the old version still have the index;
-- 20261103173604_allow_many_lessons_per_week.sql drops it.
select 1;
