'use client';

interface GradesTabProps {
  students: any[];
  grades: any[];
  newGrade: { student_id: string; exam_name: string; score: string; max_score: string };
  onGradeChange: (grade: any) => void;
  onAddGrade: (e: React.FormEvent) => Promise<void>;
  onSendWhatsApp: (gradeItem: any) => void;
}

export default function GradesTab({
  students,
  grades,
  newGrade,
  onGradeChange,
  onAddGrade,
  onSendWhatsApp
}: GradesTabProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 h-fit">
        <h2 className="text-xl font-bold mb-4 text-white">رصد درجة اختبار 🎯</h2>
        <form onSubmit={onAddGrade} className="space-y-4">
          <select
            value={newGrade.student_id}
            onChange={e => onGradeChange({ ...newGrade, student_id: e.target.value })}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white"
          >
            <option value="">-- اختر الطالب --</option>
            {students.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          <input
            type="text"
            placeholder="عنوان الاختبار"
            value={newGrade.exam_name}
            onChange={e => onGradeChange({ ...newGrade, exam_name: e.target.value })}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white"
          />

          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              placeholder="الدرجة"
              value={newGrade.score}
              onChange={e => onGradeChange({ ...newGrade, score: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white"
            />
            <input
              type="number"
              placeholder="من"
              value={newGrade.max_score}
              onChange={e => onGradeChange({ ...newGrade, max_score: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white"
            />
          </div>

          <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition">
            حفظ الدرجة
          </button>
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
                <button
                  onClick={() => onSendWhatsApp(item)}
                  className="bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-emerald-600/30 transition"
                >
                  📲 إرسال نتيجة
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}