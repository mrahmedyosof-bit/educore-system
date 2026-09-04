-- ============================================================================
-- EduCore CMS — Migration 10
-- أغراض غير تدميرية بالكامل (إضافات فقط):
--   1) قيد فريد على payments(student_id, month_name) — مطلوب لعملية upsert
--      المستخدمة في تسجيل الدفعات (بدونه يفشل ON CONFLICT).
--   2) عمود payments.payment_date بقيمة افتراضية + ملء القيم الفارغة من
--      created_at (لا يمس أي قيمة موجودة).
--   3) عمود payments.academic_year لحفظ السنة الدراسية مع الدفعة.
--   4) جدول audit_log لسجل تدقيق الحضور (إدراج وقراءة فقط — لا تعديل/حذف
--      عبر سياسات RLS حتى لا يمكن العبث بالسجل من التطبيق).
-- ملاحظة: إن وُجدت صفوف مكررة (نفس الطالب ونفس الشهر) في payments فإن
-- إضافة القيد الفريد ستفشل برسالة توضّح التكرار — عالج التكرار يدوياً
-- قبل إعادة التنفيذ. لا يتم هنا حذف أي بيانات تلقائياً.
-- ============================================================================

-- 1) القيد الفريد المطلوب لـ upsert الدفعات ---------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payments_student_month_unique'
      AND conrelid = 'public.payments'::regclass
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_student_month_unique UNIQUE (student_id, month_name);
  END IF;
END
$$;

-- 2) عمود تاريخ الدفع -------------------------------------------------------
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payment_date timestamptz DEFAULT now();

-- ملء القيم الفارغة فقط (غير تدميري)
UPDATE public.payments
SET payment_date = created_at
WHERE payment_date IS NULL AND created_at IS NOT NULL;

-- 3) عمود السنة الدراسية ----------------------------------------------------
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS academic_year text;

-- 4) جدول سجل التدقيق --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid REFERENCES auth.users (id),
  action text NOT NULL,
  entity text,
  entity_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_created_at_idx
  ON public.audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS audit_log_entity_idx
  ON public.audit_log (entity, entity_id);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- إدراج وقراءة فقط للمستخدمين الموثقين — بدون سياسات UPDATE/DELETE
-- حتى لا يمكن تعديل أو محو سجل التدقيق من التطبيق.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'audit_log' AND policyname = 'audit_log_authenticated_insert'
  ) THEN
    CREATE POLICY audit_log_authenticated_insert
      ON public.audit_log FOR INSERT TO authenticated WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'audit_log' AND policyname = 'audit_log_authenticated_select'
  ) THEN
    CREATE POLICY audit_log_authenticated_select
      ON public.audit_log FOR SELECT TO authenticated USING (true);
  END IF;
END
$$;
