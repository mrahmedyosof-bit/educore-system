'use client';

interface AttendanceTabProps {
  students: any[];
  attendance: any[];
  selectedDate: string;
  onDateChange: (date: string) => void;
  onAttendance: (studentId: number, status: string) => Promise<void>;
}

export default function AttendanceTab({ students, attendance, selectedDate, onDateChange, onAttendance }: AttendanceTabProps) {
  return (
    <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <h2 className="text-xl font-bold text-white">سجل الحضور والغياب 📅</h2>
        <input type="date" value={selectedDate} onChange={(e) => onDateChange(e.target.value)} className="bg-slate-800 border border-slate-700 text-white px-4 py-2 rounded-xl" />
      </div>
      <div className="space-y-3">
        {students.map((student) => {
          const status = attendance.find(a => a.student_id === student.id)?.status || 'غير محدد';
          return (
            <div key={student.id} className="flex items-center justify-between p-4 bg-slate-800/40 rounded-xl border border-slate-800">
              <div>
                <p className="font-bold text-white">{student.name}</p>
                <p className="text-xs text-slate-400">{student.grade}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => onAttendance(student.id, 'حاضر')} className={`px-4 py-1.5 rounded-lg text-sm font-bold ${status === 'حاضر' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'}`}>حاضر ✅</button>
                <button onClick={() => onAttendance(student.id, 'غائب')} className={`px-4 py-1.5 rounded-lg text-sm font-bold ${status === 'غائب' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-400'}`}>غائب ❌</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}