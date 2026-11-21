import { NextResponse } from 'next/server';
import { methodNotAllowed, parseJsonBody } from '@/lib/api-helpers';
import { setSessionCookie, signSessionToken } from '@/lib/auth';
import { findUserByEmail, isDemoAdminAllowedInEnv } from '@/lib/db';
import {
  PASSWORD_VERIFICATION_RETRY_AFTER_SEC,
  extractClientIp,
  failLoginAttemptReservation,
  releaseLoginAttempt,
  releasePasswordVerificationSlot,
  reserveLoginAttempt,
  reservePasswordVerificationSlot,
  rollbackLoginAttemptReservation,
} from '@/lib/login-rate-limit';
import {
  verifyPasswordAsync,
  DUMMY_SCRYPT_HASH,
  equalsPublicDemoPassword,
  equalsConfiguredAdminPassword,
} from '@/lib/password';
import { getConfiguredPrivateAdminEmail } from '@/lib/admin-mode';
import type { AuthUser } from '@/lib/types';
import { LoginRequestSchema } from '@/lib/validations';

export const dynamic = 'force-dynamic';

function isConfiguredIdentity(
  user: { email: string } | null,
  configuredEmail: string
): boolean {
  return user !== null && user.email.trim().toLowerCase() === configuredEmail;
}

// Equal-cost dummy target for unknown emails: `DUMMY_SCRYPT_HASH` is derived
// from the current `lib/password.ts` constants (legacy `scrypt:<salt>:<hash>`
// encoding, so the parser applies the live default cost parameters) and is
// deliberately always rejected. No regeneration is ever required; a mismatch
// against any candidate password is the intended timing-guard behavior.

export async function POST(request: Request): Promise<Response> {
  const { data: rawBody, error: parseError } = await parseJsonBody(request, 16 * 1024);
  if (parseError) return parseError;

  const parsed = LoginRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.errors[0]?.message || 'Validation failed',
        details: parsed.error.errors,
      },
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  }

  const clientIp = extractClientIp(request);

  // Bound concurrent password verifications BEFORE reserving rate buckets, so
  // a saturated pool rejects with 429 without churning per-identity buckets.
  // Requests over the cap never reserve scrypt capacity.
  const verificationSlot = reservePasswordVerificationSlot();
  if (verificationSlot < 0) {
    return NextResponse.json(
      {
        success: false,
        error: 'Too many concurrent sign-in attempts. Please try again shortly.',
      },
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, max-age=0',
          'Retry-After': String(PASSWORD_VERIFICATION_RETRY_AFTER_SEC),
        },
      }
    );
  }

  const now = Date.now();
  const rateCheck = reserveLoginAttempt(clientIp, parsed.data.email, now);
  if (rateCheck.limited) {
    releasePasswordVerificationSlot(verificationSlot);
    return NextResponse.json(
      {
        success: false,
        error: 'Too many sign-in attempts. Please try again later.',
      },
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, max-age=0',
          'Retry-After': String(rateCheck.retryAfterSec),
        },
      }
    );
  }

  let reservationFinalized = false;
  try {
    const user = findUserByEmail(parsed.data.email);
    const targetHash = user ? user.password_hash : DUMMY_SCRYPT_HASH;
    const isPasswordValid = await verifyPasswordAsync(parsed.data.password, targetHash);

    // Production with the demo admin disabled: the publicly known demo
    // password must never authenticate — regardless of which (historically
    // demo-seeded) email it is tried against. Constant-time digest compare,
    // stored credentials untouched.
    const demoRejected =
      equalsPublicDemoPassword(parsed.data.password) && !isDemoAdminAllowedInEnv();
    const effectiveValid = isPasswordValid && !demoRejected;

    // Private mode: the restriction applies to ADMINISTRATOR accounts only.
    // The configured identity must present the actual configured
    // ADMIN_PASSWORD — constant-time digest comparison — on top of the
    // stored-hash check; any other admin account (stale demo-era rows
    // included) fails closed. Ordinary member accounts are unaffected and
    // keep signing in with their own credentials.
    const privateEmail = getConfiguredPrivateAdminEmail();
    const adminRole = user?.role === 'admin';
    const adminAllowed =
      privateEmail === null ||
      !adminRole ||
      (isConfiguredIdentity(user, privateEmail) &&
        effectiveValid &&
        equalsConfiguredAdminPassword(parsed.data.password));

    if (!user || !effectiveValid || !adminAllowed) {
      failLoginAttemptReservation(rateCheck);
      reservationFinalized = true;
      return NextResponse.json(
        { success: false, error: 'Invalid email or password' },
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, max-age=0',
          },
        }
      );
    }

    const sessionUser: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    const token = await signSessionToken(sessionUser);
    const response = NextResponse.json(
      { success: true, user: sessionUser },
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );

    const cookieResponse = setSessionCookie(response, token, request);
    // Success: clear the identity's completed failure counters (concurrent
    // requests' pending holds are preserved) BEFORE returning, so the finally
    // block does not roll this back as an error path.
    releaseLoginAttempt(rateCheck);
    reservationFinalized = true;
    return cookieResponse;
  } catch (err: unknown) {
    console.error('[api/auth/login] POST failed:', err);
    return NextResponse.json(
      { success: false, error: 'Authentication failed' },
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  } finally {
    releasePasswordVerificationSlot(verificationSlot);
    if (!reservationFinalized) {
      // Internal error before verification completed: undo this request's own
      // reservation without wiping prior failures.
      rollbackLoginAttemptReservation(rateCheck);
    }
  }
}

export async function GET(): Promise<Response> {
  return methodNotAllowed(['POST']);
}

export async function PUT(): Promise<Response> {
  return methodNotAllowed(['POST']);
}

export async function DELETE(): Promise<Response> {
  return methodNotAllowed(['POST']);
}

export async function PATCH(): Promise<Response> {
  return methodNotAllowed(['POST']);
}
