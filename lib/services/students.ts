import { supabase } from '@/lib/supabase';
import type { Student as DatabaseStudent } from '@/types';

export interface ApplicationStudent {
  id: number;
  name: string;
  phone?: string | null;
  parent_phone?: string | null;
  group_name?: string | null;
  created_at?: string | null;
  grade?: string | null;
  student_code?: string | null;
  code?: string | null;
  behavior_rating?: string | null;
  discount_type?: string | null;
  discount?: number | null;
  discount_amount?: number | null;
  is_exempt?: boolean | null;
  subject?: string | null;
  due_amount?: number | null;
  stage?: string | null;
  grade_level?: string | null;
  subjects?: string[] | null;
  parent_whatsapp?: string | null;
  student_phone?: string | null;
  group: string;
  dueAmount: number;
  discountAmount: number;
  isExempt: boolean;
  barcode: string;
  guardian_name?: string;
  guardian_phone?: string | null;
  guardian_whatsapp?: string | null;
  guardian_notes?: string | null;
  address?: string | null;
  school?: string | null;
  exempted_months?: string[] | null; // ← جديد
  exemptedMonths?: string[] | null; // ← جديد (alias)
}

export type Student = ApplicationStudent;

const GRADE_ORDER = [
  'الصف الأول الابتدائي',
  'الصف الثاني الابتدائي',
  'الصف الثالث الابتدائي',
  'الصف الرابع الابتدائي',
  'الصف الخامس الابتدائي',
  'الصف السادس الابتدائي',
  'الصف الأول الإعدادي',
  'الصف الثاني الإعدادي',
  'الصف الثالث الإعدادي',
  'الصف الأول الثانوي',
  'الصف الثاني الثانوي',
  'الصف الثالث الثانوي',
];

const getGradeOrder = (student: Pick<ApplicationStudent, 'grade' | 'grade_level'>): number => {
  const grade = String(student.grade ?? student.grade_level ?? '').trim();
  const knownGradeIndex = GRADE_ORDER.indexOf(grade);
  return knownGradeIndex === -1 ? GRADE_ORDER.length : knownGradeIndex;
};

export const compareStudentsByGradeAndName = (a: ApplicationStudent, b: ApplicationStudent): number =>
  getGradeOrder(a) - getGradeOrder(b) ||
  String(a.name ?? '').localeCompare(String(b.name ?? ''), 'ar');

export const sortStudentsByGradeAndName = <T extends ApplicationStudent>(students: T[]): T[] =>
  [...students].sort(compareStudentsByGradeAndName);

export const getNextStudentCode = (
  students: Pick<ApplicationStudent, 'barcode'>[],
  baseCode = 1001
): string => {
  const numericCodes = students
    .map((student) => Number.parseInt(String(student.barcode ?? '').trim(), 10))
    .filter((code) => Number.isFinite(code));
  const nextCode = numericCodes.length > 0 ? Math.max(...numericCodes) + 1 : baseCode;
  return String(nextCode);
};

export type StudentInput = Omit<ApplicationStudent, 'id'>;
export type StudentUpdateInput = Partial<StudentInput>;

export interface StudentOption {
  id: number;
  name: string;
  group_name: string | null;
  parent_whatsapp: string | null;
  parent_phone: string | null;
}

type StudentRow = DatabaseStudent & {
  barcode?: string | null;
  guardian_name?: string | null;
  guardian_phone?: string | null;
  guardian_whatsapp?: string | null;
};

/**
 * تحليل قيمة exempted_months القادمة من قاعدة البيانات
 */
const parseExemptedMonths = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
      .map((v) => v.trim());
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const raw = value.trim();
    if (raw.startsWith('[')) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          return parsed
            .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
            .map((v) => v.trim());
        }
      } catch {
        return [];
      }
    }
    return raw
      .replace(/[{}"]/g, '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== '');
  }
  return [];
};

const toStudent = (row: StudentRow): Student => ({
  id: row.id,
  name: row.name,
  phone: row.phone ?? null,
  parent_phone: row.parent_phone ?? null,
  group_name: row.group_name ?? null,
  created_at: row.created_at ?? null,
  grade: row.grade || row.grade_level || '',
  student_code: row.student_code ?? null,
  behavior_rating: row.behavior_rating ?? null,
  discount_type: row.discount_type ?? null,
  subject: row.subject ?? null,
  due_amount: row.due_amount !== null && row.due_amount !== undefined ? Number(row.due_amount) : 0,
  stage: row.stage || '',
  grade_level: row.grade_level ?? null,
  subjects: row.subjects ?? null,
  parent_whatsapp: row.parent_whatsapp ?? null,
  student_phone: row.student_phone ?? null,
  group: row.group_name || '',
  dueAmount: row.due_amount !== null && row.due_amount !== undefined ? Number(row.due_amount) : 0,
  isExempt: row.is_exempt ?? false,
  is_exempt: row.is_exempt ?? false,
  discountAmount: row.discount_amount !== null && row.discount_amount !== undefined ? Number(row.discount_amount) : 0,
  discount: row.discount_amount !== null && row.discount_amount !== undefined ? Number(row.discount_amount) : 0,
  discount_amount: row.discount_amount !== null && row.discount_amount !== undefined ? Number(row.discount_amount) : 0,
  barcode: row.barcode || row.student_code || '',
  guardian_name: row.guardian_name || '',
  guardian_phone: row.guardian_phone || row.parent_phone || '',
  guardian_whatsapp: row.guardian_whatsapp || row.parent_whatsapp || '',
  guardian_notes: row.guardian_notes || '',
  address: row.address ?? null,
  school: row.school ?? null,
  exempted_months: parseExemptedMonths(row.exempted_months),
  exemptedMonths: parseExemptedMonths(row.exempted_months),
});

const toRow = (student: StudentInput | StudentUpdateInput, includeCreatedAt = false) =>
  Object.fromEntries(
    Object.entries({
      name: student.name === undefined ? undefined : String(student.name).trim(),
      phone: student.phone,
      parent_phone:
        (student.parent_phone ?? student.guardian_phone) === undefined
          ? undefined
          : String(student.parent_phone ?? student.guardian_phone).trim() || null,
      group_name: (() => {
        const groupName = student.group_name ?? student.group;
        return groupName === undefined ? undefined : String(groupName).trim() || 'مجموعة 1';
      })(),
      grade: student.grade === undefined ? undefined : String(student.grade).trim(),
      student_code: (() => {
        const code = student.student_code ?? student.barcode ?? student.code;
        return code === undefined ? undefined : String(code).trim() || null;
      })(),
      behavior_rating: student.behavior_rating,
      discount_type: student.discount_type ?? 'amount',
      subject: student.subject === undefined ? undefined : String(student.subject).trim(),
      due_amount: student.due_amount ?? student.dueAmount,
      stage: student.stage,
      grade_level: student.grade_level,
      subjects: student.subjects,
      parent_whatsapp: student.parent_whatsapp ?? student.guardian_whatsapp,
      student_phone: student.student_phone,
      guardian_name: student.guardian_name,
      guardian_notes: student.guardian_notes ?? null,
      is_exempt: Boolean(student.is_exempt ?? student.isExempt),
      discount_amount: Number(student.discount ?? student.discount_amount ?? student.discountAmount) || 0,
      created_at: includeCreatedAt ? student.created_at ?? new Date().toISOString() : undefined,
      address: student.address ?? null,
      school: student.school ?? null,
      exempted_months: student.exempted_months ?? student.exemptedMonths ?? undefined, // ← جديد
    }).filter(([, value]) => value !== undefined)
  );

const validateStudentId = (id: string | number): number => {
  const numericId = typeof id === 'string' ? Number(id.trim()) : id;
  if (!Number.isSafeInteger(numericId) || numericId <= 0) {
    throw new Error('معرف الطالب غير صالح.');
  }
  return numericId;
};

type SupabaseLikeError = {
  message?: string;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
};

function logSupabaseError(label: string, error: unknown): void {
  const e = (error ?? {}) as SupabaseLikeError;
  const message = e.message || String(error);
  const details = e.details ?? '—';
  const hint = e.hint ?? '—';
  const code = e.code ?? '—';
  console.error(`${label} message="${message}" | code=${code} | details=${details} | hint=${hint}`);
}

const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205']);

function isMissingTableError(error: unknown): boolean {
  const code = (error as SupabaseLikeError)?.code ?? null;
  return code !== null && MISSING_TABLE_CODES.has(code);
}

async function deleteRelatedRows(
  table: string,
  column: string,
  value: number,
  options: { optional?: boolean } = {}
): Promise<void> {
  const { error } = await supabase.from(table).delete().eq(column, value);
  if (error) {
    if (options.optional && isMissingTableError(error)) {
      console.warn(`تخطي حذف الجدول "${table}" لأنه غير موجود في قاعدة البيانات (اختياري).`);
      return;
    }
    logSupabaseError(`DELETE STUDENT ${table.toUpperCase()} ERROR:`, error);
    throw error;
  }
}

export async function getStudents(): Promise<Student[]> {
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .order('id', { ascending: false });
  if (error) {
    console.error('GET STUDENTS ERROR:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw error;
  }
  return sortStudentsByGradeAndName(((data as StudentRow[] | null) ?? []).map(toStudent));
}

export async function getStudentOptions(): Promise<StudentOption[]> {
  const { data, error } = await supabase
    .from('students')
    .select('id, name, group_name, parent_whatsapp, parent_phone')
    .order('name', { ascending: true });
  if (error) {
    console.error('GET STUDENT OPTIONS ERROR:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw error;
  }
  return (data as StudentOption[] | null) ?? [];
}

export async function addStudent(student: StudentInput): Promise<void> {
  const groupValue = student.group_name ?? student.group;
  if (student.name && student.subject && groupValue) {
    const { data: existing, error: checkError } = await supabase
      .from('students')
      .select('id')
      .eq('name', student.name.trim())
      .eq('subject', student.subject.trim())
      .eq('group_name', String(groupValue).trim())
      .maybeSingle();
    if (checkError) {
      logSupabaseError('DUPLICATE CHECK ERROR:', checkError);
    } else if (existing) {
      throw new Error('الطالب مسجل بالفعل في هذه المادة وهذه المجموعة');
    }
  }
  const row = toRow(student, true);
  const { error } = await supabase.from('students').insert([row]).select('*').single();
  if (error) {
    console.error('ADD STUDENT ERROR:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    if (error.code === '23505') {
      const constraint = error.message ?? '';
      if (constraint.includes('unique_student_name_subject_group')) {
        throw new Error('الطالب مسجل بالفعل في هذه المادة وهذه المجموعة');
      }
      if (constraint.includes('unique_student_name')) {
        throw new Error('يوجد طالب مسجل بنفس الاسم.');
      }
      throw new Error('هذه البيانات مسجلة مسبقاً.');
    }
    throw error;
  }
}

export async function updateStudent(id: string | number, data: StudentUpdateInput): Promise<void> {
  const numericId = validateStudentId(id);
  const groupValue = data.group_name ?? data.group;
  if (data.name && data.subject && groupValue) {
    const { data: existing, error: checkError } = await supabase
      .from('students')
      .select('id')
      .eq('name', data.name.trim())
      .eq('subject', data.subject.trim())
      .eq('group_name', String(groupValue).trim())
      .neq('id', numericId)
      .maybeSingle();
    if (checkError) {
      logSupabaseError('UPDATE DUPLICATE CHECK ERROR:', checkError);
    } else if (existing) {
      const duplicateError = new Error(
        'تعذر الحفظ: يوجد طالب آخر بنفس الاسم مسجل بالفعل في هذه المجموعة والمادة.'
      );
      (duplicateError as Error & { code?: string }).code = '23505';
      throw duplicateError;
    }
  }
  const row = toRow(data);
  const { error } = await supabase.from('students').update(row).eq('id', numericId);
  if (error) {
    console.error('UPDATE STUDENT ERROR:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw error;
  }
}

export async function deleteStudent(id: string | number): Promise<void> {
  const numericId = validateStudentId(id);
  const { data: deliveries, error: deliveriesFetchError } = await supabase
    .from('material_deliveries')
    .select('id')
    .eq('student_id', numericId);
  if (deliveriesFetchError) {
    if (isMissingTableError(deliveriesFetchError)) {
      console.warn('تخطي فحص material_deliveries لأن الجدول غير موجود في قاعدة البيانات.');
    } else {
      logSupabaseError('FETCH STUDENT MATERIAL DELIVERIES ERROR:', deliveriesFetchError);
      throw deliveriesFetchError;
    }
  } else {
    const deliveryIds = ((deliveries as { id: number }[] | null) ?? []).map((d) => d.id);
    if (deliveryIds.length > 0) {
      const { error: deliveryItemsError } = await supabase
        .from('material_delivery_items')
        .delete()
        .in('delivery_id', deliveryIds);
      if (deliveryItemsError && !isMissingTableError(deliveryItemsError)) {
        logSupabaseError('DELETE STUDENT MATERIAL DELIVERY ITEMS ERROR:', deliveryItemsError);
        throw deliveryItemsError;
      }
    }
  }
  await deleteRelatedRows('payments', 'student_id', numericId);
  await deleteRelatedRows('attendance', 'student_id', numericId);
  await deleteRelatedRows('grades', 'student_id', numericId);
  await deleteRelatedRows('exam_results', 'student_id', numericId);
  await deleteRelatedRows('material_deliveries', 'student_id', numericId, { optional: true });
  const { error } = await supabase.from('students').delete().eq('id', numericId);
  if (error) {
    logSupabaseError('DELETE STUDENT ERROR:', error);
    throw error;
  }
}

export async function getUniqueStudentsCount(): Promise<number> {
  const { data, error } = await supabase
    .from('students')
    .select('student_code, parent_phone, parent_whatsapp, id');
  if (error) {
    console.error('GET UNIQUE STUDENTS COUNT ERROR:', error);
    throw error;
  }
  const uniqueIdentifiers = new Set<string>();
  (data ?? []).forEach(
    (row: { student_code?: string | null; parent_phone?: string | null; parent_whatsapp?: string | null; id: number }) => {
      const identifier = row.student_code || row.parent_phone || row.parent_whatsapp || String(row.id);
      if (identifier) uniqueIdentifiers.add(identifier);
    }
  );
  return uniqueIdentifiers.size;
}

export async function getUniqueStudents(): Promise<Student[]> {
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .order('id', { ascending: false });
  if (error) throw error;
  const seen = new Set<string>();
  const unique: Student[] = [];
  ((data as StudentRow[] | null) ?? []).forEach((row) => {
    const student = toStudent(row);
    const identifier =
      student.student_code || student.barcode || student.parent_phone || student.parent_whatsapp || String(student.id);
    if (identifier && !seen.has(identifier)) {
      seen.add(identifier);
      unique.push(student);
    }
  });
  return sortStudentsByGradeAndName(unique);
}

/* =====================================================
   ربط الإعفاءات الشهرية بـ Supabase
   ===================================================== */

const MONTH_KEY_PATTERN = /^\d{4}-\d{2}$/;

const validateMonthKey = (monthKey: string): string => {
  const key = String(monthKey ?? '').trim();
  if (!MONTH_KEY_PATTERN.test(key)) {
    throw new Error('صيغة شهر الإعفاء غير صالحة. المتوقع: YYYY-MM مثل 2026-08');
  }
  return key;
};

export async function fetchExemptedMonths(studentId: number): Promise<string[]> {
  const numericId = validateStudentId(studentId);
  const { data, error } = await supabase
    .from('students')
    .select('exempted_months')
    .eq('id', numericId)
    .single();
  if (error) {
    logSupabaseError('FETCH EXEMPTED MONTHS ERROR:', error);
    throw error;
  }
  return parseExemptedMonths((data as { exempted_months?: unknown } | null)?.exempted_months);
}

export async function addExemptedMonth(studentId: number, monthKey: string): Promise<Student> {
  const numericId = validateStudentId(studentId);
  const key = validateMonthKey(monthKey);

  const current = await fetchExemptedMonths(numericId);
  const list = current.includes(key) ? current : [...current, key].sort();

  const { data, error } = await supabase
    .from('students')
    .update({ exempted_months: list })
    .eq('id', numericId)
    .select('*')
    .single();
  if (error) {
    logSupabaseError('ADD EXEMPTED MONTH ERROR:', error);
    throw error;
  }
  return toStudent(data as StudentRow);
}

export async function removeExemptedMonth(studentId: number, monthKey: string): Promise<Student> {
  const numericId = validateStudentId(studentId);
  const key = validateMonthKey(monthKey);

  const current = await fetchExemptedMonths(numericId);
  const list = current.filter((m) => m !== key);

  const { data, error } = await supabase
    .from('students')
    .update({ exempted_months: list })
    .eq('id', numericId)
    .select('*')
    .single();
  if (error) {
    logSupabaseError('REMOVE EXEMPTED MONTH ERROR:', error);
    throw error;
  }
  return toStudent(data as StudentRow);
}

export function isMonthExempted(
  student:
    | { exempted_months?: string[] | null; exemptedMonths?: string[] | null }
    | null
    | undefined,
  monthKey: string
): boolean {
  if (!student) return false;
  const list = parseExemptedMonths(student.exempted_months ?? student.exemptedMonths);
  return list.includes(String(monthKey ?? '').trim());
}

export async function getStudentsExemptedFromMonth(monthKey: string): Promise<Student[]> {
  const key = validateMonthKey(monthKey);
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .contains('exempted_months', [key]);
  if (error) {
    logSupabaseError('GET EXEMPTED STUDENTS ERROR:', error);
    throw error;
  }
  return sortStudentsByGradeAndName(((data as StudentRow[] | null) ?? []).map(toStudent));
}