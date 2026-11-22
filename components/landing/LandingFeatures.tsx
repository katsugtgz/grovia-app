import React from 'react';
import { Icon } from '@/components/ui/Icon';
import { LANDING_FEATURES } from './landing-data';

export function LandingFeatures() {
  return (
    <section id="features" className="landing-section" aria-labelledby="landing-features-title">
      <div className="landing-section__head" data-landing-reveal>
        <div>
          <span className="landing-eyebrow">Built for lean people teams</span>
          <h2 className="landing-section__title" id="landing-features-title">
            Everything your workspace needs, structured in Bento clarity.
          </h2>
        </div>
        <p className="landing-section__sub">
          Replace scattered spreadsheets with dedicated modules for directory hygiene, onboarding
          checklists, workday pacing, and payroll sign-off.
        </p>
      </div>

      <div className="landing-bento">
        {LANDING_FEATURES.map((feature) => (
          <article key={feature.id} className="card landing-feature-card" data-landing-reveal>
            <div className="grid gap-3">
              <div className="landing-ico-pill">
                <Icon name={feature.icon} className="ico" aria-hidden="true" />
              </div>
              <div>
                <h3 className="landing-feature-card__title">{feature.title}</h3>
                <p className="landing-feature-card__desc">{feature.description}</p>
              </div>
            </div>
            <span className="landing-feature-card__tag">{feature.tag}</span>
          </article>
        ))}
      </div>
    </section>
  );
}
