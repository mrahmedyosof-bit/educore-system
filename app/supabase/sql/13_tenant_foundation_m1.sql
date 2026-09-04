-- ============================================================================
-- EduCore CMS — M1: Tenant Foundation (additive-only, not executed here)
--
-- This migration creates the tenant foundation only when the tables do not
-- exist. It intentionally does not touch legacy financial tables or data.
-- If migration 12 was already applied with its incompatible role vocabulary,
-- this migration stops with a clear error instead of altering that foundation.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.tenants') IS NOT NULL
     OR to_regclass('public.memberships') IS NOT NULL THEN
    RAISE EXCEPTION
      'M1 blocked: tenant foundation already exists; inspect migration 12 before proceeding';
  END IF;
END
$$;

CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenants_status_check
    CHECK (status IN ('active', 'suspended', 'archived'))
);

CREATE TABLE public.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
    REFERENCES public.tenants (id) ON DELETE CASCADE,
  user_id uuid NOT NULL
    REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT memberships_unique_tenant_user
    UNIQUE (tenant_id, user_id),
  CONSTRAINT memberships_role_check
    CHECK (role IN (
      'OWNER', 'ADMIN', 'ACCOUNTANT',
      'RECEPTIONIST', 'TEACHER', 'VIEWER'
    )),
  CONSTRAINT memberships_status_check
    CHECK (status IN ('active', 'suspended'))
);

CREATE INDEX memberships_user_id_idx
  ON public.memberships (user_id);

CREATE INDEX memberships_tenant_status_idx
  ON public.memberships (tenant_id, status);

CREATE FUNCTION public.m1_get_user_tenant_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT m.tenant_id
  FROM public.memberships AS m
  WHERE m.user_id = auth.uid()
    AND m.status = 'active';
$$;

CREATE FUNCTION public.m1_is_tenant_member(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships AS m
    WHERE m.tenant_id = p_tenant_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
  );
$$;

CREATE FUNCTION public.m1_get_tenant_role(p_tenant_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT m.role
  FROM public.memberships AS m
  WHERE m.tenant_id = p_tenant_id
    AND m.user_id = auth.uid()
    AND m.status = 'active'
  LIMIT 1;
$$;

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenants_member_select
  ON public.tenants
  FOR SELECT TO authenticated
  USING (public.m1_is_tenant_member(id));

CREATE POLICY memberships_self_or_managed_select
  ON public.memberships
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.m1_get_tenant_role(tenant_id) IN ('OWNER', 'ADMIN')
  );

-- No bootstrap tenant, membership, financial backfill, subscription creation,
-- legacy data mutation, or legacy RLS change is performed here.