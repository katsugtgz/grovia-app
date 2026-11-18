'use client';

import React, { useRef, useEffect, useState } from 'react';
import gsap from 'gsap';
import { $, isReducedMotion } from '@/lib/motion';
import { Icon } from '@/components/ui/Icon';
import { triggerToast } from '@/lib/toast';
import type { Person } from '@/lib/types';
import { InviteFormFields } from './InviteFormFields';
import {
  submitInvitePersonRequest,
  validateInviteInput,
  type InviteFieldErrors,
} from './invite-helpers';

export interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingEmails?: string[];
  onInvite: (newPerson: Person) => void;
}

export function InviteModal({
  isOpen,
  onClose,
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [errors, setErrors] = useState<InviteFieldErrors>({});

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanRole = role.trim();
    const cleanCity = city.trim() || 'Remote';

    const newErrors = validateInviteInput({
      name: cleanName,
      email: cleanEmail,
      role: cleanRole,
    });

    if (newErrors.name) {
      shakeInput(nameInputRef.current);
    }
    if (newErrors.email) {
      shakeInput(emailInputRef.current);
    }
    if (newErrors.role) {
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

    setIsSubmitting(true);
    try {
      const result = await submitInvitePersonRequest({
        name: cleanName,
        email: cleanEmail,
        role: cleanRole,
        team,
        city: cleanCity,
      });

      if (!result.ok) {
        if (result.status === 401 || result.unauthorized) {
          if (typeof window !== 'undefined') {
            window.location.href = '/login?next=/workspace';
          }
          return;
        }

        setErrors({ email: result.error });
        shakeInput(emailInputRef.current);
        emailInputRef.current?.focus();
        return;
      }

      onInvite(result.person);
      triggerToast(`Invite sent to ${result.person.email || cleanEmail}`);
      resetForm();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
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
          setName={(v) => {
            setName(v);
            if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
          }}
          nameInputRef={nameInputRef}
          email={email}
          setEmail={(v) => {
            setEmail(v);
            if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
          }}
          emailInputRef={emailInputRef}
          role={role}
          setRole={(v) => {
            setRole(v);
            if (errors.role) setErrors((prev) => ({ ...prev, role: undefined }));
          }}
          roleInputRef={roleInputRef}
          team={team}
          setTeam={setTeam}
          city={city}
          setCity={setCity}
          errors={errors}
          onClose={onClose}
          isSubmitting={isSubmitting}
        />
      </form>
    </dialog>
  );
}
