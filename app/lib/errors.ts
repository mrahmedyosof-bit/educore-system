/**
 * تحويل أخطاء الشبكة/قاعدة البيانات الخام إلى رسائل
 * عربية مفهومة تُعرض مباشرة للمستخدم.
 */
export function getFriendlyErrorMessage(
  err: unknown,
  fallback = 'حدث خطأ غير متوقع. حاول مرة أخرى.'
): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : '';

  if (!raw.trim()) return fallback;

  // انقطاع الاتصال بالشبكة أو الخادم
  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(raw)) {
    return 'تعذر الاتصال بالخادم. تحقق من اتصال الإنترنت ثم أعد المحاولة.';
  }

  // مشاكل الجلسة والصلاحيات
  if (/jwt|expired|invalid claim|row-level security|permission denied/i.test(raw)) {
    return 'انتهت صلاحية الجلسة أو لا تملك صلاحية هذه العملية. أعد تسجيل الدخول.';
  }

  // جداول غير منشأة بعد
  if (/relation .* does not exist|schema cache/i.test(raw)) {
    return `${raw} — تأكد من تنفيذ سكريبتات SQL بالترتيب (01 ← 04) في Supabase.`;
  }

  if (/unique_student_name_subject_group/i.test(raw)) {
    return 'الطالب مسجل بالفعل في هذه المادة وهذه المجموعة';
  }

  if (/unique_student_name|duplicate key value/i.test(raw)) {
    return 'يوجد طالب مسجل بنفس الاسم.';
  }

  return raw;
}
