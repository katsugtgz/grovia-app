'use client';

import React, { useRef, useEffect, useState } from 'react';
import gsap from 'gsap';
import { $, isReducedMotion } from '@/lib/motion';
import { Icon } from '@/components/ui/Icon';
import { triggerToast } from '@/lib/toast';
import type { WaitlistResponse } from '@/lib/types';

export interface DemoBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DemoBookingModal({ isOpen, onClose }: DemoBookingModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [teamSize, setTeamSize] = useState('11-50');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setName('');
    setEmail('');
    setCompany('');
    setTeamSize('11-50');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, company, teamSize }),
      });

      if (res.ok) {
        const data: WaitlistResponse = await res.json();
        triggerToast(`You're #${data.position} on the waitlist!`);
        resetForm();
        onClose();
      } else {
        triggerToast('Could not book demo. Please try again.');
      }
    } catch {
      triggerToast('Request sent. We will be in touch!');
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <dialog
      className="modal"
      id="demo-dialog"
      aria-labelledby="demo-title"
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
        id="demo-form"
        noValidate
        onSubmit={handleSubmit}
      >
        <header className="modal__head">
          <h2 id="demo-title">Book a Demo</h2>
          <button
            className="icon-btn icon-btn--ghost"
            type="button"
            data-close
            aria-label="Close demo booking dialog"
            onClick={onClose}
          >
            <Icon name="x" className="ico" aria-hidden="true" />
          </button>
        </header>

        <label className="field" htmlFor="demo-name">
          <span className="field__label">Full name</span>
          <input
            id="demo-name"
            ref={nameInputRef}
            className="field__input"
            name="name"
            autoComplete="name"
            maxLength={40}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <label className="field" htmlFor="demo-email">
          <span className="field__label">Work email</span>
          <input
            id="demo-email"
            className="field__input"
            name="email"
            type="email"
            autoComplete="email"
            maxLength={80}
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <div className="field-row">
          <label className="field" htmlFor="demo-company">
            <span className="field__label">Company</span>
            <input
              id="demo-company"
              className="field__input"
              name="company"
              maxLength={60}
              placeholder="Acme Inc."
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </label>

          <label className="field" htmlFor="demo-teamsize">
            <span className="field__label">Team size</span>
            <select
              id="demo-teamsize"
              className="field__input"
              name="teamSize"
              value={teamSize}
              onChange={(e) => setTeamSize(e.target.value)}
            >
              <option value="1-10">1-10</option>
              <option value="11-50">11-50</option>
              <option value="51-200">51-200</option>
              <option value="200+">200+</option>
            </select>
          </label>
        </div>

        <footer className="modal__foot">
          <button
            className="chip-btn"
            type="button"
            data-close
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="dark-btn" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Booking...' : 'Confirm booking'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
