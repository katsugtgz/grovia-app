import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  isSameServerOrigin,
  startLiveServer,
  type LiveServerHandle,
} from '../../harness/live-http';

const SENSITIVE_PII_MARKERS = [
  ...Array.from({ length: 10 }, (_, idx) => `Demo Person ${String(idx + 1).padStart(2, '0')}`),
  ...Array.from(
    { length: 10 },
    (_, idx) => `person${String(idx + 1).padStart(2, '0')}@example.invalid`
  ),
  '$4,850',
];

let server: LiveServerHandle | undefined;

function getServer(): LiveServerHandle {
  if (!server) {
    throw new Error('Live server not initialized');
  }
  return server;
}

function assertLocalRedirect(location: string | null, expectedPathname: string, expectedNext?: string): void {
  expect(typeof location).toBe('string');
  const loc = new URL(location ?? '', getServer().baseUrl);
  expect(isSameServerOrigin(loc, getServer().baseUrl)).toBe(true);
  expect(loc.pathname).toBe(expectedPathname);
  if (expectedNext !== undefined) {
    expect(loc.searchParams.get('next')).toBe(expectedNext);
  }
}

beforeAll(async () => {
  server = await startLiveServer();
}, 120_000);

afterAll(async () => {
  await server?.stop();
});

describe('Tier 1 — F3: /workspace Route & Edge Middleware Guard', () => {
  test('T1.v2.3.1: Unauthenticated GET /workspace returns 307 redirecting to /login?next=%2Fworkspace', async () => {
    const client = getServer().createClient();
    const res = await client.get<string>('/workspace');

    expect(res.status).toBe(307);
    assertLocalRedirect(res.location, '/login', '/workspace');
  });

  test('T1.v2.3.2: Unauthenticated GET /workspace redirect response body leaks zero employee PII', async () => {
    const client = getServer().createClient();
    const res = await client.get<string>('/workspace');

    expect(res.status).toBe(307);
    for (const marker of SENSITIVE_PII_MARKERS) {
      expect(res.text).not.toContain(marker);
    }
  });

  test(
    'T1.v2.3.3: Authenticated GET /workspace returns 200 HTML containing Bento workspace sections',
    async () => {
      const client = getServer().createClient();
      expect((await client.login()).status).toBe(200);

      const res = await client.get<string>('/workspace');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')?.toLowerCase()).toContain('text/html');
      expect(res.text).toContain('id="app"');
      expect(res.text).toContain('id="view-overview"');
      expect(res.text).toContain('aria-label="Grovia workspace"');
      expect(res.text).toContain('Overview');
      expect(res.text).toContain('People');
      expect(res.text).toContain('Payroll');
    },
    { timeout: 15_000 }
  );

  test('T1.v2.3.4: Authenticated GET /login returns 307 redirecting to /workspace', async () => {
    const client = getServer().createClient();
    expect((await client.login()).status).toBe(200);

    const res = await client.get<string>('/login');
    expect(res.status).toBe(307);
    assertLocalRedirect(res.location, '/workspace');
  });

  test('T1.v2.3.5: Authenticated GET /login?next=%2Fworkspace redirects 307 to /workspace', async () => {
    const client = getServer().createClient();
    expect((await client.login()).status).toBe(200);

    const res = await client.get<string>('/login?next=%2Fworkspace');
    expect(res.status).toBe(307);
    assertLocalRedirect(res.location, '/workspace');
  });

  test(
    'T1.v2.3.6: Post-logout GET /workspace reverts to 307 -> /login?next=%2Fworkspace',
    async () => {
      const client = getServer().createClient();
      expect((await client.login()).status).toBe(200);

      const authedRes = await client.get<string>('/workspace');
      expect(authedRes.status).toBe(200);

      const logoutRes = await client.logout();
      expect(logoutRes.status).toBe(200);
      expect(client.jar.has('grovia_session')).toBe(false);

      const postLogoutRes = await client.get<string>('/workspace');
      expect(postLogoutRes.status).toBe(307);
      assertLocalRedirect(postLogoutRes.location, '/login', '/workspace');
    },
    { timeout: 15_000 }
  );
});
