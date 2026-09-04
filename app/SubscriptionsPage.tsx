'use client';
import React, { useState } from 'react';
import { 
  CheckCircle2, 
  AlertTriangle, 
  Crown, 
  Users, 
  MessageSquare, 
  TrendingUp, 
  ShieldCheck, 
  CreditCard,
  X,
  Sparkles
} from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription'; // الـ Hook المطور سابقاً

// معرف المركز التجريبي (استبدله بالـ tenant_id الحالي لديك من Auth Context)
const CURRENT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

interface PlanCardProps {
  name: string;
  code: string;
  price: string;
  studentsLimit: string;
  features: string[];
  isCurrent: boolean;
  isPopular?: boolean;
  onSelect: () => void;
}

function PlanCard({
  name,
  code,
  price,
  studentsLimit,
  features,
  isCurrent,
  isPopular,
  onSelect
}: PlanCardProps) {
  return (
    <div className={`relative flex flex-col justify-between rounded-2xl border p-6 shadow-sm transition-all duration-200 hover:shadow-md ${
      isPopular ? 'border-indigo-500 ring-2 ring-indigo-500/20 bg-indigo-50/10' : 'border-gray-200 bg-white'
    }`}>
      {isPopular && (
        <span className="absolute -top-3 right-6 rounded-full bg-indigo-600 px-3 py-1 text-xs font-bold text-white shadow-sm flex items-center gap-1">
          <Sparkles className="w-3 h-3" /> الأكثر شعبية
        </span>
      )}

      <div>
        <h3 className="text-xl font-bold text-gray-900">{name}</h3>
        <p className="mt-2 text-sm text-gray-500">سعة الطلاب: <span className="font-semibold text-gray-800">{studentsLimit}</span></p>
        
        <div className="mt-4 flex items-baseline gap-1">
          <span className="text-3xl font-extrabold text-gray-900">{price}</span>
          {price !== 'مجاناً' && <span className="text-sm font-medium text-gray-500">/ شهرياً</span>}
        </div>

        <ul className="mt-6 space-y-3 border-t border-gray-100 pt-6">
          {features.map((feature, index) => (
            <li key={index} className="flex items-center gap-2 text-sm text-gray-600">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-8">
        {isCurrent ? (
          <button
            disabled
            className="w-full rounded-xl bg-emerald-50 py-3 text-sm font-bold text-emerald-700 border border-emerald-200 cursor-default"
          >
            باقلتك الحالية ✅
          </button>
        ) : (
          <button
            onClick={onSelect}
            className={`w-full rounded-xl py-3 text-sm font-bold transition-all ${
              isPopular 
                ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-200' 
                : 'bg-gray-900 text-white hover:bg-gray-800'
            }`}
          >
            ترقية إلى هذه الباقة
          </button>
        )}
      </div>
    </div>
  );
}

export default function SubscriptionsPage() {
  const { subscription, loading, refetch } = useSubscription(CURRENT_TENANT_ID);
  const [selectedPlanForUpgrade, setSelectedPlanForUpgrade] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
      </div>
    );
  }

  // حساب نسبة استخدام حد الطلاب
  const studentLimit = subscription?.maxStudents;
  const currentStudents = subscription?.currentStudentCount || 0;
  const usagePercentage = studentLimit 
    ? Math.min(100, Math.round((currentStudents / studentLimit) * 100))
    : 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8" dir="rtl">
      
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Crown className="h-7 w-7 text-indigo-600" />
          إدارة الاشتراك والخطط
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          استعرض تفاصيل باقتك الحالية أو قم بالترقية للوصول لسعة أكبر وميزات متقدمة.
        </p>
      </div>

      {/* Current Subscription Status Card */}
      <div className="mb-10 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">حالة الاشتراك الحالية</span>
                <span className={`rounded-full px-3 py-0.5 text-xs font-bold ${
                  subscription?.status === 'ACTIVE' 
                    ? 'bg-emerald-100 text-emerald-800' 
                    : subscription?.status === 'TRIAL'
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-amber-100 text-amber-800'
                }`}>
                  {subscription?.status === 'ACTIVE' ? 'نشط' : subscription?.status === 'TRIAL' ? 'فترة تجريبية' : 'منتهي'}
                </span>
              </div>
              <h2 className="mt-1 text-2xl font-black text-gray-900">{subscription?.planName}</h2>
            </div>

            <div className="flex items-center gap-6">
              <div className="text-left md:text-right">
                <p className="text-xs text-gray-500">المتبقي في الاشتراك</p>
                <p className="text-lg font-bold text-gray-800">{subscription?.daysRemaining} يوم</p>
              </div>
            </div>
          </div>
        </div>

        {/* Progress & Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-white">
          {/* Student Usage */}
          <div>
            <div className="flex justify-between items-center mb-2 text-sm font-semibold">
              <span className="text-gray-700 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-indigo-600" /> استهلاك عدد الطلاب
              </span>
              <span className="text-gray-900">
                {currentStudents} / {studentLimit ?? 'غير محدود'} طالب
              </span>
            </div>
            {studentLimit && (
              <div>
                <div className="h-3 w-full rounded-full bg-gray-100 overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-300 ${
                      usagePercentage > 90 ? 'bg-red-500' : usagePercentage > 75 ? 'bg-amber-500' : 'bg-indigo-600'
                    }`}
                    style={{ width: `${usagePercentage}%` }}
                  />
                </div>
                {usagePercentage >= 90 && (
                  <p className="mt-1.5 text-xs font-medium text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> اقتربت من الحد الأقصى للطلاب! يُنصح بالترقية.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Active Features Summary */}
          <div className="border-t md:border-t-0 md:border-r border-gray-100 pt-4 md:pt-0 md:pr-6 flex items-center justify-between">
            <div className="space-y-2">
              <span className="text-xs font-bold text-gray-400 block">الميزات المفعلة لديك</span>
              <div className="flex flex-wrap gap-2">
                <span className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold ${
                  subscription?.features.whatsapp ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-400'
                }`}>
                  <MessageSquare className="w-3 h-3" /> إشعارات الواتساب
                </span>
                <span className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold ${
                  subscription?.features.advanced_reports ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-gray-100 text-gray-400'
                }`}>
                  <TrendingUp className="w-3 h-3" /> التقارير المتقدمة
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Available Plans Section */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">الخطط والباقات المتاحة</h2>
        <p className="text-sm text-gray-500">اختر الخطة المناسبة لحجم مركزك التعليمي وتوسع بسهولة.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <PlanCard
          name="التجريبية"
          code="FREE"
          price="مجاناً"
          studentsLimit="50 طالب"
          features={[
            'إدارة حتى 50 طالب',
            'تسجيل الحضور والغياب',
            'سجل الدفعات المالية الأساسي',
            'دعم عبر البريد الإلكتروني'
          ]}
          isCurrent={subscription?.planCode === 'FREE'}
          onSelect={() => setSelectedPlanForUpgrade('FREE')}
        />

        <PlanCard
          name="الأساسية"
          code="BASIC"
          price="299 ج.م"
          studentsLimit="250 طالب"
          features={[
            'إدارة حتى 250 طالب',
            'إرسال إشعارات الواتساب تلقائياً',
            'إدارة حتى 10 مدرسين',
            'تقارير الإيرادات الشهرية',
            'دعم فني عبر الواتساب'
          ]}
          isCurrent={subscription?.planCode === 'BASIC'}
          onSelect={() => setSelectedPlanForUpgrade('الأساسية')}
        />

        <PlanCard
          name="الاحترافية"
          code="PRO"
          price="599 ج.م"
          studentsLimit="1000 طالب"
          features={[
            'إدارة حتى 1000 طالب',
            'إشعارات واتساب غير محدودة',
            'إدارة حتى 50 مدرس',
            'التقارير التحليلية المتقدمة',
            'دعم فني أولوية مخصصة'
          ]}
          isCurrent={subscription?.planCode === 'PRO'}
          isPopular={true}
          onSelect={() => setSelectedPlanForUpgrade('الاحترافية')}
        />

        <PlanCard
          name="غير المحدودة"
          code="UNLIMITED"
          price="999 ج.م"
          studentsLimit="غير محدود"
          features={[
            'عدد طلاب غير محدود',
            'عدد مدرسين غير محدود',
            'جميع ميزات النظام المتقدمة',
            'ربط سيرفر خاص وتخصيص كامل',
            'مدير حساب خاص ومدرب للمركز'
          ]}
          isCurrent={subscription?.planCode === 'UNLIMITED'}
          onSelect={() => setSelectedPlanForUpgrade('غير المحدودة')}
        />
      </div>

      {/* Upgrade Modal */}
      {selectedPlanForUpgrade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" dir="rtl">
            <button
              onClick={() => setSelectedPlanForUpgrade(null)}
              className="absolute left-4 top-4 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3 text-indigo-600 mb-4">
              <ShieldCheck className="h-8 w-8" />
              <div>
                <h3 className="text-lg font-bold text-gray-900">ترقية الاشتراك</h3>
                <p className="text-xs text-gray-500">باقة: {selectedPlanForUpgrade}</p>
              </div>
            </div>

            <p className="text-sm text-gray-600 mb-6">
              لإكمال عملية الترقية وتفعيل الباقة فوراً، يمكنك التحويل عبر وسائل الدفع السريعة التالية:
            </p>

            <div className="space-y-3 mb-6">
              <div className="flex items-center justify-between p-3 rounded-xl border border-gray-200 bg-gray-50">
                <span className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-indigo-600" /> فودافون كاش / إنستاباي
                </span>
                <span className="font-mono text-sm font-bold text-indigo-600">01000000000</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <a
                href={`https://wa.me/20100000000?text=${encodeURIComponent(`أهلاً، أرغب في ترقية اشتراك مركزنا إلى باقة (${selectedPlanForUpgrade}) في نظام EduCore`)}`}
                target="_blank"
                rel="noreferrer"
                className="w-full text-center rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-700 shadow-md shadow-emerald-100 flex items-center justify-center gap-2"
              >
                <MessageSquare className="w-4 h-4" /> التواصل وتأكيد التحويل عبر الواتساب
              </a>
              <button
                onClick={() => setSelectedPlanForUpgrade(null)}
                className="w-full rounded-xl py-2.5 text-sm font-medium text-gray-500 hover:bg-gray-100"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}