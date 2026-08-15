'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { QRCodeSVG } from 'qrcode.react';

import DashboardTab from '@/components/DashboardTab';
import StudentsTab from '@/components/StudentsTab';
import AttendanceTab from '@/components/AttendanceTab';
import FinanceTab from '@/components/FinanceTab';
import QRScanner from '@/components/QRScanner';
import ExportButtons from '@/components/ExportButtons';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'students' | 'attendance' | 'grades' | 'finance' | 'qr'>('dashboard');

  const [students, setStudents] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [newGrade, setNewGrade] = useState({ student_id: '', exam_name: '', score: '', max_score: '100' });
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [defaultAmount, setDefaultAmount] = useState('200');
  
  const [selectedStudentForCard, setSelectedStudentForCard] = useState<any>(null);
  const [selectedStudentForReport, setSelectedStudentForReport] = useState<any>(null);

  useEffect(() => {
    fetchData();
  }, [selectedDate, selectedMonth]);

  const fetchData = async () => {
    setLoading(true);
    const { data: studentsData } = await supabase.from('students').select('*').order('created_at', { ascending: false });
    setStudents(studentsData || []);

    const { data: attendanceData } = await supabase.from('attendance').select('*').eq('date', selectedDate);
    setAttendance(attendanceData || []);

    const { data: gradesData } = await supabase.from('grades').select('*, students(name, parent_phone)').order('created_at', { ascending: false });
    setGrades(gradesData || []);

    const { data: paymentsData } = await supabase.from('payments').select('*').eq('month', selectedMonth);
    setPayments(paymentsData || []);
    setLoading(false);
  };

  const handleAddStudent = async (studentData: { name: string; phone: string; parent_phone: string; grade: string }) => {
    const { error } = await supabase.from('students').insert([studentData]);
    if (error) alert('حدث خطأ أثناء إضافة الطالب');
    else fetchData();
  };

  const handleAttendance = async (studentId: number, status: string) => {
    const existing = attendance.find(a => a.student_id === studentId);
    if (existing) {
      await supabase.from('attendance').update({ status }).eq('id', existing.id);
    } else {
      await supabase.from('attendance').insert([{ student_id: studentId, date: selectedDate, status }]);
    }
    fetchData();
  };

  const handleQRScan = async (studentIdStr: string) => {
    const student = students.find(s => s.id.toString() === studentIdStr);
    if (student) {
      await handleAttendance(student.id, 'حاضر');
      alert(`✅ تم تسجيل حضور الطالب: ${student.name}`);
    } else {
      alert("❌ الطالب غير موجود!");
    }
  };

  const handleAddGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGrade.student_id || !newGrade.exam_name || !newGrade.score) return alert('الرجاء إكمال بيانات الدرجة');

    const { error } = await supabase.from('grades').insert([{
      student_id: parseInt(newGrade.student_id),
      exam_name: newGrade.exam_name,
      score: parseFloat(newGrade.score),
      max_score: parseFloat(newGrade.max_score)
    }]);

    if (error) alert('حدث خطأ أثناء الحفظ');
    else {
      setNewGrade({ student_id: '', exam_name: '', score: '', max_score: '100' });
      fetchData();
    }
  };

  const sendGradeWhatsApp = (gradeItem: any) => {
    const studentName = gradeItem.students?.name;
    const parentPhone = gradeItem.students?.parent_phone;
    const examName = gradeItem.exam_name;
    const score = gradeItem.score;
    const maxScore = gradeItem.max_score;
    const percentage = ((score / maxScore) * 100).toFixed(1);

    const message = `السلام عليكم ورحمة الله وبركاته 🌹\nنحيطكم علماً بنتيجة الطالب/ة: *${studentName}*\nفي اختبار: *${examName}*\n\nالدرجة: *${score}* من *${maxScore}* (النسبة: ${percentage}%)\n\nمع تحيات إدارة المركز 📚`;
    window.open(`https://wa.me/${parentPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const togglePaymentStatus = async (studentId: number, currentStatus: string | undefined, paymentId?: number) => {
    const newStatus = currentStatus === 'مدفوع' ? 'غير مدفوع' : 'مدفوع';

    if (paymentId) {
      await supabase.from('payments').update({ status: newStatus, amount: parseFloat(defaultAmount) }).eq('id', paymentId);
    } else {
      await supabase.from('payments').insert([{
        student_id: studentId,
        month: selectedMonth,
        amount: parseFloat(defaultAmount),
        status: 'مدفوع'
      }]);
    }
    fetchData();
  };

  const sendPaymentReminder = (student: any) => {
    const message = `السلام عليكم ورحمة الله وبركاته 🌹\nنود تذكيركم بلطف بموعد سداد مصاريف الاشتراك الشهري لـ *${selectedMonth}* للطالب/ة: *${student.name}*.\nالمبلغ المطلوب: *${defaultAmount} جنيه*.\n\nشاكرين ومقدرين حسن تعاونكم معنا 📚`;
    window.open(`https://wa.me/${student.parent_phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const studentGrades = selectedStudentForReport ? grades.filter(g => g.student_id === selectedStudentForReport.id) : [];
  const studentPayment = selectedStudentForReport ? payments.find(p => p.student_id === selectedStudentForReport.id) : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 font-sans" dir="rtl">
      <header className="max-w-6xl mx-auto mb-8 flex flex-col md:flex-row justify-between items-center gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-indigo-400">نظام إدارة المجموعة التعليمية 🎓</h1>
          <p className="text-slate-400 text-sm mt-1">الطلاب، الحضور، الدرجات، المصاريف والكروت الذكية</p>
        </div>
      </header>

      {/* Tabs */}
      <div className="max-w-6xl mx-auto mb-8 flex flex-wrap gap-2 border-b border-slate-800 pb-4">
        {[
          { id: 'dashboard', label: '📊 لوحة التحكم' },
          { id: 'students', label: '👨‍🎓 الطلاب' },
          { id: 'attendance', label: '📅 الحضور' },
          { id: 'grades', label: '🎯 الدرجات' },
          { id: 'finance', label: '💵 المصاريف' },
          { id: 'qr', label: '📸 ماسح الـ QR' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-5 py-2.5 rounded-xl font-bold transition-all ${activeTab === tab.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' : 'bg-slate-900 text-slate-400 hover:bg-slate-800'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <main className="max-w-6xl mx-auto">
        {loading ? (
          <div className="text-center py-20 text-slate-400 animate-pulse">جاري تحميل البيانات... ⏳</div>
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <DashboardTab
                studentsCount={students.length}
                attendanceTodayCount={attendance.filter(a => a.status === 'حاضر').length}
                paidPaymentsCount={payments.filter(p => p.status === 'مدفوع').length}
                totalPaymentsCount={payments.length}
                recentGrades={grades}
              />
            )}

            {activeTab === 'students' && (
              <div>
                <ExportButtons students={students} />
                <StudentsTab
                  students={students}
                  onAddStudent={handleAddStudent}
                  onSelectCard={setSelectedStudentForCard}
                  onSelectReport={setSelectedStudentForReport}
                />
              </div>
            )}

            {activeTab === 'attendance' && (
              <AttendanceTab students={students} attendance={attendance} selectedDate={selectedDate} onDateChange={setSelectedDate} onAttendance={handleAttendance} />
            )}

            {activeTab === 'grades' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 h-fit">
                  <h2 className="text-xl font-bold mb-4 text-white">رصد درجة اختبار 🎯</h2>
                  <form onSubmit={handleAddGrade} className="space-y-4">
                    <select value={newGrade.student_id} onChange={e => setNewGrade({ ...newGrade, student_id: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white">
                      <option value="">-- اختر الطالب --</option>
                      {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <input type="text" placeholder="عنوان الاختبار" value={newGrade.exam_name} onChange={e => setNewGrade({ ...newGrade, exam_name: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white" />
                    <div className="grid grid-cols-2 gap-2">
                      <input type="number" placeholder="الدرجة" value={newGrade.score} onChange={e => setNewGrade({ ...newGrade, score: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white" />
                      <input type="number" placeholder="من" value={newGrade.max_score} onChange={e => setNewGrade({ ...newGrade, max_score: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white" />
                    </div>
                    <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition">حفظ الدرجة</button>
                  </form>
                </div>

                <div className="lg:col-span-2 bg-slate-900 p-6 rounded-2xl border border-slate-800">
                  <h2 className="text-xl font-bold mb-4 text-white">سجل الدرجات</h2>
                  <div className="space-y-3">
                    {grades.map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-4 bg-slate-800/40 rounded-xl border border-slate-800">
                        <div>
                          <p className="font-bold text-white">{item.students?.name}</p>
                          <p className="text-xs text-indigo-400 font-medium">{item.exam_name}</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-lg font-extrabold text-emerald-400">{item.score} / {item.max_score}</span>
                          <button onClick={() => sendGradeWhatsApp(item)} className="bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-lg text-xs font-bold">📲 إرسال نتيجة</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'finance' && (
              <FinanceTab
                students={students}
                payments={payments}
                selectedMonth={selectedMonth}
                defaultAmount={defaultAmount}
                onMonthChange={setSelectedMonth}
                onAmountChange={setDefaultAmount}
                onTogglePayment={togglePaymentStatus}
                onSendReminder={sendPaymentReminder}
              />
            )}

            {activeTab === 'qr' && (
              <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 text-center">
                <h2 className="text-2xl font-bold mb-6 text-white">تسجيل الحضور عبر الكاميرا 📸</h2>
                <QRScanner onScanSuccess={handleQRScan} />
              </div>
            )}
          </>
        )}
      </main>

      {/* Modal الكارت للطباعة */}
      {selectedStudentForCard && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl max-w-sm w-full text-center space-y-4">
            <h3 className="text-xl font-bold text-white">كارت الطالب</h3>
            <div id="printable-card" className="bg-white text-slate-900 p-6 rounded-xl shadow-2xl border-4 border-indigo-600 flex flex-col items-center gap-3">
              <h4 className="font-extrabold text-xl text-indigo-950">{selectedStudentForCard.name}</h4>
              <p className="text-xs text-slate-600 font-bold bg-indigo-50 px-3 py-1 rounded-full">الصف: {selectedStudentForCard.grade || 'غير محدد'}</p>
              <div className="p-3 bg-white rounded-xl border-2 border-slate-200 my-2">
                <QRCodeSVG value={selectedStudentForCard.id.toString()} size={160} />
              </div>
              <p className="text-[11px] text-slate-400 font-mono">ID: #{selectedStudentForCard.id}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => window.print()} className="flex-1 bg-indigo-600 text-white py-2.5 rounded-xl font-bold">🖨️ طباعة</button>
              <button onClick={() => setSelectedStudentForCard(null)} className="flex-1 bg-slate-800 text-slate-300 py-2.5 rounded-xl font-bold">إغلاق</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal التقرير الشامل للطالب */}
      {selectedStudentForReport && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl max-w-lg w-full space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-xl font-bold text-white">تقرير الطالب الشامل 📄</h3>
              <button onClick={() => setSelectedStudentForReport(null)} className="text-slate-400 hover:text-white font-bold">✕</button>
            </div>

            <div id="printable-report" className="bg-white text-slate-900 p-6 rounded-xl space-y-4 border border-slate-200">
              <div className="text-center border-b pb-3">
                <h2 className="text-2xl font-extrabold text-indigo-900">{selectedStudentForReport.name}</h2>
                <p className="text-sm text-slate-600 mt-1">الصف الدراسي: {selectedStudentForReport.grade || 'غير محدد'} | ولي الأمر: {selectedStudentForReport.parent_phone}</p>
              </div>

              <div>
                <h4 className="font-bold text-indigo-950 mb-2 text-sm border-b pb-1">📊 نتائج الاختبارات:</h4>
                {studentGrades.length === 0 ? (
                  <p className="text-xs text-slate-500">لا توجد درجات مسجلة لهذا الطالب.</p>
                ) : (
                  <div className="space-y-1.5">
                    {studentGrades.map(g => (
                      <div key={g.id} className="flex justify-between text-xs bg-slate-50 p-2 rounded border border-slate-200">
                        <span className="font-semibold text-slate-800">{g.exam_name}</span>
                        <span className="font-bold text-indigo-700">{g.score} / {g.max_score}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h4 className="font-bold text-indigo-950 mb-2 text-sm border-b pb-1">💵 الاشتراك الشهري ({selectedMonth}):</h4>
                <div className="flex justify-between text-xs bg-slate-50 p-2 rounded border border-slate-200">
                  <span className="text-slate-700">الحالة:</span>
                  <span className={`font-bold ${studentPayment?.status === 'مدفوع' ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {studentPayment?.status === 'مدفوع' ? '✅ تم السداد' : '❌ لم يتم السداد'}
                  </span>
                </div>
              </div>

              <div className="text-center pt-3 border-t text-[11px] text-slate-400">
                صادر عن نظام إدارة المجموعة التعليمية 🎓
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => window.print()} className="flex-1 bg-emerald-600 text-white py-2.5 rounded-xl font-bold hover:bg-emerald-700 transition">🖨️ طباعة التقرير</button>
              <button onClick={() => setSelectedStudentForReport(null)} className="flex-1 bg-slate-800 text-slate-300 py-2.5 rounded-xl font-bold hover:bg-slate-700 transition">إغلاق</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}