import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { startLiveServer, type LiveServerHandle } from '../../harness/live-http';

interface ErrorBody {
  success: boolean;
  error: string;
}

let server: LiveServerHandle | undefined;

function getServer(): LiveServerHandle {
  if (!server) {
    throw new Error('Live server not initialized');
  }
  return server;
}

function assertRedirectDestination(
  location: string | null,
  expectedPathname: string,
  expectedSearch?: Record<string, string>
): void {
  expect(typeof location).toBe('string');
  const loc = new URL(location ?? '', getServer().baseUrl);
  expect(['127.0.0.1', 'localhost']).toContain(loc.hostname);
  expect(loc.pathname).toBe(expectedPathname);
  if (expectedSearch) {
    for (const [key, value] of Object.entries(expectedSearch)) {
      expect(loc.searchParams.get(key)).toBe(value);
    }
  }
}

beforeAll(async () => {
  server = await startLiveServer();
}, 120_000);

afterAll(async () => {
  await server?.stop();
});

describe('Tier 2 — F3 Boundaries: Open-Redirect Sanitization & Middleware API Guards', () => {
  test('T2.v2.3.1: Protocol-relative open-redirect targets (//evil.com, ///evil.com) sanitize to /workspace', async () => {
    const client = getServer().createClient();
    expect((await client.login()).status).toBe(200);

    for (const nextTarget of ['//evil.com', '///evil.com', '//evil.com/path']) {
      const res = await client.get<string>(`/login?next=${encodeURIComponent(nextTarget)}`);
      expect(res.status).toBe(307);
      assertRedirectDestination(res.location, '/workspace');
    }
  });

  test('T2.v2.3.2: Absolute and script scheme open-redirect targets sanitize to /workspace', async () => {
    const client = getServer().createClient();
    expect((await client.login()).status).toBe(200);

    for (const nextTarget of [
      'https://evil.com',
      'http://evil.com/login',
      'javascript:alert(1)',
    ]) {
      const res = await client.get<string>(`/login?next=${encodeURIComponent(nextTarget)}`);
      expect(res.status).toBe(307);
      assertRedirectDestination(res.location, '/workspace');
    }
  });

  test('T2.v2.3.3: Backslash and relative host bypass targets (/\\evil.com, /%5cevil.com, evil.com) sanitize to /workspace', async () => {
    const client = getServer().createClient();
    expect((await client.login()).status).toBe(200);

    for (const nextTarget of ['/\\evil.com', '/%5cevil.com', 'evil.com']) {
      const res = await client.get<string>(`/login?next=${encodeURIComponent(nextTarget)}`);
      expect(res.status).toBe(307);
      assertRedirectDestination(res.location, '/workspace');
    }
  });

  test('T2.v2.3.4: Safe relative next targets (/workspace, /workspace?tab=people) are preserved on local host', async () => {
    const client = getServer().createClient();
    expect((await client.login()).status).toBe(200);

    const plainRes = await client.get<string>('/login?next=%2Fworkspace');
    expect(plainRes.status).toBe(307);
    assertRedirectDestination(plainRes.location, '/workspace');

    const tabRes = await client.get<string>(
      `/login?next=${encodeURIComponent('/workspace?tab=people')}`
    );
    expect(tabRes.status).toBe(307);
    assertRedirectDestination(tabRes.location, '/workspace', { tab: 'people' });
  });

  test('T2.v2.3.5: Unauthenticated /workspace and /workspace/subpath redirect 307 to /login?next=...', async () => {
    const client = getServer().createClient();

    const rootRes = await client.get<string>('/workspace');
    expect(rootRes.status).toBe(307);
    assertRedirectDestination(rootRes.location, '/login', { next: '/workspace' });

    const subRes = await client.get<string>('/workspace/subpath');
    expect(subRes.status).toBe(307);
    assertRedirectDestination(subRes.location, '/login', { next: '/workspace/subpath' });
  });

  test('T2.v2.3.6: Protected /api/* routes with Accept: text/html and invalid cookie return 401 JSON, never 307 HTML', async () => {
    const client = getServer().createClient();
    const headers = {
      Accept: 'text/html,application/xhtml+xml',
      Cookie: 'grovia_session=invalid.signature',
    };

    for (const endpoint of ['/api/people', '/api/waitlist', '/api/inquiries', '/api/metrics']) {
      const res = await client.get<ErrorBody>(endpoint, { headers });
      expect(res.status).toBe(401);
      expect(res.headers.get('content-type')?.toLowerCase()).toContain('application/json');
      expect(res.data.success).toBe(false);
    }
  });
});
