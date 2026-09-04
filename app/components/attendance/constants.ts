export const STATUS_ORDER = ['present', 'absent', 'late', 'excused'] as const;

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export const statusLabels: Record<AttendanceStatus, string> = {
  present: 'حاضر',
  absent: 'غائب',
  late: 'متأخر',
  excused: 'بعذر',
};

export const statusIcons: Record<AttendanceStatus, string> = {
  present: '✓',
  absent: '✗',
  late: '⏰',
  excused: '📝',
};

export const statusActiveClass: Record<AttendanceStatus, string> = {
  present: 'bg-emerald-600 text-white shadow-sm dark:bg-emerald-500',
  absent: 'bg-rose-600 text-white shadow-sm dark:bg-rose-500',
  late: 'bg-amber-500 text-white shadow-sm dark:bg-amber-400 dark:text-slate-900',
  excused: 'bg-sky-600 text-white shadow-sm dark:bg-sky-500',
};

export const statusInactiveClass: Record<AttendanceStatus, string> = {
  present: 'text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30',
  absent: 'text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30',
  late: 'text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30',
  excused: 'text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-950/30',
};

export const statusBadgeClass: Record<string, string> = {
  present: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300',
  absent: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300',
  late: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300',
  excused: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300',
};