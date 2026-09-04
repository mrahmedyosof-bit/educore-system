/**
 * نظام الصلاحيات المبسط (RBAC):
 * - admin     : مدير النظام — كل الشاشات.
 * - assistant : مساعد — الطلاب والحضور والدرجات فقط (بدون مالية/خزينة/إعدادات).
 *
 * مصدر الصلاحية الوحيد هو جلسة Supabase (حقل role داخل user_metadata في خادم
 * المصادقة)، ولا يمكن رفع الصلاحية من المتصفح. القيمة الافتراضية عند غياب
 * الحقل هي "مساعد" (أقل صلاحية ممكنة).
 *
 * يُسمح للمدير فقط بتقييد عرض الشاشات محلياً إلى وضع المساعد (خفض فقط،
 * دون رفع)، ويُحفظ هذا التفضيل البصري في localStorage بوصفه تفضيل واجهة
 * وليس مصدر صلاحية.
 */

import type { Session } from '@supabase/supabase-js';
import type { TenantRole } from '@/types/tenant';

export type Role = 'admin' | 'assistant';

/** مفتاح قديم كان يُستخدم كمصدر صلاحية — يُزال تلقائياً ولا يُقرأ أبداً. */
const LEGACY_ROLE_STORAGE_KEY = 'educore-role';

/** تفضيل عرض فقط: تقييد ذاتي اختياري للمدير إلى واجهة المساعد. */
const ROLE_VIEW_STORAGE_KEY = 'educore-role-view';

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'مدير النظام 👑',
  assistant: 'مساعد 🧑‍💼',
};

/** الشاشات المسموحة لكل دور (قائمة بيضاء). */
export const ROLE_ALLOWED_TABS: Record<Role, string[]> = {
  admin: [
    'dashboard',
    'students',
    'attendance',
    'exams',
    'grades',
    'finance',
    'expenses',
    'inventory',
    'reports',
    'setup',
  ],
  assistant: ['dashboard', 'students', 'attendance', 'exams', 'grades'],
};

/**
 * استخراج الدور من جلسة المصادقة. المصدر الوحيد الموثوق هو الخادم
 * (user_metadata في Supabase Auth)، والافتراضي "مساعد" إذا غاب الحقل
 * أو كانت قيمته غير معروفة.
 *
 * TODO(Phase 6C): مصدر الدور النهائي سيكون جدول memberships عبر
 * TenantContext (أنواع TenantRole في types/tenant.ts)، وليس user_metadata.
 * تبقى هذه الدالة مؤقتاً لتوافق الواجهة الحالية فقط ولا يجوز توسيعها
 * كمرجع صلاحيات جديد؛ abstraction القابل للاستبدال هو useTenant().currentRole.
 */
export function roleFromSession(session: Session | null): Role {
  const raw = session?.user?.user_metadata?.role;
  return raw === 'admin' ? 'admin' : 'assistant';
}

/** إزالة مفتاح الصلاحية القديم من التخزين المحلي إن وُجد. */
export function purgeLegacyRoleStorage(): void {
  try {
    window.localStorage.removeItem(LEGACY_ROLE_STORAGE_KEY);
  } catch {
    /* تجاهل */
  }
}

/**
 * قراءة تفضيل "وضع العرض" المقيَّد ذاتياً. يعيد 'assistant' فقط أو null —
 * لا يمكن لهذا التفضيل أن يمنح صلاحية أعلى من صلاحية الجلسة.
 */
export function getStoredRoleView(): 'assistant' | null {
  try {
    const stored = window.localStorage.getItem(ROLE_VIEW_STORAGE_KEY);
    return stored === 'assistant' ? 'assistant' : null;
  } catch {
    return null;
  }
}

/** حفظ/مسح تفضيل وضع العرض (تمرير null يمسحه). */
export function storeRoleView(view: 'assistant' | null): void {
  try {
    if (view === 'assistant') {
      window.localStorage.setItem(ROLE_VIEW_STORAGE_KEY, view);
    } else {
      window.localStorage.removeItem(ROLE_VIEW_STORAGE_KEY);
    }
  } catch {
    /* تجاهل */
  }
}

export function isTabAllowed(role: Role, tabId: string): boolean {
  return ROLE_ALLOWED_TABS[role].includes(tabId);
}

/**
 * جسر مؤقت بين نموذج العرض القديم وأدوار المستأجرين الرسمية: يُستخدم في
 * المراحل اللاحقة عند مقارنة الصلاحيات القديمة بعضوية الـTenant، ولا يمنح
 * أي صلاحية بحد ذاته.
 */
export function legacyRoleToTenantRole(role: Role): TenantRole {
  return role === 'admin' ? 'ADMIN' : 'ASSISTANT';
}
