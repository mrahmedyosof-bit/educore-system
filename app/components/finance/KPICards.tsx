'use client';

import React, { memo } from 'react';
import { formatCurrency } from './constants';

interface KPICardProps {
  label: string;
  value: number;
  icon: string;
  iconBg: string;
  iconColor: string;
  borderColor?: string;
  valueColor?: string;
  subLabel?: string;
  subLabelColor?: string;
  onClick?: () => void;
  title?: string;
  showRangeFilter?: boolean;
  financeRange?: 'today' | 'month' | 'all';
  onRangeChange?: (value: 'today' | 'month' | 'all') => void;
  collectionRate?: number;
  showProgressBar?: boolean;
}

export const KPICard = memo(function KPICard({
  label,
  value,
  icon,
  iconBg,
  iconColor,
  borderColor = 'border-slate-200/80',
  valueColor = 'text-slate-800',
  subLabel,
  subLabelColor = 'text-slate-400',
  onClick,
  title,
  showRangeFilter = false,
  financeRange,
  onRangeChange,
  collectionRate,
  showProgressBar = false,
}: KPICardProps) {
  return (
    <div
      onClick={onClick}
      title={title}
      className={`cursor-pointer bg-white p-5 rounded-3xl border ${borderColor} shadow-sm flex justify-between items-start transition-all hover:shadow-md hover:scale-[1.01]`}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
    >
      <div className="flex-1 pr-4">
        <div className="flex items-center gap-1 mb-1">
          <p className="text-xs font-bold text-slate-500">{label}</p>
          {showRangeFilter && (
            <select
              value={financeRange}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onRangeChange?.(e.target.value as 'today' | 'month' | 'all')}
              className="bg-slate-100 border-none text-[10px] font-bold rounded-md px-1.5 py-0.5 text-slate-600 focus:outline-none"
            >
              <option value="today">اليوم</option>
              <option value="month">هذا الشهر</option>
              <option value="all">الكل</option>
            </select>
          )}
        </div>
        <h3 className={`text-3xl font-black mt-1 ${valueColor}`}>
          {typeof value === 'number' ? value.toLocaleString('ar-EG') : value} <span className="text-xs">ج.م</span>
        </h3>
        <p className={`text-[11px] font-bold mt-1 ${subLabelColor}`}>{subLabel}</p>

        {showProgressBar && collectionRate !== undefined && (
          <div className="mt-3">
            <div className="flex justify-between text-[10px] font-bold mb-1">
              <span className="text-emerald-600">{Math.round(collectionRate)}%</span>
              <span className="text-slate-400">نسبة التحصيل</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  collectionRate >= 80 ? 'bg-emerald-500' :
                  collectionRate >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                }`}
                style={{ width: `${Math.min(collectionRate, 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>
      <div className={`text-3xl ${iconBg} p-3 rounded-2xl ${iconColor} flex-shrink-0`}>{icon}</div>
    </div>
  );
});

KPICard.displayName = 'KPICard';