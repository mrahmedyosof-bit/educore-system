/**
 * نظام الأحداث المشتركة بين التبويبات
 * يستخدم BroadcastChannel للتواصل بين التبويبات المختلفة
 * و Custom Events للتواصل في نفس الصفحة
 */

// اسم القناة المشتركة
const CHANNEL_NAME = 'educore-finance-events';
const EVENT_NAME = 'payment-updated';

// إنشاء قناة BroadcastChannel (متاحة في جميع التبويبات)
let broadcastChannel: BroadcastChannel | null = null;

if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
  } catch (err) {
    console.warn('BroadcastChannel غير متاح:', err);
  }
}

export interface PaymentUpdateEvent {
  type: 'payment-updated' | 'payment-added' | 'payment-deleted';
  studentId?: number;
  timestamp: number;
}

/**
 * إرسال حدث تحديث المدفوعات
 */
export const emitPaymentUpdate = (event: PaymentUpdateEvent): void => {
  // إرسال عبر BroadcastChannel (للتبويبات الأخرى)
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage(event);
    } catch (err) {
      console.warn('فشل إرسال BroadcastChannel:', err);
    }
  }

  // إرسال كـ Custom Event (للمكونات في نفس الصفحة)
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(
        new CustomEvent(EVENT_NAME, { detail: event })
      );
    } catch (err) {
      console.warn('فشل إرسال CustomEvent:', err);
    }
  }
};

/**
 * الاستماع لأحداث تحديث المدفوعات
 * @returns دالة لإلغاء الاشتراك
 */
export const onPaymentUpdate = (
  callback: (event: PaymentUpdateEvent) => void
): (() => void) => {
  // ✅ التحقق من أن callback هو دالة فعلية
  if (typeof callback !== 'function') {
    console.error('onPaymentUpdate: callback يجب أن يكون دالة');
    return () => {};
  }

  const handlers: Array<() => void> = [];

  // الاستماع لـ BroadcastChannel
  if (broadcastChannel) {
    const channelHandler = (event: MessageEvent<PaymentUpdateEvent>) => {
      try {
        callback(event.data);
      } catch (err) {
        console.error('خطأ في معالج BroadcastChannel:', err);
      }
    };

    broadcastChannel.addEventListener('message', channelHandler);
    handlers.push(() => {
      broadcastChannel!.removeEventListener('message', channelHandler);
    });
  }

  // الاستماع لـ Custom Event
  if (typeof window !== 'undefined') {
    const customHandler = (event: Event) => {
      try {
        const customEvent = event as CustomEvent<PaymentUpdateEvent>;
        callback(customEvent.detail);
      } catch (err) {
        console.error('خطأ في معالج CustomEvent:', err);
      }
    };

    window.addEventListener(EVENT_NAME, customHandler);
    handlers.push(() => {
      window.removeEventListener(EVENT_NAME, customHandler);
    });
  }

  // إرجاع دالة لإلغاء الاشتراك
  return () => {
    handlers.forEach((handler) => {
      try {
        handler();
      } catch (err) {
        console.warn('خطأ في إلغاء الاشتراك:', err);
      }
    });
  };
};

/**
 * تنظيف القناة عند إغلاق الصفحة
 */
export const cleanupEvents = (): void => {
  if (broadcastChannel) {
    try {
      broadcastChannel.close();
    } catch (err) {
      console.warn('خطأ في إغلاق BroadcastChannel:', err);
    }
    broadcastChannel = null;
  }
};

// تنظيف تلقائي عند إغلاق الصفحة
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', cleanupEvents);
}