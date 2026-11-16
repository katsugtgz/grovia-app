'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import type { ViewType } from '@/lib/types';
import { Icon } from '@/components/ui/Icon';

export interface HeaderProps {
  activeView: ViewType;
  onViewChange?: (view: ViewType) => void;
  onOpenSettings?: () => void;
  onOpenNotifications?: () => void;
  unreadNotificationsCount?: number;
}

const TABS: { id: ViewType; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'people', label: 'People' },
  { id: 'payroll', label: 'Payroll' },
];

export function Header({
  activeView,
  onViewChange,
  onOpenSettings,
  onOpenNotifications,
  unreadNotificationsCount = 3,
}: HeaderProps) {
  const tabsNavRef = useRef<HTMLElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const capLRef = useRef<HTMLElement>(null);
  const midRef = useRef<HTMLElement>(null);
  const capRRef = useRef<HTMLElement>(null);

  // Synchronize sliding indicator pill position
  const updatePillPosition = useCallback(() => {
    if (!tabsNavRef.current || !pillRef.current) return;
    const activeBtn = tabsNavRef.current.querySelector<HTMLButtonElement>(`button[data-view="${activeView}"]`);
    if (!activeBtn) return;

    const navRect = tabsNavRef.current.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    const leftOffset = btnRect.left - navRect.left;
    const width = btnRect.width;
    const height = btnRect.height;

    pillRef.current.style.setProperty('--ph', `${height}px`);
    pillRef.current.style.setProperty('--tab-left', `${leftOffset}px`);
    pillRef.current.style.setProperty('--tab-width', `${width}px`);
    pillRef.current.style.opacity = '1';

    if (capLRef.current && midRef.current && capRRef.current) {
      capLRef.current.style.transform = `translateX(${leftOffset}px)`;
      capRRef.current.style.transform = `translateX(${leftOffset + width - height}px)`;
      midRef.current.style.transform = `translateX(${leftOffset + height / 2}px) scaleX(${Math.max(0, width - height) / 100})`;
    }
  }, [activeView]);

  useEffect(() => {
    updatePillPosition();
    window.addEventListener('resize', updatePillPosition);
    return () => window.removeEventListener('resize', updatePillPosition);
  }, [updatePillPosition]);

  // Keyboard navigation across tabs
  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    const currentIndex = TABS.findIndex((t) => t.id === activeView);
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % TABS.length;
      onViewChange?.(TABS[nextIndex].id);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevIndex = (currentIndex - 1 + TABS.length) % TABS.length;
      onViewChange?.(TABS[prevIndex].id);
    }
  };

  return (
    <header className="top">
      <a
        className="brand"
        href="#overview"
        data-view-link="overview"
        onClick={(e) => {
          e.preventDefault();
          onViewChange?.('overview');
        }}
      >
        <span className="brand__dot" aria-hidden="true" />
        Grovia
      </a>

      <nav
        ref={tabsNavRef}
        className="tabs"
        aria-label="Sections"
        role="tablist"
        onKeyDown={handleKeyDown}
      >
        <span ref={pillRef} className="tabs__pill" aria-hidden="true">
          <i ref={capLRef} className="tabs__cap tabs__cap--l" />
          <i ref={midRef} className="tabs__mid" />
          <i ref={capRRef} className="tabs__cap tabs__cap--r" />
        </span>

        {TABS.map((tab) => {
          const isActive = activeView === tab.id;
          return (
            <button
              key={tab.id}
              className={`tab ${isActive ? 'is-active' : ''}`}
              type="button"
              role="tab"
              data-view={tab.id}
              aria-selected={isActive}
              aria-current={isActive ? 'page' : undefined}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onViewChange?.(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      <div className="top__tools">
        <button
          className="chip-btn magnetic"
          type="button"
          id="settings"
          onClick={onOpenSettings}
        >
          <Icon name="gear" className="ico ico--gear" aria-hidden="true" />
          <span>Settings</span>
        </button>

        <button
          className="round-btn magnetic"
          type="button"
          id="bell"
          aria-label={`Notifications, ${unreadNotificationsCount} new`}
          onClick={onOpenNotifications}
        >
          <Icon name="bell" className="ico ico--bell" aria-hidden="true" />
          <span className="round-btn__badge" id="bell-badge">
            {unreadNotificationsCount}
          </span>
        </button>

        <button
          className="round-btn magnetic"
          type="button"
          aria-label="Your profile"
        >
          <Icon name="user" className="ico" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
