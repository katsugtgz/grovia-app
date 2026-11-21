import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'bun:test';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hashPassword, verifyPassword } from '@/lib/password';
import { parseJsonBody } from '@/lib/api-helpers';
import {
  AdmittedLoginReservation,
  LOGIN_WINDOW_MS,
  MAX_CONCURRENT_PASSWORD_VERIFICATIONS,
  MAX_FAILED_IP_ATTEMPTS,
  MAX_FAILED_LOGIN_ATTEMPTS,
  extractClientIp,
  failLoginAttemptReservation,
  getLoginAttemptBucketCount,
  releaseLoginAttempt,
  releasePasswordVerificationSlot,
  reserveLoginAttempt,
  reservePasswordVerificationSlot,
  resetLoginAttemptTracker,
  rollbackLoginAttemptReservation,
} from '@/lib/login-rate-limit';
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  clearRevokedSessionTokens,
  getSafeRedirectTarget,
  isHttpsRequest,
  parseCookieValue,
  sanitizeNextPath,
  signSessionToken,
  verifySessionToken,
} from '@/lib/auth-edge';
import {
  closeDb,
  findUserByEmail,
  getConfiguredAdminEmail,
  getDb,
  initDatabase,
} from '@/lib/db';
import { createTestClient, resetDatabase } from '../e2e/harness/test-client';
import * as loginRoute from '@/app/api/auth/login/route';
import * as logoutRoute from '@/app/api/auth/logout/route';
import * as sessionRoute from '@/app/api/auth/session/route';
import * as peopleRoute from '@/app/api/people/route';

describe('Unit & Contract — M1 Auth, People & API Access Control', () => {
  const tempDbPath = path.resolve(process.cwd(), 'test-unit-auth-api.db');
  const client = createTestClient(undefined, { directOnly: true });

  let prevDbPath: string | undefined;
  let prevDatabasePath: string | undefined;
  let prevDatabaseUrl: string | undefined;
  let prevAllowDemoAdmin: string | undefined;

  beforeAll(() => {
    prevDbPath = process.env.DB_PATH;
    prevDatabasePath = process.env.DATABASE_PATH;
    prevDatabaseUrl = process.env.DATABASE_URL;
    prevAllowDemoAdmin = process.env.ALLOW_DEMO_ADMIN;

    for (const file of [tempDbPath, `${tempDbPath}-wal`, `${tempDbPath}-shm`]) {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    }

    process.env.DB_PATH = tempDbPath;
    process.env.ALLOW_DEMO_ADMIN = '1';
    delete process.env.DATABASE_PATH;
    delete process.env.DATABASE_URL;

    initDatabase(tempDbPath);
  });

  beforeEach(() => {
    client.clearAuth();
    resetDatabase(tempDbPath);
  });

  afterAll(() => {
    client.clearAuth();
    closeDb();

    for (const file of [tempDbPath, `${tempDbPath}-wal`, `${tempDbPath}-shm`]) {
      if (fs.existsSync(file)) {
        try {
          fs.unlinkSync(file);
        } catch {}
      }
    }

    if (prevDbPath !== undefined) process.env.DB_PATH = prevDbPath;
    else delete process.env.DB_PATH;
    if (prevDatabasePath !== undefined) process.env.DATABASE_PATH = prevDatabasePath;
    else delete process.env.DATABASE_PATH;
    if (prevDatabaseUrl !== undefined) process.env.DATABASE_URL = prevDatabaseUrl;
    else delete process.env.DATABASE_URL;
    if (prevAllowDemoAdmin !== undefined) process.env.ALLOW_DEMO_ADMIN = prevAllowDemoAdmin;
    else delete process.env.ALLOW_DEMO_ADMIN;
  });

  describe('Password Hashing (lib/password.ts)', () => {
    test('produces unique salted scrypt hashes with explicit cost params and verifies matching password', async () => {
      const hashA = hashPassword('grovia-demo-2026');
      const hashB = hashPassword('grovia-demo-2026');

      expect(hashA).not.toBe(hashB);
      expect(hashA.startsWith('scrypt:16384:8:1:')).toBe(true);
      expect(await verifyPassword('grovia-demo-2026', hashA)).toBe(true);
      expect(await verifyPassword('grovia-demo-2026', hashB)).toBe(true);
      expect(await verifyPassword('wrong-password', hashA)).toBe(false);
    });

    test('handles malformed, empty, or wrong-length hashes safely without throwing', async () => {
      expect(() => hashPassword('')).toThrow();
      expect(await verifyPassword('', 'scrypt:abc:def')).toBe(false);
      expect(await verifyPassword('password', '')).toBe(false);
      expect(await verifyPassword('password', 'invalid-format')).toBe(false);
      expect(await verifyPassword('password', 'bcrypt:abc:def')).toBe(false);
      expect(await verifyPassword('password', 'scrypt:nothex!:abcd')).toBe(false);
      expect(await verifyPassword('password', 'scrypt:abcd:1234')).toBe(false);
    });

    test('rejects scrypt costs that exceed 64 MiB after working buffers are included', async () => {
      const hash = `scrypt:65536:8:1:${'aa'.repeat(16)}:${'bb'.repeat(64)}`;
      expect(await verifyPassword('password', hash)).toBe(false);
    });
  });

  describe('Edge Token, Redirect & Request Helpers (lib/auth-edge.ts)', () => {
    test('signSessionToken and verifySessionToken round-trip user claims', async () => {
      const token = await signSessionToken({
        id: 1,
        email: 'admin@grovia.io',
        name: 'Alex Rivera',
        role: 'admin',
      });

      const verified = await verifySessionToken(token);
      expect(verified).not.toBeNull();
      expect(verified?.id).toBe(1);
      expect(verified?.email).toBe('admin@grovia.io');
      expect(verified?.name).toBe('Alex Rivera');
      expect(verified?.role).toBe('admin');
      expect(typeof verified?.iat).toBe('number');
      expect(typeof verified?.exp).toBe('number');
      expect((verified?.exp ?? 0) > (verified?.iat ?? 0)).toBe(true);
    });

    test('rejects tampered payload, tampered signature, malformed tokens, and expired tokens', async () => {
      const token = await signSessionToken({
        id: 1,
        email: 'admin@grovia.io',
        name: 'Alex Rivera',
        role: 'admin',
      });
      const [payloadB64, sigB64] = token.split('.');

      const flipMiddleChar = (segment: string): string => {
        const mid = Math.floor(segment.length / 2);
        const replacement = segment[mid] === 'A' ? 'B' : 'A';
        return `${segment.slice(0, mid)}${replacement}${segment.slice(mid + 1)}`;
      };

      // Tamper guaranteed non-padding payload & signature characters
      const tamperedPayload = `${flipMiddleChar(payloadB64)}.${sigB64}`;
      expect(await verifySessionToken(tamperedPayload)).toBeNull();

      const tamperedSig = `${payloadB64}.${flipMiddleChar(sigB64)}`;
      expect(await verifySessionToken(tamperedSig)).toBeNull();

      // Malformed
      expect(await verifySessionToken('')).toBeNull();
      expect(await verifySessionToken(null)).toBeNull();
      expect(await verifySessionToken(undefined)).toBeNull();
      expect(await verifySessionToken('a')).toBeNull();
      expect(await verifySessionToken('a.b.c')).toBeNull();
      expect(await verifySessionToken('bad!chars.sig')).toBeNull();

      // Expired
      const expired = await signSessionToken(
        { id: 1, email: 'admin@grovia.io', name: 'Alex Rivera', role: 'admin' },
        -1
      );
      expect(await verifySessionToken(expired)).toBeNull();
    });

    test('rejects non-canonical Base64url trailing padding-bit mutations on signature and payload', async () => {
      const BASE64URL_ALPHABET =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

      const token = await signSessionToken({
        id: 1,
        email: 'admin@grovia.io',
        name: 'Alex Rivera',
        role: 'admin',
      });
      const [payloadB64, sigB64] = token.split('.');
      expect(sigB64.length).toBe(43);

      // 43-char Base64url encoding of 32 bytes has 2 unused trailing bits (bits 0..1)
      const sigLastIdx = BASE64URL_ALPHABET.indexOf(sigB64[sigB64.length - 1]);
      expect(sigLastIdx & 0b11).toBe(0);

      for (const mask of [0b01, 0b10, 0b11]) {
        const mutatedSigChar = BASE64URL_ALPHABET[sigLastIdx ^ mask];
        const nonCanonicalSigToken = `${payloadB64}.${sigB64.slice(0, -1)}${mutatedSigChar}`;
        expect(await verifySessionToken(nonCanonicalSigToken)).toBeNull();
      }

      // Also verify non-canonical trailing padding bits on payload segment
      let padToken = await signSessionToken({
        id: 1,
        email: 'pad@grovia.io',
        name: 'Pad',
        role: 'admin',
      });
      if (padToken.split('.')[0].length % 4 === 0) {
        padToken = await signSessionToken({
          id: 1,
          email: 'pad@grovia.io',
          name: 'Pad1',
          role: 'admin',
        });
      }
      const [padPayloadB64, padSigB64] = padToken.split('.');
      expect(padPayloadB64.length % 4).not.toBe(0);
      const payloadLastIdx = BASE64URL_ALPHABET.indexOf(
        padPayloadB64[padPayloadB64.length - 1]
      );
      const nonCanonicalPayloadToken = `${padPayloadB64.slice(0, -1)}${BASE64URL_ALPHABET[payloadLastIdx ^ 1]}.${padSigB64}`;
      expect(await verifySessionToken(nonCanonicalPayloadToken)).toBeNull();
    });

    test('fails closed in production without env secrets, uses fallback in non-production, and ignores whitespace-only AUTH_SECRET', async () => {
      const mutableEnv = process.env as Record<string, string | undefined>;
      const prevAuth = process.env.AUTH_SECRET;
      const prevSess = process.env.SESSION_SECRET;
      const prevNodeEnv = mutableEnv.NODE_ENV;
      delete process.env.AUTH_SECRET;
      delete process.env.SESSION_SECRET;

      try {
        // Non-production (test) falls back to dev secret for CI/local runs
        mutableEnv.NODE_ENV = 'test';
        const fallbackToken = await signSessionToken({
          id: 42,
          email: 'ci@grovia.io',
          name: 'CI Runner',
          role: 'admin',
        });
        const decoded = await verifySessionToken(fallbackToken);
        expect(decoded?.id).toBe(42);
        expect(decoded?.email).toBe('ci@grovia.io');

        // Production without AUTH_SECRET or SESSION_SECRET must fail closed
        mutableEnv.NODE_ENV = 'production';
        await expect(
          signSessionToken({
            id: 42,
            email: 'ci@grovia.io',
            name: 'CI Runner',
            role: 'admin',
          })
        ).rejects.toThrow('AUTH_SECRET or SESSION_SECRET must be configured in production');
        expect(await verifySessionToken(fallbackToken)).toBeNull();

        // Restore non-production for whitespace-only AUTH_SECRET fallback checks
        mutableEnv.NODE_ENV = 'test';

        // Whitespace-only AUTH_SECRET must fall back to SESSION_SECRET, not DEV_FALLBACK_SECRET
        process.env.AUTH_SECRET = '   ';
        process.env.SESSION_SECRET = 'session-secret-alpha';
        const sessionToken = await signSessionToken({
          id: 7,
          email: 'sess@grovia.io',
          name: 'Session User',
          role: 'admin',
        });
        expect(await verifySessionToken(fallbackToken)).toBeNull();

        delete process.env.AUTH_SECRET;
        const verifiedWithSession = await verifySessionToken(sessionToken);
        expect(verifiedWithSession?.id).toBe(7);

        // Non-whitespace secret preserves exact bytes (not trimmed)
        process.env.AUTH_SECRET = '  exact-spaces-secret  ';
        const exactToken = await signSessionToken({
          id: 8,
          email: 'exact@grovia.io',
          name: 'Exact User',
          role: 'admin',
        });
        process.env.AUTH_SECRET = 'exact-spaces-secret';
        expect(await verifySessionToken(exactToken)).toBeNull();
      } finally {
        if (prevNodeEnv !== undefined) mutableEnv.NODE_ENV = prevNodeEnv;
        else delete mutableEnv.NODE_ENV;
        if (prevAuth !== undefined) process.env.AUTH_SECRET = prevAuth;
        else delete process.env.AUTH_SECRET;
        if (prevSess !== undefined) process.env.SESSION_SECRET = prevSess;
        else delete process.env.SESSION_SECRET;
      }
    });

    test('sanitizeNextPath prevents open redirects while preserving valid relative targets', () => {
      expect(sanitizeNextPath('/workspace')).toBe('/workspace');
      expect(sanitizeNextPath('/workspace?tab=people#top')).toBe('/workspace?tab=people#top');
      expect(getSafeRedirectTarget('  /workspace/payroll  ')).toBe('/workspace/payroll');

      expect(sanitizeNextPath('//evil.com')).toBe('/workspace');
      expect(sanitizeNextPath('/\\evil.com')).toBe('/workspace');
      expect(sanitizeNextPath('/foo\\bar')).toBe('/workspace');
      expect(sanitizeNextPath('https://evil.com/workspace')).toBe('/workspace');
      expect(sanitizeNextPath('javascript:alert(1)')).toBe('/workspace');
      expect(sanitizeNextPath('/bad\npath')).toBe('/workspace');
      expect(sanitizeNextPath('')).toBe('/workspace');
      expect(sanitizeNextPath(null)).toBe('/workspace');
      expect(sanitizeNextPath(123)).toBe('/workspace');
    });

    test('parseCookieValue and isHttpsRequest handle headers and protocols accurately', () => {
      expect(parseCookieValue(`foo=1; ${SESSION_COOKIE_NAME}=tok.sig; bar=2`, SESSION_COOKIE_NAME)).toBe(
        'tok.sig'
      );
      expect(parseCookieValue('foo=1', SESSION_COOKIE_NAME)).toBeNull();
      expect(parseCookieValue(null, SESSION_COOKIE_NAME)).toBeNull();

      expect(isHttpsRequest(new Request('http://localhost:3000/api/auth/login'))).toBe(false);
      expect(isHttpsRequest(new Request('https://app.grovia.io/api/auth/login'))).toBe(true);
      expect(
        isHttpsRequest(
          new Request('http://localhost:3000/api/auth/login', {
            headers: { 'x-forwarded-proto': 'https' },
          })
        )
      ).toBe(true);
      expect(
        isHttpsRequest(
          new Request('https://localhost:3000/api/auth/login', {
            headers: { 'x-forwarded-proto': 'http' },
          })
        )
      ).toBe(false);
    });
  });

  describe('Secure Cookie Flag Behavior (Login & Logout)', () => {
    test('omits Secure on http://localhost even when NODE_ENV=production, sets Secure on HTTPS', async () => {
      const mutableEnv = process.env as Record<string, string | undefined>;
      const prevNodeEnv = mutableEnv.NODE_ENV;
      const prevAuthSecret = mutableEnv.AUTH_SECRET;
      mutableEnv.NODE_ENV = 'production';
      mutableEnv.AUTH_SECRET = 'unit-test-production-cookie-secret';

      try {
        // 1. Local HTTP request -> NO Secure attribute
        const httpLoginRes = await loginRoute.POST(
          new Request('http://localhost:3000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: 'admin@grovia.io',
              password: 'grovia-demo-2026',
            }),
          })
        );
        expect(httpLoginRes.status).toBe(200);
        const httpCookie = httpLoginRes.headers.get('set-cookie') || '';
        expect(httpCookie).toContain(`${SESSION_COOKIE_NAME}=`);
        expect(httpCookie.toLowerCase()).toContain('httponly');
        expect(httpCookie.toLowerCase()).toContain('samesite=lax');
        expect(httpCookie).toContain('Path=/');
        expect(httpCookie).toContain('Max-Age=86400');
        expect(httpCookie.toLowerCase()).not.toContain('; secure');

        // 2. HTTPS URL -> includes Secure
        const httpsLoginRes = await loginRoute.POST(
          new Request('https://app.grovia.io/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: 'admin@grovia.io',
              password: 'grovia-demo-2026',
            }),
          })
        );
        const httpsCookie = httpsLoginRes.headers.get('set-cookie') || '';
        expect(httpsCookie.toLowerCase()).toContain('secure');

        // 3. x-forwarded-proto: https -> includes Secure
        const proxiedLoginRes = await loginRoute.POST(
          new Request('http://localhost:3000/api/auth/login', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-forwarded-proto': 'https',
            },
            body: JSON.stringify({
              email: 'admin@grovia.io',
              password: 'grovia-demo-2026',
            }),
          })
        );
        const proxiedCookie = proxiedLoginRes.headers.get('set-cookie') || '';
        expect(proxiedCookie.toLowerCase()).toContain('secure');

        // 4. Logout matches protocol rule too
        const httpLogoutRes = await logoutRoute.POST(
          new Request('http://localhost:3000/api/auth/logout', { method: 'POST' })
        );
        const httpLogoutCookie = httpLogoutRes.headers.get('set-cookie') || '';
        expect(httpLogoutCookie).toContain('Max-Age=0');
        expect(httpLogoutCookie.toLowerCase()).not.toContain('; secure');

        const httpsLogoutRes = await logoutRoute.POST(
          new Request('https://app.grovia.io/api/auth/logout', { method: 'POST' })
        );
        const httpsLogoutCookie = httpsLogoutRes.headers.get('set-cookie') || '';
        expect(httpsLogoutCookie).toContain('Max-Age=0');
        expect(httpsLogoutCookie.toLowerCase()).toContain('secure');
      } finally {
        if (prevNodeEnv !== undefined) mutableEnv.NODE_ENV = prevNodeEnv;
        else delete mutableEnv.NODE_ENV;
        if (prevAuthSecret !== undefined) mutableEnv.AUTH_SECRET = prevAuthSecret;
        else delete mutableEnv.AUTH_SECRET;
      }
    });
  });

  describe('Auth Endpoints (/api/auth/login, /logout, /session)', () => {
    test('POST /api/auth/login authenticates seeded admin and supports case-insensitive padded email', async () => {
      // Seed a recorded failure for this identity, then prove a successful
      // sign-in clears the completed failure counters (next burst starts at 0).
      resetLoginAttemptTracker();
      for (let i = 0; i < 3; i += 1) {
        const failed = reserveLoginAttempt(null, 'admin@grovia.io', Date.now());
        expect(failed.limited).toBe(false);
        if (!failed.limited) failLoginAttemptReservation(failed);
      }
      const res = await client.post('/api/auth/login', {
        email: 'admin@grovia.io',
        password: 'grovia-demo-2026',
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.user).toEqual({
        id: expect.any(Number),
        email: 'admin@grovia.io',
        name: 'Alex Rivera',
        role: 'admin',
      });
      expect(res.data.user.password_hash).toBeUndefined();
      expect(client.getCookie(SESSION_COOKIE_NAME)).toBeDefined();
      // Success cleared the recorded failures: a fresh burst has the full
      // threshold available again.
      for (let i = 0; i < MAX_FAILED_LOGIN_ATTEMPTS; i += 1) {
        expect(reserveLoginAttempt(null, 'admin@grovia.io').limited).toBe(false);
      }
      expect(reserveLoginAttempt(null, 'admin@grovia.io').limited).toBe(true);
      resetLoginAttemptTracker();

      client.clearAuth();
      const paddedRes = await client.post('/api/auth/login', {
        email: '  ADMIN@GROVIA.IO ',
        password: 'grovia-demo-2026',
      });
      expect(paddedRes.status).toBe(200);
      expect(paddedRes.data.user.email).toBe('admin@grovia.io');
    });

    test('POST /api/auth/login rejects invalid credentials with 401 and no Set-Cookie', async () => {
      const wrongPass = await client.post('/api/auth/login', {
        email: 'admin@grovia.io',
        password: 'not-the-password',
      });
      expect(wrongPass.status).toBe(401);
      expect(wrongPass.data).toEqual({
        success: false,
        error: 'Invalid email or password',
      });
      expect(wrongPass.headers.get('set-cookie')).toBeNull();

      const unknownUser = await client.post('/api/auth/login', {
        email: 'nobody@grovia.io',
        password: 'grovia-demo-2026',
      });
      expect(unknownUser.status).toBe(401);
      expect(unknownUser.data.error).toBe('Invalid email or password');
    });

    test('POST /api/auth/login validates JSON and schema (400) and unsupported methods (405)', async () => {
      expect((await client.post('/api/auth/login', '{bad-json')).status).toBe(400);
      expect((await client.post('/api/auth/login')).status).toBe(400);
      expect((await client.post('/api/auth/login', { email: 'admin@grovia.io' })).status).toBe(400);
      expect(
        (await client.post('/api/auth/login', { email: 'not-an-email', password: 'abc' })).status
      ).toBe(400);

      for (const fn of [loginRoute.GET, loginRoute.PUT, loginRoute.DELETE, loginRoute.PATCH]) {
        const res = await fn();
        expect(res.status).toBe(405);
        expect(res.headers.get('allow')).toContain('POST');
      }
    });

    test('GET /api/auth/session and POST /api/auth/logout lifecycle', async () => {
      // Unauthenticated -> 401
      const unauthRes = await client.get('/api/auth/session');
      expect(unauthRes.status).toBe(401);
      expect(unauthRes.data).toEqual({
        success: false,
        authenticated: false,
        error: 'Authentication required',
      });

      // Login -> session 200
      await client.loginAsAdmin();
      const authRes = await client.get('/api/auth/session');
      expect(authRes.status).toBe(200);
      expect(authRes.data).toEqual({
        success: true,
        authenticated: true,
        user: {
          id: expect.any(Number),
          email: 'admin@grovia.io',
          name: 'Alex Rivera',
          role: 'admin',
        },
      });

      // Logout -> clears cookie -> session 401
      const logoutRes = await client.logout();
      expect(logoutRes.status).toBe(200);
      expect(logoutRes.data).toEqual({ success: true });
      const setCookie = logoutRes.headers.get('set-cookie') || '';
      expect(setCookie).toContain('Max-Age=0');
      expect(setCookie).toContain('Path=/');

      const afterLogout = await client.get('/api/auth/session');
      expect(afterLogout.status).toBe(401);

      // Tampered & expired cookies -> 401
      client.setCookie(SESSION_COOKIE_NAME, 'tampered.token');
      expect((await client.get('/api/auth/session')).status).toBe(401);

      const expiredToken = await signSessionToken(
        { id: 1, email: 'admin@grovia.io', name: 'Alex Rivera', role: 'admin' },
        -10
      );
      client.setCookie(SESSION_COOKIE_NAME, expiredToken);
      expect((await client.get('/api/auth/session')).status).toBe(401);

      // Unsupported methods -> 405
      for (const fn of [sessionRoute.POST, sessionRoute.PUT, sessionRoute.DELETE, sessionRoute.PATCH]) {
        const res = await fn();
        expect(res.status).toBe(405);
        expect(res.headers.get('allow')).toContain('GET');
      }
      for (const fn of [logoutRoute.GET, logoutRoute.PUT, logoutRoute.DELETE, logoutRoute.PATCH]) {
        const res = await fn();
        expect(res.status).toBe(405);
        expect(res.headers.get('allow')).toContain('POST');
      }
    });
  });

  describe('API Access Control Matrix (Public vs Protected)', () => {
    test('rejects unauthenticated requests to protected endpoints with 401 even before body validation', async () => {
      expect((await client.get('/api/waitlist')).status).toBe(401);
      expect((await client.get('/api/inquiries')).status).toBe(401);
      expect((await client.post('/api/inquiries')).status).toBe(401); // empty body -> still 401
      expect((await client.patch('/api/inquiries', {})).status).toBe(401);
      expect((await client.patch('/api/inquiries/GROV-1001', {})).status).toBe(401);
      expect((await client.get('/api/metrics')).status).toBe(401);
      expect((await client.get('/api/people')).status).toBe(401);
      expect((await client.post('/api/people')).status).toBe(401); // empty body -> still 401
    });

    test('keeps public visitor endpoints accessible without authentication', async () => {
      const healthRes = await client.get('/api/health');
      expect(healthRes.status).toBe(200);

      const roiRes = await client.post('/api/roi', {
        monthlyTraffic: 50000,
        conversionRate: 2.5,
        averageOrderValue: 120,
      });
      expect(roiRes.status).toBe(200);

      const waitlistEmail = `visitor_${Date.now()}@example.com`;
      const waitlistNew = await client.post('/api/waitlist', {
        name: 'Public Visitor',
        email: waitlistEmail,
      });
      expect(waitlistNew.status).toBe(201);

      const waitlistDup = await client.post('/api/waitlist', {
        name: 'Public Visitor',
        email: waitlistEmail,
      });
      expect(waitlistDup.status).toBe(409);
    });

    test('allows authenticated requests to all protected endpoints', async () => {
      await client.loginAsAdmin();

      expect((await client.get('/api/waitlist')).status).toBe(200);
      expect((await client.get('/api/metrics')).status).toBe(200);

      const createInq = await client.post('/api/inquiries', {
        name: 'Authed Lead',
        email: 'authed.lead@example.com',
        subject: 'Enterprise Trial',
        message: 'Testing authenticated inquiry creation in unit test.',
      });
      expect(createInq.status).toBe(201);
      const ticketId = createInq.data.ticketId;

      expect((await client.get('/api/inquiries')).status).toBe(200);
      expect(
        (await client.patch('/api/inquiries', { ticketId, status: 'in_progress' })).status
      ).toBe(200);
      expect(
        (await client.patch(`/api/inquiries/${ticketId}`, { status: 'resolved' })).status
      ).toBe(200);
    });
  });

  describe('People & Teammate Invite Endpoints (/api/people)', () => {
    test('GET /api/people returns seeded roster and POST /api/people persists new invited teammate', async () => {
      await client.loginAsAdmin();

      const listBefore = await client.get('/api/people');
      expect(listBefore.status).toBe(200);
      expect(listBefore.data.success).toBe(true);
      expect(Array.isArray(listBefore.data.people)).toBe(true);
      expect(listBefore.data.people.length).toBeGreaterThanOrEqual(10);
      expect(listBefore.data.count).toBe(listBefore.data.people.length);

      const inviteRes = await client.post('/api/people', {
        name: 'Jordan Lee',
        email: 'Jordan.Lee@Grovia.io',
        role: 'Staff Security Engineer',
        team: 'Engineering',
        city: 'San Francisco',
        rate: 85,
      });
      expect(inviteRes.status).toBe(201);
      expect(inviteRes.data.success).toBe(true);
      expect(inviteRes.data.person.name).toBe('Jordan Lee');
      expect(inviteRes.data.person.email).toBe('jordan.lee@grovia.io');
      expect(inviteRes.data.person.status).toBe('Invited');
      expect(inviteRes.data.person.city).toBe('San Francisco');
      expect(inviteRes.data.person.rate).toBe(85);

      const listAfter = await client.get('/api/people');
      expect(listAfter.status).toBe(200);
      expect(listAfter.data.count).toBe(listBefore.data.count + 1);
      expect(
        listAfter.data.people.some((p: any) => p.email === 'jordan.lee@grovia.io')
      ).toBe(true);
    });

    test('POST /api/people returns 409 on duplicate email (case-insensitive) and 400 on invalid payloads', async () => {
      await client.loginAsAdmin();

      // Seeded person duplicate (mixed case)
      const dupSeeded = await client.post('/api/people', {
        name: 'Dup Seeded',
        email: 'PERSON01@EXAMPLE.INVALID',
        role: 'Designer',
        team: 'Design',
      });
      expect(dupSeeded.status).toBe(409);
      expect(dupSeeded.data).toEqual({
        success: false,
        error: 'A team member with this email already exists',
      });

      // Newly invited duplicate (mixed case)
      const firstInvite = await client.post('/api/people', {
        name: 'Casey Morgan',
        email: 'casey@grovia.io',
        role: 'Analyst',
        team: 'Product',
      });
      expect(firstInvite.status).toBe(201);

      const dupInvited = await client.post('/api/people', {
        name: 'Casey Morgan 2',
        email: 'CASEY@GROVIA.IO',
        role: 'Analyst',
        team: 'Product',
      });
      expect(dupInvited.status).toBe(409);
      expect(dupInvited.data.error).toBe('A team member with this email already exists');

      // Validation errors -> 400
      expect((await client.post('/api/people', '{malformed')).status).toBe(400);
      expect((await client.post('/api/people', {})).status).toBe(400);
      expect(
        (
          await client.post('/api/people', {
            name: 'Bad Email',
            email: 'not-an-email',
            role: 'Engineer',
            team: 'Engineering',
          })
        ).status
      ).toBe(400);
      expect(
        (
          await client.post('/api/people', {
            name: 'Negative Rate',
            email: 'negrate@grovia.io',
            role: 'Engineer',
            team: 'Engineering',
            rate: -5,
          })
        ).status
      ).toBe(400);
    });

    test('PUT, DELETE, PATCH /api/people return 405 with Allow: GET, POST', async () => {
      for (const fn of [peopleRoute.PUT, peopleRoute.DELETE, peopleRoute.PATCH]) {
        const res = await fn();
        expect(res.status).toBe(405);
        expect(res.headers.get('allow')).toBe('GET, POST');
      }
    });
  });

  describe('Security & Hardening Helpers (parseJsonBody, login-rate-limit, jti & scrypt bounds)', () => {
    test('parseJsonBody enforces Content-Length, chunked byte limit, default 64KiB cap, and exact-limit payloads', async () => {
      // Exact limit succeeds
      const exactBody = JSON.stringify({ k: 'a'.repeat(100) });
      const exactBytes = Buffer.byteLength(exactBody, 'utf8');
      const exactRes = await parseJsonBody<{ k: string }>(
        new Request('http://localhost:3000/api/people', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: exactBody,
        }),
        exactBytes
      );
      expect(exactRes.error).toBeUndefined();
      expect(exactRes.data?.k.length).toBe(100);

      // Oversized declared Content-Length -> 413
      const declaredTooLarge = await parseJsonBody(
        new Request('http://localhost:3000/api/people', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': String(exactBytes + 1) },
          body: exactBody,
        }),
        exactBytes
      );
      expect(declaredTooLarge.error?.status).toBe(413);

      // Oversized body without Content-Length header -> 413
      const chunkedTooLarge = await parseJsonBody(
        new Request('http://localhost:3000/api/people', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ k: 'a'.repeat(101) }),
        }),
        exactBytes
      );
      expect(chunkedTooLarge.error?.status).toBe(413);

      // Default 64 KiB cap rejects >64 KiB body
      const overDefault = await parseJsonBody(
        new Request('http://localhost:3000/api/waitlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: 'x'.repeat(65 * 1024) }),
        })
      );
      expect(overDefault.error?.status).toBe(413);
    });

    test('parseJsonBody rejects a previously consumed request body', async () => {
      const request = new Request('http://localhost:3000/api/waitlist', {
        method: 'POST',
        body: '{}',
      });
      await request.text();

      const { error } = await parseJsonBody(request);
      expect(error?.status).toBe(400);
      expect(await error?.json()).toEqual({
        success: false,
        error: 'Invalid or missing JSON payload',
      });
    });

    test('login rate limiter enforces email/IP thresholds, expiry, release rollback, proxy trust, and lowest-count eviction', () => {
      resetLoginAttemptTracker();
      const t0 = 1_700_000_000_000;

      // Proxy IP extraction requires TRUST_PROXY_HEADERS=1 and uses rightmost X-Forwarded-For entry
      const prevTrust = process.env.TRUST_PROXY_HEADERS;
      try {
        delete process.env.TRUST_PROXY_HEADERS;
        const reqWithXff = new Request('http://localhost:3000/api/auth/login', {
          headers: { 'x-forwarded-for': '203.0.113.1, 198.51.100.7' },
        });
        expect(extractClientIp(reqWithXff)).toBeNull();

        process.env.TRUST_PROXY_HEADERS = '1';
        expect(extractClientIp(reqWithXff)).toBe('198.51.100.7');
      } finally {
        if (prevTrust !== undefined) process.env.TRUST_PROXY_HEADERS = prevTrust;
        else delete process.env.TRUST_PROXY_HEADERS;
      }

      // Per-email threshold (10 attempts) -> 11th is limited
      for (let i = 0; i < MAX_FAILED_LOGIN_ATTEMPTS; i += 1) {
        expect(reserveLoginAttempt(null, 'victim@grovia.io', t0).limited).toBe(false);
      }
      const limitedEmail = reserveLoginAttempt(null, 'victim@grovia.io', t0);
      expect(limitedEmail.limited).toBe(true);
      expect(limitedEmail.retryAfterSec).toBeGreaterThan(0);

      // Expiry resets bucket
      expect(
        reserveLoginAttempt(null, 'victim@grovia.io', t0 + LOGIN_WINDOW_MS + 1).limited
      ).toBe(false);

      // Release clears email bucket and rolls back IP reservation
      resetLoginAttemptTracker();
      for (let i = 0; i < MAX_FAILED_IP_ATTEMPTS - 1; i += 1) {
        expect(reserveLoginAttempt('10.0.0.1', `user${i}@grovia.io`, t0).limited).toBe(false);
      }
      const resA = reserveLoginAttempt('10.0.0.1', 'good@grovia.io', t0);
      expect(resA.limited).toBe(false);
      if (resA.limited) throw new Error('unreachable');
      releaseLoginAttempt(resA);
      // Because IP reservation was rolled back, one more attempt on same IP succeeds
      expect(reserveLoginAttempt('10.0.0.1', 'another@grovia.io', t0).limited).toBe(false);
      // Now IP bucket is at 25 -> next attempt is limited
      expect(reserveLoginAttempt('10.0.0.1', 'overflow@grovia.io', t0).limited).toBe(true);
      // The IP cap itself held (25, not eviction): retryAfter tracks the
      // window that is actually closing.
      const ipCapped = reserveLoginAttempt('10.0.0.1', 'overflow2@grovia.io', t0);
      expect(ipCapped.limited).toBe(true);
      expect(ipCapped.retryAfterSec).toBeLessThanOrEqual(900);

      // Capacity eviction evicts lowest-count buckets while preserving at-limit buckets
      resetLoginAttemptTracker();
      for (let i = 0; i < MAX_FAILED_LOGIN_ATTEMPTS; i += 1) {
        reserveLoginAttempt(null, 'locked@grovia.io', t0, 5);
      }
      for (let i = 0; i < 10; i += 1) {
        reserveLoginAttempt(null, `noise-${i}@grovia.io`, t0, 5);
      }
      expect(getLoginAttemptBucketCount()).toBeLessThanOrEqual(5);
      expect(reserveLoginAttempt(null, 'locked@grovia.io', t0, 5).limited).toBe(true);

      // Rotating IPs against a tiny bucket table: each attempt finalizes as a
      // recorded failure, and the target identity's own keys are never
      // eviction victims.
      resetLoginAttemptTracker();
      for (let i = 0; i < MAX_FAILED_LOGIN_ATTEMPTS; i += 1) {
        const rotated = reserveLoginAttempt(`198.51.100.${i + 1}`, 'rotating-target@grovia.io', t0, 3);
        expect(rotated.limited).toBe(false);
        if (!rotated.limited) failLoginAttemptReservation(rotated);
      }
      expect(
        reserveLoginAttempt('198.51.100.99', 'rotating-target@grovia.io', t0, 3).limited
      ).toBe(true);

      // Rollback decrements only the single reserved attempt without wiping prior failures
      resetLoginAttemptTracker();
      for (let i = 0; i < MAX_FAILED_LOGIN_ATTEMPTS - 1; i += 1) {
        expect(reserveLoginAttempt('10.0.0.2', 'outage@grovia.io', t0).limited).toBe(false);
      }
      const reserved = reserveLoginAttempt('10.0.0.2', 'outage@grovia.io', t0);
      expect(reserved.limited).toBe(false);
      if (reserved.limited) throw new Error('unreachable');
      rollbackLoginAttemptReservation(reserved);
      // Still 9 prior failures recorded -> 1 more attempt succeeds, next attempt is limited
      expect(reserveLoginAttempt('10.0.0.2', 'outage@grovia.io', t0).limited).toBe(false);
      expect(reserveLoginAttempt('10.0.0.2', 'outage@grovia.io', t0).limited).toBe(true);
      resetLoginAttemptTracker();
    });

    test('same-second logins yield unique jti tokens, logout ignores unverified cookies, and scrypt rejects over-maxmem params', async () => {
      const user = { id: 1, email: 'admin@grovia.io', name: 'Alex Rivera', role: 'admin' };
      const tok1 = await signSessionToken(user);
      const tok2 = await signSessionToken(user);
      expect(tok1).not.toBe(tok2);
      const dec1 = await verifySessionToken(tok1);
      const dec2 = await verifySessionToken(tok2);
      expect(dec1?.jti).toBeTruthy();
      expect(dec2?.jti).toBeTruthy();
      expect(dec1?.jti).not.toBe(dec2?.jti);

      // Unverified cookie sent to logout does not throw or revoke valid tok2
      const bogusLogout = await logoutRoute.POST(
        new Request('http://localhost:3000/api/auth/logout', {
          method: 'POST',
          headers: { cookie: `${SESSION_COOKIE_NAME}=not-a-valid-token` },
        })
      );
      expect(bogusLogout.status).toBe(200);
      expect(await verifySessionToken(tok2)).not.toBeNull();

      // The table alone exceeds 64 MiB; reject the stored costs as invalid.
      const overMaxMemHash = `scrypt:131072:8:1:${'aa'.repeat(16)}:${'bb'.repeat(64)}`;
      expect(await verifyPassword('grovia-demo-2026', overMaxMemHash)).toBe(false);
    });

    test('rate limiter: success release and failure rollback preserve pending reservations of other in-flight requests', () => {
      resetLoginAttemptTracker();
      const t0 = 1_700_000_000_000;

      // Two requests in flight for the same email (A reserves first, B second).
      const resA = reserveLoginAttempt('10.0.0.7', 'flight@grovia.io', t0);
      const resB = reserveLoginAttempt('10.0.0.7', 'flight@grovia.io', t0);
      expect(resA.limited).toBe(false);
      expect(resB.limited).toBe(false);

      // A succeeds: completed failures are forgiven (count = pending = B's
      // hold), so B's slot is still reserved but no failure is recorded yet.
      if (resA.limited) throw new Error('unreachable');
      releaseLoginAttempt(resA);

      // B fails: its reservation finalizes as a recorded failure.
      if (resB.limited) throw new Error('unreachable');
      failLoginAttemptReservation(resB);
      // Exactly one failure recorded: MAX-1 further attempts succeed, the
      // next one is refused — the failure count sits precisely at the
      // threshold with no phantom unit left over.
      for (let i = 0; i < MAX_FAILED_LOGIN_ATTEMPTS - 1; i += 1) {
        expect(reserveLoginAttempt('10.0.0.7', 'flight@grovia.io', t0).limited).toBe(false);
      }
      expect(reserveLoginAttempt('10.0.0.7', 'flight@grovia.io', t0).limited).toBe(true);
      // Window expiry clears the recorded failure.
      expect(
        reserveLoginAttempt('100.0.0.7', 'flight@grovia.io', t0 + LOGIN_WINDOW_MS + 1).limited
      ).toBe(false);

      // A failure-rollback for a long-expired, since-replaced bucket is a no-op:
      // the fresh bucket (from `fresh`) must survive untouched.
      const expired = reserveLoginAttempt('10.0.0.8', 'stale@grovia.io', t0);
      const fresh = reserveLoginAttempt('10.0.0.8', 'stale@grovia.io', t0 + LOGIN_WINDOW_MS + 1);
      expect(expired.limited).toBe(false);
      expect(fresh.limited).toBe(false);
      if (expired.limited) throw new Error('unreachable');
      rollbackLoginAttemptReservation(expired);
      // The fresh reservation is still a live pending hold: its recorded
      // failures remain counted — MAX-1 further attempts succeed and the next
      // is refused, so the stale rollback removed exactly its own unit.
      for (let i = 0; i < MAX_FAILED_LOGIN_ATTEMPTS - 1; i += 1) {
        expect(
          reserveLoginAttempt('10.0.0.8', 'stale@grovia.io', t0 + LOGIN_WINDOW_MS + 1).limited
        ).toBe(false);
      }
      expect(
        reserveLoginAttempt('10.0.0.8', 'stale@grovia.io', t0 + LOGIN_WINDOW_MS + 1).limited
      ).toBe(true);
      resetLoginAttemptTracker();
    });

    test('rate limiter: capacity rejection is all-or-nothing and never evicts pending buckets', () => {
      resetLoginAttemptTracker();
      const t0 = 1_700_000_000_000;

      // Fill capacity entirely with live pending holds (in-flight requests).
      const holds: AdmittedLoginReservation[] = [];
      for (let i = 0; i < 4; i += 1) {
        const r = reserveLoginAttempt(null, `p${i}@grovia.io`, t0, 4);
        expect(r.limited).toBe(false);
        if (r.limited) throw new Error('unreachable');
        holds.push(r);
      }
      expect(getLoginAttemptBucketCount()).toBe(4);

      // New identity: capacity is full and every bucket holds a pending
      // reservation -> refused, nothing evicted, no partial state.
      const refused = reserveLoginAttempt(null, 'blocked@grovia.io', t0, 4);
      expect(refused.limited).toBe(true);
      expect(refused.retryAfterSec).toBeGreaterThan(0);
      expect(getLoginAttemptBucketCount()).toBe(4);
      // The other requests' holds survived untouched: re-reserving the same
      // identity still fits under its threshold (bucket alive, count 1).
      expect(reserveLoginAttempt(null, 'p1@grovia.io', t0, 4).limited).toBe(false);

      // Completing one hold frees its slot; admission then succeeds without
      // evicting anyone else.
      rollbackLoginAttemptReservation(holds[0]);
      expect(getLoginAttemptBucketCount()).toBe(3);
      const admitted = reserveLoginAttempt(null, 'blocked@grovia.io', t0, 4);
      expect(admitted.limited).toBe(false);
      expect(getLoginAttemptBucketCount()).toBe(4);
      // Remaining original holds are still alive.
      expect(reserveLoginAttempt(null, 'p2@grovia.io', t0, 4).limited).toBe(false);
      resetLoginAttemptTracker();
    });

    test('rate limiter: bound concurrent password verifications with a fast 429 before scrypt', async () => {
      resetLoginAttemptTracker();
      const user = { id: 1, email: 'admin@grovia.io', name: 'Alex Rivera', role: 'admin' };
      const token = await signSessionToken(user);
      const cookie = `${SESSION_COOKIE_NAME}=${token}`;

      // Saturate the verification slot pool deterministically at the limiter seam.
      const slots: number[] = [];
      for (let i = 0; i < MAX_CONCURRENT_PASSWORD_VERIFICATIONS; i += 1) {
        slots.push(reservePasswordVerificationSlot());
      }
      expect(slots.every((s) => typeof s === 'number' && s >= 0)).toBe(true);
      // Pool exhausted: next reservation is refused.
      expect(reservePasswordVerificationSlot()).toBe(-1);
      // Release frees exactly one slot.
      releasePasswordVerificationSlot(slots.pop());
      const retried = reservePasswordVerificationSlot();
      expect(retried).toBeGreaterThanOrEqual(0);

      // Route-level: with the pool saturated, a login request gets 429 + Retry-After
      // before any scrypt work starts.
      const res = await loginRoute.POST(
        new Request('http://localhost:3000/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', cookie: '' },
          body: JSON.stringify({ email: 'capped@grovia.io', password: 'irrelevant' }),
        })
      );
      expect(res.status).toBe(429);
      expect(res.headers.get('Retry-After')).toBeTruthy();

      releasePasswordVerificationSlot(retried);
      resetLoginAttemptTracker();
    });

    test('login route: corrupt stored hash cannot authenticate and reservation is finalized exactly once', async () => {
      resetLoginAttemptTracker();
      const corruptHash = `scrypt:16384:8:1:${'zz'.repeat(16)}:${'bb'.repeat(64)}`;
      await resetDatabase(tempDbPath);
      const db = getDb(tempDbPath);
      db.run(`DELETE FROM users WHERE email = 'opfail@grovia.io'`);
      db.run(
        `INSERT INTO users (email, name, role, password_hash) VALUES ('opfail@grovia.io', 'Op Fail', 'member', ?)`,
        [corruptHash]
      );

      try {
        const prevAdminPassword = process.env.ADMIN_PASSWORD;
        delete process.env.ADMIN_PASSWORD;
        try {
          const res = await loginRoute.POST(
            new Request('http://login.local/api/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', cookie: '' },
              body: JSON.stringify({ email: 'opfail@grovia.io', password: 'whatever' }),
            })
          );
          // Malformed stored hash is wrong-password semantics (401), never a
          // crash and never an authentication. The operational-error → 500
          // propagation branch is covered statically by verifyPassword's
          // rethrow + the route's catch; runtimes whose scrypt tolerates the
          // cost (Bun) legitimately resolve false here.
          expect([401, 500]).toContain(res.status);
          // The reservation was finalized exactly once: no pending hold leaks
          // (an unfinalized hold would keep a phantom bucket and eventually
          // throw off threshold counts for this identity).
          const before = getLoginAttemptBucketCount();
          const probe = reserveLoginAttempt(null, 'opfail@grovia.io', Date.now());
          expect(probe.limited).toBe(false);
          if (!probe.limited) rollbackLoginAttemptReservation(probe);
          expect(getLoginAttemptBucketCount()).toBe(before);
        } finally {
          if (prevAdminPassword !== undefined) process.env.ADMIN_PASSWORD = prevAdminPassword;
        }
      } finally {
        await resetDatabase(tempDbPath);
        resetLoginAttemptTracker();
      }
    });

    test('session revocation deadline follows the token expiry, not a fixed 24h', async () => {
      const user = { id: 1, email: 'admin@grovia.io', name: 'Alex Rivera', role: 'admin' };
      const token = await signSessionToken(user, 4 * 60 * 60);
      const verified = await verifySessionToken(token);
      expect(verified?.exp).toBeTruthy();
      expect(SESSION_MAX_AGE_SECONDS).toBe(60 * 60 * 24);

      // Controlled clock: a 48h token revoked now stays rejected deep into the
      // 24–48h band where a fixed-24h revocation would have lapsed — while an
      // unrevoked control token from the same signed moment stays valid.
      const realNow = Date.now;
      try {
        const t0 = 1_700_000_000_000; // whole second
        Date.now = () => t0;
        clearRevokedSessionTokens();
        const longLived = await signSessionToken(user, 48 * 60 * 60);
        const control = await signSessionToken(user, 48 * 60 * 60);
        expect(await verifySessionToken(longLived)).not.toBeNull();

        const cookie = `${SESSION_COOKIE_NAME}=${longLived}`;
        const res = await logoutRoute.POST(
          new Request('http://localhost:3000/api/auth/logout', {
            method: 'POST',
            headers: { cookie },
          })
        );
        expect(res.status).toBe(200);
        expect(await verifySessionToken(longLived)).toBeNull();

        // 24h later (past the standard 86400s window): revoked still dead…
        Date.now = () => t0 + 24 * 60 * 60 * 1000 + 5000;
        expect(await verifySessionToken(longLived)).toBeNull();
        // …and the never-revoked control is still valid.
        expect(await verifySessionToken(control)).not.toBeNull();

        // 48h window nearly exhausted: revocation still holds up to its exp.
        Date.now = () => t0 + 47 * 60 * 60 * 1000;
        expect(await verifySessionToken(longLived)).toBeNull();
        // Just past the 48h exp the token is naturally expired and the
        // revocation entry is gone.
        Date.now = () => t0 + 48 * 60 * 60 * 1000 + 5000;
        expect(await verifySessionToken(longLived)).toBeNull();
        expect(await verifySessionToken(control)).toBeNull();

        // A genuinely fractional TTL: the signed exp claim keeps the fraction
        // (2.5s must not round up), and the revoked token stays rejected
        // exactly through its whole-second boundary while an unrevoked
        // control with the same TTL verifies.
        Date.now = () => 1_800_000_000_500;
        const fracToken = await signSessionToken(user, 2.5);
        const fracVerified = await verifySessionToken(fracToken);
        expect(fracVerified?.exp).toBe(1_800_000_002.5);
        const fracControl = await signSessionToken(user, 2.5);
        await logoutRoute.POST(
          new Request('http://localhost:3000/api/auth/logout', {
            method: 'POST',
            headers: { cookie: `${SESSION_COOKIE_NAME}=${fracToken}` },
          })
        );
        expect(await verifySessionToken(fracToken)).toBeNull();
        // Revoked through its own fractional exp (…002.5s): still dead at
        // now = floor(exp) while the unrevoked control is still alive there.
        Date.now = () => 1_800_000_002_000;
        expect(await verifySessionToken(fracToken)).toBeNull();
        expect(await verifySessionToken(fracControl)).not.toBeNull();
        Date.now = () => 1_800_000_002_499;
        expect(await verifySessionToken(fracToken)).toBeNull();
        // Past the fractional exp both are naturally expired.
        Date.now = () => 1_800_000_003_000;
        expect(await verifySessionToken(fracToken)).toBeNull();
        expect(await verifySessionToken(fracControl)).toBeNull();
      } finally {
        Date.now = realNow;
        clearRevokedSessionTokens();
      }
    });

    test('credential stamp shares seeding identity rule: blank/omitted/default ADMIN_EMAIL equivalent, real changes invalidate', async () => {
      const mutableEnv = process.env as Record<string, string | undefined>;
      const prevAuthSecret = process.env.AUTH_SECRET;
      const prevAdminEmail = process.env.ADMIN_EMAIL;
      const prevAdminPassword = process.env.ADMIN_PASSWORD;
      process.env.AUTH_SECRET = 'stamp-identity-rule-secret';
      process.env.ADMIN_PASSWORD = 'stamp-identity-password';
      const adminUser = { id: 1, email: 'admin@grovia.io', name: 'Alex Rivera', role: 'admin' };
      const prevNodeEnv = mutableEnv.NODE_ENV;
      mutableEnv.NODE_ENV = 'production';
      try {
        delete process.env.ADMIN_EMAIL;
        const omitted = await signSessionToken(adminUser);
        const omittedVerified = await verifySessionToken(omitted);
        expect(omittedVerified).not.toBeNull();

        // Blank / padded / default are the same normalized identity: a token
        // signed under any one of them verifies under all of them.
        process.env.ADMIN_EMAIL = '   ';
        expect(await verifySessionToken(omitted)).not.toBeNull();
        process.env.ADMIN_EMAIL = ' ADMIN@GROVIA.IO ';
        expect(await verifySessionToken(omitted)).not.toBeNull();
        // Whitespace-padded ADMIN_PASSWORD normalizes to the same stamp.
        process.env.ADMIN_PASSWORD = '  stamp-identity-password  ';
        expect(await verifySessionToken(omitted)).not.toBeNull();
        process.env.ADMIN_PASSWORD = 'stamp-identity-password';
        process.env.ADMIN_EMAIL = 'admin@grovia.io';
        expect(await verifySessionToken(omitted)).not.toBeNull();

        // A genuinely different configured identity changes the stamp: the
        // token from the old credential config no longer verifies for admin…
        process.env.ADMIN_EMAIL = 'other-admin@grovia.io';
        expect(await verifySessionToken(omitted)).toBeNull();
        const reissued = await signSessionToken(adminUser);
        expect(await verifySessionToken(reissued)).not.toBeNull();
        // …and changing ADMIN_PASSWORD invalidates it in the other direction.
        process.env.ADMIN_PASSWORD = 'rotated-stamp-password';
        expect(await verifySessionToken(reissued)).toBeNull();

        // Members are never credential-gated.
        process.env.ADMIN_EMAIL = '   ';
        process.env.ADMIN_PASSWORD = 'stamp-identity-password';
        const memberTok = await signSessionToken({
          id: 2,
          email: 'member@grovia.io',
          name: 'Member',
          role: 'member',
        });
        process.env.ADMIN_PASSWORD = 'something-else';
        expect(await verifySessionToken(memberTok)).not.toBeNull();
      } finally {
        if (prevNodeEnv !== undefined) mutableEnv.NODE_ENV = prevNodeEnv;
        else delete mutableEnv.NODE_ENV;
        if (prevAuthSecret !== undefined) process.env.AUTH_SECRET = prevAuthSecret;
        else delete process.env.AUTH_SECRET;
        if (prevAdminEmail !== undefined) process.env.ADMIN_EMAIL = prevAdminEmail;
        else delete process.env.ADMIN_EMAIL;
        if (prevAdminPassword !== undefined) process.env.ADMIN_PASSWORD = prevAdminPassword;
        else delete process.env.ADMIN_PASSWORD;
        clearRevokedSessionTokens();
      }
    });

    test('credential-version token verification rejects legacy admin tokens and accepts directly signed private admin and member tokens', async () => {
      // Fixed secret for the whole test: signing-key changes must not be the
      // reason a token is rejected — only the credential version is.
      const mutableEnv = process.env as Record<string, string | undefined>;
      const prevAuthSecret = process.env.AUTH_SECRET;
      process.env.AUTH_SECRET = 'cred-version-gating-test-secret';
      try {
        const user = { id: 1, email: 'admin@grovia.io', name: 'Alex Rivera', role: 'admin' };
        const member = { id: 2, email: 'member@grovia.io', name: 'Member', role: 'member' };

        // Non-production: no gating; legacy tokens stay valid.
        const legacy = await signSessionToken(user);
        const legacyParsed = await verifySessionToken(legacy);
        expect(legacyParsed).not.toBeNull();
        expect('cred' in (legacyParsed ?? {})).toBe(false);

        // Private-mode production: a demo-era (claim-less) admin token must not
        // grant admin access even when the signing secret is unchanged...
        const prev = {
          NODE_ENV: mutableEnv.NODE_ENV,
          ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
        };
        mutableEnv.NODE_ENV = 'production';
        process.env.ADMIN_PASSWORD = 'production-private-pass';
        try {
          expect(await verifySessionToken(legacy)).toBeNull();
          // ...while an admin token signed under the private credential verifies.
          const fresh = await signSessionToken(user);
          const freshParsed = await verifySessionToken(fresh);
          expect(freshParsed).not.toBeNull();
          expect('cred' in (freshParsed ?? {})).toBe(true);
          // Member sessions are not credential-gated.
          const memberTok = await signSessionToken(member);
          expect(await verifySessionToken(memberTok)).not.toBeNull();
        } finally {
          if (prev.NODE_ENV !== undefined) mutableEnv.NODE_ENV = prev.NODE_ENV;
          else delete mutableEnv.NODE_ENV;
          if (prev.ADMIN_PASSWORD !== undefined) process.env.ADMIN_PASSWORD = prev.ADMIN_PASSWORD;
          else delete process.env.ADMIN_PASSWORD;
        }
      } finally {
        if (prevAuthSecret !== undefined) process.env.AUTH_SECRET = prevAuthSecret;
        else delete process.env.AUTH_SECRET;
      }
    });

    test('configured admin email pre-claimed by a member row: collision rejected, row never promoted (SQLite)', async () => {
      await resetDatabase(tempDbPath);
      const db = getDb(tempDbPath);
      db.run(`DELETE FROM users WHERE email = 'member-admin@grovia.io'`);
      db.run(
        `INSERT INTO users (email, name, role, password_hash) VALUES ('member-admin@grovia.io', 'Planted Member', 'member', 'stored-member-hash')`
      );

      const prevAdminEmail = process.env.ADMIN_EMAIL;
      const prevAdminPassword = process.env.ADMIN_PASSWORD;
      try {
        process.env.ADMIN_EMAIL = 'member-admin@grovia.io';
        process.env.ADMIN_PASSWORD = 'new-private-password';

        // Observe the unwind on the REAL Bun SQLite handle: patch the shared
        // Database.prototype.close, scoped to this probe and restored in
        // finally. closeDb() first leaves no cached handle, so the only close
        // initDatabase can perform here is the failed handle's.
        closeDb();
        const proto = Object.getPrototypeOf(db) as unknown as {
          close: (this: unknown, ...args: unknown[]) => unknown;
        };
        const origClose = proto.close;
        let unwoundCloses = 0;
        proto.close = function (this: unknown, ...args: unknown[]) {
          unwoundCloses += 1;
          return origClose.apply(this, args);
        };
        try {
          expect(() => initDatabase(tempDbPath)).toThrow(
            /Refusing admin seeding: non-admin user already exists/
          );
          expect(unwoundCloses).toBe(1);
        } finally {
          proto.close = origClose;
        }

        // The refused init leaves the module cold (no cached handle/snapshot
        // rows); with ambient config restored, re-opening succeeds and shows
        // the planted row untouched — never promoted, never re-hashed.
        delete process.env.ADMIN_EMAIL;
        delete process.env.ADMIN_PASSWORD;
        initDatabase(tempDbPath);
        const row = findUserByEmail('member-admin@grovia.io');
        expect(row?.role).toBe('member');
        expect(row?.password_hash).toBe('stored-member-hash');
        expect(findUserByEmail('admin@grovia.io')?.role).toBe('admin');
      } finally {
        if (prevAdminEmail !== undefined) process.env.ADMIN_EMAIL = prevAdminEmail;
        else delete process.env.ADMIN_EMAIL;
        if (prevAdminPassword !== undefined) process.env.ADMIN_PASSWORD = prevAdminPassword;
        else delete process.env.ADMIN_PASSWORD;
        await resetDatabase(tempDbPath);
      }
    });

    test('getConfiguredAdminEmail trims before fallback so whitespace-only ADMIN_EMAIL cannot seed a blank account', async () => {
      await resetDatabase(tempDbPath);
      const prevAdminEmail = process.env.ADMIN_EMAIL;
      const prevAdminPassword = process.env.ADMIN_PASSWORD;
      try {
        process.env.ADMIN_EMAIL = '   ';
        delete process.env.ADMIN_PASSWORD;
        expect(getConfiguredAdminEmail()).toBe('admin@grovia.io');
        initDatabase(tempDbPath);
        const admin = findUserByEmail('admin@grovia.io');
        expect(admin?.email).toBe('admin@grovia.io');
        expect(findUserByEmail('')?.email).toBeUndefined();
      } finally {
        await resetDatabase(tempDbPath);
        if (prevAdminEmail !== undefined) process.env.ADMIN_EMAIL = prevAdminEmail;
        else delete process.env.ADMIN_EMAIL;
        if (prevAdminPassword !== undefined) process.env.ADMIN_PASSWORD = prevAdminPassword;
        else delete process.env.ADMIN_PASSWORD;
      }
    });

    test('JSON snapshot adapter: fail-closed load, tmp cleanup, and path isolation (isolated Node runtime)', async () => {
      // The JSON snapshot fallback only executes in non-Bun runtimes; Bun runs
      // real SQLite. Build lib/db.ts for Node with bun:sqlite externalized and
      // exercise the public interface from a scratch directory.
      // (execFileSync is only needed here to run the probe as a separate Node
      // process — a static import of the bundle would resolve under Bun.)
      const work = fs.mkdtempSync(path.join(os.tmpdir(), 'grovia-snapshot-contract-'));
      try {
        const probePath = path.join(work, 'db.mjs');
        const probeFile = path.join(work, 'probe.mjs');
        childProcess.execFileSync(
          process.execPath,
          [
            'build',
            path.resolve('lib/db.ts'),
            '--target=node',
            '--external',
            'bun:sqlite',
            '--outfile',
            probePath,
          ],
          { cwd: process.cwd(), stdio: 'pipe' }
        );
        fs.writeFileSync(
          probeFile,
          `
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as osMod from 'node:os';
import * as db from './db.mjs';
process.env.NODE_ENV = 'development';
let failures = 0;
const check = (name, cond) => { if (!cond) { console.error('FAIL ' + name); failures++; } };

// Corrupt snapshot: throws, file preserved byte-for-byte.
{
  const dir = fs.mkdtempSync(path.join(osMod.tmpdir(), 'p1-'));
  const snap = path.join(dir, 'f.db.store.json');
  fs.writeFileSync(snap, '{"people": [', 'utf8');
  process.env.DB_PATH = path.join(dir, 'f.db');
  let threw = false;
  try { db.addWaitlistEntry({ name: 'C', email: 'c@x.invalid', company: 'Co', teamSize: '1-10', useCase: 't' }); } catch { threw = true; }
  check('corrupt throws', threw);
  check('corrupt preserved', fs.readFileSync(snap, 'utf8') === '{"people": [');
  fs.rmSync(dir, { recursive: true, force: true });
}

// Rename failure: warm the adapter cache first (dedicated fixture DB, one
// seeded entry), then make renameSync fail by replacing the target snapshot
// FILE with a directory while the adapter stays open. The write succeeds and
// only the rename trips (EISDIR), exercising the tmp-cleanup path — unlike a
// pre-existing directory at the snapshot path, which fails at open/read.
{
  const dir = fs.mkdtempSync(path.join(osMod.tmpdir(), 'p2-'));
  const dbPath = path.join(dir, 'f.db');
  const snap = path.join(dir, 'f.db.store.json');
  process.env.DB_PATH = dbPath;
  db.initDatabase(dbPath);
  db.addWaitlistEntry({ name: 'Warm', email: 'warm@x.invalid', company: 'Co', teamSize: '1-10', useCase: 't' });
  if (!fs.statSync(snap).isFile()) { console.error('FAIL warm snapshot is a file'); process.exit(1); }
  // Swap the snapshot file for a directory: renameSync(tmp, snap) now fails.
  fs.rmSync(snap);
  fs.mkdirSync(snap);
  let threw = false;
  let syscall = '';
  try {
    db.addWaitlistEntry({ name: 'R', email: 'r@x.invalid', company: 'Co', teamSize: '1-10', useCase: 't' });
  } catch (e) {
    threw = true;
    syscall = e.syscall || '';
  }
  check('rename failure throws', threw);
  check('failure is the rename syscall', syscall === 'rename');
  check('no tmp leftovers', fs.readdirSync(dir).filter((f) => f.endsWith('.tmp')).length === 0);
  check('swap directory untouched', fs.statSync(snap).isDirectory());
  fs.rmSync(dir, { recursive: true, force: true });
}

// Path isolation incl. env switched before re-init.
{
  const dir = fs.mkdtempSync(path.join(osMod.tmpdir(), 'p3-'));
  process.env.DB_PATH = path.join(dir, 'a.db');
  db.initDatabase(path.join(dir, 'a.db'));
  db.addWaitlistEntry({ name: 'A', email: 'a@x.invalid', company: 'Co', teamSize: '1-10', useCase: 't' });
  process.env.DB_PATH = path.join(dir, 'b.db');
  db.initDatabase(path.join(dir, 'b.db'));
  db.addWaitlistEntry({ name: 'B', email: 'b@x.invalid', company: 'Co', teamSize: '1-10', useCase: 't' });
  const b = JSON.parse(fs.readFileSync(path.join(dir, 'b.db.store.json'), 'utf8'));
  const emails = b.waitlist.map((r) => r.email);
  check('B holds B', emails.includes('b@x.invalid'));
  check('B free of A', !emails.includes('a@x.invalid'));
  // Partial snapshot (missing counters) fails closed and stays untouched.
  const snap = path.join(dir, 'c.db.store.json');
  fs.writeFileSync(snap, JSON.stringify({ waitlist: [], inquiries: [], users: [], people: [] }), 'utf8');
  process.env.DB_PATH = path.join(dir, 'c.db');
  let threw = false;
  try { db.initDatabase(path.join(dir, 'c.db')); db.addWaitlistEntry({ name: 'P', email: 'p@x.invalid', company: 'Co', teamSize: '1-10', useCase: 't' }); } catch { threw = true; }
  check('partial throws', threw);
  check('partial preserved', fs.readFileSync(snap, 'utf8') === JSON.stringify({ waitlist: [], inquiries: [], users: [], people: [] }));
  fs.rmSync(dir, { recursive: true, force: true });
}

// Snapshot deep validation: counters positive/safe AND strictly above every
// stored id; every row well-typed. Fails before any seed/write; valid
// snapshots load normally.
{
  const dir = fs.mkdtempSync(path.join(osMod.tmpdir(), 'p4-'));
  process.env.NODE_ENV = 'development';
  const base = { waitlist: [], inquiries: [], users: [], people: [], nextWaitlistId: 1, nextInquiryId: 1, nextUserId: 1 };
  const writeSnap = (name, obj) => fs.writeFileSync(path.join(dir, name + '.db.store.json'), JSON.stringify(obj), 'utf8');
  const loadThrows = (name) => {
    process.env.DB_PATH = path.join(dir, name + '.db');
    try { db.initDatabase(path.join(dir, name + '.db')); return false; } catch { return true; }
  };
  const badStaleCounter = { ...base, waitlist: [{ id: 5, name: 'n', email: 'e5@x.invalid', company: null, teamSize: null, useCase: null, status: 'active', createdAt: '2026-11-16 00:00:00' }], nextWaitlistId: 5 };
  writeSnap('badctr', badStaleCounter);
  check('stale counter throws', loadThrows('badctr'));
  const badZeroCounter = { ...base, nextUserId: 0 };
  writeSnap('zeroctr', badZeroCounter);
  check('zero counter throws', loadThrows('zeroctr'));
  const badFractional = { ...base, nextInquiryId: 2.5 };
  writeSnap('fracctr', badFractional);
  check('fractional counter throws', loadThrows('fracctr'));
  const badUser = { ...base, nextUserId: 2, users: [{ id: 1, email: 'u@x.invalid', name: 'U', role: 'member', password_hash: 42, created_at: '2026-11-16 00:00:00' }] };
  writeSnap('baduser', badUser);
  check('ill-typed user row throws', loadThrows('baduser'));
  check('baduser snapshot untouched', fs.readFileSync(path.join(dir, 'baduser.db.store.json'), 'utf8') === JSON.stringify(badUser));
  const badPeople = { ...base, people: [{ ...base, id: '1' }] };
  writeSnap('badpeople', badPeople);
  check('ill-typed people row throws', loadThrows('badpeople'));
  check('badpeople snapshot untouched', fs.readFileSync(path.join(dir, 'badpeople.db.store.json'), 'utf8') === JSON.stringify(badPeople));
  const good = {
    ...base,
    nextUserId: 2,
    users: [{ id: 1, email: 'seedme@grovia.io', name: 'Seed', role: 'member', password_hash: 'x', created_at: '2026-11-16 00:00:00' }],
    people: [{ id: '9', name: 'P', role: 'Eng', team: 'T', city: 'Remote', hire_date: '2024-01-01', since: 'Invited today', status: 'Active', av: '#e9c98f', rate: 40, email: 'p9@x.invalid', phone: null, bday: null, look_json: null, created_at: '2026-11-16 00:00:00' }],
  };
  writeSnap('good', good);
  process.env.DB_PATH = path.join(dir, 'good.db');
  let seeded = false;
  try { db.initDatabase(path.join(dir, 'good.db')); seeded = true; } catch { seeded = false; }
  check('valid snapshot loads', seeded);
  fs.rmSync(dir, { recursive: true, force: true });
}

// Overflow counters: MAX_SAFE_INTEGER fails load outright; the
// MAX_SAFE_INTEGER-1 sentinel loads restart-safe but every allocator refuses
// allocation without mutating stores or counters (a duplicate insert still
// no-ops without allocating).
{
  const dir = fs.mkdtempSync(path.join(osMod.tmpdir(), 'p6-'));
  const base = { waitlist: [], inquiries: [], users: [], people: [], nextWaitlistId: 1, nextInquiryId: 1, nextUserId: 1 };
  const writeSnap = (name, obj) => fs.writeFileSync(path.join(dir, name + '.db.store.json'), JSON.stringify(obj), 'utf8');
  const waitlistRow = (id, email) => ({ id, name: 'n', email, company: null, teamSize: null, useCase: null, status: 'active', createdAt: '2026-11-16 00:00:00' });

  writeSnap('maxsnap', { ...base, waitlist: [waitlistRow(1, 'w@x.invalid')], nextWaitlistId: Number.MAX_SAFE_INTEGER });
  const maxsnapBytes = JSON.stringify({ ...base, waitlist: [waitlistRow(1, 'w@x.invalid')], nextWaitlistId: Number.MAX_SAFE_INTEGER });
  process.env.DB_PATH = path.join(dir, 'maxsnap.db');
  let threw = false;
  try { db.initDatabase(path.join(dir, 'maxsnap.db')); } catch { threw = true; }
  check('MAX_SAFE_INTEGER counter fails load', threw);
  check('maxsnap bytes untouched', fs.readFileSync(path.join(dir, 'maxsnap.db.store.json'), 'utf8') === maxsnapBytes);

  writeSnap('sentinel', { ...base, waitlist: [waitlistRow(1, 'w@x.invalid')], nextWaitlistId: Number.MAX_SAFE_INTEGER - 1 });
  process.env.DB_PATH = path.join(dir, 'sentinel.db');
  let loadOk = false;
  try { db.initDatabase(path.join(dir, 'sentinel.db')); loadOk = true; } catch {}
  check('MAX_SAFE_INTEGER-1 sentinel loads', loadOk);
  let allocThrew = false;
  try { db.addWaitlistEntry({ name: 'O', email: 'of@x.invalid', company: 'Co', teamSize: '1-10', useCase: 't' }); } catch { allocThrew = true; }
  check('allocation at sentinel throws', allocThrew);
  const after = JSON.parse(fs.readFileSync(path.join(dir, 'sentinel.db.store.json'), 'utf8'));
  check('counter unchanged after refusal', after.nextWaitlistId === Number.MAX_SAFE_INTEGER - 1);
  check('no row leaked past refusal', after.waitlist.length === 1);
  let dupThrew = false;
  try { db.addWaitlistEntry({ name: 'D', email: 'W@X.invalid', company: 'Co', teamSize: '1-10', useCase: 't' }); } catch { dupThrew = true; }
  check('duplicate insert at sentinel no-ops', !dupThrew);
  const afterDup = JSON.parse(fs.readFileSync(path.join(dir, 'sentinel.db.store.json'), 'utf8'));
  check('duplicate unchanged', afterDup.waitlist.length === 1 && afterDup.nextWaitlistId === Number.MAX_SAFE_INTEGER - 1);
  fs.rmSync(dir, { recursive: true, force: true });
}

// Snapshot duplicates mirror SQL uniqueness: numeric ids per store, emails
// case-insensitive, inquiry ticket keys exact. Rejected before global
// publish; the same email across DIFFERENT stores stays valid.
{
  const dir = fs.mkdtempSync(path.join(osMod.tmpdir(), 'p7-'));
  process.env.NODE_ENV = 'development';
  const base = { waitlist: [], inquiries: [], users: [], people: [], nextWaitlistId: 2, nextInquiryId: 2, nextUserId: 2 };
  const writeSnap = (name, obj) => fs.writeFileSync(path.join(dir, name + '.db.store.json'), JSON.stringify(obj), 'utf8');
  const lastError = {};
  const loadThrows = (name) => {
    process.env.DB_PATH = path.join(dir, name + '.db');
    try { db.initDatabase(path.join(dir, name + '.db')); return false; } catch (e) { lastError[name] = String(e && e.message); return true; }
  };
  const lastErrorMentions = (name, needle) => (lastError[name] || '').includes(needle);
  const waitlistRow = (id, email) => ({ id, name: 'n', email, company: null, teamSize: null, useCase: null, status: 'active', createdAt: '2026-11-16 00:00:00' });
  const inquiryRow = (id, ticket) => ({ id, ticket_id: ticket, ticketId: ticket, name: 'n', email: 'inq@x.invalid', subject: 's', message: 'm', priority: 'low', status: 'new', created_at: '2026-11-16 00:00:00', updated_at: '2026-11-16 00:00:00' });
  const userRow = (id, email) => ({ id, email, name: 'n', role: 'member', password_hash: 'x', created_at: '2026-11-16 00:00:00' });
  const peopleRow = (id, email) => ({ id, name: 'n', role: 'Eng', team: 'T', city: 'Remote', hire_date: '2024-01-01', since: 'Invited today', status: 'Active', av: '#e9c98f', rate: 40, email, phone: null, bday: null, look_json: null, created_at: '2026-11-16 00:00:00' });

  writeSnap('dupwait', { ...base, waitlist: [waitlistRow(1, 'w1@x.invalid'), waitlistRow(1, 'w2@x.invalid')], nextWaitlistId: 2 });
  check('duplicate waitlist id throws', loadThrows('dupwait'));
  check('dupwait rejection is id-specific', lastErrorMentions('dupwait', 'waitlist[1].id'));
  writeSnap('dupwaitemail', { ...base, nextWaitlistId: 3, waitlist: [waitlistRow(1, 'w@x.invalid'), waitlistRow(2, 'W@X.INVALID')] });
  check('case-insensitive duplicate waitlist email throws', loadThrows('dupwaitemail'));
  check('dupwaitemail rejection is email-specific', lastErrorMentions('dupwaitemail', 'waitlist[1].email'));
  check('dupwaitemail hides raw email', !lastErrorMentions('dupwaitemail', 'w@x.invalid') && !lastErrorMentions('dupwaitemail', 'W@X.INVALID'));
  writeSnap('dupinq', { ...base, inquiries: [inquiryRow(1, 'GROV-1001'), inquiryRow(1, 'GROV-1002')], nextInquiryId: 3 });
  check('duplicate inquiry id throws', loadThrows('dupinq'));
  check('dupinq rejection is id-specific', lastErrorMentions('dupinq', 'inquiries[1].id'));
  writeSnap('dupticket', { ...base, inquiries: [inquiryRow(1, 'GROV-1001'), inquiryRow(2, 'GROV-1001')], nextInquiryId: 3 });
  check('duplicate ticket key throws', loadThrows('dupticket'));
  check('dupticket rejection is ticket-specific', lastErrorMentions('dupticket', 'inquiries[1].ticket_id'));
  writeSnap('dupuser', { ...base, users: [userRow(1, 'u1@x.invalid'), userRow(1, 'u2@x.invalid')], nextUserId: 2 });
  check('duplicate user id throws', loadThrows('dupuser'));
  check('dupuser rejection is id-specific', lastErrorMentions('dupuser', 'users[1].id'));
  writeSnap('dupuseremail', { ...base, users: [userRow(1, 'u@x.invalid'), userRow(2, 'U@X.invalid')], nextUserId: 3 });
  check('case-insensitive duplicate user email throws', loadThrows('dupuseremail'));
  check('dupuseremail rejection is email-specific', lastErrorMentions('dupuseremail', 'users[1].email'));
  writeSnap('duppeople', { ...base, people: [peopleRow('1', 'p@x.invalid'), peopleRow('1', 'p2@x.invalid')], nextUserId: 3 });
  check('duplicate people id throws', loadThrows('duppeople'));
  check('duppeople rejection is id-specific', lastErrorMentions('duppeople', 'people[1].id'));
  writeSnap('duppeopleemail', { ...base, people: [peopleRow('1', 'p@x.invalid'), peopleRow('2', 'P@X.invalid')], nextUserId: 3 });
  check('case-insensitive duplicate people email throws', loadThrows('duppeopleemail'));
  check('duppeopleemail rejection is email-specific', lastErrorMentions('duppeopleemail', 'people[1].email'));
  writeSnap('shared', { ...base, waitlist: [waitlistRow(1, 'shared@x.invalid')], users: [userRow(1, 'shared@x.invalid')], people: [peopleRow('1', 'shared@x.invalid')], inquiries: [inquiryRow(1, 'GROV-1001')] });
  check('cross-store shared email stays valid', !loadThrows('shared'));
  // Byte-intact representative: failed duplicate load never rewrites file.
  const dupBytes = fs.readFileSync(path.join(dir, 'dupuser.db.store.json'), 'utf8');
  check('duplicate snapshot bytes intact', dupBytes === JSON.stringify({ ...base, users: [userRow(1, 'u1@x.invalid'), userRow(1, 'u2@x.invalid')], nextUserId: 2 }));
  fs.rmSync(dir, { recursive: true, force: true });
}

// Configured-admin seeding never promotes/overwrites an existing member row
// carrying the configured admin email (JSON adapter path): init must throw,
// and the snapshot file must survive byte-for-byte.
{
  const dir = fs.mkdtempSync(path.join(osMod.tmpdir(), 'p5-'));
  process.env.NODE_ENV = 'development';
  process.env.ADMIN_EMAIL = 'admin@grovia.io';
  process.env.ADMIN_PASSWORD = 'probe-private-pass';
  const memberUser = { id: 1, email: 'admin@grovia.io', name: 'Planted', role: 'member', password_hash: 'scrypt:16384:8:1:' + 'aa'.repeat(16) + ':' + 'bb'.repeat(64), created_at: '2026-11-16 00:00:00' };
  const snapObj = { waitlist: [], inquiries: [], users: [memberUser], people: [], nextWaitlistId: 1, nextInquiryId: 1, nextUserId: 2 };
  const snap = path.join(dir, 'collide.db.store.json');
  const originalSnapshot = JSON.stringify(snapObj);
  fs.writeFileSync(snap, originalSnapshot, 'utf8');
  process.env.DB_PATH = path.join(dir, 'collide.db');
  let threw = false;
  try {
    db.initDatabase(path.join(dir, 'collide.db'));
  } catch (e) {
    threw = String(e && e.message).includes('Refusing admin seeding');
  }
  check('member/admin collision throws', threw);
  check('collision snapshot byte-identical', fs.readFileSync(snap, 'utf8') === originalSnapshot);
  fs.rmSync(dir, { recursive: true, force: true });
}

// Restore the ambient env the probe inherited (its mutations never leak into
// later probes or the Bun runner); then exit with the contract verdict.
for (const key of ['DB_PATH', 'ADMIN_EMAIL', 'ADMIN_PASSWORD']) delete process.env[key];
process.exit(failures === 0 ? 0 : 1);
`,
          'utf8'
        );
        childProcess.execFileSync('node', [probeFile], { cwd: work, stdio: 'pipe' });
      } finally {
        fs.rmSync(work, { recursive: true, force: true });
      }
    });
  });
});

test('POST /api/auth/login issues a valid session for the configured private admin in production', async () => {
  const email = 'private-login-admin@grovia.io';
  const password = 'private-login-fixture-password';
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'grovia-private-login-'));
  const dbPath = path.join(directory, 'auth.db');
  const mutableEnv = process.env as Record<string, string | undefined>;
  const overrides = {
    NODE_ENV: 'production',
    ADMIN_EMAIL: email,
    ADMIN_PASSWORD: password,
    AUTH_SECRET: 'private-login-fixture-signing-secret',
    ALLOW_DEMO_ADMIN: '0',
    DB_PATH: dbPath,
  };
  const previous = Object.keys(overrides).map((key) => [key, mutableEnv[key]] as const);

  try {
    Object.assign(mutableEnv, overrides);
    initDatabase(dbPath);

    const response = await loginRoute.POST(
      new Request('https://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
    );

    expect(response.status).toBe(200);
    const token = parseCookieValue(response.headers.get('set-cookie'), SESSION_COOKIE_NAME);
    expect(await verifySessionToken(token)).toMatchObject({
      id: expect.any(Number),
      email,
      role: 'admin',
    });
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete mutableEnv[key];
      else mutableEnv[key] = value;
    }
    closeDb();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
