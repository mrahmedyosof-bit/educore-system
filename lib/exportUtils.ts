import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas-pro';

// 1. تصدير إلى Excel
export const exportToExcel = (data: Record<string, string | number>[], fileName: string) => {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
  XLSX.writeFile(workbook, `${fileName}.xlsx`);
};

/**
 * بناء جدول HTML بتنسيق inline (مستقل عن Tailwind) لضمان
 * ثبات المظهر عند تحويله إلى صورة، مع دعم كامل للعربية RTL.
 */
const buildTableElement = (
  headers: string[],
  rows: (string | number)[][],
  title: string
): HTMLElement => {
  const container = document.createElement('div');
  container.setAttribute('dir', 'rtl');
  container.style.cssText = [
    'position:fixed',
    'top:-10000px',
    'left:-10000px',
    'z-index:-1',
    'background:#ffffff',
    'padding:24px',
    'font-family:"Segoe UI", Tahoma, Arial, sans-serif',
    'width:max-content',
  ].join(';');

  const titleEl = document.createElement('div');
  titleEl.textContent = title;
  titleEl.style.cssText =
    'font-size:20px;font-weight:800;color:#1e293b;margin-bottom:16px;text-align:right;';
  container.appendChild(titleEl);

  const table = document.createElement('table');
  table.style.cssText = 'border-collapse:collapse;min-width:600px;';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  headers.forEach((headerText) => {
    const th = document.createElement('th');
    th.textContent = headerText;
    th.style.cssText =
      'background:#4f46e5;color:#ffffff;font-size:13px;font-weight:700;' +
      'padding:10px 14px;border:1px solid #4338ca;text-align:right;';
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  rows.forEach((row, rowIndex) => {
    const tr = document.createElement('tr');
    row.forEach((cellValue) => {
      const td = document.createElement('td');
      td.textContent = String(cellValue ?? '-');
      td.style.cssText =
        'font-size:12px;color:#1e293b;padding:8px 14px;border:1px solid #e2e8f0;text-align:right;' +
        `background:${rowIndex % 2 === 0 ? '#ffffff' : '#f8fafc'};`;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  container.appendChild(table);

  return container;
};

// 2. تصدير إلى PDF بدعم كامل للغة العربية
// (الجدول يُرسم كـ DOM حقيقي ثم يُحوَّل صورة داخل الـ PDF،
//  لأن مكتبات PDF لا تدعم تشكيل الحروف العربية)
export const exportToPDF = async (
  headers: string[],
  rows: (string | number)[][],
  fileName: string,
  title: string
): Promise<void> => {
  if (!rows.length) {
    throw new Error('لا توجد بيانات لتصديرها.');
  }

  const container = buildTableElement(headers, rows, title);
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      backgroundColor: '#ffffff',
      windowWidth: container.scrollWidth,
      windowHeight: container.scrollHeight,
    });

    const imgData = canvas.toDataURL('image/png');

    // اتجاه الصفحة أفقي إذا كان الجدول عريضاً (أكثر من 4 أعمدة)
    const orientation = headers.length > 4 ? 'landscape' : 'portrait';
    const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const contentWidth = pageWidth - margin * 2;
    const contentHeight = pageHeight - margin * 2;

    const scaledWidth = contentWidth;
    const imgHeight = (canvas.height * scaledWidth) / canvas.width;

    pdf.addImage(imgData, 'PNG', margin, margin, scaledWidth, imgHeight);

    // تقسيم على صفحات متعددة إذا كان الجدول أطول من صفحة واحدة
    let remainingHeight = imgHeight - contentHeight;
    while (remainingHeight > 0) {
      const alreadyShown = imgHeight - remainingHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', margin, margin - alreadyShown, scaledWidth, imgHeight);
      remainingHeight -= contentHeight;
    }

    pdf.save(`${fileName}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
};
