import React from 'react';
import { Icon } from '@/components/ui/Icon';
import {
  WAITLIST_TEAM_SIZES,
  type WaitlistFieldErrors,
  type WaitlistFormValues,
} from './landing-data';

export interface WaitlistFieldsProps {
  values: WaitlistFormValues;
  fieldErrors: WaitlistFieldErrors;
  formError: string | null;
  isSubmitting: boolean;
  nameRef: React.RefObject<HTMLInputElement | null>;
  emailRef: React.RefObject<HTMLInputElement | null>;
  companyRef: React.RefObject<HTMLInputElement | null>;
  useCaseRef: React.RefObject<HTMLTextAreaElement | null>;
  onFieldChange: (field: keyof WaitlistFormValues, value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function WaitlistFields({
  values,
  fieldErrors,
  formError,
  isSubmitting,
  nameRef,
  emailRef,
  companyRef,
  useCaseRef,
  onFieldChange,
  onSubmit,
}: WaitlistFieldsProps) {
  return (
    <form className="landing-waitlist__form" noValidate onSubmit={onSubmit}>
      {formError ? (
        <div className="landing-alert" id="waitlist-form-error" role="alert" aria-live="assertive">
          {formError}
        </div>
      ) : null}

      <div className="field-row">
        <label className="field" htmlFor="waitlist-name">
          <span className="field__label">Full name</span>
          <input
            id="waitlist-name"
            ref={nameRef}
            className="field__input"
            name="name"
            type="text"
            autoComplete="name"
            maxLength={1000}
            required
            placeholder="Jordan Taylor"
            value={values.name}
            onChange={(e) => onFieldChange('name', e.target.value)}
            aria-invalid={!!fieldErrors.name}
            aria-describedby={fieldErrors.name ? 'waitlist-name-error' : undefined}
          />
          <span className="field__error" id="waitlist-name-error">
            {fieldErrors.name ?? ''}
          </span>
        </label>

        <label className="field" htmlFor="waitlist-email">
          <span className="field__label">Work email</span>
          <input
            id="waitlist-email"
            ref={emailRef}
            className="field__input"
            name="email"
            type="email"
            autoComplete="email"
            maxLength={255}
            required
            placeholder="jordan@company.com"
            value={values.email}
            onChange={(e) => onFieldChange('email', e.target.value)}
            aria-invalid={!!fieldErrors.email}
            aria-describedby={fieldErrors.email ? 'waitlist-email-error' : undefined}
          />
          <span className="field__error" id="waitlist-email-error">
            {fieldErrors.email ?? ''}
          </span>
        </label>
      </div>

      <div className="field-row">
        <label className="field" htmlFor="waitlist-company">
          <span className="field__label">
            Company <i>(optional)</i>
          </span>
          <input
            id="waitlist-company"
            ref={companyRef}
            className="field__input"
            name="company"
            type="text"
            autoComplete="organization"
            maxLength={255}
            placeholder="Acme Labs"
            value={values.company}
            onChange={(e) => onFieldChange('company', e.target.value)}
            aria-invalid={!!fieldErrors.company}
            aria-describedby={fieldErrors.company ? 'waitlist-company-error' : undefined}
          />
          <span className="field__error" id="waitlist-company-error">
            {fieldErrors.company ?? ''}
          </span>
        </label>

        <label className="field" htmlFor="waitlist-team-size">
          <span className="field__label">Team size</span>
          <select
            id="waitlist-team-size"
            className="field__input"
            name="teamSize"
            value={values.teamSize}
            onChange={(e) => onFieldChange('teamSize', e.target.value)}
          >
            {WAITLIST_TEAM_SIZES.map((size) => (
              <option key={size} value={size}>
                {size} people
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="field" htmlFor="waitlist-use-case">
        <span className="field__label">
          Primary workflow goal <i>(optional)</i>
        </span>
        <textarea
          id="waitlist-use-case"
          ref={useCaseRef}
          className="field__input landing__textarea"
          name="useCase"
          maxLength={1000}
          placeholder="Onboarding new engineers, tracking weekly hours, streamlining payroll..."
          value={values.useCase}
          onChange={(e) => onFieldChange('useCase', e.target.value)}
          aria-invalid={!!fieldErrors.useCase}
          aria-describedby={fieldErrors.useCase ? 'waitlist-usecase-error' : undefined}
        />
        <span className="field__error" id="waitlist-usecase-error">
          {fieldErrors.useCase ?? ''}
        </span>
      </label>

      <div>
        <button className="dark-btn" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Joining waitlist...' : 'Join waitlist'}
          <Icon name="chev-r" className="ico" aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}
