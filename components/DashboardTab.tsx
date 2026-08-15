'use client';

interface DashboardTabProps {
  studentsCount: number;
  attendanceTodayCount: number;
  paidPaymentsCount: number;
  totalPaymentsCount: number;
  recentGrades: any[];
}

export default function DashboardTab({
  studentsCount,
  attendanceTodayCount,
  paidPaymentsCount,
  totalPaymentsCount,
  recentGrades
}: DashboardTabProps) {
  // حساب النسبة المئوية للحضور
  const attendancePercentage = studentsCount > 0 
    ? Math.round((attendanceTodayCount / studentsCount) * 100) 
    : 0;

  // حساب النسبة المئوية لتحصيل المصاريف
  const paymentPercentage = totalPaymentsCount > 0 
    ? Math.round((paidPaymentsCount / totalPaymentsCount) * 100) 
    : 0;

  // حساب متوسط آخر الدرجات
  const averageScore = recentGrades.length > 0
    ? (recentGrades.reduce((acc, curr) => acc + (curr.score / curr.max_score), 0) / recentGrades.length * 100).toFixed(1)
    : '0';

  return (
    <div className="space-y-8">
      {/* 📊 بطاقات الإحصائيات السريعة */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* إجمالي الطلاب */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex items-center justify-between">
          <div>
            <p className="text-slate-400 text-xs font-semibold mb-1">إجمالي الطلاب</p>
            <h3 className="text-3xl font-extrabold text-white">{studentsCount}</h3>
            <p className="text-xs text-indigo-400 mt-2">طالب مسجل بالمنظومة</p>
          </div>
          <div className="w-12 h-12 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-xl flex items-center justify-center text-2xl font-bold">
            👨‍🎓
          </div>
        </div>

        {/* حضور اليوم */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex items-center justify-between">
          <div>
            <p className="text-slate-400 text-xs font-semibold mb-1">حضور اليوم</p>
            <h3 className="text-3xl font-extrabold text-emerald-400">{attendanceTodayCount} <span className="text-sm font-normal text-slate-500">/ {studentsCount}</span></h3>
            <p className="text-xs text-emerald-400 mt-2">نسبة الحضور: {attendancePercentage}%</p>
          </div>
          <div className="w-12 h-12 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded-xl flex items-center justify-center text-2xl font-bold">
            📅
          </div>
        </div>

        {/* الاشتراكات المحصلة */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex items-center justify-between">
          <div>
            <p className="text-slate-400 text-xs font-semibold mb-1">الاشتراكات المكتملة</p>
            <h3 className="text-3xl font-extrabold text-amber-400">{paidPaymentsCount} <span className="text-sm font-normal text-slate-500">/ {totalPaymentsCount || studentsCount}</span></h3>
            <p className="text-xs text-amber-400 mt-2">نسبة التحصيل: {paymentPercentage}%</p>
          </div>
          <div className="w-12 h-12 bg-amber-600/20 text-amber-400 border border-amber-500/30 rounded-xl flex items-center justify-center text-2xl font-bold">
            💵
          </div>
        </div>

        {/* متوسط الدرجات */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex items-center justify-between">
          <div>
            <p className="text-slate-400 text-xs font-semibold mb-1">متوسط أداء الاختبارات</p>
            <h3 className="text-3xl font-extrabold text-purple-400">{averageScore}%</h3>
            <p className="text-xs text-purple-400 mt-2">بناءً على آخر الاختبارات</p>
          </div>
          <div className="w-12 h-12 bg-purple-600/20 text-purple-400 border border-purple-500/30 rounded-xl flex items-center justify-center text-2xl font-bold">
            📈
          </div>
        </div>

      </div>

      {/* 🎯 نظرة عامة سريعة على آخر الاختبارات */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
        <h3 className="text-xl font-bold text-white mb-4">أحدث درجات تم رصدها 📝</h3>
        {recentGrades.length === 0 ? (
          <p className="text-slate-500 text-sm">لا توجد اختبارات مسجلة مؤخراً.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {recentGrades.slice(0, 6).map((item) => (
              <div key={item.id} className="p-3 bg-slate-800/50 border border-slate-800 rounded-xl flex justify-between items-center">
                <div>
                  <p className="text-sm font-bold text-white">{item.students?.name}</p>
                  <p className="text-xs text-slate-400">{item.exam_name}</p>
                </div>
                <span className="text-sm font-extrabold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                  {item.score} / {item.max_score}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}