'use client';

import { useEffect } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

interface QRScannerProps {
  onScanSuccess: (studentId: string) => void;
}

export default function QRScanner({ onScanSuccess }: QRScannerProps) {
  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      "reader",
      { fps: 10, qrbox: { width: 250, height: 250 } },
      false
    );

    scanner.render(
      (decodedText) => {
        onScanSuccess(decodedText);
      },
      () => {}
    );

    return () => {
      scanner.clear().catch(error => console.error("Failed to clear scanner", error));
    };
  }, [onScanSuccess]);

  return (
    <div className="flex flex-col items-center justify-center p-4 bg-slate-800 rounded-xl border border-slate-700 max-w-md mx-auto">
      <h3 className="text-lg font-bold text-slate-200 mb-3">📸 وجه كاميرا الموبايل/الكمبيوتر نحو QR الكارت</h3>
      <div id="reader" className="w-full overflow-hidden rounded-lg bg-slate-900 border border-slate-700" />
    </div>
  );
}