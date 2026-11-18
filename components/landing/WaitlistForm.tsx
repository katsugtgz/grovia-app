'use client';

import React, { useRef, useState } from 'react';
import gsap from 'gsap';
import { isReducedMotion } from '@/lib/motion';
import { Icon } from '@/components/ui/Icon';
import {
  submitWaitlistRequest,
  validateWaitlistInput,
  type WaitlistFieldErrors,
  type WaitlistFormValues,
} from './landing-data';
import { WaitlistFields } from './WaitlistFields';

export interface WaitlistFormProps {
  teamSize?: string;
  onTeamSizeChange?: (nextSize: string) => void;
}

interface WaitlistConfirmation {
  position: number;
  message: string;
  email: string;
}

function shakeElement(el: HTMLElement | null) {
  if (!el || isReducedMotion()) return;
  gsap.fromTo(
    el,
    { x: 0 },
    { keyframes: { x: [0, -6, 6, -3, 3, 0] }, duration: 0.35, clearProps: 'transform' }
  );
}

export function WaitlistForm({ teamSize: controlledTeamSize, onTeamSizeChange }: WaitlistFormProps) {
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const companyRef = useRef<HTMLInputElement>(null);
  const useCaseRef = useRef<HTMLTextAreaElement>(null);

  const [values, setValues] = useState<WaitlistFormValues>({
    name: '',
    email: '',
    company: '',
    teamSize: '11-50',
    useCase: '',
  });
  const [fieldErrors, setFieldErrors] = useState<WaitlistFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<WaitlistConfirmation | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeValues: WaitlistFormValues = {
    ...values,
    teamSize: controlledTeamSize ?? values.teamSize,
  };

  const handleFieldChange = (field: keyof WaitlistFormValues, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (field === 'teamSize') {
      onTeamSizeChange?.(value);
      return;
    }
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const focusFirstInvalid = (errors: WaitlistFieldErrors) => {
    const targets: Array<[keyof WaitlistFieldErrors, HTMLElement | null]> = [
      ['name', nameRef.current],
      ['email', emailRef.current],
      ['company', companyRef.current],
      ['useCase', useCaseRef.current],
    ];
    const first = targets.find(([key]) => Boolean(errors[key]));
    if (!first) return;
    shakeElement(first[1]);
    first[1]?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setFormError(null);
    const validationErrors = validateWaitlistInput(activeValues);
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      focusFirstInvalid(validationErrors);
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const result = await submitWaitlistRequest(activeValues);
      if (result.ok) {
        setConfirmation({
          position: result.position,
          message: result.message,
          email: activeValues.email.trim().toLowerCase(),
        });
        setValues((prev) => ({ ...prev, name: '', email: '', company: '', useCase: '' }));
        return;
      }

      if (result.duplicate) {
        setFieldErrors({ email: result.error });
        shakeElement(emailRef.current);
        emailRef.current?.focus();
      }
      setFormError(result.error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section id="waitlist" className="landing-waitlist" aria-labelledby="waitlist-title">
      <article className="card landing-waitlist__info" data-landing-reveal>
        <span className="landing-eyebrow">
          <Icon name="mail" className="ico" aria-hidden="true" />
          Early access waitlist
        </span>
        <h2 className="landing-section__title" id="waitlist-title">
          Reserve your team&apos;s spot on Grovia.
        </h2>
        <p className="landing-section__sub">
          Tell us about your team size and workflow goals. You will receive an immediate queue
          position and priority onboarding invite as cohorts open.
        </p>

        <ul className="landing-tier__list">
          <li className="landing-tier__item">
            <Icon name="check" className="ico" aria-hidden="true" />
            <span>Instant waitlist queue confirmation</span>
          </li>
          <li className="landing-tier__item">
            <Icon name="check" className="ico" aria-hidden="true" />
            <span>Zero setup fees during early access</span>
          </li>
          <li className="landing-tier__item">
            <Icon name="chat" className="ico" aria-hidden="true" />
            <span>Direct rollout guidance for teams of 10+</span>
          </li>
        </ul>
      </article>

      <article className="card landing-waitlist__card" data-landing-reveal>
        {confirmation ? (
          <div className="landing-status" role="status" aria-live="polite">
            <span className="landing-status__badge">Queue position #{confirmation.position}</span>
            <h3 className="landing-feature-card__title">{confirmation.message}</h3>
            <p className="landing-feature-card__desc">
              We reserved spot <strong>#{confirmation.position}</strong> for{' '}
              <strong>{confirmation.email}</strong>.
            </p>
            <div>
              <button
                type="button"
                className="pill-btn"
                onClick={() => setConfirmation(null)}
              >
                Register another teammate
              </button>
            </div>
          </div>
        ) : (
          <WaitlistFields
            values={activeValues}
            fieldErrors={fieldErrors}
            formError={formError}
            isSubmitting={isSubmitting}
            nameRef={nameRef}
            emailRef={emailRef}
            companyRef={companyRef}
            useCaseRef={useCaseRef}
            onFieldChange={handleFieldChange}
            onSubmit={handleSubmit}
          />
        )}
      </article>
    </section>
  );
}
