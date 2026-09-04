/**
 * أدوات إشعارات واتساب لأولياء الأمور.
 * تعتمد على روابط wa.me الرسمية — بدون مفاتيح API أو خدمات خارجية.
 */

/**
 * توحيد أرقام الهواتف المصرية للصيغة الدولية (2010XXXXXXXX).
 * يعيد null إذا كان الرقم فارغاً.
 */
export const normalizeEgyptianPhone = (phone: string): string | null => {
  const cleaned = phone.replace(/\D/g, '');
  if (!cleaned) return null;
  if (cleaned.startsWith('0')) return '20' + cleaned.slice(1);
  if (cleaned.startsWith('20')) return cleaned;
  return cleaned;
};

/**
 * بناء رابط واتساب جاهز برسالة معبأة.
 * يعيد null إذا لم يوجد رقم صالح.
 */
export const buildWhatsAppUrl = (
  phone: string | null | undefined,
  message: string
): string | null => {
  const normalized = phone ? normalizeEgyptianPhone(phone) : null;
  if (!normalized) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
};

/** فتح محادثة واتساب مع ولي الأمر في تبويب جديد. */
export const openWhatsApp = (
  phone: string | null | undefined,
  message: string
): boolean => {
  const url = buildWhatsAppUrl(phone, message);
  if (!url) return false;
  window.open(url, '_blank');
  return true;
};

const CENTER_NAME = 'مركز EduCore التعليمي';

// ==================== قوالب رسائل الحضور ====================

export const attendanceMessage = (
  studentName: string,
  status: 'present' | 'absent' | 'late' | 'excused',
  date: string
): string => {
  const statusText =
    status === 'present'
      ? 'حضر حصة اليوم بنجاح ✅'
      : status === 'absent'
        ? 'كان غائباً عن حصة اليوم ❌'
        : status === 'excused'
          ? 'حضر حصة اليوم بعذر رسمي 📝'
          : 'حضر حصة اليوم متأخراً ⏰';

  return [
    `أهلاًً ولي أمر الطالب/ة: ${studentName}`,
    ``,
    `نود إعلامكم بأن الطالب/ة ${statusText} بتاريخ ${date}.`,
    status === 'absent' ? 'نرجو المتابعة والتكرم بإبلاغنا بسبب الغياب.' : '',
    ``,
    `شكراً لتعاونكم 🌹`,
    CENTER_NAME,
  ]
    .filter(Boolean)
    .join('\n');
};

// ==================== قوالب رسائل المالية ====================

export const paymentRecordedMessage = (
  studentName: string,
  amountPaid: number,
  amountRemaining: number | null,
  monthName: string
): string => {
  const remaining = Number(amountRemaining ?? 0);
  const remainingLine =
    remaining > 0
      ? `المتبقي على الطالب/ة: ${remaining} ج.م`
      : 'تم سداد كامل المستحقات لهذا الشهر ✅';

  return [
    `أهلاً ولي أمر الطالب/ة: ${studentName}`,
    ``,
    `تم استلام مبلغ قدره ${amountPaid} ج.م عن شهر ${monthName}.`,
    remainingLine,
    ``,
    `شكراً لتعاونكم 🌹`,
    CENTER_NAME,
  ].join('\n');
};

export const paymentReminderMessage = (
  studentName: string,
  amountRemaining: number,
  monthName: string
): string =>
  [
    `أهلاً ولي أمر الطالب/ة: ${studentName}`,
    ``,
    `نود تذكيركم بوجود مبلغ متبقٍ قدره ${amountRemaining} ج.م عن شهر ${monthName}.`,
    `نرجو التكرم بالسداد في أقرب وقت مناسب.`,
    ``,
    `شكراً لتعاونكم 🌹`,
    CENTER_NAME,
  ].join('\n');

/** رسالة مطالبة بالمديونية المستحقة (due_amount) بنقرة واحدة. */
export const dueReminderMessage = (
  studentName: string,
  dueAmount: number
): string =>
  [
    `أهلاً ولي أمر الطالب/ة: ${studentName}`,
    ``,
    `نود إحاطتكم بوجود مديونية مستحقة قدرها ${dueAmount} ج.م على اشتراك المركز.`,
    `نرجو التكرم بالسداد في أقرب وقت مناسب، وجزاكم الله خيراً.`,
    ``,
    `شكراً لتعاونكم 🌹`,
    CENTER_NAME,
  ].join('\n');

// ==================== قوالب رسائل الدرجات ====================

export const gradeMessage = (
  studentName: string,
  examName: string,
  score: number,
  maxScore: number
): string => {
  const percent = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  const remark =
    percent >= 85
      ? 'أداء ممتاز، واصل التميز 🌟'
      : percent >= 60
        ? 'أداء جيد، ونأمل الاستمرار 👍'
        : 'نتمنى المتابعة والدعم في المنزل 💪';

  return [
    `أهلاً ولي أمر الطالب/ة: ${studentName}`,
    ``,
    `نتيجة اختبار "${examName}":`,
    `الدرجة: ${score} من ${maxScore} (${percent}%)`,
    remark,
    ``,
    CENTER_NAME,
  ].join('\n');
};
