'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { AuthUser } from '@/lib/types';
import { Icon } from '@/components/ui/Icon';
import { submitLogoutRequest } from './header-helpers';

export interface HeaderProfileMenuProps {
  user?: AuthUser;
  onLogout?: () => void | Promise<void>;
  defaultProfileOpen?: boolean;
}

export function HeaderProfileMenu({
  user,
  onLogout,
  defaultProfileOpen = false,
}: HeaderProfileMenuProps) {
  const profileWrapRef = useRef<HTMLDivElement>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(defaultProfileOpen);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    if (!isProfileOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsProfileOpen(false);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (
        profileWrapRef.current &&
        !profileWrapRef.current.contains(e.target as Node)
      ) {
        setIsProfileOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isProfileOpen]);

  const handleSignOut = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      if (onLogout) {
        await onLogout();
      } else {
        await submitLogoutRequest();
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
      }
    } finally {
      setIsLoggingOut(false);
      setIsProfileOpen(false);
    }
  };

  const displayName = user?.name || 'Alex Rivera';
  const displayEmail = user?.email || 'admin@grovia.io';

  return (
    <div className="profile-menu-wrap" ref={profileWrapRef}>
      <button
        className="round-btn magnetic"
        type="button"
        id="profile-menu-btn"
        aria-label="Your profile"
        aria-haspopup="menu"
        aria-expanded={isProfileOpen}
        onClick={() => setIsProfileOpen((prev) => !prev)}
      >
        <Icon name="user" className="ico" aria-hidden="true" />
      </button>

      <div
        className="profile-menu"
        id="profile-menu"
        role="menu"
        aria-label="Account menu"
        hidden={!isProfileOpen}
      >
        <div className="profile-menu__user">
          <strong className="profile-menu__name" data-profile-name>
            {displayName}
          </strong>
          <span className="profile-menu__email" data-profile-email>
            {displayEmail}
          </span>
        </div>
        <button
          className="profile-menu__logout"
          type="button"
          id="sign-out-btn"
          role="menuitem"
          disabled={isLoggingOut}
          onClick={handleSignOut}
        >
          {isLoggingOut ? 'Signing out...' : 'Sign out'}
        </button>
      </div>
    </div>
  );
}
