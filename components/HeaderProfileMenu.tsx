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
  const triggerBtnRef = useRef<HTMLButtonElement>(null);
  const signOutBtnRef = useRef<HTMLButtonElement>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(defaultProfileOpen);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  useEffect(() => {
    if (!isProfileOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsProfileOpen(false);
        triggerBtnRef.current?.focus();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (profileWrapRef.current?.contains(document.activeElement)) {
          e.preventDefault();
          signOutBtnRef.current?.focus();
        }
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

  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    const nextFocused = e.relatedTarget as Node | null;
    if (
      isProfileOpen &&
      nextFocused &&
      profileWrapRef.current &&
      !profileWrapRef.current.contains(nextFocused)
    ) {
      setIsProfileOpen(false);
    }
  };

  const handleSignOut = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setLogoutError(null);
    let succeeded = false;
    try {
      if (onLogout) {
        await onLogout();
        succeeded = true;
      } else {
        const ok = await submitLogoutRequest();
        if (ok) {
          succeeded = true;
          if (typeof window !== 'undefined') {
            window.location.href = '/login';
          }
        } else {
          setLogoutError('Unable to sign out. Please try again.');
        }
      }
    } catch {
      setLogoutError('Unable to sign out. Please try again.');
    } finally {
      setIsLoggingOut(false);
      if (succeeded) {
        setIsProfileOpen(false);
      }
    }
  };

  const displayName = user?.name || 'Alex Rivera';
  const displayEmail = user?.email || 'admin@grovia.io';

  return (
    <div className="profile-menu-wrap" ref={profileWrapRef} onBlur={handleBlur}>
      <button
        ref={triggerBtnRef}
        className="round-btn magnetic"
        type="button"
        id="profile-menu-btn"
        aria-label="Your profile"
        aria-haspopup="menu"
        aria-expanded={isProfileOpen}
        onClick={() => {
          setLogoutError(null);
          setIsProfileOpen((prev) => !prev);
        }}
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
        {logoutError ? (
          <p className="field__error" role="alert">
            {logoutError}
          </p>
        ) : null}
        <button
          ref={signOutBtnRef}
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
