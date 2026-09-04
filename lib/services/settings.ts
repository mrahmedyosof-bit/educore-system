import { supabase } from '@/lib/supabase';

export type CurriculumKey = 'stages' | 'grades' | 'subjects' | 'grade_fees' | 'group_schedules';

interface AppSettingsRow {
  key: string;
  value: unknown;
}

/**
 * جلب قائمة مخصصة من جدول الإعدادات.
 * يعيد null إذا لم يكن هناك صف محفوظ بعد.
 */
export async function getCurriculumSetting(
  key: CurriculumKey
): Promise<string[] | null> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value')
    .eq('key', key)
    .maybeSingle();

  if (error) throw error;

  const row = data as AppSettingsRow | null;
  if (!row || !Array.isArray(row.value)) return null;
  return row.value.filter((item): item is string => typeof item === 'string');
}

/**
 * حفظ قائمة كاملة (استبدال القيمة السابقة).
 */
export async function setCurriculumSetting(
  key: CurriculumKey,
  values: string[]
): Promise<void> {
  const trimmed = values.map((v) => v.trim()).filter(Boolean);

  const { error } = await supabase.from('app_settings').upsert(
    { key, value: trimmed },
    { onConflict: 'key' }
  );

  if (error) throw error;
}

/**
 * شبكة أسعار الاشتراك لكل (صف + مادة).
 * تُخزن في app_settings تحت المفتاح 'grade_subject_prices'
 * على شكل { "الصف::المادة": السعر }.
 */
export type PriceMatrix = Record<string, number>;

/** بناء مفتاح موحد لزوج (صف، مادة). */
export const priceKey = (grade: string, subject: string): string =>
  `${grade.trim()}::${subject.trim()}`;

const PRICES_SETTING_KEY = 'grade_subject_prices';

export async function getPriceMatrix(): Promise<PriceMatrix> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value')
    .eq('key', PRICES_SETTING_KEY)
    .maybeSingle();

  if (error) throw error;

  const row = data as AppSettingsRow | null;
  if (!row || typeof row.value !== 'object' || row.value === null || Array.isArray(row.value)) {
    return {};
  }

  const entries = Object.entries(row.value as Record<string, unknown>).filter(
    (entry): entry is [string, number] => typeof entry[1] === 'number'
  );

  return Object.fromEntries(entries);
}

export async function savePriceMatrix(matrix: PriceMatrix): Promise<void> {
  const cleaned: PriceMatrix = {};
  Object.entries(matrix).forEach(([key, amount]) => {
    const name = key.trim();
    if (!name) return;
    const value = Number(amount);
    if (Number.isFinite(value) && value >= 0) {
      cleaned[name] = value;
    }
  });

  const { error } = await supabase.from('app_settings').upsert(
    { key: PRICES_SETTING_KEY, value: cleaned },
    { onConflict: 'key' }
  );

  if (error) throw error;
}

/* ==================== مواعيد المجموعات (Group Schedules) ==================== */

export interface GroupSchedule {
  groupName: string;
  days: string[];           // أيام الدراسة: ['saturday', 'monday', 'wednesday'] أو بالعربي
  startTime: string;        // HH:MM
  endTime: string;          // HH:MM
  lateThresholdMinutes?: number; // حد التأخير المخصص للمجموعة (اختياري، الافتراضي 15 دقيقة)
}

const GROUP_SCHEDULES_KEY = 'group_schedules';

export async function getGroupSchedules(): Promise<Record<string, GroupSchedule>> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value')
    .eq('key', GROUP_SCHEDULES_KEY)
    .maybeSingle();

  if (error) throw error;

  const row = data as AppSettingsRow | null;
  if (!row || typeof row.value !== 'object' || row.value === null || Array.isArray(row.value)) {
    return {};
  }

  const value = row.value as Record<string, GroupSchedule>;
  // Validate structure
  const validated: Record<string, GroupSchedule> = {};
  Object.entries(value).forEach(([key, schedule]) => {
    if (schedule && typeof schedule === 'object' &&
        typeof schedule.groupName === 'string' &&
        Array.isArray(schedule.days) &&
        typeof schedule.startTime === 'string' &&
        typeof schedule.endTime === 'string') {
      validated[key] = {
        groupName: schedule.groupName,
        days: schedule.days.filter(d => typeof d === 'string'),
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        lateThresholdMinutes: typeof schedule.lateThresholdMinutes === 'number' && Number.isFinite(schedule.lateThresholdMinutes) && schedule.lateThresholdMinutes >= 0
          ? schedule.lateThresholdMinutes
          : undefined,
      };
    }
  });
  return validated;
}

export async function saveGroupSchedules(schedules: Record<string, GroupSchedule>): Promise<void> {
  const cleaned: Record<string, GroupSchedule> = {};
  Object.entries(schedules).forEach(([key, schedule]) => {
    if (!schedule.groupName?.trim()) return;
    cleaned[key] = {
      groupName: schedule.groupName.trim(),
      days: schedule.days.filter(d => d?.trim()),
      startTime: schedule.startTime?.trim() || '08:00',
      endTime: schedule.endTime?.trim() || '14:00',
      lateThresholdMinutes: typeof schedule.lateThresholdMinutes === 'number' && Number.isFinite(schedule.lateThresholdMinutes) && schedule.lateThresholdMinutes >= 0
        ? schedule.lateThresholdMinutes
        : undefined,
    };
  });

  const { error } = await supabase.from('app_settings').upsert(
    { key: GROUP_SCHEDULES_KEY, value: cleaned },
    { onConflict: 'key' }
  );

  if (error) throw error;
}

export async function upsertGroupSchedule(schedule: GroupSchedule): Promise<void> {
  const existing = await getGroupSchedules();
  existing[schedule.groupName] = schedule;
  await saveGroupSchedules(existing);
}
