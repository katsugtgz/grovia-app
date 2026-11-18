'use client';

import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { $, isReducedMotion } from '@/lib/motion';
import { LandingHeader } from './LandingHeader';
import { LandingHero } from './LandingHero';
import { LandingFeatures } from './LandingFeatures';
import { LandingPricing } from './LandingPricing';
import { WaitlistForm } from './WaitlistForm';
import { LandingFooter } from './LandingFooter';

export interface LandingPageProps {
  header?: React.ReactNode;
}

export function LandingPage({ header }: LandingPageProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [selectedTeamSize, setSelectedTeamSize] = useState<string>('11-50');

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const handleAnchorClick = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      const targetEl = e.target as HTMLElement | null;
      const anchor = targetEl?.closest?.('a[href^="#"]') as HTMLAnchorElement | null;
      if (!anchor || !root.contains(anchor)) return;

      const href = anchor.getAttribute('href');
      if (!href || href === '#') return;

      const id = href.slice(1);
      const section = document.getElementById(id);
      if (!section) return;

      e.preventDefault();
      window.history.pushState(null, '', href);
      window.dispatchEvent(new Event('hashchange'));
      section.scrollIntoView({
        behavior: isReducedMotion() ? 'auto' : 'smooth',
        block: 'start',
      });
    };

    root.addEventListener('click', handleAnchorClick);

    if (isReducedMotion()) {
      return () => {
        root.removeEventListener('click', handleAnchorClick);
      };
    }

    const ctx = gsap.context(() => {
      gsap.from('[data-landing-reveal]', {
        y: 16,
        duration: $(0.5),
        stagger: 0.05,
        ease: 'power3.out',
        clearProps: 'transform',
      });
    }, root);

    return () => {
      root.removeEventListener('click', handleAnchorClick);
      ctx.revert();
    };
  }, []);

  return (
    <div className="app landing" ref={rootRef}>
      {header ?? <LandingHeader />}
      <div className="landing__main">
        <LandingHero />
        <LandingFeatures />
        <LandingPricing onSelectTier={setSelectedTeamSize} />
        <WaitlistForm
          teamSize={selectedTeamSize}
          onTeamSizeChange={setSelectedTeamSize}
        />
        <LandingFooter />
      </div>
    </div>
  );
}
