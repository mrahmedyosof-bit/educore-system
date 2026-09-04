'use client';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAppData } from './AppContext';
import { useCurriculumSettings } from '@/hooks/useCurriculumSettings';
import { useCenterSettings } from '@/hooks/useCenterSettings';
import { getFriendlyErrorMessage } from '@/lib/errors';

// ═══════════════════════════════════════════════════════════
// الأنواع والواجهات (Types & Interfaces)
// ═══════════════════════════════════════════════════════════
interface Exam {
  id: number;
  name: string;
  subject: string;
  grade: string;
  group?: string;
  exam_date: string;
  total_marks: number;
  passing_marks: number;
  description?: string;
}

interface ExamResult {
  exam_id: number;
  student_id: number;
  student_name: string;
  marks_obtained: number;
  grade_level: string;
  status: 'passed' | 'failed';
  graded_at: string;
}

interface StrugglingStudent {
  student_id: number;
  student_name: string;
  failed_exams_count: number;
  average_score: number;
  subjects_failed: string[];
  danger_level: 'high' | 'medium' | 'low';
}

type TabType = 'grading' | 'struggling';

// ═══════════════════════════════════════════════════════════
// ثوابت التخزين المحلي (Storage Keys)
// ═══════════════════════════════════════════════════════════
const STORAGE_KEYS = {
  exams: 'educore-exams-v2',
  results: 'educore-exam-results-v2',
};

export default function ExamsTab() {
  // ═══════════════════════════════════════════════════════════
  // Contexts (مصادر البيانات)
  // ═══════════════════════════════════════════════════════════
  const { students } = useAppData();
  const { subjects, grades } = useCurriculumSettings();

  // ═══════════════════════════════════════════════════════════
  // States الرئيسية
  // ═══════════════════════════════════════════════════════════
  const [exams, setExams] = useState<Exam[]>([]);
  const [examResults, setExamResults] = useState<ExamResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('grading');

  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modal: إضافة/تعديل اختبار
  const [showExamModal, setShowExamModal] = useState(false);
  const [editingExam, setEditingExam] = useState<Exam | null>(null);
  const [examForm, setExamForm] = useState<Omit<Exam, 'id'>>({
    name: '',
    subject: '',
    grade: '',
    group: '',
    exam_date: new Date().toISOString().split('T')[0],
    total_marks: 100,
    passing_marks: 50,
    description: '',
  });

  // Bulk Entry (الرصد الجماعي)
  const [selectedExamForGrading, setSelectedExamForGrading] = useState<number | null>(null);
  const [bulkGrades, setBulkGrades] = useState<Record<number, string>>({});

  // Filters (شريط الفلترة والبحث)
  const [searchQuery, setSearchQuery] = useState('');
  const [filterGrade, setFilterGrade] = useState('الكل');
  const [filterSubject, setFilterSubject] = useState('الكل');

  // Struggling Card
  const [showStrugglingCard, setShowStrugglingCard] = useState(true);

  // Confirmation Delete
  const [examToDelete, setExamToDelete] = useState<Exam | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ═══════════════════════════════════════════════════════════
  // تحميل البيانات عند بدء التشغيل
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    try {
      const storedExams = localStorage.getItem(STORAGE_KEYS.exams);
      if (storedExams) setExams(JSON.parse(storedExams));

      const storedResults = localStorage.getItem(STORAGE_KEYS.results);
      if (storedResults) setExamResults(JSON.parse(storedResults));
    } catch (error) {
      console.error('فشل تحميل البيانات:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // ═══════════════════════════════════════════════════════════
  // دوال مساعدة (Helpers)
  // ═══════════════════════════════════════════════════════════
  const showToast = useCallback((type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const saveExams = useCallback((updated: Exam[]) => {
    try {
      localStorage.setItem(STORAGE_KEYS.exams, JSON.stringify(updated));
      setExams(updated);
    } catch (error) {
      showToast('error', 'فشل حفظ الاختبارات');
    }
  }, [showToast]);

  const saveResults = useCallback((updated: ExamResult[]) => {
    try {
      localStorage.setItem(STORAGE_KEYS.results, JSON.stringify(updated));
      setExamResults(updated);
    } catch (error) {
      showToast('error', 'فشل حفظ الدرجات');
    }
  }, [showToast]);

  // ═══════════════════════════════════════════════════════════
  // Memos (البيانات المشتقة)
  // ═══════════════════════════════════════════════════════════
  const gradeOptions = useMemo(
    () => Array.from(new Set(exams.map(e => e.grade))).sort((a, b) => a.localeCompare(b, 'ar')),
    [exams]
  );

  const subjectOptions = useMemo(
    () => Array.from(new Set(exams.map(e => e.subject))).sort((a, b) => a.localeCompare(b, 'ar')),
    [exams]
  );

  // الاختبارات بعد الفلترة
  const filteredExams = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return exams.filter(exam => {
      const matchesSearch = q === '' ||
        exam.name.toLowerCase().includes(q) ||
        exam.subject.toLowerCase().includes(q);
      const matchesGrade = filterGrade === 'الكل' || exam.grade === filterGrade;
      const matchesSubject = filterSubject === 'الكل' || exam.subject === filterSubject;
      return matchesSearch && matchesGrade && matchesSubject;
    });
  }, [exams, searchQuery, filterGrade, filterSubject]);

  // الطلاب المتعثرون (Struggling Students)
  const strugglingStudents = useMemo<StrugglingStudent[]>(() => {
    const studentPerf = new Map<number, {
      name: string;
      failedCount: number;
      totalScore: number;
      totalMax: number;
      subjects: Set<string>;
    }>();

    examResults.forEach(r => {
      if (r.status === 'failed') {
        const exam = exams.find(e => e.id === r.exam_id);
        const max = exam?.total_marks ?? 100;
        const existing = studentPerf.get(r.student_id) ?? {
          name: r.student_name,
          failedCount: 0,
          totalScore: 0,
          totalMax: 0,
          subjects: new Set<string>(),
        };
        existing.failedCount += 1;
        existing.totalScore += r.marks_obtained;
        existing.totalMax += max;
        if (exam) existing.subjects.add(exam.subject);
        studentPerf.set(r.student_id, existing);
      }
    });

    return Array.from(studentPerf.entries())
      .map(([id, d]) => {
        const failedCount = d.failedCount;
        return {
          student_id: id,
          student_name: d.name,
          failed_exams_count: failedCount,
          average_score: d.totalMax > 0 ? (d.totalScore / d.totalMax) * 100 : 0,
          subjects_failed: Array.from(d.subjects),
          danger_level: failedCount >= 4 ? 'high' : failedCount >= 3 ? 'medium' : 'low',
        } as StrugglingStudent;
      })
      .filter(s => s.failed_exams_count >= 2)
      .sort((a, b) => b.failed_exams_count - a.failed_exams_count);
  }, [examResults, exams]);

  // الطلاب المستهدفون للرصد الجماعي
  const studentsForSelectedExam = useMemo(() => {
    if (!selectedExamForGrading) return [];
    const exam = exams.find(e => e.id === selectedExamForGrading);
    if (!exam) return [];
    return students
      .filter(s => s.grade === exam.grade)
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }, [selectedExamForGrading, exams, students]);

  // الدرجات الموجودة مسبقاً للاختبار المحدد
  const existingResultsForExam = useMemo(() => {
    if (!selectedExamForGrading) return new Map<number, ExamResult>();
    const map = new Map<number, ExamResult>();
    examResults
      .filter(r => r.exam_id === selectedExamForGrading)
      .forEach(r => map.set(r.student_id, r));
    return map;
  }, [selectedExamForGrading, examResults]);

  // إحصائيات الاختبار المحدد
  const selectedExamStats = useMemo(() => {
    if (!selectedExamForGrading) return null;
    const exam = exams.find(e => e.id === selectedExamForGrading);
    if (!exam) return null;
    const results = examResults.filter(r => r.exam_id === selectedExamForGrading);
    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const total = results.length;
    const rate = total > 0 ? (passed / total) * 100 : 0;
    const avg = total > 0
      ? results.reduce((sum, r) => sum + r.marks_obtained, 0) / total
      : 0;
    return { exam, passed, failed, total, rate, avg };
  }, [selectedExamForGrading, exams, examResults]);

  // ═══════════════════════════════════════════════════════════
  // Handlers
  // ═══════════════════════════════════════════════════════════
  const handleFormInput = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setExamForm(prev => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value,
    }));
  };

  const openNewExamModal = () => {
    setEditingExam(null);
    setExamForm({
      name: '',
      subject: subjects[0] ?? '',
      grade: grades[0] ?? '',
      group: '',
      exam_date: new Date().toISOString().split('T')[0],
      total_marks: 100,
      passing_marks: 50,
      description: '',
    });
    setShowExamModal(true);
  };

  const openEditExamModal = (exam: Exam) => {
    setEditingExam(exam);
    setExamForm({
      name: exam.name,
      subject: exam.subject,
      grade: exam.grade,
      group: exam.group ?? '',
      exam_date: exam.exam_date,
      total_marks: exam.total_marks,
      passing_marks: exam.passing_marks,
      description: exam.description ?? '',
    });
    setShowExamModal(true);
  };

  const handleSubmitExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!examForm.name.trim() || !examForm.subject || !examForm.grade) {
      showToast('error', 'يرجى ملء جميع الحقول المطلوبة');
      return;
    }
    if (examForm.passing_marks > examForm.total_marks) {
      showToast('error', 'درجة النجاح لا يمكن أن تتجاوز الدرجة الكلية');
      return;
    }

    setSaving(true);
    try {
      let updated: Exam[];
      if (editingExam) {
        updated = exams.map(ex =>
          ex.id === editingExam.id ? { ...examForm, id: editingExam.id } : ex
        );
      } else {
        updated = [...exams, { ...examForm, id: Date.now() }];
      }
      saveExams(updated);
      showToast('success', editingExam ? 'تم تحديث الاختبار ✓' : 'تم إضافة الاختبار ✓');
      setShowExamModal(false);
    } catch (err) {
      showToast('error', getFriendlyErrorMessage(err, 'فشل الحفظ'));
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!examToDelete) return;
    setDeleteLoading(true);
    try {
      const newExams = exams.filter(e => e.id !== examToDelete.id);
      const newResults = examResults.filter(r => r.exam_id !== examToDelete.id);
      saveExams(newExams);
      saveResults(newResults);
      showToast('success', `تم حذف "${examToDelete.name}" وجميع درجاته`);
      setExamToDelete(null);
      if (selectedExamForGrading === examToDelete.id) {
        setSelectedExamForGrading(null);
        setBulkGrades({});
      }
    } catch (err) {
      showToast('error', getFriendlyErrorMessage(err, 'فشل الحذف'));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleSelectExamForGrading = (examId: number) => {
    setSelectedExamForGrading(examId);
    // تحميل الدرجات الموجودة في حقول الإدخال
    const existing: Record<number, string> = {};
    examResults
      .filter(r => r.exam_id === examId)
      .forEach(r => { existing[r.student_id] = String(r.marks_obtained); });
    setBulkGrades(existing);
  };

  const handleBulkGradeChange = (studentId: number, value: string) => {
    setBulkGrades(prev => ({ ...prev, [studentId]: value }));
  };

  const handleSaveBulkGrades = async () => {
    if (!selectedExamForGrading) return;
    const exam = exams.find(e => e.id === selectedExamForGrading);
    if (!exam) return;

    setSaving(true);
    try {
      // الدرجات الخاصة باختبارات أخرى (نحتفظ بها)
      const otherResults = examResults.filter(r => r.exam_id !== selectedExamForGrading);
      const newResults: ExamResult[] = [];

      studentsForSelectedExam.forEach(student => {
        const rawValue = bulkGrades[student.id];
        if (rawValue !== undefined && rawValue !== '' && !isNaN(Number(rawValue))) {
          const score = Number(rawValue);
          newResults.push({
            exam_id: exam.id,
            student_id: student.id,
            student_name: student.name,
            marks_obtained: score,
            grade_level: exam.grade,
            status: score >= exam.passing_marks ? 'passed' : 'failed',
            graded_at: new Date().toISOString(),
          });
        }
      });

      saveResults([...otherResults, ...newResults]);
      const gradedCount = newResults.length;
      const passedCount = newResults.filter(r => r.status === 'passed').length;
      showToast('success',
        `تم حفظ درجات ${gradedCount} طالب ✓ (${passedCount} ناجح، ${gradedCount - passedCount} راسب)`
      );
    } catch (err) {
      showToast('error', getFriendlyErrorMessage(err, 'فشل حفظ الدرجات'));
    } finally {
      setSaving(false);
    }
  };

  // ═══════════════════════════════════════════════════════════
  // Styles (الثوابت البصرية)
  // ═══════════════════════════════════════════════════════════
  const cardClass = 'bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm';

  // ═══════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════
  return (
    <div className="space-y-5" dir="rtl">
      {/* ═══ Toast Notification ═══ */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-5 inset-x-0 z-[100] flex justify-center px-4 pointer-events-none"
        >
          <div
            className={`pointer-events-auto flex items-center gap-2 rounded-2xl border px-5 py-3 text-sm font-bold shadow-lg transition-all ${
              toast.type === 'success'
                ? 'bg-emerald-600 border-emerald-700 text-white'
                : 'bg-rose-600 border-rose-700 text-white'
            }`}
          >
            <span>{toast.type === 'success' ? '✅' : '⚠️'}</span>
            <span>{toast.text}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="ms-2 text-white/80 hover:text-white"
              aria-label="إغلاق"
            >✕</button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          Header مبسط (بدون تكرار السنة/اسم المركز)
      ═══════════════════════════════════════════════════════ */}
      <div className={`${cardClass} p-5`}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="shrink-0 flex items-center justify-center h-12 w-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white text-2xl shadow-lg shadow-violet-500/30">
              📊
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-black text-slate-900 dark:text-white truncate">
                سجل الدرجات والأداء الأكاديمي
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                رصد الدرجات، متابعة الأداء، وكشف الطلاب المتعثرين
              </p>
            </div>
          </div>

          <button
            onClick={openNewExamModal}
            className="shrink-0 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition shadow-md shadow-violet-600/20 flex items-center justify-center gap-2 active:scale-95"
          >
            <span>➕</span>
            <span>اختبار جديد</span>
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
          Tabs (التبويبات)
      ═══════════════════════════════════════════════════════ */}
      <div className={cardClass}>
        <div className="flex border-b border-slate-200 dark:border-slate-800">
          <button
            onClick={() => setActiveTab('grading')}
            className={`flex-1 sm:flex-none px-5 py-3.5 text-sm font-bold transition relative ${
              activeTab === 'grading'
                ? 'text-violet-600 dark:text-violet-400'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <span className="flex items-center justify-center gap-2">
              <span>✏️</span>
              <span>رصد وإدارة الدرجات</span>
            </span>
            {activeTab === 'grading' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-violet-500 to-purple-600 rounded-full" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('struggling')}
            className={`flex-1 sm:flex-none px-5 py-3.5 text-sm font-bold transition relative ${
              activeTab === 'struggling'
                ? 'text-violet-600 dark:text-violet-400'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <span className="flex items-center justify-center gap-2">
              <span>⚠️</span>
              <span>كاشف التعثر الدراسي</span>
              {strugglingStudents.length > 0 && (
                <span className="bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-[10px] font-black px-2 py-0.5 rounded-full">
                  {strugglingStudents.length}
                </span>
              )}
            </span>
            {activeTab === 'struggling' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-violet-500 to-purple-600 rounded-full" />
            )}
          </button>
        </div>

        <div className="p-5">
          {/* ═══ تبويب: رصد الدرجات ═══ */}
          {activeTab === 'grading' && (
            <div className="space-y-5">
              {/* Filter Bar */}
              <div className="flex flex-col lg:flex-row gap-3">
                <div className="flex-1 relative">
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
                  <input
                    type="text"
                    placeholder="ابحث باسم الاختبار أو المادة..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pr-10 pl-3 py-2.5 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  />
                </div>
                <select
                  value={filterGrade}
                  onChange={e => setFilterGrade(e.target.value)}
                  className="px-3 py-2.5 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500 min-w-[140px]"
                >
                  <option value="الكل">كل الصفوف</option>
                  {gradeOptions.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                <select
                  value={filterSubject}
                  onChange={e => setFilterSubject(e.target.value)}
                  className="px-3 py-2.5 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500 min-w-[140px]"
                >
                  <option value="الكل">كل المواد</option>
                  {subjectOptions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* Loading */}
              {loading && (
                <div className="py-16 text-center">
                  <div className="text-4xl mb-3 animate-pulse">⏳</div>
                  <p className="text-sm font-bold text-slate-600 dark:text-slate-300">جاري تحميل الاختبارات...</p>
                </div>
              )}

              {/* Empty State */}
              {!loading && exams.length === 0 && (
                <div className="py-16 text-center">
                  <div className="flex justify-center mb-4">
                    <div className="bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-950/50 dark:to-purple-950/50 p-6 rounded-full">
                      <span className="text-5xl">📝</span>
                    </div>
                  </div>
                  <h3 className="text-lg font-black text-slate-800 dark:text-white mb-2">
                    لا توجد اختبارات مسجلة بعد
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-5 max-w-md mx-auto">
                    ابدأ بإنشاء أول اختبار لتسجيل درجات الطلاب وتتبع أدائهم الأكاديمي
                  </p>
                  <button
                    onClick={openNewExamModal}
                    className="inline-flex items-center gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-black px-6 py-3 rounded-xl text-sm transition shadow-lg shadow-violet-600/30 active:scale-95"
                  >
                    <span className="text-lg">➕</span>
                    <span>إنشاء أول اختبار</span>
                  </button>
                </div>
              )}

              {/* No Results */}
              {!loading && exams.length > 0 && filteredExams.length === 0 && (
                <div className="py-12 text-center">
                  <div className="text-5xl mb-3">🔍</div>
                  <p className="text-base font-bold text-slate-700 dark:text-slate-200">
                    لا توجد اختبارات مطابقة
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    جرب تغيير معايير البحث أو الفلاتر
                  </p>
                </div>
              )}

              {/* قائمة الاختبارات (Grid) */}
              {!loading && filteredExams.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredExams.map(exam => {
                    const examResultsList = examResults.filter(r => r.exam_id === exam.id);
                    const passed = examResultsList.filter(r => r.status === 'passed').length;
                    const failed = examResultsList.filter(r => r.status === 'failed').length;
                    const total = examResultsList.length;
                    const rate = total > 0 ? (passed / total) * 100 : 0;
                    const isActive = selectedExamForGrading === exam.id;

                    return (
                      <div
                        key={exam.id}
                        className={`rounded-2xl border p-4 transition hover:shadow-md ${
                          isActive
                            ? 'border-violet-500 dark:border-violet-400 bg-violet-50/50 dark:bg-violet-950/20 shadow-md ring-2 ring-violet-200 dark:ring-violet-900/50'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="min-w-0 flex-1">
                            <h3 className="text-sm font-black text-slate-900 dark:text-white truncate">
                              {exam.name}
                            </h3>
                            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                              <span className="bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 text-[10px] font-bold px-2 py-0.5 rounded">
                                {exam.subject}
                              </span>
                              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                {exam.grade}
                              </span>
                              {exam.group && (
                                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                  • {exam.group}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button
                              onClick={() => openEditExamModal(exam)}
                              className="p-1.5 text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30 rounded-lg transition"
                              title="تعديل"
                            >✏️</button>
                            <button
                              onClick={() => setExamToDelete(exam)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition"
                              title="حذف"
                            >🗑️</button>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-center text-[10px] mb-3 p-2 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                          <div>
                            <div className="text-slate-500 dark:text-slate-400">التاريخ</div>
                            <div className="font-bold text-slate-800 dark:text-slate-200 font-mono" dir="ltr">
                              {new Date(exam.exam_date).toLocaleDateString('ar-EG', { day: '2-digit', month: '2-digit' })}
                            </div>
                          </div>
                          <div>
                            <div className="text-slate-500 dark:text-slate-400">الكلية</div>
                            <div className="font-bold text-slate-800 dark:text-slate-200">{exam.total_marks}</div>
                          </div>
                          <div>
                            <div className="text-slate-500 dark:text-slate-400">النجاح</div>
                            <div className="font-bold text-emerald-600 dark:text-emerald-400">{exam.passing_marks}</div>
                          </div>
                        </div>

                        {total > 0 ? (
                          <div className="space-y-2 mb-3">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-600 dark:text-slate-400">نسبة النجاح</span>
                              <span className={`font-black ${
                                rate >= 70 ? 'text-emerald-600 dark:text-emerald-400'
                                : rate >= 50 ? 'text-amber-600 dark:text-amber-400'
                                : 'text-rose-600 dark:text-rose-400'
                              }`}>
                                {rate.toFixed(0)}%
                              </span>
                            </div>
                            <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  rate >= 70 ? 'bg-emerald-500'
                                  : rate >= 50 ? 'bg-amber-500'
                                  : 'bg-rose-500'
                                }`}
                                style={{ width: `${rate}%` }}
                              />
                            </div>
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                ✓ {passed} ناجح
                              </span>
                              <span className="text-rose-600 dark:text-rose-400 font-bold">
                                ✗ {failed} راسب
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="py-2 text-center text-[10px] text-slate-400 dark:text-slate-500 mb-3">
                            لم تُرصد درجات بعد
                          </div>
                        )}

                        <button
                          onClick={() => handleSelectExamForGrading(exam.id)}
                          className={`w-full py-2 rounded-xl text-xs font-bold transition ${
                            isActive
                              ? 'bg-violet-600 text-white'
                              : 'bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-950/50'
                          }`}
                        >
                          {isActive ? '✓ مُختار للرصد' : total > 0 ? '📊 عرض وتعديل الدرجات' : '➕ رصد الدرجات'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ═══ Bulk Entry Panel (الرصد الجماعي) ═══ */}
              {selectedExamForGrading && selectedExamStats && (
                <div className="mt-6 border-t border-slate-200 dark:border-slate-800 pt-6">
                  {/* Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                    <div>
                      <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                        <span className="text-violet-600 dark:text-violet-400">✏️</span>
                        رصد درجات: {selectedExamStats.exam.name}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {selectedExamStats.exam.subject} — {selectedExamStats.exam.grade}
                        {selectedExamStats.total > 0 && (
                          <>
                            {' '}| متوسط: <span className="font-bold">{selectedExamStats.avg.toFixed(1)}</span>
                            {' '}| نسبة النجاح: <span className={`font-bold ${
                              selectedExamStats.rate >= 70 ? 'text-emerald-600 dark:text-emerald-400'
                              : selectedExamStats.rate >= 50 ? 'text-amber-600 dark:text-amber-400'
                              : 'text-rose-600 dark:text-rose-400'
                            }`}>{selectedExamStats.rate.toFixed(0)}%</span>
                          </>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedExamForGrading(null);
                        setBulkGrades({});
                      }}
                      className="text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    >
                      ✕ إلغاء الاختيار
                    </button>
                  </div>

                  {/* Info bar */}
                  <div className="flex flex-wrap items-center gap-3 p-3 bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800 rounded-xl mb-4 text-xs">
                    <span className="text-violet-700 dark:text-violet-300 font-bold">
                      💡 الدرجة الكلية: {selectedExamStats.exam.total_marks} | درجة النجاح: {selectedExamStats.exam.passing_marks}
                    </span>
                    <span className="text-slate-400">|</span>
                    <span className="text-slate-600 dark:text-slate-400">
                      {studentsForSelectedExam.length} طالب في هذا الصف
                    </span>
                  </div>

                  {/* قائمة الطلاب */}
                  {studentsForSelectedExam.length === 0 ? (
                    <div className="py-10 text-center text-slate-500 dark:text-slate-400 text-sm">
                      لا يوجد طلاب مسجلين في هذا الصف ({selectedExamStats.exam.grade})
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[500px] overflow-y-auto pl-1">
                      {studentsForSelectedExam.map((student, idx) => {
                        const value = bulkGrades[student.id] ?? '';
                        const numericValue = value !== '' ? Number(value) : null;
                        const isValid = numericValue !== null && !isNaN(numericValue);
                        const isPassed = isValid && numericValue >= selectedExamStats.exam.passing_marks;
                        const isFailed = isValid && numericValue < selectedExamStats.exam.passing_marks;

                        return (
                          <div
                            key={student.id}
                            className={`flex items-center gap-3 p-3 rounded-xl border transition ${
                              isValid
                                ? isPassed
                                  ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800'
                                  : 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800'
                                : 'bg-slate-50/50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            {/* رقم الطالب */}
                            <span className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-[10px] font-black text-slate-600 dark:text-slate-300">
                              {idx + 1}
                            </span>

                            {/* اسم الطالب */}
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                                {student.name}
                              </div>
                              {student.group && (
                                <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                  {student.group}
                                </div>
                              )}
                            </div>

                            {/* حالة النجاح/الرسوب */}
                            {isValid && (
                              <span className={`shrink-0 text-[10px] font-black px-2 py-0.5 rounded ${
                                isPassed
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                  : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                              }`}>
                                {isPassed ? '✓ ناجح' : '✗ راسب'}
                              </span>
                            )}

                            {/* حقل إدخال الدرجة */}
                            <input
                              type="number"
                              min="0"
                              max={selectedExamStats.exam.total_marks}
                              step="0.5"
                              placeholder={`/${selectedExamStats.exam.total_marks}`}
                              value={value}
                              onChange={e => handleBulkGradeChange(student.id, e.target.value)}
                              className={`shrink-0 w-24 text-center text-sm font-bold rounded-lg border-2 py-1.5 transition focus:outline-none ${
                                isValid
                                  ? isPassed
                                    ? 'border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300'
                                    : 'border-rose-300 dark:border-rose-700 bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-300'
                                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:border-violet-500'
                              }`}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* زر الحفظ */}
                  {studentsForSelectedExam.length > 0 && (
                    <div className="flex flex-col sm:flex-row gap-3 mt-5 pt-4 border-t border-slate-200 dark:border-slate-800">
                      <div className="flex-1 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                        <span>📝</span>
                        <span>
                          تم إدخال {Object.values(bulkGrades).filter(v => v !== '').length} من {studentsForSelectedExam.length} درجة
                        </span>
                      </div>
                      <button
                        onClick={handleSaveBulkGrades}
                        disabled={saving || Object.values(bulkGrades).filter(v => v !== '').length === 0}
                        className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-black px-6 py-3 rounded-xl text-sm transition shadow-lg shadow-violet-600/20 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {saving ? (
                          <>
                            <span className="animate-spin">⏳</span>
                            <span>جاري الحفظ...</span>
                          </>
                        ) : (
                          <>
                            <span>💾</span>
                            <span>حفظ جميع الدرجات</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ═══ تبويب: كاشف التعثر الدراسي ═══ */}
          {activeTab === 'struggling' && (
            <div className="space-y-4">
              {strugglingStudents.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="flex justify-center mb-4">
                    <div className="bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-950/50 dark:to-teal-950/50 p-6 rounded-full">
                      <span className="text-5xl">🎉</span>
                    </div>
                  </div>
                  <h3 className="text-lg font-black text-slate-800 dark:text-white mb-2">
                    لا يوجد طلاب متعثرون
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                    جميع الطلاب يحققون أداءً جيداً في الاختبارات المسجلة
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3 p-4 bg-gradient-to-l from-amber-50 to-white dark:from-amber-950/20 dark:to-slate-900 border border-amber-200 dark:border-amber-800 rounded-xl">
                    <button
                      onClick={() => setShowStrugglingCard(!showStrugglingCard)}
                      className="flex-1 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="bg-amber-100 dark:bg-amber-900/50 p-2 rounded-lg">
                          <span className="text-xl">⚠️</span>
                        </div>
                        <div className="text-right">
                          <h3 className="text-sm font-black text-amber-800 dark:text-amber-300">
                            كشف التعثر الدراسي
                          </h3>
                          <p className="text-[10px] text-amber-600 dark:text-amber-400">
                            {strugglingStudents.length} طالب رسب في اختبارين أو أكثر
                          </p>
                        </div>
                      </div>
                      <span className={`text-slate-400 transition-transform ${showStrugglingCard ? 'rotate-180' : ''}`}>
                        ▼
                      </span>
                    </button>
                  </div>

                  {showStrugglingCard && (
                    <div className="space-y-3">
                      {strugglingStudents.map((student, idx) => {
                        const dangerStyles = {
                          high: {
                            card: 'border-rose-300 dark:border-rose-700 bg-rose-50/50 dark:bg-rose-950/20',
                            badge: 'bg-rose-600 text-white',
                            level: 'خطر عالي',
                          },
                          medium: {
                            card: 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20',
                            badge: 'bg-amber-500 text-white',
                            level: 'خطر متوسط',
                          },
                          low: {
                            card: 'border-yellow-300 dark:border-yellow-700 bg-yellow-50/50 dark:bg-yellow-950/20',
                            badge: 'bg-yellow-500 text-white',
                            level: 'خطر منخفض',
                          },
                        };
                        const style = dangerStyles[student.danger_level];

                        return (
                          <div
                            key={student.student_id}
                            className={`rounded-xl border p-4 ${style.card} transition hover:shadow-md`}
                          >
                            <div className="flex items-start justify-between gap-3 mb-3">
                              <div className="flex items-start gap-3 min-w-0 flex-1">
                                <span className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-sm font-black text-slate-700 dark:text-slate-200">
                                  {idx + 1}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h4 className="text-sm font-black text-slate-900 dark:text-white truncate">
                                      {student.student_name}
                                    </h4>
                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded ${style.badge}`}>
                                      {style.level}
                                    </span>
                                  </div>
                                  <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                                    رسب في <span className="font-bold text-rose-600 dark:text-rose-400">{student.failed_exams_count}</span> اختبار
                                    {' '}| متوسط الدرجات:{' '}
                                    <span className="font-bold">{student.average_score.toFixed(1)}%</span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {student.subjects_failed.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 ml-1">المواد:</span>
                                {student.subjects_failed.map(subject => (
                                  <span
                                    key={subject}
                                    className="text-[10px] bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 font-bold"
                                  >
                                    {subject}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
          Modal: إضافة/تعديل اختبار
      ═══════════════════════════════════════════════════════ */}
      {showExamModal && (
        <div
          className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => !saving && setShowExamModal(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 max-w-2xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                <span>{editingExam ? '✏️' : '➕'}</span>
                <span>{editingExam ? 'تعديل اختبار' : 'إضافة اختبار جديد'}</span>
              </h3>
              <button
                onClick={() => !saving && setShowExamModal(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >✕</button>
            </div>

            <form onSubmit={handleSubmitExam} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                    اسم الاختبار <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={examForm.name}
                    onChange={handleFormInput}
                    placeholder="مثال: اختبار الفصل الأول"
                    required
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                    المادة الدراسية <span className="text-rose-500">*</span>
                  </label>
                  <select
                    name="subject"
                    value={examForm.subject}
                    onChange={handleFormInput}
                    required
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="">اختر المادة</option>
                    {subjects.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                    الصف الدراسي <span className="text-rose-500">*</span>
                  </label>
                  <select
                    name="grade"
                    value={examForm.grade}
                    onChange={handleFormInput}
                    required
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="">اختر الصف</option>
                    {grades.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                    المجموعة (اختياري)
                  </label>
                  <input
                    type="text"
                    name="group"
                    value={examForm.group}
                    onChange={handleFormInput}
                    placeholder="مثال: مجموعة أ"
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                    تاريخ الاختبار
                  </label>
                  <input
                    type="date"
                    name="exam_date"
                    value={examForm.exam_date}
                    onChange={handleFormInput}
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                    الدرجة الكلية <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    name="total_marks"
                    value={examForm.total_marks}
                    onChange={handleFormInput}
                    min="1"
                    required
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                    درجة النجاح <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    name="passing_marks"
                    value={examForm.passing_marks}
                    onChange={handleFormInput}
                    min="1"
                    max={examForm.total_marks}
                    required
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                    ملاحظات (اختياري)
                  </label>
                  <textarea
                    name="description"
                    value={examForm.description}
                    onChange={handleFormInput}
                    placeholder="تفاصيل إضافية عن الاختبار..."
                    rows={2}
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => !saving && setShowExamModal(false)}
                  disabled={saving}
                  className="flex-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold py-2.5 rounded-xl text-sm transition disabled:opacity-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-bold py-2.5 rounded-xl text-sm transition shadow-md shadow-violet-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <><span className="animate-spin">⏳</span><span>جاري الحفظ...</span></>
                  ) : (
                    <>{editingExam ? '💾 حفظ التعديلات' : '➕ إضافة الاختبار'}</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          Modal: تأكيد الحذف
      ═══════════════════════════════════════════════════════ */}
      {examToDelete && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4"
          onClick={() => !deleteLoading && setExamToDelete(null)}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-rose-200 bg-white dark:bg-slate-800 p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-center mb-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-950/60 text-4xl animate-pulse">
                ⚠️
              </div>
            </div>
            <h3 className="text-center text-lg font-black text-slate-800 dark:text-slate-100 mb-2">
              تأكيد حذف الاختبار
            </h3>
            <p className="text-center text-sm text-slate-600 dark:text-slate-300 mb-4">
              هل أنت متأكد من رغبتك في حذف:
            </p>
            <div className="rounded-xl bg-rose-50 dark:bg-rose-950/30 p-3 border border-rose-100 dark:border-rose-900/40 mb-4">
              <div className="text-sm font-black text-slate-800 dark:text-slate-100 text-center mb-1">
                {examToDelete.name}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 text-center">
                {examToDelete.subject} — {examToDelete.grade}
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 mb-5">
              <span className="text-lg">⚠️</span>
              <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300">
                سيتم حذف جميع درجات الطلاب المرتبطة بهذا الاختبار نهائياً
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setExamToDelete(null)}
                disabled={deleteLoading}
                className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition"
              >
                ❌ إلغاء
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleteLoading}
                className="flex-1 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50 flex items-center justify-center gap-2 transition"
              >
                {deleteLoading ? (
                  <><span className="animate-spin">⏳</span> جاري الحذف...</>
                ) : (
                  <>🗑️ تأكيد الحذف</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}