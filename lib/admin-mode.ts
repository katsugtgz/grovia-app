import { DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASS } from './demo-credentials';

/**
 * Single server-side source of truth for private-administrator mode: the
 * deployment is pinned to a configured private admin credential when
 * `ADMIN_PASSWORD` carries a non-blank value that is NOT the publicly known
 * demo password — configuring the public default as the private credential
 * must never silently flip a deployment into private mode. Shared by the
 * session layer (credential-version gating in `lib/auth-edge.ts`), the login
 * proof, and the DB/policy layer (`lib/db.ts`) so all of them can never
 * disagree about what private mode means and no weaker alternate path can
 * appear.
 */
export function isPrivateAdminMode(): boolean {
  const configured = process.env.ADMIN_PASSWORD?.trim();
  return Boolean(configured) && configured !== DEMO_ADMIN_PASS;
}

/**
 * Configured private-mode admin identity (trimmed, lower-cased), or null when
 * private mode is off. A blank `ADMIN_EMAIL` falls back to the demo address so
 * a misconfigured deployment cannot seed or authorize a blank email.
 */
export function getConfiguredPrivateAdminEmail(): string | null {
  if (!isPrivateAdminMode()) return null;
  const configured = process.env.ADMIN_EMAIL?.trim();
  const email = configured && configured.length > 0 ? configured : DEMO_ADMIN_EMAIL;
  return email.toLowerCase();
}

/**
 * Whether administrator sessions must carry the current credential-version
 * stamp. Active only in private-mode production: that is the transition where
 * demo-era sessions (issued while the demo password was public) would
 * otherwise remain valid under an unchanged signing secret.
 */
export function isAdminCredentialGateActive(): boolean {
  return process.env.NODE_ENV === 'production' && isPrivateAdminMode();
}
