'use client';
import React, { useState } from 'react';
import { useCenterSettings } from '@/hooks/useCenterSettings';

interface Student {
  id: number;
  name: string;
  phone: string;
  parent_phone: string;
  grade: string;
  subject?: string;
  barcode?: string;
}

interface StudentCardModalProps {
  student: Student | null;
  onClose: () => void;
  centerName?: string;
}

export default function StudentCardModal({ student, onClose, centerName }: StudentCardModalProps) {
  const { settings: centerSettings } = useCenterSettings();
  const [customCenterName, setCustomCenterName] = useState(centerName || centerSettings.centerName || 'مركز EduCore التعليمي');
  
  if (!student) return null;

  const studentCode = student.barcode?.trim() || String(student.id);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(studentCode)}`;

  const handlePrint = () => {
    window.print();
  };

  const handleWhatsApp = () => {
    const rawPhone = student.parent_phone || student.phone;
    if (!rawPhone) return;
    
    const cleanPhone = rawPhone.replace(/\D/g, '');
    const formattedPhone = cleanPhone.startsWith('0') 
      ? `2${cleanPhone}` 
      : cleanPhone;
    
    const message = encodeURIComponent(
      `مرحباً ولي أمر الطالب/ة: ${student.name}\n${customCenterName}`
    );
    
    window.open(`https://wa.me/${formattedPhone}?text=${message}`, '_blank');
  };

  return (
    <>
      {/* تنسيقات الطباعة الخاصة بالكارت فقط */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #student-card-print, #student-card-print * {
            visibility: visible !important;
          }
          #student-card-print {
            position: fixed !important;
            left: 50% !important;
            top: 50% !important;
            transform: translate(-50%, -50%) !important;
            width: 320px !important;
            box-shadow: none !important;
            border: 2px solid #e2e8f0 !important;
            background: white !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div
          id="student-card-print"
          className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-sm w-full p-6 text-center space-y-5 relative animate-in fade-in zoom-in-95 duration-200"
        >
          {/* زر الإغلاق العلوي */}
          <button
            onClick={onClose}
            className="no-print absolute top-4 left-4 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center font-bold transition-colors"
            title="إغلاق"
          >
            ✕
          </button>

          {/* الهيدر الديناميكي */}
          <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="text-lg font-black text-indigo-700 dark:text-indigo-400">
              {customCenterName}
            </h3>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">
              بطاقة الطالب الذكية — {centerSettings.academicYear || '2026/2027'}
            </p>
          </div>

          {/* رمز الـ QR */}
          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 flex flex-col items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrUrl}
              alt={`QR Code - ${studentCode}`}
              className="w-40 h-40 rounded-xl border border-slate-200 dark:border-slate-700 bg-white p-2 shadow-sm"
            />
            <span className="mt-3 text-xs font-mono font-bold text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 px-3 py-1 rounded-full border border-indigo-100 dark:border-indigo-900">
              ID: #{studentCode}
            </span>
          </div>

          {/* بيانات الطالب */}
          <div className="space-y-1.5 text-right bg-slate-50/80 dark:bg-slate-800/30 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-200">
            <p className="text-base font-black text-slate-900 dark:text-white">
              {student.name}
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
              <p className="bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-100 dark:border-slate-700/50">
                <span className="text-slate-400 block">الصف:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {student.grade || 'غير محدد'}
                </span>
              </p>
              <p className="bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-100 dark:border-slate-700/50">
                <span className="text-slate-400 block">المادة:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {student.subject || 'غير محدد'}
                </span>
              </p>
            </div>
            {student.parent_phone && (
              <p className="text-xs text-slate-500 dark:text-slate-400 pt-1 flex justify-between items-center px-1">
                <span>ولي الأمر:</span>
                <span className="font-mono font-bold dir-ltr">
                  {student.parent_phone}
                </span>
              </p>
            )}
          </div>

          {/* حقل تخصيص اسم المركز قبل الطباعة */}
          <div className="no-print space-y-2">
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 text-right">
              تخصيص اسم المركز (قبل الطباعة)
            </label>
            <input
              type="text"
              value={customCenterName}
              onChange={(e) => setCustomCenterName(e.target.value)}
              placeholder="أدخل اسم المركز أو المعلم"
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* أزرار الإجراءات */}
          <div className="no-print space-y-2 pt-1">
            <div className="flex gap-2">
              <button
                onClick={handlePrint}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl text-sm transition shadow-md shadow-indigo-600/20 flex items-center justify-center gap-1.5"
              >
                🖨️ طباعة الكارت
              </button>
              {student.parent_phone && (
                <button
                  onClick={handleWhatsApp}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-2.5 rounded-xl text-sm transition shadow-md shadow-emerald-600/20 flex items-center justify-center"
                  title="مراسلة عبر الواتساب"
                >
                  💬
                </button>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold py-2.5 rounded-xl text-sm transition border border-slate-200/60 dark:border-slate-700"
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>
    </>
  );
}