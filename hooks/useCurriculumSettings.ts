'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getCurriculumSetting,
  setCurriculumSetting,
  getPriceMatrix,
  savePriceMatrix,
  getGroupSchedules,
  saveGroupSchedules,
  upsertGroupSchedule,
  type PriceMatrix,
  type CurriculumKey,
  type GroupSchedule,
} from '@/lib/services/settings';

// القيم الافتراضية المتوافقة مع خيارات إضافة الطلاب
export const DEFAULT_STAGES = [
  'المرحلة الابتدائية',
  'المرحلة الإعدادية',
  'المرحلة الثانوية',
];

export const DEFAULT_GRADES = [
  'الصف الأول الابتدائي',
  'الصف الثاني الابتدائي',
  'الصف الثالث الابتدائي',
  'الصف الرابع الابتدائي',
  'الصف الخامس الابتدائي',
  'الصف السادس الابتدائي',
  'الصف الأول الإعدادي',
  'الصف الثاني الإعدادي',
  'الصف الثالث الإعدادي',
  'الصف الأول الثانوي',
  'الصف الثاني الثانوي',
  'الصف الثالث الثانوي',
];

export const DEFAULT_SUBJECTS = [
  'الرياضيات',
  'العلوم',
  'اللغة الإنجليزية',
  'الدراسات الاجتماعية',
  'الفيزياء',
  'الكيمياء',
];

interface CurriculumSettings {
  stages: string[];
  grades: string[];
  subjects: string[];
  priceMatrix: PriceMatrix;
  groupSchedules: Record<string, GroupSchedule>;
  loading: boolean;
  error: string;
  saving: boolean;
  addItem: (key: CurriculumKey, value: string) => Promise<boolean>;
  savePrices: (matrix: PriceMatrix) => Promise<boolean>;
  saveGroupSchedule: (schedule: GroupSchedule) => Promise<boolean>;
  deleteGroupSchedule: (groupName: string) => Promise<boolean>;
}

/**
 * Hook موحد لإدارة المراحل/الصفوف/المواد محفوظة في Supabase.
 * يُستخدم في SetupTab وقسم التهيئة في DashboardTab لضمان مصدر واحد للبيانات.
 */
export function useCurriculumSettings(): CurriculumSettings {
  const [stages, setStages] = useState<string[]>(DEFAULT_STAGES);
  const [grades, setGrades] = useState<string[]>(DEFAULT_GRADES);
  const [subjects, setSubjects] = useState<string[]>(DEFAULT_SUBJECTS);
  const [gradeFees, setPriceMatrixState] = useState<PriceMatrix>({});
  const [groupSchedules, setGroupSchedules] = useState<Record<string, GroupSchedule>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      await Promise.resolve();
      if (cancelled) return;

      try {
        const [savedStages, savedGrades, savedSubjects, savedPrices, savedGroupSchedules] = await Promise.all([
          getCurriculumSetting('stages'),
          getCurriculumSetting('grades'),
          getCurriculumSetting('subjects'),
          getPriceMatrix(),
          getGroupSchedules(),
        ]);

        if (cancelled) return;

        if (savedStages) setStages(savedStages);
        if (savedGrades) setGrades(savedGrades);
        if (savedSubjects) setSubjects(savedSubjects);
        setPriceMatrixState(savedPrices);
        setGroupSchedules(savedGroupSchedules);
        setError('');
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'تعذر تحميل الإعدادات المحفوظة. تأكد من إنشاء جدول app_settings.'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const addItem = useCallback(
    async (key: CurriculumKey, rawValue: string): Promise<boolean> => {
      const value = rawValue.trim();
      const current =
        key === 'stages' ? stages : key === 'grades' ? grades : subjects;

      if (!value) return false;
      if (current.includes(value)) {
        setError(`"${value}" مضافة بالفعل.`);
        return false;
      }

      setSaving(true);
      setError('');

      try {
        const next = [...current, value];
        await setCurriculumSetting(key, next);

        if (key === 'stages') setStages(next);
        else if (key === 'grades') setGrades(next);
        else setSubjects(next);

        return true;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'تعذر حفظ الإضافة في قاعدة البيانات.'
        );
        return false;
      } finally {
        setSaving(false);
      }
    },
    [stages, grades, subjects]
  );

  const savePrices = useCallback(
    async (matrix: PriceMatrix): Promise<boolean> => {
      setSaving(true);
      setError('');

      try {
        await savePriceMatrix(matrix);
        setPriceMatrixState(matrix);
        return true;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'تعذر حفظ أسعار الاشتراك في قاعدة البيانات.'
        );
        return false;
      } finally {
        setSaving(false);
      }
    },
    []
  );

  const saveGroupSchedule = useCallback(
    async (schedule: GroupSchedule): Promise<boolean> => {
      setSaving(true);
      setError('');

      try {
        await upsertGroupSchedule(schedule);
        setGroupSchedules((prev) => ({ ...prev, [schedule.groupName]: schedule }));
        return true;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'تعذر حفظ مواعيد المجموعة في قاعدة البيانات.'
        );
        return false;
      } finally {
        setSaving(false);
      }
    },
    []
  );

  const deleteGroupSchedule = useCallback(
    async (groupName: string): Promise<boolean> => {
      setSaving(true);
      setError('');

      try {
        const current = { ...groupSchedules };
        delete current[groupName];
        await saveGroupSchedules(current);
        setGroupSchedules(current);
        return true;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'تعذر حذف مواعيد المجموعة من قاعدة البيانات.'
        );
        return false;
      } finally {
        setSaving(false);
      }
    },
    [groupSchedules]
  );

  return useMemo(
    () => ({
      stages,
      grades,
      subjects,
      priceMatrix: gradeFees,
      groupSchedules,
      loading,
      error,
      saving,
      addItem,
      savePrices,
      saveGroupSchedule,
      deleteGroupSchedule,
    }),
    [stages, grades, subjects, gradeFees, groupSchedules, loading, error, saving, addItem, savePrices, saveGroupSchedule, deleteGroupSchedule]
  );
}
