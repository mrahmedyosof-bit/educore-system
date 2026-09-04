import { supabase } from '@/lib/supabase';

export interface Expense {
  id: number;
  title: string;
  amount: number;
  category: string;
  date: string;
  notes: string | null;
  created_at: string | null;
}

export interface ExpenseInput {
  title: string;
  amount: number;
  category: string;
  date: string;
  notes?: string | null;
}

const validateExpense = (input: ExpenseInput): void => {
  if (!input.title.trim()) {
    throw new Error('عنوان المصروف مطلوب.');
  }

  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('قيمة المصروف غير صالحة.');
  }

  if (!input.date) {
    throw new Error('تاريخ المصروف مطلوب.');
  }

  if (!input.category.trim()) {
    throw new Error('تصنيف المصروف مطلوب.');
  }
};

export async function getExpenses(): Promise<Expense[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select('id, title, amount, category, date, notes, created_at')
    .order('date', { ascending: false })
    .order('id', { ascending: false });

  if (error) throw error;

  return ((data as Expense[] | null) ?? []).map((row) => ({
    ...row,
    amount: Number(row.amount),
  }));
}

export async function addExpense(input: ExpenseInput): Promise<void> {
  validateExpense(input);

  const { error } = await supabase.from('expenses').insert([
    {
      title: input.title.trim(),
      amount: input.amount,
      category: input.category,
      date: input.date,
      notes: input.notes?.trim() || null,
    },
  ]);

  if (error) throw error;
}

export async function deleteExpense(id: number): Promise<void> {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error('معرف المصروف غير صالح.');
  }

  const { error } = await supabase
    .from('expenses')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
