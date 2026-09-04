import { supabase } from '@/lib/supabase';
import type { Attendance } from '@/types';

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export type AttendanceRecord = Attendance;

export interface AttendanceInput {
  student_id: number;
  date: string;
  status: AttendanceStatus;
  reason?: string | null;
}

/**
 * تحويل حالة الحضور من صيغة التطبيق العربية/الصغيرة
 * إلى الصيغة التي تفرضها قاعدة بيانات Supabase.
 */
const attendanceStatusToDatabase: Record<AttendanceStatus, 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'> = {
  present: 'PRESENT',
  absent: 'ABSENT',
  late: 'LATE',
  excused: 'EXCUSED',
};

/**
 * تحويل حالة الحضور القادمة من قاعدة البيانات
 * إلى الصيغة الموحدة المستخدمة داخل التطبيق.
 */
const attendanceStatusFromDatabase = (
  status: string | null
): AttendanceStatus | null => {
  if (!status) return null;

  const normalized = status.toLowerCase();

  if (
    normalized === 'present' ||
    normalized === 'absent' ||
    normalized === 'late' ||
    normalized === 'excused'
  ) {
    return normalized;
  }

  return null;
};

export async function getAttendance(): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
    .from('attendance')
    .select('id, student_id, date, status, reason, created_at')
    .order('date', { ascending: false })
    .order('id', { ascending: false });

  if (error) {
    throw error;
  }

  return ((data as AttendanceRecord[] | null) ?? []).map((record) => ({
    ...record,
    status: attendanceStatusFromDatabase(record.status),
  }));
}

export async function addAttendance(
  input: AttendanceInput
): Promise<void> {
  if (!Number.isSafeInteger(input.student_id) || input.student_id <= 0) {
    throw new Error('معرف الطالب غير صالح.');
  }

  if (!input.date) {
    throw new Error('تاريخ الحضور مطلوب.');
  }

  // فحص التكرار باستعلام موجّه (طالب + تاريخ) مطابق للقيد الفريد في الجدول
  const { data: duplicates, error: duplicateError } = await supabase
    .from('attendance')
    .select('id')
    .eq('student_id', input.student_id)
    .eq('date', input.date)
    .limit(1);

  if (duplicateError) {
    throw duplicateError;
  }

  if (duplicates && duplicates.length > 0) {
    throw new Error('يوجد سجل حضور لهذا الطالب في هذا التاريخ بالفعل.');
  }

  const { error } = await supabase
    .from('attendance')
    .insert([
      {
        student_id: input.student_id,
        date: input.date,
        status: attendanceStatusToDatabase[input.status],
        reason: input.reason?.trim() || null,
      },
    ]);

  if (error) {
    console.error('ATTENDANCE INSERT ERROR:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });

    throw error;
  }
}

export async function updateAttendance(
  id: number,
  status: AttendanceStatus
): Promise<void> {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error('معرف سجل الحضور غير صالح.');
  }

  const { error } = await supabase
    .from('attendance')
    .update({
      status: attendanceStatusToDatabase[status],
    })
    .eq('id', id);

  if (error) {
    throw error;
  }
}

export interface AttendanceUpdateInput {
  student_id?: number;
  date?: string;
  status?: AttendanceStatus;
  reason?: string | null;
}

/**
 * تعديل سجل حضور كامل (طالب / تاريخ / حالة).
 * يمنع تعديل التاريخ إلى يوم فيه سجل آخر لنفس الطالب.
 */
export async function updateAttendanceRecord(
  id: number,
  input: AttendanceUpdateInput
): Promise<void> {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error('معرف سجل الحضور غير صالح.');
  }

  const { data: existing, error: fetchError } = await supabase
    .from('attendance')
    .select('student_id, date')
    .eq('id', id)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!existing) throw new Error('سجل الحضور غير موجود.');

  const targetStudentId = input.student_id ?? existing.student_id;
  const targetDate = input.date ?? existing.date;

  if (
    (input.student_id !== undefined || input.date !== undefined) &&
    targetStudentId != null &&
    targetDate
  ) {
    const { data: duplicates, error: duplicateError } = await supabase
      .from('attendance')
      .select('id')
      .eq('student_id', targetStudentId)
      .eq('date', targetDate)
      .neq('id', id)
      .limit(1);

    if (duplicateError) throw duplicateError;
    if (duplicates && duplicates.length > 0) {
      throw new Error('يوجد سجل حضور آخر لنفس الطالب في هذا التاريخ.');
    }
  }

  const payload: Record<string, unknown> = {};
  if (input.student_id !== undefined) payload.student_id = input.student_id;
  if (input.date !== undefined) payload.date = input.date;
  if (input.status !== undefined) {
    payload.status = attendanceStatusToDatabase[input.status];
  }
  if (input.reason !== undefined) {
    payload.reason = input.reason?.trim() || null;
  }

  if (Object.keys(payload).length === 0) return;

  const { error } = await supabase
    .from('attendance')
    .update(payload)
    .eq('id', id);

  if (error) throw error;
}

/**
 * حفظ قائمة حضور كاملة دفعة واحدة (upsert).
 * السجلات الموجودة مسبقاً لنفس (الطالب + التاريخ) يتم تحديث حالتها،
 * والجديدة يتم إدراجها — كل ذلك في استعلام واحد.
 *
 * متطلب: قيد UNIQUE (student_id, date) على جدول attendance
 * — يُنشأ بسكريبت 03_attendance_unique.sql.
 */
export async function addAttendanceBulk(
  inputs: AttendanceInput[]
): Promise<{ saved: number }> {
  const valid = inputs.filter(
    (i) =>
      Number.isSafeInteger(i.student_id) &&
      i.student_id > 0 &&
      Boolean(i.date)
  );

  if (valid.length === 0) {
    return { saved: 0 };
  }

  const rows = valid.map((i) => ({
    student_id: i.student_id,
    date: i.date,
    status: attendanceStatusToDatabase[i.status],
    reason: i.reason?.trim() || null,
  }));

  const { data, error } = await supabase
    .from('attendance')
    .upsert(rows, {
      onConflict: 'student_id,date',
    })
    .select('id');

  if (error) throw error;

  const saved = (data as { id: number }[] | null)?.length ?? 0;
  return { saved };
}

export async function deleteAttendance(
  id: number
): Promise<void> {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error('معرف سجل الحضور غير صالح.');
  }

  const { error } = await supabase
    .from('attendance')
    .delete()
    .eq('id', id);

  if (error) {
    throw error;
  }
}