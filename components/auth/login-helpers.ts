import {
  DEFAULT_AUTH_REDIRECT,
  getSafeRedirectTarget,
  type SessionPayload,
} from '@/lib/auth-edge';
import { EMAIL_PATTERN } from '@/lib/email-validation';
import type { AuthLoginResponse, AuthUser } from '@/lib/types';

export const DEMO_ADMIN_EMAIL = 'admin@grovia.io';
export const DEMO_ADMIN_PASS = 'grovia-demo-2026';

export interface LoginFieldErrors {
  email?: string;
  password?: string;
}

export type LoginSubmitResult =
  | {
      ok: true;
      user?: AuthUser;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

export function resolveSafeNext(rawNext: string | string[] | undefined): string {
  const candidate = Array.isArray(rawNext) ? rawNext[0] : rawNext;
  const sanitized = getSafeRedirectTarget(candidate, DEFAULT_AUTH_REDIRECT);

  try {
    const decoded = decodeURIComponent(sanitized);
    if (
      decoded.includes('\\') ||
      decoded.startsWith('//') ||
      decoded.startsWith('/\\') ||
      /[\u0000-\u001f\u007f]/.test(decoded)
    ) {
      return DEFAULT_AUTH_REDIRECT;
    }
  } catch {
    return DEFAULT_AUTH_REDIRECT;
  }

  return sanitized;
}

export function validateLoginInput(email: string, password: string): LoginFieldErrors {
  const errors: LoginFieldErrors = {};
  const cleanEmail = email.trim().toLowerCase();

  if (!cleanEmail || !EMAIL_PATTERN.test(cleanEmail) || cleanEmail.length > 255) {
    errors.email = 'Enter a valid email address.';
  }

  if (password.length === 0) {
    errors.password = 'Password is required.';
  } else if (password.length > 1000) {
    errors.password = 'Password must not exceed 1000 characters.';
  }

  return errors;
}

export async function submitLoginRequest(
  email: string,
  password: string,
  fetchImpl: typeof fetch = fetch
): Promise<LoginSubmitResult> {
  try {
    const response = await fetchImpl('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        password,
      }),
    });

    const data = (await response.json().catch(() => null)) as AuthLoginResponse | null;

    if (response.ok && data?.success) {
      return {
        ok: true,
        user: data.user,
      };
    }

    return {
      ok: false,
      status: response.status,
      error:
        data?.error ||
        (response.status === 401
          ? 'Invalid email or password'
          : 'Unable to sign in. Please try again.'),
    };
  } catch {
    return {
      ok: false,
      status: 0,
      error: 'Network error while signing in. Please try again.',
    };
  }
}

export interface ResolveLoginPageStateArgs {
  rawNext: string | string[] | undefined;
  getSession: () => Promise<SessionPayload | null>;
}

export interface LoginPageState {
  nextPath: string;
  shouldRedirect: boolean;
}

export async function resolveLoginPageState({
  rawNext,
  getSession,
}: ResolveLoginPageStateArgs): Promise<LoginPageState> {
  const nextPath = resolveSafeNext(rawNext);
  const session = await getSession();

  return {
    nextPath,
    shouldRedirect: session !== null,
  };
}
