'use client';

import { useEffect, useRef, type RefObject } from 'react';
import gsap from 'gsap';
import { isReducedMotion } from '@/lib/motion';

/**
 * 1.6s cascading initial entrance choreography hook.
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

    const topBar = app.querySelector('.top');
    const greetingChars = app.querySelectorAll('#view-overview .split-ch');
    const railLabels = app.querySelectorAll('#view-overview .seg__label');
    const railFills = app.querySelectorAll('#view-overview .seg__fill');
    const statItems = app.querySelectorAll('#view-overview .stat');
    const bentoCards = app.querySelectorAll('#view-overview [data-card]');
    const portraitImg = app.querySelector('#view-overview .portrait__img');

    const tl = gsap.timeline();

    // 0.00s: App container entrance
    tl.fromTo(
      app,
      { opacity: 0, y: 24, scale: 0.985 },
      { opacity: 1, y: 0, scale: 1, duration: 1.0, ease: 'power3.out' },
      0
    );

    // 0.20s: Top navigation bar
    if (topBar) {
      tl.from(
        topBar.children,
        { y: -14, opacity: 0, duration: 0.7, stagger: 0.07, ease: 'power3.out' },
        0.2
      );
    }

    // 0.35s: Greeting characters
    if (greetingChars.length) {
      tl.fromTo(
        greetingChars,
        { yPercent: 110 },
        { yPercent: 0, duration: 0.9, stagger: 0.025, ease: 'power4.out' },
        0.35
      );
    }

    // 0.60s: Rail labels
    if (railLabels.length) {
      tl.from(
        railLabels,
        { opacity: 0, y: 6, duration: 0.5, stagger: 0.06, ease: 'power3.out' },
        0.6
      );
    }

    // 0.70s: Rail fill bars
    if (railFills.length) {
      tl.to(
        railFills,
        { scaleX: 1, duration: 0.8, stagger: 0.12, ease: 'power3.inOut' },
        0.7
      );
    }

    // 0.70s: Stats dl items
    if (statItems.length) {
      tl.from(
        statItems,
        { y: 22, opacity: 0, duration: 0.7, stagger: 0.08, ease: 'power3.out' },
        0.7
      );
    }

    // 0.90s: Bento cards
    if (bentoCards.length) {
      tl.fromTo(
        bentoCards,
        { opacity: 0, y: 40, scale: 0.98 },
        { opacity: 1, y: 0, scale: 1, duration: 0.9, stagger: 0.08, ease: 'power3.out' },
        0.9
      );
    }

    // 0.90s: Profile portrait image zoom settling
    if (portraitImg) {
      tl.fromTo(
        portraitImg,
        { scale: 1.18 },
        { scale: 1, duration: 1.6, ease: 'power2.out' },
        0.9
      );
    }
  }, [appRef]);
}
