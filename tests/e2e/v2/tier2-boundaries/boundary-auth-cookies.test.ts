import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import crypto from 'node:crypto';
import {
  CookieJar,
  isSameServerOrigin,
  startLiveServer,
  type LiveServerHandle,
} from '../../harness/live-http';

interface ErrorBody {
  success: boolean;
  error: string;
  authenticated?: boolean;
}

function flipCharAt(input: string, index: number): string {
  const target = input.charAt(index);
  const replacement = target === 'A' ? 'B' : 'A';
  return `${input.slice(0, index)}${replacement}${input.slice(index + 1)}`;
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function signLiveSessionToken(payload: Record<string, unknown>): string {
  const secret =
    process.env.AUTH_SECRET ||
    process.env.SESSION_SECRET ||
    'grovia-e2e-live-test-secret-2026';
  const payloadB64 = encodeBase64Url(JSON.stringify(payload));
  const sigB64 = crypto
    .createHmac('sha256', secret)
    .update(payloadB64)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  return `${payloadB64}.${sigB64}`;
}

let server: LiveServerHandle | undefined;

function getServer(): LiveServerHandle {
  if (!server) {
    throw new Error('Live server not initialized');
  }
  return server;
}

async function obtainValidSessionToken(): Promise<string> {
  const client = getServer().createClient();
  const res = await client.login();
  expect(res.status).toBe(200);
  const token = client.jar.get('grovia_session')?.value;
  expect(typeof token).toBe('string');
  expect((token ?? '').length).toBeGreaterThan(0);
  return token ?? '';
}

async function assertSessionTokenRejected(tokenValue: string): Promise<void> {
  const client = getServer().createClient();
  const headers = { Cookie: `grovia_session=${tokenValue}` };

  const sessionRes = await client.get<ErrorBody>('/api/auth/session', { headers });
  expect(sessionRes.status).toBe(401);
  expect(sessionRes.data.success).toBe(false);

  const peopleRes = await client.get<ErrorBody>('/api/people', { headers });
  expect(peopleRes.status).toBe(401);
  expect(peopleRes.data.success).toBe(false);

  const workspaceRes = await client.get<string>('/workspace', { headers });
  expect(workspaceRes.status).toBe(307);
  const loc = new URL(workspaceRes.location ?? '', getServer().baseUrl);
  expect(isSameServerOrigin(loc, getServer().baseUrl)).toBe(true);
  expect(loc.pathname).toBe('/login');
}

beforeAll(async () => {
  server = await startLiveServer();
}, 120_000);

afterAll(async () => {
  await server?.stop();
});

describe('Tier 2 — F2 Boundaries: Tampered/Expired/Malformed Cookies & Auth Error Paths', () => {
  test('T2.v2.2.1: Tampered grovia_session payload segment is rejected with 401 on APIs and 307 on /workspace', async () => {
    const validToken = await obtainValidSessionToken();
    const dotIdx = validToken.indexOf('.');
    const tamperedPayloadToken =
      dotIdx > 0
        ? flipCharAt(validToken, Math.floor(dotIdx / 2))
        : flipCharAt(validToken, 0);

    expect(tamperedPayloadToken).not.toBe(validToken);
    await assertSessionTokenRejected(tamperedPayloadToken);
  });

  test('T2.v2.2.2: Tampered grovia_session HMAC signature segment is rejected with 401 on APIs and 307 on /workspace', async () => {
    const validToken = await obtainValidSessionToken();
    const dotIdx = validToken.lastIndexOf('.');
    const sigTargetIndex =
      dotIdx !== -1 && dotIdx + 1 < validToken.length
        ? dotIdx + 1
        : Math.max(0, validToken.length - 1);
    const tamperedSigToken = flipCharAt(validToken, sigTargetIndex);

    expect(tamperedSigToken).not.toBe(validToken);
    await assertSessionTokenRejected(tamperedSigToken);
  });

  test('T2.v2.2.3: Expired grovia_session token claims and CookieJar Max-Age/Expires/Secure rules are rejected', async () => {
    const validToken = await obtainValidSessionToken();
    const nowSec = Math.floor(Date.now() / 1000);
    const controlToken = signLiveSessionToken({
      id: 1,
      email: 'admin@grovia.io',
      name: 'Alex Rivera',
      role: 'admin',
      iat: nowSec - 10,
      exp: nowSec + 3600,
    });
    const controlClient = getServer().createClient();
    const controlRes = await controlClient.get<{ success: boolean; authenticated: boolean }>(
      '/api/auth/session',
      {
        headers: { Cookie: `grovia_session=${controlToken}` },
      }
    );
    expect(controlRes.status).toBe(200);
    expect(controlRes.data.authenticated).toBe(true);

    const expiredToken = signLiveSessionToken({
      id: 1,
      email: 'admin@grovia.io',
      name: 'Alex Rivera',
      role: 'admin',
      iat: nowSec - 120,
      exp: nowSec - 60,
    });
    await assertSessionTokenRejected(expiredToken);

    const jar = new CookieJar();
    jar.captureFromResponse(
      new Response(null, {
        headers: {
          'Set-Cookie': `grovia_session=${validToken}; Path=/; HttpOnly; SameSite=Lax`,
        },
      })
    );
    expect(jar.has('grovia_session')).toBe(true);

    jar.captureFromResponse(
      new Response(null, {
        headers: {
          'Set-Cookie': 'grovia_session=; Path=/; Max-Age=0',
        },
      })
    );
    expect(jar.has('grovia_session')).toBe(false);

    jar.captureFromResponse(
      new Response(null, {
        headers: {
          'Set-Cookie': `grovia_session=${validToken}; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
        },
      })
    );
    expect(jar.has('grovia_session')).toBe(false);

    jar.captureFromResponse(
      new Response(null, {
        headers: {
          'Set-Cookie': `grovia_session=${validToken}; Path=/; Secure`,
        },
      })
    );
    expect(jar.getCookieHeader('http://127.0.0.1:3000/workspace')).toBe('');
    expect(jar.getCookieHeader('https://127.0.0.1:3000/workspace')).toContain('grovia_session=');
  });

  test('T2.v2.2.4: Malformed grovia_session cookies (empty, dotted, encoded null, oversized) return 401/307 and never 500', async () => {
    const malformedValues = [
      '',
      'not-a-token',
      'a.b.c.d',
      '.',
      '..',
      'abc%00def',
      '%FF%FE.sig',
      'x'.repeat(8192),
    ];

    for (const badCookie of malformedValues) {
      await assertSessionTokenRejected(badCookie);
    }
  });

  test('T2.v2.2.5: POST /api/auth/login with wrong password returns 401 without issuing grovia_session', async () => {
    const client = getServer().createClient();
    const res = await client.login('admin@grovia.io', 'wrongpass');

    expect(res.status).toBe(401);
    const body = res.data as ErrorBody;
    expect(body.success).toBe(false);
    expect(body.error).toBe('Invalid email or password');
    expect(client.jar.has('grovia_session')).toBe(false);
    expect(res.setCookies.some((c) => c.toLowerCase().startsWith('grovia_session='))).toBe(false);
  });

  test('T2.v2.2.6: POST /api/auth/login with non-existent email returns 401 without issuing grovia_session', async () => {
    const client = getServer().createClient();
    const res = await client.login('ghost@grovia.io', 'grovia-demo-2026');

    expect(res.status).toBe(401);
    const body = res.data as ErrorBody;
    expect(body.success).toBe(false);
    expect(body.error).toBe('Invalid email or password');
    expect(client.jar.has('grovia_session')).toBe(false);
  });

  test('T2.v2.2.7: POST /api/auth/login rejects empty, malformed JSON, missing fields, and invalid email with 400', async () => {
    const client = getServer().createClient();

    for (const raw of ['', '{bad']) {
      const res = await client.post<ErrorBody>('/api/auth/login', raw, {
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
    }

    const badPayloads: unknown[] = [
      { password: 'grovia-demo-2026' },
      { email: 'not-an-email', password: 'grovia-demo-2026' },
      { email: 'admin@grovia.io' },
      { email: 'admin@grovia.io', password: '' },
    ];

    for (const payload of badPayloads) {
      const res = await client.post<ErrorBody>('/api/auth/login', payload);
      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
      expect(client.jar.has('grovia_session')).toBe(false);
    }
  });

  test('T2.v2.2.8: Auth endpoints enforce 405 Method Not Allowed with exact Allow headers', async () => {
    const client = getServer().createClient();

    for (const method of ['GET', 'PUT', 'PATCH', 'DELETE'] as const) {
      const loginRes = await client.request<ErrorBody>(method, '/api/auth/login');
      expect(loginRes.status).toBe(405);
      expect(loginRes.headers.get('allow')?.trim()).toBe('POST');

      const logoutRes = await client.request<ErrorBody>(method, '/api/auth/logout');
      expect(logoutRes.status).toBe(405);
      expect(logoutRes.headers.get('allow')?.trim()).toBe('POST');
    }

    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const sessionRes = await client.request<ErrorBody>(method, '/api/auth/session');
      expect(sessionRes.status).toBe(405);
      expect(sessionRes.headers.get('allow')?.trim()).toBe('GET');
    }
  });
});
