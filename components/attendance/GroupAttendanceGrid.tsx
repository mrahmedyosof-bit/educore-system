'use client';

import React, { useMemo, useState, useCallback } from 'react';
import { Student } from '@/lib/services/students';
import { AttendanceStatus } from '@/lib/services/attendance';
import { StudentRow } from './StudentRow';
import { statusLabels, statusIcons, statusActiveClass, statusInactiveClass, STATUS_ORDER } from './constants';

interface GroupAttendanceGridProps {
  groupStudents: Student[];
  groupStatuses: Record<number, AttendanceStatus>;
  groupReasons: Record<number, string>;
  autoCalculatedStatuses: Record<number, { status: AttendanceStatus; lateMinutes?: number }>;
  selectedDate: string;
  selectedGroup: string;
  onStatusChange: (studentId: number, status: any) => void;
  onReasonChange: (studentId: number, reason: string) => void;
  onQuickPay: (student: any) => void;
  onEditStudent: (student: any) => void;
  onViewReport: (student: any) => void;
  onExemptMonth: () => void;
  onSaveGroup: () => void;
  onSendWhatsApp: () => void;
  onPrintRoster: () => void;
  onExportCSV: () => void;
  onPrintIDCards: () => void;
  filteredGroupStudents: Student[];
  groupSummary: { present: number; absent: number; late: number; excused: number };
  finCounts: { paid: number; lateFin: number };
  absentStreak: Map<number, number>;
  pendingOffline: number;
  netDueOf: (student: any) => number;
  calculateAttendanceStatus: (date: string) => { status: any; lateMinutes?: number; isAutoAbsent: boolean };
  isRecordLocked: (record: any) => boolean;
  handleSaveGroupAttendance: () => void;
  handleSendBulkWhatsApp: () => void;
  handlePrintRoster: () => void;
  exportAttendanceCSV: () => void;
  printStudentIDCards: () => void;
  markAllPresent: () => void;
  markAllAbsent: () => void;
}

export const GroupAttendanceGrid = React.memo(function GroupAttendanceGrid(props: GroupAttendanceGridProps) {
  const {
    groupStudents,
    groupStatuses,
    groupReasons,
    autoCalculatedStatuses,
    selectedDate,
    selectedGroup,
    onStatusChange,
    onReasonChange,
    onQuickPay,
    onEditStudent,
    onViewReport,
    onExemptMonth,
    onSaveGroup,
    onSendWhatsApp,
    onPrintRoster,
    onExportCSV,
    onPrintIDCards,
    filteredGroupStudents,
    groupSummary,
    finCounts,
    absentStreak,
    pendingOffline,
    netDueOf,
    calculateAttendanceStatus,
    isRecordLocked,
  } = props;

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 pb-4 lg:grid-cols-2">
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <h4 className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
            📅 حضور اليوم حسب المجموعة
          </h4>
          <span className="text-xs font-bold bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-xl">
            {groupStudents.length} طلاب
          </span>
        </div>

        <div className="space-y-3">
          {groupStudents.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">
              لا توجد طلاب في هذه المجموعة.
            </div>
          ) : (
            <div className="space-y-3">
              {groupStudents.map((student, index) => (
                <StudentRow
                  key={student.id}
                  student={student}
                  effectiveStatus={autoCalculatedStatuses[student.id]?.status ?? groupStatuses[student.id] ?? 'present'}
                  lateMinutes={autoCalculatedStatuses[student.id]?.lateMinutes}
                  isAutoCalculated={!!autoCalculatedStatuses[student.id] && !groupStatuses[student.id]}
                  netDue={netDueOf(student)}
                  streak={absentStreak.get(student.id) ?? 0}
                  showReason={groupStatuses[student.id] === 'late' || groupStatuses[student.id] === 'excused'}
                  isFocused={index === 0}
                  onStatusChange={onStatusChange}
                  onReasonChange={onReasonChange}
                  onQuickPay={onQuickPay}
                  onEditStudent={onEditStudent}
                  onViewReport={onViewReport}
                  onExemptMonth={onExemptMonth}
                  statusLabels={statusLabels}
                  statusIcons={statusIcons}
                  statusActiveClass={statusActiveClass}
                  statusInactiveClass={statusInactiveClass}
                  notifyStatus={groupStatuses[student.id] === 'absent' || groupStatuses[student.id] === 'late' ? groupStatuses[student.id] : null}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

GroupAttendanceGrid.displayName = 'GroupAttendanceGrid';