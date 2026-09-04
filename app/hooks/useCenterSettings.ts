'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface CenterSettings {
  centerName: string;
  academicYear: string;
  phone?: string;
  address?: string;
  whatsapp?: string;
}

const DEFAULT_SETTINGS: CenterSettings = {
  centerName: 'مركز الأستاذ أحمد الشرقاوي التعليمي',
  academicYear: '2026/2027',
};

const STORAGE_KEY = 'educore_center_settings';
const TABLE_NAME = 'center_settings';

/**
 * دالة لتوليد قائمة السنوات الدراسية ديناميكياً
 * تُحل مشكلة الاستيراد المفقود في FinanceTab.tsx
 */
export function generateAcademicYears(startYear = 2023, yearsAhead = 5): string[] {
  const years: string[] = [];
  const currentYear = new Date().getFullYear();
  const endYear = Math.max(currentYear + 2, startYear + yearsAhead);

  for (let y = startYear; y <= endYear; y++) {
    years.push(`${y}/${y + 1}`);
  }

  return years;
}

export function useCenterSettings() {
  const [settings, setSettings] = useState<CenterSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recordId, setRecordId] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from(TABLE_NAME)
        .select('*')
        .limit(1)
        .maybeSingle();

      if (fetchError) {
        console.warn('⚠️ تعذر الجلب من Supabase، استخدام localStorage:', fetchError.message);
        const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
        if (stored) {
          setSettings(JSON.parse(stored));
        }
        return;
      }

      if (data) {
        setRecordId(data.id); // حفظ الـ UUID الخاص بالسجل
        const mapped: CenterSettings = {
          centerName: data.center_name || DEFAULT_SETTINGS.centerName,
          academicYear: data.academic_year || DEFAULT_SETTINGS.academicYear,
          phone: data.phone || undefined,
          address: data.address || undefined,
          whatsapp: data.whatsapp || undefined,
        };
        setSettings(mapped);
        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(mapped));
        }
      }
    } catch (err) {
      console.error('❌ خطأ في جلب إعدادات المركز:', err);
      const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
      if (stored) {
        setSettings(JSON.parse(stored));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await Promise.resolve();
      await fetchSettings();
    })();
  }, [fetchSettings]);

  const updateSettings = useCallback(
    async (updates: Partial<CenterSettings>) => {
      try {
        setSaving(true);
        setError(null);

        const payload: Record<string, unknown> = {
          center_name: updates.centerName ?? settings.centerName,
          academic_year: updates.academicYear ?? settings.academicYear,
          phone: updates.phone ?? settings.phone ?? null,
          address: updates.address ?? settings.address ?? null,
          whatsapp: updates.whatsapp ?? settings.whatsapp ?? null,
          updated_at: new Date().toISOString(),
        };

        // إضافة الـ UUID في حال توفره بدلاً من id: 1
        if (recordId) {
          payload.id = recordId;
        }

        const { data: upsertData, error: upsertError } = await supabase
          .from(TABLE_NAME)
          .upsert(payload)
          .select('id')
          .single();

        if (upsertError) {
          throw upsertError;
        }

        if (upsertData?.id) {
          setRecordId(upsertData.id);
        }

        const newSettings: CenterSettings = { ...settings, ...updates };
        setSettings(newSettings);
        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings));
        }
      } catch (err) {
        console.error('❌ خطأ في حفظ إعدادات المركز:', err);
        const message = err instanceof Error ? err.message : 'فشل حفظ الإعدادات';
        setError(message);
        
        // التحديث في localStorage كبديل محلي
        const newSettings: CenterSettings = { ...settings, ...updates };
        setSettings(newSettings);
        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings));
        }
      } finally {
        setSaving(false);
      }
    },
    [settings, recordId]
  );

  const updateCenterName = useCallback(
    (centerName: string) => updateSettings({ centerName }),
    [updateSettings]
  );

  const updateAcademicYear = useCallback(
    (academicYear: string) => updateSettings({ academicYear }),
    [updateSettings]
  );

  return {
    settings,
    loading,
    saving,
    error,
    updateSettings,
    updateCenterName,
    updateAcademicYear,
    refresh: fetchSettings,
  };
}