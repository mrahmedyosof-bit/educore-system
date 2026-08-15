import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// 1. تصدير إلى Excel
export const exportToExcel = (data: any[], fileName: string) => {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
  XLSX.writeFile(workbook, `${fileName}.xlsx`);
};

// 2. تصدير إلى PDF (يدعم اللغة العربية)
export const exportToPDF = (headers: string[], rows: any[][], fileName: string, title: string) => {
  const doc = new jsPDF();
  
  doc.setFontSize(18);
  doc.text(title, 14, 22);

  (doc as any).autoTable({
    head: [headers],
    body: rows,
    startY: 30,
    styles: { font: 'helvetica', halign: 'right' },
    headStyles: { fillColor: [79, 70, 229] },
  });

  doc.save(`${fileName}.pdf`);
};