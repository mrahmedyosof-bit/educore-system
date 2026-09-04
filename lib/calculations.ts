import { Payment, Grade, Attendance } from '@/types';

export interface FinancialSummary {
  totalDue: number;
  totalPaid: number;
  totalRemaining: number;
  collectionRate: number;
}

export const calculateFinancialSummary = (
  totalDue: number,
  payments: Pick<Payment, 'amount_paid'>[] = []
): FinancialSummary => {
  const normalizedDue = Number.isFinite(totalDue) ? Math.max(0, totalDue) : 0;
  const totalPaid = payments.reduce((sum, payment) => {
    const amountPaid = Number(payment.amount_paid);
    return sum + (Number.isFinite(amountPaid) && amountPaid > 0 ? amountPaid : 0);
  }, 0);

  return {
    totalDue: normalizedDue,
    totalPaid,
    totalRemaining: Math.max(0, normalizedDue - totalPaid),
    collectionRate: normalizedDue > 0 ? Math.round((totalPaid / normalizedDue) * 100) : 0,
  };
};

/**
 * حساب إجمالي الإيرادات المحصلة
 */
export const calculateTotalRevenue = (payments: Payment[] = []): number => {
  return payments.reduce((sum, p) => {
    const amountPaid = Number(p.amount_paid);
    return sum + (Number.isFinite(amountPaid) ? amountPaid : 0);
  }, 0);
};

/**
 * حساب إجمالي المبالغ المتبقية / الديون
 */
export const calculateTotalRemaining = (payments: Payment[] = []): number => {
  return payments.reduce((sum, p) => {
    const amountRemaining = Number(p.amount_remaining);
    return sum + (Number.isFinite(amountRemaining) ? amountRemaining : 0);
  }, 0);
};

/**
 * حساب متوسط درجات طالب معين
 */
export const calculateStudentAverageGrade = (
  grades: Pick<Grade, 'score' | 'max_score'>[] = []
): number => {
  if (!grades.length) return 0;
  const totalPercentage = grades.reduce((sum, g) => {
    const score = Number(g.score);
    const maxScore = Number(g.max_score);
    if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) return sum;
    return sum + (score / maxScore) * 100;
  }, 0);
  const validGradeCount = grades.filter((g) => {
    const score = Number(g.score);
    const maxScore = Number(g.max_score);
    return Number.isFinite(score) && Number.isFinite(maxScore) && maxScore > 0;
  }).length;
  return validGradeCount ? Math.round(totalPercentage / validGradeCount) : 0;
};

/**
 * حساب نسبة حضور طالب
 */
export const calculateAttendanceRate = (attendance: Attendance[] = []): number => {
  if (!attendance.length) return 0;
  const presentCount = attendance.filter(
    (a) => a.status === 'present' || a.status === 'حاضر'
  ).length;
  return Math.round((presentCount / attendance.length) * 100);
};