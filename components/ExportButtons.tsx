'use client';

import React from 'react';
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

  const handleExportPDF = () => {
    const headers = ['الصف', 'ولي الأمر', 'الهاتف', 'الاسم', 'الكود'];
    const rows = students.map((s) => [
      s.grade || '-',
      s.parent_phone || '-',
      s.phone || '-',
      s.name,
      s.student_code || s.id,
    ]);
    exportToPDF(headers, rows, 'قائمة_الطلاب', 'تقرير الطلاب المسجلين');
  };

  return (
    <div className="flex gap-2 mb-4">
      <button
        onClick={handleExportExcel}
        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors"
      >
        📊 تصدير Excel
      </button>
      <button
        onClick={handleExportPDF}
        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors"
      >
        📄 تصدير PDF
      </button>
    </div>
  );
}