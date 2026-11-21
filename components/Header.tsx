'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import gsap from 'gsap';
import type { AuthUser, ViewType } from '@/lib/types';
import { Icon } from '@/components/ui/Icon';
import { $, isReducedMotion } from '@/lib/motion';
import { HeaderProfileMenu } from './HeaderProfileMenu';

export interface HeaderProps {
  activeView: ViewType;
  onViewChange?: (view: ViewType) => void;
  onOpenSettings?: () => void;
  onOpenNotifications?: () => void;
  unreadNotificationsCount?: number;
  user: AuthUser;
  onLogout?: () => void | Promise<void>;
  defaultProfileOpen?: boolean;
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
  user,
  onLogout,
  defaultProfileOpen = false,
}: HeaderProps) {
  const tabsNavRef = useRef<HTMLElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const capLRef = useRef<HTMLElement>(null);
  const midRef = useRef<HTMLElement>(null);
  const capRRef = useRef<HTMLElement>(null);
  const bellBtnRef = useRef<HTMLButtonElement>(null);
  const hasMountedRef = useRef(false);

  // Synchronize sliding indicator pill position with direction-aware GSAP easing
  const updatePillPosition = useCallback(
    (animate = true) => {
      if (!tabsNavRef.current || !pillRef.current) return;
      const activeBtn = tabsNavRef.current.querySelector<HTMLButtonElement>(
        `button[data-view="${activeView}"]`
      );
      if (!activeBtn) return;

      const navRect = tabsNavRef.current.getBoundingClientRect();
      const btnRect = activeBtn.getBoundingClientRect();
      const leftOffset = btnRect.left - navRect.left;
      const width = btnRect.width;
      const height = btnRect.height;

      pillRef.current.style.setProperty('--ph', `${height}px`);
      pillRef.current.style.setProperty('--tab-left', `${leftOffset}px`);
      pillRef.current.style.setProperty('--tab-width', `${width}px`);

      if (!capLRef.current || !midRef.current || !capRRef.current) return;

      capLRef.current.style.transform = `translateX(${leftOffset}px)`;
      capRRef.current.style.transform = `translateX(${leftOffset + width - height}px)`;
      midRef.current.style.transform = `translateX(${leftOffset + height / 2}px) scaleX(${Math.max(0, width - height) / 100})`;
      pillRef.current.style.opacity = '1';

      if (!animate || isReducedMotion()) {
        return;
      }

      const currentX = (gsap.getProperty(capLRef.current, 'x') as number) || 0;
      const movingRight = leftOffset > currentX;

      const duration = $(0.6);
      const ease = 'power3.inOut';

      gsap
        .timeline()
        .to(
          capLRef.current,
          {
            x: leftOffset,
            duration,
            ease,
            delay: movingRight ? $(0.06) : 0,
          },
          0
        )
        .to(
          capRRef.current,
          {
            x: leftOffset + width - height,
            duration,
            ease,
            delay: !movingRight ? $(0.06) : 0,
          },
          0
        )
        .to(
          midRef.current,
          {
            x: leftOffset + height / 2,
            scaleX: Math.max(0, width - height) / 100,
            duration,
            ease,
            delay: $(0.03),
          },
          0
        )
        .to(pillRef.current, { opacity: 1, duration: $(0.2) }, 0);
    },
    [activeView]
  );

  useEffect(() => {
    updatePillPosition(false);
    const handleResize = () => updatePillPosition(false);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [updatePillPosition]);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    updatePillPosition(true);
  }, [activeView, updatePillPosition]);

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

  const handleBellClick = () => {
    if (bellBtnRef.current && !isReducedMotion()) {
      const ico = bellBtnRef.current.querySelector('.ico');
      if (ico) {
        gsap.fromTo(
          ico,
          { rotation: 0 },
          {
            keyframes: { rotation: [0, 18, -14, 10, -6, 0] },
            duration: 0.8,
            ease: 'power1.out',
            transformOrigin: '50% 10%',
          }
        );
      }
    }
    onOpenNotifications?.();
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
          aria-label="Settings"
          onClick={onOpenSettings}
        >
          <Icon name="gear" className="ico ico--gear" aria-hidden="true" />
          <span>Settings</span>
        </button>

        <button
          ref={bellBtnRef}
          className="round-btn magnetic"
          type="button"
          id="bell"
          aria-label={
            unreadNotificationsCount > 0
              ? `Notifications, ${unreadNotificationsCount} new`
              : 'Notifications'
          }
          onClick={handleBellClick}
        >
          <Icon name="bell" className="ico ico--bell" aria-hidden="true" />
          {unreadNotificationsCount > 0 && (
            <span className="round-btn__badge" id="bell-badge">
              {unreadNotificationsCount}
            </span>
          )}
        </button>

        <HeaderProfileMenu
          user={user}
          onLogout={onLogout}
          defaultProfileOpen={defaultProfileOpen}
        />
      </div>
    </header>
  );
}
