-- ============================================================================
-- EduCore CMS — Migration 12: Tenant Foundation (Phase 6B)
-- هجرة إضافية بالكامل: تؤسس بنية تعدد المستأجرين (tenants + memberships)
-- مع RLS قائم على العضوية نفسها.
--
-- ⚠️ لم تُنفَّذ تلقائياً — تُطبَّق في خطوة منفصلة بعد المراجعة.
--
-- مبادئ هذه الدفعة:
--   * لا تلمس الجداول الحالية (students/payments/attendance/grades/expenses/
--     exams/exam_grades/materials) ولا تعدّل RLS الخاص بها.
--   * لا تعدّل أي Migration سابق (01 → 11).
--   * الوصول لبيانات الـTenant مبني على العضوية في public.memberships عبر
--     auth.uid() — لا user_metadata ولا localStorage.
--   * لا Seed data: لا مستأجر ولا عضوية ولا مستخدم جديد هنا.
-- ============================================================================

-- 1) المستأجرون ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenants_status_check CHECK (status IN ('active', 'suspended', 'archived'))
);

-- 2) العضويات ------------------------------------------------------------------
-- UNIQUE(tenant_id, user_id) يمنع تكرار نفس المستخدم داخل نفس الـTenant.
CREATE TABLE IF NOT EXISTS public.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT memberships_unique_tenant_user UNIQUE (tenant_id, user_id),
  CONSTRAINT memberships_role_check CHECK (role IN ('OWNER', 'ADMIN', 'ASSISTANT', 'TEACHER')),
  CONSTRAINT memberships_status_check CHECK (status IN ('active', 'suspended'))
);

-- فهرس واحد فقط إضافي: UNIQUE يغطي (tenant_id, user_id) بالفعل، والمطلوب
-- تسريع استعلام «عضويات المستخدم» المستخدم في TenantContext.
CREATE INDEX IF NOT EXISTS memberships_user_id_idx
  ON public.memberships (user_id);

-- 3) صيانة updated_at -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenants_touch_updated_at ON public.tenants;
CREATE TRIGGER tenants_touch_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS memberships_touch_updated_at ON public.memberships;
CREATE TRIGGER memberships_touch_updated_at
  BEFORE UPDATE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4) دوال الاستعلام عن العضوية ---------------------------------------------------
-- tenant_role: دور المستخدم الحالي في مستأجر معيّن، أو NULL إن لم يكن عضواً
-- نشطاً. SECURITY DEFINER ضروري هنا فقط لكسر العودية: الدالة تُستخدم داخل
-- سياسة RLS لجدول memberships نفسه، فلو قرأت الجدول بسياسات المستدعي لحدثت
-- عودية لا نهائية. search_path مضبوط صراحةً ولا تقرأ الدالة أي جدول آخر.
CREATE OR REPLACE FUNCTION public.tenant_role(p_tenant_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT m.role
  FROM public.memberships m
  WHERE m.tenant_id = p_tenant_id
    AND m.user_id = auth.uid()
    AND m.status = 'active'
  LIMIT 1;
$$;

-- is_tenant_member: هل المستخدم الحالي عضو نشط في المستأجر؟
CREATE OR REPLACE FUNCTION public.is_tenant_member(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.tenant_role(p_tenant_id) IS NOT NULL;
$$;

-- 5) RLS للأساس الجديد فقط ---------------------------------------------------------
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

-- لا سياسة using(true): الرؤية مبنية على العضوية حصراً.
DO $$
BEGIN
  -- المستخدم يرى فقط المستأجرين الذين هو عضو نشط فيهم.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tenants'
      AND policyname = 'tenants_member_select'
  ) THEN
    CREATE POLICY tenants_member_select
      ON public.tenants FOR SELECT TO authenticated
      USING (public.is_tenant_member(id));
  END IF;

  -- المستخدم يرى عضوياته هو، إضافةً إلى عضويات المستأجرين الذين يديرهم
  -- (OWNER/ADMIN) — تمهيداً لشاشة إدارة الأعضاء لاحقاً.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'memberships'
      AND policyname = 'memberships_self_or_managed_select'
  ) THEN
    CREATE POLICY memberships_self_or_managed_select
      ON public.memberships FOR SELECT TO authenticated
      USING (
        user_id = auth.uid()
        OR public.tenant_role(tenant_id) IN ('OWNER', 'ADMIN')
      );
  END IF;
END
$$;

-- ملاحظة مقصودة: لا سياسات INSERT/UPDATE/DELETE على tenants/memberships في
-- هذه المرحلة. إنشاء المستأجرين وإضافة الأعضاء (provisioning) سيُنفَّذ في
-- دفعة لاحقة عبر service role / إدارة خادمية، حتى لا يُفتح مسار كتابة من
-- العميل قبل اكتمال التصميم (بما فيه bootstrap أول OWNER).
