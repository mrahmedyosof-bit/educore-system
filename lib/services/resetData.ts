import { supabase } from '@/lib/supabase';

/**
 * أهداف التصفية مرتبة بحيث تُحذف الجداول التابعة
 * قبل الجداول الأصلية (الطلاب أخيراً).
 */
export const RESET_TARGETS = [
  { key: 'payments', label: 'مدفوعات الطلاب' },
  { key: 'attendance', label: 'سجلات الحضور' },
  { key: 'grades', label: 'درجات الاختبارات' },
  { key: 'group_students', label: 'ربط الطلاب بالمجموعات' },
  { key: 'students', label: 'الطلاب' },
  { key: 'groups', label: 'المجموعات' },
  { key: 'subjects', label: 'المواد الدراسية' },
  { key: 'expenses', label: 'المصروفات' },
  { key: 'exams', label: 'تعريفات الاختبارات' },
] as const;

export type ResetTargetKey = (typeof RESET_TARGETS)[number]['key'];

export async function clearTable(key: ResetTargetKey, notify = true): Promise<void> {
  // شرط gt ضروري لقبول عملية الحذف من PostgREST
  const { error } = await supabase.from(key).delete().gt('id', 0);
  if (error) throw error;
  if (notify && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('educore:data-reset'));
  }
}

/** مسح شامل لكل بيانات التشغيل والبدء ببيئة نظيفة تماماً. */
export async function clearAllData(): Promise<void> {
  for (const target of RESET_TARGETS) {
    await clearTable(target.key, false);
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('educore:data-reset'));
  }
}
