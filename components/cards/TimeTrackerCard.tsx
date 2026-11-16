'use client';

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import gsap from 'gsap';
import { $, isReducedMotion } from '@/lib/motion';
import { Icon } from '@/components/ui/Icon';
import { triggerToast } from '@/lib/toast';

export interface TimeTrackerCardProps {
  initialSeconds?: number;
  workdayHours?: number;
}

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export function TimeTrackerCard({
  initialSeconds = 9312,
  workdayHours = 8,
}: TimeTrackerCardProps) {
  const cardRef = useRef<HTMLElement>(null);
  const arcRef = useRef<SVGCircleElement>(null);
  const sweepRef = useRef<SVGGElement>(null);
  const clockRef = useRef<HTMLParagraphElement>(null);

  const [seconds, setSeconds] = useState(initialSeconds);
  const [isRunning, setIsRunning] = useState(false);
  const [isAlarmActive, setIsAlarmActive] = useState(false);

  const totalTargetSeconds = workdayHours * 3600;

  // Generate 60 ticks geometry
  const ticks = useMemo(() => {
    return Array.from({ length: 60 }, (_, i) => {
      const angle = (i / 60) * Math.PI * 2 - Math.PI / 2;
      const innerR = i % 5 ? 86 : 83;
      const outerR = 92;
      const x1 = (100 + Math.cos(angle) * innerR).toFixed(2);
      const y1 = (100 + Math.sin(angle) * innerR).toFixed(2);
      const x2 = (100 + Math.cos(angle) * outerR).toFixed(2);
      const y2 = (100 + Math.sin(angle) * outerR).toFixed(2);
      return { id: i, x1, y1, x2, y2 };
    });
  }, []);

  const currentSeconds = Math.max(0, Math.floor(seconds));
  const hrs = String(Math.floor(currentSeconds / 3600)).padStart(2, '0');
  const mins = String(Math.floor((currentSeconds % 3600) / 60)).padStart(2, '0');
  const secs = String(currentSeconds % 60).padStart(2, '0');

  // Update arc and sweep
  const updateDialVisuals = useCallback(
    (curSec: number, animate = true) => {
      const arc = arcRef.current;
      const sweep = sweepRef.current;
      if (!arc || !sweep) return;

      const progressOffset = 100 - Math.min(1, curSec / totalTargetSeconds) * 100;
      gsap.to(arc, {
        strokeDashoffset: progressOffset,
        duration: animate ? $(0.6) : 0,
        ease: 'power2.out',
        overwrite: 'auto',
      });
      gsap.to(sweep, {
        rotation: curSec * 6,
        svgOrigin: '100 100',
        duration: animate ? $(0.45) : 0,
        ease: 'back.out(2)',
        overwrite: 'auto',
      });
    },
    [totalTargetSeconds]
  );

  useEffect(() => {
    updateDialVisuals(seconds, false);
  }, [seconds, updateDialVisuals]);

  // Ticker for running timer
  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      setSeconds((prev) => {
        const next = prev + 1;
        updateDialVisuals(next, true);
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, updateDialVisuals]);

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

  const handleToggle = () => {
    setIsRunning((prev) => !prev);
  };

  const handleReset = () => {
    setIsRunning(false);
    const targetObj = { val: seconds };
    gsap.to(targetObj, {
      val: 0,
      duration: $(0.9),
      ease: 'power3.inOut',
      onUpdate: () => {
        setSeconds(Math.floor(targetObj.val));
        updateDialVisuals(targetObj.val, false);
      },
      onComplete: () => {
        setSeconds(0);
        updateDialVisuals(0, false);
      },
    });

    if (sweepRef.current) {
      gsap.to(sweepRef.current, {
        rotation: 0,
        svgOrigin: '100 100',
        duration: $(0.9),
        ease: 'power3.inOut',
        overwrite: 'auto',
      });
    }
  };

  const handleAlarm = (e: React.MouseEvent<HTMLButtonElement>) => {
    const next = !isAlarmActive;
    setIsAlarmActive(next);

    const btn = e.currentTarget;
    const icon = btn.querySelector('.ico');
    if (icon && !isReducedMotion()) {
      gsap.fromTo(
        icon,
        { rotation: -18 },
        {
          rotation: 0,
          duration: 0.9,
          ease: 'elastic.out(1.2, 0.25)',
          transformOrigin: '50% 60%',
        }
      );
    }

    triggerToast(next ? 'Break reminder set for 11:30' : 'Break reminder off');
  };

  const renderDigitCol = (digitChar: string) => {
    const d = parseInt(digitChar, 10) || 0;
    return (
      <span className="dg">
        <span
          className="dg__col"
          style={{ transform: `translateY(${-d * 10}%)` }}
        >
          {DIGITS.map((num) => (
            <span key={num}>{num}</span>
          ))}
        </span>
      </span>
    );
  };

  return (
    <article
      className={`card card--timer ${isRunning ? 'is-running' : ''}`}
      data-card
      ref={cardRef}
    >
      <header className="card__head">
        <h2 className="card__title">Time tracker</h2>
        <button
          className="icon-btn magnetic"
          type="button"
          aria-label="Open timesheet"
        >
          <Icon name="arrow-ur" className="ico" aria-hidden="true" />
        </button>
      </header>

      <div className="dial" id="dial">
        <svg className="dial__svg" viewBox="0 0 200 200" aria-hidden="true">
          <g className="dial__ticks" id="ticks">
            {ticks.map((t) => {
              const currentSecMod = currentSeconds % 60;
              const isLit = t.id <= currentSecMod && (isRunning || t.id === currentSecMod);
              return (
                <line
                  key={t.id}
                  x1={t.x1}
                  y1={t.y1}
                  x2={t.x2}
                  y2={t.y2}
                  className={isLit ? 'is-lit' : ''}
                />
              );
            })}
          </g>
          <circle className="dial__track" cx="100" cy="100" r="66" />
          <circle
            className="dial__arc"
            id="arc"
            ref={arcRef}
            cx="100"
            cy="100"
            r="66"
            pathLength={100}
          />
          <g className="dial__sweep" id="sweep" ref={sweepRef}>
            <circle cx="100" cy="21" r="3.2" />
          </g>
        </svg>

        <div className="dial__read">
          <p
            className="clock"
            id="clock"
            aria-label={`Tracked today ${hrs}:${mins}`}
            ref={clockRef}
          >
            {renderDigitCol(hrs[0])}
            {renderDigitCol(hrs[1])}
            <span className="clock__sep">:</span>
            {renderDigitCol(mins[0])}
            {renderDigitCol(mins[1])}
          </p>
          <p className="dial__cap">
            <span className="dial__state" id="timer-state">
              {isRunning ? 'Tracking' : 'Paused'}
            </span>{' '}
            ·{' '}
            <span className="clock__sec" id="clock-sec">
              {renderDigitCol(secs[0])}
              {renderDigitCol(secs[1])}
            </span>
            s
          </p>
        </div>
      </div>

      <div className="timer__ctrls">
        <button
          className="ctrl-btn is-primary"
          type="button"
          id="timer-toggle"
          aria-label={isRunning ? 'Pause timer' : 'Start timer'}
          aria-pressed={isRunning}
          onClick={handleToggle}
        >
          <Icon name="play" className="ico ico--play" aria-hidden="true" />
          <Icon name="pause" className="ico ico--pause" aria-hidden="true" />
        </button>

        <button
          className="ctrl-btn"
          type="button"
          id="timer-reset"
          aria-label="Reset today"
          onClick={handleReset}
        >
          <Icon name="reset" className="ico" aria-hidden="true" />
        </button>

        <button
          className="ctrl-btn ctrl-btn--dark magnetic"
          type="button"
          id="alarm"
          aria-label="Set a break reminder"
          aria-pressed={isAlarmActive}
          onClick={handleAlarm}
        >
          <Icon name="alarm" className="ico ico--alarm" aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}
