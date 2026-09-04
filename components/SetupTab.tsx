'use client';

import React, { useState } from 'react';
import { useCurriculumSettings } from '@/hooks/useCurriculumSettings';
import type { CurriculumKey, PriceMatrix, GroupSchedule } from '@/lib/services/settings';
import { priceKey } from '@/lib/services/settings';
import {
  clearAllData,
  clearTable,
  RESET_TARGETS,
  type ResetTargetKey,
} from '@/lib/services/resetData';

/** مفاتيح الأقسام القائمة (قوائم نصية) — grade_fees و group_schedules لهما قسم خاص بهما. */
type ListSectionKey = Exclude<CurriculumKey, 'grade_fees' | 'group_schedules'>;

interface SectionConfig {
  key: ListSectionKey;
  title: string;
  placeholder: string;
  badgeClass: string;
  buttonClass: string;
}

const SECTIONS: SectionConfig[] = [
  {
    key: 'stages',
    title: 'المراحل الدراسية',
    placeholder: 'إضافة مرحلة جديدة (مثال: رياض الأطفال)',
    badgeClass:
      'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600',
    buttonClass: 'bg-indigo-600 hover:bg-indigo-700',
  },
  {
    key: 'grades',
    title: 'الصفوف الدراسية',
    placeholder: 'إضافة صف جديد (مثال: الصف الرابع)',
    badgeClass:
      'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
    buttonClass: 'bg-emerald-600 hover:bg-emerald-700',
  },
  {
    key: 'subjects',
    title: 'المواد الدراسية',
    placeholder: 'إضافة مادة جديدة (مثال: فيزياء)',
    badgeClass:
      'bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800',
    buttonClass: 'bg-rose-600 hover:bg-rose-700',
  },
];

export default function SetupTab() {
  const {
    stages,
    grades,
    subjects,
    priceMatrix,
    groupSchedules,
    loading,
    error,
    saving,
    addItem,
    savePrices,
    saveGroupSchedule,
    deleteGroupSchedule,
  } = useCurriculumSettings();

  const valuesByKey = { stages, grades, subjects };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <h2 className="text-xl font-black text-slate-800 dark:text-slate-100">إعدادات النظام الدراسية</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          المراحل والصفوف والمواد محفوظة في قاعدة البيانات وتظهر تلقائياً في نماذج إضافة الطلاب
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-3xl border border-slate-200/80 bg-white p-12 text-center text-xs font-bold text-slate-400 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500">
          جاري تحميل الإعدادات...
        </div>
      ) : (
        <>
          {SECTIONS.map((section) => (
            <CurriculumSection
              key={section.key}
              config={section}
              items={valuesByKey[section.key]}
              saving={saving}
              onAdd={(value) => addItem(section.key, value)}
            />
          ))}

          <GroupSchedulesSection
            groupSchedules={groupSchedules}
            saving={saving}
            loading={loading}
            onSave={saveGroupSchedule}
            onDelete={deleteGroupSchedule}
          />

          <PricingMatrixSection
            grades={grades}
            subjects={subjects}
            savedPrices={priceMatrix}
            saving={saving}
            loading={loading}
            onSave={savePrices}
          />
        </>
      )}

      <DangerZone />
    </div>
  );
}

/** شبكة أسعار الاشتراك لكل (صف + مادة) — تُستخدم لحساب قيمة الإعفاءات في الخزينة. */
function PricingMatrixSection({
  grades,
  subjects,
  savedPrices,
  saving,
  loading,
  onSave,
}: {
  grades: string[];
  subjects: string[];
  savedPrices: PriceMatrix;
  saving: boolean;
  loading: boolean;
  onSave: (matrix: PriceMatrix) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // مزامنة المسودة مع القيم المحفوظة عند أول تحميل
  const [syncedKey, setSyncedKey] = useState('');
  if (!loading && syncedKey !== JSON.stringify(savedPrices) && Object.keys(savedPrices).length > 0) {
    const next: Record<string, string> = { ...draft };
    Object.entries(savedPrices).forEach(([key, amount]) => {
      if (next[key] === undefined) next[key] = String(amount);
    });
    setDraft(next);
    setSyncedKey(JSON.stringify(savedPrices));
  }

  const handleSave = async () => {
    setMessage(null);
    const parsed: PriceMatrix = {};
    let invalid = false;

    Object.entries(draft).forEach(([key, raw]) => {
      const trimmed = raw.trim();
      if (trimmed === '') return;
      const value = Number(trimmed);
      if (!Number.isFinite(value) || value < 0) {
        invalid = true;
        return;
      }
      parsed[key] = value;
    });

    if (invalid) {
      setMessage({ ok: false, text: 'توجد قيمة سعر غير صالحة — أدخل أرقاماً موجبة فقط.' });
      return;
    }

    const ok = await onSave(parsed);
    setMessage(
      ok
        ? { ok: true, text: 'تم حفظ شبكة الأسعار بنجاح.' }
        : { ok: false, text: 'تعذر حفظ الأسعار — حاول مرة أخرى.' }
    );
  };

  const inputCell =
    'w-16 rounded-lg border border-slate-200 bg-white px-1.5 py-1.5 text-center text-xs font-black text-slate-800 focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100';

  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <h3 className="mb-1 text-base font-black text-slate-800 dark:text-slate-100">
        🏷️ شبكة أسعار الاشتراكات (صف + مادة)
      </h3>
      <p className="mb-4 text-xs font-bold text-slate-500 dark:text-slate-400">
        حدد سعراً شهرياً لكل مادة داخل كل صف — تُستخدم لحساب «إجمالي الدعم والإعفاءات» في الخزينة.
        اترك الخانة فارغة إذا لم تُدرَّس المادة في ذلك الصف.
      </p>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
        <table className="w-full min-w-[640px] text-right">
          <thead className="bg-slate-50 text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
            <tr>
              <th className="p-3 text-xs font-black">الصف \ المادة</th>
              {subjects.map((subject) => (
                <th key={subject} className="p-3 text-center text-[11px] font-black whitespace-nowrap">
                  {subject}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {grades.map((grade, idx) => (
              <tr
                key={grade}
                className={idx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/60 dark:bg-slate-900/40'}
              >
                <td className="whitespace-nowrap p-3 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                  {grade}
                </td>
                {subjects.map((subject) => {
                  const key = priceKey(grade, subject);
                  return (
                    <td key={key} className="p-2 text-center">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        placeholder="—"
                        value={draft[key] ?? ''}
                        onChange={(e) =>
                          setDraft((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        aria-label={`سعر ${subject} — ${grade}`}
                        className={inputCell}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        {message ? (
          <span
            className={`text-xs font-bold ${
              message.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {message.text}
          </span>
        ) : (
          <span className="text-[10px] font-bold text-slate-400">القيم بالجنيه المصري شهرياً.</span>
        )}

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || loading}
          className="rounded-xl bg-indigo-600 px-6 py-2.5 text-xs font-black text-white transition hover:bg-indigo-700 disabled:opacity-50"
        >
          💾 حفظ الشبكة
        </button>
      </div>
    </div>
  );
}

function dayLabel(day: string): string {
  const labels: Record<string, string> = {
    saturday: 'السبت',
    sunday: 'الأحد',
    monday: 'الاثنين',
    tuesday: 'الثلاثاء',
    wednesday: 'الأربعاء',
    thursday: 'الخميس',
    friday: 'الجمعة',
  };
  return labels[day] || day;
}

/** مواعيد المجموعات (أيام، وقت البداية، وقت النهاية) */
function GroupSchedulesSection({
  groupSchedules,
  saving,
  loading,
  onSave,
  onDelete,
}: {
  groupSchedules: Record<string, GroupSchedule>;
  saving: boolean;
  loading: boolean;
  onSave: (schedule: GroupSchedule) => Promise<boolean>;
  onDelete: (groupName: string) => Promise<boolean>;
}) {
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<GroupSchedule>>({
    groupName: '',
    days: ['saturday', 'monday', 'wednesday'],
    startTime: '08:00',
    endTime: '14:00',
    lateThresholdMinutes: 15,
  });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const dayOptions = [
    { value: 'saturday', label: 'السبت' },
    { value: 'sunday', label: 'الأحد' },
    { value: 'monday', label: 'الاثنين' },
    { value: 'tuesday', label: 'الثلاثاء' },
    { value: 'wednesday', label: 'الأربعاء' },
    { value: 'thursday', label: 'الخميس' },
    { value: 'friday', label: 'الجمعة' },
  ];

  const handleDayToggle = (day: string) => {
    setDraft((prev) => {
      const currentDays = prev.days || [];
      const newDays = currentDays.includes(day)
        ? currentDays.filter((d) => d !== day)
        : [...currentDays, day];
      return { ...prev, days: newDays };
    });
  };

  const handleEdit = (groupName: string) => {
    const schedule = groupSchedules[groupName];
    if (schedule) {
      setEditingGroup(groupName);
      setDraft({ ...schedule });
    }
  };

  const handleNew = () => {
    setEditingGroup('new');
    setDraft({
      groupName: '',
      days: ['saturday', 'monday', 'wednesday'],
      startTime: '08:00',
      endTime: '14:00',
      lateThresholdMinutes: 15,
    });
  };

  const handleCancel = () => {
    setEditingGroup(null);
    setDraft({
      groupName: '',
      days: ['saturday', 'monday', 'wednesday'],
      startTime: '08:00',
      endTime: '14:00',
      lateThresholdMinutes: 15,
    });
    setMessage(null);
  };

  const handleSave = async () => {
    if (!draft.groupName?.trim()) {
      setMessage({ ok: false, text: 'يرجى إدخال اسم المجموعة.' });
      return;
    }
    if (!draft.days?.length) {
      setMessage({ ok: false, text: 'يرجى اختيار يوم واحد على الأقل.' });
      return;
    }
    if (!draft.startTime || !draft.endTime) {
      setMessage({ ok: false, text: 'يرجى تحديد وقت البداية والنهاية.' });
      return;
    }

    setMessage(null);
    try {
      const schedule: GroupSchedule = {
        groupName: draft.groupName.trim(),
        days: draft.days,
        startTime: draft.startTime,
        endTime: draft.endTime,
        lateThresholdMinutes: typeof draft.lateThresholdMinutes === 'number' && Number.isFinite(draft.lateThresholdMinutes) && draft.lateThresholdMinutes >= 0
          ? draft.lateThresholdMinutes
          : undefined,
      };
      const ok = await onSave(schedule);
      setMessage(
        ok
          ? { ok: true, text: editingGroup === 'new' ? 'تم إضافة مواعيد المجموعة بنجاح.' : 'تم تحديث مواعيد المجموعة بنجاح.' }
          : { ok: false, text: 'تعذر حفظ مواعيد المجموعة — حاول مرة أخرى.' }
      );
      if (ok) handleCancel();
    } catch {
      setMessage({ ok: false, text: 'تعذر حفظ مواعيد المجموعة — حاول مرة أخرى.' });
    }
  };

  const handleDelete = async (groupName: string) => {
    if (!window.confirm(`هل أنت متأكد من حذف مواعيد المجموعة "${groupName}"؟`)) return;
    setMessage(null);
    try {
      const ok = await onDelete(groupName);
      setMessage(
        ok
          ? { ok: true, text: 'تم حذف مواعيد المجموعة بنجاح.' }
          : { ok: false, text: 'تعذر حذف مواعيد المجموعة.' }
      );
    } catch {
      setMessage({ ok: false, text: 'تعذر حذف مواعيد المجموعة.' });
    }
  };

  const scheduleEntries = Object.entries(groupSchedules).sort(([a], [b]) => a.localeCompare(b, 'ar'));

  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-black text-slate-800 dark:text-slate-100">📅 مواعيد المجموعات</h3>
        <button
          type="button"
          onClick={handleNew}
          disabled={saving || loading}
          className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50"
        >
          ➕ إضافة مجموعة
        </button>
      </div>

      {message && (
        <div
          className={`mb-4 rounded-2xl p-3 text-xs font-bold ${
            message.ok
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
              : 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
          }`}
        >
          {message.text}
        </div>
      )}

      {editingGroup !== null ? (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
          <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">
            {editingGroup === 'new' ? 'إضافة مواعيد مجموعة جديدة' : `تعديل: ${draft.groupName}`}
          </h4>

          <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">
            اسم المجموعة *
            <input
              type="text"
              value={draft.groupName || ''}
              onChange={(e) => setDraft((p) => ({ ...p, groupName: e.target.value }))}
              placeholder="مثال: مجموعة 1، مجموعة الفيزياء،..."
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </label>

          <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">
            أيام الدراسة *
            <div className="mt-2 flex flex-wrap gap-2">
              {dayOptions.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => handleDayToggle(d.value)}
                  className={`rounded-xl px-3 py-2 text-xs font-bold transition ${
                    draft.days?.includes(d.value)
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </label>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">
              وقت البداية *
              <input
                type="time"
                value={draft.startTime || ''}
                onChange={(e) => setDraft((p) => ({ ...p, startTime: e.target.value }))}
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>

            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">
              وقت النهاية *
              <input
                type="time"
                value={draft.endTime || ''}
                onChange={(e) => setDraft((p) => ({ ...p, endTime: e.target.value }))}
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>

            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">
              حد التأخير (دقيقة)
              <input
                type="number"
                min="0"
                max="120"
                value={draft.lateThresholdMinutes ?? 15}
                onChange={(e) => setDraft((p) => ({ ...p, lateThresholdMinutes: Number(e.target.value) || 0 }))}
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'جاري الحفظ...' : editingGroup === 'new' ? 'إضافة' : 'حفظ'}
            </button>
          </div>
        </div>
      ) : (
        <div>
          {scheduleEntries.length === 0 ? (
            <div className="rounded-2xl bg-slate-50 p-8 text-center text-xs font-bold text-slate-400 dark:bg-slate-900 dark:text-slate-500">
              لا توجد مواعيد مجموعات محفوظة بعد. اضغط «إضافة مجموعة» للبدء.
            </div>
          ) : (
            <div className="space-y-3">
              {scheduleEntries.map(([, schedule]) => (
                <div
                  key={schedule.groupName}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="bg-indigo-100 p-2 rounded-xl text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
                      📅
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-800 dark:text-slate-100">{schedule.groupName}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap gap-2">
                        <span>{schedule.days.map(dayLabel).join('، ')}</span>
                        <span className="text-indigo-600 dark:text-indigo-400">|</span>
                        <span>{schedule.startTime} – {schedule.endTime}</span>
                        {schedule.lateThresholdMinutes !== undefined && (
                          <>
                            <span className="text-indigo-600 dark:text-indigo-400">|</span>
                            <span className="text-amber-600 dark:text-amber-400">⏱️ تأخير: {schedule.lateThresholdMinutes} د</span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleEdit(schedule.groupName)}
                      className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200"
                    >
                      ✏️ تعديل
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(schedule.groupName)}
                      className="rounded-xl bg-rose-100 px-3 py-1.5 text-xs font-bold text-rose-700 transition hover:bg-rose-200 dark:bg-rose-950/40 dark:text-rose-300"
                    >
                      🗑️ حذف
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CurriculumSection({
  config,
  items,
  saving,
  onAdd,
}: {
  config: SectionConfig;
  items: string[];
  saving: boolean;
  onAdd: (value: string) => Promise<boolean>;
}) {
  const [newValue, setNewValue] = useState('');

  const handleAdd = async () => {
    const ok = await onAdd(newValue);
    if (ok) setNewValue('');
  };

  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <h3 className="mb-4 text-base font-black text-slate-800 dark:text-slate-100">{config.title}</h3>
      <div className="mb-4 flex gap-3">
        <input
          type="text"
          placeholder={config.placeholder}
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void handleAdd();
            }
          }}
          className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-bold text-slate-800 focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        />
        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={saving || !newValue.trim()}
          className={`rounded-2xl px-6 py-2 text-xs font-extrabold text-white shadow-sm transition disabled:opacity-50 ${config.buttonClass}`}
        >
          {saving ? 'جاري الحفظ...' : 'إضافة'}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.length === 0 ? (
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500">لا توجد عناصر بعد.</span>
        ) : (
          items.map((item, idx) => (
            <span
              key={idx}
              className={`rounded-xl border px-4 py-1.5 text-xs font-bold ${config.badgeClass}`}
            >
              {item}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

/** منطقة الخطر: تصفية البيانات التجريبية للبدء في بيئة نظيفة. */
function DangerZone() {
  const [target, setTarget] = useState<ResetTargetKey | 'all'>('all');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const targetLabel =
    target === 'all'
      ? 'كل البيانات (طلاب، حضور، درجات، مدفوعات، مصروفات، اختبارات)'
      : RESET_TARGETS.find((t) => t.key === target)?.label ?? '';

  const canRun = confirmation.trim() === 'مسح' && !busy;

  const handleReset = async () => {
    if (!window.confirm(`تحذير نهائي: سيتم حذف ${targetLabel} نهائياً ولا يمكن التراجع. متابعة؟`)) {
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      if (target === 'all') await clearAllData();
      else await clearTable(target);

      setMessage({ ok: true, text: `تم مسح ${targetLabel} بنجاح.` });
      setConfirmation('');
    } catch (err) {
      setMessage({
        ok: false,
        text: err instanceof Error ? err.message : 'تعذر تنفيذ عملية المسح.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-3xl border-2 border-rose-300 bg-white p-6 shadow-sm dark:border-rose-800 dark:bg-slate-800">
      <h3 className="text-base font-black text-rose-600 dark:text-rose-400">
        ⚠️ منطقة الخطر — تصفية البيانات التجريبية
      </h3>
      <p className="mt-1 mb-4 text-xs font-bold text-slate-500 dark:text-slate-400">
        اختر البيانات المراد مسحها نهائياً للبدء ببيئة عمل نظيفة، ثم اكتب كلمة «مسح» للتأكيد.
      </p>

      <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-3">
        <label className="text-xs font-bold text-slate-600 dark:text-slate-300">
          البيانات المطلوب مسحها
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value as ResetTargetKey | 'all')}
            className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="all">🧹 كل البيانات دفعة واحدة</option>
            {RESET_TARGETS.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs font-bold text-slate-600 dark:text-slate-300">
          اكتب «مسح» للتأكيد
          <input
            type="text"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder="مسح"
            className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>

        <button
          type="button"
          onClick={() => void handleReset()}
          disabled={!canRun}
          className="rounded-2xl bg-rose-600 px-4 py-2.5 text-xs font-black text-white transition hover:bg-rose-700 disabled:opacity-40"
        >
          {busy ? 'جاري المسح...' : `🗑️ مسح ${target === 'all' ? 'الكل' : targetLabel}`}
        </button>
      </div>

      {message && (
        <div
          className={`mt-4 rounded-2xl p-3 text-xs font-bold ${
            message.ok
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
              : 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
