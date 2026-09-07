// lib/month.ts

export interface MonthOption {
  value: string;
  label: string;
}

export const ARABIC_MONTH_NAMES = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
] as const;

const MONTH_LOOKUP: Record<string, number> = {
  // Arabic
  'يناير': 1,
  'كانون الثاني': 1,
  'جانفي': 1,

  'فبراير': 2,
  'فيفري': 2,
  'شباط': 2,

  'مارس': 3,
  'اذار': 3,

  'ابريل': 4,
  'أبريل': 4,
  'افريل': 4,
  'نيسان': 4,

  'مايو': 5,
  'ماي': 5,

  'يونيو': 6,
  'جوان': 6,
  'حزيران': 6,

  'يوليو': 7,
  'جويلية': 7,
  'تموز': 7,

  'اغسطس': 8,
  'أغسطس': 8,
  'اوت': 8,
  'اب': 8,
  'آب': 8,

  'سبتمبر': 9,
  'ايلول': 9,
  'أيلول': 9,

  'اكتوبر': 10,
  'أكتوبر': 10,
  'تشرين الاول': 10,
  'تشرين الأول': 10,

  'نوفمبر': 11,
  'تشرين الثاني': 11,

  'ديسمبر': 12,
  'كانون الاول': 12,
  'كانون الأول': 12,

  // English
  'january': 1,
  'jan': 1,
  'february': 2,
  'feb': 2,
  'march': 3,
  'mar': 3,
  'april': 4,
  'apr': 4,
  'may': 5,
  'june': 6,
  'jun': 6,
  'july': 7,
  'jul': 7,
  'august': 8,
  'aug': 8,
  'september': 9,
  'sep': 9,
  'sept': 9,
  'october': 10,
  'oct': 10,
  'november': 11,
  'nov': 11,
  'december': 12,
  'dec': 12,
};

const normalizeMonthText = (value: unknown): string => {
  if (typeof value !== 'string') return '';

  return value
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670]/g, '') // تشكيل
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '') // ماركات اتجاه
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[,،؛;._\-/|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
};

/**
 * يحوّل أي صيغة شهر إلى مفتاح ثابت:
 * "أغسطس 2026" -> "2026-08"
 * "اغسطس ٢٠٢٦" -> "2026-08"
 * "2026-08" -> "2026-08"
 */
export const getMonthKey = (value: unknown): string => {
  const text = normalizeMonthText(value);
  if (!text) return '';

  const parts = text.split(' ').filter(Boolean);

  const year = parts.find((p) => /^\d{4}$/.test(p));
  const numericMonth = parts.find(
    (p) => /^\d{1,2}$/.test(p) && Number(p) >= 1 && Number(p) <= 12
  );

  if (year && numericMonth) {
    return `${year}-${numericMonth.padStart(2, '0')}`;
  }

  const name = parts
    .filter((p) => !/^\d+$/.test(p))
    .join(' ')
    .trim();

  if (year && name) {
    const monthNumber = MONTH_LOOKUP[name];
    if (monthNumber) {
      return `${year}-${String(monthNumber).padStart(2, '0')}`;
    }
  }

  return '';
};

/**
 * يحوّل المفتاح إلى اسم عربي جميل للعرض
 * "2026-08" -> "أغسطس 2026"
 */
export const getMonthLabel = (value: unknown): string => {
  const key = getMonthKey(value);
  if (!key) {
    return typeof value === 'string' ? value : '';
  }

  const [year, month] = key.split('-');
  const monthIndex = Number(month) - 1;

  if (!year || Number.isNaN(monthIndex) || !ARABIC_MONTH_NAMES[monthIndex]) {
    return key;
  }

  return `${ARABIC_MONTH_NAMES[monthIndex]} ${year}`;
};

export const getCurrentMonthKey = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

/**
 * خيارات الأشهر للسنة الدراسية
 * تبدأ من أغسطس وتكفي لسنة دراسية كاملة
 */
export const getSubscriptionMonthOptions = (academicYear: unknown): MonthOption[] => {
  const yearText = typeof academicYear === 'string' ? academicYear.trim().slice(0, 4) : '';
  const startYear = Number(yearText) || new Date().getFullYear();

  const map = new Map<string, string>();

  // 13 شهرًا لضمان وجود أغسطس وسبتمبر وما بعدهما
  for (let i = 0; i < 13; i++) {
    const monthIndex = (7 + i) % 12; // 7 = أغسطس
    const year = monthIndex >= 7 ? startYear : startYear + 1;
    const value = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
    map.set(value, getMonthLabel(value));
  }

  return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
};