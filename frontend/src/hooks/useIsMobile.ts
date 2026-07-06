'use client';

import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = 768; // px — md breakpoint

/**
 * Returns:
 *  null  → not yet determined (server / first render)
 *  true  → mobile viewport
 *  false → desktop viewport
 */
export function useIsMobile(): boolean | null {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    setIsMobile(mq.matches);

    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isMobile;
}
