'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addMaterial,
  deleteMaterial,
  deliverMaterial,
  getMaterials,
  Material,
  updateMaterial,
} from '@/lib/services/materials';
import { useCurriculumSettings } from '@/hooks/useCurriculumSettings';
import { getFriendlyErrorMessage } from '@/lib/errors';

export default function InventoryTab() {
  const { grades, subjects } = useCurriculumSettings();

  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // النموذج (إضافة/تعديل)
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [subject, setSubject] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [lowStock, setLowStock] = useState('5');

  // التسليم
  const [deliverTarget, setDeliverTarget] = useState<Material | null>(null);
  const [deliverQty, setDeliverQty] = useState('1');

  const loadData = useCallback(async () => {
    try {
      const materialsData = await getMaterials();
      setMaterials(materialsData);
      setError('');
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'تعذر تحميل بيانات المخزون.'));
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

  const lowStockMaterials = useMemo(
    () => materials.filter((m) => m.quantity < m.low_stock),
    [materials]
  );

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setGrade('');
    setSubject('');
    setPrice('');
    setQuantity('');
    setLowStock('5');
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const parsedPrice = Number(price);
    const parsedQty = Number(quantity);
    const parsedLow = Number(lowStock);

    if (!name.trim()) {
      setError('يرجى إدخال اسم الملزمة.');
      return;
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setError('يرجى إدخال سعر بيع صحيح.');
      return;
    }
    if (!Number.isSafeInteger(parsedQty) || parsedQty < 0) {
      setError('يرجى إدخال كمية صحيحة.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const input = {
        name,
        grade: grade || null,
        subject: subject || null,
        price: parsedPrice,
        quantity: parsedQty,
        low_stock: Number.isSafeInteger(parsedLow) && parsedLow >= 0 ? parsedLow : 5,
      };

      if (editingId !== null) {
        await updateMaterial(editingId, input);
        setSuccess(`تم تحديث الملزمة: ${name.trim()}`);
      } else {
        await addMaterial(input);
        setSuccess(`تمت إضافة الملزمة: ${name.trim()}`);
      }
      resetForm();
      await loadData();
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'تعذر حفظ الملزمة.'));
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (material: Material) => {
    setEditingId(material.id);
    setName(material.name);
    setGrade(material.grade || '');
    setSubject(material.subject || '');
    setPrice(String(material.price));
    setQuantity(String(material.quantity));
    setLowStock(String(material.low_stock));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (material: Material) => {
    if (!window.confirm(`حذف الملزمة "${material.name}" نهائياً من المخزون؟`)) return;

    setSaving(true);
    setError('');
    try {
      await deleteMaterial(material.id);
      await loadData();
      setSuccess('تم حذف الملزمة.');
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'تعذر حذف الملزمة.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeliver = async () => {
    if (!deliverTarget) return;

    const qty = Number(deliverQty);
    setSaving(true);
    setError('');

    try {
      const result = await deliverMaterial(deliverTarget, qty);
      await loadData();
      setDeliverTarget(null);
      setDeliverQty('1');
      setSuccess(
        `تم تسليم ${qty} قطعة وخصمها من المخزون (القيمة: ${result.total} ج.م). التحصيل المالي يُسجَّل من تبويب المالية عند الحاجة.`
      );
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'تعذر تنفيذ عملية التسليم.'));
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';

  const labelTextClass = 'text-xs font-bold text-slate-600 dark:text-slate-300';

  const cardClass =
    'rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800';

  return (
    <div className="w-full space-y-6" dir="rtl">
      {/* ==================== العنوان ==================== */}
      <div className={cardClass}>
        <h2 className="text-xl font-black text-slate-800 dark:text-slate-100">📦 الملزمات والمخزون</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          جرد الملزمات، التسليم السريع للطلاب، وتسجيل المبيعات مالياً تلقائياً
        </p>

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
      </div>

      {/* ==================== تنبيه النقص ==================== */}
      {!loading && lowStockMaterials.length > 0 && (
        <div className="rounded-3xl border-2 border-amber-300 bg-amber-50 p-5 dark:border-amber-700 dark:bg-amber-950/30">
          <h3 className="text-sm font-black text-amber-700 dark:text-amber-300">
            ⚠️ تنبيه نقص المخزون ({lowStockMaterials.length} ملزمة)
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {lowStockMaterials.map((m) => (
              <span
                key={m.id}
                className="rounded-xl bg-white px-3 py-1.5 text-xs font-black text-amber-700 shadow-sm dark:bg-slate-800 dark:text-amber-300"
              >
                {m.name} — باقي {m.quantity} قطعة فقط!
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ==================== نموذج الإضافة/التعديل ==================== */}
      <div className={cardClass}>
        <h3 className="mb-4 text-base font-black text-slate-800 dark:text-slate-100">
          {editingId !== null ? '✏️ تعديل ملزمة' : '➕ إضافة ملزمة جديدة'}
        </h3>

        <form onSubmit={handleSave} className="grid grid-cols-1 items-end gap-4 md:grid-cols-6">
          <label className={`${labelTextClass} md:col-span-2`}>
            اسم الملزمة <span className="text-rose-500">*</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: ملزمة الرياضيات الترم الأول"
              required
              className={inputClass}
            />
          </label>

          <label className={labelTextClass}>
            الصف
            <select value={grade} onChange={(e) => setGrade(e.target.value)} className={inputClass}>
              <option value="">-- بدون --</option>
              {grades.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </label>

          <label className={labelTextClass}>
            المادة
            <select value={subject} onChange={(e) => setSubject(e.target.value)} className={inputClass}>
              <option value="">-- بدون --</option>
              {subjects.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>

          <label className={labelTextClass}>
            سعر البيع (ج.م) <span className="text-rose-500">*</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
              className={inputClass}
            />
          </label>

          <label className={labelTextClass}>
            الكمية بالمخزن <span className="text-rose-500">*</span>
            <input
              type="number"
              min="0"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
              className={inputClass}
            />
          </label>

          <label className={labelTextClass}>
            حد تنبيه النقص
            <input
              type="number"
              min="0"
              step="1"
              value={lowStock}
              onChange={(e) => setLowStock(e.target.value)}
              className={inputClass}
            />
          </label>

          <div className="flex gap-2 md:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-2xl bg-indigo-600 px-4 py-2.5 text-xs font-black text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'جاري الحفظ...' : editingId !== null ? '💾 حفظ التعديل' : '➕ إضافة للمخزون'}
            </button>
            {editingId !== null && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-2xl bg-slate-100 px-4 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200"
              >
                إلغاء
              </button>
            )}
          </div>
        </form>
      </div>

      {/* ==================== جدول المخزون ==================== */}
      <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center justify-between border-b border-slate-100 p-6 dark:border-slate-700">
          <h3 className="text-base font-black text-slate-800 dark:text-slate-100">
            جرد المخزون ({materials.length} ملزمة)
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

        {loading ? (
          <div className="p-12 text-center text-xs font-bold text-slate-400 dark:text-slate-500">
            جاري تحميل المخزون...
          </div>
        ) : materials.length === 0 ? (
          <div className="p-12 text-center text-xs font-bold text-slate-400 dark:text-slate-500">
            لا توجد ملزمات بعد — أضف أول ملزمة من النموذج أعلاه.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="border-b border-slate-100 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
                <tr>
                  <th className="p-4">الملزمة</th>
                  <th className="p-4">الصف / المادة</th>
                  <th className="p-4">سعر البيع</th>
                  <th className="p-4">المخزون</th>
                  <th className="p-4">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {materials.map((material) => {
                  const isLow = material.quantity < material.low_stock;
                  return (
                    <tr key={material.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/40">
                      <td className="p-4 font-black text-slate-800 dark:text-slate-100">📘 {material.name}</td>
                      <td className="p-4 text-slate-600 dark:text-slate-300">
                        {[material.grade, material.subject].filter(Boolean).join(' — ') || '-'}
                      </td>
                      <td className="p-4 font-black text-indigo-600 dark:text-indigo-400">
                        {material.price} ج.م
                      </td>
                      <td className="p-4">
                        <span
                          className={`rounded-lg px-2.5 py-1 font-black ${
                            isLow
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                              : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                          }`}
                        >
                          {material.quantity} قطعة{isLow ? ' ⚠️' : ''}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setDeliverTarget(material)}
                            disabled={material.quantity === 0}
                            className="rounded-xl bg-emerald-50 px-3 py-1.5 font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-40 dark:bg-emerald-950/60 dark:text-emerald-300"
                          >
                            📤 تسليم
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStartEdit(material)}
                            className="rounded-xl bg-indigo-50 px-3 py-1.5 font-bold text-indigo-600 transition hover:bg-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-300"
                          >
                            تعديل
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(material)}
                            disabled={saving}
                            className="rounded-xl bg-rose-50 px-3 py-1.5 font-bold text-rose-700 disabled:opacity-50 dark:bg-rose-950/60 dark:text-rose-300"
                          >
                            حذف
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ==================== مودال التسليم ==================== */}
      {deliverTarget && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          onClick={() => setDeliverTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-600 dark:bg-slate-800"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-black text-slate-800 dark:text-slate-100">
                📤 تسليم: {deliverTarget.name}
              </h3>
              <button
                type="button"
                onClick={() => setDeliverTarget(null)}
                className="rounded-lg px-2 py-1 text-sm font-black text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                ✕
              </button>
            </div>

            <div className="mb-4 rounded-2xl bg-slate-50 p-3 text-xs font-bold text-slate-600 dark:bg-slate-900 dark:text-slate-300">
              السعر: {deliverTarget.price} ج.م — المتاح بالمخزون: {deliverTarget.quantity} قطعة
            </div>

            <div className="space-y-4">
              <label className={labelTextClass}>
                الكمية المسلّمة *
                <input
                  type="number"
                  min="1"
                  max={deliverTarget.quantity}
                  step="1"
                  value={deliverQty}
                  onChange={(e) => setDeliverQty(e.target.value)}
                  className={inputClass}
                />
              </label>

              <div className="rounded-2xl bg-indigo-50 p-3 text-xs font-bold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                💡 قيمة هذه العملية:{' '}
                {Math.round(deliverTarget.price * (Number(deliverQty) || 0) * 100) / 100} ج.م —
                يُسجَّل التحصيل المالي يدوياً من تبويب «المالية والاشتراكات» عند الحاجة.
              </div>

              <button
                type="button"
                onClick={() => void handleDeliver()}
                disabled={saving || !Number.isSafeInteger(Number(deliverQty)) || Number(deliverQty) < 1}
                className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-xs font-black text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? 'جاري التنفيذ...' : '✅ تأكيد التسليم'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
