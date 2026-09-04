'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthContext';
import type { Membership, MembershipStatus, Tenant, TenantRole } from '@/types/tenant';
import { ROLE_PERMISSIONS, hasPermission, type Permission } from '@/lib/permissions';
import { clearTenantScope, setTenantScope } from '@/lib/tenant/scope';

/**
 * سياق المستأجر الحالي (Phase 6B — Tenant Foundation، موسَّع في Phase 6C).
 *
 * المصدر الوحيد للـTenant والعضوية والدور هو قاعدة البيانات بعد المصادقة
 * (جدولا memberships وtenants عبر RLS القائم على العضوية). لا يُقرأ أي
 * معرف مستأجر أو دور من localStorage، ولا من user_metadata.
 *
 * إضافات Phase 6C:
 * - refreshTenant(): إعادة جلب العضويات/المستأجرين من قاعدة البيانات.
 * - permissions + can(): مشتقّان من membership.role عبر lib/permissions.
 * - مزامنة lib/tenant/scope (نطاق زمن التشغيل) ليكون مصدراً موحّداً
 *   للكود غير المرتبط بـReact (الخدمات). هذا ليس حدّاً أمنياً؛ الأمن لاحقاً
 *   عبر Supabase RLS.
 */
interface TenantContextValue {
  loading: boolean;
  error: string;
  /** كل المستأجرين الذين للمستخدم عضوية نشطة فيهم. */
  tenants: Tenant[];
  /** عضويات المستخدم النشطة (ترتيب الإنشاء). */
  memberships: Membership[];
  currentTenant: Tenant | null;
  currentMembership: Membership | null;
  currentRole: TenantRole | null;
  /** صلاحيات الدور الحالي (فارغة إن لم توجد عضوية). */
  permissions: readonly Permission[];
  /** فحص صلاحية `resource.action` للدور الحالي. فحص واجهة فقط، ليس أمناً. */
  can: (permission: Permission) => boolean;
  /** تبديل المستأجر الحالي ضمن عضويات المستخدم المحمّلة فقط (ذاكرة فقط). */
  switchTenant: (tenantId: string) => void;
  /** إعادة جلب العضويات/المستأجرين من قاعدة البيانات. */
  refreshTenant: () => void;
}

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /**
   * جلب العضويات النشطة ثم مستأجريها. `isCancelled` يسمح للأثر بإلغاء
   * التطبيق عند تغيّر المستخدم/التفكيك، بينما يبقى النداء اليدوي
   * (refreshTenant) بلا إلغاء.
   */
  const loadTenantData = useCallback(
    async (isCancelled: () => boolean = () => false) => {
      if (!userId) {
        if (isCancelled()) return;
        setMemberships([]);
        setTenants([]);
        setSelectedTenantId(null);
        setError('');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');
      try {
        const { data, error: membersError } = await supabase
          .from('memberships')
          .select('id, tenant_id, user_id, role, status, created_at, updated_at')
          .eq('user_id', userId)
          .eq('status', 'active')
          .order('created_at', { ascending: true });
        if (isCancelled()) return;
        if (membersError) throw membersError;

        const rows: Membership[] = (data ?? []).map((row) => ({
          id: String(row.id),
          tenant_id: String(row.tenant_id),
          user_id: String(row.user_id),
          role: row.role as TenantRole,
          status: row.status as MembershipStatus,
          created_at: String(row.created_at),
          updated_at: String(row.updated_at),
        }));
        setMemberships(rows);

        const tenantIds = rows.map((row) => row.tenant_id);
        if (tenantIds.length === 0) {
          setTenants([]);
        } else {
          const { data: tenantData, error: tenantsError } = await supabase
            .from('tenants')
            .select('id, name, slug, status, created_at, updated_at')
            .in('id', tenantIds);
          if (isCancelled()) return;
          if (tenantsError) throw tenantsError;
          setTenants(
            (tenantData ?? []).map((row) => ({
              id: String(row.id),
              name: String(row.name),
              slug: String(row.slug),
              status: row.status as Tenant['status'],
              created_at: String(row.created_at),
              updated_at: String(row.updated_at),
            }))
          );
        }
      } catch (err) {
        if (!isCancelled()) {
          setError(err instanceof Error ? err.message : 'تعذر تحميل عضويات المستأجر.');
        }
      } finally {
        if (!isCancelled()) setLoading(false);
      }
    },
    [userId]
  );

  useEffect(() => {
    let cancelled = false;

    // تأجيل بسيط لميكروتاسك: تحديث الحالة لا يتم بشكل متزامن داخل جسم الأثر
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      await loadTenantData(() => cancelled);
    })();

    return () => {
      cancelled = true;
    };
  }, [loadTenantData]);

  const refreshTenant = useCallback(() => {
    void loadTenantData();
  }, [loadTenantData]);

  const switchTenant = useCallback(
    (tenantId: string) => {
      // يُقبل فقط مستأجر ثبتت العضوية فيه من قاعدة البيانات — لا مدخلات حرة.
      if (memberships.some((membership) => membership.tenant_id === tenantId)) {
        setSelectedTenantId(tenantId);
      }
    },
    [memberships]
  );

  const currentMembership = useMemo(
    () =>
      memberships.find((membership) => membership.tenant_id === selectedTenantId) ??
      memberships[0] ??
      null,
    [memberships, selectedTenantId]
  );

  const currentTenant = useMemo(
    () => tenants.find((tenant) => tenant.id === currentMembership?.tenant_id) ?? null,
    [tenants, currentMembership]
  );

  const currentRole = currentMembership?.role ?? null;

  const permissions = useMemo<readonly Permission[]>(
    () => (currentRole ? ROLE_PERMISSIONS[currentRole] : []),
    [currentRole]
  );

  const can = useCallback(
    (permission: Permission) => (currentRole ? hasPermission(currentRole, permission) : false),
    [currentRole]
  );

  // مزامنة نطاق زمن التشغيل (للخدمات غير المرتبطة بـReact) مع المستأجر الحالي.
  useEffect(() => {
    setTenantScope({ tenant: currentTenant, membership: currentMembership });
  }, [currentTenant, currentMembership]);

  // تفريغ النطاق عند تفكيك المزوّد (مثلاً تسجيل الخروج).
  useEffect(() => () => clearTenantScope(), []);

  const value = useMemo<TenantContextValue>(
    () => ({
      loading,
      error,
      tenants,
      memberships,
      currentTenant,
      currentMembership,
      currentRole,
      permissions,
      can,
      switchTenant,
      refreshTenant,
    }),
    [
      loading,
      error,
      tenants,
      memberships,
      currentTenant,
      currentMembership,
      currentRole,
      permissions,
      can,
      switchTenant,
      refreshTenant,
    ]
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used within a TenantProvider');
  return ctx;
}
