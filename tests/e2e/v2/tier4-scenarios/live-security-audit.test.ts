import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import {
  isSameServerOrigin,
  startLiveServer,
  type LiveServerHandle,
} from '../../harness/live-http';

interface AuthResponse {
  success: boolean;
}

interface ErrorResponse {
  success: boolean;
  error: string;
}

let server: LiveServerHandle | undefined;

function getServer(): LiveServerHandle {
  if (!server) {
    throw new Error('Live test server is not initialized');
  }
  return server;
}

function flipLastChar(value: string): string {
  if (value.length === 0) {
    return 'x';
  }
  const last = value.charAt(value.length - 1);
  const replacement = last === 'a' ? 'b' : 'a';
  return `${value.slice(0, -1)}${replacement}`;
}

function flipFirstChar(value: string): string {
  if (value.length === 0) {
    return 'x';
  }
  const first = value.charAt(0);
  const replacement = first === 'a' ? 'b' : 'a';
  return `${replacement}${value.slice(1)}`;
}

function parseAllowHeader(headerValue: string | null): string[] {
  if (!headerValue) {
    return [];
  }
  return headerValue
    .split(',')
    .map((method) => method.trim().toUpperCase())
    .filter((method) => method.length > 0)
    .sort();
}

describe('Tier 4 — Live HTTP Scenario: Security & Edge Middleware Audit (T4.v2.3)', () => {
  beforeAll(async () => {
    server = await startLiveServer();
  }, 120_000);

  afterAll(async () => {
    await server?.stop();
  });

  test('T4.v2.3.1: Middleware and routes reject tampered, expired, and malformed grovia_session cookies', async () => {
    const live = getServer();
    const admin = live.createClient();
    expect((await admin.login<AuthResponse>()).status).toBe(200);

    const validToken = admin.jar.get('grovia_session')?.value ?? '';
    expect(validToken.length).toBeGreaterThan(10);

    const dotIndex = validToken.indexOf('.');
    const tamperedPayload =
      dotIndex > 0
        ? `${flipFirstChar(validToken.slice(0, dotIndex))}${validToken.slice(dotIndex)}`
        : flipFirstChar(validToken);
    const tamperedSignature =
      dotIndex > 0
        ? `${validToken.slice(0, dotIndex + 1)}${flipLastChar(validToken.slice(dotIndex + 1))}`
        : flipLastChar(validToken);
    const expiredLikePayload = Buffer.from(
      JSON.stringify({ sub: 1, email: 'admin@grovia.io', exp: 1 })
    ).toString('base64url');
    const expiredLikeToken = `${expiredLikePayload}.invalidsignature`;

    const invalidCookies = [
      '',
      'not-a-token',
      'a.b.c.d',
      'x'.repeat(4096),
      tamperedPayload,
      tamperedSignature,
      expiredLikeToken,
    ];

    const probe = live.createClient();
    const protectedApis = [
      '/api/people',
      '/api/waitlist',
      '/api/inquiries',
      '/api/metrics',
      '/api/auth/session',
    ];

    for (const badCookie of invalidCookies) {
      const headers = { Cookie: `grovia_session=${badCookie}` };

      const wsRes = await probe.get('/workspace', { headers });
      expect(wsRes.status).toBe(307);
      expect(wsRes.location).toBeTruthy();
      const loc = new URL(wsRes.location ?? '', live.baseUrl);
      expect(isSameServerOrigin(loc, live.baseUrl)).toBe(true);
      expect(loc.pathname).toBe('/login');

      for (const apiPath of protectedApis) {
        const apiRes = await probe.get<ErrorResponse>(apiPath, { headers });
        expect(apiRes.status).toBe(401);
        expect(apiRes.data.success).toBe(false);
      }
    }
  });

  test('T4.v2.3.2: Open-redirect next targets are sanitized across unauthenticated and authenticated /login', async () => {
    const live = getServer();
    const visitor = live.createClient();
    const admin = live.createClient();
    expect((await admin.login<AuthResponse>()).status).toBe(200);

    const maliciousTargets = [
      '//evil.com',
      '///evil.com',
      'https://evil.com',
      'http://evil.com/phish',
      '/\\evil.com',
      '/%5cevil.com',
      'javascript:alert(1)',
    ];

    for (const nextTarget of maliciousTargets) {
      const encoded = encodeURIComponent(nextTarget);

      const unauthLogin = await visitor.get(`/login?next=${encoded}`);
      expect(unauthLogin.status).toBe(200);
      expect(unauthLogin.location).toBeNull();

      const authedLogin = await admin.get(`/login?next=${encoded}`);
      expect(authedLogin.status).toBe(307);
      expect(authedLogin.location).toBeTruthy();

      const loc = new URL(authedLogin.location ?? '', live.baseUrl);
      expect(isSameServerOrigin(loc, live.baseUrl)).toBe(true);
      expect(loc.hostname).not.toBe('evil.com');
      expect(loc.pathname).toBe('/workspace');
    }

    const safeLogin = await admin.get('/login?next=%2Fworkspace');
    expect(safeLogin.status).toBe(307);
    const safeLoc = new URL(safeLogin.location ?? '', live.baseUrl);
    expect(isSameServerOrigin(safeLoc, live.baseUrl)).toBe(true);
    expect(safeLoc.pathname).toBe('/workspace');
  });

  test('T4.v2.3.3: Live APIs enforce 405 Method Not Allowed with Allow headers across public and protected routes', async () => {
    const live = getServer();
    const visitor = live.createClient();
    const admin = live.createClient();
    expect((await admin.login<AuthResponse>()).status).toBe(200);

    const matrix: Array<{
      client: 'visitor' | 'admin';
      path: string;
      disallowedMethods: string[];
      expectedAllow: string[];
    }> = [
      {
        client: 'visitor',
        path: '/api/health',
        disallowedMethods: ['POST', 'PUT', 'PATCH', 'DELETE'],
        expectedAllow: ['GET'],
      },
      {
        client: 'visitor',
        path: '/api/roi',
        disallowedMethods: ['GET', 'PUT', 'PATCH', 'DELETE'],
        expectedAllow: ['POST'],
      },
      {
        client: 'visitor',
        path: '/api/auth/login',
        disallowedMethods: ['GET', 'PUT', 'PATCH', 'DELETE'],
        expectedAllow: ['POST'],
      },
      {
        client: 'visitor',
        path: '/api/auth/logout',
        disallowedMethods: ['GET', 'PUT', 'PATCH', 'DELETE'],
        expectedAllow: ['POST'],
      },
      {
        client: 'visitor',
        path: '/api/auth/session',
        disallowedMethods: ['POST', 'PUT', 'PATCH', 'DELETE'],
        expectedAllow: ['GET'],
      },
      {
        client: 'admin',
        path: '/api/people',
        disallowedMethods: ['PUT', 'PATCH', 'DELETE'],
        expectedAllow: ['GET', 'POST'],
      },
      {
        client: 'admin',
        path: '/api/waitlist',
        disallowedMethods: ['PUT', 'PATCH', 'DELETE'],
        expectedAllow: ['GET', 'POST'],
      },
      {
        client: 'admin',
        path: '/api/inquiries',
        disallowedMethods: ['PUT', 'DELETE'],
        expectedAllow: ['GET', 'PATCH', 'POST'],
      },
      {
        client: 'admin',
        path: '/api/inquiries/GROV-1001',
        disallowedMethods: ['GET', 'POST', 'PUT', 'DELETE'],
        expectedAllow: ['PATCH'],
      },
      {
        client: 'admin',
        path: '/api/metrics',
        disallowedMethods: ['POST', 'PUT', 'PATCH', 'DELETE'],
        expectedAllow: ['GET'],
      },
    ];

    for (const entry of matrix) {
      const activeClient = entry.client === 'admin' ? admin : visitor;
      const expectedSorted = [...entry.expectedAllow].sort();

      for (const method of entry.disallowedMethods) {
        const res = await activeClient.request<ErrorResponse>(method, entry.path);
        expect(res.status).toBe(405);
        expect(res.data.success).toBe(false);
        expect(parseAllowHeader(res.headers.get('allow'))).toEqual(expectedSorted);
      }
    }
  });
});
