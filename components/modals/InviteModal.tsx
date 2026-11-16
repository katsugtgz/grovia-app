'use client';

import React, { useRef, useEffect, useState } from 'react';
import gsap from 'gsap';
import { $, isReducedMotion } from '@/lib/motion';
import { Icon } from '@/components/ui/Icon';
import { triggerToast } from '@/lib/toast';
import type { Person } from '@/lib/types';
import { getAppearanceForSeed } from '@/lib/template-core';
import { AVATAR_PALETTE } from '@/lib/data';
import { InviteFormFields } from './InviteFormFields';

export interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingEmails?: string[];
  onInvite: (newPerson: Person) => void;
}

export function InviteModal({
  isOpen,
  onClose,
  existingEmails = [],
  onInvite,
}: InviteModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const roleInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [team, setTeam] = useState('Engineering');
  const [city, setCity] = useState('');

  const [errors, setErrors] = useState<{ name?: string; email?: string; role?: string }>({});

  const resetForm = () => {
    setName('');
    setEmail('');
    setRole('');
    setTeam('Engineering');
    setCity('');
    setErrors({});
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    let focusTimer: ReturnType<typeof setTimeout> | undefined;

    const handleDialogClick = (e: MouseEvent) => {
      if (e.target === dialog) {
        resetForm();
        onClose();
      }
    };
    dialog.addEventListener('click', handleDialogClick);

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
        focusTimer = setTimeout(() => nameInputRef.current?.focus(), 50);

        if (!isReducedMotion()) {
          gsap.fromTo(
            dialog,
            { opacity: 0, y: 18, scale: 0.97 },
            {
              opacity: 1,
              y: 0,
              scale: 1,
              duration: $(0.45),
              ease: 'back.out(1.6)',
              clearProps: 'transform,opacity',
            }
          );
        }
      }
    } else {
      if (dialog.open) {
        if (!isReducedMotion()) {
          gsap.to(dialog, {
            opacity: 0,
            y: 10,
            scale: 0.98,
            duration: $(0.2),
            ease: 'power2.in',
            onComplete: () => {
              dialog.close();
              gsap.set(dialog, { clearProps: 'all' });
            },
          });
        } else {
          dialog.close();
        }
      }
    }

    return () => {
      if (focusTimer) clearTimeout(focusTimer);
      dialog.removeEventListener('click', handleDialogClick);
    };
  }, [isOpen, onClose]);

  const shakeInput = (inputEl: HTMLElement | null) => {
    if (!inputEl || isReducedMotion()) return;
    gsap.fromTo(
      inputEl,
      { x: 0 },
      { keyframes: { x: [0, -6, 6, -3, 3, 0] }, duration: 0.35 }
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanRole = role.trim();
    const cleanCity = city.trim() || 'Remote';

    const newErrors: { name?: string; email?: string; role?: string } = {};

    if (cleanName.length < 2) {
      newErrors.name = 'Enter their full name.';
      shakeInput(nameInputRef.current);
    }

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
      newErrors.email = 'Enter a valid email address.';
      shakeInput(emailInputRef.current);
    } else if (existingEmails.includes(cleanEmail)) {
      newErrors.email = 'Someone with this email is already on the team.';
      shakeInput(emailInputRef.current);
    }

    if (!cleanRole) {
      newErrors.role = 'Add their role.';
      shakeInput(roleInputRef.current);
    }

    setErrors(newErrors);

    if (newErrors.name) {
      nameInputRef.current?.focus();
      return;
    }
    if (newErrors.email) {
      emailInputRef.current?.focus();
      return;
    }
    if (newErrors.role) {
      roleInputRef.current?.focus();
      return;
    }

    const uniqueId = `n-${Date.now()}`;
    const newPerson: Person = {
      id: uniqueId,
      name: cleanName,
      email: cleanEmail,
      role: cleanRole,
      team,
      city: cleanCity,
      hireDate: new Date().toISOString().split('T')[0],
      since: 'Invited today',
      status: 'Invited',
      av: AVATAR_PALETTE[Math.floor(Math.random() * AVATAR_PALETTE.length)],
      rate: 40,
      look: getAppearanceForSeed(cleanName),
    };

    onInvite(newPerson);
    triggerToast(`Invite sent to ${cleanEmail}`);
    resetForm();
    onClose();
  };

  return (
    <dialog
      className="modal"
      id="invite-dialog"
      aria-labelledby="invite-title"
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        resetForm();
        onClose();
      }}
    >
      <form
        className="modal__body"
        method="dialog"
        id="invite-form"
        noValidate
        onSubmit={handleSubmit}
      >
        <header className="modal__head">
          <h2 id="invite-title">Invite a teammate</h2>
          <button
            className="icon-btn icon-btn--ghost"
            type="button"
            data-close
            aria-label="Close invite dialog"
            onClick={onClose}
          >
            <Icon name="x" className="ico" aria-hidden="true" />
          </button>
        </header>

        <InviteFormFields
          name={name}
          setName={setName}
          nameInputRef={nameInputRef}
          email={email}
          setEmail={setEmail}
          emailInputRef={emailInputRef}
          role={role}
          setRole={setRole}
          roleInputRef={roleInputRef}
          team={team}
          setTeam={setTeam}
          city={city}
          setCity={setCity}
          errors={errors}
          onClose={onClose}
        />
      </form>
    </dialog>
  );
}
