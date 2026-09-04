// ==================== الثوابت المالية ====================

export const STAGES = [
  'المرحلة الابتدائية',
  'المرحلة الإعدادية',
  'المرحلة الثانوية',
] as const;

export const ALL_GRADES = [
  'الصف الأول الابتدائي',
  'الصف الثاني الابتدائي',
  'الصف الثالث الابتدائي',
  'الصف الرابع الابتدائي',
  'الصف الخامس الابتدائي',
  'الصف السادس الابتدائي',
  'الصف الأول الإعدادي',
  'الصف الثاني الإعدادي',
  'الصف الثالث الإعدادي',
  'الصف الأول الثانوي',
  'الصف الثاني الثانوي',
  'الصف الثالث الثانوي',
] as const;

export const INITIAL_FORM_DATA = {
  barcode: '',
  name: '',
  stage: 'المرحلة الإعدادية',
  grade: 'الصف الثالث الإعدادي',
  group: 'مجموعة 1',
  subject: 'الرياضيات',
  dueAmount: 0,
  discountAmount: 0,
  isExempt: false,
  guardianName: '',
  guardianPhone: '',
  guardianWhatsapp: '',
  guardianNotes: '',
  address: '',
  school: '',
};

export type StudentFormData = typeof INITIAL_FORM_DATA;

export const INPUT_CLASS =
  'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500';

export const formatCurrency = (amount: number): string =>
  `${Math.round(amount).toLocaleString('ar-EG')} ج.م`;

// حساب حالة الشهر
export const getMonthStatus = (monthName: string, currentMonth: string) => {
  const parseMonth = (monthStr: string): { month: number; year: number } | null => {
    const months: Record<string, number> = {
      'يناير': 1, 'فبراير': 2, 'مارس': 3, 'أبريل': 4,
      'مايو': 5, 'يونيو': 6, 'يوليو': 7, 'أغسطس': 8,
      'سبتمبر': 9, 'أكتوبر': 10, 'نوفمبر': 11, 'ديسمبر': 12
    };
    const parts = monthStr.trim().split(' ');
    if (parts.length >= 2) {
      const month = months[parts[0]];
      const year = parseInt(parts[1], 10);
      if (month && !isNaN(year)) return { month, year };
    }
    return null;
  };

  const currentParsed = parseMonth(currentMonth);
  const paymentParsed = parseMonth(monthName);

  if (currentParsed && paymentParsed) {
    const currentValue = currentParsed.year * 12 + currentParsed.month;
    const paymentValue = paymentParsed.year * 12 + paymentParsed.month;
    const isCurrent = paymentValue === currentValue;
    const isPast = paymentValue < currentValue;
    const isFuture = paymentValue > currentValue;
    return { isCurrent, isPast, isFuture };
  }

  // Fallback
  return {
    isCurrent: monthName === currentMonth,
    isPast: monthName !== currentMonth && monthName !== '',
    isFuture: false,
  };
};

export const getCurrentMonthName = (): string => {
  return new Date().toLocaleString('ar-EG-u-nu-latn', { month: 'long', year: 'numeric' });
};

export const getTodayDateISO = (): string => {
  return new Date().toISOString().split('T')[0];
};

export const normalizeMonth = (month: string): string => {
  return month
    .trim()
    .replace(/أ/g, 'ا')
    .replace(/إ/g, 'ا')
    .replace(/آ/g, 'ا')
    .replace(/\s+/g, ' ');
};

export const getMonthStatusWithPastDue = (monthName: string, currentMonth: string, isPastDueDate: boolean) => {
  const { isCurrent, isPast, isFuture } = getMonthStatus(monthName, currentMonth);

  if (isFuture) {
    return { isCurrent: false, isPast: false, isFuture: true };
  }

  if (isPast) {
    return { isCurrent: false, isPast: true, isFuture: false };
  }

  // Current month
  if (isCurrent) {
    if (isPastDueDate) {
      return { isCurrent: false, isPast: true, isFuture: false };
    }
    return { isCurrent: true, isPast: false, isFuture: false };
  }

  return { isCurrent: false, isPast: false, isFuture: false };
};