'use client';

import React, { useRef, useEffect } from 'react';
import gsap from 'gsap';
import { isReducedMotion } from '@/lib/motion';

export interface MagneticButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  damping?: number;
}

export function MagneticButton({
  children,
  className = '',
  damping = 0.28,
  ...props
}: MagneticButtonProps) {
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const btn = btnRef.current;
    if (!btn) return;

    if (
      typeof window === 'undefined' ||
      window.matchMedia('(pointer: coarse)').matches ||
      isReducedMotion()
    ) {
      return;
    }

    const quickX = gsap.quickTo(btn, 'x', { duration: 0.5, ease: 'power3.out' });
    const quickY = gsap.quickTo(btn, 'y', { duration: 0.5, ease: 'power3.out' });

    const handlePointerMove = (e: PointerEvent) => {
      if (isReducedMotion()) return;
      const rect = btn.getBoundingClientRect();
      const relX = (e.clientX - rect.left - rect.width / 2) * damping;
      const relY = (e.clientY - rect.top - rect.height / 2) * damping;
      quickX(relX);
      quickY(relY);
    };

    const handlePointerLeave = () => {
      quickX(0);
      quickY(0);
    };

    btn.addEventListener('pointermove', handlePointerMove);
    btn.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      btn.removeEventListener('pointermove', handlePointerMove);
      btn.removeEventListener('pointerleave', handlePointerLeave);
      quickX(0);
      quickY(0);
    };
  }, [damping]);

  return (
    <button
      ref={btnRef}
      className={`magnetic ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
