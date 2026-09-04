import { supabase } from '@/lib/supabase';

/**
 * أهداف التصفية مرتبة بحيث تُحذف الجداول التابعة
 * قبل الجداول الأصلية (الطلاب أخيراً).
 */
export const RESET_TARGETS = [
  { key: 'attendance', label: 'سجلات الحضور' },
  { key: 'grades', label: 'درجات الاختبارات' },
  { key: 'payments', label: 'مدفوعات الطلاب' },
  { key: 'expenses', label: 'المصروفات' },
  { key: 'exams', label: 'تعريفات الاختبارات' },
  { key: 'students', label: 'الطلاب' },
] as const;

export type ResetTargetKey = (typeof RESET_TARGETS)[number]['key'];

export async function clearTable(key: ResetTargetKey): Promise<void> {
  // شرط gt ضروري لقبول عملية الحذف من PostgREST
  const { error } = await supabase.from(key).delete().gt('id', 0);
  if (error) throw error;
}

/** مسح شامل لكل بيانات التشغيل والبدء ببيئة نظيفة تماماً. */
export async function clearAllData(): Promise<void> {
  for (const target of RESET_TARGETS) {
    await clearTable(target.key);
  }
}
