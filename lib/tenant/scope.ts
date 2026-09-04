/**
 * نطاق المستأجر في زمن التشغيل (Phase 6C — Tenant-aware Data Layer).
 *
 * الغرض: مصدر واحد وموحّد لمعرفة «المستأجر/العضوية/الدور/الصلاحيات» الحالية
 * بالنسبة للكود غير المرتبط بـReact (خدمات lib/services/*)، بحيث لا تنتشر
 * طريقة الحصول على المستأجر عشوائياً عبر التطبيق.
 *
 * قواعد أمان مهمة:
 * - التخزين في الذاكرة فقط (متغيّر على مستوى الوحدة). لا localStorage ولا
 *   user_metadata ولا educore-role. هذه ليست حدود أمان؛ الحدود الحقيقية
 *   لاحقاً هي Supabase RLS.
 * - هذه الوحدة تُدار من جهة العميل فقط: الذي يكتب فيها هو TenantProvider
 *   (عبر setTenantScope/clearTenantScope). على الخادم تبقى فارغة (EMPTY_SCOPE).
 * - يمكن لاحقاً تحويل هذا النطاق إلى فرض على الخادم/RLS دون إعادة كتابة
 *   التطبيق: الخدمات تقرأ من هنا اليوم، وغداً يُستبدل المصدر بـRLS.
 */

import type { Membership, Tenant, TenantRole } from '@/types/tenant';
import { ROLE_PERMISSIONS, type Permission } from '@/lib/permissions';

export interface TenantScope {
  tenant: Tenant | null;
  membership: Membership | null;
  role: TenantRole | null;
  permissions: readonly Permission[];
}

const EMPTY_SCOPE: TenantScope = {
  tenant: null,
  membership: null,
  role: null,
  permissions: [],
};

let currentScope: TenantScope = EMPTY_SCOPE;

/**
 * يكتب النطاق الحالي. يُستدعى من TenantProvider فقط عند تغيّر المستأجر/العضوية.
 * الدور والصلاحيات مشتقّان من العضوية (membership.role) — لا من أي مصدر آخر.
 */
export function setTenantScope(input: {
  tenant: Tenant | null;
  membership: Membership | null;
}): void {
  const role = input.membership?.role ?? null;
  currentScope = {
    tenant: input.tenant,
    membership: input.membership,
    role,
    permissions: role ? ROLE_PERMISSIONS[role] : [],
  };
}

/** يفرّغ النطاق (تسجيل خروج، أو تفكيك المزوّد، أو عدم وجود عضوية). */
export function clearTenantScope(): void {
  currentScope = EMPTY_SCOPE;
}

/** قراءة النطاق الحالي (قد يكون فارغاً في الوضع الأحادي القديم). */
export function getTenantScope(): TenantScope {
  return currentScope;
}

/** معرف المستأجر الحالي أو null إن لم يُختَر مستأجر بعد. */
export function getCurrentTenantId(): string | null {
  return currentScope.tenant?.id ?? null;
}

/**
 * حارس للاستخدام المستقبلي من الخدمات التي ستصبح مرتبطة بالمستأجر
 * (بعد إضافة عمود tenant_id في هجرة لاحقة). يرمي خطأً إن لم يكن هناك
 * مستأجر نشط، فيمنع استدعاء الخدمة قبل اختيار المستأجر.
 *
 * ملاحظة (Phase 6C): لم يُربط هذا الحارس بالخدمات القديمة بعد، لأن جداولها
 * لا تحتوي tenant_id، ولأن فرضه الآن سيكسر التشغيل الأحادي الحالي.
 */
export function requireTenantScope(): {
  tenant: Tenant;
  membership: Membership;
  role: TenantRole;
} {
  const { tenant, membership, role } = currentScope;
  if (!tenant || !membership || !role) {
    throw new Error('لم يتم اختيار مستأجر نشط بعد.');
  }
  return { tenant, membership, role };
}
