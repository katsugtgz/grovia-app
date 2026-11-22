import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createRandomEmail, fixtures } from '../../harness/fixtures';
import { startLiveServer, type LiveServerHandle } from '../../harness/live-http';

interface ErrorBody {
  success: boolean;
  error: string;
}

interface PeoplePostBody {
  success: boolean;
  person: {
    id: string;
    name: string;
    email: string;
    role: string;
    team: string;
    city: string;
    status: string;
  };
}

interface InquiryPostBody {
  success: boolean;
  ticketId: string;
  status: string;
}

let server: LiveServerHandle | undefined;

function getServer(): LiveServerHandle {
  if (!server) {
    throw new Error('Live server not initialized');
  }
  return server;
}

function assertAllowContains(allowHeader: string | null, expectedMethods: string[]): void {
  expect(typeof allowHeader).toBe('string');
  const tokens = (allowHeader ?? '')
    .split(',')
    .map((m) => m.trim().toUpperCase())
    .filter((m) => m.length > 0);
  for (const expected of expectedMethods) {
    expect(tokens).toContain(expected);
  }
}

beforeAll(async () => {
  server = await startLiveServer();
}, 120_000);

afterAll(async () => {
  await server?.stop();
});

describe('Tier 2 — F4 Boundaries: People/API Validation, 405 Allow Headers, 404 Auth Ordering & Injection Safety', () => {
  test('T2.v2.4.1: Authenticated POST /api/people returns 409 on seeded, invited, and case-variant duplicate emails', async () => {
    const client = getServer().createClient();
    expect((await client.login()).status).toBe(200);

    const seededDup = await client.post<ErrorBody>('/api/people', {
      name: 'Duplicate Seeded',
      email: 'person01@example.invalid',
      role: 'Designer',
      team: 'Design',
    });
    expect(seededDup.status).toBe(409);
    expect(seededDup.data.success).toBe(false);
    expect(seededDup.data.error).toBe('A team member with this email already exists');

    const invitedEmail = createRandomEmail('dup_invite_t2').toLowerCase();
    const created = await client.post<PeoplePostBody>('/api/people', {
      name: 'First Invite',
      email: invitedEmail,
      role: 'Product Manager',
      team: 'Product',
    });
    expect(created.status).toBe(201);

    const upperDup = await client.post<ErrorBody>('/api/people', {
      name: 'Case Variant Duplicate',
      email: invitedEmail.toUpperCase(),
      role: 'Product Manager',
      team: 'Product',
    });
    expect(upperDup.status).toBe(409);
    expect(upperDup.data.success).toBe(false);
    expect(upperDup.data.error).toBe('A team member with this email already exists');
  });

  test('T2.v2.4.2: Authenticated POST /api/people rejects empty, malformed, missing fields, bad email, and negative rate with 400', async () => {
    const client = getServer().createClient();
    expect((await client.login()).status).toBe(200);

    for (const raw of ['', '{bad']) {
      const res = await client.post<ErrorBody>('/api/people', raw, {
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
    }

    const badPayloads: unknown[] = [
      { email: createRandomEmail('no_name'), role: 'Engineer', team: 'Engineering' },
      { name: 'No Email', role: 'Engineer', team: 'Engineering' },
      { name: 'No Role', email: createRandomEmail('no_role'), team: 'Engineering' },
      { name: 'No Team', email: createRandomEmail('no_team'), role: 'Engineer' },
      { name: 'Bad Email', email: 'bad-email', role: 'Engineer', team: 'Engineering' },
      {
        name: 'Negative Rate',
        email: createRandomEmail('neg_rate'),
        role: 'Engineer',
        team: 'Engineering',
        rate: -10,
      },
    ];

    for (const payload of badPayloads) {
      const res = await client.post<ErrorBody>('/api/people', payload);
      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
    }
  });

  test('T2.v2.4.3: Authenticated PUT, PATCH, DELETE on /api/people return 405 with Allow: GET, POST', async () => {
    const client = getServer().createClient();
    expect((await client.login()).status).toBe(200);

    for (const method of ['PUT', 'PATCH', 'DELETE'] as const) {
      const res = await client.request<ErrorBody>(method, '/api/people');
      expect(res.status).toBe(405);
      expect(res.data.success).toBe(false);
      assertAllowContains(res.headers.get('allow'), ['GET', 'POST']);
    }
  });

  test('T2.v2.4.4: Authenticated unsupported methods on /api/waitlist, /api/inquiries, /api/inquiries/[id], /api/metrics return 405 + Allow', async () => {
    const client = getServer().createClient();
    expect((await client.login()).status).toBe(200);

    for (const method of ['PUT', 'DELETE', 'PATCH'] as const) {
      const res = await client.request<ErrorBody>(method, '/api/waitlist');
      expect(res.status).toBe(405);
      assertAllowContains(res.headers.get('allow'), ['GET', 'POST']);
    }

    for (const method of ['PUT', 'DELETE'] as const) {
      const res = await client.request<ErrorBody>(method, '/api/inquiries');
      expect(res.status).toBe(405);
      assertAllowContains(res.headers.get('allow'), ['GET', 'POST', 'PATCH']);
    }

    for (const method of ['GET', 'POST', 'PUT', 'DELETE'] as const) {
      const res = await client.request<ErrorBody>(method, '/api/inquiries/GROV-1001');
      expect(res.status).toBe(405);
      assertAllowContains(res.headers.get('allow'), ['PATCH']);
    }

    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH'] as const) {
      const res = await client.request<ErrorBody>(method, '/api/metrics');
      expect(res.status).toBe(405);
      assertAllowContains(res.headers.get('allow'), ['GET']);
    }
  });

  test('T2.v2.4.5: PATCH /api/inquiries/GROV-NONEXISTENT returns 401 unauthenticated and 404 authenticated', async () => {
    const unauthClient = getServer().createClient();
    const unauthRes = await unauthClient.patch<ErrorBody>('/api/inquiries/GROV-NONEXISTENT', {
      status: 'resolved',
    });
    expect(unauthRes.status).toBe(401);
    expect(unauthRes.data.success).toBe(false);

    const authClient = getServer().createClient();
    expect((await authClient.login()).status).toBe(200);
    const authRes = await authClient.patch<ErrorBody>('/api/inquiries/GROV-NONEXISTENT', {
      status: 'resolved',
    });
    expect(authRes.status).toBe(404);
    expect(authRes.data.success).toBe(false);
  });

  test('T2.v2.4.6: Authenticated POST /api/inquiries and POST /api/people handle SQLi/XSS payloads safely without 500s', async () => {
    const client = getServer().createClient();
    expect((await client.login()).status).toBe(200);

    const inqEmail = createRandomEmail('sqli_inq_t2');
    const inqRes = await client.post<InquiryPostBody>('/api/inquiries', {
      ...fixtures.inquiries.standard,
      name: "Robert'); DROP TABLE inquiries;--",
      email: inqEmail,
      subject: "<script>alert('xss')</script>",
    });
    expect(inqRes.status).toBe(201);
    expect(inqRes.data.success).toBe(true);
    expect(inqRes.data.ticketId).toMatch(/^GROV-/);

    const pplEmail = createRandomEmail('sqli_ppl_t2');
    const pplRes = await client.post<PeoplePostBody>('/api/people', {
      name: "<script>alert('xss')</script>",
      email: pplEmail,
      role: "Engineer'; DROP TABLE people;--",
      team: 'Engineering',
      city: "' OR 1=1 --",
    });
    expect(pplRes.status).toBe(201);
    expect(pplRes.data.success).toBe(true);
    expect(pplRes.data.person.name).toBe("<script>alert('xss')</script>");

    const listInquiries = await client.get<{ success: boolean }>('/api/inquiries');
    expect(listInquiries.status).toBe(200);
    expect(listInquiries.data.success).toBe(true);

    const listPeople = await client.get<{ success: boolean }>('/api/people');
    expect(listPeople.status).toBe(200);
    expect(listPeople.data.success).toBe(true);
  });
});
