import { supabase } from '@/lib/supabase';
import type { Payment } from '@/types';

export type PaymentRecord = Payment;

export interface PaymentInput {
  student_id: number;
  amount_paid: number;
  amount_remaining?: number | null;
  month_name: string;
  payment_date?: string | null;
  academic_year?: string | null;
}

export async function getPayments(): Promise<PaymentRecord[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('id, student_id, amount_paid, amount_remaining, month_name, academic_year, created_at, payment_date')
    .order('payment_date', { ascending: false })
    .order('id', { ascending: false });

  if (error) throw error;
  return (data as PaymentRecord[] | null) ?? [];
}

export async function addPayment(input: PaymentInput): Promise<PaymentRecord> {
  if (!Number.isSafeInteger(input.student_id) || input.student_id <= 0) {
    throw new Error('معرف الطالب غير صالح.');
  }

  if (!Number.isFinite(input.amount_paid) || input.amount_paid <= 0) {
    throw new Error('يجب أن يكون المبلغ المدفوع أكبر من صفر.');
  }

  if (
    input.amount_remaining !== undefined &&
    input.amount_remaining !== null &&
    (!Number.isFinite(input.amount_remaining) || input.amount_remaining < 0)
  ) {
    throw new Error('المبلغ المتبقي غير صالح.');
  }

  if (!input.month_name.trim()) {
    throw new Error('شهر الاشتراك مطلوب.');
  }

  const monthName = input.month_name.trim();
  const paymentData = {
    student_id: input.student_id,
    amount_paid: input.amount_paid,
    month_name: monthName,
    ...(input.amount_remaining !== undefined ? { amount_remaining: input.amount_remaining } : {}),
    ...(input.payment_date !== undefined ? { payment_date: input.payment_date } : {}),
    ...(input.academic_year !== undefined ? { academic_year: input.academic_year } : {}),
  };

  const { data, error } = await supabase
    .from('payments')
    .insert(paymentData)
    .select('id, student_id, amount_paid, amount_remaining, month_name, academic_year, created_at, payment_date')
    .single();

  if (error) throw error;
  return data as PaymentRecord;
}

export async function updatePayment(
  id: number,
  input: PaymentInput
): Promise<void> {
  if (!Number.isSafeInteger(input.student_id) || input.student_id <= 0) {
    throw new Error('معرف الطالب غير صالح.');
  }

  if (!Number.isFinite(input.amount_paid) || input.amount_paid < 0) {
    throw new Error('المبلغ المدفوع يجب ألا يكون سالباً.');
  }

  if (
    input.amount_remaining !== undefined &&
    input.amount_remaining !== null &&
    (!Number.isFinite(input.amount_remaining) || input.amount_remaining < 0)
  ) {
    throw new Error('المبلغ المتبقي غير صالح.');
  }

  if (!input.month_name.trim()) {
    throw new Error('شهر الاشتراك مطلوب.');
  }

  const monthName = input.month_name.trim();
  const paymentData = {
    student_id: input.student_id,
    amount_paid: input.amount_paid,
    month_name: monthName,
    ...(input.amount_remaining !== undefined ? { amount_remaining: input.amount_remaining } : {}),
    ...(input.payment_date !== undefined ? { payment_date: input.payment_date } : {}),
    ...(input.academic_year !== undefined ? { academic_year: input.academic_year } : {}),
  };

  const { error } = await supabase
    .from('payments')
    .update(paymentData)
    .eq('id', id);

  if (error) throw error;
}
