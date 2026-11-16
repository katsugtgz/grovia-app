import React from 'react';
import type { IconName } from '@/lib/types';

export interface IconProps {
  name: IconName | string;
  className?: string;
  'aria-hidden'?: boolean | 'true' | 'false';
  'aria-label'?: string;
}

export function Icon({
  name,
  className = 'ico',
  'aria-hidden': ariaHidden = true,
  'aria-label': ariaLabel,
}: IconProps) {
  const iconId = name.startsWith('i-') ? name : `i-${name}`;
  return (
    <svg
      className={className}
      aria-hidden={ariaLabel ? undefined : ariaHidden}
      aria-label={ariaLabel}
      focusable="false"
    >
      <use href={`#${iconId}`} />
    </svg>
  );
}

/**
 * Full 31 SVG Glyph Sprite defined once in root layout.
 */
export function IconSprite() {
  return (
    <svg className="sprite" aria-hidden="true" focusable="false" style={{ display: 'none' }}>
      <symbol id="i-arrow-ur" viewBox="0 0 24 24"><path d="M7 17 17 7M9 7h8v8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></symbol>
      <symbol id="i-play" viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5L8 5.5Z" fill="currentColor"/></symbol>
      <symbol id="i-pause" viewBox="0 0 24 24"><path d="M8.5 6v12M15.5 6v12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></symbol>
      <symbol id="i-reset" viewBox="0 0 24 24"><path d="M5 12a7 7 0 1 0 2.1-5M5 4.5V8h3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></symbol>
      <symbol id="i-alarm" viewBox="0 0 24 24"><circle cx="12" cy="13" r="7" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="M12 9.5V13l2.5 1.5M4.5 5.5 7 3.5M19.5 5.5 17 3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></symbol>
      <symbol id="i-gear" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></symbol>
      <symbol id="i-bell" viewBox="0 0 24 24"><path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5l1.5-1.5ZM10 20.5a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></symbol>
      <symbol id="i-user" viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.8" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="M4.5 20c1.2-3.7 4-5.5 7.5-5.5s6.3 1.8 7.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></symbol>
      <symbol id="i-users" viewBox="0 0 24 24"><circle cx="9" cy="9" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="M3 19c.9-3 3.1-4.6 6-4.6s5.1 1.6 6 4.6M15.5 5.9a3.2 3.2 0 0 1 0 6.2M17.5 14.6c1.8.5 3 1.9 3.5 4.4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></symbol>
      <symbol id="i-user-plus" viewBox="0 0 24 24"><circle cx="10" cy="8.5" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="M3.5 20c1-3.5 3.6-5.3 6.5-5.3 1.6 0 3 .5 4.2 1.4M18 13.5v6M15 16.5h6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></symbol>
      <symbol id="i-laptop" viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="10" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="M3 18.5h18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></symbol>
      <symbol id="i-chev-d" viewBox="0 0 24 24"><path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></symbol>
      <symbol id="i-chev-l" viewBox="0 0 24 24"><path d="m14 7-5 5 5 5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></symbol>
      <symbol id="i-chev-r" viewBox="0 0 24 24"><path d="m10 7 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></symbol>
      <symbol id="i-check" viewBox="0 0 24 24"><path d="m6.5 12.5 3.5 3.5 7.5-8" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></symbol>
      <symbol id="i-dots-v" viewBox="0 0 24 24"><circle cx="12" cy="6" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="18" r="1.2" fill="currentColor"/></symbol>
      <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="m16 16 4 4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></symbol>
      <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></symbol>
      <symbol id="i-monitor" viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="11" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="M9.5 19.5h5M12 16v3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></symbol>
      <symbol id="i-bolt" viewBox="0 0 24 24"><path d="M13 3 5 13.5h6L10.5 21 19 10.5h-6L13 3Z" fill="currentColor"/></symbol>
      <symbol id="i-chat" viewBox="0 0 24 24"><path d="M5 17.5V7.5A2.5 2.5 0 0 1 7.5 5h9A2.5 2.5 0 0 1 19 7.5v6a2.5 2.5 0 0 1-2.5 2.5H9l-4 3.5v-2Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/><path d="M9 10.5h.01M12 10.5h.01M15 10.5h.01" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></symbol>
      <symbol id="i-flag" viewBox="0 0 24 24"><path d="M6 20.5V4.5M6 5h10.5l-2 4 2 4H6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></symbol>
      <symbol id="i-link" viewBox="0 0 24 24"><path d="M10 14a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1M14 10a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></symbol>
      <symbol id="i-doc" viewBox="0 0 24 24"><path d="M7 3.5h6.5L18 8v12.5H7v-17Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M13 3.5V8.5h5M9.5 13h6M9.5 16.5h4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></symbol>
      <symbol id="i-key" viewBox="0 0 24 24"><circle cx="8" cy="15" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="m10.5 12.5 8-8M16 7l2.5 2.5M14 9l2 2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></symbol>
      <symbol id="i-cake" viewBox="0 0 24 24"><path d="M4.5 20.5h15v-7h-15v7ZM4.5 16.5c2.5 1.5 5 1.5 7.5 0 2.5 1.5 5 1.5 7.5 0M12 13.5v-3M12 7.5c-.8-.8-.8-2 0-3 .8 1 .8 2.2 0 3Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></symbol>
      <symbol id="i-mail" viewBox="0 0 24 24"><rect x="3.5" y="5.5" width="17" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="m4.5 7 7.5 6 7.5-6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></symbol>
      <symbol id="i-phone" viewBox="0 0 24 24"><path d="M6 4.5h3l1.5 4-2 1.3a9 9 0 0 0 5.7 5.7l1.3-2 4 1.5v3a1.5 1.5 0 0 1-1.6 1.5A15 15 0 0 1 4.5 6.1 1.5 1.5 0 0 1 6 4.5Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></symbol>
      <symbol id="i-pin" viewBox="0 0 24 24"><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11Z" fill="none" stroke="currentColor" strokeWidth="1.7"/><circle cx="12" cy="10" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.7"/></symbol>
      <symbol id="i-download" viewBox="0 0 24 24"><path d="M12 4.5v11M7.5 11 12 15.5l4.5-4.5M5 19.5h14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></symbol>
      <symbol id="i-x" viewBox="0 0 24 24"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></symbol>
    </svg>
  );
}
