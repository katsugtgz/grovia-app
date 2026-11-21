/**
 * Well-known demo workspace credentials. Public by design: they are rendered
 * on `/login` and pre-filled there so reviewers can sign in, and they are only
 * the default seed values for non-production (or explicit opt-in) runs.
 *
 * `lib/db.ts` seeds the admin account with these unless `ADMIN_EMAIL` /
 * `ADMIN_PASSWORD` overrides are configured, and `showsDefaultDemoCredentials()`
 * confirms the persisted row actually verifies this password server-side before
 * the login page is allowed to display them. Import-free so both the client
 * login form and the server DB layer can share the exact literals.
 */
export const DEMO_ADMIN_EMAIL = 'admin@grovia.io';
export const DEMO_ADMIN_PASS = 'grovia-demo-2026';
