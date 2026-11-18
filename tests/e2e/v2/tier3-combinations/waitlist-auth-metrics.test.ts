import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { startLiveServer, type LiveServerHandle } from '../../harness/live-http';
import { createRandomEmail } from '../../harness/fixtures';

interface WaitlistEntry {
  id: number;
  name: string;
  email: string;
  company?: string | null;
  teamSize?: string | null;
  useCase?: string | null;
  status?: string;
}

interface WaitlistCreateResponse {
  success: boolean;
  message?: string;
  position?: number;
  error?: string;
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
  pipeline: {
    interviews: number;
    hired: number;
    projectTime: number;
    output: number;
  };
}

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

describe('Tier 3 — Combinations: Waitlist, Auth & Metrics (T3.v2.1)', () => {
  beforeAll(async () => {
    server = await startLiveServer();
  }, 120_000);

  afterAll(async () => {
    await server?.stop();
  });

  test('T3.v2.1.1: Public waitlist signup is gated on read until login and syncs metrics delta', async () => {
    const live = getServer();
    const baselineAdmin = live.createClient();
    const baselineLogin = await baselineAdmin.login<AuthResponse>();
    expect(baselineLogin.status).toBe(200);

    const beforeWaitlist = await baselineAdmin.get<WaitlistListResponse>('/api/waitlist');
    expect(beforeWaitlist.status).toBe(200);
    const beforeCount = beforeWaitlist.data.count;

    const beforeMetrics = await baselineAdmin.get<MetricsResponse>('/api/metrics');
    expect(beforeMetrics.status).toBe(200);
    expect(beforeMetrics.data.waitlistCount).toBe(beforeCount);
    expect(beforeMetrics.data.teamCount).toBe(84 + beforeCount);

    const visitor = live.createClient();
    const email = createRandomEmail('t3_wl_sync');
    const createRes = await visitor.post<WaitlistCreateResponse>('/api/waitlist', {
      name: 'Pairwise Waitlist User',
      email,
      company: 'Pairwise Labs',
      teamSize: '11-50',
      useCase: 'Cross-border onboarding',
    });
    expect(createRes.status).toBe(201);
    expect(createRes.data.success).toBe(true);
    expect(createRes.data.message).toBe('Added to waitlist');
    expect(typeof createRes.data.position).toBe('number');
    expect(createRes.data.position ?? 0).toBeGreaterThanOrEqual(1);

    const unauthWaitlist = await visitor.get<ErrorResponse>('/api/waitlist');
    expect(unauthWaitlist.status).toBe(401);
    expect(unauthWaitlist.data.success).toBe(false);

    const unauthMetrics = await visitor.get<ErrorResponse>('/api/metrics');
    expect(unauthMetrics.status).toBe(401);
    expect(unauthMetrics.data.success).toBe(false);

    const loginRes = await visitor.login<AuthResponse>();
    expect(loginRes.status).toBe(200);
    expect(loginRes.data.success).toBe(true);
    expect(visitor.jar.has('grovia_session')).toBe(true);

    const authedWaitlist = await visitor.get<WaitlistListResponse>('/api/waitlist');
    expect(authedWaitlist.status).toBe(200);
    expect(authedWaitlist.data.success).toBe(true);
    expect(authedWaitlist.data.count).toBe(beforeCount + 1);
    expect(authedWaitlist.data.waitlist.some((entry) => entry.email === email)).toBe(true);

    const authedMetrics = await visitor.get<MetricsResponse>('/api/metrics');
    expect(authedMetrics.status).toBe(200);
    expect(authedMetrics.data.waitlistCount).toBe(beforeCount + 1);
    expect(authedMetrics.data.teamCount).toBe(84 + authedMetrics.data.waitlistCount);
  });

  test('T3.v2.1.2: Multiple pre-login waitlist signups preserve ascending order and metrics count', async () => {
    const live = getServer();
    const admin = live.createClient();
    expect((await admin.login<AuthResponse>()).status).toBe(200);

    const beforeRes = await admin.get<WaitlistListResponse>('/api/waitlist');
    expect(beforeRes.status).toBe(200);
    const beforeCount = beforeRes.data.count;

    const visitor = live.createClient();
    const emailFirst = createRandomEmail('t3_wl_first');
    const emailSecond = createRandomEmail('t3_wl_second');

    const firstRes = await visitor.post<WaitlistCreateResponse>('/api/waitlist', {
      name: 'First Signup',
      email: emailFirst,
    });
    expect(firstRes.status).toBe(201);

    const secondRes = await visitor.post<WaitlistCreateResponse>('/api/waitlist', {
      name: 'Second Signup',
      email: emailSecond,
    });
    expect(secondRes.status).toBe(201);
    expect((secondRes.data.position ?? 0)).toBeGreaterThan(firstRes.data.position ?? 0);

    expect((await visitor.login<AuthResponse>()).status).toBe(200);

    const listRes = await visitor.get<WaitlistListResponse>('/api/waitlist');
    expect(listRes.status).toBe(200);
    expect(listRes.data.count).toBe(beforeCount + 2);
    expect(listRes.data.waitlist.length).toBe(listRes.data.count);

    const idxFirst = listRes.data.waitlist.findIndex((item) => item.email === emailFirst);
    const idxSecond = listRes.data.waitlist.findIndex((item) => item.email === emailSecond);
    expect(idxFirst).toBeGreaterThanOrEqual(0);
    expect(idxSecond).toBeGreaterThan(idxFirst);

    const metricsRes = await visitor.get<MetricsResponse>('/api/metrics');
    expect(metricsRes.status).toBe(200);
    expect(metricsRes.data.waitlistCount).toBe(listRes.data.count);
    expect(metricsRes.data.teamCount).toBe(84 + metricsRes.data.waitlistCount);
  });

  test('T3.v2.1.3: Logout restores 401 on waitlist and metrics reads while keeping POST waitlist public', async () => {
    const live = getServer();
    const client = live.createClient();
    expect((await client.login<AuthResponse>()).status).toBe(200);

    expect((await client.get<WaitlistListResponse>('/api/waitlist')).status).toBe(200);
    expect((await client.get<MetricsResponse>('/api/metrics')).status).toBe(200);

    const logoutRes = await client.logout<{ success: boolean }>();
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.data.success).toBe(true);
    expect(client.jar.has('grovia_session')).toBe(false);

    const postLogoutWaitlist = await client.get<ErrorResponse>('/api/waitlist');
    expect(postLogoutWaitlist.status).toBe(401);
    expect(postLogoutWaitlist.data.success).toBe(false);

    const postLogoutMetrics = await client.get<ErrorResponse>('/api/metrics');
    expect(postLogoutMetrics.status).toBe(401);
    expect(postLogoutMetrics.data.success).toBe(false);

    const publicEmail = createRandomEmail('t3_wl_postlogout');
    const publicSignup = await client.post<WaitlistCreateResponse>('/api/waitlist', {
      name: 'Post Logout Visitor',
      email: publicEmail,
    });
    expect(publicSignup.status).toBe(201);
    expect(publicSignup.data.success).toBe(true);
  });
});
