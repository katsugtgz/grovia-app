'use client';

import React, { useRef, useEffect, useState } from 'react';
import gsap from 'gsap';
import { isReducedMotion } from '@/lib/motion';
import { Icon } from '@/components/ui/Icon';

export interface AccordionSection {
  id: string;
  title: string;
  content: React.ReactNode;
}

export function AccordionCard() {
  const cardRef = useRef<HTMLElement>(null);
  const itemsRef = useRef<(HTMLElement | null)[]>([]);
  const [openIndex, setOpenIndex] = useState<number | null>(1); // Devices open by default

  const toggleItem = (index: number) => {
    const isCurrentlyOpen = openIndex === index;
    const nextIndex = isCurrentlyOpen ? null : index;

    // Record pre-toggle client rect tops
    const oldTops = itemsRef.current.map((el) => el?.getBoundingClientRect().top ?? 0);

    setOpenIndex(nextIndex);

    // FLIP delta compensation after state update
    requestAnimationFrame(() => {
      if (isReducedMotion()) return;

      itemsRef.current.forEach((el, idx) => {
        if (!el) return;
        const newTop = el.getBoundingClientRect().top;
        const deltaY = oldTops[idx] - newTop;
        if (deltaY !== 0) {
          gsap.fromTo(
            el,
            { y: deltaY },
            { y: 0, duration: 0.55, ease: 'power3.out', clearProps: 'transform' }
          );
        }
      });

      if (nextIndex !== null) {
        const activeItem = itemsRef.current[nextIndex];
        const body = activeItem?.querySelector('.acc__body');
        if (body?.children.length) {
          gsap.fromTo(
            body.children,
            { opacity: 0, y: -8 },
            {
              opacity: 1,
              y: 0,
              duration: 0.45,
              delay: 0.08,
              stagger: 0.05,
              ease: 'power3.out',
              clearProps: 'all',
            }
          );
        }
      }
    });
  };

  // Card hover lift
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    const handlePointerEnter = () => {
      if (!isReducedMotion()) {
        gsap.to(card, { y: -3, duration: 0.45, ease: 'power3.out', overwrite: 'auto' });
      }
    };

    const handlePointerLeave = () => {
      if (!isReducedMotion()) {
        gsap.to(card, { y: 0, duration: 0.45, ease: 'power3.out', overwrite: 'auto', clearProps: 'transform' });
      }
    };

    card.addEventListener('pointerenter', handlePointerEnter);
    card.addEventListener('pointerleave', handlePointerLeave);
    return () => {
      card.removeEventListener('pointerenter', handlePointerEnter);
      card.removeEventListener('pointerleave', handlePointerLeave);
    };
  }, []);

  return (
    <article className="card card--acc" data-card ref={cardRef}>
      <div className="acc" id="acc">
        {/* Item 0: Pension plan */}
        <section
          className="acc__item"
          ref={(el) => {
            itemsRef.current[0] = el;
          }}
        >
          <h3>
            <button
              className="acc__head"
              type="button"
              aria-expanded={openIndex === 0}
              onClick={() => toggleItem(0)}
            >
              Pension plan
              <Icon name="chev-d" className="ico acc__chev" aria-hidden="true" />
            </button>
          </h3>
          <div className="acc__body" hidden={openIndex !== 0}>
            <p className="acc__line">
              <span>Employer match</span>
              <b>6%</b>
            </p>
            <p className="acc__line">
              <span>Balance</span>
              <b>$18,240</b>
            </p>
          </div>
        </section>

        {/* Item 1: Devices */}
        <section
          className="acc__item"
          ref={(el) => {
            itemsRef.current[1] = el;
          }}
        >
          <h3>
            <button
              className="acc__head"
              type="button"
              aria-expanded={openIndex === 1}
              onClick={() => toggleItem(1)}
            >
              Devices
              <Icon name="chev-d" className="ico acc__chev" aria-hidden="true" />
            </button>
          </h3>
          <div className="acc__body" hidden={openIndex !== 1}>
            <div className="device">
              <span className="device__img" aria-hidden="true">
                <Icon name="laptop" className="ico device__ico" aria-hidden="true" />
              </span>
              <span className="device__txt">
                <b>Studio laptop 14&quot;</b>
                <small>Issued Sep 29</small>
              </span>
              <button
                className="icon-btn icon-btn--ghost"
                type="button"
                aria-label="Device options"
              >
                <Icon name="dots-v" className="ico" aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>

        {/* Item 2: Compensation */}
        <section
          className="acc__item"
          ref={(el) => {
            itemsRef.current[2] = el;
          }}
        >
          <h3>
            <button
              className="acc__head"
              type="button"
              aria-expanded={openIndex === 2}
              onClick={() => toggleItem(2)}
            >
              Compensation
              <Icon name="chev-d" className="ico acc__chev" aria-hidden="true" />
            </button>
          </h3>
          <div className="acc__body" hidden={openIndex !== 2}>
            <p className="acc__line">
              <span>Base, yearly</span>
              <b>$58,200</b>
            </p>
            <p className="acc__line">
              <span>Next review</span>
              <b>Jan 12</b>
            </p>
          </div>
        </section>

        {/* Item 3: Benefits */}
        <section
          className="acc__item"
          ref={(el) => {
            itemsRef.current[3] = el;
          }}
        >
          <h3>
            <button
              className="acc__head"
              type="button"
              aria-expanded={openIndex === 3}
              onClick={() => toggleItem(3)}
            >
              Benefits
              <Icon name="chev-d" className="ico acc__chev" aria-hidden="true" />
            </button>
          </h3>
          <div className="acc__body" hidden={openIndex !== 3}>
            <p className="acc__line">
              <span>Health</span>
              <b>Family plan</b>
            </p>
            <p className="acc__line">
              <span>Learning budget</span>
              <b>$1,200</b>
            </p>
          </div>
        </section>
      </div>
    </article>
  );
}
