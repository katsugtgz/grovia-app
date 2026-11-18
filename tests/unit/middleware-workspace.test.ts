import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import {
  DEFAULT_AUTH_REDIRECT,
  SESSION_COOKIE_NAME,
  getSafeRedirectTarget,
  sanitizeNextPath,
  signSessionToken,
} from '@/lib/auth-edge';
import { config as middlewareConfig, middleware } from '@/middleware';

const BASE_URL = 'http://localhost:3000';

const DEMO_USER = {
  id: 1,
  email: 'admin@grovia.io',
  name: 'Alex Rivera',
  role: 'admin',
};

function buildRequest(
  pathnameAndSearch: string,
  options?: {
    method?: string;
    token?: string;
    headers?: Record<string, string>;
  }
): NextRequest {
  const headers = new Headers(options?.headers);
  if (options?.token !== undefined) {
    headers.set('cookie', `${SESSION_COOKIE_NAME}=${options.token}`);
  }
  return new NextRequest(new URL(pathnameAndSearch, BASE_URL), {
    method: options?.method ?? 'GET',
    headers,
  });
}

function isPassThrough(response: Response): boolean {
  return response.status === 200 && response.headers.get('x-middleware-next') === '1';
}

describe('Unit — M3 Edge Middleware & Hardened Open-Redirect Sanitization', () => {
  describe('sanitizeNextPath Hardening (Bounded decodeURIComponent & /login Loop Guard)', () => {
    test('preserves valid relative workspace paths, query strings, and hashes', () => {
      expect(sanitizeNextPath('/workspace')).toBe('/workspace');
      expect(sanitizeNextPath('  /workspace/payroll  ')).toBe('/workspace/payroll');
      expect(sanitizeNextPath('/workspace?tab=people')).toBe('/workspace?tab=people');
      expect(sanitizeNextPath('/workspace?tab=people#roster')).toBe(
        '/workspace?tab=people#roster'
      );
      expect(getSafeRedirectTarget('/workspace?filter=eng%20ops')).toBe(
        '/workspace?filter=eng%20ops'
      );
    });

    test('rejects protocol-relative, backslash, absolute URL, and script scheme targets', () => {
      const vectors = [
        '//evil.com',
        '///evil.com',
        '//evil.com/workspace',
        '/\\evil.com',
        '\\evil.com',
        '/workspace\\evil',
        'https://evil.com',
        'http://evil.com/workspace',
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'vbscript:msgbox(1)',
        'evil.com/workspace',
      ];

      for (const vector of vectors) {
        expect(sanitizeNextPath(vector)).toBe(DEFAULT_AUTH_REDIRECT);
      }
    });

    test('rejects single, double, triple, and over-nested percent-encoded open-redirect payloads', () => {
      const encodedVectors = [
        '/%2fevil.com',
        '/%2f/evil.com',
        '/%2f%2fevil.com',
        '%2f%2fevil.com',
        '/%5cevil.com',
        '/%5c/evil.com',
        '/%252fevil.com',
        '/%252f%252fevil.com',
        '/%255cevil.com',
        '/%25252fevil.com',
        '/%25252f%25252fevil.com',
        '/%25255cevil.com',
        '/%2525252fevil.com',
        '/%E0%A4%A',
        '/%zz',
      ];

      for (const vector of encodedVectors) {
        expect(sanitizeNextPath(vector)).toBe(DEFAULT_AUTH_REDIRECT);
      }
    });

    test('rejects raw and percent-encoded control characters across decode passes', () => {
      const controlVectors = [
        '/workspace\n',
        '/workspace\r\n',
        '/\t/evil.com',
        '/\u0000evil.com',
        '/\u001fevil.com',
        '/\u007fevil.com',
        '/%00evil.com',
        '/%09/evil.com',
        '/%0a/evil.com',
        '/%0d/evil.com',
        '/%2500evil.com',
        '/%250d%250aevil.com',
        '/%252500evil.com',
      ];

      for (const vector of controlVectors) {
        expect(sanitizeNextPath(vector)).toBe(DEFAULT_AUTH_REDIRECT);
      }
    });

    test('rejects /login and /login?... targets to prevent self-redirect loops', () => {
      const loginTargets = [
        '/login',
        '/login/',
        '/login?next=/workspace',
        '/login?next=%2Fworkspace#form',
        '/login/callback',
        '/LOGIN',
        '/%6cogin',
        '/%6cogin?next=/workspace',
        '/%256cogin',
        '/%25256cogin',
      ];

      for (const target of loginTargets) {
        expect(sanitizeNextPath(target)).toBe(DEFAULT_AUTH_REDIRECT);
      }
    });

    test('falls back safely on non-string or blank inputs', () => {
      expect(sanitizeNextPath('')).toBe('/workspace');
      expect(sanitizeNextPath('   ')).toBe('/workspace');
      expect(sanitizeNextPath(null)).toBe('/workspace');
      expect(sanitizeNextPath(undefined)).toBe('/workspace');
      expect(sanitizeNextPath(42)).toBe('/workspace');
      expect(sanitizeNextPath({ next: '/workspace' })).toBe('/workspace');
      expect(sanitizeNextPath(null, '/custom')).toBe('/custom');
    });
  });

  describe('Edge Compatibility & Matcher Configuration', () => {
    test('middleware.ts imports only Web Crypto / Edge modules and no Node or SQLite dependencies', () => {
      const middlewareSource = fs.readFileSync(
        path.resolve(process.cwd(), 'middleware.ts'),
        'utf8'
      );

      expect(middlewareSource).toContain('@/lib/auth-edge');
      expect(middlewareSource).not.toContain('@/lib/auth\'');
      expect(middlewareSource).not.toContain('@/lib/auth"');
      expect(middlewareSource).not.toContain('node:crypto');
      expect(middlewareSource).not.toContain('bun:sqlite');
      expect(middlewareSource).not.toContain('@/lib/db');
    });

    test('exports config.matcher scoped to /workspace, /login, and protected API prefixes', () => {
      expect(Array.isArray(middlewareConfig.matcher)).toBe(true);
      expect(middlewareConfig.matcher).toContain('/workspace/:path*');
      expect(middlewareConfig.matcher).toContain('/login');
      expect(middlewareConfig.matcher).toContain('/api/waitlist/:path*');
      expect(middlewareConfig.matcher).toContain('/api/inquiries/:path*');
      expect(middlewareConfig.matcher).toContain('/api/metrics/:path*');
      expect(middlewareConfig.matcher).toContain('/api/people/:path*');

      expect(middlewareConfig.matcher).not.toContain('/');
      expect(middlewareConfig.matcher).not.toContain('/api/health');
      expect(middlewareConfig.matcher).not.toContain('/api/roi');
      expect(middlewareConfig.matcher).not.toContain('/api/auth/:path*');
    });
  });

  describe('Access Control Matrix — Page Routes (/, /login, /workspace*)', () => {
    test('GET / stays public for both unauthenticated and authenticated requests', async () => {
      const token = await signSessionToken(DEMO_USER);

      const unauthRes = await middleware(buildRequest('/'));
      expect(isPassThrough(unauthRes)).toBe(true);

      const authRes = await middleware(buildRequest('/', { token }));
      expect(isPassThrough(authRes)).toBe(true);
    });

    test('GET /workspace and /workspace/* redirect 307 to /login?next=... when unauthenticated or invalid cookie', async () => {
      const expiredToken = await signSessionToken(DEMO_USER, -10);

      for (const badToken of [undefined, '', 'invalid.token', expiredToken]) {
        const rootRes = await middleware(buildRequest('/workspace', { token: badToken }));
        expect(rootRes.status).toBe(307);
        const rootLoc = new URL(rootRes.headers.get('location') ?? '', BASE_URL);
        expect(rootLoc.pathname).toBe('/login');
        expect(rootLoc.searchParams.get('next')).toBe('/workspace');
      }

      const deepRes = await middleware(buildRequest('/workspace/payroll?tab=summary'));
      expect(deepRes.status).toBe(307);
      const deepLoc = new URL(deepRes.headers.get('location') ?? '', BASE_URL);
      expect(deepLoc.pathname).toBe('/login');
      expect(deepLoc.searchParams.get('next')).toBe('/workspace/payroll?tab=summary');
    });

    test('GET /workspace and /workspace/* pass through when authenticated', async () => {
      const token = await signSessionToken(DEMO_USER);

      const rootRes = await middleware(buildRequest('/workspace', { token }));
      expect(isPassThrough(rootRes)).toBe(true);

      const subRes = await middleware(buildRequest('/workspace/people?team=eng', { token }));
      expect(isPassThrough(subRes)).toBe(true);
    });

    test('GET /login passes through when unauthenticated and redirects 307 to sanitized next when authenticated', async () => {
      const unauthLogin = await middleware(buildRequest('/login?next=%2Fworkspace'));
      expect(isPassThrough(unauthLogin)).toBe(true);

      const token = await signSessionToken(DEMO_USER);

      // Default redirect -> /workspace
      const defaultRes = await middleware(buildRequest('/login', { token }));
      expect(defaultRes.status).toBe(307);
      const defaultLoc = new URL(defaultRes.headers.get('location') ?? '', BASE_URL);
      expect(defaultLoc.pathname).toBe('/workspace');
      expect(defaultLoc.search).toBe('');

      // Safe relative next with query -> preserved
      const safeRes = await middleware(
        buildRequest(`/login?next=${encodeURIComponent('/workspace?tab=people')}`, { token })
      );
      expect(safeRes.status).toBe(307);
      const safeLoc = new URL(safeRes.headers.get('location') ?? '', BASE_URL);
      expect(safeLoc.pathname).toBe('/workspace');
      expect(safeLoc.searchParams.get('next')).toBeNull();
      expect(safeLoc.searchParams.get('tab')).toBe('people');

      // Malicious & self-loop next values -> sanitized to /workspace
      for (const badNext of [
        '//evil.com',
        '/%5cevil.com',
        '/%252fevil.com',
        'https://evil.com/phish',
        '/login',
        '/login?next=/workspace',
      ]) {
        const res = await middleware(
          buildRequest(`/login?next=${encodeURIComponent(badNext)}`, { token })
        );
        expect(res.status).toBe(307);
        const loc = new URL(res.headers.get('location') ?? '', BASE_URL);
        expect(loc.origin).toBe(BASE_URL);
        expect(loc.pathname).toBe('/workspace');
        expect(loc.search).toBe('');
      }
    });
  });

  describe('Access Control Matrix — Public vs Protected API Routes', () => {
    test('public APIs (/api/health, POST /api/roi, POST /api/waitlist, /api/auth/*) pass through with or without auth', async () => {
      const token = await signSessionToken(DEMO_USER);
      const publicCases: Array<{ method: string; path: string }> = [
        { method: 'GET', path: '/api/health' },
        { method: 'POST', path: '/api/roi' },
        { method: 'POST', path: '/api/waitlist' },
        { method: 'POST', path: '/api/auth/login' },
        { method: 'POST', path: '/api/auth/logout' },
        { method: 'GET', path: '/api/auth/session' },
      ];

      for (const { method, path: apiPath } of publicCases) {
        const unauthRes = await middleware(buildRequest(apiPath, { method }));
        expect(isPassThrough(unauthRes)).toBe(true);

        const authRes = await middleware(buildRequest(apiPath, { method, token }));
        expect(isPassThrough(authRes)).toBe(true);
      }
    });

    test('protected APIs return 401 JSON when unauthenticated, tampered, or expired (even with Accept: text/html)', async () => {
      const expiredToken = await signSessionToken(DEMO_USER, -5);
      const validToken = await signSessionToken(DEMO_USER);
      const [payloadB64, sigB64] = validToken.split('.');
      const tamperedToken = `${payloadB64}.${sigB64.slice(0, -1)}${sigB64.endsWith('A') ? 'B' : 'A'}`;

      const protectedCases: Array<{ method: string; path: string }> = [
        { method: 'GET', path: '/api/waitlist' },
        { method: 'PUT', path: '/api/waitlist' },
        { method: 'DELETE', path: '/api/waitlist' },
        { method: 'GET', path: '/api/inquiries' },
        { method: 'POST', path: '/api/inquiries' },
        { method: 'PATCH', path: '/api/inquiries' },
        { method: 'PATCH', path: '/api/inquiries/GROV-1001' },
        { method: 'GET', path: '/api/metrics' },
        { method: 'GET', path: '/api/people' },
        { method: 'POST', path: '/api/people' },
      ];

      for (const { method, path: apiPath } of protectedCases) {
        for (const badToken of [undefined, 'malformed', tamperedToken, expiredToken]) {
          const res = await middleware(
            buildRequest(apiPath, {
              method,
              token: badToken,
              headers: { Accept: 'text/html,application/xhtml+xml' },
            })
          );

          expect(res.status).toBe(401);
          expect(res.headers.get('content-type')?.toLowerCase()).toContain('application/json');
          expect(res.headers.get('cache-control')).toContain('no-store');
          expect(res.headers.get('location')).toBeNull();

          const body = await res.json();
          expect(body).toEqual({
            success: false,
            authenticated: false,
            error: 'Authentication required',
          });
        }
      }
    });

    test('protected APIs pass through when authenticated with valid grovia_session cookie', async () => {
      const token = await signSessionToken(DEMO_USER);

      const protectedCases: Array<{ method: string; path: string }> = [
        { method: 'GET', path: '/api/waitlist' },
        { method: 'GET', path: '/api/inquiries' },
        { method: 'POST', path: '/api/inquiries' },
        { method: 'PATCH', path: '/api/inquiries' },
        { method: 'PATCH', path: '/api/inquiries/GROV-1001' },
        { method: 'GET', path: '/api/metrics' },
        { method: 'GET', path: '/api/people' },
        { method: 'POST', path: '/api/people' },
      ];

      for (const { method, path: apiPath } of protectedCases) {
        const res = await middleware(buildRequest(apiPath, { method, token }));
        expect(isPassThrough(res)).toBe(true);
      }
    });
  });
});
