import { AuthGate, AuthProvider } from '@/components/AuthContext';
import { AppProvider } from '@/components/AppContext';
import { ThemeProvider } from '@/components/ThemeContext';
import { TenantProvider } from '@/components/TenantContext';
import { NavProvider, Sidebar, TopHeader } from '@/components/Navigation';
import './globals.css';

export const metadata = {
  title: 'EduCore CMS - نظام إدارة المركز التعليمي',
  description: 'منظومة إدارة المراكز التعليمية والطلاب',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body className="bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased">
        <AuthProvider>
          <TenantProvider>
            <ThemeProvider>
              <AppProvider>
                <AuthGate>
                  <NavProvider>
                    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
                      {/* القائمة الجانبية */}
                      <Sidebar />

                      {/* المحتوى الرئيسي */}
                      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
                        {/* الترويسة الموحدة */}
                        <TopHeader />

                        {/* منطقة الشاشات القابلة للتمرير */}
                        <main className="flex-1 overflow-y-auto p-4 sm:p-5 lg:p-6 scroll-smooth">
                          {/* ✅ توحيد الحاوية مع max-w-[1600px] space-y-6 */}
                          <div className="mx-auto w-full max-w-[1600px] space-y-6">
                            {children}
                          </div>
                        </main>
                      </div>
                    </div>
                  </NavProvider>
                </AuthGate>
              </AppProvider>
            </ThemeProvider>
          </TenantProvider>
        </AuthProvider>
      </body>
    </html>
  );
}