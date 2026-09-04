-- ============================================================
-- EduCore CMS — الخطوة 6: قيمة الخصم الجزئي الشهري للطالب
-- نفّذه في: Dashboard > SQL Editor
--
-- يضيف لجدول students:
--   discount_amount : قيمة الخصم الشهري (ج.م) — افتراضي 0
--
-- هذه النسخة آمنة لإعادة التشغيل.
-- ============================================================

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC NOT NULL DEFAULT 0;
