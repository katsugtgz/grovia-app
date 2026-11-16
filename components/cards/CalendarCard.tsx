'use client';

import React, { useRef, useEffect, useState } from 'react';
import gsap from 'gsap';
import { $, isReducedMotion } from '@/lib/motion';
import { Icon } from '@/components/ui/Icon';
import { triggerToast } from '@/lib/toast';
import { no } from '@/lib/template-core';
import { INITIAL_PEOPLE } from '@/lib/data';

export interface CalendarEvent {
  id: string;
  day: number;
  span: number;
  slot: number;
  len: number;
  title: string;
  sub: string;
  tone: string;
  who: number[];
}

export interface CalendarWeek {
  title: string;
  days: number[];
  today?: number;
  now?: number;
  events: CalendarEvent[];
}

const WEEKS: CalendarWeek[] = [
  {
    title: 'Sep 21 – 26',
    days: [21, 22, 23, 24, 25, 26],
    events: [
      {
        id: 'w0-e0',
        day: 1,
        span: 1,
        slot: 2,
        len: 2,
        title: 'Design crit',
        sub: 'Pricing page v3',
        tone: 'dark',
        who: [0, 5],
      },
      {
        id: 'w0-e1',
        day: 3,
        span: 2,
        slot: 5,
        len: 2,
        title: 'Payroll close',
        sub: 'September run',
        tone: 'honey',
        who: [4],
      },
    ],
  },
  {
    title: 'Sep 28 – Oct 3',
    days: [28, 29, 30, 1, 2, 3],
    today: 1,
    now: 3.33,
    events: [
      {
        id: 'w1-e0',
        day: 1,
        span: 2,
        slot: 0,
        len: 2,
        title: 'Weekly team sync',
        sub: 'Priorities for the sprint',
        tone: 'dark',
        who: [4, 2, 6],
      },
      {
        id: 'w1-e1',
        day: 2,
        span: 2,
        slot: 4,
        len: 2,
        title: 'Onboarding session',
        sub: 'Welcome Person 02 & Person 04',
        tone: '',
        who: [1, 3],
      },
      {
        id: 'w1-e2',
        day: 4,
        span: 2,
        slot: 2,
        len: 2,
        title: '1:1 with Person 01',
        sub: 'Growth plan',
        tone: 'honey',
        who: [0],
      },
    ],
  },
  {
    title: 'Oct 5 – 10',
    days: [5, 6, 7, 8, 9, 10],
    events: [
      {
        id: 'w2-e0',
        day: 1,
        span: 3,
        slot: 0,
        len: 2,
        title: 'Q4 kickoff',
        sub: 'All hands · Studio',
        tone: 'dark',
        who: [4, 0, 8],
      },
      {
        id: 'w2-e1',
        day: 3,
        span: 2,
        slot: 5,
        len: 2,
        title: 'Offsite planning',
        sub: 'Porto, November',
        tone: '',
        who: [7, 9],
      },
    ],
  },
];

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TIME_LABELS = ['8:00 am', '9:00 am', '10:00 am', '11:00 am'];

export function CalendarCard() {
  const cardRef = useRef<HTMLElement>(null);
  const calGridRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [weekIdx, setWeekIdx] = useState(1); // Default to week 1

  const activeWeek = WEEKS[weekIdx];

  const navigateWeek = (dir: number) => {
    const nextIdx = weekIdx + dir;
    if (nextIdx < 0 || nextIdx >= WEEKS.length) return;

    if (!isReducedMotion() && calGridRef.current && titleRef.current) {
      const dynEls = calGridRef.current.querySelectorAll('.cal__dyn');
      gsap
        .timeline()
        .to([titleRef.current, ...dynEls], {
          x: -dir * 26,
          opacity: 0,
          duration: $(0.22),
          ease: 'power2.in',
          stagger: $(0.012),
        })
        .add(() => {
          setWeekIdx(nextIdx);
        });
    } else {
      setWeekIdx(nextIdx);
    }
  };

  // Entrance animation when week changes
  useEffect(() => {
    if (isReducedMotion() || !calGridRef.current || !titleRef.current) return;

    const dynEls = calGridRef.current.querySelectorAll('.cal__dyn');
    const days = calGridRef.current.querySelectorAll('.cal__day');
    const events = calGridRef.current.querySelectorAll('.ev');
    const nowLine = calGridRef.current.querySelector<HTMLElement>('.cal__now');

    gsap.fromTo(
      titleRef.current,
      { opacity: 0 },
      { opacity: 1, duration: $(0.45), ease: 'power3.out', clearProps: 'transform' }
    );

    gsap.fromTo(
      days,
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: $(0.5), stagger: $(0.035), ease: 'power3.out', clearProps: 'transform' }
    );

    gsap.fromTo(
      events,
      { opacity: 0, y: 14, scale: 0.94 },
      { opacity: 1, y: 0, scale: 1, duration: $(0.6), stagger: $(0.08), ease: 'back.out(1.7)', clearProps: 'transform' }
    );

    if (nowLine) {
      gsap.fromTo(
        nowLine,
        { scaleX: 0, transformOrigin: '0 50%' },
        { scaleX: 1, duration: $(0.9), ease: 'power3.inOut', clearProps: 'transform' }
      );
    }
  }, [weekIdx]);

  const handleEventClick = (ev: CalendarEvent, e: React.MouseEvent<HTMLButtonElement>) => {
    const btn = e.currentTarget;
    if (!isReducedMotion()) {
      gsap.fromTo(
        btn,
        { scale: 0.96 },
        { scale: 1, duration: 0.5, ease: 'back.out(3)', clearProps: 'transform' }
      );
    }
    triggerToast(`${ev.title} · ${ev.sub}`);
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

  const prevLabel = weekIdx > 0 ? WEEKS[weekIdx - 1].title.split(' – ')[0] : 'Sep 14';
  const nextLabel = weekIdx < WEEKS.length - 1 ? WEEKS[weekIdx + 1].title.split(' – ')[0] : 'Oct 12';

  return (
    <article className="card card--cal" data-card ref={cardRef}>
      <header className="cal__head">
        <button
          className="pill-btn"
          type="button"
          id="cal-prev"
          disabled={weekIdx === 0}
          onClick={() => navigateWeek(-1)}
        >
          <Icon name="chev-l" className="ico" aria-hidden="true" />
          <span id="cal-prev-lab">{prevLabel}</span>
        </button>

        <h2 className="cal__title" id="cal-title" ref={titleRef}>
          {activeWeek.title}
        </h2>

        <button
          className="pill-btn"
          type="button"
          id="cal-next"
          disabled={weekIdx === WEEKS.length - 1}
          onClick={() => navigateWeek(1)}
        >
          <span id="cal-next-lab">{nextLabel}</span>
          <Icon name="chev-r" className="ico" aria-hidden="true" />
        </button>
      </header>

      <div className="cal" id="cal" aria-live="polite" ref={calGridRef}>
        {/* Time Labels & horizontal rules */}
        {TIME_LABELS.map((time, tIdx) => (
          <React.Fragment key={time}>
            <span className="cal__time" style={{ gridRow: `${2 + tIdx * 2}` }}>
              {time}
            </span>
            <i className="cal__rule" style={{ gridRow: `${2 + tIdx * 2}` }} />
          </React.Fragment>
        ))}

        {/* Column divider guides */}
        {DAY_NAMES.map((d, dIdx) => (
          <i key={d} className="cal__col" style={{ gridColumn: `${2 + dIdx}` }} />
        ))}

        {/* Dynamic Days Header */}
        {activeWeek.days.map((dayNum, dIdx) => (
          <div
            key={`day-${dayNum}-${dIdx}`}
            className={`cal__day cal__dyn ${activeWeek.today === dIdx ? 'is-today' : ''}`}
            style={{ gridColumn: `${2 + dIdx}` }}
          >
            <span className="cal__dname">{DAY_NAMES[dIdx]}</span>
            <span className="cal__dnum">{dayNum}</span>
          </div>
        ))}

        {/* Dynamic Event Chips */}
        {activeWeek.events.map((ev, evIdx) => (
          <button
            key={ev.id}
            className={`ev cal__dyn ${ev.tone ? `ev--${ev.tone}` : ''}`}
            type="button"
            data-ev={evIdx}
            style={{
              gridColumn: `${2 + ev.day} / span ${ev.span}`,
              gridRow: `${2 + ev.slot} / span ${ev.len}`,
            }}
            onClick={(e) => handleEventClick(ev, e)}
          >
            <span className="ev__txt">
              <b>{ev.title}</b>
              <small>{ev.sub}</small>
            </span>
            <span className="avatars">
              {ev.who.map((personIdx) => {
                const person = INITIAL_PEOPLE[personIdx];
                return (
                  <span
                    key={`ev-av-${ev.id}-${personIdx}`}
                    className="avatar"
                    style={{ '--av': person.av } as React.CSSProperties}
                    aria-hidden="true"
                    dangerouslySetInnerHTML={{ __html: no(person.look, person.av) }}
                  />
                );
              })}
            </span>
          </button>
        ))}

        {/* Live Red Now Line */}
        {activeWeek.now != null && (
          <i
            className="cal__now cal__dyn"
            style={{
              gridRow: `${2 + Math.floor(activeWeek.now)}`,
              '--f': (activeWeek.now % 1).toFixed(2),
            } as React.CSSProperties}
          />
        )}
      </div>
    </article>
  );
}
