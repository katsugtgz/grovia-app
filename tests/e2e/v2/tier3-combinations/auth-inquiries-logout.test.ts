import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { startLiveServer, type LiveServerHandle } from '../../harness/live-http';
import { createRandomEmail } from '../../harness/fixtures';

interface InquiryCreateResponse {
  success: boolean;
  ticketId: string;
  status: string;
  message?: string;
}

interface InquiryPatchResponse {
  success: boolean;
  ticketId: string;
  status: string;
  priority: string;
  updatedAt?: string;
}

interface InquiryItem {
  ticketId?: string;
  ticket_id?: string;
  email: string;
  subject: string;
  status: string;
  priority: string;
}

interface InquiriesListResponse {
  success: boolean;
  count: number;
  inquiries: InquiryItem[];
}

interface AuthResponse {
  success: boolean;
  user?: {
    id: number;
    email: string;
    name: string;
    role: string;
  };
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

function getTicketId(item: InquiryItem): string | undefined {
  return item.ticketId ?? item.ticket_id;
}

describe('Tier 3 — Combinations: Auth, Inquiries & Logout (T3.v2.3)', () => {
  beforeAll(async () => {
    server = await startLiveServer();
  }, 120_000);

  afterAll(async () => {
    await server?.stop();
  });

  test('T3.v2.3.1: Inquiries create/patch/filter lifecycle requires auth and revokes on logout', async () => {
    const live = getServer();
    const client = live.createClient();
    const submitterEmail = createRandomEmail('t3_inq_lifecycle');

    const unauthCreate = await client.post<ErrorResponse>('/api/inquiries', {
      name: 'Unauth Inquiry',
      email: submitterEmail,
      subject: 'Blocked Request',
      message: 'Should be rejected with 401 before login.',
    });
    expect(unauthCreate.status).toBe(401);
    expect(unauthCreate.data.success).toBe(false);

    expect((await client.login<AuthResponse>()).status).toBe(200);

    const createRes = await client.post<InquiryCreateResponse>('/api/inquiries', {
      name: 'Security Reviewer',
      email: submitterEmail,
      subject: 'SOC2 Type II Documentation',
      message: 'Requesting latest audit controls and access review schedule.',
      priority: 'high',
    });
    expect(createRes.status).toBe(201);
    expect(createRes.data.success).toBe(true);
    expect(createRes.data.ticketId).toMatch(/^GROV-/);
    expect(createRes.data.status).toBe('new');

    const ticketId = createRes.data.ticketId;

    const patchRes = await client.patch<InquiryPatchResponse>(`/api/inquiries/${ticketId}`, {
      status: 'in_progress',
      priority: 'urgent',
    });
    expect(patchRes.status).toBe(200);
    expect(patchRes.data.success).toBe(true);
    expect(patchRes.data.ticketId).toBe(ticketId);
    expect(patchRes.data.status).toBe('in_progress');
    expect(patchRes.data.priority).toBe('urgent');

    const filteredRes = await client.get<InquiriesListResponse>('/api/inquiries?status=in_progress');
    expect(filteredRes.status).toBe(200);
    expect(filteredRes.data.success).toBe(true);
    const matched = filteredRes.data.inquiries.find((item) => getTicketId(item) === ticketId);
    expect(matched).toBeDefined();
    expect(matched?.status).toBe('in_progress');
    expect(matched?.priority).toBe('urgent');

    expect((await client.logout<{ success: boolean }>()).status).toBe(200);
    expect(client.jar.has('grovia_session')).toBe(false);

    const postLogoutGet = await client.get<ErrorResponse>('/api/inquiries');
    expect(postLogoutGet.status).toBe(401);

    const postLogoutPatch = await client.patch<ErrorResponse>(`/api/inquiries/${ticketId}`, {
      status: 'resolved',
    });
    expect(postLogoutPatch.status).toBe(401);
  });

  test('T3.v2.3.2: Body-style PATCH /api/inquiries updates status and revokes after logout', async () => {
    const live = getServer();
    const client = live.createClient();
    expect((await client.login<AuthResponse>()).status).toBe(200);

    const createRes = await client.post<InquiryCreateResponse>('/api/inquiries', {
      name: 'Body Patch Submitter',
      email: createRandomEmail('t3_inq_bodypatch'),
      subject: 'Payroll Export Format',
      message: 'Confirming CSV vs JSON schema options for payroll exports.',
      priority: 'medium',
    });
    expect(createRes.status).toBe(201);
    const ticketId = createRes.data.ticketId;

    const patchRes = await client.patch<InquiryPatchResponse>('/api/inquiries', {
      ticketId,
      status: 'open',
    });
    expect(patchRes.status).toBe(200);
    expect(patchRes.data.success).toBe(true);
    expect(patchRes.data.ticketId).toBe(ticketId);
    expect(patchRes.data.status).toBe('open');

    expect((await client.logout<{ success: boolean }>()).status).toBe(200);

    const postLogoutPatch = await client.patch<ErrorResponse>('/api/inquiries', {
      ticketId,
      status: 'closed',
    });
    expect(postLogoutPatch.status).toBe(401);
  });

  test('T3.v2.3.3: Updated inquiry status persists across logout and fresh re-login', async () => {
    const live = getServer();
    const firstSession = live.createClient();
    expect((await firstSession.login<AuthResponse>()).status).toBe(200);

    const createRes = await firstSession.post<InquiryCreateResponse>('/api/inquiries', {
      name: 'Persistence Submitter',
      email: createRandomEmail('t3_inq_persist'),
      subject: 'SSO SAML Metadata',
      message: 'Need IdP ACS URL and entity ID for enterprise rollout.',
      priority: 'low',
    });
    expect(createRes.status).toBe(201);
    const ticketId = createRes.data.ticketId;

    const patchRes = await firstSession.patch<InquiryPatchResponse>(`/api/inquiries/${ticketId}`, {
      status: 'resolved',
      priority: 'high',
    });
    expect(patchRes.status).toBe(200);

    expect((await firstSession.logout<{ success: boolean }>()).status).toBe(200);

    const secondSession = live.createClient();
    expect((await secondSession.login<AuthResponse>()).status).toBe(200);

    const listRes = await secondSession.get<InquiriesListResponse>('/api/inquiries');
    expect(listRes.status).toBe(200);
    const persisted = listRes.data.inquiries.find((item) => getTicketId(item) === ticketId);
    expect(persisted).toBeDefined();
    expect(persisted?.status).toBe('resolved');
    expect(persisted?.priority).toBe('high');
  });
});
