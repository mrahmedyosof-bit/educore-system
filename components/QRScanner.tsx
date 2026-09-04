'use client';

import { useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

interface QRScannerProps {
  onScanSuccess: (studentId: string) => void;
}

export default function QRScanner({ onScanSuccess }: QRScannerProps) {
  // آخر دالة مسح في ref حتى لا يُعاد إنشاء/تدمير الماسح مع كل إعادة رسم للأب
  const onScanRef = useRef(onScanSuccess);

  useEffect(() => {
    onScanRef.current = onScanSuccess;
  }, [onScanSuccess]);

  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      'reader',
      { fps: 10, qrbox: { width: 250, height: 250 } },
      false
    );

    scanner.render(
      (decodedText) => {
        try {
          scanner.pause(true);
        } catch (e) {
          console.error("Scanner pause error", e);
        }
        onScanRef.current(decodedText);
      },
      () => {}
    );

    return () => {
      scanner.clear().catch((error) => console.error("Failed to clear scanner", error));
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center p-5 bg-white rounded-3xl border border-slate-200/80 shadow-sm max-w-md mx-auto">
      <h3 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2">
        📸 وجه كاميرا الجهاز نحو كارت الـ QR
      </h3>
      <div id="reader" className="w-full overflow-hidden rounded-2xl bg-slate-50 border border-slate-200" />
    </div>
  );
}
