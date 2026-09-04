-- ============================================================================
-- EduCore CMS — Migration 11 (اختيارية — صلابة RLS حسب الدور)
-- ============================================================================
-- تحذير: هذا السكريبت لا يُنفَّذ تلقائياً ضمن التدقيق. يجب مراجعته وتنفيذه
-- يدوياً فقط بعد:
--   1) ضبط حقل role في user_metadata لكل مستخدم في Supabase، مثال:
--        UPDATE auth.users
--        SET raw_user_meta_data = jsonb_set(
--              coalesce(raw_user_meta_data, '{}'::jsonb),
--              '{role}', '"admin"'
--            )
--        WHERE email = 'admin@example.com';
--   2) التأكد أن حساب المدير يعمل وأن بقية الحسابات لها الدور المناسب.
--
-- السبب: السياسات الحالية (01) تمنح أي مستخدم موثق صلاحية كاملة على كل
-- الجداول (using (true)). هذا يعني أن أي حساب مساعد يمكنه تعديل أو حذف
-- البيانات المالية من عميل Supabase مباشرة حتى لو أخفينا الشاشات في الواجهة.
-- السياسات أدناه تربط الصلاحيات الفعلية بالدور المخزّن في خادم المصادقة.
--
-- الدالة التالية تقرأ الدور من JWT الخاص بالجلسة الحالية:
-- ============================================================================

CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    (current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'role'),
    'assistant'
  );
$$;

-- ----------------------------------------------------------------------------
-- الجداول المالية والإدارية: كتابة للمدير فقط، قراءة للموثقين.
-- (غيّر أسماء الجداول إن اختلفت في مشروعك)
-- ----------------------------------------------------------------------------
-- مثال لجدول payments — كرر النمط نفسه لكل جدول حساس:
--
-- DROP POLICY IF EXISTS authenticated_full_access_payments ON public.payments;
--
-- CREATE POLICY payments_admin_write
--   ON public.payments
--   FOR ALL
--   TO authenticated
--   USING (public.current_app_role() = 'admin')
--   WITH CHECK (public.current_app_role() = 'admin');
--
-- CREATE POLICY payments_authenticated_read
--   ON public.payments
--   FOR SELECT
--   TO authenticated
--   USING (true);
--
-- الجداول المقترح تقييد الكتابة فيها على المدير:
--   payments, expenses, app_settings, materials, exams, grades
-- الجداول التي يكفي فيها للمساعد صلاحية إدخال/تعديل أكاديمي:
--   students, attendance
--
-- ملاحظة أخيرة: تطبيق هذه السياسات مع ضبط الأدوار بشكل خاطئ قد يمنع
-- المدير نفسه من الكتابة. اختبر على بيئة نسخ احتياطي أولاً.
