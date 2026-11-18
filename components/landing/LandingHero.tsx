import React from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

export function LandingHero() {
  return (
    <section className="landing-hero" aria-labelledby="landing-hero-title">
      <article className="card landing-hero__copy" data-landing-reveal>
        <div className="grid gap-4">
          <span className="landing-eyebrow">
            <Icon name="bolt" className="ico" aria-hidden="true" />
            People ops, unified
          </span>
          <h1 className="landing-hero__title" id="landing-hero-title">
            Run your people directory, onboarding, and payroll in one calm Bento workspace.
          </h1>
          <p className="landing-hero__sub">
            Grovia gives growing operations teams a single place to invite teammates, coordinate
            Day-1 tasks, track weekly capacity, and sign off on payroll without switching tools.
          </p>
        </div>

        <div className="landing-hero__ctas">
          <a className="dark-btn" href="#waitlist">
            Join waitlist
            <Icon name="chev-r" className="ico" aria-hidden="true" />
          </a>
          <Link className="landing-ghost-btn" href="/login">
            Sign in
          </Link>
        </div>
      </article>

      <aside className="card landing-hero__preview" aria-label="Workspace overview highlights" data-landing-reveal>
        <div className="card__head">
          <span className="card__title">Inside the Grovia workspace</span>
          <span className="landing-feature-card__tag">Protected access</span>
        </div>

        <div className="landing-preview__grid">
          <div className="landing-stat-tile">
            <span className="landing-stat-tile__label">
              <Icon name="user-plus" className="ico" aria-hidden="true" />
              Onboarding
            </span>
            <strong className="landing-stat-tile__value">4-step flow</strong>
            <span className="landing-stat-tile__note">Invites to Day-1 readiness</span>
          </div>

          <div className="landing-stat-tile">
            <span className="landing-stat-tile__label">
              <Icon name="alarm" className="ico" aria-hidden="true" />
              Time tracking
            </span>
            <strong className="landing-stat-tile__value">Live dial</strong>
            <span className="landing-stat-tile__note">Weekly team focus summary</span>
          </div>

          <div className="landing-stat-tile">
            <span className="landing-stat-tile__label">
              <Icon name="laptop" className="ico" aria-hidden="true" />
              Provisioning
            </span>
            <strong className="landing-stat-tile__value">1 checklist</strong>
            <span className="landing-stat-tile__note">Hardware, access, orientation</span>
          </div>

          <div className="landing-stat-tile">
            <span className="landing-stat-tile__label">
              <Icon name="check" className="ico" aria-hidden="true" />
              Payroll review
            </span>
            <strong className="landing-stat-tile__value">Audit-ready</strong>
            <span className="landing-stat-tile__note">Role-gated workspace data</span>
          </div>
        </div>
      </aside>
    </section>
  );
}
