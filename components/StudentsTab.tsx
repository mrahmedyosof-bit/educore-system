'use client';
import { useMemo, useState, useCallback, useDeferredValue, useEffect, useRef, type ChangeEvent, type FormEvent } from 'react';
import { useAppData } from './AppContext';
import { useCurriculumSettings } from '@/hooks/useCurriculumSettings';
import { getUniqueStudentsCount } from '@/lib/services/students';
import { priceKey } from '@/lib/services/settings';
import ExportButtons from './ExportButtons';
import StudentCardModal from './StudentCardModal';
import StudentReportModal from './StudentReportModal';
import type { Student as ApplicationStudent } from '@/lib/services/students';
import { normalizeEgyptianPhone, dueReminderMessage } from '@/lib/whatsapp';
import { getFriendlyErrorMessage } from '@/lib/errors';
import WhatsAppButton from './WhatsAppButton';
import { getPayments, addPayment } from '@/lib/services/payments';
import { onPaymentUpdate, emitPaymentUpdate } from '@/lib/events';

interface StudentFormData {
  barcode: string;
  name: string;
  stage: string;
  grade: string;
  group: string;
  subject: string;
  dueAmount: number;
  discountAmount: number;
  isExempt: boolean;
  guardianName: string;
  guardianPhone: string;
  guardianWhatsapp: string;
  guardianNotes: string;
  address: string;
  school: string;
}

const INITIAL_FORM_DATA: StudentFormData = {
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

const STAGES_AND_GRADES: Record<string, string[]> = {
  'المرحلة الابتدائية': [
    'الصف الأول الابتدائي',
    'الصف الثاني الابتدائي',
    'الصف الثالث الابتدائي',
    'الصف الرابع الابتدائي',
    'الصف الخامس الابتدائي',
    'الصف السادس الابتدائي',
  ],
  'المرحلة الإعدادية': [
    'الصف الأول الإعدادي',
    'الصف الثاني الإعدادي',
    'الصف الثالث الإعدادي',
  ],
  'المرحلة الثانوية': [
    'الصف الأول الثانوي',
    'الصف الثاني الثانوي',
    'الصف الثالث الثانوي',
  ],
};

const normalizeMonth = (month: string): string => {
  return month
    .trim()
    .replace(/أ/g, 'ا')
    .replace(/إ/g, 'ا')
    .replace(/آ/g, 'ا')
    .replace(/\s+/g, ' ');
};

export default function StudentsTab() {
  const { students, uniqueStudents, loading: studentsLoading, addStudent, updateStudent, deleteStudent } = useAppData();
  const { subjects, priceMatrix } = useCurriculumSettings();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGrade, setSelectedGrade] = useState('الكل');
  const [selectedSubject, setSelectedSubject] = useState('الكل');
  const [selectedGroup, setSelectedGroup] = useState('الكل');
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [extraOpen, setExtraOpen] = useState(false);
  const [formData, setFormData] = useState<StudentFormData>(INITIAL_FORM_DATA);
  const [cardStudent, setCardStudent] = useState<ApplicationStudent | null>(null);
  const [reportStudent, setReportStudent] = useState<ApplicationStudent | null>(null);
  const [uniqueStudentsCount, setUniqueStudentsCount] = useState<number>(0);
  const [activeCardFilter, setActiveCardFilter] = useState<
    'all' | 'unique_students' | 'total_subscriptions' | 'pending_payment' | 'exempted' | 'groups'
  >('all');
  const [payments, setPayments] = useState<
    Array<{
      student_id: number | null;
      amount_paid: number;
      amount_remaining: number;
      month_name: string;
    }>
  >([]);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showQuickPayModal, setShowQuickPayModal] = useState(false);
  const [quickPayStudent, setQuickPayStudent] = useState<ApplicationStudent | null>(null);
  const [quickPayAmount, setQuickPayAmount] = useState<string>('');
  const [quickPayLoading, setQuickPayLoading] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState<number | null>(null);

  /* ═══════════════════════════════════════════════════════════
     ✅ State جديدة لـ Modal Confirmation (تأكيد الحذف)
     تحل محل window.confirm القبيح والغير متوافق مع التصميم
  ═══════════════════════════════════════════════════════════ */
  const [studentToDelete, setStudentToDelete] = useState<ApplicationStudent | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const currentMonth = useMemo(
    () => new Date().toLocaleString('ar-EG', { month: 'long', year: 'numeric' }),
    []
  );
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const subscriptionCountByStudent = useMemo(() => {
    const counts = new Map<number, number>();
    students.forEach((student) => counts.set(student.id, (counts.get(student.id) ?? 0) + 1));
    return counts;
  }, [students]);

  useEffect(() => {
    getUniqueStudentsCount().then(setUniqueStudentsCount).catch(console.error);
  }, []);

  useEffect(() => {
    const loadPayments = async () => {
      try {
        const allPayments = await getPayments();
        const paymentData = allPayments.map((p) => ({
          student_id: p.student_id,
          amount_paid: Number(p.amount_paid ?? 0),
          amount_remaining: Number(p.amount_remaining ?? 0),
          month_name: p.month_name,
        }));
        setPayments(paymentData);
      } catch (error) {
        console.error('فشل في تحميل المدفوعات:', error);
      }
    };
    loadPayments();
  }, []);

  useEffect(() => {
    const unsubscribe = onPaymentUpdate(() => {
      const loadPayments = async () => {
        try {
          const allPayments = await getPayments();
          const paymentData = allPayments.map((p) => ({
            student_id: p.student_id,
            amount_paid: Number(p.amount_paid ?? 0),
            amount_remaining: Number(p.amount_remaining ?? 0),
            month_name: p.month_name,
          }));
          setPayments(paymentData);
          setToast({
            type: 'success',
            text: '✅ تم تحديث حالة المدفوعات تلقائياً',
          });
          if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
          toastTimeoutRef.current = setTimeout(() => setToast(null), 3000);
        } catch (error) {
          console.error('فشل في تحديث المدفوعات:', error);
        }
      };
      loadPayments();
    });
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  /* ═══════════════════════════════════════════════════════════
     ✅ إغلاق القائمة المنسدلة عند النقر خارجها
     استخدام mousedown لتجنب التعارض مع stopPropagation
  ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (openDropdownId === null) return;
    const handleMouseDown = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpenDropdownId(null);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [openDropdownId]);

  const showToast = useCallback((next: { type: 'success' | 'error'; text: string }) => {
    setToast(next);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const netDueOf = useCallback(
    (s: ApplicationStudent): number => {
      if (s.isExempt) return 0;
      const basePrice = priceMatrix[priceKey(s.grade ?? '', s.subject ?? '')] ?? 0;
      const totalExpected = Math.max(0, basePrice + (s.dueAmount ?? 0) - (s.discountAmount ?? 0));
      if (totalExpected <= 0) return 0;
      const currentMonthNormalized = normalizeMonth(currentMonth);
      const studentPayment = payments.find(
        (p) => p.student_id === s.id && normalizeMonth(p.month_name) === currentMonthNormalized
      );
      return studentPayment && Number(studentPayment.amount_remaining) > 0
        ? Number(studentPayment.amount_remaining)
        : 0;
    },
    [payments, currentMonth, priceMatrix]
  );

  const handleOpenQuickPay = useCallback(
    (student: ApplicationStudent) => {
      setQuickPayStudent(student);
      setQuickPayAmount(String(netDueOf(student)));
      setShowQuickPayModal(true);
    },
    [netDueOf]
  );

  const handleConfirmQuickPay = useCallback(async () => {
    if (!quickPayStudent) return;
    const amount = Number(quickPayAmount);
    const due = netDueOf(quickPayStudent);
    if (isNaN(amount) || amount <= 0) {
      showToast({ type: 'error', text: 'يرجى إدخال مبلغ صحيح أكبر من صفر' });
      return;
    }
    if (amount > due) {
      showToast({ type: 'error', text: 'المبلغ المدفوع لا يمكن أن يتجاوز إجمالي المديونية المستحقة' });
      return;
    }
    setQuickPayLoading(true);
    try {
      await addPayment({
        student_id: quickPayStudent.id!,
        amount_paid: amount,
        amount_remaining: due - amount,
        month_name: currentMonth,
      });
      const allPayments = await getPayments();
      const paymentData = allPayments.map((p) => ({
        student_id: p.student_id,
        amount_paid: Number(p.amount_paid ?? 0),
        amount_remaining: Number(p.amount_remaining ?? 0),
        month_name: p.month_name,
      }));
      setPayments(paymentData);
      emitPaymentUpdate({
        type: 'payment-added',
        studentId: quickPayStudent.id,
        timestamp: Date.now(),
      });
      showToast({
        type: 'success',
        text: '✅ تم تسجيل الدفعة بنجاح!',
      });
      setShowQuickPayModal(false);
      setQuickPayStudent(null);
      setQuickPayAmount('');
    } catch (err) {
      console.error('فشل تسجيل الدفعة:', err);
      showToast({
        type: 'error',
        text: getFriendlyErrorMessage(err, 'حدث خطأ أثناء تسجيل الدفعة'),
      });
    } finally {
      setQuickPayLoading(false);
    }
  }, [quickPayStudent, quickPayAmount, currentMonth, netDueOf, showToast]);

  /* ═══════════════════════════════════════════════════════════
     ✅ دالة تأكيد الحذف (Modal Confirmation Handler)
     تُنفذ الحذف الفعلي بعد تأكيد المستخدم من الـ Modal المخصص
  ═══════════════════════════════════════════════════════════ */
  const handleConfirmDelete = useCallback(async () => {
    if (!studentToDelete) return;
    setDeleteLoading(true);
    try {
      await deleteStudent(studentToDelete.id);
      if (editingId === studentToDelete.id) {
        resetForm();
      }
      showToast({
        type: 'success',
        text: `✅ تم حذف الطالب (${studentToDelete.name}) بنجاح`,
      });
      setStudentToDelete(null);
    } catch (err) {
      console.error('فشل حذف الطالب:', err);
      showToast({
        type: 'error',
        text: getFriendlyErrorMessage(err, 'تعذر حذف الطالب.'),
      });
    } finally {
      setDeleteLoading(false);
    }
  }, [studentToDelete, editingId, deleteStudent, showToast, resetForm]);

  function resetForm() {
    setFormData(INITIAL_FORM_DATA);
    setEditingId(null);
    setExtraOpen(false);
  }

  const handleInputChange = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const { checked } = e.target as HTMLInputElement;
      setFormData((prev) => ({
        ...prev,
        [name]: checked,
        ...(name === 'isExempt' && checked ? { dueAmount: 0, discountAmount: 0 } : {}),
      }));
      return;
    }
    if (name === 'stage') {
      const firstGradeForStage = STAGES_AND_GRADES[value]?.[0] || '';
      setFormData((prev) => ({
        ...prev,
        stage: value,
        grade: firstGradeForStage,
      }));
      return;
    }
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'dueAmount' || name === 'discountAmount' ? (value === '' ? 0 : Number(value)) : value,
    }));
  };

  const handleCopyPhoneToWhatsapp = () => {
    const normalized = normalizeEgyptianPhone(formData.guardianPhone) ?? '';
    setFormData((prev) => ({
      ...prev,
      guardianWhatsapp: normalized,
    }));
  };

  const nextBarcodeValue = (): string => {
    const taken = new Set(
      uniqueStudents.map((s) => parseInt(s.barcode ?? '', 10)).filter((n) => Number.isFinite(n))
    );
    let candidate = taken.size ? Math.max(...taken) + 1 : 1001;
    while (taken.has(candidate)) candidate += 1;
    return String(candidate);
  };

  const handleSubmitForm = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const name = formData.name.trim();
    if (!name) {
      showToast({ type: 'error', text: 'يرجى إدخال اسم الطالب.' });
      return;
    }
    let barcode = formData.barcode.trim();
    if (!barcode) {
      barcode = nextBarcodeValue();
    }
    if (
      uniqueStudents.some(
        (s) => s.barcode?.trim().toLowerCase() === barcode.toLowerCase() && s.id !== editingId
      )
    ) {
      showToast({ type: 'error', text: 'كود الباركود مستخدم بالفعل لطالب آخر — اضغط 🎲 لتوليد كود آخر.' });
      return;
    }
    const stage = formData.stage.trim();
    const grade = formData.grade.trim();
    const group = formData.group.trim();
    const subject = formData.subject.trim();
    if (!stage || !grade || !group || !subject) {
      showToast({ type: 'error', text: 'يرجى استكمال اختيار المرحلة، الصف الدراسي، المجموعة، والمادة.' });
      return;
    }
    const isExempt = formData.isExempt;
    const basePrice = priceMatrix[priceKey(grade, subject)] ?? 0;
    const dueAmount = isExempt ? 0 : formData.dueAmount;
    const maxAllowedDiscount = basePrice + dueAmount;
    const discountAmount = isExempt ? 0 : Math.min(formData.discountAmount, maxAllowedDiscount);
    if (!Number.isFinite(dueAmount) || !Number.isFinite(discountAmount)) {
      showToast({ type: 'error', text: 'يرجى إدخال مبالغ مالية صحيحة.' });
      return;
    }
    if (dueAmount < 0 || discountAmount < 0) {
      showToast({ type: 'error', text: 'لا يمكن إدخال مبالغ مالية سالبة.' });
      return;
    }
    const finalWhatsapp = normalizeEgyptianPhone(formData.guardianWhatsapp || formData.guardianPhone) ?? '';
    const studentData = {
      barcode,
      name,
      stage,
      grade,
      group,
      subject,
      dueAmount,
      discountAmount,
      isExempt,
      guardian_name: formData.guardianName.trim(),
      guardian_phone: formData.guardianPhone.trim(),
      guardian_whatsapp: finalWhatsapp,
      guardian_notes: formData.guardianNotes.trim(),
      address: formData.address.trim() || null,
      school: formData.school.trim() || null,
    };
    try {
      if (editingId !== null) {
        await updateStudent(editingId, studentData);
      } else {
        await addStudent(studentData);
      }
      resetForm();
      setFormOpen(false);
      showToast({ type: 'success', text: 'تم حفظ بيانات الطالب بنجاح!' });
    } catch (err: unknown) {
      const errorCode = (err as { code?: string } | null)?.code;
      if (errorCode === '23505') {
        showToast({
          type: 'error',
          text: 'تعذر الحفظ: يوجد طالب آخر بنفس الاسم مسجل بالفعل في هذه المجموعة والمادة.',
        });
      } else {
        showToast({ type: 'error', text: getFriendlyErrorMessage(err, 'تعذر حفظ بيانات الطالب.') });
      }
    }
  };

  const handleStartEdit = (student: ApplicationStudent) => {
    setEditingId(student.id);
    setFormOpen(true);
    setFormData({
      barcode: student.barcode ?? '',
      name: student.name ?? '',
      stage: student.stage ?? 'المرحلة الإعدادية',
      grade: student.grade ?? 'الصف الثالث الإعدادي',
      group: student.group ?? 'مجموعة 1',
      subject: student.subject ?? 'الرياضيات',
      dueAmount: Number.isFinite(student.dueAmount) ? student.dueAmount : 0,
      discountAmount: Number.isFinite(student.discountAmount) ? student.discountAmount : 0,
      isExempt: student.isExempt ?? false,
      guardianName: student.guardian_name ?? '',
      guardianPhone: student.guardian_phone ?? '',
      guardianWhatsapp: student.guardian_whatsapp ?? '',
      guardianNotes: student.guardian_notes ?? '',
      address: student.address ?? '',
      school: student.school ?? '',
    });
    window.requestAnimationFrame(() => {
      const formContainer = document.getElementById('student-form');
      if (!formContainer) return;
      const yOffset = -120;
      const top = formContainer.getBoundingClientRect().top + window.scrollY + yOffset;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    });
  };

  const handleCancelEdit = () => {
    resetForm();
    setFormOpen(false);
  };

  const generateBarcode = () => {
    setFormData((prev) => ({ ...prev, barcode: nextBarcodeValue() }));
  };

  const handleCardClick = (
    cardType: 'all' | 'unique_students' | 'total_subscriptions' | 'pending_payment' | 'exempted' | 'groups'
  ) => {
    if (activeCardFilter === cardType) {
      setActiveCardFilter('all');
    } else {
      setActiveCardFilter(cardType);
    }
  };

  const getActiveFilterLabel = (filter: typeof activeCardFilter): string => {
    switch (filter) {
      case 'unique_students':
        return 'طلاب فريدين';
      case 'total_subscriptions':
        return 'إجمالي الاشتراكات';
      case 'pending_payment':
        return 'مطلوب منهم السداد';
      case 'exempted':
        return 'معفيون من المصاريف';
      case 'groups':
        return 'عدد المجموعات';
      default:
        return '';
    }
  };

  const availableGrades = STAGES_AND_GRADES[formData.stage] || [];

  const baseSubjectPrice = useMemo(() => {
    if (!formData.grade || !formData.subject) return 0;
    const key = priceKey(formData.grade, formData.subject);
    const price = priceMatrix[key];
    return typeof price === 'number' && Number.isFinite(price) ? price : 0;
  }, [formData.grade, formData.subject, priceMatrix]);

  const totalDue = useMemo(() => {
    if (formData.isExempt) return 0;
    return Math.max(0, baseSubjectPrice + formData.dueAmount - formData.discountAmount);
  }, [formData.isExempt, baseSubjectPrice, formData.dueAmount, formData.discountAmount]);

  const discountExceedsTotal = useMemo(() => {
    if (formData.isExempt) return false;
    return formData.discountAmount > baseSubjectPrice + formData.dueAmount;
  }, [formData.isExempt, baseSubjectPrice, formData.dueAmount, formData.discountAmount]);

  const gradeFilterOptions = useMemo(
    () =>
      Array.from(new Set(uniqueStudents.map((s) => s.grade).filter((g): g is string => Boolean(g)))).sort(
        (a, b) => a.localeCompare(b, 'ar')
      ),
    [uniqueStudents]
  );

  const groupFilterOptions = useMemo(
    () =>
      Array.from(new Set(uniqueStudents.map((s) => s.group).filter((g): g is string => Boolean(g)))).sort(
        (a, b) => a.localeCompare(b, 'ar')
      ),
    [uniqueStudents]
  );

  const subjectFilterOptions = useMemo(
    () =>
      Array.from(
        new Set(uniqueStudents.map((s) => s.subject).filter((g): g is string => Boolean(g)))
      ).sort((a, b) => a.localeCompare(b, 'ar')),
    [uniqueStudents]
  );

  const exemptCount = useMemo(() => uniqueStudents.filter((s) => s.isExempt).length, [uniqueStudents]);

  const filteredStudents = useMemo(() => {
    const normalizedSearch = deferredSearchQuery.trim().toLowerCase();
    const gradeFilter = (selectedGrade || '').trim();
    const subjectFilter = (selectedSubject || '').trim();
    const groupFilter = (selectedGroup || '').trim();
    const hasActiveFilters = Boolean(
      normalizedSearch ||
      (gradeFilter && gradeFilter !== 'الكل') ||
      (subjectFilter && subjectFilter !== 'الكل') ||
      (groupFilter && groupFilter !== 'الكل') ||
      activeCardFilter !== 'all'
    );

    if (!hasActiveFilters) return uniqueStudents;

    return uniqueStudents.filter((student) => {
      const studentName = String(student.name ?? '').trim().toLowerCase();
      const studentBarcode = String(student.barcode ?? '').trim().toLowerCase();
      const guardianName = String(student.guardian_name ?? '').trim().toLowerCase();
      const guardianPhone = String(student.guardian_phone ?? '').trim().toLowerCase();
      const guardianWhatsapp = String(student.guardian_whatsapp ?? '').trim().toLowerCase();
      const matchesSearch =
        normalizedSearch === '' ||
        studentName.includes(normalizedSearch) ||
        studentBarcode.includes(normalizedSearch) ||
        guardianName.includes(normalizedSearch) ||
        guardianPhone.includes(normalizedSearch) ||
        guardianWhatsapp.includes(normalizedSearch);
      const matchesGrade = !gradeFilter || gradeFilter === 'الكل' || String(student.grade ?? '').trim() === gradeFilter;
      const matchesSubject = !subjectFilter || subjectFilter === 'الكل' || String(student.subject ?? '').trim() === subjectFilter;
      const matchesGroup = !groupFilter || groupFilter === 'الكل' || String(student.group ?? '').trim() === groupFilter;
      let matchesCardFilter = true;
      switch (activeCardFilter) {
        case 'unique_students':
          matchesCardFilter = true;
          break;
        case 'total_subscriptions':
          matchesCardFilter = (subscriptionCountByStudent.get(student.id) ?? 0) > 1;
          break;
        case 'pending_payment':
          matchesCardFilter = netDueOf(student) > 0;
          break;
        case 'exempted':
          matchesCardFilter = student.isExempt === true;
          break;
        case 'groups':
          matchesCardFilter = true;
          break;
        case 'all':
        default:
          matchesCardFilter = true;
          break;
      }
      return matchesSearch && matchesGrade && matchesSubject && matchesGroup && matchesCardFilter;
    });
  }, [uniqueStudents, selectedGrade, selectedSubject, selectedGroup, activeCardFilter, netDueOf, deferredSearchQuery, subscriptionCountByStudent]);

  const inputClass =
    'w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm font-bold text-slate-800 focus:border-indigo-600 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 leading-tight';
  const labelTextClass = 'mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300 leading-tight';

  const statsCards = [
    { id: 'unique_students', value: uniqueStudentsCount, label: 'طلاب فريدين', icon: '👥', color: 'indigo' },
    { id: 'total_subscriptions', value: students.length, label: 'إجمالي الاشتراكات', icon: '📚', color: 'blue' },
    {
      id: 'pending_payment',
      value: filteredStudents.filter((s) => netDueOf(s) > 0).length,
      label: 'مطلوب منهم السداد',
      icon: '💰',
      color: 'rose',
    },
    { id: 'exempted', value: exemptCount, label: 'معفيون من المصاريف', icon: '🎓', color: 'emerald' },
    { id: 'groups', value: groupFilterOptions.length, label: 'عدد المجموعات', icon: '👨‍🏫', color: 'violet' },
  ];

  const getColorClasses = (color: string, isActive: boolean) => {
    const colors: Record<string, { bg: string; border: string; ring: string; text: string }> = {
      indigo: {
        bg: 'bg-slate-50 dark:bg-slate-900/60',
        border: isActive ? 'border-indigo-400 dark:border-indigo-500' : 'border-slate-200 dark:border-slate-700',
        ring: 'ring-indigo-200 dark:ring-indigo-900/50',
        text: 'text-slate-800 dark:text-slate-100',
      },
      blue: {
        bg: 'bg-slate-50 dark:bg-slate-900/60',
        border: isActive ? 'border-blue-400 dark:border-blue-500' : 'border-slate-200 dark:border-slate-700',
        ring: 'ring-blue-200 dark:ring-blue-900/50',
        text: 'text-slate-800 dark:text-slate-100',
      },
      rose: {
        bg: 'bg-slate-50 dark:bg-slate-900/60',
        border: isActive ? 'border-rose-400 dark:border-rose-500' : 'border-slate-200 dark:border-slate-700',
        ring: 'ring-rose-200 dark:ring-rose-900/50',
        text: 'text-rose-600 dark:text-rose-400',
      },
      emerald: {
        bg: 'bg-emerald-50 dark:bg-emerald-950/40',
        border: isActive ? 'border-emerald-400 dark:border-emerald-500' : 'border-emerald-200 dark:border-emerald-800',
        ring: 'ring-emerald-200 dark:ring-emerald-900/50',
        text: 'text-emerald-700 dark:text-emerald-300',
      },
      violet: {
        bg: 'bg-slate-50 dark:bg-slate-900/60',
        border: isActive ? 'border-violet-400 dark:border-violet-500' : 'border-slate-200 dark:border-slate-700',
        ring: 'ring-violet-200 dark:ring-violet-900/50',
        text: 'text-violet-600 dark:text-violet-400',
      },
    };
    return colors[color] || colors.indigo;
  };

  /* ═══════════════════════════════════════════════════════════
     ✅ دالة تبديل القائمة المنسدلة
  ═══════════════════════════════════════════════════════════ */
  const toggleDropdown = (studentId: number) => {
    setOpenDropdownId((prev) => (prev === studentId ? null : studentId));
  };

  return (
    <div dir="rtl" className="w-full space-y-6">
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-5 inset-x-0 z-[100] flex justify-center px-4 pointer-events-none"
        >
          <div
            className={`pointer-events-auto flex items-center gap-2 rounded-2xl border px-5 py-3 text-sm font-bold shadow-lg transition-all ${
              toast.type === 'success'
                ? 'bg-emerald-600 border-emerald-700 text-white'
                : 'bg-rose-600 border-rose-700 text-white'
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

      <div className="flex flex-col items-start justify-between gap-4 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800 md:flex-row md:items-center">
        <div>
          <h2 className="text-xl font-black text-slate-800 dark:text-slate-100">إدارة الطلاب ولي الأمر</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            إضافة وتعديل بيانات الطلاب، المراحل، الصفوف، والمواد الدراسية
          </p>
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 transition"
            >
              ➕ إضافة طالب جديد
            </button>
          </div>
        </div>
        <div className="rounded-2xl bg-indigo-50 px-4 py-2 text-xs font-bold text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300 flex items-center justify-between">
          <span>إجمالي الطلاب (فريد): {uniqueStudentsCount} | اشتراكات: {students.length}</span>
          {activeCardFilter !== 'all' && (
            <span className="bg-white/80 px-2 py-0.5 rounded-full text-[10px] font-bold text-indigo-700">
              فلتر نشط: {getActiveFilterLabel(activeCardFilter)} ✕
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {statsCards.map((card) => {
          const isActive = activeCardFilter === card.id;
          const colors = getColorClasses(card.color, isActive);
          return (
            <div
              key={card.id}
              onClick={() => handleCardClick(card.id as typeof activeCardFilter)}
              className={`rounded-xl border p-3 ${colors.bg} text-center cursor-pointer hover:shadow-lg transition-all duration-200 ${
                isActive ? `${colors.border} ring-2 ${colors.ring}` : colors.border
              }`}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && handleCardClick(card.id as typeof activeCardFilter)}
            >
              <div className={`font-bold leading-tight ${colors.text}`}>{card.value}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 leading-tight">{card.label}</div>
              {isActive && <div className={`text-[10px] font-bold mt-1 leading-tight ${colors.text}`}>✓ نشط</div>}
            </div>
          );
        })}
      </div>

      {formOpen && (
        <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-base font-extrabold text-slate-800 dark:text-slate-100">
              <span aria-hidden="true">{editingId !== null ? '✏️' : '➕'}</span>
              {editingId !== null ? 'تعديل بيانات الطالب' : 'إضافة طالب جديد'}
            </h3>
            {editingId !== null && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="rounded-xl bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-600 transition hover:bg-rose-100 dark:bg-rose-950/60 dark:text-rose-300"
              >
                إلغاء التعديل
              </button>
            )}
          </div>
          <form id="student-form" onSubmit={handleSubmitForm} className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label htmlFor="student-name" className={labelTextClass}>
                  اسم الطالب <span className="text-rose-500">*</span>
                </label>
                <input
                  id="student-name"
                  type="text"
                  name="name"
                  placeholder="الاسم الكامل"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="guardian-whatsapp" className={labelTextClass}>
                  واتساب ولي الأمر <span className="text-[10px] font-bold text-slate-400">(اختياري)</span>
                </label>
                <input
                  id="guardian-whatsapp"
                  type="text"
                  name="guardianWhatsapp"
                  placeholder="2010XXXXXXXX"
                  value={formData.guardianWhatsapp}
                  onChange={handleInputChange}
                  dir="ltr"
                  className={`${inputClass} font-mono`}
                />
              </div>
              <div>
                <label htmlFor="student-stage" className={labelTextClass}>
                  المرحلة الدراسية
                </label>
                <select
                  id="student-stage"
                  name="stage"
                  value={formData.stage}
                  onChange={handleInputChange}
                  className={inputClass}
                >
                  {Object.keys(STAGES_AND_GRADES).map((stageName) => (
                    <option key={stageName} value={stageName}>
                      {stageName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="student-grade" className={labelTextClass}>
                  الصف الدراسي
                </label>
                <select
                  id="student-grade"
                  name="grade"
                  value={formData.grade}
                  onChange={handleInputChange}
                  className={inputClass}
                >
                  {availableGrades.map((gradeName) => (
                    <option key={gradeName} value={gradeName}>
                      {gradeName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="student-group" className={labelTextClass}>
                  المجموعة
                </label>
                <input
                  id="student-group"
                  type="text"
                  name="group"
                  placeholder="مجموعة 1"
                  value={formData.group}
                  onChange={handleInputChange}
                  required
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="student-subject" className={labelTextClass}>
                  المادة الدراسية
                </label>
                <select
                  id="student-subject"
                  name="subject"
                  value={formData.subject}
                  onChange={handleInputChange}
                  className={inputClass}
                >
                  {subjects.map((subj) => (
                    <option key={subj} value={subj}>
                      {subj}
                    </option>
                  ))}
                </select>
              </div>
              <label
                className={`flex cursor-pointer items-center gap-2 rounded-xl border p-2.5 transition ${
                  formData.isExempt
                    ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/50'
                    : 'border-slate-200 bg-slate-50 dark:border-slate-600 dark:bg-slate-900'
                }`}
                title="الطالب المعفي لا تُحسب عليه أي مديونية"
              >
                <input
                  type="checkbox"
                  name="isExempt"
                  checked={formData.isExempt}
                  onChange={handleInputChange}
                  className="h-4 w-4 rounded accent-emerald-600"
                />
                <span
                  className={`text-xs font-black ${
                    formData.isExempt ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  طالب معفي من المصاريف 🎓
                </span>
              </label>
              <div>
                <label htmlFor="student-due-amount" className={labelTextClass}>
                  المبلغ المستحق (المديونية)
                </label>
                <input
                  id="student-due-amount"
                  type="number"
                  name="dueAmount"
                  min="0"
                  step="0.01"
                  disabled={formData.isExempt}
                  value={formData.isExempt || formData.dueAmount === 0 ? '' : formData.dueAmount}
                  placeholder="0"
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={handleInputChange}
                  className={`${inputClass} disabled:opacity-40`}
                />
              </div>
              <div>
                <label htmlFor="student-discount" className={labelTextClass}>
                  قيمة الخصم الشهري (ج.م)
                </label>
                <input
                  id="student-discount"
                  type="number"
                  name="discountAmount"
                  min="0"
                  step="0.01"
                  disabled={formData.isExempt}
                  value={formData.isExempt || formData.discountAmount === 0 ? '' : formData.discountAmount}
                  placeholder="0"
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={handleInputChange}
                  className={`${inputClass} disabled:opacity-40`}
                />
              </div>
            </div>
            {!formData.isExempt && (formData.discountAmount > 0 || baseSubjectPrice > 0) && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-black text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                🏷️ المطلوب فعلياً بعد الخصم: {totalDue.toLocaleString('ar-EG')} ج.م
                {discountExceedsTotal && (
                  <span className="text-rose-600 dark:text-rose-400">
                    {' '}
                    — تنبيه: الخصم أكبر من إجمالي المستحق (سعر المادة + المديونية) وسيُعتمد الصفر
                  </span>
                )}
              </div>
            )}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setExtraOpen((v) => !v)}
                aria-expanded={extraOpen}
                className="flex w-full items-center justify-between px-4 py-3 text-right"
              >
                <span className="text-xs font-black text-slate-600 dark:text-slate-300">
                  ️ تفاصيل إضافية
                  <span className="mr-2 text-[10px] font-bold text-slate-400">(اختيارية)</span>
                </span>
                <span className={`text-[10px] text-slate-400 transition-transform ${extraOpen ? 'rotate-180' : ''}`}>
                  ▼
                </span>
              </button>
              {extraOpen && (
                <div className="border-t border-slate-100 p-4 dark:border-slate-700">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <label htmlFor="student-barcode" className={labelTextClass}>
                        كود الباركود / ID
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          id="student-barcode"
                          type="text"
                          name="barcode"
                          placeholder="تلقائي إذا تُرك فارغاً"
                          value={formData.barcode}
                          onChange={handleInputChange}
                          dir="ltr"
                          className={`${inputClass} font-mono`}
                        />
                        <button
                          type="button"
                          onClick={generateBarcode}
                          title="توليد كود تلقائي"
                          className="shrink-0 rounded-xl bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-600 transition hover:bg-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-300"
                        >
                          🎲
                        </button>
                      </div>
                    </div>
                    <div>
                      <label htmlFor="guardian-name" className={labelTextClass}>
                        اسم ولي الأمر
                      </label>
                      <input
                        id="guardian-name"
                        type="text"
                        name="guardianName"
                        placeholder="اسم ولي الأمر"
                        value={formData.guardianName}
                        onChange={handleInputChange}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <label htmlFor="guardian-phone" className="block text-xs font-bold text-slate-600 dark:text-slate-300">
                          هاتف ولي الأمر
                        </label>
                        <button
                          type="button"
                          onClick={handleCopyPhoneToWhatsapp}
                          className="text-[10px] font-bold text-indigo-600 hover:underline dark:text-indigo-400"
                        >
                          نسخ إلى الواتساب ↑
                        </button>
                      </div>
                      <input
                        id="guardian-phone"
                        type="text"
                        name="guardianPhone"
                        placeholder="010XXXXXXXX"
                        value={formData.guardianPhone}
                        onChange={handleInputChange}
                        dir="ltr"
                        className={`${inputClass} font-mono`}
                      />
                    </div>
                    <div>
                      <label htmlFor="student-school" className={labelTextClass}>
                        المدرسة
                      </label>
                      <input
                        id="student-school"
                        type="text"
                        name="school"
                        placeholder="اسم المدرسة"
                        value={formData.school}
                        onChange={handleInputChange}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label htmlFor="student-address" className={labelTextClass}>
                        العنوان
                      </label>
                      <input
                        id="student-address"
                        type="text"
                        name="address"
                        placeholder="عنوان الطالب"
                        value={formData.address}
                        onChange={handleInputChange}
                        className={inputClass}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor="guardian-notes" className={labelTextClass}>
                        ملاحظات
                      </label>
                      <input
                        id="guardian-notes"
                        type="text"
                        name="guardianNotes"
                        placeholder="ملاحظات اختيارية..."
                        value={formData.guardianNotes}
                        onChange={handleInputChange}
                        className={inputClass}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between pt-1">
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                💡 يُولَّد كود الباركود تلقائياً إذا تُرك فارغاً.
              </p>
              <button
                type="submit"
                disabled={studentsLoading}
                className={`rounded-xl px-6 py-3 text-xs font-bold text-white shadow-sm transition disabled:opacity-50 ${
                  editingId !== null ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {editingId !== null ? 'حفظ التعديلات' : 'حفظ وإضافة الطالب'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="flex flex-col items-center justify-between gap-4 rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 md:flex-row">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              const event = new CustomEvent('export-excel');
              window.dispatchEvent(event);
            }}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            📊 تصدير Excel
          </button>
          <button
            type="button"
            onClick={() => {
              const event = new CustomEvent('export-pdf');
              window.dispatchEvent(event);
            }}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            📄 تصدير PDF
          </button>
        </div>
        <input
          type="text"
          placeholder="ابحث بالاسم، ولي الأمر، الكود أو رقم الواتساب..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="البحث عن طالب"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-right text-xs font-bold text-slate-800 focus:border-indigo-600 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 md:w-80"
        />
        <div className="flex w-full items-center justify-end gap-3 md:w-auto">
          <select
            value={selectedGrade}
            onChange={(e) => setSelectedGrade(e.target.value)}
            aria-label="فلترة حسب الصف الدراسي"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="الكل">كل الصفوف</option>
            {gradeFilterOptions.map((gradeName) => (
              <option key={gradeName} value={gradeName}>
                {gradeName}
              </option>
            ))}
          </select>
          <select
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
            aria-label="فلترة حسب المادة"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="الكل">كل المواد</option>
            {subjectFilterOptions.map((subj) => (
              <option key={subj} value={subj}>
                {subj}
              </option>
            ))}
          </select>
          <select
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            aria-label="فلترة حسب المجموعة"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="الكل">كل المجموعات</option>
            {groupFilterOptions.map((groupName) => (
              <option key={groupName} value={groupName}>
                {groupName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ✅ الإصلاح: overflow-visible لمنع قصّ القائمة المنسدلة */}
      <div className="overflow-visible rounded-3xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="overflow-x-auto overflow-y-visible">
          <table className="w-full text-right text-xs text-slate-800 dark:text-slate-100">
            <thead className="border-b border-slate-200 bg-slate-50 font-bold uppercase text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
              <tr>
                <th scope="col" className="p-4 text-center">الإجراءات</th>
                <th scope="col" className="p-4 text-right">الماليات</th>
                <th scope="col" className="p-4 text-right">المجموعة / المادة</th>
                <th scope="col" className="p-4 text-right">ولي الأمر والاتصال</th>
                <th scope="col" className="p-4 text-right">اسم الطالب / الكود</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-sm font-bold text-slate-400 dark:text-slate-500">
                    لا توجد بيانات طلاب مطابقة للبحث.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student) => {
                  const due = netDueOf(student);
                  const hasPhone = Boolean(student.guardian_whatsapp || student.guardian_phone);
                  const phoneDisplay = student.guardian_whatsapp
                    ? `WA: ${student.guardian_whatsapp}`
                    : student.guardian_phone || '';
                  const isMenuOpen = openDropdownId === student.id;
                  return (
                    <tr key={student.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-700/40">
                      {/* ✅ الإصلاح: overflow-visible على الخلية */}
                      <td className="p-4 text-center overflow-visible">
                        <div className="flex items-center justify-center gap-2 flex-wrap">
                          {due > 0 && (
                            <button
                              type="button"
                              onClick={() => handleOpenQuickPay(student)}
                              className="rounded-xl bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
                              title="تسديد المديونية"
                            >
                              💵 تسديد
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleStartEdit(student)}
                            className="rounded-xl bg-indigo-50 px-2.5 py-1.5 text-[11px] font-bold text-indigo-600 border border-indigo-200 hover:bg-indigo-100 transition dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800"
                          >
                            ✏️ تعديل
                          </button>
                          {/* ✅ زر الحذف: يفتح Modal Confirmation بدلاً من window.confirm */}
                          <button
                            type="button"
                            onClick={() => setStudentToDelete(student)}
                            disabled={deleteLoading}
                            className="rounded-xl bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-600 border border-rose-200 hover:bg-rose-100 transition dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800 disabled:opacity-50"
                            title="حذف الطالب"
                          >
                            🗑️ حذف
                          </button>
                          {/* ═══════════════════════════════════════════════════════
                              ✅ القائمة المنسدلة (...) — مُصلحة بالكامل
                              • toggleDropdown تتحكم في الفتح/الإغلاق
                              • dropdownRef للكشف عن النقر الخارجي
                              • z-50 لضمان الظهور فوق كل العناصر
                          ═══════════════════════════════════════════════════════ */}
                          <div className="relative" ref={isMenuOpen ? dropdownRef : undefined}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                toggleDropdown(student.id);
                              }}
                              aria-haspopup="true"
                              aria-expanded={isMenuOpen}
                              className={`rounded-xl px-2.5 py-1.5 text-[11px] font-bold border transition ${
                                isMenuOpen
                                  ? 'bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-700'
                                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600 dark:hover:bg-slate-600'
                              }`}
                              title="خيارات إضافية"
                            >
                              ⋯
                            </button>

                            {/* ✅ القائمة المنسدلة — تظهر فقط عندما تكون مفتوحة */}
                            {isMenuOpen && (
                              <div
                                className="absolute left-0 top-full mt-1 z-50 w-44 rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800 py-1 animate-in fade-in slide-in-from-top-1 duration-150"
                                role="menu"
                              >
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setCardStudent(student);
                                    setOpenDropdownId(null);
                                  }}
                                  className="w-full px-4 py-2.5 text-right text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition dark:text-slate-200 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-300 flex items-center gap-2"
                                >
                                  🪪 عرض كارت الطالب
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setReportStudent(student);
                                    setOpenDropdownId(null);
                                  }}
                                  className="w-full px-4 py-2.5 text-right text-xs font-bold text-slate-700 hover:bg-violet-50 hover:text-violet-700 transition dark:text-slate-200 dark:hover:bg-violet-950/40 dark:hover:text-violet-300 flex items-center gap-2"
                                >
                                  📄 تقرير الطالب
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-right font-bold">
                        {student.isExempt ? (
                          <span className="rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                            معفى 🎓
                          </span>
                        ) : due > 0 ? (
                          <div className="space-y-1.5">
                            <span className="inline-block rounded-lg bg-rose-100 px-2.5 py-1 text-[11px] font-black text-rose-700 ring-1 ring-rose-300 dark:bg-rose-950/70 dark:text-rose-300 dark:ring-rose-700">
                              🔴 متأخر: {due} ج.م
                              {(student.discountAmount ?? 0) > 0 && (
                                <span className="mr-1.5 text-[10px] font-bold text-slate-400 line-through">
                                  ({student.dueAmount})
                                </span>
                              )}
                            </span>
                            {(student.discountAmount ?? 0) > 0 && (
                              <div className="text-[10px] font-black text-amber-600 dark:text-amber-400">
                                🏷️ خصم {student.discountAmount}
                              </div>
                            )}
                            <WhatsAppButton
                              phone={student.guardian_whatsapp || student.guardian_phone}
                              message={dueReminderMessage(student.name, due)}
                              label="💬 مطالبة"
                            />
                          </div>
                        ) : null /* ✅ إخفاء المديونية عند الصفر */}
                      </td>
                      <td className="p-4 text-right text-slate-600 dark:text-slate-300">
                        <div>
                          {student.group ? (
                            <span className="font-bold text-slate-800 dark:text-slate-100">{student.group}</span>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500">غير محدد</span>
                          )}
                        </div>
                        <div className="mt-0.5">
                          {student.subject ? (
                            <span className="text-indigo-600 dark:text-indigo-400 text-[11px]">({student.subject})</span>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500 text-[11px]">(غير محدد)</span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-right text-slate-600 dark:text-slate-300">
                        <div className="font-bold text-slate-800 dark:text-slate-100">
                          {student.guardian_name ? (
                            student.guardian_name
                          ) : (
                            <span className="font-normal text-slate-400 dark:text-slate-500">غير محدد</span>
                          )}
                        </div>
                        {hasPhone ? (
                          <>
                            <div className="font-mono text-[10px] text-slate-400 dark:text-slate-500" dir="ltr">
                              {phoneDisplay}
                            </div>
                            <div className="mt-1.5">
                              <WhatsAppButton
                                phone={student.guardian_whatsapp || student.guardian_phone}
                                message={`أهلاً ولي أمر الطالب/ة ${student.name}، تواصل معكم مركز EduCore التعليمي`}
                                label="💬 واتساب"
                              />
                            </div>
                          </>
                        ) : (
                          <div className="mt-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500">غير محدد</div>
                        )}
                      </td>
                      <td className="p-4 text-right font-bold text-slate-800 dark:text-slate-100">
                        <div className="flex items-center gap-1">
                          {student.name}
                          {student.isExempt && <span title="معفي من المصاريف">🎓</span>}
                        </div>
                        <div className="mt-0.5">
                          {student.barcode ? (
                            <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500" dir="ltr">
                              #{student.barcode}
                            </span>
                          ) : (
                            <span className="text-[10px] font-normal text-slate-400 dark:text-slate-500">غير محدد</span>
                          )}
                        </div>
                        <div className="text-[10px] font-normal text-slate-500 dark:text-slate-400 mt-0.5">
                          {student.stage ? (
                            <>
                              {student.stage}
                              {student.grade ? ` - ${student.grade}` : ''}
                            </>
                          ) : student.grade ? (
                            student.grade
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500">غير محدد</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <StudentCardModal
        student={
          cardStudent
            ? {
                id: cardStudent.id,
                name: cardStudent.name,
                phone: cardStudent.phone ?? '',
                parent_phone: cardStudent.guardian_phone ?? '',
                grade: cardStudent.grade ?? '',
                subject: cardStudent.subject ?? undefined,
                barcode: cardStudent.barcode,
              }
            : null
        }
        onClose={() => setCardStudent(null)}
      />

      {reportStudent && <StudentReportModal student={reportStudent} onClose={() => setReportStudent(null)} />}

      {showQuickPayModal && quickPayStudent && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          onClick={() => setShowQuickPayModal(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-800"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-black text-slate-800 dark:text-slate-100">💵 تسديد مديونية سريع</h3>
              <button
                onClick={() => setShowQuickPayModal(false)}
                className="rounded-lg px-2 py-1 text-sm font-black text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div className="rounded-2xl bg-slate-50 p-4 space-y-2 border border-slate-100 dark:bg-slate-900 dark:border-slate-700">
                <p className="text-xs text-slate-500 dark:text-slate-400">اسم الطالب</p>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{quickPayStudent.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">المادة / المجموعة</p>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  {quickPayStudent.subject} - {quickPayStudent.group}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">إجمالي المديونية المستحقة</p>
                <p className="text-xl font-black text-rose-600 dark:text-rose-400">
                  {netDueOf(quickPayStudent)} ج.م
                </p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  المبلغ المراد سداده (ج.م)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  max={netDueOf(quickPayStudent)}
                  value={quickPayAmount}
                  onChange={(e) => setQuickPayAmount(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-800 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100"
                  placeholder="أدخل المبلغ"
                />
                <p className="text-[10px] text-slate-400 mt-1.5">
                  📅 سيتم تسجيل الدفعة تلقائياً لشهر:{' '}
                  <span className="font-bold text-slate-600 dark:text-slate-300">{currentMonth}</span>
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowQuickPayModal(false)}
                  disabled={quickPayLoading}
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleConfirmQuickPay}
                  disabled={quickPayLoading || !quickPayAmount}
                  className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2 transition"
                >
                  {quickPayLoading ? (
                    <>
                      <span className="animate-spin">⏳</span> جاري الحفظ...
                    </>
                  ) : (
                    '✅ تأكيد الدفع'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          ✅ Modal Confirmation (تأكيد الحذف)
          نافذة منبثقة احترافية بديلة لـ window.confirm
          تصميم متسق مع باقي Modals في التطبيق
      ═══════════════════════════════════════════════════════════ */}
      {studentToDelete && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          onClick={() => !deleteLoading && setStudentToDelete(null)}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-rose-200 bg-white p-6 shadow-2xl dark:border-rose-900/50 dark:bg-slate-800 animate-in fade-in zoom-in duration-200"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header - أيقونة التحذير */}
            <div className="flex items-center justify-center mb-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-950/60 text-4xl animate-pulse">
                ⚠️
              </div>
            </div>

            {/* العنوان */}
            <h3 className="text-center text-lg font-black text-slate-800 dark:text-slate-100 mb-2">تأكيد حذف الطالب</h3>

            {/* رسالة التحذير */}
            <p className="text-center text-sm text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">
              هل أنت متأكد من رغبتك في حذف الطالب:
            </p>

            {/* بيانات الطالب المُراد حذفه */}
            <div className="rounded-2xl bg-rose-50 dark:bg-rose-950/30 p-4 space-y-2 border border-rose-100 dark:border-rose-900/40 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">الاسم:</span>
                <span className="text-sm font-black text-slate-800 dark:text-slate-100">{studentToDelete.name}</span>
              </div>
              {studentToDelete.barcode && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">الكود:</span>
                  <span className="font-mono text-sm font-bold text-slate-700 dark:text-slate-200" dir="ltr">
                    #{studentToDelete.barcode}
                  </span>
                </div>
              )}
              {studentToDelete.grade && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">الصف:</span>
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{studentToDelete.grade}</span>
                </div>
              )}
              {studentToDelete.subject && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">المادة:</span>
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{studentToDelete.subject}</span>
                </div>
              )}
              {studentToDelete.group && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">المجموعة:</span>
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{studentToDelete.group}</span>
                </div>
              )}
            </div>

            {/* تنبيه عدم إمكانية الاسترجاع */}
            <div className="flex items-center gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 mb-5">
              <span className="text-lg">⚠️</span>
              <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300 leading-tight">
                تحذير: هذه العملية لا يمكن التراجع عنها وسيتم حذف جميع البيانات المرتبطة بهذا الطالب نهائياً.
              </p>
            </div>

            {/* الأزرار */}
            <div className="flex gap-3">
              <button
                onClick={() => setStudentToDelete(null)}
                disabled={deleteLoading}
                className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                ❌ إلغاء
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleteLoading}
                className="flex-1 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50 flex items-center justify-center gap-2 transition"
              >
                {deleteLoading ? (
                  <>
                    <span className="animate-spin">⏳</span> جاري الحذف...
                  </>
                ) : (
                  <>🗑️ تأكيد الحذف</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}