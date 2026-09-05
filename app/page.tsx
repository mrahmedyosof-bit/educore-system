'use client';
import React from 'react';
import DashboardTab from '@/components/DashboardTab';
import StudentsTab from '@/components/StudentsTab';
import AttendanceTab from '@/components/AttendanceTab';
import FinanceTab from '@/components/FinanceTab';
import GradesTab from '@/components/GradesTab';
import ReportsTab from '@/components/ReportsTab';
import SetupTab from '@/components/SetupTab';
import ExamsTab from '@/components/ExamsTab';
import ExpensesTab from '@/components/ExpensesTab';
import InventoryTab from '@/components/InventoryTab';
import { isTabAllowed } from '@/lib/rbac';
import { useNav } from '@/components/Navigation';

export default function Home() {
  const { activeTab, setActiveTab, role } = useNav();
  const allowed = isTabAllowed(role, activeTab);
  const effectiveTab = allowed ? activeTab : 'dashboard';

  return (
    <div>
      {!allowed ? (
        <div className="rounded-3xl border border-rose-200 bg-white p-12 text-center shadow-sm dark:border-rose-800 dark:bg-slate-800">
          <div className="text-4xl mb-2">🔒</div>
          <h2 className="text-lg font-black text-rose-600 dark:text-rose-400">
            غير مصرح بالوصول لهذه الشاشة
          </h2>
          <p className="mt-2 text-xs font-bold text-slate-500 dark:text-slate-400">
            صلاحيتك الحالية لا تشمل هذا القسم — راجع مدير النظام.
          </p>
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className="mt-4 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-black text-white transition hover:bg-indigo-700 shadow-md"
          >
            🏠 العودة للوحة التحكم
          </button>
        </div>
      ) : (
        <>
          {effectiveTab === 'dashboard' && (
            <DashboardTab
              onOpenQRScanner={() => setActiveTab('attendance')}
              onNavigateToTab={(tab) => setActiveTab(tab)}
            />
          )}
          {effectiveTab === 'students' && <StudentsTab />}
          {effectiveTab === 'attendance' && <AttendanceTab />}
          {effectiveTab === 'exams' && <ExamsTab />}
          {effectiveTab === 'finance' && <FinanceTab />}
          {effectiveTab === 'expenses' && <ExpensesTab />}
          {effectiveTab === 'inventory' && <InventoryTab />}
          {effectiveTab === 'grades' && <GradesTab />}
          {effectiveTab === 'reports' && <ReportsTab />}
          {effectiveTab === 'setup' && <SetupTab />}
        </>
      )}
    </div>
  );
}