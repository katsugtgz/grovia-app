'use client';

import React, { useRef, useEffect } from 'react';
import gsap from 'gsap';
import { $ } from '@/lib/motion';
import { Icon } from '@/components/ui/Icon';

export interface PeopleActionTrayProps {
  selectedCount: number;
  onExport: () => void;
  onMessage: () => void;
  onArchive: () => void;
  onClear: () => void;
}

export function PeopleActionTray({
  selectedCount,
  onExport,
  onMessage,
  onArchive,
  onClear,
}: PeopleActionTrayProps) {
  const trayRef = useRef<HTMLDivElement>(null);
  const hasSelection = selectedCount > 0;

  useEffect(() => {
    const el = trayRef.current;
    if (!el) return;

    if (hasSelection) {
      el.hidden = false;
      gsap.fromTo(
        el,
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: $(0.3), ease: 'power3.out' }
      );
    } else {
      if (!el.hidden) {
        gsap.to(el, {
          y: 20,
          opacity: 0,
          duration: $(0.2),
          ease: 'power2.in',
          onComplete: () => {
            el.hidden = true;
            gsap.set(el, { clearProps: 'all' });
          },
        });
      }
    }
  }, [hasSelection]);

  return (
    <div className="action-tray-wrap">
      <div
        ref={trayRef}
        className="action-tray"
        role="toolbar"
        aria-label="Bulk actions"
        hidden
      >
        <span className="action-tray__count">
          {selectedCount} selected
        </span>
        <button
          type="button"
          className="action-tray__btn"
          onClick={onExport}
        >
          <Icon name="download" className="ico" aria-hidden="true" />
          Export Selected
        </button>
        <button
          type="button"
          className="action-tray__btn"
          onClick={onMessage}
        >
          <Icon name="mail" className="ico" aria-hidden="true" />
          Message
        </button>
        <button
          type="button"
          className="action-tray__btn"
          onClick={onArchive}
        >
          <Icon name="x" className="ico" aria-hidden="true" />
          Archive
        </button>
        <button
          type="button"
          className="action-tray__btn action-tray__btn--clear"
          onClick={onClear}
          aria-label="Clear selection"
        >
          Clear selection
        </button>
      </div>
    </div>
  );
}
