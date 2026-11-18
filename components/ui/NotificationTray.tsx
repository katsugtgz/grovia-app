'use client';

import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { $ } from '@/lib/motion';
import type { Person } from '@/lib/types';
import { Icon } from './Icon';
import { no } from '@/lib/template-core';

export interface NotificationTrayProps {
  isOpen: boolean;
  onClose: () => void;
  people?: Person[];
}

const NOTIFICATION_ITEMS = [
  {
    personIndex: 1,
    fallbackId: 'notif-1',
    fallbackName: 'Team member',
    action: 'accepted the offer',
    time: '2 min ago',
  },
  {
    personIndex: 2,
    fallbackId: 'notif-2',
    fallbackName: 'Team member',
    action: 'booked Friday off',
    time: '1 h ago',
  },
  {
    personIndex: 3,
    fallbackId: 'notif-3',
    fallbackName: 'Team member',
    action: 'finished access setup',
    time: '3 h ago',
  },
] as const;

const EMPTY_PEOPLE: Person[] = [];

export function NotificationTray({
  isOpen,
  onClose,
  people = EMPTY_PEOPLE,
}: NotificationTrayProps) {
  const trayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tray = trayRef.current;
    if (!tray) return;

    if (isOpen) {
      tray.hidden = false;
      const items = tray.querySelectorAll('.tray__list li');
      gsap.fromTo(
        tray,
        { opacity: 0, y: -10, scale: 0.94 },
        { opacity: 1, y: 0, scale: 1, duration: $(0.45), ease: 'back.out(1.6)' }
      );
      if (items.length) {
        gsap.fromTo(
          items,
          { opacity: 0, x: 14 },
          {
            opacity: 1,
            x: 0,
            duration: $(0.4),
            stagger: $(0.06),
            delay: $(0.1),
            ease: 'power3.out',
            clearProps: 'all',
          }
        );
      }
    } else {
      if (!tray.hidden) {
        gsap.to(tray, {
          opacity: 0,
          y: -6,
          scale: 0.97,
          duration: $(0.2),
          ease: 'power2.in',
          onComplete: () => {
            tray.hidden = true;
            gsap.set(tray, { clearProps: 'all' });
          },
        });
      }
    }
  }, [isOpen]);

  // Click outside and escape handling
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    const handleClickOutside = (e: MouseEvent) => {
      const bell = document.getElementById('bell');
      if (
        trayRef.current &&
        !trayRef.current.contains(e.target as Node) &&
        (!bell || !bell.contains(e.target as Node))
      ) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isOpen, onClose]);

  return (
    <div
      ref={trayRef}
      className="tray"
      id="tray"
      role="region"
      aria-label="Notifications"
      hidden={!isOpen}
    >
      <header className="tray__head">
        <h2>Notifications</h2>
        <button
          className="icon-btn icon-btn--ghost"
          type="button"
          id="tray-close"
          aria-label="Close notifications"
          onClick={onClose}
        >
          <Icon name="x" className="ico" aria-hidden="true" />
        </button>
      </header>

      <ul className="tray__list">
        {NOTIFICATION_ITEMS.map(({ personIndex, fallbackId, fallbackName, action, time }) => {
          const person = people[personIndex];
          const itemKey = person?.id ?? fallbackId;
          const av = person?.av ?? '#cfe0c8';
          const name = person?.name ?? fallbackName;

          return (
            <li key={itemKey}>
              <span
                className="avatar"
                style={{ '--av': av } as React.CSSProperties}
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: no(person?.look, av) }}
              />
              <p>
                <b>{name}</b> {action}
                <small>{time}</small>
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
