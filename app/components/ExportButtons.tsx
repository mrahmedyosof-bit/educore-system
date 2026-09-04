'use client';

import React, { useState } from 'react';
import { exportToExcel, exportToPDF } from '@/lib/exportUtils';

interface Student {
  id: number | string;
  name: string;
  phone?: string;
  parent_phone?: string;
  grade?: string;
  student_code?: string;
}

interface ExportButtonsProps {
  students: Student[];
}

export default function ExportButtons({ students }: ExportButtonsProps) {
  const [exporting, setExporting] = useState(false);

  const handleExportExcel = () => {
    const exportData = students.map((s) => ({
      'رقم الطالب': s.student_code || s.id,
      'الاسم': s.name,
      'الهاتف': s.phone || '-',
      'ولي الأمر': s.parent_phone || '-',
      'الصف': s.grade || '-',
    }));
    exportToExcel(exportData, 'قائمة_الطلاب');
  };

  const handleExportPDF = async () => {
    if (!students.length) {
      alert('لا توجد بيانات طلاب لتصديرها.');
      return;
    }

    setExporting(true);
    try {
      const headers = ['الكود', 'الاسم', 'الصف', 'ولي الأمر', 'هاتف الطالب'];
      const rows = students.map((s) => [
        s.student_code || String(s.id),
        s.name,
        s.grade || '-',
        s.parent_phone || '-',
        s.phone || '-',
      ]);
      await exportToPDF(headers, rows, 'قائمة_الطلاب', 'تقرير الطلاب المسجلين - EduCore CMS');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'تعذر تصدير الـ PDF.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={handleExportExcel}
        disabled={exporting}
        className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-colors disabled:opacity-50"
      >
        📊 تصدير Excel
      </button>
      <button
        type="button"
        onClick={() => void handleExportPDF()}
        disabled={exporting}
        className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-colors disabled:opacity-50"
      >
        {exporting ? '⏳ جاري التصدير...' : '📄 تصدير PDF'}
      </button>
    </div>
  );
}
