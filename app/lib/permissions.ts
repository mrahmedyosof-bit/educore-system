import type { TenantRole } from '@/types/tenant';

/**
 * فهرس الصلاحيات (Phase 6B): قائمة مرجعية قابلة للتوسع بصيغة
 * `resource.action`. في هذه المرحلة الفهرس مرجع فقط — الواجهة الحالية
 * لا تعتمد عليه، وسيُربط لاحقاً عبر TenantContext.
 */
export const PERMISSIONS = [
  'students.read',
  'students.create',
  'students.update',
  'students.delete',
  'attendance.read',
  'attendance.create',
  'attendance.update',
  'payments.read',
  'payments.create',
  'payments.update',
  'payments.delete',
  'expenses.read',
  'expenses.create',
  'expenses.update',
  'expenses.delete',
  'inventory.read',
  'exams.read',
  'exams.create',
  'exams.update',
  'exams.delete',
  'grades.read',
  'grades.create',
  'grades.update',
  'reports.read',
  'settings.read',
  'settings.update',
  'users.read',
  'users.create',
  'users.update',
  'users.delete',
  'audit.read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const OWNER_PERMISSIONS: readonly Permission[] = PERMISSIONS;

/* إدارة الأعضاء (كتابة) محفوظة للمالك في هذه الأساسات؛ القراءة للإدارة. */
const ADMIN_PERMISSIONS: readonly Permission[] = PERMISSIONS.filter(
  (p) => p === 'users.read' || !p.startsWith('users.')
);

const ASSISTANT_PERMISSIONS: readonly Permission[] = [
  'students.read',
  'students.create',
  'students.update',
  'attendance.read',
  'attendance.create',
  'attendance.update',
  'exams.read',
  'grades.read',
  'grades.create',
  'grades.update',
];

const TEACHER_PERMISSIONS: readonly Permission[] = [
  'students.read',
  'attendance.read',
  'attendance.create',
  'attendance.update',
  'grades.read',
  'grades.create',
  'grades.update',
];

/** الصلاحيات الممنوحة لكل دور (قائمة بيضاء). */
export const ROLE_PERMISSIONS: Record<TenantRole, readonly Permission[]> = {
  OWNER: OWNER_PERMISSIONS,
  ADMIN: ADMIN_PERMISSIONS,
  ASSISTANT: ASSISTANT_PERMISSIONS,
  TEACHER: TEACHER_PERMISSIONS,
};

export function hasPermission(role: TenantRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * توحيد تفويض الواجهة (Phase 6C): كل تبويب يتطلب صلاحية `resource.action`
 * واحدة. هذا هو الـabstraction الموحّد الذي تستخدمه الواجهة بدل فحوص
 * isTabAllowed المتناثرة، تمهيداً لنقل التفويض الحقيقي إلى Supabase RLS لاحقاً.
 *
 * ملاحظة: هذا فحص واجهة فقط وليس حدّاً أمنياً.
 */
export const TAB_PERMISSIONS: Record<string, Permission> = {
  dashboard: 'students.read',
  students: 'students.read',
  attendance: 'attendance.read',
  exams: 'exams.read',
  grades: 'grades.read',
  finance: 'payments.read',
  expenses: 'expenses.read',
  inventory: 'inventory.read',
  reports: 'reports.read',
  setup: 'settings.read',
};

/**
 * هل يحق للدور عرض التبويب؟ التبويب غير المعروف يُرفض (سلوك القائمة البيضاء
 * السابق نفسه). تعتمد على hasPermission، فتمنح ADMIN كل التبويبات العشرة
 * وASSISTANT تبويبات (لوحة التحكم/الطلاب/الحضور/الاختبارات/الدرجات) فقط —
 * مطابق تماماً للسلوك القديم.
 */
export function canAccessTab(role: TenantRole, tabId: string): boolean {
  const required = TAB_PERMISSIONS[tabId];
  if (!required) return false;
  return hasPermission(role, required);
}
