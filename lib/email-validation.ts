/**
 * Client-side email pattern kept in sync with server-side Zod `.email()` validation
 * in `lib/validations.ts`. Shared between landing waitlist and login forms.
 */
export const EMAIL_PATTERN =
  /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;
