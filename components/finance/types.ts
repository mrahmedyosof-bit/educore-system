export interface PaymentRecord {
  id: number;
  student_id: number;
  amount_paid: number;
  amount_remaining: number;
  month_name: string;
  created_at: string;
  payment_date: string | null;
  student?: {
    id: number;
    name: string;
    grade: string;
    subject: string;
    group_name: string;
    parent_whatsapp: string;
    parent_phone: string;
  };
}

export interface Student {
  id: number;
  name: string;
  phone: string;
  parent_phone: string;
  parent_whatsapp: string;
  grade: string;
  subject: string;
  group_name: string;
  stage: string;
  barcode: string;
  dueAmount: number;
  discountAmount: number;
  isExempt: boolean;
  guardian_name: string;
  guardian_phone: string;
  guardian_whatsapp: string;
  guardian_notes: string;
  address: string;
  school: string;
}

export interface PriceMatrix {
  [key: string]: number;
}

export interface PaymentInput {
  student_id: number;
  amount_paid: number;
  amount_remaining?: number | null;
  month_name: string;
  payment_date?: string | null;
  academic_year?: string;
}

export const INPUT_CLASS =
  'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500';