'use client';

import React from 'react';
import { buildWhatsAppUrl } from '@/lib/whatsapp';

interface WhatsAppButtonProps {
  phone: string | null | undefined;
  message: string;
  label?: string;
  className?: string;
  title?: string;
}

/**
 * زرار يفتح محادثة واتساب مع ولي الأمر برسالة جاهزة.
 * يختفي تلقائياً إذا لم يوجد رقم صالح.
 */
export default function WhatsAppButton({
  phone,
  message,
  label = '💬 إشعار ولي الأمر',
  className,
  title,
}: WhatsAppButtonProps) {
  const url = buildWhatsAppUrl(phone, message);

  if (!url) return null;

  return (
    <button
      type="button"
      onClick={() => window.open(url, '_blank')}
      title={title || 'فتح واتساب مع ولي الأمر'}
      className={
        className ||
        'rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100'
      }
    >
      {label}
    </button>
  );
}
