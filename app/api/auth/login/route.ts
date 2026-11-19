import { NextResponse } from 'next/server';
import { methodNotAllowed, parseJsonBody } from '@/lib/api-helpers';
import { setSessionCookie, signSessionToken } from '@/lib/auth';
import { findUserByEmail } from '@/lib/db';
import {
  clearFailedLoginAttempts,
  extractClientIp,
  isLoginRateLimited,
  recordFailedLoginAttempt,
} from '@/lib/login-rate-limit';
import { hashPassword, verifyPasswordAsync } from '@/lib/password';
import type { AuthUser } from '@/lib/types';
import { LoginRequestSchema } from '@/lib/validations';

export const dynamic = 'force-dynamic';

const DUMMY_PASSWORD_HASH = hashPassword('grovia-timing-guard-dummy-password-2026');

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
  const now = Date.now();
  const rateCheck = isLoginRateLimited(clientIp, parsed.data.email, now);
  if (rateCheck.limited) {
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

  try {
    const user = findUserByEmail(parsed.data.email);
    const targetHash = user ? user.password_hash : DUMMY_PASSWORD_HASH;
    const isPasswordValid = await verifyPasswordAsync(parsed.data.password, targetHash);

    if (!user || !isPasswordValid) {
      recordFailedLoginAttempt(clientIp, parsed.data.email, Date.now());
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

    clearFailedLoginAttempts(clientIp, parsed.data.email);

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

    return setSessionCookie(response, token, request);
  } catch (err: unknown) {
    console.error('[api/auth/login] POST failed:', err);
    return NextResponse.json(
      { success: false, error: 'Authentication failed' },
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
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
