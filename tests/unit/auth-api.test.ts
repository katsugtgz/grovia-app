import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { hashPassword, verifyPassword } from '@/lib/password';
import {
  SESSION_COOKIE_NAME,
  getSafeRedirectTarget,
  isHttpsRequest,
  parseCookieValue,
  sanitizeNextPath,
  signSessionToken,
  verifySessionToken,
} from '@/lib/auth-edge';
import { closeDb, initDatabase } from '@/lib/db';
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
});
