'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon';
import { PEOPLE_TEAMS } from '@/lib/validations';

export interface InviteFormFieldsProps {
  name: string;
  setName: (v: string) => void;
  nameInputRef: React.RefObject<HTMLInputElement | null>;
  email: string;
  setEmail: (v: string) => void;
  emailInputRef: React.RefObject<HTMLInputElement | null>;
  role: string;
  setRole: (v: string) => void;
  roleInputRef: React.RefObject<HTMLInputElement | null>;
  team: string;
  setTeam: (v: string) => void;
  city: string;
  setCity: (v: string) => void;
  errors: { name?: string; email?: string; role?: string };
  onClose: () => void;
  isSubmitting?: boolean;
}

export function InviteFormFields({
  name,
  setName,
  nameInputRef,
  email,
  setEmail,
  emailInputRef,
  role,
  setRole,
  roleInputRef,
  team,
  setTeam,
  city,
  setCity,
  errors,
  onClose,
  isSubmitting = false,
}: InviteFormFieldsProps) {
  return (
    <>
      <label className="field" htmlFor="invite-name">
        <span className="field__label">Full name</span>
        <input
          id="invite-name"
          ref={nameInputRef}
          className="field__input"
          name="name"
          autoComplete="name"
          maxLength={40}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isSubmitting}
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? 'invite-form-name-error' : undefined}
        />
        {errors.name && (
          <span className="field__error" id="invite-form-name-error">
            {errors.name}
          </span>
        )}
      </label>

      <label className="field" htmlFor="invite-email">
        <span className="field__label">Work email</span>
        <input
          id="invite-email"
          ref={emailInputRef}
          className="field__input"
          name="email"
          type="email"
          autoComplete="email"
          maxLength={80}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isSubmitting}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'invite-form-email-error' : undefined}
        />
        {errors.email && (
          <span className="field__error" id="invite-form-email-error">
            {errors.email}
          </span>
        )}
      </label>

      <div className="field-row">
        <label className="field" htmlFor="invite-role">
          <span className="field__label">Role</span>
          <input
            id="invite-role"
            ref={roleInputRef}
            className="field__input"
            name="role"
            maxLength={40}
            placeholder="e.g. QA Engineer"
            required
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled={isSubmitting}
            aria-invalid={!!errors.role}
            aria-describedby={errors.role ? 'invite-form-role-error' : undefined}
          />
          {errors.role && (
            <span className="field__error" id="invite-form-role-error">
              {errors.role}
            </span>
          )}
        </label>

        <label className="field" htmlFor="invite-team">
          <span className="field__label">Team</span>
          <select
            id="invite-team"
            className="field__input"
            name="team"
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            disabled={isSubmitting}
          >
            {PEOPLE_TEAMS.map((teamOption) => (
              <option key={teamOption} value={teamOption}>
                {teamOption}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="field" htmlFor="invite-city">
        <span className="field__label">
          Based in <i>(optional)</i>
        </span>
        <input
          id="invite-city"
          className="field__input"
          name="city"
          maxLength={40}
          placeholder="Remote"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          disabled={isSubmitting}
        />
      </label>

      <footer className="modal__foot">
        <button
          className="chip-btn"
          type="button"
          data-close
          disabled={isSubmitting}
          onClick={onClose}
        >
          Cancel
        </button>
        <button className="dark-btn" type="submit" disabled={isSubmitting}>
          <Icon name="user-plus" className="ico" aria-hidden="true" />
          {isSubmitting ? 'Sending...' : 'Send invite'}
        </button>
      </footer>
    </>
  );
}
