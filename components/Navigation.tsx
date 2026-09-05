'use client';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import LiveClock from './LiveClock';
import { SignOutButton, useAuth } from './AuthContext';
import { useTenant } from './TenantContext';
import { useTheme } from './ThemeContext';
import { useCenterSettings } from '@/hooks/useCenterSettings';
import {
  getStoredRoleView,
  isTabAllowed,
  legacyRoleToTenantRole,
  purgeLegacyRoleStorage,
  roleFromSession,
  ROLE_LABELS,
  storeRoleView,
  type Role,
} from '@/lib/rbac';
import {
  canAccessTab as canAccessTabForRole,
  hasPermission,
  ROLE_PERMISSIONS,
  type Permission,
} from '@/lib/permissions';
import type { TenantRole } from '@/types/tenant';

export interface NavTab {
  id: string;
  label: string;
  icon: string;
}

export interface NavGroup {
  title: string;
  tabs: NavTab[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'الرئيسية',
    tabs: [
      { id: 'dashboard', label: 'لوحة التحكم', icon: '🏠' },
      { id: 'reports', label: 'التقارير والإحصائيات', icon: '📈' },
    ],
  },
  {
    title: 'الأكاديمي',
    tabs: [
      { id: 'students', label: 'إدارة الطلاب', icon: '👨‍🎓' },
      { id: 'attendance', label: 'الحضور والغياب', icon: '✅' },
      { id: 'exams', label: 'الاختبارات والدرجات', icon: '🧪' },
      { id: 'grades', label: 'سجل الدرجات', icon: '📊' },
    ],
  },
  {
    title: 'المالية',
    tabs: [
      { id: 'finance', label: 'المالية والاشتراكات', icon: '💳' },
      { id: 'expenses', label: 'المصروفات والخزينة', icon: '💰' },
      { id: 'inventory', label: 'الملزمات والمخزون', icon: '📦' },
    ],
  },
  {
    title: 'الإعدادات',
    tabs: [{ id: 'setup', label: 'إعدادات النظام', icon: '⚙️' }],
  },
];

export const ALL_TABS: NavTab[] = NAV_GROUPS.flatMap((g) => g.tabs);

interface NavContextValue {
  activeTab: string;
  setActiveTab: (id: string) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  mobileOpen: boolean;
  toggleMobileSidebar: () => void;
  closeMobileSidebar: () => void;
  role: Role;
  serverRole: Role;
  changeRole: (role: Role) => void;
  tenantRole: TenantRole;
  permissions: readonly Permission[];
  can: (permission: Permission) => boolean;
  canAccessTab: (tabId: string) => boolean;
}

const NavContext = createContext<NavContextValue | null>(null);

export function NavProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const { currentRole } = useTenant();
  const [activeTab, setActiveTabState] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [roleView, setRoleView] = useState<'assistant' | null>(null);
  const serverRole = roleFromSession(session);

  useEffect(() => {
    void (async () => {
      await Promise.resolve();
      purgeLegacyRoleStorage();
      setRoleView(getStoredRoleView());
    })();
  }, []);

  const role: Role =
    serverRole === 'admin' && roleView === 'assistant' ? 'assistant' : serverRole;

  const tenantRole = useMemo<TenantRole>(
    () => currentRole ?? legacyRoleToTenantRole(role),
    [currentRole, role]
  );

  const navigationRole = useMemo<TenantRole>(
    () => (role === 'assistant' ? 'ASSISTANT' : tenantRole),
    [role, tenantRole]
  );

  const permissions = useMemo<readonly Permission[]>(
    () => ROLE_PERMISSIONS[tenantRole],
    [tenantRole]
  );

  const can = useCallback(
    (permission: Permission) => hasPermission(tenantRole, permission),
    [tenantRole]
  );

  const canAccessTab = useCallback(
    (tabId: string) => canAccessTabForRole(navigationRole, tabId),
    [navigationRole]
  );

  const setActiveTab = useCallback(
    (id: string) => {
      if (!canAccessTab(id)) return;
      setActiveTabState(id);
      setMobileOpen(false);
    },
    [canAccessTab]
  );

  const changeRole = useCallback(
    (next: Role) => {
      if (serverRole !== 'admin') return;
      const view = next === 'assistant' ? 'assistant' : null;
      storeRoleView(view);
      setRoleView(view);
      if (!isTabAllowed(next, activeTab)) setActiveTabState('dashboard');
    },
    [activeTab, serverRole]
  );

  const toggleSidebar = useCallback(() => setSidebarCollapsed((v) => !v), []);
  const toggleMobileSidebar = useCallback(() => setMobileOpen((v) => !v), []);
  const closeMobileSidebar = useCallback(() => setMobileOpen(false), []);

  const value = useMemo(
    () => ({
      activeTab,
      setActiveTab,
      sidebarCollapsed,
      toggleSidebar,
      mobileOpen,
      toggleMobileSidebar,
      closeMobileSidebar,
      role,
      serverRole,
      changeRole,
      tenantRole,
      permissions,
      can,
      canAccessTab,
    }),
    [
      activeTab,
      setActiveTab,
      sidebarCollapsed,
      toggleSidebar,
      mobileOpen,
      toggleMobileSidebar,
      closeMobileSidebar,
      role,
      serverRole,
      changeRole,
      tenantRole,
      permissions,
      can,
      canAccessTab,
    ]
  );

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav(): NavContextValue {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useNav must be used within a NavProvider');
  return ctx;
}

/* ═══════════════════════════════════════════════════════════
   القائمة الجانبية — متجاوبة بالكامل
═══════════════════════════════════════════════════════════ */
export function Sidebar() {
  const {
    activeTab,
    setActiveTab,
    sidebarCollapsed: collapsed,
    toggleSidebar,
    mobileOpen,
    closeMobileSidebar,
    role,
    serverRole,
    changeRole,
    canAccessTab,
  } = useNav();

  const visibleGroups = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        ...group,
        tabs: group.tabs.filter((tab) => canAccessTab(tab.id)),
      })).filter((group) => group.tabs.length > 0),
    [canAccessTab]
  );

  const handleNavigate = useCallback(
    (id: string) => {
      setActiveTab(id);
    },
    [setActiveTab]
  );

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm lg:hidden"
          onClick={closeMobileSidebar}
          aria-hidden="true"
        />
      )}

      <aside
        className={`
          fixed inset-y-0 right-0 z-50 flex h-screen flex-col
          border-l border-indigo-900/40
          bg-gradient-to-b from-slate-950 via-indigo-950 to-slate-900
          text-slate-100 shadow-2xl
          transition-all duration-300 ease-in-out
          lg:static lg:translate-x-0
          w-72
          ${mobileOpen ? 'translate-x-0' : 'translate-x-full'}
          ${collapsed ? 'lg:w-[76px]' : 'lg:w-72'}
        `}
        dir="rtl"
      >
        <div
          className={`
            flex items-center border-b border-indigo-800/30 p-4 transition-all
            ${collapsed ? 'flex-col gap-3 justify-center' : 'justify-between'}
          `}
        >
          {collapsed ? (
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600/30 text-xl border border-indigo-400/30 shadow-lg shadow-indigo-600/30"
              title="EduCore CMS v2"
            >
              🎓
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-xl text-white shadow-lg shadow-indigo-500/40 border border-indigo-400/30">
                🎓
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h1 className="text-base font-black text-white tracking-wide">EduCore</h1>
                  <span className="text-[9px] font-black uppercase text-indigo-200 bg-indigo-900/80 border border-indigo-500/40 px-1.5 py-0.5 rounded-md shadow-sm">
                    v2.0
                  </span>
                </div>
                <p className="text-[11px] font-medium text-indigo-200/70 truncate">
                  إدارة المركز التعليمي
                </p>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={collapsed ? 'توسيع القائمة' : 'طي القائمة'}
            title={collapsed ? 'توسيع القائمة' : 'طي القائمة'}
            className="hidden lg:inline-flex rounded-xl p-2 text-xs font-bold text-indigo-200/80 transition hover:bg-indigo-900/50 hover:text-white border border-indigo-800/40 active:scale-95"
          >
            {collapsed ? '⏵' : '⏴'}
          </button>
        </div>

        <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 scrollbar-thin scrollbar-thumb-indigo-900">
          {visibleGroups.length === 0 ? (
            <div className="rounded-xl border border-indigo-800/40 bg-indigo-950/40 p-3 text-center text-[11px] font-bold text-indigo-200/70">
              لا توجد أقسام متاحة لهذا الدور
            </div>
          ) : (
            visibleGroups.map((group) => (
              <div key={group.title} className="space-y-1">
                {collapsed ? (
                  <div className="mx-auto my-2 h-px w-8 bg-indigo-900/50" aria-hidden="true" />
                ) : (
                  <div className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-wider text-indigo-300/60">
                    {group.title}
                  </div>
                )}
                <div className="space-y-1">
                  {group.tabs.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => handleNavigate(tab.id)}
                        title={collapsed ? tab.label : undefined}
                        aria-current={isActive ? 'page' : undefined}
                        className={`
                          relative flex w-full items-center rounded-xl py-2.5 text-xs font-bold
                          transition-all duration-200
                          ${collapsed ? 'justify-center px-0' : 'gap-3 px-3.5'}
                          ${
                            isActive
                              ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-600/40 border border-indigo-400/40'
                              : 'text-indigo-100/70 hover:bg-indigo-900/40 hover:text-white border border-transparent'
                          }
                        `}
                      >
                        <span
                          aria-hidden="true"
                          className={`
                            absolute right-0 top-1/2 -translate-y-1/2 rounded-l-full bg-indigo-300
                            transition-all duration-200
                            ${isActive ? 'h-5 w-1 opacity-100' : 'h-0 w-0 opacity-0'}
                          `}
                        />
                        <span className="shrink-0 text-base leading-none">{tab.icon}</span>
                        {!collapsed && <span className="truncate">{tab.label}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </nav>

        <div
          className={`
            shrink-0 border-t border-indigo-800/30 bg-slate-950/60 backdrop-blur-md p-3.5
            ${collapsed ? 'px-2 text-center' : ''}
          `}
        >
          {!collapsed && (
            <>
              <div className="flex items-center justify-between text-[11px] font-bold text-indigo-200/80">
                <div className="flex items-center gap-2 text-emerald-400">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                  </span>
                  متصل
                </div>
                <div className="font-mono text-[10px] text-indigo-300/60" dir="ltr">
                  <LiveClock />
                </div>
              </div>
              <div className="mt-3 rounded-xl border border-indigo-800/40 bg-indigo-950/40 p-2.5 shadow-inner">
                <div className="text-[10px] font-bold text-indigo-300/60">الصلاحية الحالية</div>
                <div className="mt-0.5 text-xs font-black text-indigo-200 flex items-center gap-1.5">
                  <span>{role === 'admin' ? '👑' : '🧑‍💼'}</span>
                  <span>{ROLE_LABELS[role]}</span>
                </div>
                {serverRole === 'admin' && (
                  <select
                    value={role}
                    onChange={(e) => changeRole(e.target.value as Role)}
                    aria-label="تقييد عرض الشاشات"
                    className="mt-2 w-full rounded-lg border border-indigo-700/50 bg-slate-900 px-2 py-1 text-[10px] font-bold text-indigo-100 focus:border-indigo-400 focus:outline-none cursor-pointer"
                  >
                    <option value="admin">👑 وضع المدير (كل الصلاحيات)</option>
                    <option value="assistant">🧑‍💼 وضع المساعد (عرض مقيد)</option>
                  </select>
                )}
              </div>
            </>
          )}
          {collapsed && (
            <div
              className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-900/50 text-base"
              title={ROLE_LABELS[role]}
            >
              {role === 'admin' ? '👑' : '🧑‍💼'}
            </div>
          )}
          <div className="mt-2">
            <SignOutButton />
          </div>
        </div>
      </aside>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   الترويسة الموحدة (TopHeader)
   المصدر الوحيد للهيدر في التطبيق بأكمله
   يُستدعى مرة واحدة فقط من layout.tsx
═══════════════════════════════════════════════════════════ */
export function TopHeader() {
  const { toggleSidebar, sidebarCollapsed, toggleMobileSidebar } = useNav();
  const { settings: centerSettings, updateSettings, saving } = useCenterSettings();
  const { theme, toggleTheme } = useTheme();
  const [editingCenterName, setEditingCenterName] = useState(false);
  const [editingAcademicYear, setEditingAcademicYear] = useState(false);
  const [tempCenterName, setTempCenterName] = useState(centerSettings.centerName);
  const [tempAcademicYear, setTempAcademicYear] = useState(centerSettings.academicYear);

  useEffect(() => {
    setTempCenterName(centerSettings.centerName);
    setTempAcademicYear(centerSettings.academicYear);
  }, [centerSettings.centerName, centerSettings.academicYear]);

  const handleSaveCenterName = async () => {
    if (tempCenterName.trim() && tempCenterName !== centerSettings.centerName) {
      await updateSettings({ centerName: tempCenterName.trim() });
    }
    setEditingCenterName(false);
  };

  const handleSaveAcademicYear = async () => {
    if (tempAcademicYear.trim() && tempAcademicYear !== centerSettings.academicYear) {
      await updateSettings({ academicYear: tempAcademicYear.trim() });
    }
    setEditingAcademicYear(false);
  };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md px-3 sm:px-4 lg:px-5 py-3">
      <div className="flex items-center justify-between gap-3">
        {/* الطرف الأيمن: زر القائمة + اسم المركز */}
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={toggleMobileSidebar}
            className="lg:hidden shrink-0 rounded-lg p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition active:scale-95"
            aria-label="فتح القائمة"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <button
            type="button"
            onClick={toggleSidebar}
            className="hidden lg:inline-flex shrink-0 rounded-lg p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition active:scale-95"
            aria-label={sidebarCollapsed ? 'توسيع القائمة' : 'طي القائمة'}
            title={sidebarCollapsed ? 'توسيع القائمة' : 'طي القائمة'}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {sidebarCollapsed ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              )}
            </svg>
          </button>

          {/* اسم المركز — قابل للتعديل بالنقر */}
          <div className="min-w-0 flex items-center gap-2">
            {editingCenterName ? (
              <input
                type="text"
                value={tempCenterName}
                onChange={(e) => setTempCenterName(e.target.value)}
                onBlur={handleSaveCenterName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveCenterName();
                  if (e.key === 'Escape') {
                    setTempCenterName(centerSettings.centerName);
                    setEditingCenterName(false);
                  }
                }}
                autoFocus
                className="text-sm sm:text-base font-black text-slate-900 dark:text-white bg-transparent border-b-2 border-indigo-500 focus:outline-none w-full"
                placeholder="اسم المركز التعليمي"
              />
            ) : (
              <h1
                onClick={() => setEditingCenterName(true)}
                className="text-sm sm:text-base font-black text-slate-900 dark:text-white truncate cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition group flex items-center gap-1.5"
                title="انقر للتعديل"
              >
                {centerSettings.centerName}
                <span className="opacity-0 group-hover:opacity-100 text-xs text-slate-400 transition">✏️</span>
              </h1>
            )}
            {saving && (
              <span className="text-[10px] font-bold text-indigo-500 dark:text-indigo-400 animate-pulse">
                جاري الحفظ...
              </span>
            )}
          </div>
        </div>

        {/* الطرف الأيسر: السنة الدراسية + زر الوضع الداكن/الفاتح */}
        <div className="flex items-center gap-2 shrink-0">
          {editingAcademicYear ? (
            <input
              type="text"
              value={tempAcademicYear}
              onChange={(e) => setTempAcademicYear(e.target.value)}
              onBlur={handleSaveAcademicYear}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveAcademicYear();
                if (e.key === 'Escape') {
                  setTempAcademicYear(centerSettings.academicYear);
                  setEditingAcademicYear(false);
                }
              }}
              autoFocus
              className="text-xs font-bold text-slate-900 dark:text-white bg-transparent border-b-2 border-indigo-500 focus:outline-none w-24 text-center"
              placeholder="2026/2027"
            />
          ) : (
            <div
              onClick={() => setEditingAcademicYear(true)}
              className="hidden sm:flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition group"
              title="انقر للتعديل"
            >
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">السنة الدراسية:</span>
              <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1">
                {centerSettings.academicYear}
                <span className="opacity-0 group-hover:opacity-100 text-[10px] text-slate-400 transition">✏️</span>
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={toggleTheme}
            className="rounded-lg p-2 text-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition active:scale-95"
            aria-label={theme === 'dark' ? 'التبديل للوضع الفاتح' : 'التبديل للوضع الداكن'}
            title={theme === 'dark' ? 'التبديل للوضع الفاتح' : 'التبديل للوضع الداكن'}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </div>
    </header>
  );
}