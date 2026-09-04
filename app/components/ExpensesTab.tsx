'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addExpense,
  deleteExpense,
  Expense,
  getExpenses,
} from '@/lib/services/expenses';
import { getPayments } from '@/lib/services/payments';
import { getStudents, Student } from '@/lib/services/students';
import { getPriceMatrix, priceKey, type PriceMatrix } from '@/lib/services/settings';
import { getFriendlyErrorMessage } from '@/lib/errors';
// ✅ استيراد Hook إعدادات السنتر
import { useCenterSettings } from '@/hooks/useCenterSettings';

const today = new Date().toISOString().split('T')[0];

const EXPENSE_CATEGORIES = [
  'إيجار',
  'طباعة ورقيات',
  'أدوات كتابية',
  'رواتب مساعدين',
  'أخرى',
] as const;

interface TreasuryStats {
  revenue: number;
  expenses: number;
}

type ModalKind = 'revenue' | 'expenses' | 'profit' | 'exemptions' | null;

const sumBy = <T,>(rows: T[], pick: (row: T) => number): number =>
  rows.reduce((total, row) => total + pick(row), 0);

export default function ExpensesTab() {
  // ✅ استخدام إعدادات السنتر
  const { settings: centerSettings } = useCenterSettings();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payments, setPayments] = useState<{ amount: number; date: string }[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [priceMatrix, setPriceMatrix] = useState<PriceMatrix>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeModal, setActiveModal] = useState<ModalKind>(null);

  // نموذج المصروف
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [expenseData, paymentData, studentData, pricesData] = await Promise.all([
        getExpenses(),
        getPayments(),
        getStudents(),
        getPriceMatrix(),
      ]);

      setExpenses(expenseData);
      setPayments(
        paymentData.map((p) => ({
          amount: Number(p.amount_paid ?? 0),
          date: (p.payment_date || p.created_at || '').slice(0, 10),
        }))
      );
      setStudents(studentData);
      setPriceMatrix(pricesData);
      setError('');
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'تعذر تحميل بيانات الخزينة.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // تأجيل بسيط لميكروتاسك: تحديث الحالة لا يتم بشكل متزامن داخل جسم الأثر
    void (async () => {
      await Promise.resolve();
      await loadData();
    })();
  }, [loadData]);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(''), 4000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  /* ==================== الحسابات المالية ==================== */

  const totalRevenue = useMemo(() => sumBy(payments, (p) => p.amount), [payments]);
  const totalExpenses = useMemo(() => sumBy(expenses, (e) => e.amount), [expenses]);
  const netProfit = totalRevenue - totalExpenses;

  /* تفاصيل الطلاب المعفيين لكل طالب (للمودال والحساب معاً) */
  const exemptRows = useMemo(
    () =>
      students
        .filter((s) => s.isExempt)
        .map((s) => {
          const key = s.grade && s.subject ? priceKey(s.grade, s.subject) : '';
          const rawFee = key ? priceMatrix[key] : undefined;
          return {
            id: s.id,
            name: s.name,
            grade: s.grade || '-',
            subject: s.subject || '-',
            fee: typeof rawFee === 'number' && Number.isFinite(rawFee) ? rawFee : null,
          };
        }),
    [students, priceMatrix]
  );

  const exemptionSummary = useMemo(() => {
    let total = 0;
    let unpricedCount = 0;
    exemptRows.forEach((r) => {
      if (r.fee === null) unpricedCount += 1;
      else total += r.fee;
    });
    return { count: exemptRows.length, total, unpricedCount };
  }, [exemptRows]);

  /* الطلاب الحاصلون على خصم جزئي شهري (غير المعفيين كلياً) */
  const discountedRows = useMemo(
    () =>
      students
        .filter((s) => !s.isExempt && (s.discountAmount ?? 0) > 0)
        .map((s) => ({
          id: s.id,
          name: s.name,
          grade: s.grade || '-',
          subject: s.subject || '-',
          discount: s.discountAmount ?? 0,
        })),
    [students]
  );

  /**
   * إجمالي الدعم والإعفاءات =
   * Σ إعفاءات الطلاب المعفيين كلياً + Σ خصومات الطلاب الجزئية.
   */
  const supportSummary = useMemo(() => {
    const partialTotal = sumBy(discountedRows, (r) => r.discount);
    return {
      exemptCount: exemptionSummary.count,
      unpricedCount: exemptionSummary.unpricedCount,
      fullTotal: exemptionSummary.total,
      partialCount: discountedRows.length,
      partialTotal,
      total: exemptionSummary.total + partialTotal,
    };
  }, [exemptionSummary, discountedRows]);

  const periodStats = useCallback(
    (filterFn: (isoDate: string) => boolean): TreasuryStats => ({
      revenue: sumBy(
        payments.filter((p) => p.date && filterFn(p.date)),
        (p) => p.amount
      ),
      expenses: sumBy(
        expenses.filter((e) => e.date && filterFn(e.date)),
        (e) => e.amount
      ),
    }),
    [payments, expenses]
  );

  const weekly = useMemo(() => {
    const sevenDaysAgo = new Date(Date.parse(today) - 6 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    return periodStats((d) => d >= sevenDaysAgo && d <= today);
  }, [periodStats]);

  const monthly = useMemo(() => {
    const monthPrefix = today.slice(0, 7); // YYYY-MM
    return periodStats((d) => d.startsWith(monthPrefix));
  }, [periodStats]);

  /* ==================== الإجراءات ==================== */

  const handleAddExpense = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const parsedAmount = Number(amount);
    if (!title.trim()) {
      setError('يرجى إدخال عنوان المصروف.');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('يرجى إدخال قيمة صحيحة أكبر من صفر.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await addExpense({
        title,
        amount: parsedAmount,
        category,
        date,
        notes: notes || null,
      });
      await loadData();
      setSuccess(`تم تسجيل المصروف: ${title.trim()}`);
      setTitle('');
      setAmount('');
      setNotes('');
      setDate(today);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل المصروف.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteExpense = async (expense: Expense) => {
    if (!window.confirm(`حذف المصروف "${expense.title}" بقيمة ${expense.amount} ج.م؟`)) return;

    setSaving(true);
    setError('');
    try {
      await deleteExpense(expense.id);
      await loadData();
      setSuccess('تم حذف المصروف.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف المصروف.');
    } finally {
      setSaving(false);
    }
  };

  /* ==================== كلاسات الثيم ==================== */

  const formatEGP = (value: number): string =>
    `${Math.round(value).toLocaleString('ar-EG')} ج.م`;

  const cardClass =
    'rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800';

  const inputClass =
    'mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';

  const labelTextClass = 'text-xs font-bold text-slate-600 dark:text-slate-300';

  const modalOverlay =
    'fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm';

  const modalBox =
    'w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-600 dark:bg-slate-800';

  const modalTitle =
    'text-base font-black text-slate-800 dark:text-slate-100';

  const modalCloseBtn =
    'rounded-lg px-2 py-1 text-sm font-black text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200';

  const tableHead =
    'border-b border-slate-100 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400';

  const tableBody = 'divide-y divide-slate-100 dark:divide-slate-700';

  /* بطاقة إحصائية قابلة للنقر */
  const statCard = (
    label: string,
    value: string,
    tone: 'emerald' | 'rose' | 'indigo' | 'violet',
    hint: string | undefined,
    onClick: () => void
  ) => {
    const tones = {
      emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
      rose: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
      indigo: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300',
      violet: 'bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300',
    } as const;

    return (
      <button
        type="button"
        onClick={onClick}
        className={`cursor-pointer rounded-2xl p-5 text-center transition-all duration-200 hover:scale-[1.01] hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 active:scale-[0.99] ${tones[tone]}`}
      >
        <div className="text-xl font-black">{value}</div>
        <div className="mt-1 text-[11px] font-bold opacity-80">{label}</div>
        {hint && <div className="mt-1.5 text-[10px] font-bold opacity-60">{hint}</div>}
        <div className="mt-2 text-[9px] font-black uppercase tracking-wider opacity-40">
          اضغط للتفاصيل ↗
        </div>
      </button>
    );
  };

  /* بطاقة فترة زمنية (أسبوع/شهر) */
  const periodCard = (label: string, stats: TreasuryStats) => (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <h4 className="mb-3 text-center text-xs font-black text-slate-600 dark:text-slate-300">{label}</h4>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-xs font-black text-emerald-600 dark:text-emerald-400">
            +{formatEGP(stats.revenue)}
          </div>
          <div className="text-[9px] font-bold text-slate-400">إيرادات</div>
        </div>
        <div>
          <div className="text-xs font-black text-rose-600 dark:text-rose-400">
            −{formatEGP(stats.expenses)}
          </div>
          <div className="text-[9px] font-bold text-slate-400">مصروفات</div>
        </div>
        <div>
          <div
            className={`text-xs font-black ${
              stats.revenue - stats.expenses >= 0
                ? 'text-indigo-600 dark:text-indigo-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {formatEGP(stats.revenue - stats.expenses)}
          </div>
          <div className="text-[9px] font-bold text-slate-400">الصافي</div>
        </div>
      </div>
    </div>
  );

  /* رأس المودال الموحد */
  const modalHeader = (titleText: string) => (
    <div className="mb-4 flex items-center justify-between">
      <h3 className={modalTitle}>{titleText}</h3>
      <button
        type="button"
        onClick={() => setActiveModal(null)}
        aria-label="إغلاق"
        className={modalCloseBtn}
      >
        ✕
      </button>
    </div>
  );

  return (
    <div className="w-full space-y-6" dir="rtl">
      {/* ==================== شريط اسم السنتر والسنة الدراسية ==================== */}
      <div className="rounded-3xl border border-indigo-200/80 bg-gradient-to-l from-indigo-50 to-white p-6 shadow-sm dark:border-indigo-800 dark:from-slate-900 dark:to-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-[250px]">
            <div className="bg-indigo-600 text-white p-3 rounded-2xl text-xl">💰</div>
            <div className="flex-1">
              <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                الخزينة والمصروفات
              </p>
              <h2 className="text-xl font-black text-slate-800 dark:text-white">
                {centerSettings.centerName}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 px-3 py-1.5 rounded-xl">
              📅 السنة الدراسية: {centerSettings.academicYear}
            </span>
          </div>
        </div>
      </div>

      {/* ==================== التقرير المالي العام ==================== */}
      <div className={cardClass}>
        <h2 className="text-xl font-black text-slate-800 dark:text-slate-100">💰 الخزينة والتقرير المالي</h2>
        <p className="mb-5 mt-1 text-xs text-slate-500 dark:text-slate-400">
          نظرة شاملة على الإيرادات والمصروفات وصافي الربح الفعلي — اضغط أي بطاقة لعرض تفاصيلها
        </p>

        {loading ? (
          <div className="p-8 text-center text-xs font-bold text-slate-400 dark:text-slate-500">
            جاري تحميل بيانات الخزينة...
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {statCard(
                'إجمالي الإيرادات (مدفوعات الطلاب)',
                formatEGP(totalRevenue),
                'emerald',
                undefined,
                () => setActiveModal('revenue')
              )}
              {statCard(
                'إجمالي المصروفات',
                formatEGP(totalExpenses),
                'rose',
                undefined,
                () => setActiveModal('expenses')
              )}
              {statCard(
                'صافي الربح الفعلي (Net Profit)',
                formatEGP(netProfit),
                netProfit >= 0 ? 'indigo' : 'rose',
                undefined,
                () => setActiveModal('profit')
              )}
              {statCard(
                `إجمالي الدعم والإعفاءات 🎓 (${supportSummary.exemptCount} معفي كلياً + ${supportSummary.partialCount} خصم جزئي)`,
                formatEGP(supportSummary.total),
                'violet',
                supportSummary.unpricedCount > 0
                  ? `⚠️ ${supportSummary.unpricedCount} معفٍ بصف/مادة غير محددي السعر`
                  : `${formatEGP(supportSummary.fullTotal)} إعفاء كلي + ${formatEGP(supportSummary.partialTotal)} خصومات جزئية`,
                () => setActiveModal('exemptions')
              )}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              {periodCard('📅 حركة آخر 7 أيام', weekly)}
              {periodCard('🗓️ حركة الشهر الحالي', monthly)}
            </div>

            {error && (
              <div className="mt-4 rounded-2xl bg-rose-50 p-3 text-xs font-bold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                {error}
              </div>
            )}
            {!error && success && (
              <div className="mt-4 rounded-2xl bg-emerald-50 p-3 text-xs font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                {success}
              </div>
            )}
          </>
        )}
      </div>

      {/* ==================== تسجيل مصروف جديد ==================== */}
      <div className={cardClass}>
        <h3 className="mb-4 text-base font-black text-slate-800 dark:text-slate-100">🧾 تسجيل مصروف جديد</h3>

        <form onSubmit={handleAddExpense} className="grid grid-cols-1 items-end gap-4 md:grid-cols-5">
          <label className={labelTextClass}>
            عنوان المصروف <span className="text-rose-500">*</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: فاتورة كهرباء"
              required
              className={inputClass}
            />
          </label>

          <label className={labelTextClass}>
            القيمة (ج.م) <span className="text-rose-500">*</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              required
              className={inputClass}
            />
          </label>

          <label className={labelTextClass}>
            التصنيف
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={inputClass}
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className={labelTextClass}>
            التاريخ
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className={inputClass}
            />
          </label>

          <button
            type="submit"
            disabled={saving || loading}
            className="rounded-2xl bg-rose-600 px-4 py-2.5 text-xs font-black text-white transition hover:bg-rose-700 disabled:opacity-50"
          >
            {saving ? 'جاري الحفظ...' : '− تسجيل المصروف'}
          </button>

          <label className={`${labelTextClass} md:col-span-5`}>
            ملاحظات (اختياري)
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="تفاصيل إضافية..."
              className={inputClass}
            />
          </label>
        </form>
      </div>

      {/* ==================== سجل المصروفات ==================== */}
      <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center justify-between border-b border-slate-100 p-6 dark:border-slate-700">
          <h3 className="text-base font-black text-slate-800 dark:text-slate-100">
            سجل المصروفات ({expenses.length})
          </h3>
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50 dark:bg-slate-700 dark:text-slate-200"
          >
            تحديث
          </button>
        </div>

        {!loading && expenses.length === 0 ? (
          <div className="p-12 text-center text-xs font-bold text-slate-400 dark:text-slate-500">
            لا توجد مصروفات مسجلة بعد.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className={tableHead}>
                <tr>
                  <th className="p-4">التاريخ</th>
                  <th className="p-4">العنوان</th>
                  <th className="p-4">التصنيف</th>
                  <th className="p-4">القيمة</th>
                  <th className="p-4">ملاحظات</th>
                  <th className="p-4">إجراءات</th>
                </tr>
              </thead>
              <tbody className={tableBody}>
                {expenses.map((expense) => (
                  <tr key={expense.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/40">
                    <td className="p-4 font-mono text-slate-500 dark:text-slate-400" dir="ltr">
                      {expense.date}
                    </td>
                    <td className="p-4 font-bold text-slate-800 dark:text-slate-100">{expense.title}</td>
                    <td className="p-4">
                      <span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                        {expense.category}
                      </span>
                    </td>
                    <td className="p-4 font-black text-rose-600 dark:text-rose-400">
                      {formatEGP(expense.amount)}
                    </td>
                    <td className="max-w-[200px] truncate p-4 text-slate-500 dark:text-slate-400">
                      {expense.notes || '-'}
                    </td>
                    <td className="p-4">
                      <button
                        type="button"
                        onClick={() => void handleDeleteExpense(expense)}
                        disabled={saving}
                        className="rounded-xl bg-rose-50 px-3 py-1.5 font-bold text-rose-700 disabled:opacity-50 dark:bg-rose-950/60 dark:text-rose-300"
                      >
                        حذف
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ==================== مودال الإيرادات ==================== */}
      {activeModal === 'revenue' && (
        <div className={modalOverlay} onClick={() => setActiveModal(null)}>
          <div className={modalBox} dir="rtl" onClick={(e) => e.stopPropagation()}>
            {modalHeader('💰 تفصيل الإيرادات (مدفوعات الطلاب)')}
            <div className="max-h-[60vh] overflow-y-auto">
              {payments.length === 0 ? (
                <p className="py-8 text-center text-xs font-bold text-slate-400">لا توجد مدفوعات مسجلة.</p>
              ) : (
                <table className="w-full text-right text-xs">
                  <thead className={tableHead}>
                    <tr>
                      <th className="p-3">التاريخ</th>
                      <th className="p-3">المبلغ</th>
                    </tr>
                  </thead>
                  <tbody className={tableBody}>
                    {payments.map((p, i) => (
                      <tr key={i} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/40">
                        <td className="p-3 font-mono text-slate-500 dark:text-slate-400" dir="ltr">{p.date}</td>
                        <td className="p-3 font-black text-emerald-600 dark:text-emerald-400">
                          +{formatEGP(p.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60">
                      <th className="p-3 text-xs font-black text-slate-800 dark:text-slate-100">الإجمالي</th>
                      <th className="p-3 text-sm font-black text-emerald-600 dark:text-emerald-400">
                        {formatEGP(totalRevenue)}
                      </th>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== مودال المصروفات ==================== */}
      {activeModal === 'expenses' && (
        <div className={modalOverlay} onClick={() => setActiveModal(null)}>
          <div className={modalBox} dir="rtl" onClick={(e) => e.stopPropagation()}>
            {modalHeader('🧾 تفصيل المصروفات')}
            <div className="max-h-[60vh] overflow-y-auto">
              {expenses.length === 0 ? (
                <p className="py-8 text-center text-xs font-bold text-slate-400">لا توجد مصروفات مسجلة.</p>
              ) : (
                <table className="w-full text-right text-xs">
                  <thead className={tableHead}>
                    <tr>
                      <th className="p-3">التاريخ</th>
                      <th className="p-3">العنوان</th>
                      <th className="p-3">التصنيف</th>
                      <th className="p-3">القيمة</th>
                    </tr>
                  </thead>
                  <tbody className={tableBody}>
                    {expenses.map((expense) => (
                      <tr key={expense.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/40">
                        <td className="p-3 font-mono text-slate-500 dark:text-slate-400" dir="ltr">{expense.date}</td>
                        <td className="p-3 font-bold text-slate-800 dark:text-slate-100">{expense.title}</td>
                        <td className="p-3">
                          <span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                            {expense.category}
                          </span>
                        </td>
                        <td className="p-3 font-black text-rose-600 dark:text-rose-400">
                          −{formatEGP(expense.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60">
                      <th className="p-3 text-xs font-black text-slate-800 dark:text-slate-100" colSpan={3}>
                        الإجمالي
                      </th>
                      <th className="p-3 text-sm font-black text-rose-600 dark:text-rose-400">
                        {formatEGP(totalExpenses)}
                      </th>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== مودال صافي الربح ==================== */}
      {activeModal === 'profit' && (
        <div className={modalOverlay} onClick={() => setActiveModal(null)}>
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-2xl dark:border-slate-600 dark:bg-slate-800" dir="rtl" onClick={(e) => e.stopPropagation()}>
            {modalHeader('📊 تفصيل صافي الربح')}
            <div className="space-y-4">
              <div className="rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-950/50">
                <div className="text-xs font-bold text-slate-500 dark:text-slate-400">إجمالي الإيرادات</div>
                <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  +{formatEGP(totalRevenue)}
                </div>
              </div>
              <div className="rounded-2xl bg-rose-50 p-4 dark:bg-rose-950/50">
                <div className="text-xs font-bold text-slate-500 dark:text-slate-400">إجمالي المصروفات</div>
                <div className="text-2xl font-black text-rose-600 dark:text-rose-400">
                  −{formatEGP(totalExpenses)}
                </div>
              </div>
              <div
                className={`rounded-2xl p-4 ${
                  netProfit >= 0 ? 'bg-indigo-50 dark:bg-indigo-950/50' : 'bg-rose-50 dark:bg-rose-950/50'
                }`}
              >
                <div className="text-xs font-bold text-slate-500 dark:text-slate-400">صافي الربح الفعلي</div>
                <div
                  className={`text-3xl font-black ${
                    netProfit >= 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {netProfit >= 0 ? '+' : '−'}{formatEGP(Math.abs(netProfit))}
                </div>
                <div className="mt-2 text-[11px] font-bold opacity-70">
                  المعادلة: {formatEGP(totalRevenue)} − {formatEGP(totalExpenses)} ={' '}
                  {formatEGP(netProfit)} {netProfit >= 0 ? '✅ ربح' : '⚠️ خسارة'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== مودال الدعم والإعفاءات ==================== */}
      {activeModal === 'exemptions' && (
        <div className={modalOverlay} onClick={() => setActiveModal(null)}>
          <div className={modalBox} dir="rtl" onClick={(e) => e.stopPropagation()}>
            {modalHeader(
              `🎓 الدعم والإعفاءات — ${supportSummary.exemptCount} معفي كلياً + ${supportSummary.partialCount} خصم جزئي`
            )}
            <div className="max-h-[60vh] overflow-y-auto">
              {/* الملخص المالي */}
              <div className="mb-4 rounded-2xl bg-violet-50 p-3 dark:bg-violet-950/50">
                <div className="text-xs font-bold text-slate-500 dark:text-slate-400">إجمالي الدعم المقدم</div>
                <div className="text-2xl font-black text-violet-600 dark:text-violet-400">
                  {formatEGP(supportSummary.total)}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                  <span>🟣 إعفاء كلي: {formatEGP(supportSummary.fullTotal)}</span>
                  <span>🏷️ خصومات جزئية: {formatEGP(supportSummary.partialTotal)}</span>
                </div>
                {supportSummary.unpricedCount > 0 && (
                  <div className="mt-1 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                    ⚠️ {supportSummary.unpricedCount} طالب بصف/مادة غير محددي السعر — حددهما من
                    «الإعدادات ← شبكة أسعار الاشتراكات»
                  </div>
                )}
              </div>

              {/* القسم الأول: المعفيون كلياً */}
              {exemptRows.length === 0 ? (
                <p className="py-6 text-center text-xs font-bold text-slate-400">لا يوجد طلاب معفيون كلياً.</p>
              ) : (
                <>
                  <h4 className="mb-2 mt-1 text-xs font-black text-slate-700 dark:text-slate-200">
                    🟣 معفيون كلياً من المصاريف ({exemptRows.length})
                  </h4>
                  <table className="mb-5 w-full text-right text-xs">
                    <thead className={tableHead}>
                      <tr>
                        <th className="p-3">الطالب</th>
                        <th className="p-3">الصف</th>
                        <th className="p-3">المادة</th>
                        <th className="p-3">قيمة الدعم</th>
                        <th className="p-3">الحالة</th>
                      </tr>
                    </thead>
                    <tbody className={tableBody}>
                      {exemptRows.map((row) => (
                        <tr key={row.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/40">
                          <td className="p-3 font-black text-slate-800 dark:text-slate-100">🎓 {row.name}</td>
                          <td className="p-3 text-slate-600 dark:text-slate-300">{row.grade}</td>
                          <td className="p-3 text-slate-600 dark:text-slate-300">{row.subject}</td>
                          <td className="p-3 font-black text-violet-600 dark:text-violet-400">
                            {row.fee === null ? '—' : formatEGP(row.fee)}
                          </td>
                          <td className="p-3">
                            {row.fee === null ? (
                              <span className="rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                                ⚠️ غير محدد
                              </span>
                            ) : (
                              <span className="rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                                ✅ محدد
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              {/* القسم الثاني: خصومات جزئية */}
              {discountedRows.length > 0 && (
                <>
                  <h4 className="mb-2 text-xs font-black text-slate-700 dark:text-slate-200">
                    🏷️ خصومات جزئية شهرية ({discountedRows.length})
                  </h4>
                  <table className="w-full text-right text-xs">
                    <thead className={tableHead}>
                      <tr>
                        <th className="p-3">الطالب</th>
                        <th className="p-3">الصف</th>
                        <th className="p-3">المادة</th>
                        <th className="p-3">قيمة الخصم الشهري</th>
                      </tr>
                    </thead>
                    <tbody className={tableBody}>
                      {discountedRows.map((row) => (
                        <tr key={row.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/40">
                          <td className="p-3 font-black text-slate-800 dark:text-slate-100">🏷️ {row.name}</td>
                          <td className="p-3 text-slate-600 dark:text-slate-300">{row.grade}</td>
                          <td className="p-3 text-slate-600 dark:text-slate-300">{row.subject}</td>
                          <td className="p-3 font-black text-amber-600 dark:text-amber-400">
                            −{formatEGP(row.discount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60">
                        <th className="p-3 text-xs font-black text-slate-800 dark:text-slate-100" colSpan={3}>
                          إجمالي الخصومات
                        </th>
                        <th className="p-3 text-sm font-black text-amber-600 dark:text-amber-400">
                          {formatEGP(supportSummary.partialTotal)}
                        </th>
                      </tr>
                    </tfoot>
                  </table>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}