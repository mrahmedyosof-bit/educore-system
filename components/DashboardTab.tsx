'use client';
import React, { useState, useEffect, useCallback, useDeferredValue, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useCurriculumSettings } from '@/hooks/useCurriculumSettings';
import { useCenterSettings } from '@/hooks/useCenterSettings';
import { openWhatsApp } from '@/lib/whatsapp';
import { getUniqueStudentsCount, getStudents } from '@/lib/services/students';
import { getPriceMatrix, priceKey } from '@/lib/services/settings';

interface Student {
  id: number;
  name: string;
  phone: string;
  parent_phone: string;
  grade_level: string;
  group_name: string;
  grade?: string;
  subject?: string;
  discountAmount?: number;
  isExempt?: boolean;
}

interface GroupAttendance {
  groupName: string;
  attendedCount: number;
  totalCount: number;
}

interface DueStudent extends Student {
  dueAmount: number;
}

interface ActivityItem {
  id: string;
  type: 'payment' | 'attendance' | 'student_added';
  description: string;
  amount?: number;
  studentName?: string;
  timestamp: string;
}

interface DashboardTabProps {
  onOpenQRScanner?: () => void;
  onNavigateToTab?: (tabName: string) => void;
}

const GRADE_SHORT_LABELS: Record<string, string> = {
  'الصف الأول الابتدائي': 'أولى ابتدائي',
  'الصف الثاني الابتدائي': 'تانية ابتدائي',
  'الصف الثالث الابتدائي': 'تالتة ابتدائي',
  'الصف الرابع الابتدائي': 'رابعة ابتدائي',
  'الصف الخامس الابتدائي': 'خامسة ابتدائي',
  'الصف السادس الابتدائي': 'سادسة ابتدائي',
  'الصف الأول الإعدادي': 'أولى إعدادي',
  'الصف الثاني الإعدادي': 'تانية إعدادي',
  'الصف الثالث الإعدادي': 'تالتة إعدادي',
  'الصف الأول الثانوي': 'أولى ثانوي',
  'الصف الثاني الثانوي': 'تانية ثانوي',
  'الصف الثالث الثانوي': 'تالتة ثانوي',
};

const shortenGradeLabel = (grade?: string | null): string => {
  if (!grade) return '';
  const g = grade.trim();
  return GRADE_SHORT_LABELS[g] ?? g;
};

const isPhoneMissing = (phone?: string | null): boolean => {
  if (!phone) return true;
  const trimmed = phone.trim();
  if (trimmed === '') return true;
  if (trimmed.includes('بدون رقم')) return true;
  return false;
};

const attendanceBarColor = (pct: number): string => {
  if (pct < 50) return 'bg-rose-500';
  if (pct < 75) return 'bg-amber-500';
  return 'bg-emerald-500';
};

const attendanceBadgeClass = (pct: number): string => {
  if (pct >= 75) return 'text-emerald-700 dark:text-emerald-300 bg-emerald-100/70 dark:bg-emerald-950/60';
  if (pct >= 50) return 'text-amber-700 dark:text-amber-300 bg-amber-100/70 dark:bg-amber-950/60';
  if (pct > 0) return 'text-rose-700 dark:text-rose-300 bg-rose-100/70 dark:bg-rose-950/60';
  return 'text-slate-500 bg-slate-200/60 dark:bg-slate-800';
};

const cleanMonthOption = (value: string): string => {
  const monthNames: Record<string, string> = {
    January: 'يناير',
    February: 'فبراير',
    March: 'مارس',
    April: 'أبريل',
    May: 'مايو',
    June: 'يونيو',
    July: 'يوليو',
    August: 'أغسطس',
    September: 'سبتمبر',
    October: 'أكتوبر',
    November: 'نوفمبر',
    December: 'ديسمبر',
  };

  return value
    .replace(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/g, (month) => monthNames[month])
    .replace(/[٠-٩۰-۹]/g, (digit) => {
      const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
      const easternDigits = '۰۱۲۳۴۵۶۷۸۹';
      const arabicIndex = arabicDigits.indexOf(digit);
      const easternIndex = easternDigits.indexOf(digit);
      return String(arabicIndex >= 0 ? arabicIndex : easternIndex);
    })
    .replace(/[أإآ]/g, 'ا')
    .replace(/[,،\-_\.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const formatDashboardMonth = (value: string): string => {
  const [year, month] = value.split('-').map(Number);
  if (!Number.isSafeInteger(year) || !Number.isSafeInteger(month) || month < 1 || month > 12) {
    return cleanMonthOption(value);
  }
  const englishMonth = new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long' });
  return cleanMonthOption(`${englishMonth} ${year}`);
};

const dashboardMonthOptions = Array.from({ length: 24 }, (_, index) => {
  const date = new Date();
  date.setMonth(date.getMonth() - 12 + index, 1);
  const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  return { value, label: date.toLocaleString('ar-EG', { month: 'long', year: 'numeric' }) };
});

const targetMonthKey = (value: string | null | undefined): string => {
  const normalized = cleanMonthOption(String(value ?? ''));
  const numericMatch = normalized.match(/(\d{4})\s+(\d{1,2})$/);
  if (numericMatch) return `${numericMatch[1]}-${numericMatch[2].padStart(2, '0')}`;
  const year = normalized.match(/\d{4}/)?.[0];
  const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const monthIndex = monthNames.findIndex((month) => normalized.includes(month));
  return year && monthIndex >= 0 ? `${year}-${String(monthIndex + 1).padStart(2, '0')}` : '';
};

const paymentTargetMonthKey = (payment: { month_name?: string | null; target_month?: string | null; month?: string | null }): string =>
  targetMonthKey(payment.target_month || payment.month || payment.month_name);

export default function DashboardTab({
  onOpenQRScanner,
  onNavigateToTab,
}: DashboardTabProps) {
  const { settings: centerSettings } = useCenterSettings();
  const [selectedRevenueMonth, setSelectedRevenueMonth] = useState<string>(
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
  );
  const [totalStudents, setTotalStudents] = useState<number>(0);
  const [collectedAmount, setCollectedAmount] = useState<number>(0);
  const [totalDueAmount, setTotalDueAmount] = useState<number>(0);
  const [studentsWithDue, setStudentsWithDue] = useState<DueStudent[]>([]);
  const [todayAttendanceCount, setTodayAttendanceCount] = useState<number>(0);
  const [groupSessions, setGroupSessions] = useState<GroupAttendance[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [expectedRevenue, setExpectedRevenue] = useState<number>(0);
  const [recentActivities, setRecentActivities] = useState<ActivityItem[]>([]);
  const [showCollectModal, setShowCollectModal] = useState(false);
  const [collectQuery, setCollectQuery] = useState('');
  const [dueSearchQuery, setDueSearchQuery] = useState('');
  const [dueSelectedGrade, setDueSelectedGrade] = useState('الكل');
  const deferredDueSearchQuery = useDeferredValue(dueSearchQuery);
  const deferredCollectQuery = useDeferredValue(collectQuery);

  const {
    stages,
    grades,
    subjects,
    loading: settingsLoading,
    error: settingsError,
    saving: settingsSaving,
    addItem,
  } = useCurriculumSettings();

  const fetchDashboardMetrics = useCallback(async (cancelled: () => boolean) => {
    try {
      const uniqueStudentsCount = await getUniqueStudentsCount();
      if (!cancelled()) setTotalStudents(uniqueStudentsCount);

      const todayDate = new Date().toISOString().split('T')[0];
      const [{ data: todayAttendance, error: attendanceError }, { data: allStudents, error: studentsListError }] =
        await Promise.all([
          supabase.from('attendance').select('student_id, status').eq('date', todayDate),
          supabase.from('students').select('id, group_name, grade_level'),
        ]);

      if (attendanceError) throw attendanceError;
      if (studentsListError) throw studentsListError;

      const attendanceRows = (todayAttendance as { student_id: number | null; status: string | null }[] | null) ?? [];
      const studentRows = (allStudents as { id: number; group_name: string | null; grade_level: string | null }[] | null) ?? [];

      if (!cancelled()) setTodayAttendanceCount(attendanceRows.length);

      const attendedIds = new Set(
        attendanceRows
          .filter((r) => r.student_id != null && (r.status || '').toUpperCase() !== 'ABSENT')
          .map((r) => r.student_id as number)
      );

      const groupsMap = new Map<string, GroupAttendance>();
      for (const s of studentRows) {
        const baseGroup = s.group_name || 'بدون مجموعة';
        const gradeShort = shortenGradeLabel(s.grade_level);
        const groupName = gradeShort ? `${baseGroup} - ${gradeShort}` : baseGroup;
        const entry = groupsMap.get(groupName) ?? { groupName, attendedCount: 0, totalCount: 0 };
        entry.totalCount += 1;
        if (attendedIds.has(s.id)) entry.attendedCount += 1;
        groupsMap.set(groupName, entry);
      }

      if (!cancelled()) {
        setGroupSessions(
          Array.from(groupsMap.values()).sort((a, b) => b.attendedCount - a.attendedCount)
        );
      }

      const allStudentsData = await getStudents();
      const priceMatrix = await getPriceMatrix();
      const eligibleStudentIds = new Set(
        allStudentsData
          .filter((student) => {
            if (student.isExempt || !student.grade || !student.subject) return false;
            const price = Number(priceMatrix[priceKey(student.grade, student.subject)]);
            const discount = Number(student.discountAmount ?? 0);
            const finalFee = Math.max(
              0,
              price + Number(student.dueAmount ?? 0) - (Number.isFinite(discount) ? discount : 0)
            );
            return Number.isFinite(price) && finalFee > 0;
          })
          .map((student) => student.id)
      );
      let expectedTotal = 0;
      allStudentsData.forEach((student) => {
        if (student.grade && student.subject && !student.isExempt) {
          const price = priceMatrix[priceKey(student.grade, student.subject)];
          if (typeof price === 'number' && Number.isFinite(price)) {
            const discount = student.discountAmount || 0;
            expectedTotal += Math.max(0, price - discount);
          }
        }
      });

      if (!cancelled()) setExpectedRevenue(expectedTotal);

      const paymentsQuery = supabase
        .from('payments')
        .select('amount_paid, amount_remaining, month_name, created_at, student_id');

      const { data: paymentsData, error: paymentsError } = await paymentsQuery;
      if (paymentsError) throw paymentsError;

      const selectedMonthPayments = (paymentsData ?? []).filter(
        (payment) => paymentTargetMonthKey(payment) === selectedRevenueMonth
      );

      const paymentsWithRemaining = selectedMonthPayments.filter(
        (p) => p.student_id != null && eligibleStudentIds.has(p.student_id) && Number(p.amount_remaining) > 0
      );

      const studentIds = [...new Set(paymentsWithRemaining.map((p) => p.student_id).filter(Boolean))];
      let studentsMap = new Map<number, DueStudent>();

      if (studentIds.length > 0) {
        const { data: studentsData, error: studentsError } = await supabase
          .from('students')
          .select('id, name, parent_phone, phone, grade_level')
          .in('id', studentIds);
        if (studentsError) throw studentsError;
        studentsMap = new Map(
          (studentsData ?? []).map((s) => [s.id, s as DueStudent])
        );
      }

      let sumCollected = 0;
      let sumRemaining = 0;
      const dueMap: Record<number, DueStudent> = {};

      (selectedMonthPayments as { amount_paid: number | null; amount_remaining: number | null; student_id: number | null }[]).forEach((p) => {
        const paid = Number(p.amount_paid) || 0;
        const remaining = Number(p.amount_remaining) || 0;
        sumCollected += paid;
        if (p.student_id != null && eligibleStudentIds.has(p.student_id)) {
          sumRemaining += remaining;
        }

        if (remaining > 0 && p.student_id != null && eligibleStudentIds.has(p.student_id)) {
          const studentData = studentsMap.get(p.student_id);
          if (studentData) {
            if (!dueMap[p.student_id]) {
              dueMap[p.student_id] = {
                ...studentData,
                dueAmount: 0,
              };
            }
            dueMap[p.student_id].dueAmount += remaining;
          }
        }
      });

      if (!cancelled()) {
        setCollectedAmount(sumCollected);
        setTotalDueAmount(sumRemaining);
        setStudentsWithDue(Object.values(dueMap));
      }

      const recentPayments = selectedMonthPayments
        .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
        .slice(0, 5);

      const recentAttendance = attendanceRows
        .filter((r) => r.student_id != null)
        .slice(0, 5);

      const activities: ActivityItem[] = [];

      for (const payment of recentPayments) {
        const studentData = studentsMap.get(payment.student_id);
        if (studentData) {
          activities.push({
            id: `payment-${payment.student_id}-${payment.created_at}`,
            type: 'payment',
            description: 'سداد اشتراك',
            amount: Number(payment.amount_paid) || 0,
            studentName: studentData.name,
            timestamp: payment.created_at,
          });
        }
      }

      for (const attendance of recentAttendance) {
        const student = allStudentsData.find((s) => s.id === attendance.student_id);
        if (student) {
          activities.push({
            id: `attendance-${attendance.student_id}-${todayDate}`,
            type: 'attendance',
            description: `حضور: ${attendance.status || 'حاضر'}`,
            studentName: student.name,
            timestamp: new Date().toISOString(),
          });
        }
      }

      activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      if (!cancelled()) {
        setRecentActivities(activities.slice(0, 8));
      }
    } catch (err) {
      console.error('Error fetching dashboard metrics:', err);
    } finally {
      if (!cancelled()) setLoading(false);
    }
  }, [selectedRevenueMonth]);

  useEffect(() => {
    let cancelledFlag = false;
    void (async () => {
      await Promise.resolve();
      await fetchDashboardMetrics(() => cancelledFlag);
    })();
    return () => {
      cancelledFlag = true;
    };
  }, [selectedRevenueMonth, fetchDashboardMetrics]);

  const handleSendWhatsApp = useCallback((parentPhone: string, studentName: string, amount: number) => {
    if (!parentPhone) {
      alert('رقم ولي الأمر غير متوفر.');
      return;
    }
    const message = [
      `أهلاً بك، تذكير من ${centerSettings.centerName}:`,
      `المتبقي على الطالب/طالبة (${studentName}) مبلغ (${amount} ج.م).`,
      `يرجى التكرم بالسداد في أقرب وقت. شكراً لتعاونكم 🌹`,
    ].join('\n');
    if (!openWhatsApp(parentPhone, message)) {
      alert('رقم ولي الأمر غير صالح للواتساب.');
    }
  }, [centerSettings.centerName]);

  const dueGradeOptions = useMemo(
    () =>
      Array.from(
        new Set(studentsWithDue.map((s) => s.grade_level).filter((g): g is string => Boolean(g)))
      ).sort((a, b) => a.localeCompare(b, 'ar')),
    [studentsWithDue]
  );

  const filteredDueStudents = useMemo(() => {
    const q = deferredDueSearchQuery.trim().toLowerCase();
    return [...studentsWithDue]
      .sort((a, b) => b.dueAmount - a.dueAmount)
      .filter((s) => {
        const matchesGrade = dueSelectedGrade === 'الكل' || s.grade_level === dueSelectedGrade;
        if (!matchesGrade) return false;
        if (!q) return true;
        return (
          s.name.toLowerCase().includes(q) ||
          (s.parent_phone || '').toLowerCase().includes(q) ||
          (s.phone || '').toLowerCase().includes(q)
        );
      });
  }, [studentsWithDue, deferredDueSearchQuery, dueSelectedGrade]);

  const filteredCollectStudents = useMemo(() => {
    const query = deferredCollectQuery.trim().toLowerCase();
    return [...studentsWithDue]
      .sort((a, b) => b.dueAmount - a.dueAmount)
      .filter((student) => {
        if (!query) return true;
        return (
          student.name.toLowerCase().includes(query) ||
          (student.parent_phone || '').toLowerCase().includes(query) ||
          (student.phone || '').toLowerCase().includes(query)
        );
      });
  }, [studentsWithDue, deferredCollectQuery]);

  const kpiCards = [
    {
      key: 'expectedRevenue',
      label: 'الدخل الشهري المتوقع',
      value: loading ? '...' : expectedRevenue.toLocaleString('en-US'),
      subLabel: 'بناءً على الطلاب الحاليين',
      icon: '🎯',
      iconBg: 'bg-indigo-50 dark:bg-indigo-950/50',
      iconColor: 'text-indigo-600 dark:text-indigo-400',
      borderColor: 'border-slate-200 dark:border-slate-800',
      valueColor: 'text-indigo-600 dark:text-indigo-400',
      onClick: () => onNavigateToTab?.('finance'),
      title: 'عرض التفاصيل المالية',
      unit: 'ج.م',
    },
    {
      key: 'collectedAmount',
      label: `إيرادات شهر ${formatDashboardMonth(selectedRevenueMonth)}`,
      value: loading ? '...' : collectedAmount.toLocaleString('en-US'),
      subLabel: 'اضغط لعرض التفاصيل ↗',
      icon: '💵',
      iconBg: 'bg-emerald-50 dark:bg-emerald-950/50',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      borderColor: 'border-emerald-200/60 dark:border-emerald-900/40',
      valueColor: 'text-emerald-600 dark:text-emerald-400',
      onClick: () => onNavigateToTab?.('finance'),
      title: 'الانتقال للمالية والاشتراكات',
      showMonthSelector: true,
      unit: 'ج.م',
    },
    {
      key: 'totalDueAmount',
      label: 'إجمالي المتبقي والديون',
      value: loading ? '...' : totalDueAmount.toLocaleString('en-US'),
      subLabel: `${studentsWithDue.length} طالب غير مسددين`,
      icon: '⏳',
      iconBg: 'bg-rose-50 dark:bg-rose-950/50',
      iconColor: 'text-rose-600 dark:text-rose-400',
      borderColor: 'border-rose-200/60 dark:border-rose-900/40',
      valueColor: 'text-rose-600 dark:text-rose-400',
      subLabelColor: 'text-rose-500 dark:text-rose-400',
      onClick: () => onNavigateToTab?.('students'),
      title: 'عرض المتأخرين مالياً',
      unit: 'ج.م',
    },
    {
      key: 'todayAttendance',
      label: 'حضور اليوم',
      value: loading ? '...' : todayAttendanceCount.toLocaleString('en-US'),
      subLabel: 'اضغط لتسجيل الحضور ↗',
      icon: '📈',
      iconBg: 'bg-blue-50 dark:bg-blue-950/50',
      iconColor: 'text-blue-600 dark:text-blue-400',
      borderColor: 'border-slate-200 dark:border-slate-800',
      valueColor: 'text-blue-600 dark:text-blue-400',
      onClick: () => onNavigateToTab?.('attendance'),
      title: 'الانتقال لشاشة الحضور',
      unit: 'طالب',
    },
  ];

  return (
    <div className="w-full space-y-6" dir="rtl">
      <div className="bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 text-base">⚡</span>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">الإجراءات والعمليات السريعة</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">الوصول الفوري وأداء المهام الأكثر استخداماً</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 items-stretch">
          <button
            onClick={() => onOpenQRScanner?.()}
            className="h-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold p-3 rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition active:scale-95"
          >
            <span className="text-base">📷</span> تسجيل حضور (QR)
          </button>
          <button
            onClick={() => onNavigateToTab?.('students')}
            className="h-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold p-3 rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition active:scale-95"
          >
            <span className="text-base">👤</span> إضافة طالب جديد
          </button>
          <button
            onClick={() => setShowCollectModal(true)}
            className="h-full bg-amber-500 hover:bg-amber-600 text-white font-bold p-3 rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition active:scale-95"
          >
            <span className="text-base">💳</span> تحصيل رسوم
          </button>
          <button
            onClick={() => onNavigateToTab?.('finance')}
            className="h-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold p-3 rounded-xl text-xs flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-700 transition active:scale-95"
          >
            <span className="text-base">📊</span> التقارير المالية
          </button>
          <button
            onClick={() => onNavigateToTab?.('setup')}
            className="h-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold p-3 rounded-xl text-xs flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-700 transition active:scale-95"
          >
            <span className="text-base">📚</span> تهيئة المواد
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        {kpiCards.map((card) => {
          const isCollectedCard = card.key === 'collectedAmount';
          const collectionRate = expectedRevenue > 0
            ? Math.min(100, Math.round((collectedAmount / expectedRevenue) * 100))
            : 0;
          return (
            <div
              key={card.key}
              onClick={card.onClick}
              title={card.title}
              className={`cursor-pointer bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border ${card.borderColor} shadow-sm flex flex-col justify-between transition-all hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700`}
            >
              <div>
                <div className="flex justify-between items-start gap-2 mb-3">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 leading-tight">
                    {card.label}
                  </span>
                  <div
                    className={`shrink-0 flex items-center justify-center h-10 w-10 rounded-xl text-lg leading-none ${card.iconBg} ${card.iconColor}`}
                  >
                    {card.icon}
                  </div>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className={`text-2xl font-black ${card.valueColor || 'text-slate-900 dark:text-white'}`}>
                      {card.value} <span className="text-xs font-normal text-slate-400">{card.unit}</span>
                    </h3>
                    {isCollectedCard && expectedRevenue > 0 && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-black ${
                          collectionRate >= 50
                            ? 'border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                        title="نسبة التحصيل من الدخل المتوقع"
                      >
                        📈 {collectionRate}%
                      </span>
                    )}
                  </div>
                  {card.showMonthSelector && (
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={selectedRevenueMonth}
                        onChange={(e) => setSelectedRevenueMonth(e.target.value)}
                        aria-label="اختيار شهر الإيرادات"
                        className="max-w-[145px] bg-transparent text-[10px] font-bold rounded px-1 py-0.5 text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
                      >
                        {dashboardMonthOptions.map((month) => (
                          <option key={month.value} value={month.value}>{month.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                <p className={`text-[11px] font-semibold ${card.subLabelColor || 'text-slate-400'}`}>
                  {card.subLabel}
                </p>
                {isCollectedCard && expectedRevenue > 0 && (
                  <div className="mt-2.5">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${
                          collectionRate >= 50 ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                        }`}
                        style={{ width: `${Math.min(collectionRate, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
            <h4 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
              <span>📅</span> حضور اليوم حسب المجموعة
            </h4>
            <span className="text-xs font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 px-2.5 py-1 rounded-lg border border-indigo-100 dark:border-indigo-900">
              {groupSessions.length} مجموعات
            </span>
          </div>
          <div className="space-y-3">
            {groupSessions.length === 0 ? (
              <div className="text-center py-10">
                <div className="text-3xl mb-2">📅</div>
                <p className="text-sm font-bold text-slate-600 dark:text-slate-300 mb-1">لم يتم تسجيل حضور اليوم بعد</p>
                <p className="text-xs text-slate-400">ابدأ بتسجيل الحضور باستخدام كود QR الخاص بالطلاب</p>
              </div>
            ) : (
              groupSessions.map((session) => {
                const pct = session.totalCount > 0 ? Math.round((session.attendedCount / session.totalCount) * 100) : 0;
                return (
                  <div key={session.groupName} className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-800 transition">
                    <div className="flex items-center justify-between">
                      <div>
                        <h5 className="font-bold text-slate-900 dark:text-white text-xs">{session.groupName}</h5>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">إجمالي الطلاب: {session.totalCount}</p>
                      </div>
                      <div className="text-left">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-lg inline-block ${attendanceBadgeClass(pct)}`}>
                          {session.attendedCount} / {session.totalCount} طالب ({pct}%)
                        </span>
                      </div>
                    </div>
                    <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${attendanceBarColor(pct)}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigateToTab?.('attendance')}
                      className="mt-2.5 w-full rounded-lg bg-indigo-50 dark:bg-indigo-950/50 px-3 py-1.5 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 transition hover:bg-indigo-100 dark:hover:bg-indigo-900/50"
                    >
                      تحضير المجموعة ↗
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
            <h4 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <span>⚠️</span> الطلاب المتبقي عليهم مبالغ مالية
            </h4>
            <span className="text-xs font-bold bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 px-2.5 py-1 rounded-lg border border-rose-100 dark:border-rose-900">
              {studentsWithDue.length} حالة
            </span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              value={dueSearchQuery}
              onChange={(e) => setDueSearchQuery(e.target.value)}
              placeholder="ابحث بالاسم أو رقم الهاتف..."
              aria-label="البحث في المتأخرات المالية"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-right text-xs font-bold text-slate-800 focus:border-rose-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <select
              value={dueSelectedGrade}
              onChange={(e) => setDueSelectedGrade(e.target.value)}
              aria-label="فلترة حسب الصف الدراسي"
              className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="الكل">كل الصفوف</option>
              {dueGradeOptions.map((gradeName) => (
                <option key={gradeName} value={gradeName}>{gradeName}</option>
              ))}
            </select>
          </div>
          <div className="space-y-3 overflow-y-auto max-h-[320px] pl-1">
            {filteredDueStudents.length > 0 ? (
              filteredDueStudents.map((student) => {
                const reminderPhone = student.parent_phone || student.phone;
                const phoneOk = !isPhoneMissing(reminderPhone);
                return (
                  <div key={student.id} className="p-3 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 flex items-center justify-between">
                    <div>
                      <h5 className="font-bold text-slate-900 dark:text-slate-100 text-xs">{student.name}</h5>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {student.grade_level || 'غير محدد'} | <span className="font-mono">{phoneOk ? reminderPhone : 'بدون رقم'}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-rose-600 dark:text-rose-400 bg-rose-100/80 dark:bg-rose-900/50 px-2 py-1 rounded-md">
                        {student.dueAmount} ج.م
                      </span>
                      <span
                        title={phoneOk ? 'إرسال تذكير عبر الواتساب' : 'برجاء إضافة رقم ولي الأمر أولاً'}
                        className="inline-flex"
                      >
                        <button
                          onClick={() => {
                            if (phoneOk) {
                              handleSendWhatsApp(reminderPhone!, student.name, student.dueAmount);
                            } else {
                              alert('برجاء إضافة رقم ولي الأمر أولاً');
                            }
                          }}
                          disabled={!phoneOk}
                          aria-disabled={!phoneOk}
                          className={
                            phoneOk
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-sm active:scale-95'
                              : 'bg-slate-300 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 cursor-not-allowed opacity-70'
                          }
                        >
                          <span>💬</span> تذكير
                        </button>
                      </span>
                    </div>
                  </div>
                );
              })
            ) : studentsWithDue.length > 0 ? (
              <div className="text-center py-8">
                <div className="text-2xl mb-1">🔍</div>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400">لا توجد نتائج مطابقة للبحث أو الفلتر الحالي</p>
              </div>
            ) : (
              <div className="text-center py-10">
                <div className="text-3xl mb-2">🎉</div>
                <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mb-1">لا توجد متأخرات مالية حالياً</p>
                <p className="text-xs text-slate-400">جميع الطلاب قاموا بسداد مستحقاتهم بالكامل</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
          <h4 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
            <span>🕐</span> النشاط والأحداث الأخيرة
          </h4>
          <span className="text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2.5 py-1 rounded-lg">
            {recentActivities.length} عملية
          </span>
        </div>
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {recentActivities.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-3xl mb-2">📋</div>
              <p className="text-slate-500 dark:text-slate-400 text-xs font-medium">لا توجد عمليات حديثة</p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">ستظهر هنا عمليات الحضور والسداد بمجرد إجرائها</p>
            </div>
          ) : (
            recentActivities.map((activity) => (
              <div key={activity.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center gap-3 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition">
                <div className={`p-2 rounded-lg text-base ${
                  activity.type === 'payment' ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400' :
                  activity.type === 'attendance' ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400' :
                  'bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400'
                }`}>
                  {activity.type === 'payment' ? '💰' : activity.type === 'attendance' ? '📈' : '👤'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                    {activity.studentName ? `${activity.studentName} — ` : ''}{activity.description}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                    {activity.amount && <span className="font-semibold text-emerald-600 dark:text-emerald-400">{activity.amount.toLocaleString()} ج.م</span>}
                    <span className="text-slate-400 dark:text-slate-500">
                      {new Date(activity.timestamp).toLocaleString('ar-EG', {
                        hour: '2-digit',
                        minute: '2-digit',
                        day: '2-digit',
                        month: '2-digit'
                      })}
                    </span>
                  </p>
                </div>
                <div className="text-[11px] text-slate-400 font-medium">
                  {activity.type === 'payment' && 'مكتمل'}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
        <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
          <h4 className="font-bold text-slate-900 dark:text-white text-sm">📚 تهيئة المراحل والصفوف والمواد الدراسية</h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">إدارة الخيارات والمناهج المتاحة في المركز</p>
        </div>
        {settingsError && (
          <div className="rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 p-3 text-xs font-bold text-rose-600 dark:text-rose-400">
            {settingsError}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <CurriculumMiniSection
            title="المراحل الدراسية"
            inputPlaceholder="مرحلة جديدة..."
            items={stages}
            loading={settingsLoading}
            saving={settingsSaving}
            onAdd={(value) => addItem('stages', value)}
            badgeClass="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700"
            buttonClass="bg-indigo-600 hover:bg-indigo-700"
          />
          <CurriculumMiniSection
            title="الصفوف الدراسية"
            inputPlaceholder="صف جديد..."
            items={grades}
            loading={settingsLoading}
            saving={settingsSaving}
            onAdd={(value) => addItem('grades', value)}
            badgeClass="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-900"
            buttonClass="bg-emerald-600 hover:bg-emerald-700"
          />
          <CurriculumMiniSection
            title="المواد الدراسية"
            inputPlaceholder="مادة جديدة..."
            items={subjects}
            loading={settingsLoading}
            saving={settingsSaving}
            onAdd={(value) => addItem('subjects', value)}
            badgeClass="bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border-rose-200/60 dark:border-rose-900"
            buttonClass="bg-rose-600 hover:bg-rose-700"
          />
        </div>
      </div>

      {showCollectModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={() => setShowCollectModal(false)}>
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xl" dir="rtl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">💳 تحصيل سريع — ابحث بالاسم أو الهاتف</h3>
              <button type="button" onClick={() => setShowCollectModal(false)} className="rounded-lg p-1 text-sm font-bold text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                ✕
              </button>
            </div>
            <input
              type="text"
              value={collectQuery}
              onChange={(e) => setCollectQuery(e.target.value)}
              placeholder="اكتب اسم الطالب أو رقم الهاتف..."
              autoFocus
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none"
            />
            <div className="mt-3 max-h-[50vh] space-y-2 overflow-y-auto">
              {filteredCollectStudents.length === 0 ? (
                <p className="py-8 text-center text-xs font-bold text-slate-400">لا توجد متأخرات مسجلة حالياً.</p>
              ) : (
                filteredCollectStudents.map((student) => {
                    const reminderPhone = student.parent_phone || student.phone;
                    const phoneOk = !isPhoneMissing(reminderPhone);
                    return (
                      <div key={student.id} className="flex items-center justify-between gap-2 rounded-xl border border-rose-100 dark:border-rose-900/50 bg-rose-50/40 dark:bg-rose-950/20 p-2.5">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-bold text-slate-900 dark:text-slate-100">{student.name}</div>
                          <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400" dir="ltr">{phoneOk ? reminderPhone : 'بدون رقم'}</div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="rounded-lg bg-rose-100 dark:bg-rose-900/50 px-2 py-1 text-[11px] font-bold text-rose-700 dark:text-rose-300">{student.dueAmount} ج.م</span>
                          <span title={phoneOk ? 'إرسال تذكير عبر الواتساب' : 'برجاء إضافة رقم ولي الأمر أولاً'} className="inline-flex">
                            <button
                              type="button"
                              disabled={!phoneOk}
                              onClick={() => phoneOk && handleSendWhatsApp(reminderPhone!, student.name, student.dueAmount)}
                              className={
                                phoneOk
                                  ? 'rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-emerald-700'
                                  : 'rounded-lg bg-slate-300 dark:bg-slate-700 px-2.5 py-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400 cursor-not-allowed opacity-70'
                              }
                            >
                              💬
                            </button>
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setShowCollectModal(false);
                              onNavigateToTab?.('finance');
                            }}
                            className="rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-indigo-700"
                          >
                            تحصيل
                          </button>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CurriculumMiniSection({
  title,
  inputPlaceholder,
  items,
  loading,
  saving,
  onAdd,
  badgeClass,
  buttonClass,
}: {
  title: string;
  inputPlaceholder: string;
  items: string[];
  loading: boolean;
  saving: boolean;
  onAdd: (value: string) => Promise<boolean>;
  badgeClass: string;
  buttonClass: string;
}) {
  const [newValue, setNewValue] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleAdd = async () => {
    if (!newValue.trim() || isAdding) return;
    setIsAdding(true);
    try {
      const ok = await onAdd(newValue.trim());
      if (ok) {
        setNewValue('');
      } else {
        alert('فشل في إضافة العنصر. يرجى المحاولة مرة أخرى.');
      }
    } catch (err) {
      console.error('Error adding item:', err);
      alert('حدث خطأ أثناء إضافة العنصر.');
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="space-y-2.5">
      <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200">{title}</h5>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder={inputPlaceholder}
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void handleAdd();
            }
          }}
          disabled={loading || isAdding}
          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-1.5 px-3 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={saving || loading || isAdding || !newValue.trim()}
          className={`px-3 py-1.5 rounded-xl text-white text-xs font-bold shadow-sm transition shrink-0 disabled:opacity-50 ${buttonClass}`}
        >
          {isAdding ? '...' : 'إضافة'}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, idx) => (
          <span key={idx} className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${badgeClass}`}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}