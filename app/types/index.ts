export interface Student {
  id: number;
  name: string;
  phone: string | null;
  parent_phone: string;
  group_name: string | null;
  created_at: string | null;
  grade: string | null;
  student_code: string | null;
  behavior_rating: string | null;
  discount_type: string | null;
  subject: string | null;
  due_amount: number | null;
  discount_amount: number | null;
  stage: string | null;
  grade_level: string | null;
  subjects: string[] | null;
  parent_whatsapp: string | null;
  student_phone: string | null;
  is_exempt: boolean | null;
  address: string | null;
  school: string | null;
  guardian_notes: string | null;
}

export interface Attendance {
  id: number;
  student_id: number | null;
  date: string | null;
  status: string | null;
  reason: string | null;
  created_at: string | null;
}

export interface Grade {
  id: number;
  student_id: number | null;
  exam_name: string;
  score: number;
  max_score: number;
  notes: string | null;
  created_at: string | null;
}

export interface Payment {
  id: number;
  student_id: number | null;
  amount_paid: number;
  amount_remaining: number | null;
  month_name: string;
  academic_year: string | null;
  created_at: string | null;
  payment_date: string | null;
}

export interface StudentFullData extends Student {
  attendance?: Attendance[];
  grades?: Grade[];
  payments?: Payment[];
}