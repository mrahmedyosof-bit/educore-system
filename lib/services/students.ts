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
  behavior_rating?: string | null;
  discount_type?: string | null;
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
  guardian_phone?: string;
  guardian_whatsapp?: string;
  guardian_notes?: string;

  address?: string | null;
  school?: string | null;
}

export type Student = ApplicationStudent;

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

  // موجود في جدول students
  guardian_name?: string | null;

  // يتم الاعتماد فعليًا على parent_phone
  guardian_phone?: string | null;

  // يتم الاعتماد فعليًا على parent_whatsapp
  guardian_whatsapp?: string | null;
};

/**
 * تحويل صف قاعدة البيانات إلى نموذج الطالب المستخدم داخل التطبيق.
 *
 * ملاحظة:
 * بيانات الحضور والدرجات والمدفوعات لا يتم افتراض وجودها
 * داخل جدول students.
 */
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

  due_amount:
    row.due_amount !== null &&
    row.due_amount !== undefined
      ? Number(row.due_amount)
      : 0,

  stage: row.stage || '',

  grade_level: row.grade_level ?? null,

  subjects: row.subjects ?? null,

  parent_whatsapp: row.parent_whatsapp ?? null,

  student_phone: row.student_phone ?? null,

  group: row.group_name || '',

  dueAmount:
    row.due_amount !== null &&
    row.due_amount !== undefined
      ? Number(row.due_amount)
      : 0,

  isExempt: row.is_exempt ?? false,

  discountAmount:
    row.discount_amount !== null &&
    row.discount_amount !== undefined
      ? Number(row.discount_amount)
      : 0,

  /*
   * barcode:
   * لا يوجد عمود barcode مستقل في جدول students.
   * لذلك نستخدم student_code كبديل.
   */
  barcode:
    row.barcode ||
    row.student_code ||
    '',

  /*
   * اسم ولي الأمر موجود فعليًا في students.
   */
  guardian_name:
    row.guardian_name ||
    '',

  /*
   * لا يوجد guardian_phone مستقل في قاعدة البيانات.
   * نستخدم parent_phone.
   */
  guardian_phone:
    row.guardian_phone ||
    row.parent_phone ||
    '',

  /*
   * لا يوجد guardian_whatsapp مستقل.
   * نستخدم parent_whatsapp.
   */
  guardian_whatsapp:
    row.guardian_whatsapp ||
    row.parent_whatsapp ||
    '',

  guardian_notes:
    row.guardian_notes ||
    '',

  address:
    row.address ?? null,

  school:
    row.school ?? null,
});

/**
 * تحويل بيانات التطبيق إلى صف صالح لجدول students.
 *
 * مهم:
 * لا نرسل هنا أي أعمدة خاصة بـ:
 * - attendance
 * - grades
 * - exam_results
 * - payments
 *
 * لأن لكل منها جدولًا مستقلًا.
 */
const toRow = (
  student: StudentInput | StudentUpdateInput
) =>
  Object.fromEntries(
    Object.entries({
      /*
       * جدول students
       */
      name:
        student.name,

      phone:
        student.phone,

      parent_phone:
        student.parent_phone ??
        student.guardian_phone,

      group_name:
        student.group_name ??
        student.group,

      grade:
        student.grade,

      student_code:
        student.student_code ??
        student.barcode,

      behavior_rating:
        student.behavior_rating,

      discount_type:
        student.discount_type,

      subject:
        student.subject,

      due_amount:
        student.due_amount ??
        student.dueAmount,

      stage:
        student.stage,

      grade_level:
        student.grade_level,

      subjects:
        student.subjects,

      parent_whatsapp:
        student.parent_whatsapp ??
        student.guardian_whatsapp,

      student_phone:
        student.student_phone,

      /*
       * موجود فعليًا في جدول students
       */
      guardian_name:
        student.guardian_name,

      guardian_notes:
        student.guardian_notes ?? null,

      is_exempt:
        student.isExempt,

      discount_amount:
        student.discountAmount ?? 0,

      address:
        student.address ?? null,

      school:
        student.school ?? null,
    }).filter(
      ([, value]) => value !== undefined
    )
  );

const validateStudentId = (
  id: string | number
): number => {
  const numericId =
    typeof id === 'string'
      ? Number(id.trim())
      : id;

  if (
    !Number.isSafeInteger(numericId) ||
    numericId <= 0
  ) {
    throw new Error(
      'معرف الطالب غير صالح.'
    );
  }

  return numericId;
};

/**
 * شكل مبسّط لخطأ Supabase/Postgrest حتى نتمكن من قراءة تفاصيله الحقيقية.
 */
type SupabaseLikeError = {
  message?: string;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
};

/**
 * طباعة تفاصيل خطأ Supabase الحقيقية بدلاً من الكائن الخام.
 *
 * ملاحظتان مهمتان دفعتا لكتابة الدالة بهذا الشكل تحديداً:
 *
 * 1) كائنات Error في JavaScript تجعل الخاصية message غير قابلة للتعداد
 *    (non-enumerable)، فطباعتها مباشرة عبر console.error قد تظهر في
 *    بعض أدوات العرض كـ "{}" رغم أنها تحمل رسالة حقيقية.
 *
 * 2) نافذة أخطاء Next.js (خصوصاً مع Turbopack) تعرض أي وسيط (argument)
 *    من نوع كائن يُمرَّر إلى console.error كـ "{}" في سطر العنوان بغض
 *    النظر عن محتواه الفعلي — حتى لو كان الكائن يحتوي على بيانات حقيقية.
 *    لذلك لا يكفي استخراج message/details/hint/code إلى كائن جديد؛
 *    يجب تجميعها في نص واحد (string) وتمريره كوسيط وحيد لـ console.error
 *    حتى تظهر التفاصيل فعلياً في الـ console.
 */
function logSupabaseError(label: string, error: unknown): void {
  const e = (error ?? {}) as SupabaseLikeError;
  const message = e.message || String(error);
  const details = e.details ?? '—';
  const hint = e.hint ?? '—';
  const code = e.code ?? '—';

  console.error(
    `${label} message="${message}" | code=${code} | details=${details} | hint=${hint}`
  );
}

/**
 * أكواد الخطأ التي تعني "الجدول غير موجود" من مصدرين مختلفين:
 * - 42P01: كود Postgres الخام لـ "relation does not exist".
 * - PGRST205: كود PostgREST (طبقة Supabase الوسيطة) حين لا يجد الجدول
 *   في schema cache الخاص به — وهو ما يظهر فعلياً عند العمل عبر
 *   supabase-js حتى لو كان السبب الحقيقي هو عدم وجود الجدول أصلاً.
 */
const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205']);

function isMissingTableError(error: unknown): boolean {
  const code = (error as SupabaseLikeError)?.code ?? null;
  return code !== null && MISSING_TABLE_CODES.has(code);
}

/**
 * حذف كل الصفوف في `table` حيث `column` = `value`.
 *
 * إن كان `optional` بقيمة true، وفشل الحذف لأن الجدول نفسه غير موجود
 * في قاعدة البيانات (انظر isMissingTableError)، يتم تجاهل الخطأ بدل
 * إيقاف عملية حذف الطالب بالكامل بسبب جدول اختياري قد لا يكون
 * مستخدمًا في كل تركيب لقاعدة البيانات.
 *
 * أي خطأ آخر (مثل انتهاك مفتاح أجنبي فعلي) يتم طباعته بالتفصيل ورميه
 * حتى لا نستمر في حذف الطالب وهناك بيانات مرتبطة لم تُحذف بنجاح.
 */
async function deleteRelatedRows(
  table: string,
  column: string,
  value: number,
  options: { optional?: boolean } = {}
): Promise<void> {
  const { error } = await supabase
    .from(table)
    .delete()
    .eq(column, value);

  if (error) {
    if (options.optional && isMissingTableError(error)) {
      console.warn(
        `تخطي حذف الجدول "${table}" لأنه غير موجود في قاعدة البيانات (اختياري).`
      );
      return;
    }

    logSupabaseError(`DELETE STUDENT ${table.toUpperCase()} ERROR:`, error);
    throw error;
  }
}

/**
 * جلب جميع الطلاب.
 */
export async function getStudents(): Promise<Student[]> {
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .order('id', {
      ascending: false,
    });

  if (error) {
    console.error(
      'GET STUDENTS ERROR:',
      {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      }
    );

    throw error;
  }

  return (
    (data as StudentRow[] | null) ?? []
  ).map(toStudent);
}

/**
 * جلب قائمة مختصرة للطلاب المستخدمة في القوائم والاختيارات.
 */
export async function getStudentOptions(): Promise<StudentOption[]> {
  const { data, error } = await supabase
    .from('students')
    .select(
      'id, name, group_name, parent_whatsapp, parent_phone'
    )
    .order('name', {
      ascending: true,
    });

  if (error) {
    console.error(
      'GET STUDENT OPTIONS ERROR:',
      {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      }
    );

    throw error;
  }

  return (
    (data as StudentOption[] | null) ?? []
  );
}

/**
 * إضافة طالب جديد.
 */
export async function addStudent(
  student: StudentInput
): Promise<void> {
  const groupValue = student.group_name ?? student.group;
  // التحقق من عدم وجود طالب بنفس الاسم + المادة + المجموعة
  // يستخدم نفس الأعمدة الموجودة في القيد الفريد (unique constraint)
  if (student.name && student.subject && groupValue) {
    const { data: existing, error: checkError } = await supabase
      .from('students')
      .select('id')
      .eq('name', student.name.trim())
      .eq('subject', student.subject.trim())
      .eq('group_name', String(groupValue).trim())
      .maybeSingle();

    if (checkError) {
      // تسجيل الخطأ بتفصيل أكبر مع استمرار العملية (القيد الفريد في قاعدة البيانات سيتعامل مع التكرار)
      logSupabaseError('DUPLICATE CHECK ERROR:', checkError);
    } else if (existing) {
      throw new Error('الطالب مسجل بالفعل في هذه المادة وهذه المجموعة');
    }
  }

  const row = toRow(student);

  const { error } = await supabase
    .from('students')
    .insert([row])
    .select('*')
    .single();

  if (error) {
    console.error(
      'ADD STUDENT ERROR:',
      {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      }
    );

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

/**
 * تحديث بيانات طالب.
 */
export async function updateStudent(
  id: string | number,
  data: StudentUpdateInput
): Promise<void> {
  const numericId =
    validateStudentId(id);

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

  const { error } = await supabase
    .from('students')
    .update(row)
    .eq('id', numericId);

  if (error) {
    console.error(
      'UPDATE STUDENT ERROR:',
      {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      }
    );

    throw error;
  }
}

/**
 * حذف طالب وجميع بياناته المرتبطة (مدفوعات، حضور، درجات، امتحانات، مواد، إلخ).
 *
 * ==========================================================================
 * ترتيب الحذف مهم جداً لتجنب أخطاء المفتاح الأجنبي (Foreign Key Constraint):
 * أي جدول "تابع" (child) يشير إلى صف آخر يجب حذفه قبل حذف ذلك الصف نفسه.
 *
 * 1) أولاً: أي صفوف تشير إلى سجلات material_deliveries الخاصة بالطالب
 *    (مثل بنود/تفاصيل تسليم مادة معينة)، لأن حذف صف في material_deliveries
 *    سيفشل بخطأ مفتاح أجنبي إن كان له صفوف تابعة له في جدول آخر عبر
 *    delivery_id. هذه الخطوة اختيارية وآمنة: إن لم يكن لديك مثل هذا
 *    الجدول أصلاً فسيتم تجاهلها دون أي تأثير.
 * 2) بعدها: كل الجداول المرتبطة مباشرة بالطالب عبر student_id.
 * 3) أخيراً: صف الطالب نفسه من جدول students.
 * ==========================================================================
 */
export async function deleteStudent(
  id: string | number
): Promise<void> {
  const numericId =
    validateStudentId(id);

  // 1) تنظيف أي جداول تعتمد على صفوف material_deliveries الخاصة بهذا
  //    الطالب (وليس على الطالب نفسه)، قبل محاولة حذف تلك الصفوف.
  const { data: deliveries, error: deliveriesFetchError } = await supabase
    .from('material_deliveries')
    .select('id')
    .eq('student_id', numericId);

  if (deliveriesFetchError) {
    if (isMissingTableError(deliveriesFetchError)) {
      // الجدول material_deliveries غير موجود أصلاً في قاعدة البيانات.
      // هذه ميزة اختيارية بالكامل، فنتجاهلها وننتقل مباشرة للخطوة التالية
      // بدل إيقاف عملية حذف الطالب بأكملها بسبب جدول غير مستخدم.
      console.warn(
        'تخطي فحص material_deliveries لأن الجدول غير موجود في قاعدة البيانات.'
      );
    } else {
      logSupabaseError('FETCH STUDENT MATERIAL DELIVERIES ERROR:', deliveriesFetchError);
      throw deliveriesFetchError;
    }
  } else {
    const deliveryIds = ((deliveries as { id: number }[] | null) ?? []).map(
      (d) => d.id
    );

    if (deliveryIds.length > 0) {
      // اسم الجدول التالي افتراضي شائع (بنود/تفاصيل التسليم). إن كان اسم
      // الجدول الفعلي لديك مختلفًا، عدّل اسمه هنا فقط — الحذف يبقى آمناً
      // (يتجاهل الجدول غير الموجود) بحيث لا يوقف العملية إن لم يكن هذا
      // الجدول موجوداً.
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

  // 2) حذف كل الجداول المرتبطة مباشرة بالطالب، بالترتيب الصحيح.
  //    material_deliveries اختياري (optional: true) لأنه قد لا يكون
  //    موجوداً في كل تركيب لقاعدة البيانات — كما هي الحال هنا.
  await deleteRelatedRows('payments', 'student_id', numericId);
  await deleteRelatedRows('attendance', 'student_id', numericId);
  await deleteRelatedRows('grades', 'student_id', numericId);
  await deleteRelatedRows('exam_results', 'student_id', numericId);
  await deleteRelatedRows('material_deliveries', 'student_id', numericId, { optional: true });

  // 3) أخيراً حذف الطالب نفسه، بعد التأكد من عدم وجود أي بيانات مرتبطة به.
  const { error } = await supabase
    .from('students')
    .delete()
    .eq('id', numericId);

  if (error) {
    logSupabaseError('DELETE STUDENT ERROR:', error);
    throw error;
  }
}

/**
 * حساب عدد الطلاب الفريدين (Unique Students) بناءً على student_code أو رقم ولي الأمر.
 * يستخدم في الشاشات الإدارية لعد الطلاب كأفراد وليس كاشتراكات.
 */
export async function getUniqueStudentsCount(): Promise<number> {
  const { data, error } = await supabase
    .from('students')
    .select('student_code, parent_phone, parent_whatsapp, id');

  if (error) {
    console.error('GET UNIQUE STUDENTS COUNT ERROR:', error);
    throw error;
  }

  const uniqueIdentifiers = new Set<string>();
  (data ?? []).forEach((row: { student_code?: string | null; parent_phone?: string | null; parent_whatsapp?: string | null; id: number }) => {
    // استخدام student_code أو parent_phone أو parent_whatsapp أو id كمعرف فريد
    const identifier = row.student_code || row.parent_phone || row.parent_whatsapp || String(row.id);
    if (identifier) uniqueIdentifiers.add(identifier);
  });

  return uniqueIdentifiers.size;
}

/**
 * جلب الطلاب الفريدين (Unique Students) للتقارير الإدارية.
 * يرجع طالباً واحداً لكل student_code/phone مع أول صف وجد.
 */
export async function getUniqueStudents(): Promise<Student[]> {
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .order('id', { ascending: false });

  if (error) throw error;

  const seen = new Set<string>();
  const unique: Student[] = [];

  (data as StudentRow[] | null ?? []).forEach((row) => {
    const student = toStudent(row);
    // استخدام student_code (barcode) أو parent_phone أو parent_whatsapp أو id كمعرف فريد
    const identifier = student.student_code || student.barcode || student.parent_phone || student.parent_whatsapp || String(student.id);
    if (identifier && !seen.has(identifier)) {
      seen.add(identifier);
      unique.push(student);
    }
  });

  return unique;
}
