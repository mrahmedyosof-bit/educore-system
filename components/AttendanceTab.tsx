'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addAttendance,
  addAttendanceBulk,
  AttendanceRecord,
  AttendanceStatus,
  deleteAttendance,
  getAttendance,
  updateAttendance,
  updateAttendanceRecord,
} from '@/lib/services/attendance';
import { getStudents, Student } from '@/lib/services/students';
import { getPayments, type PaymentRecord as FinancePaymentRecord } from '@/lib/services/payments';
import { addAuditEntry, getRecentAuditLogs, type AuditEntryRow } from '@/lib/services/auditLog';
import { useCurriculumSettings } from '@/hooks/useCurriculumSettings';
import type { GroupSchedule } from '@/lib/services/settings';
import { getPriceMatrix, priceKey } from '@/lib/services/settings';
import { attendanceMessage, openWhatsApp } from '@/lib/whatsapp';
import { getFriendlyErrorMessage } from '@/lib/errors';
import QRScanner from './QRScanner';
import WhatsAppButton from './WhatsAppButton';
import { useNav } from './Navigation';

const STATUS_ORDER: AttendanceStatus[] = ['present', 'absent', 'late', 'excused'];

const statusLabels: Record<AttendanceStatus, string> = {
  present: 'حاضر',
  absent: 'غائب',
  late: 'متأخر',
  excused: 'بعذر',
};

const statusIcons: Record<AttendanceStatus, string> = {
  present: '✓',
  absent: '✗',
  late: '⏰',
  excused: '📝',
};

const statusActiveClass: Record<AttendanceStatus, string> = {
  present: 'bg-emerald-600 text-white shadow-sm dark:bg-emerald-500',
  absent: 'bg-rose-600 text-white shadow-sm dark:bg-rose-500',
  late: 'bg-amber-500 text-white shadow-sm dark:bg-amber-400 dark:text-slate-900',
  excused: 'bg-sky-600 text-white shadow-sm dark:bg-sky-500',
};

const statusInactiveClass: Record<AttendanceStatus, string> = {
  present: 'text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30',
  absent: 'text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30',
  late: 'text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30',
  excused: 'text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-950/30',
};

const statusBadgeClass: Record<AttendanceStatus, string> = {
  present: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
  absent: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800',
  late: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
  excused: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800',
};

const today = new Date().toISOString().split('T')[0];
const DEFAULT_CLASS_START = '08:00';
const DEFAULT_CLASS_END = '14:00';
const DEFAULT_LATE_THRESHOLD_MINUTES = 15;
const PAGE_LOAD_TIME = Date.now();

const formatDateDisplay = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '—';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
};

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const csvCell = (value: unknown): string => {
  let text = String(value ?? '');
  if (/^[=+\-@\t]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
};

const playBeep = (frequency = 880, durationMs = 180): void => {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
    osc.onended = () => void ctx.close();
  } catch {
    /* تجاهل */
  }
};

type InputMode = 'manual' | 'scan' | 'group' | 'analytics';
const PENDING_KEY = 'educore-attendance-pending';

interface PendingAttendance {
  inputs: {
    student_id: number;
    date: string;
    status: AttendanceStatus;
    reason?: string | null;
  }[];
  savedAt: string;
}

const loadPending = (): PendingAttendance | null => {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingAttendance;
    return Array.isArray(parsed.inputs) && parsed.inputs.length > 0 ? parsed : null;
  } catch {
    return null;
  }
};

const savePending = (inputs: PendingAttendance['inputs']): void => {
  try {
    window.localStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ inputs, savedAt: new Date().toISOString() })
    );
  } catch {
    /* تجاهل */
  }
};

const clearPending = (): void => {
  try {
    window.localStorage.removeItem(PENDING_KEY);
  } catch {
    /* تجاهل */
  }
};

const findGroupScheduleHelper = (
  groupName: string,
  groupSchedules: Record<string, GroupSchedule> | null,
  stage?: string,
  grade?: string,
  subject?: string
): GroupSchedule | null => {
  if (!groupName || !groupSchedules || Object.keys(groupSchedules).length === 0) return null;
  const normalize = (str: string) => str.trim().replace(/\s+/g, ' ').toLowerCase();
  const normalizedInput = normalize(groupName);
  if (groupSchedules[groupName]) return groupSchedules[groupName];
  for (const [key, schedule] of Object.entries(groupSchedules)) {
    if (normalize(key) === normalizedInput) return schedule;
  }
  for (const [key, schedule] of Object.entries(groupSchedules)) {
    const normalizedKey = normalize(key);
    if (normalizedKey.includes(normalizedInput) || normalizedInput.includes(normalizedKey)) {
      return schedule;
    }
  }
  if (stage && grade && subject) {
    const compositeNames = [
      `${stage} ${grade} ${subject} ${groupName}`,
      `${grade} ${subject} ${groupName}`,
      `${stage} ${groupName}`,
      `${subject} ${groupName}`,
    ].map(normalize);
    for (const [key, schedule] of Object.entries(groupSchedules)) {
      const normalizedKey = normalize(key);
      if (compositeNames.some((cn) => normalizedKey.includes(cn) || cn.includes(normalizedKey))) {
        return schedule;
      }
    }
  }
  for (const [key, schedule] of Object.entries(groupSchedules)) {
    const keyParts = key.split(/[\s,،]+/);
    const lastPart = keyParts[keyParts.length - 1];
    if (normalize(lastPart) === normalizedInput) {
      return schedule;
    }
  }
  return null;
};

interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: 'create' | 'update' | 'delete' | 'bulk_save';
  studentId: number;
  studentName: string;
  date: string;
  oldStatus: AttendanceStatus | null;
  newStatus: AttendanceStatus;
  oldReason: string | null;
  newReason: string | null;
  groupName: string;
}

const mapAuditRowToEntry = (row: AuditEntryRow): AuditLogEntry => {
  const d = row.details ?? {};
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  return {
    id: String(row.id),
    timestamp: row.created_at,
    userId: row.user_id ?? '',
    userName: str(d.userEmail) || 'مستخدم غير معروف',
    action: (['create', 'update', 'delete', 'bulk_save'].includes(row.action)
      ? row.action
      : 'update') as AuditLogEntry['action'],
    studentId: Number(row.entity_id ?? 0),
    studentName: str(d.studentName),
    date: str(d.date),
    oldStatus: (d.oldStatus as AttendanceStatus | null) ?? null,
    newStatus: (d.newStatus as AttendanceStatus) ?? 'present',
    oldReason: typeof d.oldReason === 'string' ? d.oldReason : null,
    newReason: typeof d.newReason === 'string' ? d.newReason : null,
    groupName: str(d.groupName),
  };
};

/* ═══════════════════════════════════════════════════════════
   ✅ التنبيه الزمني الديناميكي
═══════════════════════════════════════════════════════════ */
type TimeStatusType = 'before' | 'ongoing' | 'ended';

interface TimeStatusInfo {
  status: TimeStatusType;
  label: string;
  badgeClass: string;
  icon: string;
  progressPercent: number;
}

const getTimeStatusInfo = (
  classStart: string,
  classEnd: string,
  now: Date
): TimeStatusInfo => {
  const [startH, startM] = classStart.split(':').map(Number);
  const [endH, endM] = classEnd.split(':').map(Number);

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  const totalMinutes = Math.max(1, endMinutes - startMinutes);

  if (nowMinutes < startMinutes) {
    const diffMinutes = startMinutes - nowMinutes;
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    const timeText =
      hours > 0
        ? minutes > 0
          ? `${hours} ساعة و ${minutes} دقيقة`
          : `${hours} ساعة`
        : `${minutes} دقيقة`;
    return {
      status: 'before',
      label: `قبل موعد الحصة بـ ${timeText}`,
      badgeClass:
        'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800',
      icon: '🔵',
      progressPercent: 0,
    };
  }

  if (nowMinutes < endMinutes) {
    const elapsedMinutes = nowMinutes - startMinutes;
    const remainingMinutes = endMinutes - nowMinutes;
    const progressPercent = Math.min(
      100,
      Math.round((elapsedMinutes / totalMinutes) * 100)
    );
    return {
      status: 'ongoing',
      label: `الحصة جارية الآن — متبقي ${remainingMinutes} دقيقة`,
      badgeClass:
        'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
      icon: '🟢',
      progressPercent,
    };
  }

  const diffMinutes = nowMinutes - endMinutes;
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  const timeText =
    hours > 0
      ? minutes > 0
        ? `${hours} ساعة و ${minutes} دقيقة`
        : `${hours} ساعة`
      : `${minutes} دقيقة`;
  return {
    status: 'ended',
    label: `انتهت الحصة منذ ${timeText}`,
    badgeClass:
      'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800',
    icon: '🟠',
    progressPercent: 100,
  };
};

const formatTimeDisplay = (time24: string): string => {
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'م' : 'ص';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
};

export default function AttendanceTab() {
  const { stages, groupSchedules } = useCurriculumSettings();
  const { role } = useNav();

  /* ═══════════════════════════════════════════════════════════
     1) جميع الـ States
  ═══════════════════════════════════════════════════════════ */
  const [students, setStudents] = useState<Student[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [priceMatrix, setPriceMatrix] = useState<Record<string, number>>({});
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedStatus, setSelectedStatus] = useState<AttendanceStatus>('present');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [inputMode, setInputMode] = useState<InputMode>('group');
  const [scanKey, setScanKey] = useState(0);
  const [lastRecord, setLastRecord] = useState<{
    studentId: number;
    status: AttendanceStatus;
    date: string;
  } | null>(null);
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [draftMessage, setDraftMessage] = useState('');
  const [filterStage, setFilterStage] = useState('الكل');
  const [filterGrade, setFilterGrade] = useState('الكل');
  const [filterSubject, setFilterSubject] = useState('الكل');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [groupStatuses, setGroupStatuses] = useState<Record<number, AttendanceStatus>>({});
  const [groupReasons, setGroupReasons] = useState<Record<number, string>>({});
  const [finOnly, setFinOnly] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [printMode, setPrintMode] = useState(false);
  const [pendingOffline, setPendingOffline] = useState(0);
  const [bulkWhatsAppSending, setBulkWhatsAppSending] = useState(false);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [classStartTime, setClassStartTime] = useState(DEFAULT_CLASS_START);
  const [classEndTime, setClassEndTime] = useState(DEFAULT_CLASS_END);
  const [lateThresholdMinutes, setLateThresholdMinutes] = useState(DEFAULT_LATE_THRESHOLD_MINUTES);
  const [analyticsPeriod, setAnalyticsPeriod] = useState<'week' | 'month' | 'all'>('month');
  const [analyticsGroup, setAnalyticsGroup] = useState('الكل');
  const [autoCalculatedStatuses, setAutoCalculatedStatuses] = useState<
    Record<number, { status: AttendanceStatus; lateMinutes?: number }>
  >({});
  const AUDIT_LOG_KEY = 'educore-attendance-audit-log';
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  /* ✅ State جديدة للتحديث الزمني والبحث */
  const [currentTime, setCurrentTime] = useState<Date>(() => new Date());
  const [quickSearch, setQuickSearch] = useState('');

  /* ✅ State لـ Modal تأكيد الحذف */
  const [recordToDelete, setRecordToDelete] = useState<AttendanceRecord | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  /* ═══════════════════════════════════════════════════════════
     2) الـ Callbacks المستقلة
  ═══════════════════════════════════════════════════════════ */
  const addAuditLog = useCallback(
    (
      action: AuditLogEntry['action'],
      student: Student,
      date: string,
      oldStatus: AttendanceStatus | null,
      newStatus: AttendanceStatus,
      oldReason: string | null,
      newReason: string | null,
      groupName: string
    ) => {
      addAuditEntry({
        action,
        entity: 'attendance',
        entity_id: String(student.id),
        details: {
          studentName: student.name,
          date,
          oldStatus,
          newStatus,
          oldReason,
          newReason,
          groupName,
        },
      })
        .then(() => getRecentAuditLogs(100))
        .then((rows) => setAuditLogs(rows.map(mapAuditRowToEntry)))
        .catch((err) => {
          console.warn('تعذر حفظ سجل التدقيق في قاعدة البيانات:', err);
        });
    },
    []
  );

  const computeWalletBalance = useCallback(
    (
      student: Student,
      recordsList: AttendanceRecord[],
      paymentsList: FinancePaymentRecord[]
    ): { balance: number; price: number; low: boolean } | null => {
      const price =
        student.grade && student.subject
          ? priceMatrix[priceKey(student.grade, student.subject)]
          : 0;
      if (!price || typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
        return null;
      }
      const paidTotal = paymentsList
        .filter((p) => p.student_id === student.id)
        .reduce((sum, p) => sum + Number(p.amount_paid ?? 0), 0);
      const attendedSessions = recordsList.filter(
        (r) => r.student_id === student.id && (r.status === 'present' || r.status === 'late')
      ).length;
      const balance = paidTotal - attendedSessions * price;
      const low = balance <= price;
      return { balance, price, low };
    },
    [priceMatrix]
  );

  const findGroupSchedule = useCallback(
    (groupName: string, stage?: string, grade?: string, subject?: string): GroupSchedule | null => {
      return findGroupScheduleHelper(groupName, groupSchedules, stage, grade, subject);
    },
    [groupSchedules]
  );

  const calculateAttendanceStatus = useCallback(
    (dateStr: string): {
      status: AttendanceStatus;
      lateMinutes?: number;
      isAutoAbsent: boolean;
      checkTime: Date;
    } => {
      const now = new Date();
      const checkDate = dateStr === today ? now : new Date(`${dateStr}T00:00:00`);
      const [startH, startM] = classStartTime.split(':').map(Number);
      const [endH, endM] = classEndTime.split(':').map(Number);
      const classStartMinutes = startH * 60 + startM;
      const classEndMinutes = endH * 60 + endM;
      const nowMinutes = checkDate.getHours() * 60 + checkDate.getMinutes();
      if (nowMinutes >= classEndMinutes) {
        return { status: 'absent', isAutoAbsent: true, checkTime: now };
      }
      const lateThreshold = classStartMinutes + lateThresholdMinutes;
      if (nowMinutes <= lateThreshold) {
        return { status: 'present', isAutoAbsent: false, checkTime: now };
      }
      const lateMinutes = nowMinutes - classStartMinutes;
      return { status: 'late', lateMinutes, isAutoAbsent: false, checkTime: now };
    },
    [classStartTime, classEndTime, lateThresholdMinutes]
  );

  const loadData = useCallback(async (): Promise<{
    records: AttendanceRecord[];
    payments: FinancePaymentRecord[];
  }> => {
    try {
      const [studentData, attendanceData] = await Promise.all([
        getStudents(),
        getAttendance(),
      ]);
      setStudents(studentData);
      setRecords(attendanceData);
      let paymentData: FinancePaymentRecord[] = [];
      try {
        paymentData = await getPayments();
      } catch (err) {
        console.warn('تعذر تحميل المدفوعات لاشتقاق أرصدة المحافظ:', err);
      }
      try {
        const matrix = await getPriceMatrix();
        setPriceMatrix(matrix);
      } catch (err) {
        console.warn('تعذر تحميل مصفوفة الأسعار:', err);
      }
      try {
        const rows = await getRecentAuditLogs(100);
        setAuditLogs(rows.map(mapAuditRowToEntry));
      } catch (err) {
        console.warn('تعذر تحميل سجل التدقيق:', err);
      }
      setError('');
      return { records: attendanceData, payments: paymentData };
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'تعذر تحميل بيانات الحضور.'));
      return { records: [], payments: [] };
    } finally {
      setLoading(false);
    }
  }, []);

  const retryPending = useCallback(async () => {
    const pending = loadPending();
    if (!pending) {
      setPendingOffline(0);
      return;
    }
    try {
      await addAttendanceBulk(pending.inputs);
      clearPending();
      setPendingOffline(0);
      setSuccess(`📡 تم رفع ${pending.inputs.length} سجل حضور كان محفوظاً دون إنترنت.`);
      await loadData();
    } catch {
      setPendingOffline(pending.inputs.length);
    }
  }, [loadData]);

  /* ═══════════════════════════════════════════════════════════
     3) الـ Memos بترتيب التبعيات الصحيح
  ═══════════════════════════════════════════════════════════ */
  const studentById = useMemo(
    () => new Map(students.map((student) => [student.id, student])),
    [students]
  );

  const stageFilteredStudents = useMemo(
    () =>
      filterStage === 'الكل'
        ? students
        : students.filter((s) => s.stage === filterStage),
    [students, filterStage]
  );

  const gradeOptions = useMemo(
    () =>
      Array.from(
        new Set(stageFilteredStudents.map((s) => s.grade).filter((g): g is string => Boolean(g)))
      ).sort((a, b) => a.localeCompare(b, 'ar')),
    [stageFilteredStudents]
  );

  const gradeFilteredStudents = useMemo(
    () =>
      filterGrade === 'الكل'
        ? stageFilteredStudents
        : stageFilteredStudents.filter((s) => s.grade === filterGrade),
    [stageFilteredStudents, filterGrade]
  );

  const subjectOptions = useMemo(
    () =>
      Array.from(
        new Set(
          gradeFilteredStudents.map((s) => s.subject).filter((sub): sub is string => Boolean(sub))
        )
      ).sort((a, b) => a.localeCompare(b, 'ar')),
    [gradeFilteredStudents]
  );

  const subjectFilteredStudents = useMemo(
    () =>
      filterSubject === 'الكل'
        ? gradeFilteredStudents
        : gradeFilteredStudents.filter((s) => s.subject === filterSubject),
    [gradeFilteredStudents, filterSubject]
  );

  const groupOptions = useMemo(
    () =>
      Array.from(
        new Set(
          subjectFilteredStudents
            .map((s) => s.group_name)
            .filter((g): g is string => Boolean(g))
        )
      ).sort((a, b) => a.localeCompare(b, 'ar')),
    [subjectFilteredStudents]
  );

  const groupStudents = useMemo(
    () =>
      subjectFilteredStudents
        .filter((s) => s.group_name === selectedGroup)
        .sort((a, b) => a.name.localeCompare(b.name, 'ar')),
    [subjectFilteredStudents, selectedGroup]
  );

  const netDueOf = useCallback(
    (s: Student): number => {
      if (s.isExempt) return 0;
      return Math.max(0, (s.dueAmount ?? 0) - (s.discountAmount ?? 0));
    },
    []
  );

  const filteredGroupStudents = useMemo(() => {
    return groupStudents.filter((s) => {
      const matchesFin = !finOnly || netDueOf(s) > 0;
      return matchesFin;
    });
  }, [groupStudents, finOnly, netDueOf]);

  /* ✅ تصفية الطلاب حسب البحث السريع */
  const searchFilteredStudents = useMemo(() => {
    const q = quickSearch.trim().toLowerCase();
    if (!q) return filteredGroupStudents;
    return filteredGroupStudents.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.barcode || '').toLowerCase().includes(q) ||
        String(s.id).includes(q)
    );
  }, [filteredGroupStudents, quickSearch]);

  const groupSummary = useMemo(() => {
    let present = 0;
    let absent = 0;
    let late = 0;
    let excused = 0;
    groupStudents.forEach((s) => {
      const manualStatus = groupStatuses[s.id];
      const autoStatus = autoCalculatedStatuses[s.id];
      const effectiveStatus = manualStatus ?? autoStatus?.status ?? 'present';
      if (effectiveStatus === 'present') present += 1;
      else if (effectiveStatus === 'absent') absent += 1;
      else if (effectiveStatus === 'late') late += 1;
      else excused += 1;
    });
    return { present, absent, late, excused };
  }, [groupStudents, groupStatuses, autoCalculatedStatuses]);

  const finCounts = useMemo(() => {
    let paid = 0;
    let lateFin = 0;
    groupStudents.forEach((s) => {
      if (netDueOf(s) > 0) lateFin += 1;
      else paid += 1;
    });
    return { paid, lateFin };
  }, [groupStudents, netDueOf]);

  const absentStreak = useMemo(() => {
    const map = new Map<number, number>();
    const byStudent = new Map<number, string[]>();
    [...records]
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .forEach((r) => {
        if (r.student_id == null) return;
        const list = byStudent.get(r.student_id) ?? [];
        list.push((r.status || '').toLowerCase());
        byStudent.set(r.student_id, list);
      });
    byStudent.forEach((statuses, id) => {
      let streak = 0;
      for (const st of statuses) {
        if (st === 'absent') streak += 1;
        else break;
      }
      if (streak >= 2) map.set(id, streak);
    });
    return map;
  }, [records]);

  const isDirty = useMemo(
    () =>
      selectedGroup !== '' &&
      groupStudents.length > 0 &&
      JSON.stringify({ s: groupStatuses, r: groupReasons }) !== savedSnapshot,
    [selectedGroup, groupStudents.length, groupStatuses, groupReasons, savedSnapshot]
  );

  const filteredAnalyticsRecords = useMemo(() => {
    let result = records;
    const now = new Date();
    const cutoffDate = new Date();
    if (analyticsPeriod === 'week') {
      cutoffDate.setDate(now.getDate() - 7);
    } else if (analyticsPeriod === 'month') {
      cutoffDate.setMonth(now.getMonth() - 1);
    }
    if (analyticsPeriod !== 'all') {
      result = result.filter((r) => {
        const recordDate = new Date(r.date || '');
        return recordDate >= cutoffDate;
      });
    }
    if (analyticsGroup !== 'الكل') {
      const groupStudentIds = new Set(
        students.filter((s) => s.group_name === analyticsGroup).map((s) => s.id)
      );
      result = result.filter((r) => r.student_id && groupStudentIds.has(r.student_id));
    }
    return result;
  }, [records, students, analyticsPeriod, analyticsGroup]);

  const analyticsSummary = useMemo(() => {
    const recs = filteredAnalyticsRecords;
    const total = recs.length;
    const present = recs.filter((r) => r.status === 'present').length;
    const absent = recs.filter((r) => r.status === 'absent').length;
    const late = recs.filter((r) => r.status === 'late').length;
    const excused = recs.filter((r) => r.status === 'excused').length;
    return {
      totalRecords: total,
      attendanceRate: total > 0 ? Math.round((present / total) * 100) : 0,
      totalAbsent: absent,
      totalLate: late,
      totalExcused: excused,
    };
  }, [filteredAnalyticsRecords]);

  const topAbsentStudents = useMemo(() => {
    const absentCounts = new Map<number, { studentName: string; count: number }>();
    filteredAnalyticsRecords
      .filter((r) => r.status === 'absent' && r.student_id)
      .forEach((r) => {
        const student = studentById.get(r.student_id!);
        const key = r.student_id!;
        const current = absentCounts.get(key) || {
          studentName: student?.name || `طالب #${key}`,
          count: 0,
        };
        current.count += 1;
        absentCounts.set(key, current);
      });
    return Array.from(absentCounts.entries())
      .map(([student_id, data]) => ({ student_id, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [filteredAnalyticsRecords, studentById]);

  const topLateStudents = useMemo(() => {
    const lateCounts = new Map<number, { studentName: string; count: number; totalMinutes: number }>();
    filteredAnalyticsRecords
      .filter((r) => r.status === 'late' && r.student_id)
      .forEach((r) => {
        const student = studentById.get(r.student_id!);
        const key = r.student_id!;
        const minutes = r.reason ? parseInt(r.reason.match(/(\d+)\s*دقيقة/)?.[1] || '0') : 0;
        const current = lateCounts.get(key) || {
          studentName: student?.name || `طالب #${key}`,
          count: 0,
          totalMinutes: 0,
        };
        current.count += 1;
        current.totalMinutes += minutes;
        lateCounts.set(key, current);
      });
    return Array.from(lateCounts.entries())
      .map(([student_id, data]) => ({ student_id, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [filteredAnalyticsRecords, studentById]);

  const groupAttendanceStats = useMemo(() => {
    const groupStats = new Map<string, { present: number; total: number; groupName: string }>();
    filteredAnalyticsRecords.forEach((r) => {
      const student = r.student_id ? studentById.get(r.student_id) : undefined;
      const groupName = student?.group_name || 'بدون مجموعة';
      const current = groupStats.get(groupName) || { present: 0, total: 0, groupName };
      current.total += 1;
      if (r.status === 'present') current.present += 1;
      groupStats.set(groupName, current);
    });
    return Array.from(groupStats.values())
      .map((g) => ({
        groupName: g.groupName,
        attendanceRate: g.total > 0 ? Math.round((g.present / g.total) * 100) : 0,
        total: g.total,
      }))
      .sort((a, b) => b.attendanceRate - a.attendanceRate);
  }, [filteredAnalyticsRecords, studentById]);

  /* ✅ شارة الوقت الديناميكية */
  const timeStatus: TimeStatusInfo = useMemo(
    () => getTimeStatusInfo(classStartTime, classEndTime, currentTime),
    [classStartTime, classEndTime, currentTime]
  );

  /* ═══════════════════════════════════════════════════════════
     4) الـ Effects
  ════════════════════════════════════════════════════════════ */
  useEffect(() => {
    try {
      window.localStorage.removeItem(AUDIT_LOG_KEY);
      window.localStorage.removeItem('educore-session-wallet');
    } catch {
      /* تجاهل */
    }
  }, [AUDIT_LOG_KEY]);

  useEffect(() => {
    void (async () => {
      await Promise.resolve();
      const schedule = findGroupSchedule(selectedGroup, filterStage, filterGrade, filterSubject);
      if (schedule) {
        setClassStartTime(schedule.startTime);
        setClassEndTime(schedule.endTime);
        setLateThresholdMinutes(schedule.lateThresholdMinutes ?? DEFAULT_LATE_THRESHOLD_MINUTES);
      } else {
        setClassStartTime(DEFAULT_CLASS_START);
        setClassEndTime(DEFAULT_CLASS_END);
        setLateThresholdMinutes(DEFAULT_LATE_THRESHOLD_MINUTES);
      }
    })();
  }, [selectedGroup, filterStage, filterGrade, filterSubject, findGroupSchedule]);

  useEffect(() => {
    void (async () => {
      await Promise.resolve();
      if (!selectedGroup || groupStudents.length === 0) {
        setGroupStatuses({});
        setGroupReasons({});
        setSavedSnapshot('{}');
        return;
      }
      const init: Record<number, AttendanceStatus> = {};
      const initReasons: Record<number, string> = {};
      groupStudents.forEach((s) => {
        init[s.id] = 'present';
      });
      records.forEach((r) => {
        if (r.date === selectedDate && r.student_id != null && init[r.student_id] !== undefined) {
          init[r.student_id] = (r.status as AttendanceStatus) || 'present';
          initReasons[r.student_id] = r.reason || '';
        }
      });
      setGroupStatuses(init);
      setGroupReasons(initReasons);
      setSavedSnapshot(JSON.stringify({ s: init, r: initReasons }));
    })();
  }, [groupStudents, records, selectedGroup, selectedDate]);

  useEffect(() => {
    void (async () => {
      await Promise.resolve();
      if (!selectedGroup || groupStudents.length === 0) {
        setAutoCalculatedStatuses({});
        return;
      }
      const now = new Date();
      const currentDateStr = now.toISOString().split('T')[0];
      const currentTimeStr = now.toTimeString().slice(0, 5);
      const [startH, startM] = classStartTime.split(':').map(Number);
      const [endH, endM] = classEndTime.split(':').map(Number);
      const [nowH, nowM] = currentTimeStr.split(':').map(Number);
      const classStartMinutes = startH * 60 + startM;
      const classEndMinutes = endH * 60 + endM;
      const nowMinutes = nowH * 60 + nowM;
      const autoStatuses: Record<number, { status: AttendanceStatus; lateMinutes?: number }> = {};
      groupStudents.forEach((student) => {
        const existingRecord = records.find(
          (r) => r.date === currentDateStr && r.student_id === student.id
        );
        if (existingRecord) return;
        if (nowMinutes < classStartMinutes) return;
        if (nowMinutes >= classEndMinutes) {
          autoStatuses[student.id] = { status: 'absent' };
        } else if (nowMinutes > classStartMinutes + lateThresholdMinutes) {
          const lateMinutes = nowMinutes - classStartMinutes;
          autoStatuses[student.id] = { status: 'late', lateMinutes };
        }
      });
      setAutoCalculatedStatuses(autoStatuses);
    })();
  }, [groupStudents, records, selectedGroup, selectedDate, classStartTime, classEndTime, lateThresholdMinutes]);

  useEffect(() => {
    void (async () => {
      await Promise.resolve();
      await loadData();
    })();
  }, [loadData]);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(''), 4000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    const onOnline = () => void retryPending();
    window.addEventListener('online', onOnline);
    void (async () => {
      await Promise.resolve();
      setPendingOffline(loadPending()?.inputs.length ?? 0);
      await retryPending();
    })();
    return () => window.removeEventListener('online', onOnline);
  }, [retryPending]);

  useEffect(() => {
    cardRefs.current[focusedIdx]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focusedIdx]);

  /* ✅ تحديث الوقت كل 30 ثانية لإبقاء شارة التنبيه الزمني حيّة */
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  /* ═══════════════════════════════════════════════════════════
     5) الدوال المساعدة
  ════════════════════════════════════════════════════════════ */
  const isRecordLocked = (record: AttendanceRecord): boolean => {
    if (role === 'admin' || !record.date) return false;
    const recordEnd = new Date(`${record.date}T23:59:59`).getTime();
    return Number.isFinite(recordEnd) && PAGE_LOAD_TIME - recordEnd > 24 * 60 * 60 * 1000;
  };

  const BULK_WHATSAPP_DELAY_MS = 1250;

  const handleSendBulkWhatsApp = async () => {
    if (!selectedGroup || filteredGroupStudents.length === 0) {
      setError('لا توجد مجموعة مختارة أو طلاب للإشعار.');
      return;
    }
    const targetStudents = filteredGroupStudents.filter((s) => {
      const status = groupStatuses[s.id] ?? 'present';
      return status === 'absent' || status === 'late';
    });
    if (targetStudents.length === 0) {
      setError('لا يوجد طلاب غائبين أو متأخرين في هذه المجموعة.');
      return;
    }
    const studentsWithPhone = targetStudents.filter((s) => {
      const student = studentById.get(s.id);
      return student?.guardian_whatsapp || student?.guardian_phone;
    });
    if (studentsWithPhone.length === 0) {
      setError('لا يوجد أرقام واتساب مسجلة لأي من الطلاب الغائبين/المتأخرين.');
      return;
    }
    const testPopup = window.open('', '_blank', 'width=1,height=1');
    if (!testPopup || testPopup.closed || typeof testPopup.closed === 'undefined') {
      setError('⚠️ المتصفح يحظر النوافذ المنبثقة. يرجى السماح بالنوافذ المنبثقة لهذا الموقع ثم إعادة المحاولة.');
      return;
    }
    testPopup.close();
    setBulkWhatsAppSending(true);
    setError('');
    setSuccess('');
    try {
      let openedCount = 0;
      let skippedCount = 0;
      for (let i = 0; i < targetStudents.length; i++) {
        const student = targetStudents[i];
        const studentData = studentById.get(student.id);
        if (!studentData) {
          skippedCount++;
          continue;
        }
        const phone = studentData.guardian_whatsapp || studentData.guardian_phone;
        const status = groupStatuses[student.id] ?? 'present';
        const reason = groupReasons[student.id] || '';
        if (!phone) {
          skippedCount++;
          continue;
        }
        const statusText = status === 'absent' ? 'غائب' : 'متأخر';
        const message = [
          'أهلاً ولي أمر الطالب/ة: ' + studentData.name,
          '',
          'نود إعلامكم بأن الطالب/ة ' + studentData.name + ' كان ' + statusText + ' اليوم ' + selectedDate + '.',
          reason ? '\nالسبب: ' + reason : '',
          '',
          'شكراً لتعاونكم 🌹',
          'مركز EduCore التعليمي',
        ]
          .filter(Boolean)
          .join('\n');
        const opened = openWhatsApp(phone, message);
        if (opened) openedCount++;
        else skippedCount++;
        if (i < targetStudents.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, BULK_WHATSAPP_DELAY_MS));
        }
      }
      if (openedCount > 0) {
        setSuccess(
          '✅ تم فتح ' +
            openedCount +
            ' محادثة واتساب برسالة جاهزة — اضغط إرسال داخل كل محادثة لإتمام الإرسال' +
            (skippedCount > 0 ? ' (تم تخطي ' + skippedCount + ' لعدم وجود رقم صالح)' : '') +
            '.'
        );
      } else {
        setError('لم يتم فتح أي محادثة — تأكد من وجود أرقام واتساب صحيحة.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ أثناء فتح المحادثات الجماعية.');
    } finally {
      setBulkWhatsAppSending(false);
    }
  };

  const resetEditing = () => {
    setEditingRecord(null);
    setSelectedStudentId('');
    setSelectedStatus('present');
  };

  const handleStartEdit = (record: AttendanceRecord) => {
    setEditingRecord(record);
    setSelectedStudentId(String(record.student_id ?? ''));
    setSelectedDate(record.date || today);
    setSelectedStatus((record.status as AttendanceStatus) || 'present');
    setInputMode('manual');
    setError('');
    setSuccess('');
  };

  const handleAddAttendance = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedStudentId || !selectedDate) {
      setError('يرجى اختيار الطالب والتاريخ.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (editingRecord) {
        await updateAttendanceRecord(editingRecord.id, {
          student_id: Number(selectedStudentId),
          date: selectedDate,
          status: selectedStatus,
        });
        await loadData();
        setSuccess('تم حفظ تعديل سجل الحضور بنجاح.');
      } else {
        const { status: calculatedStatus, lateMinutes, isAutoAbsent } =
          calculateAttendanceStatus(selectedDate);
        const finalStatus =
          selectedStatus === 'present' ? calculatedStatus : selectedStatus;
        const reason = lateMinutes
          ? `تأخير ${lateMinutes} دقيقة (تم حسابه آلياً)`
          : isAutoAbsent
          ? 'غياب آلي (تجاوز وقت نهاية الحصة)'
          : selectedStatus === 'late' || selectedStatus === 'excused'
          ? ''
          : undefined;
        await addAttendance({
          student_id: Number(selectedStudentId),
          date: selectedDate,
          status: finalStatus,
          reason: reason || null,
        });
        const fresh = await loadData();
        let walletMsg = '';
        const student = studentById.get(Number(selectedStudentId));
        if ((finalStatus === 'present' || finalStatus === 'late') && student) {
          const wallet = computeWalletBalance(student, fresh.records, fresh.payments);
          if (wallet) {
            walletMsg = `| رصيد المحفظة: ${wallet.balance} ج.م`;
            if (wallet.low) {
              walletMsg += `⚠️ رصيد منخفض!`;
            }
          }
        }
        setSuccess(`تم تسجيل الحضور بنجاح.${walletMsg}`);
        setLastRecord({
          studentId: Number(selectedStudentId),
          status: finalStatus,
          date: selectedDate,
        });
        setDraftMessage(
          attendanceMessage(
            studentById.get(Number(selectedStudentId))?.name || 'الطالب',
            finalStatus,
            selectedDate
          )
        );
        if (student) {
          addAuditLog('create', student, selectedDate, null, finalStatus, null, reason || '', selectedGroup);
        }
        setSelectedStudentId('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل الحضور.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async (id: number, status: AttendanceStatus) => {
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      await updateAttendance(id, status);
      await loadData();
      setSuccess('تم تحديث حالة الحضور.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحديث حالة الحضور.');
    } finally {
      setSaving(false);
    }
  };

  /* ✅ دالة تأكيد الحذف عبر Modal مخصص */
  const handleConfirmDelete = async () => {
    if (!recordToDelete) return;
    setDeleteLoading(true);
    setError('');
    setSuccess('');
    try {
      await deleteAttendance(recordToDelete.id);
      if (editingRecord?.id === recordToDelete.id) resetEditing();
      await loadData();
      setSuccess('تم حذف سجل الحضور بنجاح.');
      setRecordToDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف سجل الحضور.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleScanSuccess = useCallback(
    async (decodedText: string) => {
      const code = decodedText.trim().toLowerCase();
      const student = students.find((s) => s.barcode?.trim().toLowerCase() === code);
      if (!student) {
        playBeep(220, 300);
        setError(`الكود المقروء (${decodedText}) لا يطابق أي طالب.`);
        return;
      }
      setError('');
      setSuccess('');
      setSaving(true);
      try {
        const { status, lateMinutes, isAutoAbsent } = calculateAttendanceStatus(selectedDate);
        const reason = lateMinutes
          ? `تأخير ${lateMinutes} دقيقة (تم حسابه آلياً)`
          : isAutoAbsent
          ? 'غياب آلي (تجاوز وقت نهاية الحصة)'
          : '';
        await addAttendance({
          student_id: student.id,
          date: selectedDate,
          status,
          reason: reason || null,
        });
        const fresh = await loadData();
        playBeep(880);
        let walletMsg = '';
        if (status === 'present' || status === 'late') {
          const wallet = computeWalletBalance(student, fresh.records, fresh.payments);
          if (wallet) {
            walletMsg = `| رصيد المحفظة: ${wallet.balance} ج.م`;
            if (wallet.low) {
              walletMsg += `⚠️ رصيد منخفض!`;
            }
          }
        }
        const statusText =
          status === 'late'
            ? `متأخر ${lateMinutes} دقيقة`
            : status === 'absent'
            ? 'غائب (آلي)'
            : 'حاضر';
        setSuccess(`تم تسجيل ${student.name}: ${statusText}${walletMsg}`);
        setLastRecord({ studentId: student.id, status, date: selectedDate });
        setDraftMessage(attendanceMessage(student.name, status, selectedDate));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'تعذر تسجيل الحضور.');
      } finally {
        setSaving(false);
      }
    },
    [students, selectedDate, loadData, calculateAttendanceStatus, computeWalletBalance]
  );

  const handleStageChange = (stage: string) => {
    setFilterStage(stage);
    setFilterGrade('الكل');
    setFilterSubject('الكل');
    setSelectedGroup('');
  };

  const handleGradeChange = (grade: string) => {
    setFilterGrade(grade);
    setFilterSubject('الكل');
    setSelectedGroup('');
  };

  const handleSubjectChange = (subject: string) => {
    setFilterSubject(subject);
    setSelectedGroup('');
  };

  const setStudentStatus = (studentId: number, status: AttendanceStatus) => {
    let finalStatus = status;
    let autoReason = '';
    if (status === 'present') {
      const { status: calculatedStatus, lateMinutes, isAutoAbsent } =
        calculateAttendanceStatus(selectedDate);
      finalStatus = calculatedStatus;
      if (lateMinutes) {
        autoReason = `تأخير ${lateMinutes} دقيقة (تم حسابه آلياً)`;
      } else if (isAutoAbsent) {
        autoReason = 'غياب آلي (تجاوز وقت نهاية الحصة)';
      }
    }
    const student = studentById.get(studentId);
    const oldStatus = groupStatuses[studentId];
    const oldReason = groupReasons[studentId];
    setGroupStatuses((prev) => ({ ...prev, [studentId]: finalStatus }));
    if (autoReason) {
      setGroupReasons((prev) => ({ ...prev, [studentId]: autoReason }));
    }
    if (status === 'absent' || (status === 'present' && !autoReason)) {
      setGroupReasons((prev) => ({ ...prev, [studentId]: '' }));
    }
    if (student && oldStatus !== finalStatus) {
      addAuditLog('update', student, selectedDate, oldStatus, finalStatus, oldReason, autoReason || groupReasons[studentId] || '', selectedGroup);
    }
  };

  const setStudentReason = (studentId: number, reason: string) => {
    setGroupReasons((prev) => ({ ...prev, [studentId]: reason }));
  };

  const markAllPresent = () => {
    const init: Record<number, AttendanceStatus> = {};
    const initReasons: Record<number, string> = {};
    groupStudents.forEach((s) => {
      const { status: calculatedStatus, lateMinutes, isAutoAbsent } =
        calculateAttendanceStatus(selectedDate);
      init[s.id] = calculatedStatus;
      if (lateMinutes) {
        initReasons[s.id] = `تأخير ${lateMinutes} دقيقة (تم حسابه آلياً)`;
      } else if (isAutoAbsent) {
        initReasons[s.id] = 'غياب آلي (تجاوز وقت نهاية الحصة)';
      }
    });
    setGroupStatuses(init);
    setGroupReasons(initReasons);
  };

  const markAllAbsent = () => {
    const init: Record<number, AttendanceStatus> = {};
    groupStudents.forEach((s) => {
      init[s.id] = 'absent';
    });
    setGroupStatuses(init);
  };

  const bulkErrorMessage = (err: unknown): string => {
    const raw = err instanceof Error ? err.message : 'تعذر حفظ حضور المجموعة.';
    if (/unique or exclusion constraint|on conflict/i.test(raw)) {
      return `${raw} — تأكد من تنفيذ سكريبت 03_attendance_unique.sql في Supabase.`;
    }
    return raw;
  };

  const handleSaveGroupAttendance = async () => {
    if (!selectedDate || !selectedGroup || groupStudents.length === 0) {
      setError('يرجى اختيار المرحلة والمجموعة والتاريخ أولاً.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const inputs = groupStudents.map((s) => {
        const status = groupStatuses[s.id] ?? ('present' as AttendanceStatus);
        const reason =
          status === 'late' || status === 'excused' ? groupReasons[s.id] || '' : '';
        return {
          student_id: s.id,
          date: selectedDate,
          status,
          reason: reason || null,
        };
      });
      const { saved } = await addAttendanceBulk(inputs);
      clearPending();
      setPendingOffline(0);
      const fresh = await loadData();
      let walletDeducted = 0;
      let lowBalanceAlerts = 0;
      let auditCount = 0;
      groupStudents.forEach((s) => {
        const status = groupStatuses[s.id] ?? ('present' as AttendanceStatus);
        if (status === 'present' || status === 'late') {
          const wallet = computeWalletBalance(s, fresh.records, fresh.payments);
          if (wallet) {
            walletDeducted++;
            if (wallet.low) lowBalanceAlerts++;
          }
        }
        addAuditLog('bulk_save', s, selectedDate, null, status, null, groupReasons[s.id] || '', selectedGroup);
        auditCount++;
      });
      let successMsg = `تم حفظ حضور المجموعة بالكامل (${saved} طالب).`;
      if (walletDeducted > 0) {
        successMsg += `تم احتساب ${walletDeducted} حصة على أرصدة الطلاب الفعلية.`;
      }
      if (lowBalanceAlerts > 0) {
        successMsg += `⚠️ ${lowBalanceAlerts} طالب وصل رصيده لحد التنبيه!`;
      }
      if (auditCount > 0) {
        successMsg += `تم تسجيل ${auditCount} عملية في سجل التدقيق.`;
      }
      setSuccess(successMsg);
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'تعذر حفظ حضور المجموعة.';
      if (/failed to fetch|networkerror|load failed|fetch failed/i.test(raw)) {
        const inputs = groupStudents.map((s) => ({
          student_id: s.id,
          date: selectedDate,
          status: groupStatuses[s.id] ?? ('present' as AttendanceStatus),
          reason:
            (groupStatuses[s.id] === 'late' || groupStatuses[s.id] === 'excused'
              ? groupReasons[s.id]
              : '') || null,
        }));
        savePending(inputs);
        setPendingOffline(inputs.length);
        setError('⚠️ لا يوجد اتصال — تم حفظ الحضور محلياً وسيُرفع تلقائياً فور عودة الشبكة.');
        return;
      }
      setError(bulkErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleListKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (filteredGroupStudents.length === 0) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setFocusedIdx((i) => (i + 1) % filteredGroupStudents.length);
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      e.preventDefault();
      setFocusedIdx((i) => (i - 1 + filteredGroupStudents.length) % filteredGroupStudents.length);
      return;
    }
    const target = filteredGroupStudents[focusedIdx];
    if (!target) return;
    const keyStatus: Record<string, AttendanceStatus> = {
      ح: 'present',
      غ: 'absent',
      ت: 'late',
      ب: 'excused',
    };
    const status = keyStatus[e.key];
    if (status) {
      e.preventDefault();
      setStudentStatus(target.id, status);
    }
  };

  const handlePrintRoster = () => {
    setPrintMode(true);
    const cleanup = () => {
      setPrintMode(false);
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(() => window.print(), 100);
  };

  const exportAttendanceCSV = () => {
    if (!selectedGroup || groupStudents.length === 0) return;
    const headers = ['الطالب', 'الكود', 'الصف', 'المادة', 'المجموعة', 'الحالة', 'السبب', 'التاريخ'];
    const rows = filteredGroupStudents.map((student) => {
      const manualStatus = groupStatuses[student.id];
      const autoCalc = autoCalculatedStatuses[student.id];
      const effectiveStatus = manualStatus ?? autoCalc?.status ?? 'present';
      const reason = groupReasons[student.id] || '';
      return [
        student.name,
        student.barcode || '',
        student.grade || '',
        student.subject || '',
        student.group_name || '',
        statusLabels[effectiveStatus] || effectiveStatus,
        reason,
        formatDateDisplay(selectedDate),
      ];
    });
    const csvContent = [
      headers.map(csvCell).join(','),
      ...rows.map((r) => r.map(csvCell).join(',')),
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `attendance_${selectedGroup}_${selectedDate}.csv`;
    link.click();
  };

  const printStudentIDCards = () => {
    if (!selectedGroup || groupStudents.length === 0) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const cardsHtml = filteredGroupStudents
      .map((student) => {
        const barcode = student.barcode || student.student_code || student.id.toString();
        return `<div class="id-card" style="width: 3.375in; height: 2.125in; border: 2px solid #333; border-radius: 8px; padding: 12px; margin: 8px; float: right; font-family: Arial, sans-serif; direction: rtl; page-break-inside: avoid;"><div style="text-align: center; margin-bottom: 10px;"><div style="font-size: 14px; font-weight: bold; color: #1e40af;">مركز EduCore التعليمي</div><div style="font-size: 10px; color: #666;">بطاقة هوية الطالب</div></div><hr style="border: 1px solid #ddd; margin: 8px 0;"><div style="display: flex; justify-content: space-between; margin: 5px 0;"><span style="font-weight: bold;">الاسم:</span><span>${escapeHtml(student.name)}</span></div><div style="display: flex; justify-content: space-between; margin: 5px 0;"><span style="font-weight: bold;">الكود:</span><span>${escapeHtml(barcode)}</span></div><div style="display: flex; justify-content: space-between; margin: 5px 0;"><span style="font-weight: bold;">الصف:</span><span>${escapeHtml(student.grade || '—')}</span></div><div style="display: flex; justify-content: space-between; margin: 5px 0;"><span style="font-weight: bold;">المادة:</span><span>${escapeHtml(student.subject || '—')}</span></div><div style="display: flex; justify-content: space-between; margin: 5px 0;"><span style="font-weight: bold;">المجموعة:</span><span>${escapeHtml(student.group_name || '—')}</span></div><div style="margin-top: 10px; text-align: center;"><svg id="barcode-${student.id}" style="width: 100%; height: 40px;"></svg></div></div>`;
      })
      .join('');
    const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>بطاقات الطلاب - ${escapeHtml(selectedGroup)}</title><script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script><style>@media print { .id-card { page-break-inside: avoid; } @page { size: auto; margin: 5mm; } }</style></head><body style="font-family: Arial, sans-serif; padding: 10px;">${cardsHtml}<script>document.querySelectorAll('[id^="barcode-"]').forEach(el => { const id = el.id.replace('barcode-', ''); const student = ${JSON.stringify(filteredGroupStudents).replace(/</g, '\\u003c')}.find(s => s.id === parseInt(id)); if (student) { JsBarcode(el, student.barcode || student.student_code || student.id.toString(), { format: 'CODE128', width: 1.5, height: 30, displayValue: true, fontSize: 10 }); } }); window.onload = () => window.print();<\/script></body></html>`;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  /* ═══════════════════════════════════════════════════════════
     6) كلاسات CSS المشتركة
  ════════════════════════════════════════════════════════════ */
  const cardClass =
    'rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800';
  const headingClass = 'text-xl font-black text-slate-800 dark:text-slate-100';
  const subTextClass = 'mt-1 text-xs text-slate-500 dark:text-slate-400';
  const labelTextClass = 'text-xs font-bold text-slate-600 dark:text-slate-300';
  const inputClass =
    'mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
  const segInactiveClass =
    'px-4 py-2 rounded-xl text-xs font-bold transition text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white';
  const quietButtonClass =
    'rounded-2xl bg-slate-100 px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600';
  const toolbarBtnClass =
    'rounded-2xl px-4 py-2.5 text-xs font-bold transition disabled:opacity-50 flex items-center justify-center gap-1.5 min-h-[42px]';
  const toolbarBtnPrimary =
    'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm';
  const toolbarBtnSuccess =
    'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm';
  const toolbarBtnDanger =
    'bg-rose-600 text-white hover:bg-rose-700 shadow-sm';
  const toolbarBtnSecondary =
    'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600';

  /* ═══════════════════════════════════════════════════════════
     7) JSX
  ════════════════════════════════════════════════════════════ */
  return (
    <div className="w-full space-y-6" dir="rtl">
      <div className={cardClass}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div>
            <h2 className={headingClass}>حضور الطلاب</h2>
            <p className={subTextClass}>
              تحضير المجموعة كاملة بضغطة واحدة، أو مسح باركود، أو الإدخال اليدوي
            </p>
          </div>
          <div className="flex rounded-2xl bg-slate-100 p-1 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => { setInputMode('group'); resetEditing(); }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition ${inputMode === 'group' ? 'bg-indigo-600 text-white shadow-sm' : segInactiveClass}`}
            >
              👥 تحضير مجموعة
            </button>
            <button
              type="button"
              onClick={() => { setInputMode('scan'); resetEditing(); }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition ${inputMode === 'scan' ? 'bg-indigo-600 text-white shadow-sm' : segInactiveClass}`}
            >
              📸 مسح باركود
            </button>
            <button
              type="button"
              onClick={() => { setInputMode('manual'); resetEditing(); }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition ${inputMode === 'manual' ? 'bg-indigo-600 text-white shadow-sm' : segInactiveClass}`}
            >
              ✍️ إدخال يدوي
            </button>
            <button
              type="button"
              onClick={() => { setInputMode('analytics'); resetEditing(); }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition ${inputMode === 'analytics' ? 'bg-indigo-600 text-white shadow-sm' : segInactiveClass}`}
            >
              📊 تحليلات الحضور
            </button>
          </div>
        </div>

        {editingRecord && (
          <div className="mb-4 flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
            <span className="text-xs font-bold text-amber-800 dark:text-amber-300">
              ✏️ وضع التعديل: سجل #{editingRecord.id} — عدّل البيانات ثم اضغط حفظ
            </span>
            <button
              type="button"
              onClick={resetEditing}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
            >
              إلغاء التعديل
            </button>
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-2xl bg-rose-50 p-3 text-xs font-bold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">{error}</div>
        )}

        {success && (
          <div className="mb-4 rounded-2xl bg-emerald-50 p-3 text-xs font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">{success}</div>
        )}

        {lastRecord && inputMode !== 'group' && (
          <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-800 dark:bg-emerald-950/30">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                ✉️ إشعار ولي الأمر عبر واتساب — يمكنك تعديل نص الرسالة قبل الإرسال:
              </span>
            </div>
            <textarea
              value={draftMessage}
              onChange={(e) => setDraftMessage(e.target.value)}
              rows={5}
              className="w-full resize-y rounded-2xl border border-slate-200 bg-white p-3 text-xs font-bold leading-relaxed text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const phone =
                    studentById.get(lastRecord.studentId)?.guardian_whatsapp ||
                    studentById.get(lastRecord.studentId)?.guardian_phone;
                  if (!openWhatsApp(phone, draftMessage)) {
                    setError('لا يوجد رقم واتساب صالح لولي الأمر لهذا الطالب.');
                  }
                }}
                className="rounded-2xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white transition hover:bg-emerald-700"
              >
                💬 إرسال الآن
              </button>
              <button type="button" onClick={() => setLastRecord(null)} className={quietButtonClass}>
                لاحقاً
              </button>
            </div>
          </div>
        )}

        {inputMode === 'group' && (
          <div className="space-y-4">
            <div className="sticky top-2 z-20 -mx-2 mb-1 rounded-2xl border border-slate-200/70 bg-white/95 p-3 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-800/95">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-5 mb-3 pt-2 pb-2 border-b border-slate-200/50 dark:border-slate-700/50">
                <label className={labelTextClass}>
                  بداية الحصة
                  <input type="time" value={classStartTime} onChange={(e) => setClassStartTime(e.target.value)} className={inputClass} />
                </label>
                <label className={labelTextClass}>
                  نهاية الحصة
                  <input type="time" value={classEndTime} onChange={(e) => setClassEndTime(e.target.value)} className={inputClass} />
                </label>
                <label className={labelTextClass}>
                  حد التأخير (دقيقة)
                  <input type="number" min="0" max="60" value={lateThresholdMinutes} onChange={(e) => setLateThresholdMinutes(Number(e.target.value) || 0)} className={inputClass} />
                </label>
                <div className="flex items-end">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    الطلاب غير المسجلين بعد نهاية الحصة ← غائب آلياً
                  </span>
                </div>
                <div className="flex items-end">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    بعد {classStartTime} + {lateThresholdMinutes} د ← متأخر آلياً
                  </span>
                </div>
              </div>

              {/* ✅ شارة التنبيه الزمني الديناميكية */}
              {selectedGroup && (
                <div className="mb-3 flex flex-col justify-center gap-1.5">
                  <div
                    className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-bold transition-colors duration-300 ${timeStatus.badgeClass}`}
                  >
                    <span className="relative flex h-2.5 w-2.5">
                      {timeStatus.status === 'ongoing' && (
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                      )}
                      <span
                        className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                          timeStatus.status === 'before'
                            ? 'bg-blue-500'
                            : timeStatus.status === 'ongoing'
                            ? 'bg-emerald-500'
                            : 'bg-orange-500'
                        }`}
                      ></span>
                    </span>
                    <span>{timeStatus.icon} {timeStatus.label}</span>
                  </div>

                  {timeStatus.status === 'ongoing' && (
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-950/50">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all duration-700 ease-linear"
                        style={{ width: `${timeStatus.progressPercent}%` }}
                      />
                    </div>
                  )}

                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                    🕐 موعد الحصة: {formatTimeDisplay(classStartTime)} - {formatTimeDisplay(classEndTime)}
                    {' '}| الحد المسموح للتأخير: {lateThresholdMinutes} د
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6 mb-3">
                <label className={labelTextClass}>
                  المرحلة التعليمية
                  <select value={filterStage} onChange={(e) => handleStageChange(e.target.value)} className={inputClass}>
                    <option value="الكل">كل المراحل</option>
                    {stages.map((stage) => (
                      <option key={stage} value={stage}>{stage}</option>
                    ))}
                  </select>
                </label>
                <label className={labelTextClass}>
                  الصف الدراسي
                  <select value={filterGrade} onChange={(e) => handleGradeChange(e.target.value)} className={inputClass}>
                    <option value="الكل">كل الصفوف</option>
                    {gradeOptions.map((grade) => (
                      <option key={grade} value={grade}>{grade}</option>
                    ))}
                  </select>
                </label>
                <label className={labelTextClass}>
                  المادة الدراسية
                  <select value={filterSubject} onChange={(e) => handleSubjectChange(e.target.value)} className={inputClass}>
                    <option value="الكل">كل المواد</option>
                    {subjectOptions.map((subject) => (
                      <option key={subject} value={subject}>{subject}</option>
                    ))}
                  </select>
                </label>
                <label className={labelTextClass}>
                  المجموعة
                  <select value={selectedGroup} onChange={(e) => setSelectedGroup(e.target.value)} className={inputClass}>
                    <option value="">-- اختر المجموعة --</option>
                    {groupOptions.map((group) => (
                      <option key={group} value={group}>{group}</option>
                    ))}
                  </select>
                </label>
                <label className={labelTextClass}>
                  التاريخ
                  <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className={inputClass} />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={markAllPresent} disabled={!selectedGroup || groupStudents.length === 0 || saving} className={`${toolbarBtnClass} ${toolbarBtnSuccess}`} aria-label="تعيين جميع الطلاب كحاضرين">
                  ✓ الكل حاضر
                </button>
                <button type="button" onClick={markAllAbsent} disabled={!selectedGroup || groupStudents.length === 0 || saving} className={`${toolbarBtnClass} ${toolbarBtnDanger}`} aria-label="تعيين جميع الطلاب كغائبين">
                  ✗ الكل غائب
                </button>

                {/* ✅ زر الإشعار مع Tooltip توضيحي */}
                <div className="relative group/notify">
                  <button
                    type="button"
                    onClick={() => void handleSendBulkWhatsApp()}
                    disabled={bulkWhatsAppSending || !selectedGroup || groupStudents.length === 0}
                    className={`${toolbarBtnClass} ${toolbarBtnPrimary} flex items-center gap-1.5`}
                    aria-label="إرسال إشعار واتساب جماعي لأولياء أمور الطلاب الغائبين والمتأخرين"
                  >
                    {bulkWhatsAppSending ? (
                      <>
                        <span className="animate-spin inline-block">⏳</span>
                        جاري الإرسال...
                      </>
                    ) : (
                      <>📱 إشعار الغائبين/المتأخرين</>
                    )}
                  </button>

                  <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 opacity-0 transition-opacity duration-200 group-hover/notify:opacity-100">
                    <div className="whitespace-nowrap rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-bold text-white shadow-xl dark:bg-slate-700">
                      💬 إرسال رسائل واتساب تلقائية لأولياء الأمور
                    </div>
                    <div className="mx-auto h-2 w-2 -translate-y-1 rotate-45 bg-slate-900 dark:bg-slate-700"></div>
                  </div>
                </div>

                <button type="button" onClick={handlePrintRoster} disabled={!selectedGroup || groupStudents.length === 0} className={`${toolbarBtnClass} ${toolbarBtnSecondary}`} aria-label="طباعة كشف الحضور">
                  🖨️ طباعة الكشف
                </button>
                <button type="button" onClick={exportAttendanceCSV} disabled={!selectedGroup || groupStudents.length === 0} className={`${toolbarBtnClass} ${toolbarBtnSecondary}`} aria-label="تصدير الحضور CSV">
                  📥 تصدير CSV
                </button>
                <button type="button" onClick={printStudentIDCards} disabled={!selectedGroup || groupStudents.length === 0} className={`${toolbarBtnClass} ${toolbarBtnSecondary}`} aria-label="طباعة كارنيهات الطلاب">
                  🪪 بطاقات الطلاب
                </button>
                <button type="button" onClick={() => setFinOnly((v) => !v)} aria-pressed={finOnly} className={`${toolbarBtnClass} ${finOnly ? toolbarBtnDanger : toolbarBtnSecondary}`} aria-label="تصفية المتأخرين مالياً فقط">
                  🔴 المتأخرون مالياً
                </button>
              </div>
            </div>

            {/* ✅ حقل البحث السريع */}
            {selectedGroup && groupStudents.length > 0 && (
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400 dark:text-slate-500">
                  🔍
                </span>
                <input
                  type="text"
                  value={quickSearch}
                  onChange={(e) => setQuickSearch(e.target.value)}
                  placeholder="ابحث سريعاً بالاسم أو الكود..."
                  aria-label="البحث السريع في طلاب المجموعة"
                  className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pr-10 pl-9 text-xs font-bold text-slate-800 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-indigo-900/50"
                />
                {quickSearch && (
                  <button
                    type="button"
                    onClick={() => setQuickSearch('')}
                    aria-label="مسح البحث"
                    className="absolute inset-y-0 left-2 flex items-center rounded-lg px-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                  >
                    ✕
                  </button>
                )}
              </div>
            )}

            {selectedGroup && quickSearch.trim() && (
              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                🔎 نتائج البحث: {searchFilteredStudents.length} من أصل {filteredGroupStudents.length} طالب
              </p>
            )}

            {!selectedGroup && (
              <div className="rounded-3xl border-2 border-dashed border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 p-12 text-center dark:border-amber-800/50 dark:from-slate-800 dark:via-slate-800 dark:to-slate-900">
                <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-4xl shadow-lg shadow-amber-200/50 dark:shadow-amber-900/30">
                  📋
                </div>
                <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 mb-2">
                  ابدأ بتحضير مجموعتك
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 max-w-md mx-auto leading-relaxed">
                  اختر <strong className="text-amber-600 dark:text-amber-400">المرحلة</strong> ← ثم{' '}
                  <strong className="text-orange-600 dark:text-orange-400">الصف الدراسي</strong> ← ثم{' '}
                  <strong className="text-rose-600 dark:text-rose-400">المجموعة</strong>
                  <br />
                  لعرض قائمة الطلاب وتحضير الحضور فوراً
                </p>
                <div className="flex items-center justify-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                  <span className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 shadow-sm dark:bg-slate-700">
                    <span className="h-2 w-2 rounded-full bg-amber-400"></span> المرحلة
                  </span>
                  <span>←</span>
                  <span className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 shadow-sm dark:bg-slate-700">
                    <span className="h-2 w-2 rounded-full bg-orange-400"></span> الصف
                  </span>
                  <span>←</span>
                  <span className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 shadow-sm dark:bg-slate-700">
                    <span className="h-2 w-2 rounded-full bg-rose-400"></span> المجموعة
                  </span>
                </div>
              </div>
            )}

            {selectedGroup && groupStudents.length === 0 && (
              <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 p-10 text-center dark:border-slate-700 dark:bg-slate-800/50">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-200 text-3xl dark:bg-slate-700">
                  👥
                </div>
                <h3 className="text-base font-bold text-slate-700 dark:text-slate-200 mb-1">لا يوجد طلاب في هذه المجموعة</h3>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  تأكد من إضافة طلاب لهذه المجموعة من شاشة إدارة الطلاب
                </p>
              </div>
            )}

            {selectedGroup && groupStudents.length > 0 && (
              <>
                <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-slate-50 p-3 dark:bg-slate-900">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                    {groupStudents.length} طالب:
                  </span>
                  <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                    ✓ {groupSummary.present} حاضر
                  </span>
                  <span className="rounded-lg bg-rose-50 px-2.5 py-1 text-[11px] font-black text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                    ✗ {groupSummary.absent} غائب
                  </span>
                  <span className="rounded-lg bg-amber-50 px-2.5 py-1 text-[11px] font-black text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                    ⏰ {groupSummary.late} متأخر
                  </span>
                  <span className="rounded-lg bg-sky-50 px-2.5 py-1 text-[11px] font-black text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
                    📝 {groupSummary.excused} بعذر
                  </span>
                  <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />
                  <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                    💳 {finCounts.paid} مسدد
                  </span>
                  <span className="rounded-lg bg-rose-50 px-2.5 py-1 text-[11px] font-black text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                    ⚠️ {finCounts.lateFin} متأخر مالياً
                  </span>
                  {pendingOffline > 0 && (
                    <span className="rounded-lg bg-amber-100 px-2.5 py-1 text-[11px] font-black text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                      📡 {pendingOffline} سجل بانتظار المزامنة
                    </span>
                  )}
                </div>

                <div
                  tabIndex={0}
                  onKeyDown={handleListKeyDown}
                  className={`grid grid-cols-1 gap-3 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-400 lg:grid-cols-2 ${printMode ? 'print-area p-2' : ''}`}
                >
                  {printMode && (
                    <div className="col-span-full mb-2 hidden text-center print:block">
                      <h2 className="text-xl font-black">كشف حضور المجموعة: {selectedGroup}</h2>
                      <p className="mt-1 text-sm font-bold">تاريخ: {formatDateDisplay(selectedDate)}</p>
                      <div className="mt-3 grid grid-cols-2 text-right text-xs font-bold">
                        <span>اسم الطالب</span>
                        <span>التوقيع / ملاحظات</span>
                      </div>
                    </div>
                  )}

                  {searchFilteredStudents.length === 0 ? (
                    <p className="col-span-full rounded-2xl bg-slate-50 p-6 text-center text-xs font-bold text-slate-400 dark:bg-slate-900 dark:text-slate-500">
                      {quickSearch.trim()
                        ? `لا توجد نتائج مطابقة لـ "${quickSearch}"`
                        : 'لا يوجد طلاب مطابقون للتصفية الحالية.'}
                    </p>
                  ) : (
                    searchFilteredStudents.map((student, idx) => {
                      const manualStatus = groupStatuses[student.id];
                      const autoCalc = autoCalculatedStatuses[student.id];
                      const effectiveStatus = manualStatus ?? autoCalc?.status ?? 'present';
                      const lateMinutes = autoCalc?.lateMinutes;
                      const isAutoCalculated = !manualStatus && !!autoCalc;
                      const netDue = student.isExempt
                        ? 0
                        : Math.max(0, (student.dueAmount ?? 0) - (student.discountAmount ?? 0));
                      const notifyStatus: AttendanceStatus | null =
                        effectiveStatus === 'absent' || effectiveStatus === 'late' ? effectiveStatus : null;
                      const streak = absentStreak.get(student.id) ?? 0;
                      const isFocused = idx === focusedIdx;
                      const showReason = effectiveStatus === 'late' || effectiveStatus === 'excused';
                      return (
                        <div
                          key={student.id}
                          ref={(el) => { cardRefs.current[idx] = el; }}
                          className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-white p-3 transition dark:bg-slate-900 ${isFocused ? 'border-indigo-500 ring-2 ring-indigo-300 dark:ring-indigo-700' : 'border-slate-200 hover:border-indigo-300 dark:border-slate-700 dark:hover:border-indigo-600'} ${isAutoCalculated ? 'bg-amber-50/30 dark:bg-amber-950/20' : ''}`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="truncate text-xs font-black text-slate-800 dark:text-slate-100">
                                {idx + 1}. {student.name}
                              </span>
                              {streak >= 2 && (
                                <span title={`غياب متكرر: ${streak} مرات متتالية`} className="shrink-0 animate-pulse rounded-md bg-red-600 px-1.5 py-0.5 text-[9px] font-black text-white">
                                  ⚠️ غياب متكرر ×{streak}
                                </span>
                              )}
                              {netDue > 0 ? (
                                <span title={`مطلوب منه ${netDue} ج.م`} className="shrink-0 rounded-md bg-rose-100 px-1.5 py-0.5 text-[9px] font-black text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                                  متأخر
                                </span>
                              ) : (
                                <span title="منتظم سداداً" className="shrink-0 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[9px] font-black text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                                  مسدد
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
                                <span className="text-[10px] text-slate-400 dark:text-slate-500">{student.grade}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            {notifyStatus && (
                              <WhatsAppButton
                                phone={student.guardian_whatsapp || student.guardian_phone}
                                message={attendanceMessage(student.name, notifyStatus, selectedDate) + (lateMinutes ? `\n⏱️ دقائق التأخير: ${lateMinutes}` : '')}
                                label="💬 "
                                className="text-[10px]"
                              />
                            )}
                            <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                              {STATUS_ORDER.map((s) => (
                                <button
                                  key={s}
                                  type="button"
                                  onClick={() => setStudentStatus(student.id, s)}
                                  aria-pressed={effectiveStatus === s}
                                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-black transition ${effectiveStatus === s ? statusActiveClass[s] : statusInactiveClass[s]}`}
                                >
                                  {statusIcons[s]} {statusLabels[s]}
                                </button>
                              ))}
                            </div>
                          </div>
                          {showReason && (
                            <input
                              type="text"
                              value={groupReasons[student.id] ?? ''}
                              onChange={(e) => setStudentReason(student.id, e.target.value)}
                              placeholder={effectiveStatus === 'late' ? '⏰ سبب التأخير (يُحفظ مع السجل)...' : '📝 سبب العذر (يُحفظ مع السجل)...'}
                              className="w-full lg:w-64 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-bold text-slate-700 focus:border-amber-400 focus:outline-none dark:border-amber-800 dark:bg-amber-950/30 dark:text-slate-200"
                            />
                          )}
                          {isAutoCalculated && !showReason && (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">محسوب آلياً</span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-[10px] font-bold text-slate-400">
                    {isDirty
                      ? '● توجد تغييرات غير محفوظة'
                      : 'لا توجد تغييرات — عدّل حالات الطلاب لتفعيل الحفظ'}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleSaveGroupAttendance()}
                    disabled={saving || loading || !isDirty}
                    className="rounded-2xl bg-indigo-600 px-8 py-3 text-xs font-black text-white transition hover:bg-indigo-700 disabled:opacity-50 shadow-sm"
                  >
                    {saving ? 'جاري الحفظ...' : `💾 حفظ حضور المجموعة (${groupStudents.length} طالب)`}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {inputMode === 'scan' && (
          <div className="space-y-4">
            <label className={`block max-w-md mx-auto ${labelTextClass}`}>
              تاريخ الحضور
              <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className={inputClass} />
            </label>
            <QRScanner key={scanKey} onScanSuccess={(code) => void handleScanSuccess(code)} />
            <div className="flex justify-center">
              <button type="button" onClick={() => setScanKey((k) => k + 1)} disabled={saving} className={quietButtonClass}>
                🔄 جاهز لمسح طالب آخر
              </button>
            </div>
          </div>
        )}

        {inputMode === 'manual' && (
          <form onSubmit={handleAddAttendance} className="grid grid-cols-1 items-end gap-4 md:grid-cols-4">
            <label className={labelTextClass}>
              الطالب
              <select value={selectedStudentId} onChange={(event) => setSelectedStudentId(event.target.value)} required className={inputClass}>
                <option value="">-- اختر طالبًا --</option>
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name}
                    {student.group_name ? ` (${student.group_name})` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelTextClass}>
              التاريخ
              <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} required className={inputClass} />
            </label>
            <label className={labelTextClass}>
              الحالة
              <select value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value as AttendanceStatus)} className={inputClass}>
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {statusIcons[s]} {statusLabels[s]}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={saving || loading}
              className="rounded-2xl bg-indigo-600 px-4 py-3 text-xs font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50 shadow-sm"
            >
              {saving ? 'جاري الحفظ...' : editingRecord ? '💾 حفظ التعديل' : 'تسجيل الحضور'}
            </button>
          </form>
        )}

        {inputMode === 'analytics' && (
          <div className="space-y-6">
            <div className={cardClass}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
                <div>
                  <h2 className={headingClass}>📊 تحليلات الحضور والغياب</h2>
                  <p className={subTextClass}>
                    إحصائيات تفصيلية لنسب الحضور، أكثر الطلاب غياباً/تأخيراً، والاتجاهات الزمنية
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <label className={labelTextClass}>
                    الفترة
                    <select value={analyticsPeriod} onChange={(e) => setAnalyticsPeriod(e.target.value as 'week' | 'month' | 'all')} className={inputClass}>
                      <option value="week">آخر أسبوع</option>
                      <option value="month">آخر شهر</option>
                      <option value="all">الكل</option>
                    </select>
                  </label>
                  <label className={labelTextClass}>
                    المجموعة
                    <select value={analyticsGroup} onChange={(e) => setAnalyticsGroup(e.target.value)} className={inputClass}>
                      <option value="الكل">كل المجموعات</option>
                      {groupOptions.map((g) => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-white p-4 rounded-2xl border border-emerald-200/80 dark:bg-slate-900 dark:border-emerald-800">
                  <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">معدل الحضور الإجمالي</p>
                  <h3 className="text-3xl font-black text-emerald-700 dark:text-emerald-300">{analyticsSummary.attendanceRate}%</h3>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-rose-200/80 dark:bg-slate-900 dark:border-rose-800">
                  <p className="text-xs font-bold text-rose-600 dark:text-rose-400">إجمالي الغياب</p>
                  <h3 className="text-3xl font-black text-rose-700 dark:text-rose-300">{analyticsSummary.totalAbsent}</h3>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-amber-200/80 dark:bg-slate-900 dark:border-amber-800">
                  <p className="text-xs font-bold text-amber-600 dark:text-amber-400">إجمالي التأخير</p>
                  <h3 className="text-3xl font-black text-amber-700 dark:text-amber-300">{analyticsSummary.totalLate}</h3>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-sky-200/80 dark:bg-slate-900 dark:border-sky-800">
                  <p className="text-xs font-bold text-sky-600 dark:text-sky-400">معذور</p>
                  <h3 className="text-3xl font-black text-sky-700 dark:text-sky-300">{analyticsSummary.totalExcused}</h3>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4 dark:border-rose-800 dark:bg-rose-950/20">
                  <h3 className="text-sm font-black text-rose-700 dark:text-rose-300 mb-3">🔴 أكثر الطلاب غياباً</h3>
                  {topAbsentStudents.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-4">لا يوجد بيانات</p>
                  ) : (
                    <ul className="space-y-2">
                      {topAbsentStudents.map((s, i) => (
                        <li key={s.student_id} className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-800 dark:text-slate-200">{i + 1}. {s.studentName}</span>
                          <span className="bg-rose-100 text-rose-700 px-2 py-0.5 rounded text-[10px] font-black dark:bg-rose-900/50 dark:text-rose-300">{s.count} غياب</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
                  <h3 className="text-sm font-black text-amber-700 dark:text-amber-300 mb-3">🟠 أكثر الطلاب تأخيراً</h3>
                  {topLateStudents.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-4">لا يوجد بيانات</p>
                  ) : (
                    <ul className="space-y-2">
                      {topLateStudents.map((s, i) => (
                        <li key={s.student_id} className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-800 dark:text-slate-200">{i + 1}. {s.studentName}</span>
                          <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[10px] font-black dark:bg-amber-900/50 dark:text-amber-300">{s.count} تأخير (إجمالي {s.totalMinutes} د)</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                <h3 className="text-sm font-black text-slate-700 dark:text-slate-200 mb-3">📈 الحضور حسب المجموعة</h3>
                <div className="space-y-2">
                  {groupAttendanceStats.map((g) => (
                    <div key={g.groupName} className="text-xs">
                      <div className="flex justify-between mb-1">
                        <span className="font-bold text-slate-700 dark:text-slate-200">{g.groupName}</span>
                        <span className="text-slate-500 dark:text-slate-400">{g.attendanceRate}% حضور</span>
                      </div>
                      <div className="h-2 bg-slate-200 rounded-full overflow-hidden dark:bg-slate-700">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${g.attendanceRate}%`,
                            backgroundColor: g.attendanceRate >= 80 ? '#10b981' : g.attendanceRate >= 60 ? '#f59e0b' : '#ef4444',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className={cardClass}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
                <div>
                  <h2 className={headingClass}>📋 سجل التدقيق (Audit Log)</h2>
                  <p className={subTextClass}>
                    تتبع جميع التعديلات على سجلات الحضور مع المستخدم والوقت والتفاصيل
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="border-b border-slate-100 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
                    <tr>
                      <th className="p-3 font-bold">الوقت</th>
                      <th className="p-3 font-bold">المستخدم</th>
                      <th className="p-3 font-bold">الإجراء</th>
                      <th className="p-3 font-bold">الطالب</th>
                      <th className="p-3 font-bold">الحالة السابقة</th>
                      <th className="p-3 font-bold">الحالة الجديدة</th>
                      <th className="p-3 font-bold">السبب</th>
                      <th className="p-3 font-bold">المجموعة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-xs font-bold text-slate-400 dark:text-slate-500">
                          لا توجد عمليات تدقيق مسجلة بعد
                        </td>
                      </tr>
                    ) : (
                      auditLogs.slice(0, 100).map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                          <td className="p-3 text-slate-600 dark:text-slate-300">
                            {new Date(log.timestamp).toLocaleString('ar-EG')}
                          </td>
                          <td className="p-3 font-bold text-slate-800 dark:text-slate-100">{log.userName}</td>
                          <td className="p-3">
                            <span
                              className={`rounded-lg px-2 py-1 text-[10px] font-black ${
                                log.action === 'create'
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                                  : log.action === 'update'
                                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
                                  : log.action === 'delete'
                                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300'
                                  : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300'
                              }`}
                            >
                              {log.action === 'create' ? 'إنشاء' : log.action === 'update' ? 'تعديل' : log.action === 'delete' ? 'حذف' : 'حفظ جماعي'}
                            </span>
                          </td>
                          <td className="p-3 font-bold text-slate-800 dark:text-slate-100">{log.studentName}</td>
                          <td className="p-3">
                            {log.oldStatus ? (
                              <span className={`rounded-lg px-2 py-1 text-[10px] font-black ${statusBadgeClass[log.oldStatus]}`}>
                                {statusLabels[log.oldStatus]}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="p-3">
                            <span className={`rounded-lg px-2 py-1 text-[10px] font-black ${statusBadgeClass[log.newStatus]}`}>
                              {statusLabels[log.newStatus]}
                            </span>
                          </td>
                          <td className="p-3 text-[11px] text-slate-600 dark:text-slate-400 max-w-[150px] truncate" title={log.newReason || ''}>
                            {log.newReason || '—'}
                          </td>
                          <td className="p-3 text-slate-600 dark:text-slate-300">{log.groupName}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* سجلات الحضور */}
      <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center justify-between border-b border-slate-100 p-6 dark:border-slate-700">
          <h3 className="text-base font-black text-slate-800 dark:text-slate-100">سجلات الحضور</h3>
          <button type="button" onClick={() => void loadData()} disabled={loading} className={quietButtonClass}>
            تحديث
          </button>
        </div>
        {loading ? (
          <div className="p-12 text-center text-xs font-bold text-slate-400 dark:text-slate-500">
            جاري تحميل سجلات الحضور...
          </div>
        ) : records.length === 0 ? (
          <div className="p-12 text-center text-xs font-bold text-slate-400 dark:text-slate-500">
            لا توجد سجلات حضور.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="border-b border-slate-100 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
                <tr>
                  <th className="p-4">الطالب</th>
                  <th className="p-4">التاريخ</th>
                  <th className="p-4">الحالة</th>
                  <th className="p-4">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {records.map((record) => {
                  const rowStudent = record.student_id ? studentById.get(record.student_id) : undefined;
                  const recordStatus = (record.status as AttendanceStatus) || 'present';
                  return (
                    <tr key={record.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/40">
                      <td className="p-4 font-bold text-slate-800 dark:text-slate-100">
                        {rowStudent?.name || (record.student_id ? `#${record.student_id}` : 'غير محدد')}
                      </td>
                      <td className="p-4 text-slate-600 dark:text-slate-300">
                        <span className="font-mono" dir="ltr">
                          {formatDateDisplay(record.date)}
                        </span>{' '}
                        {isRecordLocked(record) && <span title="سجل مقفل — مر أكثر من 24 ساعة">🔒</span>}
                      </td>
                      <td className="p-4">
                        <select
                          value={recordStatus}
                          onChange={(event) => void handleUpdateStatus(record.id, event.target.value as AttendanceStatus)}
                          disabled={saving || loading || isRecordLocked(record)}
                          title={record.reason || undefined}
                          className={`rounded-xl border px-2.5 py-1.5 text-[11px] font-black ${statusBadgeClass[recordStatus]} disabled:cursor-not-allowed disabled:opacity-60`}
                        >
                          {STATUS_ORDER.map((s) => (
                            <option key={s} value={s}>
                              {statusIcons[s]} {statusLabels[s]}
                            </option>
                          ))}
                        </select>
                        {record.reason && (
                          <div className="mt-1 max-w-[180px] truncate text-[10px] font-bold text-slate-400 dark:text-slate-500" title={record.reason}>
                            💬 {record.reason}
                          </div>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(record)}
                            disabled={saving || loading || isRecordLocked(record)}
                            title={isRecordLocked(record) ? 'مقفل — يتطلب صلاحية المدير' : 'تعديل السجل'}
                            className="rounded-2xl bg-indigo-50 px-3 py-2 text-[11px] font-bold text-indigo-600 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-indigo-950/60 dark:text-indigo-300 dark:hover:bg-indigo-900/60"
                          >
                            ✏️ تعديل
                          </button>
                          {(recordStatus === 'absent' || recordStatus === 'late') && (
                            <WhatsAppButton
                              phone={rowStudent?.guardian_whatsapp || rowStudent?.guardian_phone}
                              message={attendanceMessage(rowStudent?.name || 'الطالب', recordStatus, record.date || '')}
                              label="💬 إشعار"
                            />
                          )}
                          {/* ✅ زر الحذف يفتح Modal تأكيد بدلاً من الحذف المباشر */}
                          <button
                            type="button"
                            onClick={() => setRecordToDelete(record)}
                            disabled={saving || loading || isRecordLocked(record)}
                            title={isRecordLocked(record) ? 'مقفل — يتطلب صلاحية المدير' : 'حذف السجل'}
                            className="rounded-2xl bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-rose-950/60 dark:text-rose-300 dark:hover:bg-rose-900/60"
                          >
                            🗑️ حذف
                          </button>
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

      {/* ✅ Modal تأكيد حذف سجل الحضور */}
      {recordToDelete && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          onClick={() => !deleteLoading && setRecordToDelete(null)}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-rose-200 bg-white p-6 shadow-2xl dark:border-rose-900/50 dark:bg-slate-800"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-center mb-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-950/60 text-4xl animate-pulse">
                ⚠️
              </div>
            </div>
            <h3 className="text-center text-lg font-black text-slate-800 dark:text-slate-100 mb-2">
              تأكيد حذف سجل الحضور
            </h3>
            <p className="text-center text-sm text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">
              هل أنت متأكد من رغبتك في حذف هذا السجل؟
            </p>
            <div className="rounded-2xl bg-rose-50 dark:bg-rose-950/30 p-4 space-y-2 border border-rose-100 dark:border-rose-900/40 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">الطالب:</span>
                <span className="text-sm font-black text-slate-800 dark:text-slate-100">
                  {recordToDelete.student_id ? studentById.get(recordToDelete.student_id)?.name || `#${recordToDelete.student_id}` : 'غير محدد'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">التاريخ:</span>
                <span className="font-mono text-sm font-bold text-slate-700 dark:text-slate-200" dir="ltr">
                  {formatDateDisplay(recordToDelete.date)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">الحالة:</span>
                <span className={`rounded-lg px-2.5 py-1 text-[11px] font-black ${statusBadgeClass[(recordToDelete.status as AttendanceStatus) || 'present']}`}>
                  {statusLabels[(recordToDelete.status as AttendanceStatus) || 'present']}
                </span>
              </div>
              {recordToDelete.reason && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">السبب:</span>
                  <span className="text-sm text-slate-700 dark:text-slate-200">{recordToDelete.reason}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 mb-5">
              <span className="text-lg">⚠️</span>
              <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300 leading-tight">
                تحذير: هذه العملية لا يمكن التراجع عنها وسيتم حذف السجل نهائياً من قاعدة البيانات.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setRecordToDelete(null)}
                disabled={deleteLoading}
                className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                ❌ إلغاء
              </button>
              <button
                onClick={() => void handleConfirmDelete()}
                disabled={deleteLoading}
                className="flex-1 rounded-2xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50 flex items-center justify-center gap-2 transition"
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