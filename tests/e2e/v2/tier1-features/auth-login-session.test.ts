import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { startLiveServer, type LiveServerHandle } from '../../harness/live-http';

interface AuthUser {
  id: number | string;
  email: string;
  name: string;
  role: string;
}

interface LoginResponse {
  success: boolean;
  user: AuthUser;
}

interface SessionSuccessResponse {
  success: boolean;
  authenticated: boolean;
  user: AuthUser;
}

interface SessionErrorResponse {
  success: boolean;
  authenticated: boolean;
  error: string;
}

interface LogoutResponse {
  success: boolean;
}

let server: LiveServerHandle | undefined;

function getServer(): LiveServerHandle {
  if (!server) {
    throw new Error('Live server not initialized');
  }
  return server;
}

beforeAll(async () => {
  server = await startLiveServer();
}, 120_000);

afterAll(async () => {
  await server?.stop();
});

describe('Tier 1 — F2: Login Page (/login) & Auth/Session Engine', () => {
  test(
    'T1.v2.2.1: GET /login (unauthenticated) returns 200 HTML with email/password inputs, submit control, and demo hint',
    async () => {
      const client = getServer().createClient();
      const res = await client.get<string>('/login');

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')?.toLowerCase()).toContain('text/html');
      expect(res.text).toMatch(/type=["']email["']|name=["']email["']/i);
      expect(res.text).toMatch(/type=["']password["']|name=["']password["']/i);
      expect(res.text).toMatch(/type=["']submit["']|<button[\s>]/i);
      expect(res.text).toContain('admin@grovia.io');
    },
    { timeout: 15_000 }
  );

  test('T1.v2.2.2: POST /api/auth/login with seeded admin credentials returns 200 and user profile', async () => {
    const client = getServer().createClient();
    const res = await client.login('admin@grovia.io', 'grovia-demo-2026');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')?.toLowerCase()).toContain('application/json');

    const body = res.data as LoginResponse;
    expect(body.success).toBe(true);
    expect(body.user).toBeDefined();
    expect(['string', 'number']).toContain(typeof body.user.id);
    expect(String(body.user.id).length).toBeGreaterThan(0);
    expect(body.user.email).toBe('admin@grovia.io');
    expect(body.user.name).toBe('Alex Rivera');
    expect(body.user.role).toBe('admin');
  });

  test('T1.v2.2.3: POST /api/auth/login sets grovia_session cookie with HttpOnly, SameSite=Lax, Path=/, Max-Age=86400 and no Secure over HTTP', async () => {
    const client = getServer().createClient();
    const res = await client.login();

    expect(res.status).toBe(200);
    const sessionHeader = res.setCookies.find((header) =>
      header.toLowerCase().startsWith('grovia_session=')
    );
    expect(sessionHeader).toBeDefined();

    const stored = client.jar.get('grovia_session');
    expect(stored).toBeDefined();
    expect(stored?.value.length).toBeGreaterThan(0);
    expect(stored?.httpOnly).toBe(true);
    expect(stored?.sameSite?.toLowerCase()).toBe('lax');
    expect(stored?.path).toBe('/');
    expect(stored?.maxAge).toBe(86400);
    expect(stored?.secure).toBe(false);
  });

  test('T1.v2.2.4: GET /api/auth/session with valid grovia_session returns 200 authenticated user', async () => {
    const client = getServer().createClient();
    const loginRes = await client.login();
    expect(loginRes.status).toBe(200);

    const res = await client.get<SessionSuccessResponse>('/api/auth/session');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')?.toLowerCase()).toContain('application/json');
    expect(res.data.success).toBe(true);
    expect(res.data.authenticated).toBe(true);
    expect(res.data.user.email).toBe('admin@grovia.io');
    expect(res.data.user.name).toBe('Alex Rivera');
    expect(res.data.user.role).toBe('admin');
    expect(['string', 'number']).toContain(typeof res.data.user.id);
    expect(String(res.data.user.id).length).toBeGreaterThan(0);
  });

  test('T1.v2.2.5: GET /api/auth/session without cookie returns 401 unauthenticated error', async () => {
    const client = getServer().createClient();
    const res = await client.get<SessionErrorResponse>('/api/auth/session');

    expect(res.status).toBe(401);
    expect(res.headers.get('content-type')?.toLowerCase()).toContain('application/json');
    expect(res.data.success).toBe(false);
    expect(res.data.authenticated).toBe(false);
    expect(typeof res.data.error).toBe('string');
    expect(res.data.error.length).toBeGreaterThan(0);
  });

  test('T1.v2.2.6: POST /api/auth/logout clears grovia_session cookie (Max-Age=0) and invalidates subsequent session checks', async () => {
    const client = getServer().createClient();
    expect((await client.login()).status).toBe(200);
    expect(client.jar.has('grovia_session')).toBe(true);

    const logoutRes = await client.logout<LogoutResponse>();
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.data.success).toBe(true);

    const clearHeader = logoutRes.setCookies.find((header) =>
      header.toLowerCase().startsWith('grovia_session=')
    );
    expect(clearHeader).toBeDefined();
    expect(clearHeader?.toLowerCase()).toContain('max-age=0');
    expect(client.jar.has('grovia_session')).toBe(false);

    const afterSession = await client.get<SessionErrorResponse>('/api/auth/session');
    expect(afterSession.status).toBe(401);
    expect(afterSession.data.authenticated).toBe(false);
  });

  test('T1.v2.2.7: POST /api/auth/login normalizes email casing and surrounding whitespace', async () => {
    const client = getServer().createClient();
    const loginRes = await client.login('  ADMIN@GROVIA.IO  ', 'grovia-demo-2026');

    expect(loginRes.status).toBe(200);
    const loginBody = loginRes.data as LoginResponse;
    expect(loginBody.success).toBe(true);
    expect(loginBody.user.email).toBe('admin@grovia.io');

    const sessionRes = await client.get<SessionSuccessResponse>('/api/auth/session');
    expect(sessionRes.status).toBe(200);
    expect(sessionRes.data.authenticated).toBe(true);
    expect(sessionRes.data.user.email).toBe('admin@grovia.io');
  });
});
