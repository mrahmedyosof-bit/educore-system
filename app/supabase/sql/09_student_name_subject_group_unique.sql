-- ============================================================
-- EduCore CMS — الخطوة 9:
-- السماح بتسجيل نفس الاسم في مادة/مجموعة مختلفة،
-- مع منع التكرار على (الاسم + المادة + المجموعة).
-- نفّذه في: Dashboard > SQL Editor
--
-- يستبدل القيد unique_student_name (على الاسم فقط).
-- هذه النسخة آمنة لإعادة التشغيل.
-- ============================================================

alter table public.students
  drop constraint if exists unique_student_name;

drop index if exists unique_student_name;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'unique_student_name_subject_group'
      and conrelid = 'public.students'::regclass
  ) then
    alter table public.students
      add constraint unique_student_name_subject_group
      unique (name, subject, group_name);
  end if;
end $$;
