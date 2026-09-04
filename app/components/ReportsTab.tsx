'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { getUniqueStudentsCount, getUniqueStudents } from '@/lib/services/students';

interface Student {
  id?: number;
  name: string;
  student_code?: string;
  phone?: string;
  parent_phone?: string;
  group_name?: string;
  grade_level?: string;
  due_amount?: number;
}

interface PaymentRow {
  student_id: number;
  amount_paid: number | null;
  amount_remaining: number | null;
}

type FinanceRangeType =
  | 'today'
  | 'month'
  | 'all'
  | 'm01' | 'm02' | 'm03' | 'm04' | 'm05' | 'm06'
  | 'm07' | 'm08' | 'm09' | 'm10' | 'm11' | 'm12';

export default function ReportsTab() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [financeRange, setFinanceRange] = useState<FinanceRangeType>('month');
  const [tableFilter, setTableFilter] = useState<'all_students' | 'debtors' | 'paid_fully'>('all_students');
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [uniqueCount, setUniqueCount] = useState<number>(0);

  const handleStatsCardClick = (statusType: 'all_students' | 'debtors' | 'paid_fully') => {
    setTableFilter(statusType);
  };

  const enrichedStudents = useMemo(() => {
    return students.map(student => {
      const studentPayments = payments.filter(p => p.student_id === student.id);
      const calculatedDue = studentPayments.reduce(
        (sum, p) => sum + (Number(p.amount_remaining) || 0),
        0
      );
      return { ...student, calculatedDue };
    });
  }, [students, payments]);

  const stats = useMemo(() => {
    const totalPaymentsCollected = payments.reduce(
      (sum, p) => sum + (Number(p.amount_paid) || 0),
      0
    );
    const totalRemaining = payments.reduce(
      (sum, p) => sum + (Number(p.amount_remaining) || 0),
      0
    );
    const studentsWithDueCount = enrichedStudents.filter(s => (s.calculatedDue ?? 0) > 0).length;
    return {
      totalStudents: uniqueCount,
      totalPaymentsCollected,
      totalRemaining,
      studentsWithDue: studentsWithDueCount,
    };
  }, [payments, enrichedStudents, uniqueCount]);

  const filteredStudents = useMemo(() => {
    switch (tableFilter) {
      case 'debtors':
        return enrichedStudents.filter((s) => (s.calculatedDue ?? 0) > 0);
      case 'paid_fully':
        return enrichedStudents.filter((s) => (s.calculatedDue ?? 0) === 0);
      case 'all_students':
      default:
        return enrichedStudents;
    }
  }, [enrichedStudents, tableFilter]);

  const fetchStudents = useCallback(async () => {
    try {
      setLoading(true);
      const todayDate = new Date().toISOString().split('T')[0];
      const now = new Date();
      const [uniqueStudentsData, count] = await Promise.all([
        getUniqueStudents(),
        getUniqueStudentsCount(),
      ]);
      setUniqueCount(count);

      let paymentsQuery = supabase.from('payments').select(
        'student_id, amount_paid, amount_remaining'
      );
      if (financeRange === 'today') {
        paymentsQuery = paymentsQuery.gte('created_at', `${todayDate}T00:00:00`);
      } else if (financeRange === 'month') {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
          .toISOString()
          .split('T')[0];
        paymentsQuery = paymentsQuery.gte('created_at', `${startOfMonth}T00:00:00`);
      } else if (financeRange.startsWith('m')) {
        const monthIndex = parseInt(financeRange.replace('m', ''), 10) - 1;
        const currentYear = now.getFullYear();
        const startOfMonth = new Date(currentYear, monthIndex, 1).toISOString();
        const endOfMonth = new Date(currentYear, monthIndex + 1, 0, 23, 59, 59).toISOString();
        paymentsQuery = paymentsQuery
          .gte('created_at', startOfMonth)
          .lte('created_at', endOfMonth);
      }

      const { data: paymentsData, error: paymentsError } = await paymentsQuery;
      if (paymentsError) {
        console.error('خطأ في جلب المدفوعات:', paymentsError.message);
      }
      const safePayments = (paymentsData as PaymentRow[] | null) ?? [];
      setPayments(safePayments);

      if (uniqueStudentsData) {
        setStudents(
          uniqueStudentsData.map((s) => ({
            id: s.id,
            name: s.name,
            student_code: s.student_code ?? undefined,
            phone: s.phone ?? undefined,
            parent_phone: s.parent_phone ?? undefined,
            group_name: s.group_name ?? undefined,
            grade_level: s.grade_level ?? undefined,
            due_amount: s.due_amount ?? undefined,
          }))
        );
      }
    } catch (err: unknown) {
      console.error('حدث خطأ غير متوقع:', err);
    } finally {
      setLoading(false);
    }
  }, [financeRange]);

  useEffect(() => {
    let cancelledFlag = false;
    void (async () => {
      await Promise.resolve();
      if (!cancelledFlag) await fetchStudents();
    })();
    return () => {
      cancelledFlag = true;
    };
  }, [fetchStudents]);

  const statCards = [
    {
      key: 'totalStudents',
      label: 'إجمالي الطلاب المسجلين',
      value: stats.totalStudents,
      subLabel: 'طالب مقيد بالنظام',
      icon: '👥',
      accent: 'text-slate-800 dark:text-slate-100',
      iconBg: 'bg-slate-100 dark:bg-slate-700/60',
      border: 'border-slate-200/80 dark:border-slate-700',
      onClick: () => handleStatsCardClick('all_students'),
      isActive: tableFilter === 'all_students',
    },
    {
      key: 'totalCollected',
      label: 'إجمالي التحصيلات',
      value: `${stats.totalPaymentsCollected.toLocaleString('en-US')} ج.م`,
      subLabel: 'مدفوعات مسجلة فعلياً 🟢',
      icon: '💰',
      accent: 'text-emerald-700 dark:text-emerald-400',
      iconBg: 'bg-emerald-50 dark:bg-emerald-950/50',
      border: 'border-emerald-100 dark:border-emerald-900/50',
      onClick: () => handleStatsCardClick('paid_fully'),
      isActive: tableFilter === 'paid_fully',
    },
    {
      key: 'totalRemaining',
      label: 'إجمالي المتبقي',
      value: `${stats.totalRemaining.toLocaleString('en-US')} ج.م`,
      subLabel: 'مبالغ لم يتم سدادها ⚠️',
      icon: '⏳',
      accent: 'text-rose-700 dark:text-rose-400',
      iconBg: 'bg-rose-50 dark:bg-rose-950/50',
      border: 'border-rose-100 dark:border-rose-900/50',
      onClick: () => handleStatsCardClick('debtors'),
      isActive: tableFilter === 'debtors',
    },
    {
      key: 'studentsWithDue',
      label: 'طلاب عليهم مديونية',
      value: stats.studentsWithDue,
      subLabel: 'حسب المبلغ المستحق المسجل',
      icon: '🔴',
      accent: 'text-amber-700 dark:text-amber-400',
      iconBg: 'bg-amber-50 dark:bg-amber-950/50',
      border: 'border-amber-100 dark:border-amber-900/50',
      onClick: () => handleStatsCardClick('debtors'),
      isActive: tableFilter === 'debtors',
    },
  ];

  return (
    <div className="w-full space-y-6 text-right font-sans" dir="rtl">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 text-white p-2 rounded-xl text-lg">📊</div>
          <div>
            <h3 className="font-extrabold text-slate-800 text-sm dark:text-slate-100">
              فلترة الإحصائيات المالية
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              اختر النطاق الزمني لحساب التحصيلات والمديونيات
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {loading && (
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
              جاري التحديث...
            </span>
          )}
          <select
            value={financeRange}
            onChange={(e) => setFinanceRange(e.target.value as FinanceRangeType)}
            className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="today">📅 اليوم فقط</option>
            <option value="month">📆 هذا الشهر</option>
            <option value="all">🌐 الكل (كل الوقت)</option>
            <option value="m01">🗓️ يناير (1)</option>
            <option value="m02">🗓️ فبراير (2)</option>
            <option value="m03">🗓️ مارس (3)</option>
            <option value="m04">🗓️ أبريل (4)</option>
            <option value="m05">🗓️ مايو (5)</option>
            <option value="m06">🗓️ يونيو (6)</option>
            <option value="m07">🗓️ يوليو (7)</option>
            <option value="m08">🗓️ أغسطس (8)</option>
            <option value="m09">🗓️ سبتمبر (9)</option>
            <option value="m10">🗓️ أكتوبر (10)</option>
            <option value="m11">🗓️ نوفمبر (11)</option>
            <option value="m12">🗓️ ديسمبر (12)</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div
            key={card.key}
            onClick={card.onClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && card.onClick()}
            className={`rounded-2xl border ${card.border} bg-white dark:bg-slate-800 p-5 flex items-start justify-between gap-3 shadow-sm transition-all hover:shadow-md cursor-pointer ${
              card.isActive ? 'ring-2 ring-indigo-200 dark:ring-indigo-900/50' : ''
            }`}
          >
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                {card.label}
              </span>
              <span className={`text-3xl font-extrabold mt-2 ${card.accent}`}>
                {card.value}
              </span>
              <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                {card.subLabel}
              </span>
            </div>
            <div className={`p-2.5 rounded-xl text-xl ${card.iconBg}`}>
              {card.icon}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-4 dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-wrap justify-between items-center gap-3 border-b border-slate-100 dark:border-slate-700 pb-3">
          <div className="flex items-center gap-3">
            <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-base">
              قائمة الطلاب ({filteredStudents.length} / {students.length})
            </h3>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                tableFilter === 'debtors'
                  ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                  : tableFilter === 'paid_fully'
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : 'bg-slate-50 text-slate-700 dark:bg-slate-900/60 dark:text-slate-300'
              }`}
            >
              {tableFilter === 'debtors'
                ? 'مديونون فقط'
                : tableFilter === 'paid_fully'
                ? 'مسددون بالكامل'
                : 'الجميع'}
            </span>
          </div>
          <button
            onClick={() => void fetchStudents()}
            className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-3 py-1.5 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition"
          >
            تحديث القائمة 🔄
          </button>
        </div>
        {loading ? (
          <p className="text-center py-8 text-xs text-slate-400 dark:text-slate-500">جاري تحميل البيانات...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs font-bold">
                  <th className="py-3 px-3">الكود</th>
                  <th className="py-3 px-3">اسم الطالب</th>
                  <th className="py-3 px-3">المجموعة</th>
                  <th className="py-3 px-3">هاتف الطالب</th>
                  <th className="py-3 px-3">هاتف ولي الأمر</th>
                  <th className="py-3 px-3">المديونية</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-700 text-xs">
                {filteredStudents.length > 0 ? (
                  filteredStudents.map((student) => {
                    const due = student.calculatedDue ?? 0;
                    return (
                      <tr key={student.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/40 transition">
                        <td className="py-3 px-3 font-mono text-slate-500 dark:text-slate-400">{student.student_code || student.id}</td>
                        <td className="py-3 px-3 font-bold text-slate-800 dark:text-slate-100">{student.name}</td>
                        <td className="py-3 px-3 text-slate-600 dark:text-slate-300">
                          {student.group_name || <span className="text-slate-400 dark:text-slate-500">غير محدد</span>}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-600 dark:text-slate-300">
                          {student.phone || <span className="text-slate-400 dark:text-slate-500">غير محدد</span>}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-600 dark:text-slate-300">
                          {student.parent_phone || <span className="text-slate-400 dark:text-slate-500">غير محدد</span>}
                        </td>
                        <td className="py-3 px-3">
                          {due > 0 ? (
                            <span className="px-2.5 py-1 rounded-xl font-bold text-[11px] bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-900">
                              {due} ج.م متأخرات
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-xl font-bold text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900">
                              لا يوجد
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400 dark:text-slate-500">
                      {students.length === 0
                        ? 'لا يوجد طلاب مسجلون حتى الآن.'
                        : tableFilter === 'debtors'
                        ? 'لا يوجد طلاب عليهم مديونية حالياً.'
                        : tableFilter === 'paid_fully'
                        ? 'لا يوجد طلاب مسددون بالكامل حالياً.'
                        : 'لا توجد بيانات مطابقة للفلتر.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}