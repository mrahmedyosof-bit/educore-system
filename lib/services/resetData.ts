import { supabase } from '@/lib/supabase';

/**
 * أهداف التصفية مرتبة بحيث تُحذف الجداول التابعة
 * قبل الجداول الأصلية (الطلاب أخيراً).
 */
export const RESET_TARGETS = [
  { key: 'payments', label: 'مدفوعات الطلاب' },
  { key: 'attendance', label: 'سجلات الحضور' },
  { key: 'exam_results', label: 'نتائج الاختبارات' },
  { key: 'group_students', label: 'ربط الطلاب بالمجموعات' },
  { key: 'grades', label: 'درجات الاختبارات' },
  { key: 'students', label: 'الطلاب' },
  { key: 'groups', label: 'المجموعات' },
  { key: 'subjects', label: 'المواد الدراسية' },
  { key: 'expenses', label: 'المصروفات' },
  { key: 'exams', label: 'تعريفات الاختبارات' },
] as const;

export type ResetTargetKey = (typeof RESET_TARGETS)[number]['key'];

const OPTIONAL_RESET_TABLES = new Set<ResetTargetKey>([
  'exam_results',
  'group_students',
  'groups',
  'subjects',
]);

const isMissingTableError = (error: { code?: string | null } | null): boolean =>
  error?.code === '42P01' || error?.code === 'PGRST205';

export async function clearTable(key: ResetTargetKey, notify = true): Promise<void> {
  // شرط gt ضروري لقبول عملية الحذف من PostgREST
  const { error } = await supabase.from(key).delete().gt('id', 0);
  if (error) {
    if (OPTIONAL_RESET_TABLES.has(key) && isMissingTableError(error)) return;
    const resetError = new Error(`فشل مسح ${RESET_TARGETS.find((target) => target.key === key)?.label ?? key}: ${error.message}`);
    Object.assign(resetError, error);
    throw resetError;
  }
  if (notify && typeof window !== 'undefined') {
    setTimeout(() => window.dispatchEvent(new CustomEvent('educore:data-reset')), 0);
  }
}

/** مسح شامل لكل بيانات التشغيل والبدء ببيئة نظيفة تماماً. */
export async function clearAllData(): Promise<void> {
  for (const target of RESET_TARGETS) {
    await clearTable(target.key, false);
  }
  if (typeof window !== 'undefined') {
    setTimeout(() => window.dispatchEvent(new CustomEvent('educore:data-reset')), 0);
  }
}
