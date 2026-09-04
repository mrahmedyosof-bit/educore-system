'use client';

import React, { memo, useState, useMemo } from 'react';
import { formatCurrency, getMonthStatus, getCurrentMonthName } from './constants';
import { PaymentRecord } from './types';
import WhatsAppButton from '@/components/WhatsAppButton';
import { paymentReminderMessage } from '@/lib/whatsapp';

interface PaymentsTableProps {
  payments: Array<{
    id: number;
    student_id: number;
    amount_paid: number;
    amount_remaining: number;
    month_name: string;
    created_at: string;
    student?: {
      id: number;
      name: string;
      grade: string;
      subject: string;
      group_name: string;
      parent_whatsapp: string;
      parent_phone: string;
    };
  }>;
  filterMonth: string;
  filterGrade: string;
  filterSubject: string;
  setFilterMonth: (value: string) => void;
  setFilterGrade: (value: string) => void;
  setFilterSubject: (value: string) => void;
  currentMonth: string;
  currentDateInfo: { isPastDueDate: boolean };
  onEditPayment: (payment: { id: number; student_id: number; amount_paid: number; amount_remaining: number; month_name: string }) => void;
  onEditStudent: (student: { id: number; name: string; grade: string; subject: string; group_name: string }) => void;
  onExemptMonth: (payment: { id: number; student_id: number; amount_paid: number; amount_remaining: number; month_name: string; student?: { name: string } }) => void;
  onStartPaymentEdit: (payment: { id: number; student_id: number; amount_paid: number; amount_remaining: number; month_name: string; student?: { subject: string } }) => void;
}

interface PaymentWithStatus {
  id: number;
  student_id: number;
  amount_paid: number;
  amount_remaining: number;
  month_name: string;
  created_at: string;
  student?: {
    id: number;
    name: string;
    grade: string;
    subject: string;
    group_name: string;
    parent_whatsapp: string;
    parent_phone: string;
  };
  status: {
    statusType: 'paid' | 'overdue' | 'due' | 'future';
    statusText: string;
    remaining: number;
  };
}

export const PaymentsTable = React.memo(function PaymentsTable({
  payments,
  filterMonth,
  filterGrade,
  filterSubject,
  setFilterMonth,
  setFilterGrade,
  setFilterSubject,
  currentMonth,
  currentDateInfo,
  onEditPayment,
  onEditStudent,
  onExemptMonth,
  onStartPaymentEdit,
}: PaymentsTableProps) {
  // Filter options
  const monthOptions = useMemo(
    () => Array.from(new Set(payments.map((p) => p.month_name).filter(Boolean))),
    [payments]
  );

  const gradeOptions = useMemo(
    () => Array.from(
      new Set(payments.map((p) => p.student?.grade).filter((g): g is string => Boolean(g)))
    ).sort(),
    [payments]
  );

  const subjectOptions = useMemo(
    () => Array.from(
      new Set(payments.map((p) => p.student?.subject).filter((s): s is string => Boolean(s)))
    ).sort(),
    [payments]
  );

  // Compute status for each payment
  const paymentsWithStatus = useMemo(() => {
    return payments.map((payment) => {
      const remaining = Number(payment.amount_remaining ?? 0);
      const { isCurrent, isPast, isFuture } = getMonthStatus(payment.month_name, getCurrentMonthName());

      let statusType: 'paid' | 'overdue' | 'due' | 'future' = 'due';
      let statusText = '';

      if (remaining <= 0) {
        statusType = 'paid';
        statusText = 'مسدد ✓';
      } else if (!isCurrent && !isFuture) {
        // Past month
        statusType = 'overdue';
        statusText = `متأخر ${formatCurrency(remaining)}`;
      } else if (isCurrent) {
        // Current month
        if (currentDateInfo?.isPastDueDate) {
          statusType = 'overdue';
          statusText = `متأخر ${formatCurrency(remaining)}`;
        } else {
          statusType = 'due';
          statusText = `مطلوب السداد ${formatCurrency(remaining)}`;
        }
      } else if (isFuture) {
        statusType = 'future';
        statusText = 'غير مستحق بعد';
      }

      return {
        ...payment,
        status: { statusType, statusText, remaining },
      };
    });
  }, [payments, currentDateInfo]);

  const filteredPayments = useMemo(() => {
    return paymentsWithStatus.filter((p) => {
      const monthMatch = filterMonth === 'الكل' || p.month_name === filterMonth;
      const gradeMatch = filterGrade === 'الكل' || p.student?.grade === filterGrade;
      const subjectMatch = filterSubject === 'كل المواد' || p.student?.subject === filterSubject;
      return monthMatch && gradeMatch && subjectMatch;
    });
  }, [paymentsWithStatus, filterMonth, filterGrade, filterSubject]);

  if (!payments.length) {
    return (
      <div className="p-12 text-center text-xs font-bold text-slate-400">
        لا توجد سجلات مالية.
      </div>
    );
  }

  return (
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
            {gradeOptions.map((grade) => (
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
            {subjectOptions.map((subj) => (
              <option key={subj} value={subj}>{subj}</option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => window.location.reload()}
            disabled={false}
            className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-700 dark:text-slate-200"
          >
            تحديث 🔄
          </button>
        </div>
      </div>

      {filteredPayments.length === 0 ? (
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
                const remainingAmount = Number(payment.amount_remaining ?? 0);
                const paidAmount = Number(payment.amount_paid ?? 0);

                let statusBadge;
                const { isCurrent, isPast, isFuture } = getMonthStatus(payment.month_name, getCurrentMonthName());
                if (remainingAmount <= 0) {
                  statusBadge = (
                    <span className="rounded-lg bg-emerald-50 px-2.5 py-1 font-black text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                      مسدد ✓
                    </span>
                  );
                } else if (!isCurrent && !isFuture) {
                  statusBadge = (
                    <span className="rounded-lg bg-rose-50 px-2.5 py-1 font-black text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                      متأخر {formatCurrency(remainingAmount)}
                    </span>
                  );
                } else if (isCurrent) {
                  statusBadge = (
                    <span className="rounded-lg bg-amber-50 px-2.5 py-1 font-black text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                      مطلوب السداد {formatCurrency(remainingAmount)}
                    </span>
                  );
                } else {
                  statusBadge = (
                    <span className="rounded-lg bg-blue-50 px-2.5 py-1 font-black text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                      غير مستحق بعد
                    </span>
                  );
                }

                const reminderMessage = `تذكير من مركز EduCore: المتبقي على الطالب/ة ${payment.student?.name || 'الطالب'} مبلغ ${formatCurrency(remainingAmount)} ج.م لشهر ${payment.month_name}. يرجى السداد.`;

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
                        <span className={remainingAmount <= 0
                          ? 'rounded-lg bg-emerald-50 px-2.5 py-1 font-black text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : isCurrent
                            ? 'rounded-lg bg-amber-50 px-2.5 py-1 font-black text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                            : 'rounded-lg bg-rose-50 px-2.5 py-1 font-black text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'}>
                          {payment.amount_remaining === 0 ? 'مسدد ✓' :
                            isCurrent
                              ? `مطلوب السداد ${formatCurrency(remainingAmount)}`
                              : `متأخر ${formatCurrency(remainingAmount)}`}
                        </span>
                        {payment.student && (
                          <>
                            <button
                              type="button"
                              onClick={() => onEditPayment({
                                id: payment.id,
                                student_id: payment.student_id,
                                amount_paid: Number(payment.amount_paid || 0),
                                amount_remaining: Number(payment.amount_remaining || 0),
                                month_name: payment.month_name,
                              })}
                              className="rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 px-2.5 py-1.5 text-xs font-bold transition"
                              title="تعديل عملية الدفع"
                            >
                              ✏️ تعديل
                            </button>
                            <button
                              type="button"
                              onClick={() => onEditStudent({
                                id: payment.student?.id || 0,
                                name: payment.student?.name || '',
                                grade: payment.student?.grade || '',
                                subject: payment.student?.subject || '',
                                group_name: payment.student?.group_name || '',
                              })}
                              className="rounded-xl text-blue-600 hover:bg-blue-50 px-2.5 py-1.5 text-xs font-bold transition"
                              title="تعديل بيانات الطالب"
                            >
                              ✏️ تعديل الطالب
                            </button>
                            {Number(payment.amount_remaining || 0) > 0 && (
                              <button
                                type="button"
                                onClick={() => onExemptMonth({
                                  id: payment.id,
                                  student_id: payment.student_id,
                                  amount_paid: Number(payment.amount_paid || 0),
                                  amount_remaining: Number(payment.amount_remaining || 0),
                                  month_name: payment.month_name,
                                  student: payment.student,
                                })}
                                className="px-2 py-1 text-xs bg-amber-50 text-amber-700 hover:bg-amber-100 rounded transition-colors"
                                title="إعفاء الشهر الحالي فقط"
                              >
                                🎁 إعفاء الشهر
                              </button>
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
                  <td className="p-3 font-bold text-slate-600">{payments.length} عملية</td>
                  <td className="p-3 font-bold text-emerald-600 text-lg">
                    {payments.reduce((sum, p) => sum + Number(p.amount_paid || 0), 0).toLocaleString('ar-EG')} ج.م
                  </td>
                  <td className="p-3 font-bold text-rose-600 text-lg">
                    {payments.reduce((sum, p) => sum + Number(p.amount_remaining || 0), 0).toLocaleString('ar-EG')} ج.م
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
      )
    }
    </div>
    );
  });

PaymentsTable.displayName = 'PaymentsTable';

