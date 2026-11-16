'use client';

import React, { useRef, useEffect } from 'react';
import gsap from 'gsap';
import { $, isReducedMotion } from '@/lib/motion';
import { Icon } from '@/components/ui/Icon';
import { ProfileCard } from '@/components/cards/ProfileCard';
import { ProgressCard } from '@/components/cards/ProgressCard';
import { TimeTrackerCard } from '@/components/cards/TimeTrackerCard';
import { OnboardingCard } from '@/components/cards/OnboardingCard';
import { AccordionCard } from '@/components/cards/AccordionCard';
import { CalendarCard } from '@/components/cards/CalendarCard';
import { GrowthRoiCard } from '@/components/cards/GrowthRoiCard';

export interface OverviewViewProps {
  active: boolean;
  greetingName?: string;
}

export function OverviewView({ active, greetingName = 'Person 05' }: OverviewViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const greetingText = `Good morning, ${greetingName}`;

  // Character split animation on mount or active change
  useEffect(() => {
    if (!active || isReducedMotion() || !titleRef.current) return;

    const chars = titleRef.current.querySelectorAll('.split-ch');
    if (chars.length) {
      gsap.fromTo(
        chars,
        { yPercent: 110 },
        {
          yPercent: 0,
          duration: $(0.9),
          stagger: $(0.025),
          ease: 'power4.out',
        }
      );
    }
  }, [active, greetingName]);

  return (
    <div
      ref={containerRef}
      className={`view ${active ? 'is-active' : ''}`}
      id="view-overview"
      data-view-panel="overview"
      hidden={!active}
    >
      <div id="overview" tabIndex={-1} className="sr-only" />

      <div className="hello">
        <h1
          ref={titleRef}
          className="hello__title"
          data-split
          aria-label={greetingText}
        >
          {greetingText.split(' ').map((word, wIdx) => (
            <span
              key={`word-${wIdx}`}
              className="split-line"
              aria-hidden="true"
            >
              {[...word].map((ch, chIdx) => (
                <span key={`ch-${wIdx}-${chIdx}`} className="split-ch">
                  {ch}
                </span>
              ))}
              {wIdx < greetingText.split(' ').length - 1 && (
                <span className="split-ch"> </span>
              )}
            </span>
          ))}
        </h1>

        <div className="hello__row">
          <div className="rail" aria-label="Hiring pipeline this quarter">
            <div className="seg seg--ink" style={{ '--w': 17 } as React.CSSProperties}>
              <span className="seg__label">Interviews</span>
              <span className="seg__bar">
                <i className="seg__fill" data-fill />
                <b className="seg__num" data-count="17" data-suffix="%">
                  17%
                </b>
              </span>
            </div>

            <div className="seg seg--honey" style={{ '--w': 15 } as React.CSSProperties}>
              <span className="seg__label">Hired</span>
              <span className="seg__bar">
                <i className="seg__fill" data-fill />
                <b className="seg__num" data-count="15" data-suffix="%">
                  15%
                </b>
              </span>
            </div>

            <div className="seg seg--hatch" style={{ '--w': 56 } as React.CSSProperties}>
              <span className="seg__label">Project time</span>
              <span className="seg__bar">
                <i className="seg__fill" data-fill>
                  <i className="seg__stripes" />
                </i>
                <b className="seg__num" data-count="56" data-suffix="%">
                  56%
                </b>
              </span>
            </div>

            <div className="seg seg--line" style={{ '--w': 12 } as React.CSSProperties}>
              <span className="seg__label">Output</span>
              <span className="seg__bar">
                <i className="seg__fill" data-fill />
                <b className="seg__num" data-count="12" data-suffix="%">
                  12%
                </b>
              </span>
            </div>
          </div>

          <dl className="stats">
            <div className="stat">
              <dt className="stat__lab">
                <Icon name="users" className="ico" aria-hidden="true" />
                Team
              </dt>
              <dd className="stat__num" data-count="84">
                84
              </dd>
            </div>
            <div className="stat">
              <dt className="stat__lab">
                <Icon name="user-plus" className="ico" aria-hidden="true" />
                Hiring
              </dt>
              <dd className="stat__num" data-count="37">
                37
              </dd>
            </div>
            <div className="stat">
              <dt className="stat__lab">
                <Icon name="laptop" className="ico" aria-hidden="true" />
                Projects
              </dt>
              <dd className="stat__num" data-count="212">
                212
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="bento">
        <ProfileCard />
        <ProgressCard />
        <TimeTrackerCard />
        <OnboardingCard />
        <AccordionCard />
        <CalendarCard />
      </div>

      <div style={{ marginTop: 'var(--gap)' }}>
        <GrowthRoiCard />
      </div>
    </div>
  );
}
