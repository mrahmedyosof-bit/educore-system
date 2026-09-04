'use client';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  addStudent as addStudentService,
  deleteStudent as deleteStudentService,
  getStudents,
  getUniqueStudents,
  Student,
  StudentInput,
  StudentUpdateInput,
  updateStudent as updateStudentService,
} from '@/lib/services/students';
import { getFriendlyErrorMessage } from '@/lib/errors';
import { useTenant } from '@/components/TenantContext';

interface AppDataContext {
  // All subscriptions (rows) - one per student+subject+group
  students: Student[];
  // Deduplicated students - one per unique person (by barcode/phone)
  uniqueStudents: Student[];
  loading: boolean;
  error: string;
  refreshStudents: () => Promise<void>;
  addStudent: (student: StudentInput) => Promise<void>;
  updateStudent: (id: string | number, data: StudentUpdateInput) => Promise<void>;
  deleteStudent: (id: string | number) => Promise<void>;
}

const AppContext = createContext<AppDataContext | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [uniqueStudents, setUniqueStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // التوافق مع TenantContext (Phase 6C): AppProvider يعمل تحت TenantProvider
  // ويعيد تحميل البيانات عند تغيّر المستأجر الحالي. لا ينفّذ AppProvider أي
  // تفويض بنفسه — التفويض الحقيقي لاحقاً عبر Supabase RLS.
  const { currentTenant } = useTenant();
  const currentTenantId = currentTenant?.id ?? null;
  const loadedTenantRef = useRef<string | null | undefined>(undefined);

  // ✅ إصلاح: إضافة setLoading(true) في بداية refreshStudents
  const refreshStudents = useCallback(async () => {
    setLoading(true);
    try {
      const [allSubscriptions, uniq] = await Promise.all([
        getStudents(),
        getUniqueStudents(),
      ]);
      setStudents(allSubscriptions);
      setUniqueStudents(uniq);
      setError('');
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'تعذر تحميل بيانات الطلاب.'));
    } finally {
      setLoading(false);
    }
  }, []);

  // تحميل عند أول mount، وإعادة التحميل عند تغيّر المستأجر الحالي فقط.
  useEffect(() => {
    let cancelled = false;

    // تأجيل بسيط لميكروتاسك: تحديث الحالة لا يتم بشكل متزامن داخل جسم الأثر
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      // تجنّب إعادة جلب زائدة إذا بقي المستأجر نفسه.
      if (loadedTenantRef.current === currentTenantId) return;
      loadedTenantRef.current = currentTenantId;
      await refreshStudents();
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshStudents, currentTenantId]);

  const addStudent = useCallback(
    async (student: StudentInput) => {
      await addStudentService(student);
      await refreshStudents();
    },
    [refreshStudents]
  );

  const updateStudent = useCallback(
    async (id: string | number, data: StudentUpdateInput) => {
      await updateStudentService(id, data);
      await refreshStudents();
    },
    [refreshStudents]
  );

  const deleteStudent = useCallback(
    async (id: string | number) => {
      await deleteStudentService(id);
      await refreshStudents();
    },
    [refreshStudents]
  );

  const value = useMemo(
    () => ({
      students,
      uniqueStudents,
      loading,
      error,
      refreshStudents,
      addStudent,
      updateStudent,
      deleteStudent,
    }),
    [students, uniqueStudents, loading, error, refreshStudents, addStudent, updateStudent, deleteStudent]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppData(): AppDataContext {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useAppData must be used within an AppProvider');
  }
  return ctx;
}
