'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // جلب الجلسة الحالية
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!cancelled) setSession(data.session);
      })
      .catch((err) => {
        console.error('Error fetching session:', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    // الاستماع لتغييرات حالة المصادقة
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!cancelled) setSession(newSession);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ 
      email: email.trim(), 
      password 
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (err) {
      console.error('خطأ في تسجيل الخروج:', err);
      // يمكن إضافة إشعار Toast هنا إذا أردت، لكنه ليس ضرورياً جداً
    }
  }, []);

  return (
    <AuthContext.Provider value={{ session, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

function LoginForm() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await signIn(email, password);
    } catch (err) {
      const raw = err instanceof Error ? err.message : '';
      let message: string;

      if (/invalid login credentials/i.test(raw)) {
        message = 'بيانات الدخول غير صحيحة. تأكد من البريد وكلمة المرور، ومن أن الحساب مُفعّل في لوحة تحكم Supabase.';
      } else if (/email not confirmed/i.test(raw)) {
        message = 'البريد الإلكتروني غير مُفعّل بعد. يرجى تفعيله من رابط التفعيل المرسل إلى بريدك.';
      } else {
        message = raw || 'تعذر تسجيل الدخول. يرجى المحاولة لاحقاً.';
      }

      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-200 p-8 space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-black text-indigo-600">🎓 EduCore CMS</h1>
          <p className="text-sm text-slate-500 mt-2">نظام إدارة المركز التعليمي</p>
        </div>

        {error && (
          <div className="rounded-2xl bg-rose-50 border border-rose-200 p-3 text-xs font-bold text-rose-700 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-xs font-bold text-slate-600">
            البريد الإلكتروني
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="admin@example.com"
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 focus:border-indigo-500 focus:outline-none transition"
            />
          </label>

          <label className="block text-xs font-bold text-slate-600">
            كلمة المرور
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 focus:border-indigo-500 focus:outline-none transition"
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold py-3 text-sm transition shadow-md shadow-indigo-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول'}
          </button>
        </form>
      </div>
    </div>
  );
}

/**
 * بوابة الحماية: تعرض شاشة تسجيل الدخول عند عدم وجود جلسة،
 * ولا تعرض محتوى التطبيق إلا بعد نجاح المصادقة.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100" dir="rtl">
        <div className="text-sm font-bold text-slate-500 animate-pulse">جاري التحقق من الجلسة...</div>
      </div>
    );
  }

  if (!session) {
    return <LoginForm />;
  }

  return <>{children}</>;
}

/** زر تسجيل الخروج للاستخدام داخل الشريط الجانبي أو الهيدر. */
export function SignOutButton() {
  const { signOut } = useAuth();

  return (
    <button
      type="button"
      onClick={() => void signOut()}
      className="mt-3 w-full rounded-xl bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white text-xs font-bold py-2 transition-colors"
    >
      ⏏ تسجيل الخروج
    </button>
  );
}