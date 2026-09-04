import { supabase } from '@/lib/supabase';

export interface Material {
  id: number;
  name: string;
  grade: string | null;
  subject: string | null;
  price: number;
  quantity: number;
  low_stock: number;
  created_at: string | null;
}

export interface MaterialInput {
  name: string;
  grade: string | null;
  subject: string | null;
  price: number;
  quantity: number;
  low_stock: number;
}

const validateMaterial = (input: MaterialInput): void => {
  if (!input.name.trim()) throw new Error('اسم الملزمة مطلوب.');
  if (!Number.isFinite(input.price) || input.price < 0) throw new Error('سعر البيع غير صالح.');
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 0)
    throw new Error('الكمية غير صالحة.');
  if (!Number.isSafeInteger(input.low_stock) || input.low_stock < 0)
    throw new Error('حد التنبيه غير صالح.');
};

export async function getMaterials(): Promise<Material[]> {
  const { data, error } = await supabase
    .from('materials')
    .select('id, name, grade, subject, price, quantity, low_stock, created_at')
    .order('id', { ascending: false });

  if (error) throw error;

  return ((data as Material[] | null) ?? []).map((row) => ({
    ...row,
    price: Number(row.price),
    quantity: Number(row.quantity),
    low_stock: Number(row.low_stock),
  }));
}

export async function addMaterial(input: MaterialInput): Promise<void> {
  validateMaterial(input);

  const { error } = await supabase.from('materials').insert([
    {
      name: input.name.trim(),
      grade: input.grade,
      subject: input.subject,
      price: input.price,
      quantity: input.quantity,
      low_stock: input.low_stock,
    },
  ]);

  if (error) throw error;
}

export async function updateMaterial(
  id: number,
  patch: Partial<MaterialInput>
): Promise<void> {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('معرف الملزمة غير صالح.');

  const payload: Record<string, unknown> = {};
  if (patch.name !== undefined) payload.name = patch.name.trim();
  if (patch.grade !== undefined) payload.grade = patch.grade;
  if (patch.subject !== undefined) payload.subject = patch.subject;
  if (patch.price !== undefined) payload.price = patch.price;
  if (patch.quantity !== undefined) payload.quantity = patch.quantity;
  if (patch.low_stock !== undefined) payload.low_stock = patch.low_stock;

  if (Object.keys(payload).length === 0) return;

  const { error } = await supabase.from('materials').update(payload).eq('id', id);
  if (error) throw error;
}

export async function deleteMaterial(id: number): Promise<void> {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('معرف الملزمة غير صالح.');

  const { error } = await supabase.from('materials').delete().eq('id', id);
  if (error) throw error;
}

export interface DeliverResult {
  total: number;
}

/**
 * تسليم ملزمة: خصم الكمية من المخزون فقط.
 * التحصيل المالي (إن وجد) يُسجَّل صراحةً من تبويب المالية حتى لا تختلط
 * مبيعات الملامز باشتراكات الطلاب في جدول المدفوعات.
 */
export async function deliverMaterial(
  material: Material,
  qty: number
): Promise<DeliverResult> {
  if (!Number.isSafeInteger(qty) || qty <= 0) throw new Error('الكمية المطلوبة غير صالحة.');
  if (qty > material.quantity) throw new Error('الكمية المطلوبة أكبر من المخزون المتاح.');

  const total = Math.round(material.price * qty * 100) / 100;

  const { error: updateError } = await supabase
    .from('materials')
    .update({ quantity: material.quantity - qty })
    .eq('id', material.id);

  if (updateError) throw updateError;

  return { total };
}
