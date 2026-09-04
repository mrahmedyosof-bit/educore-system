-- ============================================================
-- EduCore CMS — الخطوة 3 (اختياري لكن موصى به):
-- منع تكرار سجل حضور نفس الطالب في نفس اليوم على مستوى قاعدة البيانات.
-- نفّذه في: Dashboard > SQL Editor
--
-- الفائدة: التطبيق يفحص التكرار برمجياً قبل الإضافة، لكن هذا القيد
-- يضمن المنع حتى لو جاء طلبان متزامنان من جهازين مختلفين.
--
-- هذه النسخة آمنة لإعادة التشغيل.
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'attendance_student_date_unique'
      and conrelid = 'public.attendance'::regclass
  ) then
    alter table public.attendance
      add constraint attendance_student_date_unique unique (student_id, date);
  end if;
end $$;
