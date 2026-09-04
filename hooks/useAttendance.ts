'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  addAttendance,
  addAttendanceBulk,
  updateAttendance,
  updateAttendanceRecord,
  deleteAttendance,
  getAttendance,
  AttendanceRecord,
  AttendanceStatus,
} from '@/lib/services/attendance';
import { Student } from '@/lib/services/students';
import { PaymentRecord } from '@/lib/services/payments';

interface OptimisticAttendanceRecord extends AttendanceRecord {
  isOptimistic?: boolean;
}

interface UseAttendanceReturn {
  records: AttendanceRecord[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  addAttendance: (input: {
    student_id: number;
    date: string;
    status: AttendanceStatus;
    reason?: string | null;
  }) => Promise<void>;
  addAttendanceBulk: (inputs: {
    student_id: number;
    date: string;
    status: AttendanceStatus;
    reason?: string | null;
  }[]) => Promise<{ saved: number }>;
  updateAttendance: (id: number, status: AttendanceStatus) => Promise<void>;
  updateAttendanceRecord: (id: number, input: {
    student_id: number;
    date: string;
    status: AttendanceStatus;
    reason?: string | null;
  }) => Promise<void>;
  deleteAttendance: (id: number) => Promise<void>;
  // Optimistic update helpers
  applyOptimisticUpdate: (record: AttendanceRecord) => void;
  rollbackOptimisticUpdate: (id: number) => void;
}

interface OptimisticState {
  records: OptimisticAttendanceRecord[];
  pendingMutations: Map<number, { timestamp: number }>;
}

export function useAttendance(): UseAttendanceReturn {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [optimisticState, setOptimisticState] = useState<OptimisticState>({
    records: [],
    pendingMutations: new Map(),
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAttendance();
      if (mountedRef.current) {
        // Merge server data with optimistic updates
        const serverRecords = data;
        const optimisticRecords = optimisticState.records.filter(r => r.isOptimistic);
        // Keep optimistic records that haven't been confirmed by server
        const mergedRecords = [...serverRecords, ...optimisticRecords];
        setRecords(mergedRecords);
      }
    } catch (err: unknown) {
      if (mountedRef.current) {
        const message = err instanceof Error ? err.message : 'خطأ غير معروف';
        setError(`فشل في تحميل بيانات الحضور: ${message}`);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [optimisticState]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const applyOptimisticUpdate = useCallback((record: AttendanceRecord) => {
    setOptimisticState(prev => {
      const optimisticRecord: OptimisticAttendanceRecord = {
        ...record,
        isOptimistic: true,
      };
      const newRecords = [...prev.records.filter(r => r.id !== record.id), optimisticRecord];
      return {
        ...prev,
        records: newRecords,
        pendingMutations: new Map(prev.pendingMutations).set(record.id, {
          timestamp: Date.now(),
        }),
      };
    });
  }, []);

  const rollbackOptimisticUpdate = useCallback((id: number) => {
    setOptimisticState(prev => {
      const newPendingMutations = new Map(prev.pendingMutations);
      newPendingMutations.delete(id);
      return {
        ...prev,
        records: prev.records.filter(r => r.id !== id),
        pendingMutations: newPendingMutations,
      };
    });
  }, []);

  const createAttendance = useCallback(async (input: {
    student_id: number;
    date: string;
    status: AttendanceStatus;
    reason?: string | null;
  }) => {
    setError(null);
    try {
      const optimisticRecord: OptimisticAttendanceRecord = {
        id: Date.now(), // temporary ID
        student_id: input.student_id,
        date: input.date,
        status: input.status,
        reason: input.reason || null,
        created_at: new Date().toISOString(),
        isOptimistic: true,
      };

      // Apply optimistic update immediately
      applyOptimisticUpdate(optimisticRecord);

      // Send to server
      await addAttendance({
        student_id: input.student_id,
        date: input.date,
        status: input.status,
        reason: input.reason || null,
      });

      // Refetch to get server-confirmed record
      await refetch();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'خطأ غير معروف';
      setError(`فشل في تسجيل الحضور: ${message}`);
      throw err;
    }
  }, [refetch]);

  const createAttendanceBulk = useCallback(async (inputs: {
    student_id: number;
    date: string;
    status: AttendanceStatus;
    reason?: string | null;
  }[]) => {
    setError(null);
    try {
      // Apply all optimistic updates
      const optimisticRecords: OptimisticAttendanceRecord[] = inputs.map((input, index) => ({
        id: Date.now() + index,
        student_id: input.student_id,
        date: input.date,
        status: input.status,
        reason: input.reason || null,
        created_at: new Date().toISOString(),
        isOptimistic: true as const,
      }));

      setOptimisticState(prev => ({
        records: [...prev.records, ...optimisticRecords],
        pendingMutations: new Map(prev.pendingMutations),
      }));

      const { saved } = await addAttendanceBulk(inputs);
      await refetch();

      return { saved };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'خطأ غير معروف';
      setError(`فشل في الحفظ الجماعي: ${message}`);
      throw err;
    }
  }, [refetch]);

  const updateAttendanceStatusById = useCallback(async (
    id: number,
    status: AttendanceStatus
  ) => {
    setError(null);
    try {
      // Find the record to update
      const record = records.find(r => r.id === id) || optimisticState.records.find(r => r.id === id);
      if (!record) throw new Error('Record not found');

      const optimisticRecord: OptimisticAttendanceRecord = {
        ...record,
        status,
        isOptimistic: true,
      };

      applyOptimisticUpdate(optimisticRecord);
      await updateAttendance(id, status);
      await refetch();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'خطأ غير معروف';
      setError(`فشل في تحديث الحضور: ${message}`);
      throw err;
    }
  }, [records, optimisticState, refetch]);

  const updateAttendanceRecordById = useCallback(async (
    id: number,
    input: {
      student_id: number;
      date: string;
      status: AttendanceStatus;
      reason?: string | null;
    }
  ) => {
    setError(null);
    try {
      const record = records.find(r => r.id === id) || optimisticState.records.find(r => r.id === id);
      if (!record) throw new Error('Record not found');

      const optimisticRecord: OptimisticAttendanceRecord = {
        ...record,
        ...input,
        isOptimistic: true,
      };

      applyOptimisticUpdate(optimisticRecord);
      await updateAttendanceRecord(id, input);
      await refetch();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'خطأ غير معروف';
      setError(`فشل في تحديث سجل الحضور: ${message}`);
      throw err;
    }
  }, [records, optimisticState, refetch]);

  const deleteAttendanceRecord = useCallback(async (id: number) => {
    setError(null);
    try {
      const record = records.find(r => r.id === id) || optimisticState.records.find(r => r.id === id);
      if (!record) throw new Error('Record not found');

      // Apply optimistic delete
      setOptimisticState(prev => ({
        records: prev.records.filter(r => r.id !== id),
        pendingMutations: new Map(prev.pendingMutations),
      }));

      await deleteAttendance(id);
      await refetch();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'خطأ غير معروف';
      setError(`فشل في حذف سجل الحضور: ${message}`);
      throw err;
    }
  }, [records, optimisticState, refetch]);

  return {
    records,
    loading,
    error,
    refetch,
    addAttendance: createAttendance,
    addAttendanceBulk: createAttendanceBulk,
    updateAttendance: updateAttendanceStatusById,
    updateAttendanceRecord: updateAttendanceRecordById,
    deleteAttendance: deleteAttendanceRecord,
    applyOptimisticUpdate,
    rollbackOptimisticUpdate,
  };
}