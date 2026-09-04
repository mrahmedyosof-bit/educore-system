import { supabase } from '@/lib/supabase';
import type { Grade } from '@/types';

export type GradeRecord = Grade;

export interface GradeWithStudent {
  score: number;
  max_score: number;
  student?: {
    name: string;
    group_name: string | null;
  } | null;
}

export interface GradeInput {
  student_id: number;
  exam_name: string;
  score: number;
  max_score: number;
  notes?: string | null;
}

const validateGrade = (input: GradeInput): void => {
  if (!Number.isSafeInteger(input.student_id) || input.student_id <= 0) {
    throw new Error('معرف الطالب غير صالح.');
  }

  if (!input.exam_name.trim()) {
    throw new Error('اسم الاختبار مطلوب.');
  }

  if (!Number.isFinite(input.score) || input.score < 0) {
    throw new Error('درجة الطالب غير صالحة.');
  }

  if (!Number.isFinite(input.max_score) || input.max_score <= 0) {
    throw new Error('الدرجة النهائية غير صالحة.');
  }

  if (input.score > input.max_score) {
    throw new Error('درجة الطالب لا يمكن أن تتجاوز الدرجة النهائية.');
  }

  if (input.notes !== undefined && input.notes !== null && typeof input.notes !== 'string') {
    throw new Error('ملاحظات الدرجة غير صالحة.');
  }
};

export async function getGrades(): Promise<GradeRecord[]> {
  const { data, error } = await supabase
    .from('grades')
    .select('id, student_id, exam_name, score, max_score, notes, created_at')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  if (error) throw error;
  return (data as GradeRecord[] | null) ?? [];
}

export async function getGradesWithStudents(): Promise<GradeWithStudent[]> {
  const { data, error } = await supabase
    .from('grades')
    .select('score, max_score, student:students(name, group_name)');

  if (error) throw error;
  return (data ?? []).map((row) => {
    // PostgREST يعيد كائناً واحداً للعلاقة many-to-one، لكن نتعامل مع المصفوفة أيضاً للاحتياط
    const embedded = row.student as
      | { name: string; group_name: string | null }
      | { name: string; group_name: string | null }[]
      | null
      | undefined;
    const student = Array.isArray(embedded) ? embedded[0] ?? null : embedded ?? null;
    return {
      score: row.score,
      max_score: row.max_score,
      student,
    };
  });
}

export async function addGrade(input: GradeInput): Promise<void> {
  validateGrade(input);

  const grade = {
    student_id: input.student_id,
    exam_name: input.exam_name.trim(),
    score: input.score,
    max_score: input.max_score,
    notes: input.notes ?? null,
  };

  const { error } = await supabase.from('grades').insert([grade]);
  if (error) throw error;
}
