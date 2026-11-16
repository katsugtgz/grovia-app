'use client';

import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { $ } from '@/lib/motion';

export function ToastNotification() {
  const toastRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleToast = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      const message = customEvent.detail;
      const el = toastRef.current;
      if (!el) return;

      el.textContent = message;
      gsap.killTweensOf(el);

      gsap
        .timeline()
        .fromTo(
          el,
          { opacity: 0, y: 18, scale: 0.96 },
          { opacity: 1, y: 0, scale: 1, duration: $(0.45), ease: 'back.out(1.8)' }
        )
        .to(
          el,
          { opacity: 0, y: 10, duration: $(0.3), ease: 'power2.in' },
          '+=2.2'
        );
    };

    window.addEventListener('grovia:toast', handleToast);
    return () => window.removeEventListener('grovia:toast', handleToast);
  }, []);

  return <div className="toast" id="toast" role="status" aria-live="polite" ref={toastRef} />;
}
