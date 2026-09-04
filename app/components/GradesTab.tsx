'use client';
import React, { useState, useEffect } from 'react';
import { addGrade, getGrades, GradeRecord } from '@/lib/services/grades';
import { getStudentOptions, StudentOption } from '@/lib/services/students';
import { calculateStudentAverageGrade } from '@/lib/calculations';
import { gradeMessage } from '@/lib/whatsapp';
import WhatsAppButton from './WhatsAppButton';
// ✅ استيراد Hook إعدادات السنتر
import { useCenterSettings } from '@/hooks/useCenterSettings';

interface PerformanceData {
  student_name: string;
  average_score: number;
  group_name: string;
  is_at_risk: boolean;
}

interface GradeWithStudent extends GradeRecord {
  students?: {
    name: string;
    group_name: string;
  };
}

export default function GradesAndPerformancePage() {
  // ✅ استخدام إعدادات السنتر
  const { settings: centerSettings } = useCenterSettings();

  const [activeTab, setActiveTab] = useState<'grades' | 'performance'>('grades');
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [gradesList, setGradesList] = useState<GradeWithStudent[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [examName, setExamName] = useState<string>('');
  const [score, setScore] = useState<string>('');
  const [maxScore, setMaxScore] = useState<string>('100');
  const [loadingGrades, setLoadingGrades] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [performanceData, setPerformanceData] = useState<PerformanceData[]>([]);
  const [loadingPerformance, setLoadingPerformance] = useState<boolean>(true);
  const [lastGrade, setLastGrade] = useState<{
    studentId: number;
    examName: string;
    score: number;
    maxScore: number;
  } | null>(null);

  const studentsById = React.useMemo(
    () => new Map(students.map((student) => [student.id, student])),
    [students]
  );

  const fetchStudents = async (): Promise<StudentOption[]> => {
    try {
      const loadedStudents = await getStudentOptions();
      setStudents(loadedStudents);
      return loadedStudents;
    } catch (err: unknown) {
      console.error('Error fetching students:', err);
      setErrorMessage('تعذر تحميل قائمة الطلاب.');
      return [];
    }
  };

  const fetchGrades = async (
    loadedStudents: StudentOption[] = students,
    loadedGrades?: GradeRecord[]
  ): Promise<boolean> => {
    try {
      const data = loadedGrades ?? (await getGrades());
      const studentsById = new Map(loadedStudents.map((student) => [student.id, student]));
      setGradesList(
        data.map((grade): GradeWithStudent => {
          const matchedStudent = grade.student_id
            ? studentsById.get(grade.student_id)
            : undefined;
          return {
            ...grade,
            students: grade.student_id
              ? {
                  name: matchedStudent?.name || 'غير معروف',
                  group_name: matchedStudent?.group_name || 'بدون مجموعة',
                }
              : undefined,
          };
        })
      );
      return true;
    } catch (err: unknown) {
      console.error('Error fetching grades:', err);
      setErrorMessage('تعذر تحميل الدرجات.');
      return false;
    } finally {
      setLoadingGrades(false);
    }
  };

  const fetchPerformanceData = async (
    loadedStudents: StudentOption[] = students,
    loadedGrades?: GradeRecord[]
  ): Promise<boolean> => {
    try {
      const grades = loadedGrades ?? (await getGrades());
      const studentsById = new Map(loadedStudents.map((student) => [student.id, student]));
      if (grades) {
        const stats: Record<string, { grades: GradeRecord[]; group: string }> = {};
        grades.forEach((g) => {
          const student = g.student_id ? studentsById.get(g.student_id) : undefined;
          const name = student?.name || 'غير معروف';
          if (!stats[name]) {
            stats[name] = { grades: [], group: 'بدون مجموعة' };
          }
          stats[name].grades.push(g);
        });
        const processed = Object.keys(stats).map((name) => {
          const avg = calculateStudentAverageGrade(stats[name].grades);
          return {
            student_name: name,
            average_score: avg,
            group_name: stats[name].group,
            is_at_risk: avg < 60,
          };
        });
        setPerformanceData(processed.sort((a, b) => a.average_score - b.average_score));
      }
      return true;
    } catch (err: unknown) {
      console.error('Error in performance analysis:', err);
      setErrorMessage('تعذر تحليل الأداء.');
      return false;
    } finally {
      setLoadingPerformance(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await Promise.resolve();
        if (cancelled) return;
        const loadedStudents = await fetchStudents();
        const loadedGrades = await getGrades();
        if (cancelled) return;
        await fetchGrades(loadedStudents, loadedGrades);
        await fetchPerformanceData(loadedStudents, loadedGrades);
      } catch (err: unknown) {
        console.error('Error loading grades:', err);
        if (!cancelled) setErrorMessage('تعذر تحميل الدرجات.');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId || !examName || !score) {
      alert('يرجى تعبئة الحقول الإجبارية');
      return;
    }
    setSaving(true);
    setSuccessMessage('');
    setErrorMessage('');
    try {
      await addGrade({
        student_id: Number(selectedStudentId),
        exam_name: examName,
        score: Number(score),
        max_score: Number(maxScore),
      });
      const loadedGrades = await getGrades();
      const gradesRefreshed = await fetchGrades(students, loadedGrades);
      if (!gradesRefreshed) throw new Error('تعذر تحديث قائمة الدرجات.');
      await fetchPerformanceData(students, loadedGrades);
      setExamName('');
      setScore('');
      setSelectedStudentId('');
      setSuccessMessage('تم تسجيل درجات الاختبار بنجاح.');
      setLastGrade({
        studentId: Number(selectedStudentId),
        examName,
        score: Number(score),
        maxScore: Number(maxScore),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'خطأ غير معروف';
      setErrorMessage(message);
      console.error('Error saving grade:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full space-y-6" dir="rtl">
      {/* ✅ شريط اسم السنتر والسنة الدراسية */}
      <div className="rounded-3xl border border-indigo-200/80 bg-gradient-to-l from-indigo-50 to-white p-6 shadow-sm dark:border-indigo-800 dark:from-slate-900 dark:to-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-[250px]">
            <div className="bg-indigo-600 text-white p-3 rounded-2xl text-xl"></div>
            <div className="flex-1">
              <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                سجل الدرجات والأداء
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

      <div className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('grades')}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs transition ${
              activeTab === 'grades'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            📝 رصد وإدارة الدرجات
          </button>
          <button
            onClick={() => setActiveTab('performance')}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs transition ${
              activeTab === 'performance'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            📊 لوحة كاشف التعثر الدراسي
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs font-bold text-center">
          {errorMessage}
        </div>
      )}

      {activeTab === 'grades' ? (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-6">
            <h3 className="font-extrabold text-slate-800 text-base border-b border-slate-100 pb-3">
              رصد وتسجيل درجات الاختبارات
            </h3>
            {successMessage && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl text-xs font-bold text-center">
                {successMessage}
              </div>
            )}
            {lastGrade && (
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-emerald-50/60 border border-emerald-200 rounded-2xl">
                <span className="text-xs font-bold text-slate-700">
                  إشعار ولي الأمر بنتيجة &quot;{lastGrade.examName}&quot;؟
                </span>
                <div className="flex items-center gap-2">
                  <WhatsAppButton
                    phone={
                      studentsById.get(lastGrade.studentId)?.parent_whatsapp ||
                      studentsById.get(lastGrade.studentId)?.parent_phone
                    }
                    message={gradeMessage(
                      studentsById.get(lastGrade.studentId)?.name || 'الطالب',
                      lastGrade.examName,
                      lastGrade.score,
                      lastGrade.maxScore
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setLastGrade(null)}
                    className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-200"
                  >
                    لاحقاً
                  </button>
                </div>
              </div>
            )}
            <form onSubmit={handleSaveGrade} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">اختر الطالب *</label>
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                >
                  <option value="">-- اختر طالباً --</option>
                  {students.map((stu) => (
                    <option key={stu.id} value={stu.id}>
                      {stu.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">اسم الاختبار / التقييم *</label>
                <input
                  type="text"
                  placeholder="مثال: اختبار الشهر الأول"
                  value={examName}
                  onChange={(e) => setExamName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">درجة الطالب *</label>
                <input
                  type="number"
                  placeholder="0"
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">الدرجة النهائية</label>
                <input
                  type="number"
                  value={maxScore}
                  onChange={(e) => setMaxScore(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="md:col-span-4 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-3 rounded-2xl text-xs transition shadow-md w-full md:w-auto"
                >
                  {saving ? 'جاري الحفظ...' : 'حفظ وتسجيل الدرجة'}
                </button>
              </div>
            </form>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
            <h3 className="font-extrabold text-slate-800 text-base border-b border-slate-100 pb-3">
              سجل درجات الاختبارات والتقييمات
            </h3>
            {loadingGrades ? (
              <div className="text-center py-8 text-slate-400 text-xs">جاري تحميل السجلات...</div>
            ) : gradesList.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-500 text-xs font-bold">
                      <th className="py-3 px-4">اسم الطالب</th>
                      <th className="py-3 px-4">المجموعة</th>
                      <th className="py-3 px-4">اسم الاختبار</th>
                      <th className="py-3 px-4">الدرجة الحاصل عليها</th>
                      <th className="py-3 px-4">الدرجة النهائية</th>
                      <th className="py-3 px-4">الإشعارات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-xs">
                    {gradesList.map((g) => (
                      <tr key={g.id} className="hover:bg-slate-50/50 transition">
                        <td className="py-3.5 px-4 font-bold text-slate-800">{g.students?.name || 'غير معروف'}</td>
                        <td className="py-3.5 px-4 text-slate-500">{g.students?.group_name || 'بدون مجموعة'}</td>
                        <td className="py-3.5 px-4 text-slate-700">{g.exam_name}</td>
                        <td className="py-3.5 px-4 font-black text-indigo-600">{g.score}</td>
                        <td className="py-3.5 px-4 text-slate-600">{g.max_score}</td>
                        <td className="py-3.5 px-4">
                          <WhatsAppButton
                            phone={
                              studentsById.get(g.student_id as number)?.parent_whatsapp ||
                              studentsById.get(g.student_id as number)?.parent_phone
                            }
                            message={gradeMessage(
                              g.students?.name || 'الطالب',
                              g.exam_name,
                              g.score,
                              g.max_score
                            )}
                            label="💬 نتيجة"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400 text-xs">
                لا توجد درجات اختبارات مسجلة حتى الآن.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-base font-black text-slate-800">لوحة تحكم الأداء التنبئي (كاشف التعثر الدراسي)</h2>
            <p className="text-xs text-slate-500 mt-1">
              تحليل تلقائي لمتوسطات درجات الطلاب وتحديد الحالات التي تحتاج إلى متابعة فورية
            </p>
          </div>
          {loadingPerformance ? (
            <div className="text-center py-12 text-slate-400 text-xs">جاري تحليل بيانات الطلاب...</div>
          ) : performanceData.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {performanceData.map((item, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-2xl border ${
                    item.is_at_risk ? 'bg-rose-50/60 border-rose-200' : 'bg-emerald-50/60 border-emerald-200'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm">{item.student_name}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">{item.group_name}</p>
                    </div>
                    <span className={`text-base font-black ${item.is_at_risk ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {item.average_score}%
                    </span>
                  </div>
                  {item.is_at_risk && (
                    <div className="mt-3 text-[11px] text-rose-700 font-bold bg-rose-100/80 py-1.5 px-2.5 rounded-xl">
                      ⚠️ تنبيه: مستوى الطالب يتطلب تدخلاً ودعماً إضافياً
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-slate-400 text-xs">
              لا توجد بيانات كافية لتحليل الأداء حالياً.
            </div>
          )}
        </div>
      )}
    </div>
  );
}