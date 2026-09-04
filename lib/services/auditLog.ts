import { supabase } from '@/lib/supabase';

/**
 * سجل التدقيق: يُخزَّن في جدول audit_log في قاعدة البيانات
 * (يُنشأ بسكريبت 10). سياسات RLS تسمح بالإدراج والقراءة فقط،
 * فلا يمكن تعديل السجلات أو محوها من التطبيق.
 */

export interface AuditEntryInput {
  action: string;
  entity: string;
  entity_id?: string | null;
  details?: Record<string, unknown>;
}

export interface AuditEntryRow {
  id: number;
  user_id: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export async function addAuditEntry(input: AuditEntryInput): Promise<void> {
  let userId: string | null = null;
  let userEmail: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
    userEmail = data.user?.email ?? null;
  } catch {
    /* بدون جلسة: نسجل العملية دون مستخدم */
  }

  const details = {
    ...(input.details ?? {}),
    ...(userEmail ? { userEmail } : {}),
  };

  const { error } = await supabase.from('audit_log').insert([
    {
      user_id: userId,
      action: input.action,
      entity: input.entity,
      entity_id: input.entity_id ?? null,
      details,
    },
  ]);

  if (error) throw error;
}

export async function getRecentAuditLogs(limit = 200): Promise<AuditEntryRow[]> {
  const { data, error } = await supabase
    .from('audit_log')
    .select('id, user_id, action, entity, entity_id, details, created_at')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data as AuditEntryRow[] | null) ?? [];
}
