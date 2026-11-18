import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { startLiveServer, type LiveServerHandle } from '../../harness/live-http';

interface AuthResponse {
  success: boolean;
  user?: {
    id: number;
    email: string;
    name: string;
    role: string;
  };
  error?: string;
}

let server: LiveServerHandle | undefined;

function getServer(): LiveServerHandle {
  if (!server) {
    throw new Error('Live test server is not initialized');
  }
  return server;
}

function parseRedirectLocation(location: string | null, baseUrl: string): URL {
  if (!location) {
    throw new Error('Expected Location header on 307 redirect response');
  }
  return new URL(location, baseUrl);
}

describe('Tier 3 — Combinations: Redirect & Login Handoff (T3.v2.4)', () => {
  beforeAll(async () => {
    server = await startLiveServer();
  }, 120_000);

  afterAll(async () => {
    await server?.stop();
  });

  test('T3.v2.4.1: Unauthenticated /workspace -> /login?next=%2Fworkspace -> login -> /workspace access', async () => {
    const live = getServer();
    const visitor = live.createClient();

    const unauthWs = await visitor.get('/workspace');
    expect(unauthWs.status).toBe(307);
    const loginLoc = parseRedirectLocation(unauthWs.location, live.baseUrl);
    expect(['127.0.0.1', 'localhost']).toContain(loginLoc.hostname);
    expect(loginLoc.pathname).toBe('/login');
    expect(loginLoc.searchParams.get('next')).toBe('/workspace');

    const loginPage = await visitor.get(`${loginLoc.pathname}${loginLoc.search}`);
    expect(loginPage.status).toBe(200);
    expect(loginPage.headers.get('content-type') ?? '').toContain('text/html');

    const loginRes = await visitor.login<AuthResponse>();
    expect(loginRes.status).toBe(200);
    expect(loginRes.data.success).toBe(true);
    expect(visitor.jar.has('grovia_session')).toBe(true);

    const authedLogin = await visitor.get('/login');
    expect(authedLogin.status).toBe(307);
    const wsLoc = parseRedirectLocation(authedLogin.location, live.baseUrl);
    expect(['127.0.0.1', 'localhost']).toContain(wsLoc.hostname);
    expect(wsLoc.pathname).toBe('/workspace');

    const authedWs = await visitor.get('/workspace');
    expect(authedWs.status).toBe(200);
    expect(authedWs.headers.get('content-type') ?? '').toContain('text/html');
  });

  test('T3.v2.4.2: Failed login keeps /workspace locked (307) until valid credentials succeed', async () => {
    const live = getServer();
    const client = live.createClient();

    const failedLogin = await client.login<AuthResponse>('admin@grovia.io', 'wrong-password-2026');
    expect(failedLogin.status).toBe(401);
    expect(failedLogin.data.success).toBe(false);
    expect(client.jar.has('grovia_session')).toBe(false);

    const lockedWs = await client.get('/workspace');
    expect(lockedWs.status).toBe(307);
    const lockedLoc = parseRedirectLocation(lockedWs.location, live.baseUrl);
    expect(['127.0.0.1', 'localhost']).toContain(lockedLoc.hostname);
    expect(lockedLoc.pathname).toBe('/login');
    expect(lockedLoc.searchParams.get('next')).toBe('/workspace');

    const validLogin = await client.login<AuthResponse>();
    expect(validLogin.status).toBe(200);
    expect(validLogin.data.success).toBe(true);
    expect(client.jar.has('grovia_session')).toBe(true);

    const unlockedWs = await client.get('/workspace');
    expect(unlockedWs.status).toBe(200);
    expect(unlockedWs.headers.get('content-type') ?? '').toContain('text/html');
  });

  test('T3.v2.4.3: Authenticated GET /login?next=//evil.com sanitizes redirect to internal /workspace', async () => {
    const live = getServer();
    const admin = live.createClient();
    expect((await admin.login<AuthResponse>()).status).toBe(200);

    const maliciousRedirect = await admin.get('/login?next=//evil.com');
    expect(maliciousRedirect.status).toBe(307);

    const loc = parseRedirectLocation(maliciousRedirect.location, live.baseUrl);
    expect(['127.0.0.1', 'localhost']).toContain(loc.hostname);
    expect(loc.hostname).not.toBe('evil.com');
    expect(loc.pathname).toBe('/workspace');

    const safeRedirect = await admin.get('/login?next=%2Fworkspace');
    expect(safeRedirect.status).toBe(307);
    const safeLoc = parseRedirectLocation(safeRedirect.location, live.baseUrl);
    expect(['127.0.0.1', 'localhost']).toContain(safeLoc.hostname);
    expect(safeLoc.pathname).toBe('/workspace');
  });
});
