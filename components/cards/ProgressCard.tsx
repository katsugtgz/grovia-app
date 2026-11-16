'use client';

import React, { useRef, useEffect, useCallback, useState } from 'react';
import gsap from 'gsap';
import { $, isReducedMotion } from '@/lib/motion';
import { Icon } from '@/components/ui/Icon';

export interface DayData {
  d: string;
  name: string;
  h: number;
  off?: number;
  today?: number;
}

const DAYS: DayData[] = [
  { d: 'W', name: 'Wednesday', h: 6.8 },
  { d: 'T', name: 'Thursday', h: 7.4 },
  { d: 'F', name: 'Friday', h: 5.2 },
  { d: 'S', name: 'Saturday', h: 1.1, off: 1 },
  { d: 'S', name: 'Sunday', h: 0.6, off: 1 },
  { d: 'M', name: 'Monday', h: 7.9 },
  { d: 'T', name: 'Tuesday (today)', h: 5.7, today: 1 },
];

const formatDuration = (val: number): string =>
  `${Math.floor(val)}h ${String(Math.round((val % 1) * 60)).padStart(2, '0')}m`;

export function ProgressCard() {
  const cardRef = useRef<HTMLElement>(null);
  const weekRef = useRef<HTMLUListElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const [activeDayIdx, setActiveDayIdx] = useState(6); // Tuesday (today) is index 6

  const todayIndex = DAYS.findIndex((d) => d.today);

  const updateTooltip = useCallback(
    (index: number, animate = true) => {
      const week = weekRef.current;
      const tip = tipRef.current;
      if (!week || !tip) return;

      const dayEls = week.querySelectorAll<HTMLLIElement>('.day');
      const targetDay = dayEls[index];
      if (!targetDay) return;

      const track = targetDay.querySelector<HTMLElement>('.day__track');
      const bar = targetDay.querySelector<HTMLElement>('.day__bar');
      if (!track || !bar) return;

      tip.textContent = formatDuration(DAYS[index].h);
      const left =
        track.offsetLeft + bar.offsetLeft + bar.offsetWidth / 2 - tip.offsetWidth / 2;
      const top = Math.max(
        0,
        track.offsetTop + bar.offsetTop - tip.offsetHeight - 8
      );

      gsap.to(tip, {
        x: left,
        y: top,
        duration: animate ? $(0.45) : 0,
        ease: 'power3.out',
        overwrite: 'auto',
      });

      setActiveDayIdx(index);
    },
    []
  );

  useEffect(() => {
    updateTooltip(todayIndex, false);
  }, [todayIndex, updateTooltip]);

  // Card hover lift and interaction listeners
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
    <article className="card card--progress" data-card ref={cardRef}>
      <header className="card__head">
        <h2 className="card__title">Progress</h2>
        <button
          className="icon-btn magnetic"
          type="button"
          aria-label="Open progress report"
        >
          <Icon name="arrow-ur" className="ico" aria-hidden="true" />
        </button>
      </header>

      <p className="progress__sum">
        <span className="big" data-count="6.6" data-decimals="1" data-suffix=" h">
          6.6 h
        </span>
        <span className="progress__cap">
          Avg. workday
          <br />
          last 7 days
        </span>
      </p>

      <ul
        className="week"
        id="week"
        aria-label="Hours worked per day"
        ref={weekRef}
        onPointerLeave={() => updateTooltip(todayIndex, true)}
        onBlur={() => updateTooltip(todayIndex, true)}
      >
        {DAYS.map((day, idx) => {
          const ratio = (day.h / 9).toFixed(3);
          const isWeekend = day.off;
          const isToday = day.today;
          const isHot = activeDayIdx === idx;

          return (
            <li
              key={day.name}
              className={`day ${isWeekend ? 'is-weekend' : ''} ${isToday ? 'is-today' : ''} ${isHot ? 'is-hot' : ''}`}
              tabIndex={0}
              data-i={idx}
              aria-label={`${day.name}: ${formatDuration(day.h)}`}
              style={{ '--h': ratio } as React.CSSProperties}
              onPointerEnter={() => updateTooltip(idx, true)}
              onFocus={() => updateTooltip(idx, true)}
            >
              <span className="day__track">
                <i className="day__stub" />
                <i className="day__bar" />
              </span>
              <i className="day__dot" />
              <span className="day__lab">{day.d}</span>
            </li>
          );
        })}

        <span
          className="week__tip"
          id="week-tip"
          aria-live="polite"
          ref={tipRef}
        >
          5h 42m
        </span>
      </ul>
    </article>
  );
}
