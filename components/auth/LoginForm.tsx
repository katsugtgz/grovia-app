'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { $, isReducedMotion } from '@/lib/motion';
import { Icon } from '@/components/ui/Icon';
import { DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASS } from '@/lib/demo-credentials';
import {
  resolveSafeNext,
  submitLoginRequest,
  validateLoginInput,
  type LoginFieldErrors,
} from './login-helpers';

export interface LoginFormProps {
  nextPath?: string;
  /**
   * Server-computed via `await showsDefaultDemoCredentials()`: render the demo
   * block only when the well-known demo credentials are config-allowed and the
   * persisted demo admin row actually verifies that password (stale saved
   * passwords, missing rows, and read failures all hide the hint). Never
   * expose real configured credentials through this prop.
   */
  showDemoCredentials?: boolean;
  onSuccess?: (redirectTo: string) => void;
}

export function LoginForm({
  nextPath,
  showDemoCredentials = false,
  onSuccess,
}: LoginFormProps) {
  const cardRef = useRef<HTMLElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const card = cardRef.current;
    if (!card || isReducedMotion()) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        card,
        { y: 18 },
        {
          y: 0,
          duration: $(0.55),
          ease: 'power3.out',
          clearProps: 'transform',
        }
      );
    }, card);

    return () => {
      ctx.revert();
    };
  }, []);

  const shakeElement = (el: HTMLElement | null) => {
    if (!el || isReducedMotion()) return;
    gsap.fromTo(
      el,
      { x: 0 },
      { keyframes: { x: [0, -6, 6, -3, 3, 0] }, duration: 0.35, clearProps: 'transform' }
    );
  };

  const handleUseDemo = () => {
    if (!showDemoCredentials) return;
    setEmail(DEMO_ADMIN_EMAIL);
    setPassword(DEMO_ADMIN_PASS);
    setFieldErrors({});
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setFormError(null);
    const errors = validateLoginInput(email, password);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      if (errors.email) {
        shakeElement(emailInputRef.current);
        emailInputRef.current?.focus();
      } else if (errors.password) {
        shakeElement(passwordInputRef.current);
        passwordInputRef.current?.focus();
      }
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);
    let redirected = false;

    try {
      const result = await submitLoginRequest(email, password);
      if (result.ok) {
        const target = resolveSafeNext(nextPath);
        if (onSuccess) {
          onSuccess(target);
        } else {
          window.location.assign(target);
          redirected = true;
        }
        return;
      }

      setFormError(result.error);
      shakeElement(cardRef.current);
      if (result.status === 401) {
        passwordInputRef.current?.focus();
      } else {
        emailInputRef.current?.focus();
      }
    } finally {
      if (!redirected) {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <section className="app auth-shell" aria-label="Grovia sign in">
      <header className="top">
        <Link className="brand" href="/">
          <span className="brand__dot" aria-hidden="true" />
          Grovia
        </Link>
        <div className="top__tools">
          <Link className="pill-btn" href="/">
            <Icon name="chev-l" className="ico" aria-hidden="true" />
            Back to home
          </Link>
        </div>
      </header>

      <div className="auth-stage">
        <article className="card auth-card" ref={cardRef}>
          <div className="auth-card__head">
            <span className="landing-eyebrow">
              <Icon name="key" className="ico" aria-hidden="true" />
              Workspace access
            </span>
            <h1 className="auth-card__title">Sign in to Grovia</h1>
            <p className="auth-card__sub">
              Access your protected people directory, onboarding queue, and payroll workspace.
            </p>
          </div>

          {formError ? (
            <div className="auth-alert" id="login-form-error" role="alert" aria-live="assertive">
              {formError}
            </div>
          ) : null}

          <form className="auth-form" noValidate onSubmit={handleSubmit}>
            <div className="field">
              <label className="field__label" htmlFor="login-email">
                Work email
              </label>
              <input
                id="login-email"
                ref={emailInputRef}
                className="field__input"
                name="email"
                type="email"
                autoComplete="email"
                maxLength={255}
                required
                placeholder="admin@grovia.io"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (fieldErrors.email) {
                    setFieldErrors((prev) => ({ ...prev, email: undefined }));
                  }
                }}
                aria-invalid={!!fieldErrors.email}
                aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
              />
              <span className="field__error" id="login-email-error">
                {fieldErrors.email ?? ''}
              </span>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="login-password">
                Password
              </label>
              <input
                id="login-password"
                ref={passwordInputRef}
                className="field__input"
                name="password"
                type="password"
                autoComplete="current-password"
                maxLength={1000}
                required
                placeholder="Enter your password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (fieldErrors.password) {
                    setFieldErrors((prev) => ({ ...prev, password: undefined }));
                  }
                }}
                aria-invalid={!!fieldErrors.password}
                aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
              />
              <span className="field__error" id="login-password-error">
                {fieldErrors.password ?? ''}
              </span>
            </div>

            <button className="dark-btn auth-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in...' : 'Sign in'}
              <Icon name="chev-r" className="ico" aria-hidden="true" />
            </button>
          </form>

          {showDemoCredentials ? (
            <div className="auth-demo">
              <div className="auth-demo__row">
                <span className="auth-demo__label">Demo workspace account</span>
                <button type="button" className="pill-btn" onClick={handleUseDemo}>
                  Use demo account
                </button>
              </div>
              <div className="auth-demo__creds">
                <div>
                  Email: <code className="auth-demo__code">{DEMO_ADMIN_EMAIL}</code>
                </div>
                <div>
                  Password: <code className="auth-demo__code">{DEMO_ADMIN_PASS}</code>
                </div>
              </div>
            </div>
          ) : null}
        </article>
      </div>
    </section>
  );
}
