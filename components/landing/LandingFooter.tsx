import React from 'react';
import Link from 'next/link';

export function LandingFooter() {
  return (
    <footer className="landing-footer">
      <Link className="brand" href="/">
        <span className="brand__dot" aria-hidden="true" />
        Grovia
      </Link>

      <div className="landing-footer__links">
        <a className="landing-footer__link" href="#features">
          Features
        </a>
        <a className="landing-footer__link" href="#pricing">
          Pricing
        </a>
        <a className="landing-footer__link" href="#waitlist">
          Waitlist
        </a>
        <Link className="landing-footer__link" href="/login">
          Sign in
        </Link>
        <Link className="landing-footer__link" href="/workspace" prefetch={false}>
          Workspace
        </Link>
      </div>
    </footer>
  );
}
