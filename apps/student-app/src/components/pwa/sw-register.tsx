'use client';

import { useEffect } from 'react';

/** Registers the service worker for offline support + installability. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    // Register immediately on mount. (Waiting for window 'load' is unreliable in
    // a hydrated app — 'load' may already have fired before this effect runs.)
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* registration failures are non-fatal */
    });
  }, []);

  return null;
}
