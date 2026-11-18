import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createRandomEmail, fixtures } from '../../harness/fixtures';
import { startLiveServer, type LiveServerHandle } from '../../harness/live-http';

interface ErrorBody {
  success: boolean;
  error: string;
}

interface HealthBody {
  status: string;
  database: string;
}

interface RoiBody {
  projectedRoiMultiple: string;
  monthlyTrajectory: Array<{ month: string; revenue: number }>;
}

interface WaitlistPostBody {
  success: boolean;
  position: number;
}

interface WaitlistGetBody {
  success: boolean;
  count: number;
  waitlist: Array<{ email: string }>;
}

interface MetricsBody {
  teamCount: number;
  waitlistCount: number;
  pipeline: {
    interviews: number;
    hired: number;
    projectTime: number;
    output: number;
  };
}

interface InquiryPostBody {
  success: boolean;
  ticketId: string;
  status: string;
}

interface InquiryPatchBody {
  success: boolean;
  ticketId: string;
  status: string;
  priority: string;
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

interface PeopleGetBody {
  success: boolean;
  count: number;
  people: PersonRecord[];
}

interface PeoplePostBody {
  success: boolean;
  person: PersonRecord;
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

describe('Tier 1 — F4: Protected vs Public APIs & People/Invites', () => {
  test('T1.v2.4.1: Public APIs (/api/health, /api/roi, POST /api/waitlist) succeed without authentication', async () => {
    const client = getServer().createClient();

    const health = await client.get<HealthBody>('/api/health');
    expect(health.status).toBe(200);
    expect(health.data.status).toBe('ok');
    expect(health.data.database).toBe('healthy');

    const roi = await client.post<RoiBody>('/api/roi', fixtures.roi.standard);
    expect(roi.status).toBe(200);
    expect(roi.data.projectedRoiMultiple).toBe('4.2x');
    expect(Array.isArray(roi.data.monthlyTrajectory)).toBe(true);
    expect(roi.data.monthlyTrajectory.length).toBe(12);

    const waitlist = await client.post<WaitlistPostBody>('/api/waitlist', {
      ...fixtures.waitlist.minimal,
      email: createRandomEmail('public_api_t1'),
    });
    expect(waitlist.status).toBe(201);
    expect(waitlist.data.success).toBe(true);
    expect(waitlist.data.position).toBeGreaterThanOrEqual(1);
  });

  test('T1.v2.4.2: Unauthenticated GET /api/waitlist and GET /api/metrics return 401 JSON', async () => {
    const client = getServer().createClient();

    const waitlistRes = await client.get<ErrorBody>('/api/waitlist');
    expect(waitlistRes.status).toBe(401);
    expect(waitlistRes.data.success).toBe(false);
    expect(typeof waitlistRes.data.error).toBe('string');

    const metricsRes = await client.get<ErrorBody>('/api/metrics');
    expect(metricsRes.status).toBe(401);
    expect(metricsRes.data.success).toBe(false);
    expect(typeof metricsRes.data.error).toBe('string');
  });

  test('T1.v2.4.3: Unauthenticated GET/POST/PATCH /api/inquiries and PATCH /api/inquiries/[id] return 401 JSON', async () => {
    const client = getServer().createClient();

    const getRes = await client.get<ErrorBody>('/api/inquiries');
    expect(getRes.status).toBe(401);
    expect(getRes.data.success).toBe(false);

    const postRes = await client.post<ErrorBody>('/api/inquiries', fixtures.inquiries.standard);
    expect(postRes.status).toBe(401);
    expect(postRes.data.success).toBe(false);

    const patchCollectionRes = await client.patch<ErrorBody>('/api/inquiries', {
      ticketId: 'GROV-1001',
      status: 'open',
    });
    expect(patchCollectionRes.status).toBe(401);
    expect(patchCollectionRes.data.success).toBe(false);

    const patchItemRes = await client.patch<ErrorBody>('/api/inquiries/GROV-1001', {
      status: 'open',
    });
    expect(patchItemRes.status).toBe(401);
    expect(patchItemRes.data.success).toBe(false);
  });

  test('T1.v2.4.4: Unauthenticated GET /api/people and POST /api/people return 401 JSON', async () => {
    const client = getServer().createClient();

    const getRes = await client.get<ErrorBody>('/api/people');
    expect(getRes.status).toBe(401);
    expect(getRes.data.success).toBe(false);
    expect(typeof getRes.data.error).toBe('string');

    const postRes = await client.post<ErrorBody>('/api/people', {
      name: 'Unauth Invite',
      email: createRandomEmail('unauth_invite'),
      role: 'Engineer',
      team: 'Engineering',
    });
    expect(postRes.status).toBe(401);
    expect(postRes.data.success).toBe(false);
    expect(typeof postRes.data.error).toBe('string');
  });

  test('T1.v2.4.5: Authenticated GET /api/waitlist and GET /api/metrics succeed with consistent counts', async () => {
    const client = getServer().createClient();
    expect((await client.login()).status).toBe(200);

    const waitlistRes = await client.get<WaitlistGetBody>('/api/waitlist');
    expect(waitlistRes.status).toBe(200);
    expect(waitlistRes.data.success).toBe(true);
    expect(Array.isArray(waitlistRes.data.waitlist)).toBe(true);
    expect(waitlistRes.data.count).toBe(waitlistRes.data.waitlist.length);

    const metricsRes = await client.get<MetricsBody>('/api/metrics');
    expect(metricsRes.status).toBe(200);
    expect(metricsRes.data.pipeline).toBeDefined();
    expect(metricsRes.data.waitlistCount).toBe(waitlistRes.data.count);
    expect(metricsRes.data.teamCount).toBe(84 + metricsRes.data.waitlistCount);
  });

  test('T1.v2.4.6: Authenticated GET/POST /api/inquiries and PATCH /api/inquiries/[id] succeed', async () => {
    const client = getServer().createClient();
    expect((await client.login()).status).toBe(200);

    const listBefore = await client.get<{ success: boolean; count: number; inquiries: unknown[] }>(
      '/api/inquiries'
    );
    expect(listBefore.status).toBe(200);
    expect(listBefore.data.success).toBe(true);
    expect(Array.isArray(listBefore.data.inquiries)).toBe(true);

    const createRes = await client.post<InquiryPostBody>('/api/inquiries', {
      ...fixtures.inquiries.standard,
      email: createRandomEmail('auth_inq_t1'),
    });
    expect(createRes.status).toBe(201);
    expect(createRes.data.success).toBe(true);
    expect(createRes.data.ticketId).toMatch(/^GROV-/);
    expect(createRes.data.status).toBe('new');

    const patchRes = await client.patch<InquiryPatchBody>(
      `/api/inquiries/${createRes.data.ticketId}`,
      {
        status: 'in_progress',
        priority: 'urgent',
      }
    );
    expect(patchRes.status).toBe(200);
    expect(patchRes.data.success).toBe(true);
    expect(patchRes.data.ticketId).toBe(createRes.data.ticketId);
    expect(patchRes.data.status).toBe('in_progress');
    expect(patchRes.data.priority).toBe('urgent');
  });

  test('T1.v2.4.7: Authenticated GET /api/people returns >= 10 seeded people matching count', async () => {
    const client = getServer().createClient();
    expect((await client.login()).status).toBe(200);

    const res = await client.get<PeopleGetBody>('/api/people');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.people)).toBe(true);
    expect(res.data.people.length).toBeGreaterThanOrEqual(10);
    expect(res.data.count).toBe(res.data.people.length);
  });

  test('T1.v2.4.8: Authenticated POST /api/people creates teammate with status Invited', async () => {
    const client = getServer().createClient();
    expect((await client.login()).status).toBe(200);

    const inviteEmail = createRandomEmail('invite_t1');
    const res = await client.post<PeoplePostBody>('/api/people', {
      name: 'Nadia Vance',
      email: inviteEmail,
      role: 'Staff Security Engineer',
      team: 'Engineering',
      city: 'Berlin',
    });

    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.person.name).toBe('Nadia Vance');
    expect(res.data.person.email).toBe(inviteEmail.toLowerCase());
    expect(res.data.person.role).toBe('Staff Security Engineer');
    expect(res.data.person.team).toBe('Engineering');
    expect(res.data.person.city).toBe('Berlin');
    expect(res.data.person.status).toBe('Invited');
  });

  test('T1.v2.4.9: Newly invited teammate persists across subsequent GET /api/people requests', async () => {
    const client = getServer().createClient();
    expect((await client.login()).status).toBe(200);

    const inviteEmail = createRandomEmail('persist_invite_t1');
    const createRes = await client.post<PeoplePostBody>('/api/people', {
      name: 'Tariq Solis',
      email: inviteEmail,
      role: 'Operations Lead',
      team: 'Operations',
      city: 'Toronto',
    });
    expect(createRes.status).toBe(201);

    const freshClient = getServer().createClient();
    expect((await freshClient.login()).status).toBe(200);

    const listRes = await freshClient.get<PeopleGetBody>('/api/people');
    expect(listRes.status).toBe(200);

    const found = listRes.data.people.find((person) => person.email === inviteEmail.toLowerCase());
    expect(found).toBeDefined();
    expect(found?.name).toBe('Tariq Solis');
    expect(found?.role).toBe('Operations Lead');
    expect(found?.team).toBe('Operations');
    expect(found?.city).toBe('Toronto');
    expect(found?.status).toBe('Invited');
  });
});
