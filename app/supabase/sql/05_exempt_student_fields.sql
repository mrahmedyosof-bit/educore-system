-- ============================================================
-- EduCore CMS — الخطوة 5: الطلاب المعفون وحقول التفاصيل الإضافية
-- نفّذه في: Dashboard > SQL Editor
--
-- يضيف لجدول students الموجود:
--   is_exempt      : طالب معفي من المصاريف (boolean)
--   address        : العنوان
--   school         : المدرسة
--   guardian_notes : ملاحظات ولي الأمر
--
-- هذه النسخة آمنة لإعادة التشغيل.
-- ============================================================

alter table public.students
  add column if not exists is_exempt boolean not null default false,
  add column if not exists address text,
  add column if not exists school text,
  add column if not exists guardian_notes text;
