'use client';
import React, { startTransition, useDeferredValue, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  addPayment,
  updatePayment,
  getPayments,
  PaymentRecord as ServicePaymentRecord,
} from '@/lib/services/payments';
import { getStudents, getUniqueStudents, Student as BaseStudent } from '@/lib/services/students';
import { getPriceMatrix, priceKey, type PriceMatrix } from '@/lib/services/settings';
import { supabase } from '@/lib/supabase';
import { paymentRecordedMessage, paymentReminderMessage } from '@/lib/whatsapp';
import WhatsAppButton from './WhatsAppButton';
import { emitPaymentUpdate } from '@/lib/events';
import { calculateFinancialSummary, toFiniteAmount } from '@/lib/calculations';
import { useCenterSettings } from '@/hooks/useCenterSettings';
import {
  STAGES,
  ALL_GRADES,
  INITIAL_FORM_DATA,
  INPUT_CLASS,
  getMonthStatus,
  getCurrentMonthName,
  getTodayDateISO,
  type StudentFormData,
} from './finance/constants';

// توسيع واجهة الطالب لدعم كافة الخصائص الاختيارية المتوقعة
export type Student = BaseStudent;

type FinanceStudent = Student & {
  is_exempt?: boolean | null;
  discount?: number | null;
  discount_amount?: number | null;
};

// ==================== دالة تنسيق العملات ====================
const formatCurrency = (amount: number): string =>
  `${Math.round(amount).toLocaleString('ar-EG')} ج.م`;

const isStudentExempt = (student: Student): boolean => {
  const financeStudent = student as FinanceStudent;
  return financeStudent.is_exempt === true || financeStudent.isExempt === true;
};

const getStudentDiscount = (student: Student): number => {
  const financeStudent = student as FinanceStudent;
  return Math.max(
    0,
    toFiniteAmount(financeStudent.discount ?? financeStudent.discount_amount ?? student.discountAmount)
  );
};

const cleanMonthOption = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  const arabicIndicDigits = '٠١٢٣٤٥٦٧٨٩';
  const easternArabicDigits = '۰۱۲۳۴۵۶۷۸۹';

  return value
    .normalize('NFKC')
    .replace(/[٠-٩۰-۹]/g, (digit) => {
      const arabicIndex = arabicIndicDigits.indexOf(digit);
      const easternIndex = easternArabicDigits.indexOf(digit);
      return String(arabicIndex >= 0 ? arabicIndex : easternIndex);
    })
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/[,،\-_\.]/g, ' ')
    .replace(/([\u0600-\u06FF]+)(\d+)/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
};

// تهريب قيم النصوص قبل حقنها في نوافذ الطباعة (document.write)
const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// طوابع أحداث المدفوعات
let paymentEventSeq = 0;

interface PaymentRecord extends ServicePaymentRecord {
  student?: Student;
}

export default function FinanceTab() {
  // ==================== إعدادات السنتر (من الخطاف الموحد) ====================
  const { settings: centerSettings, updateCenterName } = useCenterSettings();
  const [editingCenterName, setEditingCenterName] = useState(false);
  const [tempCenterName, setTempCenterName] = useState(centerSettings.centerName);

  const handleSaveCenterName = () => {
    if (tempCenterName.trim()) {
      updateCenterName(tempCenterName.trim());
    }
    setEditingCenterName(false);
  };

  // ==================== States الأصلية ====================
  const [students, setStudents] = useState<Student[]>([]);
  const [uniqueStudents, setUniqueStudents] = useState<Student[]>([]);
  const [priceMatrix, setPriceMatrix] = useState<PriceMatrix>({});
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [fetching, setFetching] = useState<boolean>(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [lastPayment, setLastPayment] = useState<{
    studentId: number;
    transactionId: string;
    paid: number;
    remaining: number | null;
    month: string;
    paymentDate: string;
  } | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  const showToast = useCallback((next: { type: 'success' | 'error'; text: string }) => {
    setToast(next);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const playSuccessSound = useCallback(() => {
    try {
      if (typeof window === 'undefined') return;
      const windowAudio = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
      const AudioCtx = windowAudio.AudioContext || windowAudio.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      const playTone = (freq: number, start: number, duration: number) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(freq, now + start);
        gain.gain.setValueAtTime(0, now + start);
        gain.gain.linearRampToValueAtTime(0.15, now + start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start(now + start);
        oscillator.stop(now + start + duration + 0.02);
      };
      playTone(880, 0, 0.12);
      playTone(1318.5, 0.1, 0.16);
      setTimeout(() => {
        void ctx.close();
      }, 500);
    } catch {}
  }, []);

  const [filterMonth, setFilterMonth] = useState('الكل');
  const [filterGrade, setFilterGrade] = useState('الكل');
  const [filterSubject, setFilterSubject] = useState('كل المواد');
  const [quickCollectionSearch, setQuickCollectionSearch] = useState('');
  const [resetPaymentsOpen, setResetPaymentsOpen] = useState(false);
  const [zeroDebtOpen, setZeroDebtOpen] = useState(false);
  const [purgeMonthOpen, setPurgeMonthOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [touchedRemaining, setTouchedRemaining] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formData, setFormData] = useState<StudentFormData>(INITIAL_FORM_DATA);
  const [selectedStage, setSelectedStage] = useState<string>('');
  const [selectedGrade, setSelectedGrade] = useState<string>('');
  const [amountPaid, setAmountPaid] = useState<string>('');
  const [amountRemaining, setAmountRemaining] = useState<string>('');
  const [discountType, setDiscountType] = useState<'amount' | 'percentage'>('amount');
  const [discountValue, setDiscountValue] = useState<string>('0');
  const [monthName, setMonthName] = useState<string>('');
  const [editingPaymentId, setEditingPaymentId] = useState<number | null>(null);
  const [showPaidStudentsModal, setShowPaidStudentsModal] = useState(false);
  const [paidStudentsSearch, setPaidStudentsSearch] = useState('');
  const [showTodayPaymentsModal, setShowTodayPaymentsModal] = useState(false);
  const [todayPaymentsSearch, setTodayPaymentsSearch] = useState('');
  const [quickPayStudent, setQuickPayStudent] = useState<Student | null>(null);
  const [quickPayAmount, setQuickPayAmount] = useState('');
  const [quickPayNotes, setQuickPayNotes] = useState('');
  const [quickPayOpen, setQuickPayOpen] = useState(false);
  const [quickPaySubmitting, setQuickPaySubmitting] = useState(false);
  const [showBulkPaymentModal, setShowBulkPaymentModal] = useState(false);
  const [bulkPaymentStage, setBulkPaymentStage] = useState<string>('');
  const [bulkPaymentGrade, setBulkPaymentGrade] = useState<string>('');
  const [bulkPaymentGroup, setBulkPaymentGroup] = useState<string>('');
  const [bulkPaymentSubject, setBulkPaymentSubject] = useState<string>('');
  const [bulkPaymentMonth, setBulkPaymentMonth] = useState<string>('');
  const [bulkPaymentStudents, setBulkPaymentStudents] = useState<Array<{
    student: Student;
    amountPaid: number;
    amountRemaining: number;
    defaultPrice: number;
    hasPayment: boolean;
    existingPaymentId?: number;
  }>>([]);
  const [bulkPaymentLoading, setBulkPaymentLoading] = useState(false);
  const deferredQuickCollectionSearch = useDeferredValue(quickCollectionSearch);
  const deferredPaidStudentsSearch = useDeferredValue(paidStudentsSearch);
  const deferredTodayPaymentsSearch = useDeferredValue(todayPaymentsSearch);

  const studentsById = useMemo(
    () => new Map(students.map((student) => [student.id, student])),
    [students]
  );

  const selectedPrice = useMemo(() => {
    const st = selectedStudentId ? studentsById.get(Number(selectedStudentId)) : undefined;
    if (!st?.grade) return undefined;
    const subject = selectedSubjectId || st.subject;
    if (!subject) return undefined;
    const price = priceMatrix[priceKey(st.grade, subject)];
    return typeof price === 'number' && Number.isFinite(price) ? price : undefined;
  }, [selectedStudentId, selectedSubjectId, studentsById, priceMatrix]);

  const selectedDiscountAmount = useMemo(() => {
    const value = Number(discountValue);
    if (selectedPrice === undefined || !Number.isFinite(value) || value < 0) return 0;
    return discountType === 'percentage'
      ? selectedPrice * Math.min(100, value) / 100
      : Math.min(selectedPrice, value);
  }, [discountType, discountValue, selectedPrice]);

  const selectedDue = useMemo(() => {
    const selectedStudent = selectedStudentId
      ? studentsById.get(Number(selectedStudentId))
      : undefined;
    if (selectedStudent && isStudentExempt(selectedStudent)) return 0;
    return selectedPrice === undefined
      ? undefined
      : Math.max(0, selectedPrice - selectedDiscountAmount);
  }, [selectedStudentId, studentsById, selectedPrice, selectedDiscountAmount]);

  const getStudentFinalFee = useCallback((student: Student): number => {
    if (isStudentExempt(student) || !student.grade || !student.subject) return 0;
    const price = toFiniteAmount(priceMatrix[priceKey(student.grade, student.subject)]);
    return Math.max(0, price - getStudentDiscount(student));
  }, [priceMatrix]);

  const getStudentNetAmountDue = useCallback((student: Student): number => {
    if (isStudentExempt(student) || !student.grade || !student.subject) return 0;
    const groupPrice = toFiniteAmount(priceMatrix[priceKey(student.grade, student.subject)]);
    return Math.max(0, groupPrice - getStudentDiscount(student));
  }, [priceMatrix]);

  const applyAutoRemaining = (paidRaw: string, due: number | undefined) => {
    if (due === undefined || touchedRemaining) return;
    const paid = Number(paidRaw);
    const remaining = Number.isFinite(paid) && paid >= 0 ? Math.max(0, due - paid) : due;
    setAmountRemaining(String(remaining));
  };

  const selectedPaidAmount = toFiniteAmount(amountPaid);
  const selectedRemainingAmount = selectedDue === undefined
    ? undefined
    : Math.max(0, selectedDue - selectedPaidAmount);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      try {
        const [loadedStudents, loadedUniqueStudents, loadedPayments, prices] = await Promise.all([
          getStudents(),
          getUniqueStudents(),
          getPayments(),
          getPriceMatrix(),
        ]);
        if (cancelled) return;
        const studentsByIdMap = new Map(
          loadedStudents.map((student) => [student.id, student])
        );
        setStudents(loadedStudents);
        setUniqueStudents(loadedUniqueStudents);
        setPriceMatrix(prices);
        setPayments(
          loadedPayments.map((payment): PaymentRecord => ({
            ...payment,
            month_name: cleanMonthOption(payment.month_name),
            student: payment.student_id
              ? studentsByIdMap.get(payment.student_id)
              : undefined,
          }))
        );
        setFetching(false);
        setMonthName(cleanMonthOption(getCurrentMonthName()));
      } catch (err: unknown) {
        if (!cancelled) {
          console.error('Error fetching data:', err);
          const errorMsg = err instanceof Error ? err.message : 'خطأ غير معروف';
          setMessage({ type: 'error', text: `فشل في تحميل البيانات المالية: ${errorMsg}` });
          setFetching(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchData = async (): Promise<boolean> => {
    setFetching(true);
    try {
      const [loadedStudents, loadedUniqueStudents, loadedPayments, prices] = await Promise.all([
        getStudents(),
        getUniqueStudents(),
        getPayments(),
        getPriceMatrix(),
      ]);
      const studentsByIdMap = new Map(
        loadedStudents.map((student) => [student.id, student])
      );
      setStudents(loadedStudents);
      setUniqueStudents(loadedUniqueStudents);
      setPriceMatrix(prices);
      setPayments(
        loadedPayments.map((payment): PaymentRecord => ({
          ...payment,
          month_name: cleanMonthOption(payment.month_name),
          student: payment.student_id
            ? studentsByIdMap.get(payment.student_id)
            : undefined,
        }))
      );
      return true;
    } catch (err: unknown) {
      console.error('Error fetching data:', err);
      const errorMsg = err instanceof Error ? err.message : 'خطأ غير معروف';
      setMessage({ type: 'error', text: `فشل في تحميل البيانات المالية: ${errorMsg}` });
      return false;
    } finally {
      setFetching(false);
    }
  };

  const resetPaymentFieldsForNextEntry = useCallback(() => {
    setEditingPaymentId(null);
    setSelectedStudentId('');
    setAmountPaid('');
    setAmountRemaining('');
    setTouchedRemaining(false);
  }, []);

  const openQuickPay = useCallback((student: Student, amountDue: number) => {
    setQuickPayStudent(student);
    setQuickPayAmount(String(amountDue));
    setQuickPayNotes('');
    setQuickPayOpen(true);
  }, []);

  const closeQuickPay = useCallback(() => {
    if (quickPaySubmitting) return;
    setQuickPayOpen(false);
    setQuickPayStudent(null);
    setQuickPayAmount('');
    setQuickPayNotes('');
  }, [quickPaySubmitting]);

  const handleQuickPaySubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!quickPayStudent) return;
    const netAmountDue = getStudentNetAmountDue(quickPayStudent);
    const paidAmount = Number(quickPayAmount);
    if (!Number.isFinite(paidAmount) || paidAmount < 0 || paidAmount > netAmountDue) {
      showToast({ type: 'error', text: 'يرجى إدخال مبلغ صحيح لا يتجاوز المبلغ المستحق.' });
      return;
    }
    const targetMonth = cleanMonthOption(monthName || getCurrentMonthName());
    const existingPayment = payments.find(
      (payment) =>
        payment.student_id === quickPayStudent.id &&
        cleanMonthOption(payment.month_name) === targetMonth &&
        (!payment.academic_year || payment.academic_year === centerSettings.academicYear)
    );
    setQuickPaySubmitting(true);
    try {
      const paymentInput = {
        student_id: quickPayStudent.id,
        amount_paid: paidAmount,
        amount_remaining: Math.max(0, netAmountDue - paidAmount),
        month_name: targetMonth,
        academic_year: centerSettings.academicYear,
      };
      if (existingPayment) {
        await updatePayment(existingPayment.id, paymentInput);
      } else {
        await addPayment(paymentInput);
      }
      await fetchData();
      setQuickPayOpen(false);
      setQuickPayStudent(null);
      setQuickPayAmount('');
      setQuickPayNotes('');
      showToast({ type: 'success', text: 'تم تحصيل الدفع وتحديث حالة الطالب بنجاح.' });
      playSuccessSound();
    } catch (error: unknown) {
      const paymentError = error as { message?: string; details?: string | null } | null;
      showToast({
        type: 'error',
        text: paymentError?.message || paymentError?.details || 'تعذر تسجيل الدفع السريع.',
      });
    } finally {
      setQuickPaySubmitting(false);
    }
  };

  const handleAddPayment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const selectedStudent = selectedStudentId
      ? studentsById.get(Number(selectedStudentId))
      : undefined;
    const zeroDuePayment = Boolean(
      selectedStudent && (isStudentExempt(selectedStudent) || getStudentNetAmountDue(selectedStudent) === 0)
    );
    const zeroPaidAllowed = zeroDuePayment || editingPaymentId !== null;
    if (!selectedStudentId || !selectedSubjectId || (!amountPaid && !zeroPaidAllowed) || !monthName) {
      setMessage({ type: 'error', text: 'يرجى اختيار الطالب والمادة وتحديد المبلغ المدفوع وشهر الاشتراك.' });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const studentId = Number(selectedStudentId);
      const paid = amountPaid.trim() === '' ? 0 : Number(amountPaid);
      const remaining = selectedRemainingAmount;
      if (!Number.isSafeInteger(studentId) || studentId <= 0) {
        throw new Error('معرف الطالب غير صالح.');
      }
      if (!Number.isFinite(paid) || paid < 0 || (paid === 0 && !zeroPaidAllowed)) {
        throw new Error('يجب أن يكون المبلغ المدفوع أكبر من صفر.');
      }
      if (editingPaymentId === null && selectedDue !== undefined && paid > selectedDue) {
        throw new Error('المبلغ المدفوع لا يمكن أن يتجاوز المبلغ المستحق.');
      }
      if (remaining !== undefined && (!Number.isFinite(remaining) || remaining < 0)) {
        throw new Error('المبلغ المتبقي غير صالح.');
      }
      if (!monthName.trim()) {
        throw new Error('شهر الاشتراك مطلوب.');
      }
      const duplicateSubscription = payments.some(
        (payment) => editingPaymentId === null &&
          payment.student_id === studentId &&
          cleanMonthOption(payment.month_name) === cleanMonthOption(monthName) &&
          (!payment.academic_year || payment.academic_year === centerSettings.academicYear)
      );
      if (duplicateSubscription) {
        throw new Error('يوجد اشتراك مسجل لهذا الطالب في الشهر والسنة الدراسية المحددين.');
      }
      const paymentInput = {
        student_id: studentId,
        amount_paid: paid,
        amount_remaining: editingPaymentId === null && selectedDue !== undefined
          ? Math.max(0, selectedDue - paid)
          : remaining,
        month_name: cleanMonthOption(monthName),
        academic_year: centerSettings.academicYear,
      };
      const isUpdate = editingPaymentId !== null;
      const successText = isUpdate
        ? 'تم تحديث عملية الدفع بنجاح.'
        : 'تم تسجيل الدفع بنجاح وتحديث حساب الطالب.';
      let persistedPayment: PaymentRecord | undefined;

      if (isUpdate) {
        await updatePayment(editingPaymentId, paymentInput);
        persistedPayment = payments.find((payment) => payment.id === editingPaymentId);
      } else {
        persistedPayment = await addPayment(paymentInput);
      }

      emitPaymentUpdate({
        type: isUpdate ? 'payment-updated' : 'payment-added',
        studentId: studentId,
        timestamp: ++paymentEventSeq,
      });

      setMessage({ type: 'success', text: successText });
      const refreshed = await fetchData();
      if (!refreshed) {
        throw new Error(isUpdate ? 'تم تحديث الدفع لكن تعذر تحديث السجلات.' : 'تم تسجيل الدفع لكن تعذر تحديث السجلات.');
      }
      showToast({ type: 'success', text: successText });
      playSuccessSound();
      resetPaymentFieldsForNextEntry();
      setLastPayment({
        studentId,
        transactionId: `PAY-${String(persistedPayment?.id ?? editingPaymentId ?? '').padStart(6, '0')}`,
        paid,
        remaining: paymentInput.amount_remaining ?? null,
        month: monthName.trim(),
        paymentDate: persistedPayment?.payment_date || persistedPayment?.created_at || getTodayDateISO(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'خطأ غير معروف';
      setMessage({ type: 'error', text: editingPaymentId !== null ? `حدث خطأ أثناء تحديث الدفع: ${message}` : `حدث خطأ أثناء تسجيل الدفع: ${message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleStartPaymentEdit = useCallback((payment: PaymentRecord) => {
    if (!payment.student || !payment.id) return;
    setEditingPaymentId(payment.id);
    setSelectedStudentId(String(payment.student_id));
    setSelectedSubjectId(payment.student?.subject || '');
    setDiscountType('amount');
    setDiscountValue(String(getStudentDiscount(payment.student)));
    setAmountPaid(String(payment.amount_paid));
    setAmountRemaining(String(payment.amount_remaining ?? 0));
    setMonthName(cleanMonthOption(payment.month_name));
    setTouchedRemaining(false);
    document.getElementById('payment-form')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const cancelPaymentEdit = useCallback(() => {
    setEditingPaymentId(null);
    setSelectedStudentId('');
    setSelectedSubjectId('');
    setAmountPaid('');
    setAmountRemaining('');
    setMonthName('');
    setTouchedRemaining(false);
  }, []);

  const bulkGroupStudents = useMemo(
    () => students.filter((student) =>
      student.stage === bulkPaymentStage &&
      student.grade === bulkPaymentGrade &&
      student.group_name === bulkPaymentGroup &&
      student.subject === bulkPaymentSubject &&
      getStudentFinalFee(student) > 0
    ),
    [students, bulkPaymentStage, bulkPaymentGrade, bulkPaymentGroup, bulkPaymentSubject, getStudentFinalFee]
  );

  const bulkPaymentRows = useMemo(() => {
    const groupStudentIds = new Set(bulkGroupStudents.map((student) => student.id));
    const normalizedMonth = cleanMonthOption(bulkPaymentMonth);
    const existingPaymentsByStudent = new Map(
      payments
        .filter((payment) =>
          cleanMonthOption(payment.month_name) === normalizedMonth &&
          payment.student_id != null &&
          groupStudentIds.has(payment.student_id)
        )
        .map((payment) => [payment.student_id as number, payment])
    );

    return bulkGroupStudents.map((student) => {
      const existingPayment = existingPaymentsByStudent.get(student.id);
      const defaultPrice = getStudentFinalFee(student);
      return {
        student,
        amountPaid: existingPayment ? Number(existingPayment.amount_paid || 0) : 0,
        amountRemaining: existingPayment ? Number(existingPayment.amount_remaining || 0) : defaultPrice,
        defaultPrice,
        hasPayment: !!existingPayment,
        existingPaymentId: existingPayment?.id,
      };
    });
  }, [bulkGroupStudents, bulkPaymentMonth, payments, getStudentFinalFee]);

  const bulkPaymentTotals = useMemo(
    () => bulkPaymentStudents.reduce(
      (totals, student) => ({
        paid: totals.paid + student.amountPaid,
        remaining: totals.remaining + student.amountRemaining,
        fees: totals.fees + student.defaultPrice,
      }),
      { paid: 0, remaining: 0, fees: 0 }
    ),
    [bulkPaymentStudents]
  );

  const loadBulkPaymentStudents = useCallback(async () => {
    if (!bulkPaymentStage || !bulkPaymentGrade || !bulkPaymentGroup || !bulkPaymentSubject || !bulkPaymentMonth) return;
    setBulkPaymentLoading(true);
    try {
      startTransition(() => {
        setBulkPaymentStudents(bulkPaymentRows);
      });
    } catch (err) {
      console.error('Error loading bulk payment students:', err);
      setMessage({ type: 'error', text: 'فشل في تحميل طلاب المجموعة' });
    } finally {
      setBulkPaymentLoading(false);
    }
  }, [bulkPaymentStage, bulkPaymentGrade, bulkPaymentGroup, bulkPaymentSubject, bulkPaymentMonth, bulkPaymentRows]);

  const handleBulkPaymentStageChange = useCallback((stage: string) => {
    startTransition(() => {
      setBulkPaymentStage(stage);
      setBulkPaymentGrade('');
      setBulkPaymentGroup('');
      setBulkPaymentSubject('');
      setBulkPaymentStudents([]);
    });
  }, []);

  const handleBulkPaymentGradeChange = useCallback((grade: string) => {
    startTransition(() => {
      setBulkPaymentGrade(grade);
      setBulkPaymentGroup('');
      setBulkPaymentSubject('');
      setBulkPaymentStudents([]);
    });
  }, []);

  const handleBulkPaymentGroupChange = useCallback((group: string) => {
    startTransition(() => {
      setBulkPaymentGroup(group);
      setBulkPaymentSubject('');
      setBulkPaymentStudents([]);
    });
  }, []);

  const handleBulkPaymentSubjectChange = useCallback((subject: string) => {
    startTransition(() => {
      setBulkPaymentSubject(subject);
      setBulkPaymentStudents([]);
    });
  }, []);

  const handleBulkPaymentMonthChange = useCallback((month: string) => {
    startTransition(() => {
      setBulkPaymentMonth(month);
      setBulkPaymentStudents([]);
    });
  }, []);

  const handleMarkAllAsPaid = useCallback(() => {
    startTransition(() => {
      setBulkPaymentStudents(prev => prev.map(s => ({
        ...s,
        amountPaid: s.defaultPrice,
        amountRemaining: 0,
      })));
    });
  }, []);

  const handleBulkPaymentAmountChange = useCallback((studentId: number, field: 'amountPaid' | 'amountRemaining', value: string) => {
    const numValue = Number(value) || 0;
    startTransition(() => {
      setBulkPaymentStudents(prev => prev.map(s => {
        if (s.student.id === studentId) {
          const newAmountPaid = field === 'amountPaid' ? numValue : s.amountPaid;
          const newAmountRemaining = field === 'amountRemaining' ? numValue : Math.max(0, s.defaultPrice - newAmountPaid);
          const finalRemaining = field === 'amountPaid' ? Math.max(0, s.defaultPrice - newAmountPaid) : newAmountRemaining;
          return {
            ...s,
            amountPaid: newAmountPaid,
            amountRemaining: finalRemaining,
          };
        }
        return s;
      }));
    });
  }, []);

  const handleSaveBulkPayment = useCallback(async () => {
    if (bulkPaymentStudents.length === 0) return;
    setBulkPaymentLoading(true);
    setMessage(null);
    try {
      for (const sp of bulkPaymentStudents) {
        const finalFee = getStudentFinalFee(sp.student);
        if (finalFee <= 0) continue;

        const paymentInput = {
          student_id: sp.student.id,
          amount_paid: sp.amountPaid,
          amount_remaining: sp.amountRemaining,
          month_name: cleanMonthOption(bulkPaymentMonth),
          academic_year: centerSettings.academicYear,
        };
        if (sp.hasPayment && sp.existingPaymentId) {
          await updatePayment(sp.existingPaymentId, paymentInput);
        } else if (sp.amountPaid > 0 || sp.amountRemaining < finalFee) {
          await addPayment(paymentInput);
        }
      }
      bulkPaymentStudents.forEach(sp => {
        emitPaymentUpdate({
          type: sp.hasPayment ? 'payment-updated' : 'payment-added',
          studentId: sp.student.id,
          timestamp: ++paymentEventSeq,
        });
      });
      await fetchData();
      const bulkSuccessText = `تم حفظ تحصيلات المجموعة (${bulkPaymentStudents.length} طالب) بنجاح.`;
      setMessage({ type: 'success', text: bulkSuccessText });
      showToast({ type: 'success', text: bulkSuccessText });
      playSuccessSound();
      setShowBulkPaymentModal(false);
      startTransition(() => {
        setBulkPaymentStage('');
        setBulkPaymentGrade('');
        setBulkPaymentGroup('');
        setBulkPaymentSubject('');
        setBulkPaymentMonth('');
        setBulkPaymentStudents([]);
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'خطأ غير معروف';
      setMessage({ type: 'error', text: `حدث خطأ أثناء حفظ التحصيل الجماعي: ${message}` });
    } finally {
      setBulkPaymentLoading(false);
    }
  }, [bulkPaymentStudents, bulkPaymentMonth, centerSettings.academicYear, getStudentFinalFee, showToast, playSuccessSound]);

  const openBulkPaymentModal = useCallback(() => {
    setShowBulkPaymentModal(true);
    startTransition(() => {
      setBulkPaymentStage('');
      setBulkPaymentGrade('');
      setBulkPaymentGroup('');
      setBulkPaymentSubject('');
      setBulkPaymentStudents([]);
      setBulkPaymentMonth(cleanMonthOption(getCurrentMonthName()));
    });
  }, []);

  const closeBulkPaymentModal = useCallback(() => {
    setShowBulkPaymentModal(false);
    startTransition(() => {
      setBulkPaymentStage('');
      setBulkPaymentGrade('');
      setBulkPaymentGroup('');
      setBulkPaymentSubject('');
      setBulkPaymentMonth('');
      setBulkPaymentStudents([]);
    });
  }, []);

  const handleStartEdit = useCallback((student: Student) => {
    setEditingId(student.id);
    setFormOpen(true);
    setFormData({
      barcode: student.barcode ?? '',
      name: student.name ?? '',
      stage: student.stage ?? 'المرحلة الإعدادية',
      grade: student.grade ?? 'الصف الثالث الإعدادي',
      group: student.group_name ?? 'مجموعة 1',
      subject: student.subject ?? 'الرياضيات',
      dueAmount: Number.isFinite(student.dueAmount) ? student.dueAmount! : 0,
      discountAmount: Number.isFinite(student.discountAmount) ? student.discountAmount! : 0,
      isExempt: student.isExempt ?? false,
      guardianName: student.guardian_name ?? '',
      guardianPhone: student.guardian_phone ?? '',
      guardianWhatsapp: student.guardian_whatsapp ?? '',
      guardianNotes: student.guardian_notes ?? '',
      address: student.address ?? '',
      school: student.school ?? '',
    });
  }, []);

  const handleMonthlyExempt = useCallback(async (payment: PaymentRecord) => {
    if (!payment.student || !payment.id) return;
    const confirmMessage = `هل تريد إعفاء الطالب ${payment.student.name} من مصاريف شهر ${payment.month_name} فقط؟`;
    if (!window.confirm(confirmMessage)) return;
    setLoading(true);
    setMessage(null);
    try {
      await updatePayment(payment.id, {
        student_id: payment.student_id ?? 0,
        amount_paid: Number(payment.amount_paid || 0),
        amount_remaining: 0,
        month_name: payment.month_name,
      });
      emitPaymentUpdate({
        type: 'payment-updated',
        studentId: payment.student_id ?? undefined,
        timestamp: ++paymentEventSeq,
      });
      await fetchData();
      const exemptSuccessText = `تم إعفاء الطالب ${payment.student?.name} من مصاريف شهر ${payment.month_name} بنجاح.`;
      setMessage({ type: 'success', text: exemptSuccessText });
      showToast({ type: 'success', text: exemptSuccessText });
      playSuccessSound();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'خطأ غير معروف';
      setMessage({ type: 'error', text: `حدث خطأ أثناء إعفاء الشهر: ${message}` });
    } finally {
      setLoading(false);
    }
  }, [showToast, playSuccessSound]);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setFormOpen(false);
    setFormData(INITIAL_FORM_DATA);
  }, []);

  const handleSubmitForm = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.grade || !formData.subject || !formData.group) {
      setMessage({ type: 'error', text: 'يرجى ملء جميع الحقول المطلوبة.' });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      if (editingId !== null) {
        setMessage({
          type: 'error',
          text: '️ تعديل بيانات الطالب غير متاح من هنا. يرجى استخدام تبويب "إدارة الطلاب" لتعديل البيانات.'
        });
      } else {
        setMessage({
          type: 'error',
          text: '️ إضافة طالب جديد غير متاح من هنا. يرجى استخدام تبويب "إدارة الطلاب" لإضافة طالب.'
        });
      }
      handleCancelEdit();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'خطأ غير معروف';
      setMessage({ type: 'error', text: `حدث خطأ: ${message}` });
    } finally {
      setLoading(false);
    }
  }, [editingId, handleCancelEdit, formData.name, formData.grade, formData.subject, formData.group]);

  const monthOptions = useMemo(
    () => {
      const options = new Map<string, string>();
      payments.forEach((payment) => {
        const cleanMonth = cleanMonthOption(payment.month_name);
        if (cleanMonth && !options.has(cleanMonth)) {
          options.set(cleanMonth, cleanMonth);
        }
      });
      return Array.from(options.values());
    },
    [payments]
  );

  const subjects = useMemo(() => {
    const unique = new Set(['الكل']);
    students.forEach((s) => {
      if (s.subject) unique.add(s.subject);
    });
    return Array.from(unique);
  }, [students]);

  const formSubjects = useMemo(() => subjects.filter((s) => s !== 'الكل'), [subjects]);
  const currentMonth = useMemo(() => cleanMonthOption(getCurrentMonthName()), []);
  const todayDate = useMemo(() => getTodayDateISO(), []);
  const subscriptionMonthOptions = useMemo(() => {
    const academicYearStart = Number(centerSettings.academicYear.slice(0, 4));
    const startYear = Number.isSafeInteger(academicYearStart)
      ? academicYearStart
      : new Date().getFullYear();
    const monthNames = [
      'يناير', 'فبراير', 'مارس', 'أبريل',
      'مايو', 'يونيو', 'يوليو', 'أغسطس',
      'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
    ];
    return Array.from({ length: 12 }, (_, index) => {
      const monthIndex = (8 + index) % 12;
      const year = monthIndex >= 8 ? startYear : startYear + 1;
      return cleanMonthOption(`${monthNames[monthIndex]} ${year}`);
    });
  }, [centerSettings.academicYear]);

  const currentDateInfo = useMemo(() => {
    const now = new Date();
    return {
      day: now.getDate(),
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      isPastDueDate: now.getDate() > 25,
    };
  }, []);

  const paymentsWithStatus = useMemo(() => {
    return payments.map(payment => {
      const remaining = Number(payment.amount_remaining ?? 0);
      const { isCurrent, isPast, isFuture } = getMonthStatus(
        cleanMonthOption(payment.month_name),
        currentMonth
      );
      let statusType: 'paid' | 'overdue' | 'due' | 'future' = 'due';
      let statusText = '';
      if (remaining <= 0) {
        statusType = 'paid';
        statusText = 'مسدد ✓';
      } else if (isPast) {
        statusType = 'overdue';
        statusText = `متأخر ${formatCurrency(remaining)}`;
      } else if (isCurrent) {
        if (currentDateInfo.isPastDueDate) {
          statusType = 'overdue';
          statusText = `متأخر ${formatCurrency(remaining)}`;
        } else {
          statusType = 'due';
          statusText = `مطلوب السداد ${formatCurrency(remaining)}`;
        }
      } else if (isFuture) {
        statusType = 'future';
        statusText = 'غير مستحق بعد';
      } else {
        statusType = 'due';
        statusText = `مطلوب السداد ${formatCurrency(remaining)}`;
      }
      return {
        ...payment,
        status: { statusType, statusText, remaining },
      };
    });
  }, [payments, currentMonth, currentDateInfo.isPastDueDate]);

  const filteredPayments = useMemo(
    () => paymentsWithStatus.filter((p) => {
      const monthMatch =
        filterMonth === 'الكل' ||
        cleanMonthOption(p.month_name) === cleanMonthOption(filterMonth);
      const gradeMatch = filterGrade === 'الكل' || p.student?.grade === filterGrade;
      const subjectMatch = filterSubject === 'كل المواد' || p.student?.subject === filterSubject;
      return monthMatch && gradeMatch && subjectMatch;
    }),
    [paymentsWithStatus, filterMonth, filterGrade, filterSubject]
  );

  const handleResetFilteredMonthPayments = useCallback(async () => {
    if (filterMonth === 'الكل') {
      showToast({ type: 'error', text: 'يرجى اختيار شهر قبل إلغاء المدفوعات.' });
      return;
    }
    if (filteredPayments.length === 0) {
      showToast({ type: 'error', text: 'لا توجد مدفوعات مطابقة للفلاتر المحددة.' });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);
    try {
      for (const payment of filteredPayments) {
        const paid = toFiniteAmount(payment.amount_paid);
        const remaining = toFiniteAmount(payment.amount_remaining);
        const { error } = await supabase
          .from('payments')
          .update({
            amount_paid: 0,
            amount_remaining: paid + remaining,
          })
          .eq('id', payment.id);

        if (error) throw error;
      }

      setResetPaymentsOpen(false);
      showToast({
        type: 'success',
        text: `تم إلغاء مدفوعات شهر ${filterMonth} للطلاب المفلترين.`,
      });
      await fetchData();
    } catch (err: unknown) {
      console.error('Reset Payments Error Detail:', err);
      const errorRecord = err as {
        message?: unknown;
        error_description?: unknown;
      } | null;
      const errorMessage =
        errorRecord?.message ||
        errorRecord?.error_description ||
        (typeof err === 'string' ? err : JSON.stringify(err));
      showToast({ type: 'error', text: `تعذر إلغاء المدفوعات: ${errorMessage}` });
    } finally {
      setIsSubmitting(false);
    }
  }, [filterMonth, filteredPayments, showToast]);

  const handleZeroFilteredMonthDebt = useCallback(async () => {
    if (filterMonth === 'الكل') {
      showToast({ type: 'error', text: 'يرجى اختيار شهر قبل إلغاء المديونية.' });
      return;
    }
    if (filteredPayments.length === 0) {
      showToast({ type: 'error', text: 'لا توجد مدفوعات مطابقة للفلاتر المحددة.' });
      return;
    }

    setIsSubmitting(true);
    try {
      for (const payment of filteredPayments) {
        const { error } = await supabase
          .from('payments')
          .update({ amount_remaining: 0 })
          .eq('id', payment.id);
        if (error) throw error;
      }
      setZeroDebtOpen(false);
      showToast({
        type: 'success',
        text: `تم تصفير المديونية لشهر ${filterMonth} للطلاب المفلترين.`,
      });
      await fetchData();
    } catch (err: unknown) {
      console.error('Zero Remaining Debt Error Detail:', err);
      const errorRecord = err as { message?: unknown; error_description?: unknown } | null;
      const errorMessage =
        errorRecord?.message ||
        errorRecord?.error_description ||
        (typeof err === 'string' ? err : JSON.stringify(err));
      showToast({ type: 'error', text: `تعذر تصفير المديونية: ${errorMessage}` });
    } finally {
      setIsSubmitting(false);
    }
  }, [filterMonth, filteredPayments, showToast]);

  const handlePurgeFilteredMonthPayments = useCallback(async () => {
    if (filterMonth === 'الكل') {
      showToast({ type: 'error', text: 'يرجى اختيار شهر قبل حذف السجلات.' });
      return;
    }
    if (filteredPayments.length === 0) {
      showToast({ type: 'error', text: 'لا توجد مدفوعات مطابقة للفلاتر المحددة.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const ids = filteredPayments.map((payment) => payment.id);
      const { error } = await supabase.from('payments').delete().in('id', ids);
      if (error) throw error;
      setPurgeMonthOpen(false);
      showToast({
        type: 'success',
        text: `تم حذف سجلات شهر ${filterMonth} للطلاب المفلترين.`,
      });
      await fetchData();
    } catch (err: unknown) {
      console.error('Purge Month Payments Error Detail:', err);
      const errorRecord = err as { message?: unknown; error_description?: unknown } | null;
      const errorMessage =
        errorRecord?.message ||
        errorRecord?.error_description ||
        (typeof err === 'string' ? err : JSON.stringify(err));
      showToast({ type: 'error', text: `تعذر حذف سجلات الشهر: ${errorMessage}` });
    } finally {
      setIsSubmitting(false);
    }
  }, [filterMonth, filteredPayments, showToast]);

  const payingStudents = useMemo(() => {
    return uniqueStudents.filter((s) => s.grade && s.subject && !isStudentExempt(s));
  }, [uniqueStudents]);

  const expectedMonthlyIncome = useMemo(() => {
    let total = 0;
    payingStudents.forEach((student) => {
      const price = priceMatrix[priceKey(student.grade!, student.subject!)];
      if (typeof price === 'number' && Number.isFinite(price)) {
        total += Math.max(0, price - getStudentDiscount(student));
      }
    });
    return total;
  }, [payingStudents, priceMatrix]);

  const currentAcademicYearPayments = useMemo(
    () => payments.filter(
      (payment) => !payment.academic_year || payment.academic_year === centerSettings.academicYear
    ),
    [payments, centerSettings.academicYear]
  );

  const financialSummary = useMemo(
    () => calculateFinancialSummary(
      expectedMonthlyIncome,
      currentAcademicYearPayments.filter(
        (payment) => cleanMonthOption(payment.month_name) === currentMonth
      )
    ),
    [expectedMonthlyIncome, currentAcademicYearPayments, currentMonth]
  );

  const actualCollected = financialSummary.totalPaid;
  const remainingToCollect = financialSummary.totalRemaining;
  const collectionRate = financialSummary.collectionRate;

  const paidStudentsCurrentMonth = useMemo(() => {
    return payments
      .filter(
        (p) => cleanMonthOption(p.month_name) === currentMonth && Number(p.amount_paid || 0) > 0
      )
      .map((p) => ({
        ...p,
        studentName: p.student?.name || 'طالب محذوف',
        grade: p.student?.grade || '-',
        subject: p.student?.subject || '-',
        paidAmount: toFiniteAmount(p.amount_paid),
        paymentDate: p.created_at ? new Date(p.created_at).toLocaleDateString('ar-EG') : '-',
      }))
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  }, [payments, currentMonth]);

  const filteredPaidStudents = useMemo(() => {
    if (!deferredPaidStudentsSearch.trim()) return paidStudentsCurrentMonth;
    const query = deferredPaidStudentsSearch.trim().toLowerCase();
    return paidStudentsCurrentMonth.filter((p) =>
      p.studentName.toLowerCase().includes(query)
    );
  }, [paidStudentsCurrentMonth, deferredPaidStudentsSearch]);

  const todayPayments = useMemo(() => {
    return payments
      .filter((p) => p.created_at?.startsWith(todayDate))
      .map((p) => ({
        ...p,
        studentName: p.student?.name || 'طالب محذوف',
        grade: p.student?.grade || '-',
        subject: p.student?.subject || '-',
        targetMonth: cleanMonthOption(p.month_name) || '-',
        paidAmount: Number(p.amount_paid || 0),
        paymentTime: p.created_at ? new Date(p.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '-',
      }))
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  }, [payments, todayDate]);

  const todayIncome = useMemo(() => {
    return todayPayments.reduce((sum, p) => sum + toFiniteAmount(p.paidAmount), 0);
  }, [todayPayments]);

  const todayPaymentsCount = useMemo(() => todayPayments.length, [todayPayments]);

  const filteredTodayPayments = useMemo(() => {
    if (!deferredTodayPaymentsSearch.trim()) return todayPayments;
    const query = deferredTodayPaymentsSearch.trim().toLowerCase();
    return todayPayments.filter((p) =>
      p.studentName.toLowerCase().includes(query)
    );
  }, [todayPayments, deferredTodayPaymentsSearch]);

  const stages = useMemo(() => {
    const unique = new Set<string>();
    uniqueStudents.forEach((s) => {
      if (s.stage) unique.add(s.stage);
    });
    return Array.from(unique).sort();
  }, [uniqueStudents]);

  const grades = useMemo(() => {
    if (!selectedStage) return [];
    const unique = new Set<string>();
    uniqueStudents.forEach((s) => {
      if (s.stage === selectedStage && s.grade) unique.add(s.grade);
    });
    return Array.from(unique).sort();
  }, [uniqueStudents, selectedStage]);

  const bulkStages = useMemo(() => {
    const unique = new Set<string>();
    uniqueStudents.forEach((s) => {
      if (s.stage) unique.add(s.stage);
    });
    return Array.from(unique).sort();
  }, [uniqueStudents]);

  const bulkGradesForStage = useMemo(() => {
    if (!bulkPaymentStage) return [];
    const unique = new Set<string>();
    uniqueStudents.forEach((s) => {
      if (s.stage === bulkPaymentStage && s.grade) unique.add(s.grade);
    });
    return Array.from(unique).sort();
  }, [uniqueStudents, bulkPaymentStage]);

  const bulkGroupsForGrade = useMemo(() => {
    if (!bulkPaymentStage || !bulkPaymentGrade) return [];
    const unique = new Set<string>();
    uniqueStudents.forEach((s) => {
      if (s.stage === bulkPaymentStage && s.grade === bulkPaymentGrade && s.group_name) {
        unique.add(s.group_name);
      }
    });
    return Array.from(unique).sort();
  }, [uniqueStudents, bulkPaymentStage, bulkPaymentGrade]);

  const bulkSubjectsForGroup = useMemo(() => {
    if (!bulkPaymentStage || !bulkPaymentGrade || !bulkPaymentGroup) return [];
    const unique = new Set<string>();
    uniqueStudents.forEach((s) => {
      if (
        s.stage === bulkPaymentStage &&
        s.grade === bulkPaymentGrade &&
        s.group_name === bulkPaymentGroup &&
        s.subject
      ) {
        unique.add(s.subject);
      }
    });
    return Array.from(unique).sort();
  }, [uniqueStudents, bulkPaymentStage, bulkPaymentGrade, bulkPaymentGroup]);

  const bulkPaymentSelectionComplete = Boolean(
    bulkPaymentStage && bulkPaymentGrade && bulkPaymentGroup && bulkPaymentSubject && bulkPaymentMonth.trim()
  );

  const filteredStudentsForSelect = useMemo(() => {
    return uniqueStudents.filter((s) => {
      const stageMatch = !selectedStage || s.stage === selectedStage;
      const gradeMatch = !selectedGrade || s.grade === selectedGrade;
      return stageMatch && gradeMatch;
    });
  }, [uniqueStudents, selectedStage, selectedGrade]);

  const quickCollectionStudents = useMemo(() => {
    const query = deferredQuickCollectionSearch.trim().toLowerCase();
    if (!query) return filteredStudentsForSelect;

    return filteredStudentsForSelect.filter((student) => {
      const searchableValues = [
        student.name,
        student.phone,
        student.parent_phone,
        student.barcode,
        student.student_code,
        String(student.id),
      ];
      return searchableValues.some((value) =>
        String(value ?? '').trim().toLowerCase().includes(query)
      );
    });
  }, [filteredStudentsForSelect, deferredQuickCollectionSearch]);

  const printLastPaymentReceipt = useCallback(() => {
    if (!lastPayment) return;
    const student = studentsById.get(lastPayment.studentId);
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <!doctype html>
      <html lang="ar" dir="rtl">
        <head><meta charset="utf-8"><title>إيصال ${escapeHtml(lastPayment.transactionId)}</title>
          <style>body{font-family:Arial,sans-serif;padding:32px;line-height:1.8}h1{text-align:center}table{width:100%;border-collapse:collapse}td{padding:8px;border-bottom:1px solid #ddd}td:first-child{font-weight:bold;width:40%}</style>
        </head>
        <body>
          <h1>${escapeHtml(centerSettings.centerName)}</h1>
          <h2>إيصال دفع</h2>
          <table>
            <tr><td>رقم العملية</td><td>${escapeHtml(lastPayment.transactionId)}</td></tr>
            <tr><td>الطالب</td><td>${escapeHtml(student?.name || 'الطالب')}</td></tr>
            <tr><td>المادة</td><td>${escapeHtml(student?.subject || '-')}</td></tr>
            <tr><td>المجموعة</td><td>${escapeHtml(student?.group_name || '-')}</td></tr>
            <tr><td>الشهر</td><td>${escapeHtml(lastPayment.month)}</td></tr>
            <tr><td>المبلغ المدفوع</td><td>${escapeHtml(formatCurrency(lastPayment.paid))}</td></tr>
            <tr><td>المتبقي</td><td>${escapeHtml(formatCurrency(lastPayment.remaining ?? 0))}</td></tr>
            <tr><td>التاريخ</td><td>${escapeHtml(new Date(lastPayment.paymentDate).toLocaleString('ar-EG-u-nu-latn'))}</td></tr>
          </table>
          <script>window.onload = () => window.print();<\/script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }, [centerSettings.centerName, lastPayment, studentsById]);

  return (
    <div className="w-full space-y-6" dir="rtl">
      {/* ==================== شريط إعدادات السنتر ==================== */}
      <div className="rounded-3xl border border-indigo-200/80 bg-gradient-to-l from-indigo-50 to-white p-6 shadow-sm dark:border-indigo-800 dark:from-slate-900 dark:to-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-[250px]">
            <div className="bg-indigo-600 text-white p-3 rounded-2xl text-xl">🏫</div>
            <div className="flex-1">
              <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">اسم المركز التعليمي</p>
              {editingCenterName ? (
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="text"
                    value={tempCenterName}
                    onChange={(e) => setTempCenterName(e.target.value)}
                    className="w-full rounded-xl border border-indigo-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:text-white"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveCenterName();
                      if (e.key === 'Escape') setEditingCenterName(false);
                    }}
                  />
                  <button
                    onClick={handleSaveCenterName}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                  >
                    حفظ
                  </button>
                  <button
                    onClick={() => setEditingCenterName(false)}
                    className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200"
                  >
                    إلغاء
                  </button>
                </div>
              ) : (
                <h2
                  className="text-xl font-black text-slate-800 dark:text-white cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  onClick={() => {
                    setTempCenterName(centerSettings.centerName);
                    setEditingCenterName(true);
                  }}
                  title="اضغط لتعديل اسم السنتر"
                >
                  {centerSettings.centerName} <span className="text-xs text-slate-400">✏️</span>
                </h2>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ==================== Toast ==================== */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-5 inset-x-0 z-[100] flex justify-center px-4 pointer-events-none"
        >
          <div
            className={`pointer-events-auto flex items-center gap-2 rounded-2xl border px-5 py-3 text-sm font-bold shadow-lg transition-all ${
              toast.type === 'success' ? 'bg-emerald-600 border-emerald-700 text-white' : 'bg-rose-600 border-rose-700 text-white'
            }`}
          >
            <span>{toast.type === 'success' ? '✅' : '⚠️'}</span>
            <span>{toast.text}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="ms-2 text-white/80 hover:text-white"
              aria-label="إغلاق"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ==================== KPI Cards ==================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex justify-between items-center transition-all hover:shadow-md hover:scale-[1.01]">
          <div>
            <p className="text-xs font-bold text-slate-500">إجمالي المستحق</p>
            <h3 className="text-3xl font-black mt-1 text-indigo-600">
              {formatCurrency(expectedMonthlyIncome)}
            </h3>
            <p className="text-[11px] font-bold mt-1 text-slate-400">من أسعار وخصومات الطلاب الحاليين</p>
          </div>
          <div className="text-3xl bg-indigo-50 p-3 rounded-2xl text-indigo-600">🎯</div>
        </div>
        <div
          onClick={() => setShowPaidStudentsModal(true)}
          className="bg-white p-5 rounded-3xl border border-emerald-200/80 shadow-sm flex justify-between items-center transition-all hover:shadow-md hover:scale-[1.01] cursor-pointer"
          title="اضغط لعرض الطلاب المسددين"
        >
          <div>
            <div className="flex items-center gap-1 mb-1">
              <p className="text-xs font-bold text-slate-500">إجمالي الإيرادات المحصلة</p>
              <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-md">{currentMonth}</span>
            </div>
            <h3 className="text-3xl font-black mt-1 text-emerald-600">
              {formatCurrency(actualCollected)}
            </h3>
            <p className="text-[11px] font-bold mt-1 text-emerald-400">اضغط لعرض التفاصيل ↗</p>
          </div>
          <div className="text-3xl bg-emerald-50 p-3 rounded-2xl text-emerald-600">💵</div>
        </div>
        <div
          onClick={() => setShowTodayPaymentsModal(true)}
          className="bg-white p-5 rounded-3xl border border-amber-200/80 shadow-sm flex justify-between items-center transition-all hover:shadow-md hover:scale-[1.01] cursor-pointer"
          title="اضغط لعرض دفعات اليوم"
        >
          <div>
            <div className="flex items-center gap-1 mb-1">
              <p className="text-xs font-bold text-slate-500">إيرادات اليوم</p>
              <span className="text-[10px] font-bold bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-md">
                {todayPaymentsCount} {todayPaymentsCount === 1 ? 'دفعة' : 'دفعات'}
              </span>
            </div>
            <h3 className="text-3xl font-black mt-1 text-amber-600">
              {formatCurrency(todayIncome)}
            </h3>
            <p className="text-[11px] font-bold mt-1 text-amber-400">
              {todayPaymentsCount === 0 ? 'لم تُسجل دفعات اليوم' : 'اضغط لعرض التفاصيل ↗'}
            </p>
          </div>
          <div className="text-3xl bg-amber-50 p-3 rounded-2xl text-amber-600">📅</div>
        </div>
        <div className="bg-white p-5 rounded-3xl border border-rose-200/80 shadow-sm flex justify-between items-center transition-all hover:shadow-md hover:scale-[1.01]">
          <div>
            <p className="text-xs font-bold text-slate-500">إجمالي المتبقي</p>
            <h3 className="text-3xl font-black mt-1 text-rose-600">
              {formatCurrency(remainingToCollect)}
            </h3>
            <p className="text-[11px] font-bold mt-1 text-rose-400">
              {remainingToCollect > 0 ? 'مبالغ مسجلة + مستحقة لغير المسددين' : 'تم تحصيل كامل المستهدف ✓'}
            </p>
          </div>
          <div className="text-3xl bg-rose-50 p-3 rounded-2xl text-rose-600">⏳</div>
        </div>
        <div className="bg-white p-5 rounded-3xl border border-blue-200/80 shadow-sm flex justify-between items-center transition-all hover:shadow-md hover:scale-[1.01]">
          <div>
            <p className="text-xs font-bold text-slate-500">نسبة التحصيل</p>
            <h3 className="text-3xl font-black mt-1 text-blue-600">
              {collectionRate}%
            </h3>
            <p className="text-[11px] font-bold mt-1 text-blue-400">
              من إجمالي {payingStudents.length} طالب مستهدف
            </p>
          </div>
          <div className="text-3xl bg-blue-50 p-3 rounded-2xl text-blue-600">📊</div>
        </div>
      </div>

      {/* ==================== نموذج التسجيل الفردي ==================== */}
      <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black text-slate-800 mb-1">تسجيل اشتراك أو دفعة مالية جديدة</h2>
        <p className="text-xs text-slate-500 mb-6">سجل مبالغ التحصيل الشهرية للطلاب ومتابعة المتبقي — السنة الدراسية: <span className="font-bold text-indigo-600">{centerSettings.academicYear}</span></p>
        {message && (
          <div
            className={`mb-6 rounded-2xl border p-3 text-center text-xs font-bold ${
              message.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-rose-50 border-rose-200 text-rose-700'
            }`}
          >
            {message.text}
          </div>
        )}
        {lastPayment && (
          <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black text-emerald-800">تم تسجيل الدفعة بنجاح</p>
                <p className="mt-1 text-xs font-bold text-slate-700">
                  {studentsById.get(lastPayment.studentId)?.name || 'الطالب'} · {lastPayment.transactionId}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={printLastPaymentReceipt}
                  className="rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-slate-900"
                >
                  🖨️ طباعة الإيصال
                </button>
                <WhatsAppButton
                  phone={
                    studentsById.get(lastPayment.studentId)?.guardian_whatsapp ||
                    studentsById.get(lastPayment.studentId)?.guardian_phone ||
                    studentsById.get(lastPayment.studentId)?.parent_whatsapp ||
                    studentsById.get(lastPayment.studentId)?.parent_phone
                  }
                  message={paymentRecordedMessage(
                    studentsById.get(lastPayment.studentId)?.name || 'الطالب',
                    lastPayment.paid,
                    lastPayment.remaining,
                    lastPayment.month
                  )}
                />
                <button
                  type="button"
                  onClick={() => setLastPayment(null)}
                  className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-200"
                >
                  لاحقاً
                </button>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-bold text-slate-700 sm:grid-cols-4">
              <span>المادة: {studentsById.get(lastPayment.studentId)?.subject || '-'}</span>
              <span>الشهر: {lastPayment.month}</span>
              <span>المدفوع: {formatCurrency(lastPayment.paid)}</span>
              <span>المتبقي: {formatCurrency(lastPayment.remaining ?? 0)}</span>
            </div>
          </div>
        )}
        <form
          id="payment-form"
          onSubmit={handleAddPayment}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            const target = e.target as HTMLElement;
            if (target.tagName === 'BUTTON' || target.tagName === 'TEXTAREA') return;
            e.preventDefault();
            e.currentTarget.requestSubmit();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
            <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-600">
            المرحلة الدراسية
            <select
              value={selectedStage}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedStage(val);
                setSelectedGrade('');
                setSelectedSubjectId('');
                setSelectedStudentId('');
                setTouchedRemaining(false);
                setAmountPaid('');
                setAmountRemaining('');
              }}
              className={INPUT_CLASS}
            >
              <option value="">-- جميع المراحل --</option>
              {stages.map((stage) => (
                <option key={stage} value={stage}>{stage}</option>
              ))}
            </select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-600">
            الصف الدراسي
            <select
              value={selectedGrade}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedGrade(val);
                setSelectedSubjectId('');
                setSelectedStudentId('');
                setTouchedRemaining(false);
                setAmountPaid('');
                setAmountRemaining('');
              }}
              disabled={!selectedStage}
              className={INPUT_CLASS}
            >
              <option value="">-- اختر المرحلة أولاً --</option>
              {grades.map((grade) => (
                <option key={grade} value={grade}>{grade}</option>
              ))}
            </select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-600">
            اختر الطالب *
            <select
              value={selectedStudentId}
              onChange={(e) => {
                const id = e.target.value;
                setSelectedStudentId(id);
                setTouchedRemaining(false);
                const st = id ? studentsById.get(Number(id)) : undefined;
                setDiscountType('amount');
                setDiscountValue(String(st ? getStudentDiscount(st) : 0));
                if (st?.subject && formSubjects.includes(st.subject)) {
                  setSelectedSubjectId(st.subject);
                }
                const subjectForPrice = st?.subject;
                if (st?.grade && subjectForPrice) {
                  const price = priceMatrix[priceKey(st.grade, subjectForPrice)];
                  if (typeof price === 'number' && Number.isFinite(price)) {
                    const discount = isStudentExempt(st) ? price : getStudentDiscount(st);
                    setAmountPaid('');
                    setAmountRemaining(String(Math.max(0, price - discount)));
                  }
                }
              }}
              required
              className={INPUT_CLASS}
            >
              <option value="">-- اختر طالباً --</option>
              {filteredStudentsForSelect.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name} ({student.grade || 'بدون صف'} — {student.group_name || 'بدون مجموعة'} — {student.subject || 'بدون مادة'})
                </option>
              ))}
            </select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-600">
            المادة / الكورس *
            <select
              value={selectedSubjectId}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedSubjectId(val);
                setTouchedRemaining(false);
                const st = selectedStudentId ? studentsById.get(Number(selectedStudentId)) : undefined;
                if (st?.grade && val) {
                  const price = priceMatrix[priceKey(st.grade, val)];
                  if (typeof price === 'number' && Number.isFinite(price)) {
                    setAmountPaid('');
                    setAmountRemaining(String(selectedDue ?? price));
                  }
                }
              }}
              required
              className={INPUT_CLASS}
            >
              <option value="">-- اختر مادة --</option>
              {formSubjects.map((subj) => (
                <option key={subj} value={subj}>
                  {subj}
                </option>
              ))}
            </select>
            {selectedPrice !== undefined && (
              <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                💡 الاشتراك المعتمد من شبكة الأسعار: {formatCurrency(selectedPrice)}
              </span>
            )}
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-600">
              شهر الاشتراك *
              <select
                value={monthName}
                onChange={(e) => setMonthName(e.target.value)}
                required
                className={INPUT_CLASS}
              >
                <option value="">-- اختر شهر --</option>
                {subscriptionMonthOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6">
            <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-600">
            سعر الاشتراك (ج.م)
            <input
              type="number"
              value={selectedDue ?? ''}
              readOnly
              tabIndex={-1}
              className={`${INPUT_CLASS} cursor-not-allowed bg-slate-100`}
            />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-600">
            نوع الخصم
            <select value={discountType} disabled className={`${INPUT_CLASS} cursor-not-allowed bg-slate-100`}>
              <option value="amount">خصم مبلغ</option>
              <option value="percentage">خصم نسبة مئوية</option>
            </select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-600">
            قيمة الخصم (ج.م)
            <input
              type="number"
              value={discountValue}
              readOnly
              tabIndex={-1}
              className={`${INPUT_CLASS} cursor-not-allowed bg-slate-100`}
            />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-600">
            المبلغ المستحق (ج.م)
            <input
              type="number"
              value={selectedDue ?? ''}
              readOnly
              tabIndex={-1}
              className={`${INPUT_CLASS} cursor-not-allowed bg-indigo-50 font-black text-indigo-700`}
            />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-600">
            المبلغ المدفوع (ج.م) *
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amountPaid}
                  onChange={(e) => {
                    setAmountPaid(e.target.value);
                    applyAutoRemaining(e.target.value, selectedDue);
                  }}
                  onFocus={(e) => e.currentTarget.select()}
                  placeholder="0"
                  required
                  className={`${INPUT_CLASS} flex-1`}
                />
                <button
                  type="button"
                  onClick={() => {
                    const due = selectedDue ?? 0;
                    setAmountPaid(String(due));
                    setAmountRemaining('0');
                  }}
                  disabled={selectedDue === undefined || selectedPaidAmount === selectedDue}
                  className="shrink-0 rounded-xl bg-emerald-600 px-2.5 py-2 text-[10px] font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  دفعة كاملة
                </button>
              </div>
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-600">
              <span className="flex items-center justify-between gap-2">
                <span>المبلغ المتبقي (ج.م)</span>
                <span
                  className={`rounded-lg px-2 py-1 text-[10px] font-black ${
                    selectedRemainingAmount === 0
                      ? 'bg-emerald-50 text-emerald-700'
                      : selectedPaidAmount > 0
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-rose-50 text-rose-700'
                  }`}
                >
                  {selectedRemainingAmount === 0
                    ? 'مسدد بالكامل'
                    : selectedPaidAmount > 0
                      ? 'دفعة جزئية'
                      : 'غير مسدد'}
                </span>
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={selectedRemainingAmount ?? ''}
                readOnly
                tabIndex={-1}
                placeholder="يُحسب تلقائياً = المستحق − المدفوع"
                className={`${INPUT_CLASS} cursor-not-allowed bg-slate-100`}
              />
            </label>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={openBulkPaymentModal}
              disabled={loading || bulkPaymentLoading}
              className="rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-extrabold px-6 py-3 text-xs shadow-sm transition focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
            >
              {bulkPaymentLoading ? 'جاري التحميل...' : '📦 تحصيل رسوم مجموعة'}
            </button>
            {editingPaymentId !== null && (
              <button
                type="button"
                onClick={cancelPaymentEdit}
                className="rounded-2xl bg-slate-100 px-6 py-3 text-xs font-extrabold text-slate-700 shadow-sm transition hover:bg-slate-200"
              >
                إلغاء التعديل
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              className={`rounded-2xl px-6 py-3 text-xs font-extrabold text-white shadow-sm transition focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 ${
                editingPaymentId !== null
                  ? 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500'
                  : 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500'
              }`}
            >
              {loading
                ? 'جاري الحفظ...'
                : editingPaymentId !== null
                ? 'تحديث عملية الدفع'
                : 'حفظ عملية الدفع'}
            </button>
          </div>
        </form>
      </div>

      {/* ==================== التحصيل السريع ==================== */}
      <div className="rounded-3xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-6 dark:border-slate-700">
          <h3 className="text-base font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
            ⚡ التحصيل السريع — طلاب المجموعة المختارة
          </h3>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
            <span>الشهر المستهدف:</span>
            <select
              value={monthName}
              onChange={(e) => setMonthName(e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">-- اختر شهر --</option>
              {subscriptionMonthOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="border-b border-slate-100 p-4 dark:border-slate-700">
          <div className="relative max-w-xl">
            <input
              type="search"
              value={quickCollectionSearch}
              onChange={(e) => setQuickCollectionSearch(e.target.value)}
              placeholder="بحث سريع (اسم الطالب، رقم الهاتف، أو كود/باركود الطالب)..."
              aria-label="بحث سريع في طلاب التحصيل"
              dir="rtl"
              className={`${INPUT_CLASS} pr-10 pl-10 text-right`}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400"
            >
              🔎
            </span>
            {quickCollectionSearch && (
              <button
                type="button"
                onClick={() => setQuickCollectionSearch('')}
                aria-label="مسح البحث"
                title="مسح البحث"
                className="absolute inset-y-0 left-2 my-auto flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              >
                ✕
              </button>
            )}
          </div>
        </div>
        {quickCollectionStudents.length === 0 ? (
          <div className="p-12 text-center text-xs font-bold text-slate-400">
            {quickCollectionSearch.trim()
              ? 'لا توجد طلاب مطابقة لعبارة البحث الحالية.'
              : 'لا توجد طلاب مطابقين للفلاتر الحالية. يرجى اختيار المرحلة والصف والمادة.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="border-b border-slate-100 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
                <tr>
                  <th className="p-3 font-bold">اسم الطالب</th>
                  <th className="p-3 font-bold">الصف</th>
                  <th className="p-3 font-bold">المادة</th>
                  <th className="p-3 font-bold">المجموعة</th>
                  <th className="p-3 font-bold">سعر الاشتراك</th>
                  <th className="p-3 font-bold">حالة السداد</th>
                  <th className="p-3 font-bold">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {quickCollectionStudents.map((student) => {
                  const studentPrice = priceMatrix[priceKey(student.grade || '', student.subject || '')] || 0;
                  const studentExempt = isStudentExempt(student);
                  const studentDue = getStudentNetAmountDue(student);
                  const existingPayment = payments.find(p =>
                    p.student_id === student.id &&
                    cleanMonthOption(p.month_name) === cleanMonthOption(monthName) &&
                    (!p.academic_year || p.academic_year === centerSettings.academicYear)
                  );
                  const paidAmount = existingPayment ? toFiniteAmount(existingPayment.amount_paid) : 0;
                  const remainingAmount = Math.max(0, studentDue - paidAmount);
                  const isPaid = paidAmount >= studentDue;
                  const isPartial = paidAmount > 0 && paidAmount < studentDue;
                  return (
                    <tr key={student.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/40">
                      <td className="p-3 font-bold text-slate-800 dark:text-slate-100">
                        {student.name}
                      </td>
                      <td className="p-3 text-slate-600 dark:text-slate-300">
                        {student.grade || '-'}
                      </td>
                      <td className="p-3 text-slate-600 dark:text-slate-300">
                        {student.subject || '-'}
                      </td>
                      <td className="p-3 text-slate-600 dark:text-slate-300">
                        {student.group_name || '-'}
                      </td>
                      <td className="p-3 font-bold text-indigo-600">
                        {studentDue > 0 ? formatCurrency(studentDue) : studentExempt ? '0 ج.م' : '—'}
                      </td>
                      <td className="p-3">
                        {studentExempt ? (
                          <span className="rounded-lg bg-emerald-50 px-2.5 py-1 font-black text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                            معفى من المصاريف
                          </span>
                        ) : monthName.trim() ? (
                          isPaid ? (
                            <span className="rounded-lg bg-emerald-50 px-2.5 py-1 font-black text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                              مسدد ✓ ({formatCurrency(paidAmount)})
                            </span>
                          ) : (
                            <span className={`rounded-lg px-2.5 py-1 font-black ${
                              isPartial
                                ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                                : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                            }`}>
                              {isPartial ? 'دفعة جزئية' : 'غير مسدد'} ({formatCurrency(remainingAmount)})
                            </span>
                          )
                        ) : (
                          <span className="text-slate-400 text-xs">اختر الشهر</span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          {!monthName.trim() ? (
                            <span className="text-slate-400 text-[10px]">حدد الشهر أولاً</span>
                          ) : isPaid ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleStartPaymentEdit(existingPayment!)}
                                className="rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 px-2 py-1 text-[10px] font-bold transition"
                                title="تعديل الدفعة المسجلة"
                              >
                                ✏️ تعديل
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMonthlyExempt(existingPayment!)}
                                className="rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 px-2 py-1 text-[10px] font-bold transition"
                                title="إعفاء هذا الشهر"
                              >
                                🎁 إعفاء
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openQuickPay(student, studentDue)}
                              className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 text-xs transition shadow-sm"
                            >
                              ⚡ تسديد سريع
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ==================== سجل العمليات المالية ==================== */}
      <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-6 dark:border-slate-700">
          <h3 className="text-base font-black text-slate-800 dark:text-slate-100">
            سجل العمليات المالية والتحصيلات ({filteredPayments.length})
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              aria-label="فلترة حسب شهر الاشتراك"
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="الكل">كل الشهور</option>
              {monthOptions.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <select
              value={filterGrade}
              onChange={(e) => setFilterGrade(e.target.value)}
              aria-label="فلترة حسب الصف الدراسي"
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="الكل">كل الصفوف</option>
              {Array.from(
                new Set(students.map((s) => s.grade).filter((g): g is string => Boolean(g)))
              ).map((grade) => (
                <option key={grade} value={grade}>{grade}</option>
              ))}
            </select>
            <select
              value={filterSubject}
              onChange={(e) => setFilterSubject(e.target.value)}
              aria-label="فلترة حسب المادة"
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="كل المواد">كل المواد</option>
              {subjects.filter(s => s !== 'الكل').map((subj) => (
                <option key={subj} value={subj}>{subj}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void fetchData()}
              disabled={fetching}
              className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-700 dark:text-slate-200"
            >
              تحديث 🔄
            </button>
            <button
              type="button"
              onClick={() => setResetPaymentsOpen(true)}
              disabled={filterMonth === 'الكل' || filteredPayments.length === 0 || isSubmitting}
              className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              إلغاء مدفوعات هذا الشهر
            </button>
            <button
              type="button"
              onClick={() => setZeroDebtOpen(true)}
              disabled={filterMonth === 'الكل' || filteredPayments.length === 0 || isSubmitting}
              className="rounded-xl bg-amber-500 px-3 py-2 text-xs font-bold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              إلغاء المديونية
            </button>
            <button
              type="button"
              onClick={() => setPurgeMonthOpen(true)}
              disabled={filterMonth === 'الكل' || filteredPayments.length === 0 || isSubmitting}
              className="rounded-xl bg-rose-950 px-3 py-2 text-xs font-bold text-white transition hover:bg-rose-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              حذف سجلات الشهر بالكامل
            </button>
          </div>
        </div>
        {fetching ? (
          <div className="p-12 text-center text-xs font-bold text-slate-400">جاري تحميل السجلات المالية...</div>
        ) : filteredPayments.length === 0 ? (
          <div className="p-12 text-center text-xs font-bold text-slate-400">
            لا توجد سجلات مالية مطابقة للفلتر.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="border-b border-slate-100 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
                <tr>
                  <th className="p-4 font-bold">اسم الطالب</th>
                  <th className="p-4 font-bold">الصف</th>
                  <th className="p-4 font-bold">المادة</th>
                  <th className="p-4 font-bold">المجموعة</th>
                  <th className="p-4 font-bold">شهر الاشتراك</th>
                  <th className="p-4 font-bold">المبلغ المدفوع</th>
                  <th className="p-4 font-bold">المبلغ المتبقي</th>
                  <th className="p-4 font-bold">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filteredPayments.map((payment) => {
                  const { statusType, statusText, remaining } = payment.status;
                  let statusBadge;
                  switch (statusType) {
                    case 'paid':
                      statusBadge = (
                        <span className="rounded-lg bg-emerald-50 px-2.5 py-1 font-black text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                          {statusText}
                        </span>
                      );
                      break;
                    case 'overdue':
                      statusBadge = (
                        <span className="rounded-lg bg-rose-50 px-2.5 py-1 font-black text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                          {statusText}
                        </span>
                      );
                      break;
                    case 'due':
                      statusBadge = (
                        <span className="rounded-lg bg-amber-50 px-2.5 py-1 font-black text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                          {statusText}
                        </span>
                      );
                      break;
                    case 'future':
                      statusBadge = (
                        <span className="rounded-lg bg-blue-50 px-2.5 py-1 font-black text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                          {statusText}
                        </span>
                      );
                      break;
                  }
                  return (
                    <tr key={payment.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/40">
                      <td className="p-4 font-bold text-slate-800 dark:text-slate-100">
                        {payment.student?.name || 'طالب محذوف'}
                      </td>
                      <td className="p-4 text-slate-600 dark:text-slate-300">
                        {payment.student?.grade || '-'}
                      </td>
                      <td className="p-4 text-slate-600 dark:text-slate-300">
                        {payment.student?.subject || '-'}
                      </td>
                      <td className="p-4 text-slate-600 dark:text-slate-300">
                        {payment.student?.group_name || '-'}
                      </td>
                      <td className="p-4 font-bold text-slate-600 dark:text-slate-300">{payment.month_name}</td>
                      <td className="p-4">
                        <span className="rounded-lg bg-emerald-50 px-2.5 py-1 font-black text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                          {formatCurrency(payment.amount_paid)}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          {statusBadge}
                          {remaining > 0 && (
                            <>
                              {(() => {
                                const reminderMessage = paymentReminderMessage(
                                  payment.student?.name || 'الطالب',
                                  remaining,
                                  payment.month_name
                                );
                                return (
                                  <WhatsAppButton
                                    phone={
                                      payment.student?.guardian_whatsapp ||
                                      payment.student?.guardian_phone ||
                                      payment.student?.parent_whatsapp ||
                                      payment.student?.parent_phone
                                    }
                                    message={reminderMessage}
                                    label="💬 تذكير"
                                  />
                                );
                              })()}
                              {payment.student && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleStartPaymentEdit(payment)}
                                    className="rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 px-2.5 py-1.5 text-xs font-bold transition"
                                    title="تعديل عملية الدفع"
                                  >
                                    ✏️ تعديل الدفع
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleStartEdit(payment.student!)}
                                    className="rounded-xl text-blue-600 hover:bg-blue-50 px-2.5 py-1.5 text-xs font-bold transition"
                                    title="تعديل بيانات الطالب"
                                  >
                                    ✏️ تعديل الطالب
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleMonthlyExempt(payment)}
                                    className="px-2 py-1 text-xs bg-amber-50 text-amber-700 hover:bg-amber-100 rounded transition-colors"
                                    title="إعفاء الشهر الحالي فقط"
                                  >
                                    🎁 إعفاء الشهر
                                  </button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="sticky bottom-0 border-t-2 border-blue-500 bg-blue-50 dark:bg-blue-950/20">
                <tr>
                  <td colSpan={3} className="p-3 font-bold text-slate-800 text-center">إجمالي التحصيل (مفلتر)</td>
                  <td className="p-3 font-bold text-slate-600">{filteredPayments.length} عملية</td>
                  <td className="p-3 font-bold text-emerald-600 text-lg">
                    {formatCurrency(filteredPayments.reduce((sum, p) => sum + toFiniteAmount(p.amount_paid), 0))}
                  </td>
                  <td className="p-3 font-bold text-rose-600 text-lg">
                    {formatCurrency(filteredPayments.reduce((sum, p) => sum + toFiniteAmount(p.amount_remaining ?? 0), 0))}
                  </td>
                  <td className="p-3">
                    <span className="rounded-lg bg-blue-50 px-2.5 py-1 font-black text-blue-700">
                      إجمالي
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {quickPayOpen && quickPayStudent && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          onClick={closeQuickPay}
        >
          <form
            className="w-full max-w-md space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl"
            dir="rtl"
            onClick={(event) => event.stopPropagation()}
            onSubmit={handleQuickPaySubmit}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-slate-800">تسديد سريع</h3>
                <p className="mt-1 text-xs font-bold text-slate-500">تحصيل الدفع دون مغادرة جدول الطلاب</p>
              </div>
              <button
                type="button"
                onClick={closeQuickPay}
                className="rounded-lg px-2 py-1 text-sm font-black text-slate-400 hover:bg-slate-100"
                aria-label="إغلاق"
              >
                ✕
              </button>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 text-sm">
              <div className="font-black text-slate-800">{quickPayStudent.name}</div>
              <div className="mt-1 text-xs font-bold text-slate-500">
                {quickPayStudent.subject || '-'} / {quickPayStudent.grade || '-'}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-indigo-50 p-3 text-center">
                <div className="text-[11px] font-bold text-indigo-600">المبلغ المستحق</div>
                <div className="mt-1 text-lg font-black text-indigo-700">
                  {formatCurrency(getStudentNetAmountDue(quickPayStudent))}
                </div>
              </div>
              <div className="rounded-2xl bg-amber-50 p-3 text-center">
                <div className="text-[11px] font-bold text-amber-600">الشهر</div>
                <div className="mt-1 text-sm font-black text-amber-700">
                  {cleanMonthOption(monthName || getCurrentMonthName())}
                </div>
              </div>
            </div>
            <label className="block text-xs font-bold text-slate-600">
              المبلغ المدفوع (ج.م)
              <input
                type="number"
                min="0"
                step="0.01"
                value={quickPayAmount}
                onChange={(event) => setQuickPayAmount(event.target.value)}
                className={`${INPUT_CLASS} mt-1.5`}
                autoFocus
              />
            </label>
            <label className="block text-xs font-bold text-slate-600">
              ملاحظات الدفع
              <textarea
                value={quickPayNotes}
                onChange={(event) => setQuickPayNotes(event.target.value)}
                rows={2}
                placeholder="ملاحظات اختيارية"
                className={`${INPUT_CLASS} mt-1.5 resize-none`}
              />
            </label>
            <button
              type="submit"
              disabled={quickPaySubmitting}
              className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {quickPaySubmitting ? 'جارٍ تسجيل الدفع...' : 'تأكيد وتحصيل الدفع'}
            </button>
          </form>
        </div>
      )}

      {/* ==================== مودال الطلاب المسددين ==================== */}
      {showPaidStudentsModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          onClick={() => setShowPaidStudentsModal(false)}
        >
          <div
            className="w-full max-w-6xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl max-h-[80vh] flex flex-col"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-slate-800">الطلاب المسددون - {currentMonth}</h3>
                <p className="text-xs text-slate-500">السنة الدراسية: {centerSettings.academicYear} | {centerSettings.centerName}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-xl">
                  {paidStudentsCurrentMonth.length} طالب
                </span>
                <span className="text-xs font-bold bg-blue-50 text-blue-700 px-2.5 py-1 rounded-xl">
                  إجمالي: {formatCurrency(paidStudentsCurrentMonth.reduce((sum, p) => sum + toFiniteAmount(p.paidAmount), 0))}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const printWindow = window.open('', '_blank');
                    if (printWindow) {
                      const tableHtml = document.querySelector('.paid-students-table')?.outerHTML || '';
                      printWindow.document.write(`
                        <!DOCTYPE html>
                        <html dir="rtl">
                        <head>
                          <meta charset="UTF-8">
                          <title>كشف الإيرادات - ${escapeHtml(currentMonth)}</title>
                          <style>
                            body { font-family: Arial, sans-serif; padding: 20px; direction: rtl; }
                            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                            th, td { border: 1px solid #ddd; padding: 8px; text-align: right; font-size: 12px; }
                            th { background: #f3f4f6; font-weight: bold; }
                            .total-row { background: #dbeafe; font-weight: bold; }
                            @media print { .no-print { display: none; } }
                          </style>
                        </head>
                        <body>
                          <h2 style="text-align: center;">${escapeHtml(centerSettings.centerName)}</h2>
                          <h3 style="text-align: center;">كشف الإيرادات المحصلة - ${escapeHtml(currentMonth)} (${escapeHtml(centerSettings.academicYear)})</h3>
                          <p style="text-align: center; color: #666;">إجمالي التحصيل: ${paidStudentsCurrentMonth.reduce((sum, p) => sum + toFiniteAmount(p.paidAmount), 0).toLocaleString()} ج.م</p>
                          ${tableHtml}
                          <script>window.onload = () => window.print();<\/script>
                        </body>
                        </html>
                      `);
                      printWindow.document.close();
                    }
                  }}
                  className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-blue-700 no-print"
                >
                  🖨️ طباعة / تصدير
                </button>
                <button
                  type="button"
                  onClick={() => setShowPaidStudentsModal(false)}
                  className="rounded-lg px-2 py-1 text-sm font-black text-slate-400 hover:bg-slate-100"
                >
                  ✕
                </button>
              </div>
            </div>
            <input
              type="text"
              value={paidStudentsSearch}
              onChange={(e) => setPaidStudentsSearch(e.target.value)}
              placeholder="ابحث باسم الطالب..."
              autoFocus
              className="mb-4 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:outline-none"
            />
            <div className="overflow-y-auto max-h-[60vh]">
              {filteredPaidStudents.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  {paidStudentsSearch.trim() ? 'لا توجد نتائج مطابقة للبحث.' : 'لا توجد دفعات مسجلة لهذا الشهر.'}
                </div>
              ) : (
                <table className="w-full text-right text-xs paid-students-table">
                  <thead className="border-b border-slate-100 bg-slate-50 text-slate-500 sticky top-0">
                    <tr>
                      <th className="p-3 font-bold">التاريخ</th>
                      <th className="p-3 font-bold">اسم الطالب</th>
                      <th className="p-3 font-bold">المادة / المجموعة</th>
                      <th className="p-3 font-bold">المبلغ</th>
                      <th className="p-3 font-bold">طريقة الدفع</th>
                      <th className="p-3 font-bold">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredPaidStudents.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 text-slate-600">{p.paymentDate}</td>
                        <td className="p-3 font-bold text-slate-800">{p.studentName}</td>
                        <td className="p-3 text-slate-600">{p.subject} / {p.grade}</td>
                        <td className="p-3 font-bold text-emerald-600">{formatCurrency(p.paidAmount)}</td>
                        <td className="p-3 text-slate-600">كاش</td>
                        <td className="p-3">
                          <span className="rounded-lg bg-emerald-50 px-2.5 py-1 font-black text-emerald-700">
                            🟢 تم السداد
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== مودال دفعات اليوم ==================== */}
      {showTodayPaymentsModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          onClick={() => setShowTodayPaymentsModal(false)}
        >
          <div
            className="w-full max-w-4xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl max-h-[80vh] flex flex-col"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-slate-800">دفعات اليوم - {new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h3>
                <p className="text-xs text-slate-500">{centerSettings.centerName}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold bg-amber-50 text-amber-700 px-2.5 py-1 rounded-xl">
                  {todayPaymentsCount} {todayPaymentsCount === 1 ? 'دفعة' : 'دفعات'} — {formatCurrency(todayIncome)}
                </span>
                <button
                  type="button"
                  onClick={() => setShowTodayPaymentsModal(false)}
                  className="rounded-lg px-2 py-1 text-sm font-black text-slate-400 hover:bg-slate-100"
                >
                  ✕
                </button>
              </div>
            </div>
            <input
              type="text"
              value={todayPaymentsSearch}
              onChange={(e) => setTodayPaymentsSearch(e.target.value)}
              placeholder="ابحث باسم الطالب..."
              autoFocus
              className="mb-4 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:outline-none"
            />
            <div className="overflow-y-auto max-h-[60vh]">
              {filteredTodayPayments.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  {todayPaymentsSearch.trim() ? 'لا توجد نتائج مطابقة للبحث.' : 'لا توجد دفعات مسجلة اليوم.'}
                </div>
              ) : (
                <table className="w-full text-right text-xs">
                  <thead className="border-b border-slate-100 bg-slate-50 text-slate-500 sticky top-0">
                    <tr>
                      <th className="p-3 font-bold">اسم الطالب</th>
                      <th className="p-3 font-bold">الصف</th>
                      <th className="p-3 font-bold">المادة</th>
                      <th className="p-3 text-center font-bold">الشهر المستهدف</th>
                      <th className="p-3 font-bold">المبلغ المسدد</th>
                      <th className="p-3 font-bold">وقت السداد</th>
                      <th className="p-3 font-bold">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredTodayPayments.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 font-bold text-slate-800">{p.studentName}</td>
                        <td className="p-3 text-slate-600">{p.grade}</td>
                        <td className="p-3 text-slate-600">{p.subject}</td>
                        <td className="p-3 text-center">
                          <span className="rounded-lg bg-blue-50 px-2.5 py-1 font-bold text-blue-700">
                            {p.targetMonth}
                          </span>
                        </td>
                        <td className="p-3 font-bold text-amber-600">{formatCurrency(p.paidAmount)}</td>
                        <td className="p-3 text-slate-600">{p.paymentTime}</td>
                        <td className="p-3">
                          <span className="rounded-lg bg-emerald-50 px-2.5 py-1 font-black text-emerald-700">
                            🟢 تم السداد
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== مودال إضافة/تعديل طالب ==================== */}
      {formOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          onClick={() => handleCancelEdit()}
        >
          <div
            className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl max-h-[80vh] flex flex-col"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-black text-slate-800">
                {editingId !== null ? '✏️ تعديل بيانات الطالب' : '➕ إضافة طالب جديد'}
              </h3>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="rounded-lg px-2 py-1 text-sm font-black text-slate-400 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>
            {message && (
              <div
                className={`mb-4 rounded-2xl border p-3 text-center text-xs font-bold ${
                  message.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : 'bg-rose-50 border-rose-200 text-rose-700'
                }`}
              >
                {message.text}
              </div>
            )}
            <form onSubmit={handleSubmitForm} className="grid grid-cols-1 gap-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 items-end">
                <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-600">
                  اسم الطالب *
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-600">
                  المرحلة الدراسية *
                  <select
                    name="stage"
                    value={formData.stage}
                    onChange={(e) => setFormData({ ...formData, stage: e.target.value })}
                    required
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="">-- اختر مرحلة --</option>
                    {STAGES.map((stage) => (
                      <option key={stage} value={stage}>{stage}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-600">
                  الصف الدراسي *
                  <select
                    name="grade"
                    value={formData.grade}
                    onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                    required
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="">-- اختر صف --</option>
                    {ALL_GRADES.map((grade) => (
                      <option key={grade} value={grade}>{grade}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-600">
                  اسم ولي الأمر
                  <input
                    type="text"
                    name="guardianName"
                    value={formData.guardianName}
                    onChange={(e) => setFormData({ ...formData, guardianName: e.target.value })}
                    placeholder="اسم ولي الأمر"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-600">
                  هاتف ولي الأمر
                  <input
                    type="text"
                    name="guardianPhone"
                    value={formData.guardianPhone}
                    onChange={(e) => setFormData({ ...formData, guardianPhone: e.target.value })}
                    placeholder="010xxxxxxxx"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-600">
                  واتساب ولي الأمر
                  <input
                    type="text"
                    name="guardianWhatsapp"
                    value={formData.guardianWhatsapp}
                    onChange={(e) => setFormData({ ...formData, guardianWhatsapp: e.target.value })}
                    placeholder="2010xxxxxxxx"
                    dir="ltr"
                    className={`${INPUT_CLASS} font-mono`}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-600">
                  ملاحظات ولي الأمر
                  <input
                    type="text"
                    name="guardianNotes"
                    value={formData.guardianNotes}
                    onChange={(e) => setFormData({ ...formData, guardianNotes: e.target.value })}
                    placeholder="ملاحظات..."
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-600">
                  العنوان
                  <input
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="العنوان"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-600">
                  المدرسة
                  <input
                    type="text"
                    name="school"
                    value={formData.school}
                    onChange={(e) => setFormData({ ...formData, school: e.target.value })}
                    placeholder="اسم المدرسة"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </label>
                <div className="md:col-span-2 flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="rounded-2xl bg-indigo-600 px-6 py-3 text-xs font-extrabold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                  >
                    {loading ? 'جاري الحفظ...' : editingId !== null ? '💾 حفظ التعديلات' : '➕ إضافة طالب'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {zeroDebtOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          onClick={() => !isSubmitting && setZeroDebtOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-3xl border border-amber-200 bg-white p-6 shadow-2xl"
            dir="rtl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-lg font-black text-amber-700">إلغاء المديونية</h3>
            <p className="mt-3 text-sm font-bold leading-7 text-slate-700">
              هل أنت متأكد من تصفير المديونية المتبقية لشهر {filterMonth}؟ سيتم تعديل المبالغ المتبقية إلى 0 ج.م للطلاب المفلترين.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setZeroDebtOpen(false)}
                disabled={isSubmitting}
                className="rounded-2xl bg-slate-100 px-5 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-200 disabled:opacity-50"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => void handleZeroFilteredMonthDebt()}
                disabled={isSubmitting}
                className="rounded-2xl bg-amber-500 px-5 py-2.5 text-xs font-extrabold text-white transition hover:bg-amber-600 disabled:opacity-50"
              >
                {isSubmitting ? 'جاري التصفير...' : 'تأكيد التصفير'}
              </button>
            </div>
          </div>
        </div>
      )}

      {purgeMonthOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm"
          onClick={() => !isSubmitting && setPurgeMonthOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-3xl border border-rose-300 bg-white p-6 shadow-2xl"
            dir="rtl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-lg font-black text-rose-800">حذف سجلات الشهر</h3>
            <p className="mt-3 text-sm font-bold leading-7 text-slate-700">
              تحذير: سيتم حذف جميع سجلات الاشتراكات لشهر {filterMonth} نهائياً للطلاب المفلترين.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPurgeMonthOpen(false)}
                disabled={isSubmitting}
                className="rounded-2xl bg-slate-100 px-5 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-200 disabled:opacity-50"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => void handlePurgeFilteredMonthPayments()}
                disabled={isSubmitting}
                className="rounded-2xl bg-rose-950 px-5 py-2.5 text-xs font-extrabold text-white transition hover:bg-rose-900 disabled:opacity-50"
              >
                {isSubmitting ? 'جاري الحذف...' : 'تأكيد الحذف النهائي'}
              </button>
            </div>
          </div>
        </div>
      )}

      {resetPaymentsOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          onClick={() => !isSubmitting && setResetPaymentsOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-3xl border border-rose-200 bg-white p-6 shadow-2xl"
            dir="rtl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-lg font-black text-rose-700">إلغاء مدفوعات الشهر</h3>
            <p className="mt-3 text-sm font-bold leading-7 text-slate-700">
              هل أنت متأكد من إلغاء كل مدفوعات شهر {filterMonth}؟ سيتم تصفير المبالغ المدفوعة وإعادتها لحالة غير مسدد للطلاب المفلترين.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setResetPaymentsOpen(false)}
                disabled={isSubmitting}
                className="rounded-2xl bg-slate-100 px-5 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-200 disabled:opacity-50"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => void handleResetFilteredMonthPayments()}
                disabled={isSubmitting}
                className="rounded-2xl bg-rose-600 px-5 py-2.5 text-xs font-extrabold text-white transition hover:bg-rose-700 disabled:opacity-50"
              >
                {isSubmitting ? 'جاري الإلغاء...' : 'تأكيد الإلغاء'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== مودال تحصيل المجموعة ==================== */}
      {showBulkPaymentModal ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          onClick={closeBulkPaymentModal}
        >
          <div
            className="w-full max-w-5xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl max-h-[85vh] flex flex-col"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-slate-800">📦 تحصيل رسوم مجموعة</h3>
                <p className="text-xs text-slate-500">السنة الدراسية: {centerSettings.academicYear}</p>
              </div>
              <button
                type="button"
                onClick={closeBulkPaymentModal}
                className="rounded-lg px-2 py-1 text-sm font-black text-slate-400 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>
            <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-600">
                المرحلة الدراسية *
                <select
                  value={bulkPaymentStage}
                  onChange={(e) => handleBulkPaymentStageChange(e.target.value)}
                  className={INPUT_CLASS}
                >
                  <option value="">-- اختر المرحلة --</option>
                  {bulkStages.map((stage) => (
                    <option key={stage} value={stage}>{stage}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-600">
                الصف الدراسي *
                <select
                  value={bulkPaymentGrade}
                  onChange={(e) => handleBulkPaymentGradeChange(e.target.value)}
                  disabled={!bulkPaymentStage}
                  className={INPUT_CLASS}
                >
                  <option value="">{bulkPaymentStage ? '-- اختر الصف --' : '-- اختر المرحلة أولاً --'}</option>
                  {bulkGradesForStage.map((grade) => (
                    <option key={grade} value={grade}>{grade}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-600">
                المجموعة *
                <select
                  value={bulkPaymentGroup}
                  onChange={(e) => handleBulkPaymentGroupChange(e.target.value)}
                  disabled={!bulkPaymentGrade}
                  className={INPUT_CLASS}
                >
                  <option value="">{bulkPaymentGrade ? '-- اختر المجموعة --' : '-- اختر الصف أولاً --'}</option>
                  {bulkGroupsForGrade.map((group) => (
                    <option key={group} value={group}>{group}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-600">
                المادة *
                <select
                  value={bulkPaymentSubject}
                  onChange={(e) => handleBulkPaymentSubjectChange(e.target.value)}
                  disabled={!bulkPaymentGroup}
                  className={INPUT_CLASS}
                >
                  <option value="">{bulkPaymentGroup ? '-- اختر المادة --' : '-- اختر المجموعة أولاً --'}</option>
                  {bulkSubjectsForGroup.map((subject) => (
                    <option key={subject} value={subject}>{subject}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-600">
                شهر الاشتراك *
                <select
                  value={bulkPaymentMonth}
                  onChange={(e) => handleBulkPaymentMonthChange(e.target.value)}
                  required
                  className={INPUT_CLASS}
                >
                  <option value="">-- اختر شهر --</option>
                  {subscriptionMonthOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-bold text-slate-500">
                {bulkPaymentSelectionComplete
                  ? 'كل الاختيارات مكتملة، اضغط لتحميل طلاب المجموعة.'
                  : 'أكمل اختيار المرحلة ثم الصف ثم المجموعة ثم المادة وشهر الاشتراك لتفعيل زر التحميل.'}
              </p>
              <button
                type="button"
                onClick={loadBulkPaymentStudents}
                disabled={!bulkPaymentSelectionComplete || bulkPaymentLoading}
                className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-extrabold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
              >
                {bulkPaymentLoading ? 'جاري التحميل...' : '🔍 تحميل طلاب المجموعة'}
              </button>
            </div>
            <div className="mb-4 max-h-[50vh] overflow-y-auto">
              {bulkPaymentStudents.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  {bulkPaymentSelectionComplete ? 'اضغط على "تحميل طلاب المجموعة" لعرض الطلاب' : 'اختر المرحلة والصف والمجموعة والمادة والشهر ثم اضغط تحميل'}
                </div>
              ) : (
                <>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-slate-600">
                      <span>إجمالي: {bulkPaymentStudents.length} طالب</span>
                      <span className="text-indigo-600">الرسوم: {formatCurrency(bulkPaymentTotals.fees)}</span>
                      <span className="text-emerald-600">المدفوع: {formatCurrency(bulkPaymentTotals.paid)}</span>
                      <span className="text-rose-600">المتبقي: {formatCurrency(bulkPaymentTotals.remaining)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleMarkAllAsPaid}
                      className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700"
                    >
                      ✅ تحديد الكل كمُسدد بالكامل
                    </button>
                  </div>
                  <table className="w-full text-right text-xs">
                    <thead className="border-b border-slate-100 bg-slate-50 text-slate-500 sticky top-0">
                      <tr>
                        <th className="p-3 font-bold">اسم الطالب</th>
                        <th className="p-3 font-bold">الصف</th>
                        <th className="p-3 font-bold">سعر الاشتراك</th>
                        <th className="p-3 font-bold">حالة الدفع الحالية</th>
                        <th className="p-3 font-bold">المبلغ المدفوع</th>
                        <th className="p-3 font-bold">المبلغ المتبقي</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {bulkPaymentStudents.map((sp) => (
                        <tr key={sp.student.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3 font-bold text-slate-800">{sp.student.name}</td>
                          <td className="p-3 text-slate-600">{sp.student.grade || '-'}</td>
                          <td className="p-3 font-bold text-indigo-600">{formatCurrency(sp.defaultPrice)}</td>
                          <td className="p-3">
                            {sp.hasPayment ? (
                              <span className="rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">مسدد سابقاً</span>
                            ) : (
                              <span className="rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700">غير مسدد</span>
                            )}
                          </td>
                          <td className="p-3">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max={sp.defaultPrice}
                              value={sp.amountPaid}
                              onChange={(e) => handleBulkPaymentAmountChange(sp.student.id, 'amountPaid', e.target.value)}
                              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:outline-none"
                            />
                          </td>
                          <td className="p-3">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max={sp.defaultPrice}
                              value={sp.amountRemaining}
                              onChange={(e) => handleBulkPaymentAmountChange(sp.student.id, 'amountRemaining', e.target.value)}
                              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:outline-none"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={closeBulkPaymentModal}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveBulkPayment}
                disabled={bulkPaymentStudents.length === 0 || bulkPaymentLoading}
                className="rounded-2xl bg-indigo-600 px-6 py-2.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
              >
                {bulkPaymentLoading ? 'جاري الحفظ...' : '💾 حفظ التحصيلات'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}