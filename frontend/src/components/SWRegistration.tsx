'use client';

import { useEffect } from 'react';

export function SWRegistration() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          console.log('[SW] Registered:', reg.scope);
          // Check for updates every 60 seconds
          setInterval(() => reg.update(), 60_000);
        })
        .catch((err) => {
          console.warn('[SW] Registration failed:', err);
        });
    }
  }, []);

  return null;
}
