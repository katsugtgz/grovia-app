import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { NextRequest } from 'next/server';
import {
  DEFAULT_AUTH_REDIRECT,
  SESSION_COOKIE_NAME,
  sanitizeNextPath,
  signSessionToken,
  verifySessionToken,
} from '@/lib/auth-edge';
import { middleware } from '@/middleware';
import { createTestClient, resetDatabase, type TestClient } from '../e2e/harness/test-client';

const BASE_URL = 'http://localhost:3000';

const DEMO_ADMIN = {
  id: 1,
  email: 'admin@grovia.io',
  name: 'Alex Rivera',
  role: 'admin',
};

function computePercentile(samplesMs: number[], percentile: number): number {
  if (samplesMs.length === 0) return 0;
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1)
  );
  return sorted[idx];
}

async function timedCall<T>(fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
  const start = performance.now();
  const result = await fn();
  const durationMs = performance.now() - start;
  return { result, durationMs };
}

function buildMiddlewareRequest(
  pathnameAndSearch: string,
  options?: {
    method?: string;
    cookieHeader?: string;
    token?: string;
    headers?: Record<string, string>;
  }
): NextRequest {
  const headers = new Headers(options?.headers);
  if (options?.cookieHeader !== undefined) {
    headers.set('cookie', options.cookieHeader);
  } else if (options?.token !== undefined) {
    headers.set('cookie', `${SESSION_COOKIE_NAME}=${options.token}`);
  }
  return new NextRequest(new URL(pathnameAndSearch, BASE_URL), {
    method: options?.method ?? 'GET',
    headers,
  });
}

describe('Full-App Stress, Concurrency, Race Deduplication & Security Fuzzing Suite', () => {
  let authedClient: TestClient;

  beforeEach(async () => {
    resetDatabase();
    authedClient = createTestClient();
    await authedClient.loginAsAdmin();
  });

  afterAll(() => {
    resetDatabase();
  });

  describe('1. High-Concurrency Burst Requests Across All Routes & APIs', () => {
    test('Auth burst: concurrent POST /api/auth/login, GET /api/auth/session, and POST /api/auth/logout', async () => {
      const loginCount = 20;
      const latencies: number[] = [];

      // Concurrent login burst (mix of valid admin logins and invalid credentials)
      const loginOutcomes = await Promise.all(
        Array.from({ length: loginCount }, (_, i) =>
          timedCall(async () => {
            const client = createTestClient();
            const isValid = i % 4 !== 3;
            const res = await client.login(
              'admin@grovia.io',
              isValid ? 'grovia-demo-2026' : `wrong-password-${i}`
            );
            return { client, res, isValid };
          })
        )
      );

      for (const { result, durationMs } of loginOutcomes) {
        latencies.push(durationMs);
        if (result.isValid) {
          expect(result.res.status).toBe(200);
          expect(result.res.data.success).toBe(true);
          expect(result.res.data.user.email).toBe('admin@grovia.io');
          expect(result.client.getCookie(SESSION_COOKIE_NAME)).toBeTruthy();
        } else {
          expect(result.res.status).toBe(401);
          expect(result.res.data.success).toBe(false);
        }
      }

      // Concurrent GET /api/auth/session burst across all clients
      const sessionOutcomes = await Promise.all(
        loginOutcomes.map(({ result }) =>
          timedCall(async () => {
            const sessionRes = await result.client.get('/api/auth/session');
            return { sessionRes, isValid: result.isValid };
          })
        )
      );

      for (const { result, durationMs } of sessionOutcomes) {
        latencies.push(durationMs);
        if (result.isValid) {
          expect(result.sessionRes.status).toBe(200);
          expect(result.sessionRes.data.authenticated).toBe(true);
          expect(result.sessionRes.data.user.email).toBe('admin@grovia.io');
        } else {
          expect(result.sessionRes.status).toBe(401);
          expect(result.sessionRes.data.authenticated).toBe(false);
        }
      }

      // Concurrent POST /api/auth/logout burst on authenticated clients
      const validClients = loginOutcomes.filter((o) => o.result.isValid).map((o) => o.result.client);
      const logoutOutcomes = await Promise.all(
        validClients.map((client) =>
          timedCall(async () => {
            const logoutRes = await client.logout();
            const afterSession = await client.get('/api/auth/session');
            return { logoutRes, afterSession };
          })
        )
      );

      for (const { result, durationMs } of logoutOutcomes) {
        latencies.push(durationMs);
        expect(result.logoutRes.status).toBe(200);
        expect(result.logoutRes.data.success).toBe(true);
        expect(result.afterSession.status).toBe(401);
      }

      const sessionLogoutLatencies = [
        ...sessionOutcomes.map((o) => o.durationMs),
        ...logoutOutcomes.map((o) => o.durationMs),
      ];
      expect(computePercentile(sessionLogoutLatencies, 95)).toBeLessThan(50);
      expect(computePercentile(latencies, 95)).toBeLessThan(1000);
    });

    test('People & Waitlist burst: concurrent GET & POST /api/people and GET & POST /api/waitlist', async () => {
      const burstSize = 25;
      const latencies: number[] = [];

      const peopleWrites = Array.from({ length: burstSize }, (_, i) =>
        timedCall(() =>
          authedClient.post('/api/people', {
            name: `Burst Member ${i}`,
            email: `burst.member.${i}@grovia.io`,
            role: 'Staff Engineer',
            team: i % 2 === 0 ? 'Platform' : 'Design',
            city: 'Remote',
            rate: 65 + (i % 20),
          })
        )
      );

      const waitlistWrites = Array.from({ length: burstSize }, (_, i) =>
        timedCall(() =>
          authedClient.post(
            '/api/waitlist',
            {
              name: `Waitlist Lead ${i}`,
              email: `waitlist.burst.${i}@company.io`,
              company: `Company ${i}`,
              teamSize: '51-200',
              useCase: 'Automated workspace ops',
            },
            { skipAuth: true }
          )
        )
      );

      const peopleReads = Array.from({ length: 15 }, () =>
        timedCall(() => authedClient.get('/api/people'))
      );

      const waitlistReads = Array.from({ length: 15 }, () =>
        timedCall(() => authedClient.get('/api/waitlist'))
      );

      const [pWriteRes, wWriteRes, pReadRes, wReadRes] = await Promise.all([
        Promise.all(peopleWrites),
        Promise.all(waitlistWrites),
        Promise.all(peopleReads),
        Promise.all(waitlistReads),
      ]);

      for (const { result, durationMs } of pWriteRes) {
        latencies.push(durationMs);
        expect(result.status).toBe(201);
        expect(result.data.success).toBe(true);
        expect(result.data.person.email).toContain('@grovia.io');
      }

      for (const { result, durationMs } of wWriteRes) {
        latencies.push(durationMs);
        expect(result.status).toBe(201);
        expect(result.data.success).toBe(true);
        expect(typeof result.data.position).toBe('number');
      }

      for (const { result, durationMs } of pReadRes) {
        latencies.push(durationMs);
        expect(result.status).toBe(200);
        expect(result.data.success).toBe(true);
        expect(Array.isArray(result.data.people)).toBe(true);
      }

      for (const { result, durationMs } of wReadRes) {
        latencies.push(durationMs);
        expect(result.status).toBe(200);
        expect(result.data.success).toBe(true);
        expect(Array.isArray(result.data.waitlist)).toBe(true);
      }

      // Final consistency check after burst completes
      const finalPeople = await authedClient.get('/api/people');
      expect(finalPeople.status).toBe(200);
      expect(finalPeople.data.count).toBe(10 + burstSize);

      const finalWaitlist = await authedClient.get('/api/waitlist');
      expect(finalWaitlist.status).toBe(200);
      expect(finalWaitlist.data.count).toBe(burstSize);

      const p95 = computePercentile(latencies, 95);
      expect(p95).toBeLessThan(250);
    });

    test('Inquiries lifecycle burst: concurrent POST, GET, PATCH /api/inquiries and PATCH /api/inquiries/[id]', async () => {
      const count = 24;
      const latencies: number[] = [];

      // Create 24 inquiries concurrently
      const created = await Promise.all(
        Array.from({ length: count }, (_, i) =>
          timedCall(() =>
            authedClient.post('/api/inquiries', {
              name: `Enterprise Buyer ${i}`,
              email: `buyer.${i}@enterprise.io`,
              subject: `Scale Evaluation #${i}`,
              message: `Detailed inquiry payload for concurrent burst test iteration ${i}.`,
              priority: i % 3 === 0 ? 'high' : 'medium',
            })
          )
        )
      );

      const ticketIds: string[] = [];
      for (const { result, durationMs } of created) {
        latencies.push(durationMs);
        expect(result.status).toBe(201);
        expect(result.data.success).toBe(true);
        expect(result.data.ticketId).toMatch(/^GROV-[A-Z0-9]{4}$/);
        ticketIds.push(result.data.ticketId);
      }

      // Concurrently update half via PATCH /api/inquiries and half via PATCH /api/inquiries/[id], plus concurrent filtered GETs
      const patchTasks = ticketIds.map((ticketId, idx) =>
        timedCall(() => {
          if (idx % 2 === 0) {
            return authedClient.patch('/api/inquiries', {
              ticketId,
              status: 'in_progress',
              priority: 'urgent',
            });
          }
          return authedClient.patch(`/api/inquiries/${ticketId}`, {
            status: 'resolved',
            priority: 'low',
          });
        })
      );

      const getTasks = Array.from({ length: 12 }, (_, idx) =>
        timedCall(() => {
          const query = idx % 3 === 0 ? '?status=in_progress' : idx % 3 === 1 ? '?status=resolved' : '';
          return authedClient.get(`/api/inquiries${query}`);
        })
      );

      const [patchOutcomes, getOutcomes] = await Promise.all([
        Promise.all(patchTasks),
        Promise.all(getTasks),
      ]);

      patchOutcomes.forEach(({ result, durationMs }, idx) => {
        latencies.push(durationMs);
        expect(result.status).toBe(200);
        expect(result.data.success).toBe(true);
        expect(result.data.ticketId).toBe(ticketIds[idx]);
        expect(result.data.status).toBe(idx % 2 === 0 ? 'in_progress' : 'resolved');
        expect(result.data.priority).toBe(idx % 2 === 0 ? 'urgent' : 'low');
      });

      for (const { result, durationMs } of getOutcomes) {
        latencies.push(durationMs);
        expect(result.status).toBe(200);
        expect(result.data.success).toBe(true);
        expect(Array.isArray(result.data.inquiries)).toBe(true);
      }

      const resolvedList = await authedClient.get('/api/inquiries?status=resolved');
      expect(resolvedList.status).toBe(200);
      expect(resolvedList.data.count).toBe(count / 2);

      const inProgressList = await authedClient.get('/api/inquiries?status=in_progress');
      expect(inProgressList.status).toBe(200);
      expect(inProgressList.data.count).toBe(count / 2);

      const p95 = computePercentile(latencies, 95);
      expect(p95).toBeLessThan(250);
    });

    test('ROI, Metrics & Health mixed high-concurrency burst + post-burst DB health verification', async () => {
      const latencies: number[] = [];

      const roiTasks = Array.from({ length: 30 }, (_, i) =>
        timedCall(() =>
          authedClient.post(
            '/api/roi',
            {
              monthlyTraffic: 10000 + i * 2500,
              conversionRate: Number((1.2 + (i % 10) * 0.35).toFixed(2)),
              averageOrderValue: 85 + i * 15,
              industry: 'SaaS',
            },
            { skipAuth: true }
          )
        )
      );

      const metricsTasks = Array.from({ length: 30 }, () =>
        timedCall(() => authedClient.get('/api/metrics'))
      );

      const healthTasks = Array.from({ length: 30 }, () =>
        timedCall(() => authedClient.get('/api/health', { skipAuth: true }))
      );

      const [roiOutcomes, metricsOutcomes, healthOutcomes] = await Promise.all([
        Promise.all(roiTasks),
        Promise.all(metricsTasks),
        Promise.all(healthTasks),
      ]);

      for (const { result, durationMs } of roiOutcomes) {
        latencies.push(durationMs);
        expect(result.status).toBe(200);
        expect(result.data.projectedMonthlyRevenue).toBeGreaterThan(
          result.data.currentMonthlyRevenue
        );
        expect(result.data.monthlyTrajectory).toHaveLength(12);
      }

      for (const { result, durationMs } of metricsOutcomes) {
        latencies.push(durationMs);
        expect(result.status).toBe(200);
        expect(result.data.teamCount).toBeGreaterThanOrEqual(84);
        expect(result.data.benchmarkQuartile).toBe('Top 10%');
      }

      for (const { result, durationMs } of healthOutcomes) {
        latencies.push(durationMs);
        expect(result.status).toBe(200);
        expect(result.data.status).toBe('ok');
        expect(result.data.database).toBe('healthy');
      }

      const p95 = computePercentile(latencies, 95);
      expect(p95).toBeLessThan(250);

      // Post-burst health check
      const postHealth = await authedClient.get('/api/health', { skipAuth: true });
      expect(postHealth.status).toBe(200);
      expect(postHealth.data.status).toBe('ok');
      expect(postHealth.data.database).toBe('healthy');
    });
  });

  describe('2. Race-Condition Deduplication (Waitlist & People)', () => {
    test('concurrent identical email signups on POST /api/waitlist yield exactly 1x 201 and 29x 409', async () => {
      const concurrency = 30;
      const targetEmailVariants = [
        'race.signup@grovia.io',
        'RACE.SIGNUP@grovia.io',
        '  Race.Signup@Grovia.IO  ',
      ];

      const outcomes = await Promise.all(
        Array.from({ length: concurrency }, (_, i) =>
          authedClient.post(
            '/api/waitlist',
            {
              name: `Concurrent Applicant ${i}`,
              email: targetEmailVariants[i % targetEmailVariants.length],
              company: 'Race Condition Corp',
              teamSize: '11-50',
            },
            { skipAuth: true }
          )
        )
      );

      const created = outcomes.filter((r) => r.status === 201);
      const conflicts = outcomes.filter((r) => r.status === 409);

      expect(created).toHaveLength(1);
      expect(conflicts).toHaveLength(concurrency - 1);
      expect(created[0].data.success).toBe(true);
      expect(created[0].data.position).toBe(1);

      const listRes = await authedClient.get('/api/waitlist');
      expect(listRes.status).toBe(200);
      expect(listRes.data.count).toBe(1);
      expect(listRes.data.waitlist).toHaveLength(1);
      expect(listRes.data.waitlist[0].email).toBe('race.signup@grovia.io');
    });

    test('concurrent identical email invites on POST /api/people yield exactly 1x 201 and 29x 409', async () => {
      const concurrency = 30;
      const emailVariants = [
        'duplicate.hire@grovia.io',
        'DUPLICATE.HIRE@GROVIA.IO',
        '  Duplicate.Hire@grovia.io ',
      ];

      const outcomes = await Promise.all(
        Array.from({ length: concurrency }, (_, i) =>
          authedClient.post('/api/people', {
            name: `Concurrent Hire ${i}`,
            email: emailVariants[i % emailVariants.length],
            role: 'Product Designer',
            team: 'Design',
            city: 'New York',
            rate: 55,
          })
        )
      );

      const created = outcomes.filter((r) => r.status === 201);
      const conflicts = outcomes.filter((r) => r.status === 409);

      expect(created).toHaveLength(1);
      expect(conflicts).toHaveLength(concurrency - 1);
      expect(created[0].data.success).toBe(true);
      expect(created[0].data.person.email).toBe('duplicate.hire@grovia.io');

      const peopleRes = await authedClient.get('/api/people');
      expect(peopleRes.status).toBe(200);
      const matching = peopleRes.data.people.filter(
        (p: { email: string }) => p.email.toLowerCase() === 'duplicate.hire@grovia.io'
      );
      expect(matching).toHaveLength(1);
    });
  });

  describe('3. Ticket ID Collision Resistance (50 Concurrent Inquiries)', () => {
    test('50 concurrent POST /api/inquiries creations yield 50 unique GROV-* ticket IDs', async () => {
      const total = 50;
      const start = performance.now();

      const responses = await Promise.all(
        Array.from({ length: total }, (_, i) =>
          authedClient.post('/api/inquiries', {
            name: `Collision Tester ${i}`,
            email: `collision.${i}@grovia.io`,
            subject: `Concurrent Ticket Generation #${i}`,
            message: `Testing collision resistance for 50 simultaneous inquiries (index ${i}).`,
            priority: (['low', 'medium', 'high', 'urgent'] as const)[i % 4],
          })
        )
      );

      const elapsedMs = performance.now() - start;
      expect(elapsedMs).toBeLessThan(5000);

      const ticketIds = new Set<string>();
      for (const res of responses) {
        expect(res.status).toBe(201);
        expect(res.data.success).toBe(true);
        expect(typeof res.data.ticketId).toBe('string');
        expect(res.data.ticketId).toMatch(/^GROV-[A-Z0-9]{4,}$/);
        ticketIds.add(res.data.ticketId);
      }

      expect(ticketIds.size).toBe(total);

      const listRes = await authedClient.get('/api/inquiries');
      expect(listRes.status).toBe(200);
      expect(listRes.data.count).toBe(total);
    });
  });

  describe('4. Security Fuzzing: HMAC Tokens, Cookies, Middleware & Open-Redirect Payloads', () => {
    test('HMAC token fuzzing: rejects tampered signatures, mutated payloads, expired tokens, and malformed structures', async () => {
      const validToken = await signSessionToken(DEMO_ADMIN);
      const [payloadB64, sigB64] = validToken.split('.');

      // Forged payload with elevated/modified fields but original signature
      const forgedPayloadB64 = Buffer.from(
        JSON.stringify({
          id: 999,
          email: 'attacker@evil.com',
          name: 'Attacker',
          role: 'superadmin',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 86400,
        })
      ).toString('base64url');

      // Missing required schema fields in payload
      const incompletePayloadB64 = Buffer.from(
        JSON.stringify({ id: 1, email: '' })
      ).toString('base64url');

      const expiredToken = await signSessionToken(DEMO_ADMIN, -60);
      const zeroTtlToken = await signSessionToken(DEMO_ADMIN, 0);

      const flippedSig =
        sigB64.slice(0, -1) + (sigB64.endsWith('A') ? 'B' : 'A');
      const flippedMiddleSig =
        sigB64.slice(0, 10) +
        (sigB64[10] === 'x' ? 'y' : 'x') +
        sigB64.slice(11);

      const fuzzedTokens: Array<string | null | undefined> = [
        null,
        undefined,
        '',
        '   ',
        '.',
        '..',
        'not-a-valid-token',
        `${payloadB64}.`,
        `.${sigB64}`,
        `${payloadB64}.${sigB64}.extra`,
        `${payloadB64}.${flippedSig}`,
        `${payloadB64}.${flippedMiddleSig}`,
        `${forgedPayloadB64}.${sigB64}`,
        `${incompletePayloadB64}.${sigB64}`,
        `${payloadB64}.${sigB64.slice(0, 16)}`,
        `${payloadB64}.${sigB64}AAAA`,
        `${payloadB64}.!!!invalid_base64$$$`,
        `!!!invalid_base64$$$.${sigB64}`,
        expiredToken,
        zeroTtlToken,
        '\u0000\u001f.invalid',
        'eyJhbGciOiJub25lIn0.e30',
      ];

      for (const badToken of fuzzedTokens) {
        const verified = await verifySessionToken(badToken);
        expect(verified).toBeNull();
      }
    });

    test('Cookie header fuzzing against middleware and protected route handlers', async () => {
      const validToken = await signSessionToken(DEMO_ADMIN);
      const [payloadB64, sigB64] = validToken.split('.');
      const tamperedToken = `${payloadB64}.${sigB64.slice(0, -1)}${sigB64.endsWith('1') ? '2' : '1'}`;
      const expiredToken = await signSessionToken(DEMO_ADMIN, -300);

      const malformedCookieHeaders = [
        '',
        ';;;',
        '=',
        'grovia_session=',
        'grovia_session=   ',
        'other_cookie=12345',
        `grovia_session=${tamperedToken}`,
        `grovia_session=${expiredToken}`,
        'grovia_session=%E0%A4%A',
        'grovia_session=a.b.c; Path=/; HttpOnly',
        `prefix_grovia_session=${validToken}`,
        'grovia_session="%00malformed"',
      ];

      const protectedTargets = [
        { method: 'GET', path: '/api/people' },
        { method: 'POST', path: '/api/people' },
        { method: 'GET', path: '/api/waitlist' },
        { method: 'GET', path: '/api/inquiries' },
        { method: 'POST', path: '/api/inquiries' },
        { method: 'PATCH', path: '/api/inquiries/GROV-1001' },
        { method: 'GET', path: '/api/metrics' },
      ];

      for (const cookieHeader of malformedCookieHeaders) {
        // 1. Middleware blocks protected APIs with 401 JSON
        for (const target of protectedTargets) {
          const mwRes = await middleware(
            buildMiddlewareRequest(target.path, {
              method: target.method,
              cookieHeader,
            })
          );
          expect(mwRes.status).toBe(401);
          const body = await mwRes.json();
          expect(body.authenticated).toBe(false);
          expect(body.error).toBe('Authentication required');
        }

        // 2. Middleware redirects /workspace to /login?next=%2Fworkspace
        const wsRes = await middleware(
          buildMiddlewareRequest('/workspace?view=people', { cookieHeader })
        );
        expect(wsRes.status).toBe(307);
        const redirectUrl = new URL(wsRes.headers.get('location') ?? '', BASE_URL);
        expect(redirectUrl.pathname).toBe('/login');
        expect(redirectUrl.searchParams.get('next')).toBe('/workspace?view=people');

        // 3. Direct route handler defense-in-depth also returns 401
        const unauthClient = createTestClient();
        const directRes = await unauthClient.get('/api/people', {
          headers: { cookie: cookieHeader },
          skipAuth: true,
        });
        expect(directRes.status).toBe(401);
      }
    });

    test('Open-redirect fuzzing on sanitizeNextPath and middleware /login redirect', async () => {
      const validToken = await signSessionToken(DEMO_ADMIN);

      const maliciousRedirectPayloads: unknown[] = [
        '//attacker.com',
        '///attacker.com',
        '////attacker.com/workspace',
        '/\\attacker.com',
        '\\attacker.com',
        '/workspace\\@attacker.com',
        'https://attacker.com',
        'http://attacker.com/workspace',
        'ftp://attacker.com',
        'javascript:alert(document.cookie)',
        'JAVASCRIPT:alert(1)',
        'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
        'vbscript:msgbox(1)',
        '/%2fattacker.com',
        '/%2Fattacker.com',
        '/%2f%2fattacker.com',
        '/%5cattacker.com',
        '/%252fattacker.com',
        '/%252f%252fattacker.com',
        '/%255cattacker.com',
        '/%25252fattacker.com',
        '/%25255cattacker.com',
        '/%2525252fattacker.com',
        '/%252525252fattacker.com',
        '/\u0000/attacker.com',
        '/\u0009/attacker.com',
        '/\u000a/attacker.com',
        '/\u000d/attacker.com',
        '/\u001f/attacker.com',
        '/\u007f/attacker.com',
        '/%00/attacker.com',
        '/%0a/attacker.com',
        '/%0d%0aSet-Cookie:grovia_session=evil',
        '/%250a/attacker.com',
        '/%252500/attacker.com',
        '/login',
        '/login/',
        '/LOGIN',
        '/login?next=/workspace',
        '/login?next=//attacker.com',
        '/login/nested',
        '/%6cogin',
        '/%256cogin',
        '/%25256cogin',
        '/%E0%A4%A',
        '/%c0%afattacker.com',
        'attacker.com/workspace',
        'http://grovia.local@attacker.com',
        '',
        '    ',
        null,
        undefined,
        12345,
        ['//attacker.com'],
        { next: '//attacker.com' },
      ];

      for (const payload of maliciousRedirectPayloads) {
        const sanitized = sanitizeNextPath(payload);
        expect(sanitized).toBe(DEFAULT_AUTH_REDIRECT);

        if (typeof payload === 'string') {
          const mwRes = await middleware(
            buildMiddlewareRequest(`/login?next=${encodeURIComponent(payload)}`, {
              token: validToken,
            })
          );
          expect(mwRes.status).toBe(307);
          const loc = new URL(mwRes.headers.get('location') ?? '', BASE_URL);
          expect(loc.origin).toBe(BASE_URL);
          expect(loc.pathname).toBe('/workspace');
          expect(loc.search).toBe('');
        }
      }
    });
  });

  describe('5. End-to-End Mixed Workload Stress & Post-Stress Health Audit', () => {
    test('sustains 120 concurrent mixed operations with P95 < 300ms and healthy SQLite state', async () => {
      const validToken = await signSessionToken(DEMO_ADMIN);
      const latencies: number[] = [];

      const operations = Array.from({ length: 120 }, (_, i) =>
        timedCall(async () => {
          const bucket = i % 6;
          switch (bucket) {
            case 0:
              return authedClient.get('/api/health', { skipAuth: true });
            case 1:
              return authedClient.get('/api/metrics');
            case 2:
              return authedClient.get('/api/people');
            case 3:
              return authedClient.post(
                '/api/roi',
                {
                  monthlyTraffic: 25000 + i * 500,
                  conversionRate: 2.5,
                  averageOrderValue: 120,
                },
                { skipAuth: true }
              );
            case 4:
              return authedClient.post(
                '/api/waitlist',
                {
                  name: `Mixed Stress User ${i}`,
                  email: `mixed.stress.${i}@grovia.io`,
                  company: 'Stress Lab',
                },
                { skipAuth: true }
              );
            default: {
              const mwRes = await middleware(
                buildMiddlewareRequest('/workspace?tab=overview', { token: validToken })
              );
              return { status: mwRes.status, ok: mwRes.ok };
            }
          }
        })
      );

      const results = await Promise.all(operations);
      for (const { result, durationMs } of results) {
        latencies.push(durationMs);
        expect([200, 201]).toContain(result.status);
      }

      const p50 = computePercentile(latencies, 50);
      const p95 = computePercentile(latencies, 95);
      const p99 = computePercentile(latencies, 99);

      expect(p50).toBeLessThan(150);
      expect(p95).toBeLessThan(300);
      expect(p99).toBeLessThan(600);

      // Post-burst health verification
      const healthRes = await authedClient.get('/api/health', { skipAuth: true });
      expect(healthRes.status).toBe(200);
      expect(healthRes.data.status).toBe('ok');
      expect(healthRes.data.database).toBe('healthy');
    });
  });
});
