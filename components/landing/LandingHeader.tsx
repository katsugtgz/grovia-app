'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

export type LandingSectionId = 'features' | 'pricing' | 'waitlist';

const LANDING_SECTIONS: ReadonlyArray<{ id: LandingSectionId; label: string; href: string }> = [
  { id: 'features', label: 'Features', href: '#features' },
  { id: 'pricing', label: 'Pricing', href: '#pricing' },
  { id: 'waitlist', label: 'Waitlist', href: '#waitlist' },
];

function parseLandingHash(hash: string): LandingSectionId | null {
  const cleaned = hash.replace(/^#/, '').trim().toLowerCase();
  if (cleaned === 'features' || cleaned === 'pricing' || cleaned === 'waitlist') {
    return cleaned;
  }
  return null;
}

export function LandingHeader() {
  const [activeSection, setActiveSection] = useState<LandingSectionId | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleHashChange = () => {
      const fromHash = parseLandingHash(window.location.hash);
      if (fromHash) {
        setActiveSection(fromHash);
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);

    const elements = LANDING_SECTIONS.map((s) => document.getElementById(s.id)).filter(
      (el): el is HTMLElement => el !== null
    );

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined' && elements.length > 0) {
      observer = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((entry) => entry.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
          const topEntry = visible[0];
          if (topEntry?.target.id) {
            const matched = parseLandingHash(topEntry.target.id);
            if (matched) {
              setActiveSection(matched);
            }
          }
        },
        { rootMargin: '-20% 0px -55% 0px', threshold: [0.1, 0.25, 0.5] }
      );

      for (const el of elements) {
        observer.observe(el);
      }
    }

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      observer?.disconnect();
    };
  }, []);

  const handleNavClick = (sectionId: LandingSectionId) => {
    setActiveSection(sectionId);
  };

  return (
    <header className="top landing__top">
      <Link className="brand" href="/">
        <span className="brand__dot" aria-hidden="true" />
        Grovia
      </Link>

      <nav className="landing__nav" aria-label="Landing sections">
        {LANDING_SECTIONS.map((section) => {
          const isActive = activeSection === section.id;
          return (
            <a
              key={section.id}
              className={`landing__nav-link${isActive ? ' is-active' : ''}`}
              href={section.href}
              aria-current={isActive ? 'location' : undefined}
              onClick={() => handleNavClick(section.id)}
            >
              {section.label}
            </a>
          );
        })}
      </nav>

      <div className="landing__actions">
        <Link className="landing-ghost-btn" href="/login">
          <Icon name="key" className="ico" aria-hidden="true" />
          Sign in
        </Link>
        <Link className="dark-btn" href="/workspace">
          Open Workspace
          <Icon name="arrow-ur" className="ico" aria-hidden="true" />
        </Link>
      </div>
    </header>
  );
}
