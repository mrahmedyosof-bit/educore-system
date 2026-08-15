'use client';

import { useState } from 'react';

interface StudentsTabProps {
  students: any[];
  onAddStudent: (student: { name: string; phone: string; parent_phone: string; grade: string }) => Promise<void>;
  onSelectCard: (student: any) => void;
  onSelectReport: (student: any) => void;
}

export default function StudentsTab({ students, onAddStudent, onSelectCard, onSelectReport }: StudentsTabProps) {
  const [newStudent, setNewStudent] = useState({ name: '', phone: '', parent_phone: '', grade: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudent.name || !newStudent.parent_phone) return alert('الرجاء إدخال اسم الطالب ورقم ولي الأمر');
    await onAddStudent(newStudent);
    setNewStudent({ name: '', phone: '', parent_phone: '', grade: '' });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* نموذج الإضافة */}
      <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 h-fit">
        <h2 className="text-xl font-bold mb-4 text-white">إضافة طالب جديد ➕</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="text" placeholder="اسم الطالب *" value={newStudent.name} onChange={e => setNewStudent({ ...newStudent, name: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white focus:outline-none" />
          <input type="text" placeholder="رقم ولي الأمر *" value={newStudent.parent_phone} onChange={e => setNewStudent({ ...newStudent, parent_phone: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white focus:outline-none" />
          <input type="text" placeholder="رقم الطالب" value={newStudent.phone} onChange={e => setNewStudent({ ...newStudent, phone: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white focus:outline-none" />
          <input type="text" placeholder="الصف الدراسي" value={newStudent.grade} onChange={e => setNewStudent({ ...newStudent, grade: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white focus:outline-none" />
          <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition">حفظ الطالب</button>
        </form>
      </div>

      {/* جدول الطلاب */}
      <div className="lg:col-span-2 bg-slate-900 p-6 rounded-2xl border border-slate-800">
        <h2 className="text-xl font-bold mb-4 text-white">الطلاب المسجلون ({students.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-sm">
                <th className="pb-3">الاسم</th>
                <th className="pb-3">الصف</th>
                <th className="pb-3">ولي الأمر</th>
                <th className="pb-3 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {students.map((student) => (
                <tr key={student.id} className="hover:bg-slate-800/30 transition">
                  <td className="py-3 font-semibold text-white">{student.name}</td>
                  <td className="py-3 text-slate-400">{student.grade || '-'}</td>
                  <td className="py-3 text-slate-400">{student.parent_phone}</td>
                  <td className="py-3 text-center flex justify-center gap-2">
                    <button onClick={() => onSelectCard(student)} className="bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 px-3 py-1.5 rounded-lg text-xs font-bold border border-indigo-500/30">
                      🪪 كارت
                    </button>
                    <button onClick={() => onSelectReport(student)} className="bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 px-3 py-1.5 rounded-lg text-xs font-bold border border-emerald-500/30">
                      📄 تقرير
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}