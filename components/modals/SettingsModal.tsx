'use client';

import React, { useRef, useEffect, useState } from 'react';
import gsap from 'gsap';
import { $, isReducedMotion } from '@/lib/motion';
import { Icon } from '@/components/ui/Icon';
import { triggerToast } from '@/lib/toast';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialName?: string;
  initialDay?: number;
  onSave?: (name: string, day: number) => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  initialName = 'Person 05',
  initialDay = 8,
  onSave,
}: SettingsModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(initialName);
  const [day, setDay] = useState(initialDay);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleDialogClick = (e: MouseEvent) => {
      if (e.target === dialog) onClose();
    };
    dialog.addEventListener('click', handleDialogClick);

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
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
      dialog.removeEventListener('click', handleDialogClick);
    };
  }, [isOpen, onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim() || 'Person 05';
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(
          'grovia-template:settings',
          JSON.stringify({ name: cleanName, day })
        );
      } catch {
        // localStorage may be disabled
      }
    }
    onSave?.(cleanName, day);
    triggerToast('Settings saved');
    onClose();
  };

  return (
    <dialog
      className="modal"
      id="settings-dialog"
      aria-labelledby="settings-title"
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <form
        className="modal__body"
        method="dialog"
        id="settings-form"
        noValidate
        onSubmit={handleSubmit}
      >
        <header className="modal__head">
          <h2 id="settings-title">Workspace settings</h2>
          <button
            className="icon-btn icon-btn--ghost"
            type="button"
            data-close
            aria-label="Close settings dialog"
            onClick={onClose}
          >
            <Icon name="x" className="ico" aria-hidden="true" />
          </button>
        </header>

        <label className="field" htmlFor="settings-name-input">
          <span className="field__label">Your first name</span>
          <input
            id="settings-name-input"
            className="field__input"
            name="name"
            autoComplete="given-name"
            maxLength={24}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <span className="field__hint">Used in the greeting on Overview.</span>
          <span className="field__error" />
        </label>

        <fieldset className="field">
          <legend className="field__label">Working day</legend>
          <div
            className="seg-choice"
            role="radiogroup"
            aria-label="Working day length"
          >
            {[6, 7, 8, 9].map((hours) => (
              <label key={hours}>
                <input
                  type="radio"
                  name="day"
                  value={hours}
                  checked={day === hours}
                  onChange={() => setDay(hours)}
                />
                <span>{hours} h</span>
              </label>
            ))}
          </div>
          <span className="field__hint">
            The time tracker&apos;s dial fills against this.
          </span>
        </fieldset>

        <footer className="modal__foot">
          <button
            className="chip-btn"
            type="button"
            data-close
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="dark-btn" type="submit">
            Save changes
          </button>
        </footer>
      </form>
    </dialog>
  );
}
