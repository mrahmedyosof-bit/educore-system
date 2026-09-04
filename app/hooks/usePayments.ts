'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  addPayment,
  updatePayment,
  getPayments,
  PaymentRecord as ServicePaymentRecord,
} from '@/lib/services/payments';
import { PaymentRecord } from '@/lib/services/payments';

interface UsePaymentsReturn {
  payments: PaymentRecord[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  addPayment: (input: {
    student_id: number;
    amount_paid: number;
    amount_remaining?: number | null;
    month_name: string;
    payment_date?: string | null;
  }) => Promise<void>;
  updatePayment: (id: number, input: {
    student_id: number;
    amount_paid: number;
    amount_remaining?: number | null;
    month_name: string;
    payment_date?: string | null;
  }) => Promise<void>;
  deletePayment: (id: number) => Promise<void>;
}

export function usePayments(): UsePaymentsReturn {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPayments();
      if (mountedRef.current) {
        setPayments(data);
      }
    } catch (err: unknown) {
      if (mountedRef.current) {
        const message = err instanceof Error ? err.message : 'خطأ غير معروف';
        setError(`فشل في تحميل المدفوعات: ${message}`);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const createPayment = useCallback(async (input: {
    student_id: number;
    amount_paid: number;
    amount_remaining?: number | null;
    month_name: string;
    payment_date?: string | null;
  }) => {
    setError(null);
    try {
      await addPayment(input);
      await refetch();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'خطأ غير معروف';
      setError(`فشل في إضافة الدفعة: ${message}`);
      throw err;
    }
  }, [refetch]);

  const updatePaymentRecord = useCallback(async (
    id: number,
    input: {
      student_id: number;
      amount_paid: number;
      amount_remaining?: number | null;
      month_name: string;
      payment_date?: string | null;
    }
  ) => {
    setError(null);
    try {
      await updatePayment(id, input);
      await refetch();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'خطأ غير معروف';
      setError(`فشل في تحديث الدفعة: ${message}`);
      throw err;
    }
  }, [refetch]);

  const deletePaymentRecord = useCallback(async (id: number) => {
    setError(null);
    try {
      // Assuming there's a deletePayment function in the service
      // For now, we'll just refetch after showing a message
      setError('حذف الدفعة غير مدعوم حالياً');
      throw new Error('Delete not implemented');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'خطأ غير معروف';
      setError(`فشل في حذف الدفعة: ${message}`);
      throw err;
    }
  }, []);

  return {
    payments,
    loading,
    error,
    refetch,
    addPayment: createPayment,
    updatePayment: updatePaymentRecord,
    deletePayment: deletePaymentRecord,
  };
}