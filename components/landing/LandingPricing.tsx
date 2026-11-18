import React from 'react';
import { Icon } from '@/components/ui/Icon';
import { LANDING_PRICING_TIERS } from './landing-data';

export interface LandingPricingProps {
  onSelectTier?: (teamSize: string) => void;
}

export function LandingPricing({ onSelectTier }: LandingPricingProps) {
  return (
    <section id="pricing" className="landing-section" aria-labelledby="landing-pricing-title">
      <div className="landing-section__head" data-landing-reveal>
        <div>
          <span className="landing-eyebrow">Transparent pricing</span>
          <h2 className="landing-section__title" id="landing-pricing-title">
            Plans that scale from your first ten hires to global teams.
          </h2>
        </div>
        <p className="landing-section__sub">
          Start free on Starter or reserve early access for Growth and Enterprise rollouts via the
          waitlist below.
        </p>
      </div>

      <div className="landing-pricing-grid">
        {LANDING_PRICING_TIERS.map((tier) => (
          <article
            key={tier.id}
            className={`card landing-tier${tier.featured ? ' landing-tier--featured' : ''}`}
            data-landing-reveal
          >
            <div className="grid gap-4">
              <div className="landing-tier__head">
                <div className="landing-tier__top">
                  <h3 className="landing-tier__name">{tier.name}</h3>
                  {tier.badge ? <span className="landing-eyebrow">{tier.badge}</span> : null}
                </div>
                <div className="landing-tier__price">
                  <span>{tier.price}</span>
                  <span className="landing-tier__cadence">{tier.cadence}</span>
                </div>
                <p className="landing-tier__desc">{tier.description}</p>
              </div>

              <ul className="landing-tier__list">
                {tier.features.map((item) => (
                  <li key={item} className="landing-tier__item">
                    <Icon name="check" className="ico" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <a
              href="#waitlist"
              className={tier.featured ? 'dark-btn landing-tier__cta' : 'landing-ghost-btn landing-tier__cta'}
              onClick={() => onSelectTier?.(tier.teamSize)}
            >
              {tier.ctaLabel}
              <Icon name="chev-r" className="ico" aria-hidden="true" />
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}
