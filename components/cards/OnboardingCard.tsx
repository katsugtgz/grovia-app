'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import gsap from 'gsap';
import { $, isReducedMotion } from '@/lib/motion';
import { Icon, type IconName } from '@/components/ui/Icon';
import { triggerToast } from '@/lib/toast';

export interface TaskItem {
  id: string;
  title: string;
  when: string;
  phase: number;
  icon: IconName;
  initialChecked: boolean;
}

const INITIAL_TASKS: TaskItem[] = [
  { id: 't0', title: 'Intro interview', when: 'Sep 29, 08:30', phase: 0, icon: 'monitor', initialChecked: true },
  { id: 't1', title: 'Sign the offer', when: 'Sep 29, 10:30', phase: 0, icon: 'bolt', initialChecked: true },
  { id: 't2', title: 'Tax & bank forms', when: 'Sep 29, 13:00', phase: 0, icon: 'doc', initialChecked: false },
  { id: 't3', title: 'Accounts & access', when: 'Sep 30, 09:00', phase: 1, icon: 'key', initialChecked: false },
  { id: 't4', title: 'Laptop hand-off', when: 'Sep 30, 11:15', phase: 1, icon: 'laptop', initialChecked: false },
  { id: 't5', title: 'Q4 goals draft', when: 'Oct 1, 14:45', phase: 1, icon: 'flag', initialChecked: false },
  { id: 't6', title: 'Coffee with the team', when: 'Oct 2, 10:00', phase: 2, icon: 'chat', initialChecked: false },
  { id: 't7', title: 'Handbook walkthrough', when: 'Oct 2, 16:30', phase: 2, icon: 'link', initialChecked: false },
];

const PHASES = [
  { name: 'Paperwork', className: 'phase--honey' },
  { name: 'Setup', className: 'phase--ink' },
  { name: 'Team', className: 'phase--grey' },
];

export function OnboardingCard() {
  const cardRef = useRef<HTMLElement>(null);
  const doneCountRef = useRef<HTMLSpanElement>(null);
  const onbPctRef = useRef<HTMLSpanElement>(null);
  const phasePctsRef = useRef<(HTMLSpanElement | null)[]>([]);

  const [taskStates, setTaskStates] = useState<Record<string, boolean>>(() =>
    INITIAL_TASKS.reduce((acc, t) => ({ ...acc, [t.id]: t.initialChecked }), {})
  );

  const doneCount = Object.values(taskStates).filter(Boolean).length;
  const totalTasks = INITIAL_TASKS.length;
  const overallPct = Math.round((doneCount / totalTasks) * 100);

  // Particle explosion helper
  const fireBurst = useCallback((targetEl: HTMLElement) => {
    if (isReducedMotion() || typeof document === 'undefined') return;
    const rect = targetEl.getBoundingClientRect();
    const count = 14;

    for (let i = 0; i < count; i++) {
      const p = document.createElement('i');
      const size = 4 + Math.random() * 5;
      Object.assign(p.style, {
        position: 'fixed',
        left: `${rect.left + rect.width / 2}px`,
        top: `${rect.top + rect.height / 2}px`,
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        zIndex: '40',
        pointerEvents: 'none',
        background: i % 3 ? 'var(--honey)' : 'var(--night-ink)',
      });
      document.body.appendChild(p);

      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 30 + Math.random() * 40;

      gsap
        .timeline({ onComplete: () => p.remove() })
        .to(p, {
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist,
          duration: 0.7,
          ease: 'power3.out',
        })
        .to(
          p,
          {
            y: '+=18',
            opacity: 0,
            scale: 0.3,
            duration: 0.5,
            ease: 'power1.in',
          },
          0.35
        );
    }
  }, []);

  const handleTaskToggle = (task: TaskItem, e: React.MouseEvent<HTMLButtonElement>) => {
    const nextState = !taskStates[task.id];
    setTaskStates((prev) => ({ ...prev, [task.id]: nextState }));

    const btn = e.currentTarget;
    if (nextState && !isReducedMotion()) {
      const tick = btn.querySelector('.task__tick');
      const ico = btn.querySelector('.task__ico');
      if (tick) {
        gsap.fromTo(
          tick,
          { scale: 0.4 },
          { scale: 1, duration: 0.6, ease: 'back.out(3.2)', clearProps: 'transform' }
        );
      }
      if (ico) {
        gsap.fromTo(
          ico,
          { rotation: -12 },
          { rotation: 0, duration: 0.7, ease: 'elastic.out(1.1, 0.35)', clearProps: 'transform' }
        );
      }
      if (doneCount + 1 < totalTasks && tick) {
        fireBurst(tick as HTMLElement);
      }
    }

    if (nextState && doneCount + 1 === totalTasks) {
      if (doneCountRef.current) fireBurst(doneCountRef.current);
      triggerToast('Onboarding complete — welcome aboard');
    }
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
    <article className="card card--onboard" data-card ref={cardRef}>
      <header className="card__head">
        <h2 className="card__title">Onboarding</h2>
        <span className="big big--pct">
          <span id="onb-pct" ref={onbPctRef}>
            {overallPct}
          </span>
          %
        </span>
      </header>

      <div className="phases" id="phases">
        {PHASES.map((phase, pIdx) => {
          const phaseTasks = INITIAL_TASKS.filter((t) => t.phase === pIdx);
          const phaseDone = phaseTasks.filter((t) => taskStates[t.id]).length;
          const phaseRatio = phaseTasks.length ? phaseDone / phaseTasks.length : 0;
          const phasePercent = Math.round(phaseRatio * 100);

          return (
            <div key={phase.name} className={`phase ${phase.className}`}>
              <span
                className="phase__pct"
                data-phase-pct
                ref={(el) => {
                  phasePctsRef.current[pIdx] = el;
                }}
              >
                {phasePercent}%
              </span>
              <span className="phase__bar">
                <i
                  className="phase__fill"
                  style={{ '--p': phaseRatio.toFixed(3) } as React.CSSProperties}
                />
                <span className="phase__name">{phase.name}</span>
              </span>
            </div>
          );
        })}
      </div>

      <div className="tasks">
        <div className="tasks__stack" aria-hidden="true" />
        <div className="tasks__card">
          <header className="tasks__head">
            <h3>Onboarding tasks</h3>
            <p className="tasks__count">
              <span className="roll" id="done-count" ref={doneCountRef}>
                {doneCount}
              </span>
              /<span id="task-total">{totalTasks}</span>
            </p>
          </header>

          <ul className="tasks__list" id="tasks">
            {INITIAL_TASKS.map((task) => {
              const isChecked = !!taskStates[task.id];
              return (
                <li key={task.id}>
                  <button
                    className="task"
                    type="button"
                    aria-pressed={isChecked}
                    data-phase={task.phase}
                    onClick={(e) => handleTaskToggle(task, e)}
                  >
                    <span className="task__ico">
                      <Icon name={task.icon} className="ico" aria-hidden="true" />
                    </span>
                    <span className="task__txt">
                      <span className="task__title">
                        {task.title}
                        <i className="task__strike" />
                      </span>
                      <span className="task__when">{task.when}</span>
                    </span>
                    <span className="task__tick">
                      <Icon name="check" className="ico" aria-hidden="true" />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </article>
  );
}
