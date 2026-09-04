'use client';

import { useState, useEffect } from 'react';

export default function LiveClock() {
  const [time, setTime] = useState<string | null>(null);

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString('ar-EG', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
      );
    };

    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!time) {
    return <span className="opacity-0">00:00:00</span>;
  }

  return <span>{time}</span>;
}