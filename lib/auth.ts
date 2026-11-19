import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  type SessionPayload,
  type SessionUser,
  clearRevokedSessionTokens,
  isHttpsRequest,
  parseCookieValue,
  revokeSessionToken,
  signSessionToken,
  verifySessionToken,
} from '@/lib/auth-edge';

export type AuthResult =
  | { user: SessionPayload; error?: never }
  | { user?: never; error: NextResponse };

export async function getSessionFromRequest(request: Request): Promise<SessionPayload | null> {
  const token = parseCookieValue(request.headers.get('cookie'), SESSION_COOKIE_NAME);
  return verifySessionToken(token);
}

export async function getServerSession(): Promise<SessionPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    return await verifySessionToken(token);
  } catch {
    return null;
  }
}

export async function requireAuth(request: Request): Promise<AuthResult> {
  const user = await getSessionFromRequest(request);
  if (!user) {
    return {
      error: NextResponse.json(
        { success: false, error: 'Authentication required' },
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, max-age=0',
          },
        }
      ),
    };
  }
  return { user };
}

export function setSessionCookie(
  response: NextResponse,
  token: string,
  request?: Request
): NextResponse {
  const secure = request ? isHttpsRequest(request) : false;
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
    secure,
  });
  return response;
}

export function clearSessionCookie(
  response: NextResponse,
  request?: Request
): NextResponse {
  if (request) {
    const existingToken = parseCookieValue(request.headers.get('cookie'), SESSION_COOKIE_NAME);
    if (existingToken) {
      revokeSessionToken(existingToken);
    }
  }
  const secure = request ? isHttpsRequest(request) : false;
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    secure,
  });
  return response;
}

export {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  clearRevokedSessionTokens,
  revokeSessionToken,
  signSessionToken,
  signSessionToken as createSessionToken,
  verifySessionToken,
  type SessionPayload,
  type SessionUser,
};
