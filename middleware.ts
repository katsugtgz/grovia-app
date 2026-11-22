import { type NextRequest, NextResponse } from 'next/server';
import {
  DEFAULT_AUTH_REDIRECT,
  SESSION_COOKIE_NAME,
  parseCookieValue,
  sanitizeNextPath,
  verifySessionToken,
} from '@/lib/auth-edge';

function matchesRoutePrefix(pathname: string, prefix: string): boolean {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return normalized === prefix || normalized.startsWith(`${prefix}/`);
}

function isProtectedApiRequest(pathname: string, method: string): boolean {
  const upperMethod = method.toUpperCase();

  if (matchesRoutePrefix(pathname, '/api/waitlist')) {
    return upperMethod !== 'POST';
  }

  if (
    matchesRoutePrefix(pathname, '/api/inquiries') ||
    matchesRoutePrefix(pathname, '/api/metrics') ||
    matchesRoutePrefix(pathname, '/api/people')
  ) {
    return true;
  }

  return false;
}

function readQueryParam(params: URLSearchParams, targetKey: string): string | null {
  for (const [key, value] of params.entries()) {
    if (key === targetKey) {
      return value;
    }
  }
  return null;
}

function extractSessionToken(request: NextRequest): string | null {
  const fromHeader = parseCookieValue(request.headers.get('cookie'), SESSION_COOKIE_NAME);
  if (fromHeader) {
    return fromHeader;
  }
  return request.cookies?.get(SESSION_COOKIE_NAME)?.value ?? null;
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const nextUrl = request.nextUrl ?? new URL(request.url);
  const { pathname, search } = nextUrl;
  const method = request.method.toUpperCase();

  const isWorkspaceRoute = matchesRoutePrefix(pathname, '/workspace');
  const isLoginRoute = matchesRoutePrefix(pathname, '/login');
  const isProtectedApi = isProtectedApiRequest(pathname, method);

  if (!isWorkspaceRoute && !isLoginRoute && !isProtectedApi) {
    return NextResponse.next();
  }

  const token = extractSessionToken(request);
  const session = await verifySessionToken(token);
  const isAuthenticated = session !== null;

  if (isProtectedApi) {
    if (!isAuthenticated) {
      return NextResponse.json(
        {
          success: false,
          authenticated: false,
          error: 'Authentication required',
        },
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, max-age=0',
          },
        }
      );
    }
    return NextResponse.next();
  }

  if (isWorkspaceRoute) {
    if (!isAuthenticated) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('next', `${pathname}${search}`);
      return NextResponse.redirect(loginUrl, 307);
    }
    return NextResponse.next();
  }

  if (isLoginRoute && (method === 'GET' || method === 'HEAD') && isAuthenticated) {
    const rawNext = readQueryParam(nextUrl.searchParams, 'next');
    const safeNext = sanitizeNextPath(rawNext, DEFAULT_AUTH_REDIRECT);
    return NextResponse.redirect(new URL(safeNext, request.url), 307);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/workspace',
    '/workspace/:path*',
    '/login',
    '/api/waitlist',
    '/api/waitlist/:path*',
    '/api/inquiries',
    '/api/inquiries/:path*',
    '/api/metrics',
    '/api/metrics/:path*',
    '/api/people',
    '/api/people/:path*',
  ],
};
