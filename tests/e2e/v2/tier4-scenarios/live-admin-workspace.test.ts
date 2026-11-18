import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { startLiveServer, type LiveServerHandle } from '../../harness/live-http';
import { createRandomEmail } from '../../harness/fixtures';

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

interface SessionResponse {
  success: boolean;
  authenticated: boolean;
  user?: {
    id: number;
    email: string;
    name: string;
    role: string;
  };
  error?: string;
}

interface PersonRecord {
  id: string;
  name: string;
  email: string;
  role: string;
  team: string;
  city: string;
  status: string;
}

interface PeopleListResponse {
  success: boolean;
  people: PersonRecord[];
  count: number;
}

interface InviteResponse {
  success: boolean;
  person?: PersonRecord;
}

interface WaitlistEntry {
  id: number;
  email: string;
}

interface WaitlistListResponse {
  success: boolean;
  count: number;
  waitlist: WaitlistEntry[];
}

interface MetricsResponse {
  teamCount: number;
  waitlistCount: number;
  hiringCount: number;
  projectsCount: number;
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

describe('Tier 4 — Live HTTP Scenario: Admin Workspace & CookieJar Lifecycle (T4.v2.2)', () => {
  beforeAll(async () => {
    server = await startLiveServer();
  }, 120_000);

  afterAll(async () => {
    await server?.stop();
  });

  test('T4.v2.2.1: Plain HTTP login issues non-Secure grovia_session cookie and grants /workspace SSR', async () => {
    const live = getServer();
    const admin = live.createClient();

    const unauthWs = await admin.get('/workspace');
    expect(unauthWs.status).toBe(307);
    expect(unauthWs.location).toBeTruthy();
    const redirectLoc = new URL(unauthWs.location ?? '', live.baseUrl);
    expect(['127.0.0.1', 'localhost']).toContain(redirectLoc.hostname);
    expect(redirectLoc.pathname).toBe('/login');
    expect(redirectLoc.searchParams.get('next')).toBe('/workspace');

    const loginPage = await admin.get('/login');
    expect(loginPage.status).toBe(200);
    expect(loginPage.headers.get('content-type') ?? '').toContain('text/html');
    expect(loginPage.text).toContain('admin@grovia.io');

    const loginRes = await admin.login<AuthResponse>();
    expect(loginRes.status).toBe(200);
    expect(loginRes.data.success).toBe(true);
    expect(loginRes.data.user?.email).toBe('admin@grovia.io');
    expect(loginRes.data.user?.role).toBe('admin');

    const sessionSetCookie = loginRes.setCookies.find((cookie) =>
      cookie.startsWith('grovia_session=')
    );
    expect(sessionSetCookie).toBeDefined();
    expect(sessionSetCookie ?? '').toMatch(/HttpOnly/i);
    expect(sessionSetCookie ?? '').toMatch(/SameSite=Lax/i);
    expect(sessionSetCookie ?? '').not.toMatch(/;\s*Secure\b/i);

    expect(admin.jar.has('grovia_session')).toBe(true);
    expect(admin.jar.get('grovia_session')?.secure).toBe(false);

    const workspaceRes = await admin.get('/workspace');
    expect(workspaceRes.status).toBe(200);
    expect(workspaceRes.headers.get('content-type') ?? '').toContain('text/html');
    expect(workspaceRes.text).toContain('Overview');
    expect(workspaceRes.text).toContain('People');
    expect(workspaceRes.text).toContain('Payroll');

    const sessionRes = await admin.get<SessionResponse>('/api/auth/session');
    expect(sessionRes.status).toBe(200);
    expect(sessionRes.data.authenticated).toBe(true);
    expect(sessionRes.data.user?.email).toBe('admin@grovia.io');
  });

  test('T4.v2.2.2: Admin invites teammate, persists across fresh client re-login, and syncs waitlist/metrics', async () => {
    const live = getServer();
    const visitor = live.createClient();
    const visitorEmail = createRandomEmail('t4_admin_wl');

    const wlPost = await visitor.post<{ success: boolean }>('/api/waitlist', {
      name: 'Workspace Waitlist Lead',
      email: visitorEmail,
      company: 'ScaleWorks',
    });
    expect(wlPost.status).toBe(201);

    const admin = live.createClient();
    expect((await admin.login<AuthResponse>()).status).toBe(200);

    const initialPeople = await admin.get<PeopleListResponse>('/api/people');
    expect(initialPeople.status).toBe(200);
    expect(initialPeople.data.count).toBeGreaterThanOrEqual(10);
    expect(initialPeople.data.people.length).toBe(initialPeople.data.count);
    const beforePeopleCount = initialPeople.data.count;

    const inviteEmail = createRandomEmail('t4_maya_lin');
    const inviteRes = await admin.post<InviteResponse>('/api/people', {
      name: 'Maya Lin',
      email: inviteEmail,
      role: 'Staff Engineer',
      team: 'Engineering',
      city: 'Toronto',
    });
    expect(inviteRes.status).toBe(201);
    expect(inviteRes.data.success).toBe(true);
    expect(inviteRes.data.person?.name).toBe('Maya Lin');
    expect(inviteRes.data.person?.email).toBe(inviteEmail);
    expect(inviteRes.data.person?.status).toBe('Invited');

    const updatedPeople = await admin.get<PeopleListResponse>('/api/people');
    expect(updatedPeople.status).toBe(200);
    expect(updatedPeople.data.count).toBe(beforePeopleCount + 1);
    expect(
      updatedPeople.data.people.some(
        (person) => person.email === inviteEmail && person.status === 'Invited'
      )
    ).toBe(true);

    const freshAdmin = live.createClient();
    expect((await freshAdmin.login<AuthResponse>()).status).toBe(200);
    const freshPeople = await freshAdmin.get<PeopleListResponse>('/api/people');
    expect(freshPeople.status).toBe(200);
    expect(
      freshPeople.data.people.some(
        (person) =>
          person.email === inviteEmail &&
          person.name === 'Maya Lin' &&
          person.status === 'Invited'
      )
    ).toBe(true);

    const wlList = await freshAdmin.get<WaitlistListResponse>('/api/waitlist');
    expect(wlList.status).toBe(200);
    expect(wlList.data.waitlist.some((entry) => entry.email === visitorEmail)).toBe(true);

    const metrics = await freshAdmin.get<MetricsResponse>('/api/metrics');
    expect(metrics.status).toBe(200);
    expect(metrics.data.waitlistCount).toBe(wlList.data.count);
    expect(metrics.data.teamCount).toBe(84 + metrics.data.waitlistCount);
  });

  test('T4.v2.2.3: POST /api/auth/logout clears CookieJar via Max-Age=0 and revokes workspace/API access', async () => {
    const live = getServer();
    const admin = live.createClient();
    expect((await admin.login<AuthResponse>()).status).toBe(200);
    expect(admin.jar.has('grovia_session')).toBe(true);
    expect((await admin.get('/workspace')).status).toBe(200);

    const logoutRes = await admin.logout<{ success: boolean }>();
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.data.success).toBe(true);

    const clearedHeader = logoutRes.setCookies.find((cookie) =>
      cookie.startsWith('grovia_session=')
    );
    expect(clearedHeader).toBeDefined();
    expect(clearedHeader ?? '').toMatch(/Max-Age=0/i);
    expect(admin.jar.has('grovia_session')).toBe(false);

    const wsAfterLogout = await admin.get('/workspace');
    expect(wsAfterLogout.status).toBe(307);
    const loc = new URL(wsAfterLogout.location ?? '', live.baseUrl);
    expect(['127.0.0.1', 'localhost']).toContain(loc.hostname);
    expect(loc.pathname).toBe('/login');
    expect(loc.searchParams.get('next')).toBe('/workspace');

    const protectedEndpoints = [
      '/api/people',
      '/api/waitlist',
      '/api/metrics',
      '/api/auth/session',
    ];
    for (const endpoint of protectedEndpoints) {
      const res = await admin.get<ErrorResponse>(endpoint);
      expect(res.status).toBe(401);
      expect(res.data.success).toBe(false);
    }
  });
});
