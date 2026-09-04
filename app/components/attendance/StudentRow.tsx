'use client';

import React, { memo } from 'react';
import { Student } from '@/lib/services/students';
import { AttendanceStatus } from '@/lib/services/attendance';
import { statusLabels, statusIcons, statusActiveClass, statusInactiveClass } from '../attendance/constants';

interface StudentRowProps {
  student: Student;
  effectiveStatus: AttendanceStatus;
  lateMinutes?: number;
  isAutoCalculated: boolean;
  netDue: number;
  streak: number;
  showReason: boolean;
  isFocused: boolean;
  onStatusChange: (studentId: number, status: AttendanceStatus) => void;
  onReasonChange: (studentId: number, reason: string) => void;
  onQuickPay: (student: any) => void;
  onEditStudent: (student: any) => void;
  onViewReport: (student: any) => void;
  onExemptMonth: () => void;
  statusLabels: Record<AttendanceStatus, string>;
  statusIcons: Record<AttendanceStatus, string>;
  statusActiveClass: Record<AttendanceStatus, string>;
  statusInactiveClass: Record<AttendanceStatus, string>;
  notifyStatus: AttendanceStatus | null;
}

export const StudentRow = memo(function StudentRow({
  student,
  effectiveStatus,
  lateMinutes,
  isAutoCalculated,
  netDue,
  streak,
  showReason,
  isFocused,
  onStatusChange,
  onReasonChange,
  onQuickPay,
  onEditStudent,
  onViewReport,
  onExemptMonth,
  statusLabels,
  statusIcons,
  statusActiveClass,
  statusInactiveClass,
  notifyStatus,
}: StudentRowProps) {
  return (
    <div
      ref={(el) => {}}
      className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-white p-3 transition dark:bg-slate-900 ${
        isFocused
          ? 'border-indigo-500 ring-2 ring-indigo-300 dark:ring-indigo-700'
          : 'border-slate-200 hover:border-indigo-300 dark:border-slate-700 dark:hover:border-indigo-600'
      } ${isAutoCalculated ? 'bg-amber-50/30 dark:bg-amber-950/20' : ''}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="truncate text-xs font-black text-slate-800 dark:text-slate-100">
            {student.name}
          </span>
          {streak >= 2 && (
            <span
              title={`غياب متكرر: ${streak} مرات متتالية`}
              className="shrink-0 animate-pulse rounded-md bg-red-600 px-1.5 py-0.5 text-[9px] font-black text-white"
            >
              ⚠️ غياب متكرر ×{streak}
            </span>
          )}
          {netDue > 0 && (
            <span
              title={`مطلوب منه ${netDue} ج.م`}
              className="shrink-0 rounded-md bg-rose-100 px-1.5 py-0.5 text-[9px] font-black text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
            >
              متأخر
            </span>
          )}
          {isAutoCalculated && (
            <span
              title={lateMinutes ? `تم حسابه تلقائياً: متأخر ${lateMinutes} دقيقة` : 'تم حسابه تلقائياً: غائب (انتهت الحصة)'}
              className="shrink-0 animate-pulse rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-black text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
            >
              {lateMinutes ? `⏱️ ${lateMinutes} د` : '🤖 آلي'}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          {student.barcode && (
            <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500" dir="ltr">
              #{student.barcode}
            </span>
          )}
          {student.grade && (
            <span className="text-[10px] text-slate-400 dark:text-slate-500">
              {student.grade}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          {['present', 'absent', 'late', 'excused'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onStatusChange(student.id, s as any)}
              aria-pressed={false}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-black transition ${
                s === 'present' ? 'bg-emerald-600 text-white' :
                s === 'absent' ? 'bg-rose-600 text-white' :
                s === 'late' ? 'bg-amber-600 text-white' :
                'bg-sky-600 text-white'
              }`}
              title={`تغيير الحالة إلى ${s}`}
            >
              {s === 'present' && '✓'}
              {s === 'absent' && '✗'}
              {s === 'late' && '⏰'}
              {s === 'excused' && '📝'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onStatusChange(student.id, 'present')}
            className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 text-xs transition shadow-sm"
          >
            ⚡ تسديد سريع
          </button>
        </div>
      </div>
    </div>
  );
});

StudentRow.displayName = 'StudentRow';