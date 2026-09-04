/**
 * أنواع أساس المستأجرين (Phase 6B — Tenant Foundation).
 * المصدر الموثوق لهذه القيم هو قاعدة البيانات (جدولا tenants وmemberships)
 * بعد المصادقة — لا localStorage ولا user_metadata.
 */

/** أدوار العضوية داخل المستأجر — واضحة وقابلة للتوسع عبر Migration لاحق. */
export type TenantRole = 'OWNER' | 'ADMIN' | 'ASSISTANT' | 'TEACHER';

/** حالة المستأجر (مطابقة لـ CHECK في قاعدة البيانات). */
export type TenantStatus = 'active' | 'suspended' | 'archived';

/** حالة العضوية (مطابقة لـ CHECK في قاعدة البيانات). */
export type MembershipStatus = 'active' | 'suspended';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  created_at: string;
  updated_at: string;
}

export interface Membership {
  id: string;
  tenant_id: string;
  user_id: string;
  role: TenantRole;
  status: MembershipStatus;
  created_at: string;
  updated_at: string;
}

/** قائمة الأدوار للتكرار في الواجهة لاحقاً (مصدر الحقيقة يبقى الـunion أعلاه). */
export const TENANT_ROLES = ['OWNER', 'ADMIN', 'ASSISTANT', 'TEACHER'] as const;
