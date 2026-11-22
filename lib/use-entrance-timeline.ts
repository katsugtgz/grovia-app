'use client';

import { useEffect, useRef, type RefObject } from 'react';
import gsap from 'gsap';
import { isReducedMotion } from '@/lib/motion';

/**
 * Lightweight initial entrance hook that preserves SSR opacity: 1 for instant LCP
 * and avoids main-thread TBT spikes on hydration.
 */
export function useEntranceTimeline(appRef: RefObject<HTMLElement | null>) {
  const isDoneRef = useRef(false);

  useEffect(() => {
    if (isDoneRef.current || isReducedMotion()) {
      isDoneRef.current = true;
      return;
    }

    const app = appRef.current;
    if (!app) return;

    isDoneRef.current = true;

    const railFills = app.querySelectorAll('#view-overview .seg__fill');
    if (railFills.length) {
      gsap.set(railFills, { scaleX: 1 });
    }
  }, [appRef]);
}
