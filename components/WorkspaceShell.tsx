'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import gsap from 'gsap';
import type { AuthUser, Person, ViewType } from '@/lib/types';
import { normalizeView } from '@/lib/template-core';
import { $, isReducedMotion } from '@/lib/motion';
import { useEntranceTimeline } from '@/lib/use-entrance-timeline';
import { Header } from '@/components/Header';
import { OverviewView } from '@/components/views/OverviewView';
import { PeopleView } from '@/components/views/PeopleView';
import { PayrollView } from '@/components/views/PayrollView';
import { NotificationTray } from '@/components/ui/NotificationTray';
import { ToastNotification } from '@/components/ui/ToastNotification';
import { SettingsModal } from '@/components/modals/SettingsModal';
import { InviteModal } from '@/components/modals/InviteModal';
import { DemoBookingModal } from '@/components/modals/DemoBookingModal';

export interface WorkspaceShellProps {
  initialPeople: Person[];
  user: AuthUser;
}

export function WorkspaceShell({ initialPeople, user }: WorkspaceShellProps) {
  const [currentView, setCurrentView] = useState<ViewType>('overview');
  const [people, setPeople] = useState<Person[]>(initialPeople);
  const [greetingName, setGreetingName] = useState('Person 05');
  const [workdayHours, setWorkdayHours] = useState(8);
  const [unreadNotifications, setUnreadNotifications] = useState(3);

  // Modals state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTrayOpen, setIsTrayOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isDemoOpen, setIsDemoOpen] = useState(false);

  const appRef = useRef<HTMLElement>(null);
  const requestedViewRef = useRef<ViewType>('overview');

  // Initialize workspace overview rail state without blocking initial SSR paint
  useEntranceTimeline(appRef);

  // Load settings from localStorage and listen for demo modal events
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem('grovia-template:settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.name) setGreetingName(parsed.name);
        if (parsed.day) setWorkdayHours(parsed.day);
      }
    } catch {
      // Ignore localStorage errors
    }

    const handleOpenDemo = () => setIsDemoOpen(true);
    window.addEventListener('grovia:open-demo', handleOpenDemo);
    return () => window.removeEventListener('grovia:open-demo', handleOpenDemo);
  }, []);

  // Synchronize view state with window URL hash
  useEffect(() => {
    const handleHash = () => {
      const nextView = normalizeView(window.location.hash);
      requestedViewRef.current = nextView;
      setCurrentView(nextView);
    };

    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  // View change handler with coordinated transitions and history sync
  const handleViewChange = useCallback(
    (newView: ViewType) => {
      if (newView === requestedViewRef.current) return;
      requestedViewRef.current = newView;

      if (typeof window !== 'undefined' && window.scrollY > 0) {
        window.scrollTo({
          top: 0,
          behavior: isReducedMotion() ? 'auto' : 'smooth',
        });
      }

      const app = appRef.current;
      if (!app || isReducedMotion()) {
        setCurrentView(newView);
        const targetHash = newView === 'overview' ? '' : `#${newView}`;
        if (window.location.hash !== targetHash) {
          window.history.replaceState(
            null,
            '',
            newView === 'overview'
              ? window.location.pathname + window.location.search
              : `#${newView}`
          );
        }
        return;
      }

      // Exit transition for outgoing view
      const activePanel = app.querySelector(`.view[data-view-panel="${currentView}"]`);
      const exitEls = activePanel?.querySelectorAll('[data-card], .hello, .view__head');

      const tl = gsap.timeline();

      if (exitEls && exitEls.length) {
        tl.to(exitEls, {
          opacity: 0,
          y: -10,
          duration: $(0.22),
          ease: 'power2.in',
          stagger: $(0.02),
        });
      }

      tl.add(() => {
        setCurrentView(newView);
        const targetHash = newView === 'overview' ? '' : `#${newView}`;
        if (window.location.hash !== targetHash) {
          window.history.replaceState(
            null,
            '',
            newView === 'overview'
              ? window.location.pathname + window.location.search
              : `#${newView}`
          );
        }

        // Entrance animation for incoming view
        requestAnimationFrame(() => {
          const incomingPanel = app.querySelector(`.view[data-view-panel="${newView}"]`);
          if (!incomingPanel) return;

          const incomingCards = incomingPanel.querySelectorAll('[data-card]');
          const incomingHead = incomingPanel.querySelector('.hello, .view__head');

          if (incomingHead) {
            gsap.fromTo(
              incomingHead,
              { opacity: 0, y: 14 },
              { opacity: 1, y: 0, duration: $(0.5), ease: 'power3.out', clearProps: 'transform,opacity' }
            );
          }

          if (incomingCards.length) {
            gsap.fromTo(
              incomingCards,
              { opacity: 0, y: 34, scale: 0.985 },
              {
                opacity: 1,
                y: 0,
                scale: 1,
                duration: $(0.8),
                ease: 'power3.out',
                stagger: $(0.07),
                clearProps: 'transform,opacity',
              }
            );
          }
        });
      });
    },
    [currentView]
  );

  const handleSaveSettings = (name: string, day: number) => {
    setGreetingName(name);
    setWorkdayHours(day);
  };

  const handleNewPerson = (newPerson: Person) => {
    setPeople((prev) => [newPerson, ...prev]);
  };

  const existingEmails = people.map((p) => (p.email || '').toLowerCase()).filter(Boolean);

  return (
    <section
      ref={appRef}
      className="app"
      id="app"
      data-view={currentView}
      aria-label="Grovia workspace"
    >
      <Header
        activeView={currentView}
        onViewChange={handleViewChange}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenNotifications={() => {
          setIsTrayOpen(true);
          setUnreadNotifications(0);
        }}
        unreadNotificationsCount={unreadNotifications}
        user={user}
      />

      <OverviewView
        active={currentView === 'overview'}
        greetingName={greetingName}
        workdayHours={workdayHours}
        people={people}
      />

      <PeopleView
        active={currentView === 'people'}
        people={people}
        onOpenInvite={() => setIsInviteOpen(true)}
      />

      <PayrollView
        active={currentView === 'payroll'}
        people={people}
      />

      <NotificationTray
        isOpen={isTrayOpen}
        onClose={() => setIsTrayOpen(false)}
        people={people}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        initialName={greetingName}
        initialDay={workdayHours}
        onSave={handleSaveSettings}
      />

      <InviteModal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        existingEmails={existingEmails}
        onInvite={handleNewPerson}
      />

      <DemoBookingModal
        isOpen={isDemoOpen}
        onClose={() => setIsDemoOpen(false)}
      />

      <ToastNotification />
    </section>
  );
}
