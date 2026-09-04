import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase'; // عدل المسار حسب مشروعك

export interface SubscriptionData {
  planName: string;
  planCode: 'FREE' | 'BASIC' | 'PRO' | 'UNLIMITED';
  status: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'EXPIRED' | 'CANCELED';
  maxStudents: number | null;
  currentStudentCount: number;
  features: {
    whatsapp: boolean;
    advanced_reports: boolean;
  };
  daysRemaining: number;
  isExpired: boolean;
}

export function useSubscription(tenantId: string | null | undefined) {
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSubscriptionDetails = useCallback(async (isMounted: () => boolean) => {
    if (!tenantId) {
      setSubscription(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // 1. جلب بيانات الاشتراك والخطة
      const { data: sub, error: subError } = await supabase
        .from('subscriptions')
        .select(`
          status,
          current_period_end,
          plans (
            name,
            code,
            max_students,
            features
          )
        `)
        .eq('tenant_id', tenantId)
        .maybeSingle(); // استخدام maybeSingle لتجنب Exception في حال عدم وجود سجل

      if (subError) throw subError;

      // 2. جلب عدد الطلاب الحاليين لهذا المركز
      const { count, error: countError } = await supabase
        .from('students')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);

      if (countError) throw countError;

      if (!sub) {
        throw new Error('لم يتم العثور على اشتراك لهذا المركز');
      }

      // 3. حساب الأيام المتبقية وحالة الانتهاء
      const periodEnd = new Date(sub.current_period_end);
      const today = new Date();
      const diffTime = periodEnd.getTime() - today.getTime();
      const daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

      // استخراج الخطة وتجنب any
      const plan = Array.isArray(sub.plans) ? sub.plans[0] : sub.plans;

      if (isMounted()) {
        setSubscription({
          planName: plan?.name || 'غير معروف',
          planCode: plan?.code || 'FREE',
          status: sub.status,
          maxStudents: plan?.max_students ?? null,
          currentStudentCount: count || 0,
          features: plan?.features || { whatsapp: false, advanced_reports: false },
          daysRemaining,
          isExpired: daysRemaining === 0 || sub.status === 'EXPIRED' || sub.status === 'CANCELED',
        });
      }
    } catch (err: any) {
      console.error('Error fetching subscription:', err);
      if (isMounted()) {
        setError(err);
      }
    } finally {
      if (isMounted()) {
        setLoading(false);
      }
    }
  }, [tenantId]);

  useEffect(() => {
    let mounted = true;
    const isMounted = () => mounted;

    fetchSubscriptionDetails(isMounted);

    return () => {
      mounted = false;
    };
  }, [fetchSubscriptionDetails]);

  // إرجاع دالة refetch لتحديث البيانات يدوياً عند إضافة طالب أو تجديد الاشتراك
  const refetch = () => fetchSubscriptionDetails(() => true);

  return { subscription, loading, error, refetch };
}