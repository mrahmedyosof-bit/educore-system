'use client';

interface FinanceTabProps {
  students: any[];
  payments: any[];
  selectedMonth: string;
  defaultAmount: string;
  onMonthChange: (month: string) => void;
  onAmountChange: (amount: string) => void;
  onTogglePayment: (studentId: number, currentStatus: string | undefined, paymentId?: number) => Promise<void>;
  onSendReminder: (student: any) => void;
}

export default function FinanceTab({
  students, payments, selectedMonth, defaultAmount,
  onMonthChange, onAmountChange, onTogglePayment, onSendReminder
}: FinanceTabProps) {
  return (
    <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">متابعة الاشتراكات الشهرية 💵</h2>
          <p className="text-xs text-slate-400 mt-1">حدد الشهر والمبلغ واضغط لتحديث حالة الاشتراك</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div>
            <label className="text-xs text-slate-400 block mb-1">الشهر:</label>
            <input type="month" value={selectedMonth} onChange={e => onMonthChange(e.target.value)} className="bg-slate-800 border border-slate-700 text-white px-3 py-1.5 rounded-xl text-sm" />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">الاشتراك (جنيه):</label>
            <input type="number" value={defaultAmount} onChange={e => onAmountChange(e.target.value)} className="bg-slate-800 border border-slate-700 text-white px-3 py-1.5 rounded-xl text-sm w-24" />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {students.map((student) => {
          const payment = payments.find(p => p.student_id === student.id);
          const isPaid = payment?.status === 'مدفوع';

          return (
            <div key={student.id} className="flex items-center justify-between p-4 bg-slate-800/40 rounded-xl border border-slate-800">
              <div>
                <p className="font-bold text-white">{student.name}</p>
                <p className="text-xs text-slate-400">{student.grade || 'غير محدد'}</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => onTogglePayment(student.id, payment?.status, payment?.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition ${isPaid ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-600/20 text-rose-400 border border-rose-500/30'}`}
                >
                  {isPaid ? '✅ مدفوع' : '❌ غير مدفوع'}
                </button>
                
                {!isPaid && (
                  <button
                    onClick={() => onSendReminder(student)}
                    className="bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 border border-amber-500/30 px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1"
                  >
                    🔔 تذكير بالواتساب
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}