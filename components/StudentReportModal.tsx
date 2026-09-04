'use client';

import { useEffect, useMemo, useState } from 'react';
import { getAttendance } from '@/lib/services/attendance';
import { getAllExamResults, getExams, type Exam } from '@/lib/services/exams';
import { getPayments } from '@/lib/services/payments';
import type { ApplicationStudent } from '@/lib/services/students';

interface StudentReportModalProps {
  student: ApplicationStudent;
  onClose: () => void;
}

interface ReportData {
  attendance: { present: number; absent: number; late: number; excused: number };
  grades: { title: string; date: string; score: number; max: number; pct: number; absent: boolean }[];
  paidThisMonth: { total: number; records: { date: string; amount: number; month: string }[] };
}

const monthPrefixOf = (isoDate: string | null | undefined): string =>
  (isoDate || '').slice(0, 7);

export default function StudentReportModal({ student, onClose }: StudentReportModalProps) {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [month, setMonth] = useState(defaultMonth);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState('');

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      await Promise.resolve();
      if (cancelled) return;

      try {
        const [attendance, exams, results, payments] = await Promise.all([
          getAttendance(),
          getExams(),
          getAllExamResults(),
          getPayments(),
        ]);
        if (cancelled) return;

        const examById = new Map<number, Exam>(exams.map((e) => [e.id, e]));

        // حضور الشهر
        const att = { present: 0, absent: 0, late: 0, excused: 0 };
        attendance
          .filter((r) => r.student_id === student.id && monthPrefixOf(r.date) === month)
          .forEach((r) => {
            const status = (r.status || '').toLowerCase();
            if (status === 'present') att.present += 1;
            else if (status === 'absent') att.absent += 1;
            else if (status === 'late') att.late += 1;
            else if (status === 'excused') att.excused += 1;
          });

        // درجات الشهر (ربط النتيجة بتاريخ الاختبار من جدول exams)
        const grades = results
          .filter(
            (r) =>
              r.student_id === student.id &&
              monthPrefixOf(examById.get(r.exam_id ?? -1)?.exam_date) === month
          )
          .map((r) => {
            const exam = examById.get(r.exam_id ?? -1);
            const max = r.max_score > 0 ? r.max_score : 1;
            return {
              title: exam?.title || r.exam_name,
              date: exam?.exam_date || '-',
              score: r.notes === 'غائب' ? 0 : r.score,
              max: r.max_score,
              pct: Math.round((r.score / max) * 100),
              absent: r.notes === 'غائب',
            };
          })
          .sort((a, b) => a.date.localeCompare(b.date));

        // مدفوعات الشهر
        const monthPayments = payments
          .filter(
            (p) =>
              p.student_id === student.id &&
              monthPrefixOf(p.payment_date || p.created_at) === month
          )
          .map((p) => ({
            date: (p.payment_date || p.created_at || '').slice(0, 10),
            amount: Number(p.amount_paid ?? 0),
            month: p.month_name,
          }));

        setData({
          attendance: att,
          grades,
          paidThisMonth: {
            total: monthPayments.reduce((sum, p) => sum + p.amount, 0),
            records: monthPayments,
          },
        });
        setErrorText('');
      } catch {
        if (!cancelled) setErrorText('تعذر تحميل بيانات التقرير — تأكد من تنفيذ سكريبتات SQL.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [student.id, month]);

  const avgPct = useMemo(() => {
    if (!data || data.grades.length === 0) return null;
    const sum = data.grades.reduce((acc, g) => acc + g.pct, 0);
    return Math.round(sum / data.grades.length);
  }, [data]);

  const netDue = student.isExempt
    ? 0
    : Math.max(0, (student.dueAmount ?? 0) - (student.discountAmount ?? 0));

  const financeStatus = student.isExempt
    ? { text: 'معفى من المصاريف 🎓', cls: 'text-violet-600 dark:text-violet-400' }
    : data && data.paidThisMonth.total > 0 && netDue === 0
      ? { text: 'مسدد بالكامل ✅', cls: 'text-emerald-600 dark:text-emerald-400' }
      : netDue > 0
        ? { text: `متبقٍ عليه ${netDue} ج.م ⚠️`, cls: 'text-rose-600 dark:text-rose-400' }
        : { text: 'لا توجد مستحقات مسجلة', cls: 'text-slate-500 dark:text-slate-400' };

  const gradeWord = (pct: number): string => {
    if (pct >= 90) return 'ممتاز 🌟';
    if (pct >= 80) return 'جيد جداً 👏';
    if (pct >= 70) return 'جيد 👍';
    if (pct >= 50) return 'مقبول';
    return 'ضعيف ⚠️';
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="print-area max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-8 shadow-2xl"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ترويسة التقرير */}
        <div className="text-center">
          <h2 className="text-2xl font-black text-indigo-600">🎓 EduCore التعليمي</h2>
          <p className="mt-1 text-xs font-bold text-slate-500">التقرير الشهري الشامل للطالب</p>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4">
          <div>
            <div className="text-lg font-black text-slate-800">{student.name}</div>
            <div className="mt-0.5 text-[11px] font-bold text-slate-500">
              كود: <span dir="ltr">#{student.barcode || '—'}</span> • {student.stage || '—'} •{' '}
              {student.grade || '—'} • مجموعة {student.group || '—'} • {student.subject || '—'}
            </div>
          </div>
          <label className="text-[11px] font-bold text-slate-500">
            الشهر
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="mr-2 rounded-xl border border-slate-200 bg-white px-2 py-1 text-xs font-black text-slate-700 focus:outline-none"
            />
          </label>
        </div>

        {loading ? (
          <p className="py-12 text-center text-xs font-bold text-slate-400">جاري تجميع بيانات التقرير...</p>
        ) : errorText ? (
          <p className="py-12 text-center text-xs font-bold text-rose-500">{errorText}</p>
        ) : (
          <>
            {/* ملخص الحضور */}
            <h3 className="mb-2 mt-6 text-sm font-black text-slate-700">📅 ملخص الحضور والغياب</h3>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-950/40">
                <div className="text-lg font-black text-emerald-600">{data?.attendance.present ?? 0}</div>
                <div className="text-[10px] font-bold text-slate-500">حاضر</div>
              </div>
              <div className="rounded-xl bg-rose-50 p-3 dark:bg-rose-950/40">
                <div className="text-lg font-black text-rose-600">{data?.attendance.absent ?? 0}</div>
                <div className="text-[10px] font-bold text-slate-500">غائب</div>
              </div>
              <div className="rounded-xl bg-amber-50 p-3 dark:bg-amber-950/40">
                <div className="text-lg font-black text-amber-600">{data?.attendance.late ?? 0}</div>
                <div className="text-[10px] font-bold text-slate-500">متأخر</div>
              </div>
              <div className="rounded-xl bg-sky-50 p-3 dark:bg-sky-950/40">
                <div className="text-lg font-black text-sky-600">{data?.attendance.excused ?? 0}</div>
                <div className="text-[10px] font-bold text-slate-500">بعذر</div>
              </div>
            </div>

            {/* ملخص الدرجات */}
            <h3 className="mb-2 mt-6 text-sm font-black text-slate-700">🧪 نتائج الاختبارات</h3>
            {!data || data.grades.length === 0 ? (
              <p className="rounded-xl bg-slate-50 p-4 text-center text-xs font-bold text-slate-400">
                لا توجد اختبارات مسجلة لهذا الشهر.
              </p>
            ) : (
              <table className="w-full text-right text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="p-2.5">الاختبار</th>
                    <th className="p-2.5">التاريخ</th>
                    <th className="p-2.5">الدرجة</th>
                    <th className="p-2.5">النسبة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.grades.map((g, i) => (
                    <tr key={i}>
                      <td className="p-2.5 font-bold text-slate-700">
                        {g.title} {g.absent && <span className="text-[10px] text-amber-500">(غائب)</span>}
                      </td>
                      <td className="p-2.5 font-mono text-slate-500" dir="ltr">{g.date}</td>
                      <td className="p-2.5 font-black text-slate-800">
                        {g.score} / {g.max}
                      </td>
                      <td className="p-2.5">
                        <span
                          className={`rounded-md px-2 py-0.5 font-black ${
                            g.pct >= 50
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {g.pct}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50">
                    <th className="p-2.5 text-xs" colSpan={3}>المتوسط العام</th>
                    <th className="p-2.5 text-sm font-black text-indigo-600">
                      {avgPct}%{' '}
                      <span className="text-[10px] font-bold text-slate-500">
                        ({avgPct !== null ? gradeWord(avgPct) : ''})
                      </span>
                    </th>
                  </tr>
                </tfoot>
              </table>
            )}

            {/* الموقف المالي */}
            <h3 className="mb-2 mt-6 text-sm font-black text-slate-700">💳 الموقف المالي</h3>
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className={`text-sm font-black ${financeStatus.cls}`}>{financeStatus.text}</div>
              <div className="mt-2 text-[11px] font-bold text-slate-500">
                مدفوعات الشهر:{' '}
                <span className="text-emerald-600">{data?.paidThisMonth.total ?? 0} ج.م</span>
              </div>
              {data && data.paidThisMonth.records.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-[10px] font-bold text-slate-400">
                  {data.paidThisMonth.records.map((r, i) => (
                    <li key={i} className="flex justify-between">
                      <span>{r.month}</span>
                      <span dir="ltr">{r.date}</span>
                      <span>{r.amount} ج.م ✓</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p className="mt-6 text-center text-[10px] text-slate-400">
              شكراً لمتابعتكم المستمرة 🌹 — مركز EduCore التعليمي
            </p>
          </>
        )}

        {/* أزرار (تختفي عند الطباعة) */}
        <div className="mt-6 flex flex-wrap justify-center gap-2 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            disabled={loading}
            className="rounded-xl bg-slate-800 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-slate-700 disabled:opacity-50"
          >
            🖨️ طباعة / حفظ PDF
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-100 px-5 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-200"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
