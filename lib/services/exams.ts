import { supabase } from '@/lib/supabase';

export interface Exam {
  id: number;
  title: string;
  subject: string | null;
  stage: string | null;
  max_score: number;
  exam_date: string;
  created_at: string | null;
}

export interface ExamInput {
  title: string;
  subject: string | null;
  stage: string | null;
  max_score: number;
  exam_date: string;
}

/** صف درجة مرتبط باختبار (من جدول grades الموجود). */
export interface ExamGradeRow {
  id: number;
  student_id: number | null;
  exam_id: number | null;
  exam_name: string;
  score: number;
  max_score: number;
  notes: string | null;
}

/** إدخال رصد جماعي لطالب واحد. */
export interface ExamResultEntry {
  student_id: number;
  score: number | null;
  absent: boolean;
}

const validateExam = (input: ExamInput): void => {
  if (!input.title.trim()) {
    throw new Error('اسم الاختبار مطلوب.');
  }

  if (!Number.isFinite(input.max_score) || input.max_score <= 0) {
    throw new Error('الدرجة العظمى غير صالحة.');
  }

  if (!input.exam_date) {
    throw new Error('تاريخ الاختبار مطلوب.');
  }
};

export async function getExams(): Promise<Exam[]> {
  const { data, error } = await supabase
    .from('exams')
    .select('id, title, subject, stage, max_score, exam_date, created_at')
    .order('exam_date', { ascending: false })
    .order('id', { ascending: false });

  if (error) throw error;

  return ((data as Exam[] | null) ?? []).map((row) => ({
    ...row,
    max_score: Number(row.max_score),
  }));
}

export async function addExam(input: ExamInput): Promise<void> {
  validateExam(input);

  const { error } = await supabase.from('exams').insert([
    {
      title: input.title.trim(),
      subject: input.subject?.trim() || null,
      stage: input.stage?.trim() || null,
      max_score: input.max_score,
      exam_date: input.exam_date,
    },
  ]);

  if (error) throw error;
}

export async function deleteExam(id: number): Promise<void> {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error('معرف الاختبار غير صالح.');
  }

  // حذف الدرجات المرتبطة أولاً ثم تعريف الاختبار
  const { error: gradesError } = await supabase
    .from('grades')
    .delete()
    .eq('exam_id', id);

  if (gradesError) throw gradesError;

  const { error } = await supabase.from('exams').delete().eq('id', id);
  if (error) throw error;
}

/**
 * جلب كل صفوف الدرجات المرتبطة بالاختبارات
 * (تُستخدم لحساب إحصائيات كل اختبار دفعة واحدة).
 */
export async function getAllExamResults(): Promise<ExamGradeRow[]> {
  const { data, error } = await supabase
    .from('grades')
    .select('id, student_id, exam_id, exam_name, score, max_score, notes')
    .not('exam_id', 'is', null)
    .order('id', { ascending: true });

  if (error) throw error;
  return (data as ExamGradeRow[] | null) ?? [];
}

/**
 * حفظ نتائج اختبار كاملة (رصد جماعي):
 * تحل محل أي درجات سابقة لنفس الاختبار في استعلامين فقط.
 * الطالب الغائب يُسجل بدرجة 0 وملاحظة "غائب".
 */
export async function saveExamResults(
  exam: Exam,
  entries: ExamResultEntry[]
): Promise<{ saved: number }> {
  const rows = entries
    .filter(
      (e) =>
        Number.isSafeInteger(e.student_id) &&
        e.student_id > 0 &&
        (e.absent || e.score !== null)
    )
    .map((e) => ({
      student_id: e.student_id,
      exam_name: exam.title,
      exam_id: exam.id,
      score: e.absent ? 0 : Number(e.score),
      max_score: exam.max_score,
      notes: e.absent ? 'غائب' : null,
    }));

  // استبدال النتائج القديمة
  const { error: deleteError } = await supabase
    .from('grades')
    .delete()
    .eq('exam_id', exam.id);

  if (deleteError) throw deleteError;

  if (rows.length === 0) return { saved: 0 };

  const { error } = await supabase.from('grades').insert(rows);
  if (error) throw error;

  return { saved: rows.length };
}
