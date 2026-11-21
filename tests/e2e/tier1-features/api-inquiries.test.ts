import { describe, test, expect, beforeEach, afterAll } from 'bun:test';
import { testClient, resetDatabase } from '../harness/test-client';
import { fixtures, createRandomEmail } from '../harness/fixtures';
import { assertions } from '../harness/assertions';

describe('Tier 1 — F11: Inquiries Management Endpoint', () => {
  beforeEach(async () => {
    resetDatabase();
    await testClient.loginAsAdmin();
  });

  afterAll(() => {
    testClient.clearAuth();
  });

  test('T1.5.1: POST /api/inquiries creates ticket and returns 200/201 with success', async () => {
    const payload = {
      ...fixtures.inquiries.standard,
      email: createRandomEmail('inq'),
    };
    const res = await testClient.post('/api/inquiries', payload);
    expect([200, 201]).toContain(res.status);
    assertions.assertJsonHeaders(res);
    expect(res.data.success).toBe(true);
  });

  test('T1.5.2: Ticket ID matches format GROV-XXXX and initial status is "new"', async () => {
    const payload = {
      ...fixtures.inquiries.standard,
      email: createRandomEmail('ticket'),
    };
    const res = await testClient.post('/api/inquiries', payload);
    assertions.assertInquirySuccess(res.data);
  });

  test('T1.5.3: GET /api/inquiries lists submitted inquiries including new ticket', async () => {
    const payload = {
      ...fixtures.inquiries.general,
      email: createRandomEmail('list'),
    };
    const createRes = await testClient.post('/api/inquiries', payload);
    const ticketId = createRes.data.ticketId;

    const listRes = await testClient.get('/api/inquiries');
    assertions.assertStatus(listRes, 200);
    const items = listRes.data.inquiries || listRes.data;
    expect(Array.isArray(items)).toBe(true);
    expect(items.some((i: any) => i.ticketId === ticketId || i.ticket_id === ticketId)).toBe(true);
  });

  test('T1.5.4: PATCH /api/inquiries/:id transitions ticket status from "new" to "in_progress"', async () => {
    const payload = {
      ...fixtures.inquiries.standard,
      email: createRandomEmail('patch1'),
    };
    const createRes = await testClient.post('/api/inquiries', payload);
    const ticketId = createRes.data.ticketId;

    const patchRes = await testClient.patch(`/api/inquiries/${ticketId}`, {
      status: 'in_progress',
    });
    assertions.assertStatus(patchRes, 200);
    expect(patchRes.data.status).toBe('in_progress');
  });

  test('T1.5.5: PATCH /api/inquiries/:id transitions ticket status to "resolved"', async () => {
    const payload = {
      ...fixtures.inquiries.standard,
      email: createRandomEmail('patch2'),
    };
    const createRes = await testClient.post('/api/inquiries', payload);
    const ticketId = createRes.data.ticketId;

    const patchRes = await testClient.patch(`/api/inquiries/${ticketId}`, {
      status: 'resolved',
    });
    assertions.assertStatus(patchRes, 200);
    expect(patchRes.data.status).toBe('resolved');
  });

  test('T1.5.6: GET /api/inquiries?status=resolved filters tickets accurately', async () => {
    const payload = {
      ...fixtures.inquiries.standard,
      email: createRandomEmail('filter'),
    };
    const createRes = await testClient.post('/api/inquiries', payload);
    const ticketId = createRes.data.ticketId;

    await testClient.patch(`/api/inquiries/${ticketId}`, { status: 'resolved' });

    const filterRes = await testClient.get('/api/inquiries?status=resolved');
    assertions.assertStatus(filterRes, 200);
    const items = filterRes.data.inquiries || filterRes.data;
    expect(Array.isArray(items)).toBe(true);
    expect(items.every((i: any) => i.status === 'resolved')).toBe(true);
  });

  test('T1.5.7: Priority defaults to "medium" when omitted in creation request', async () => {
    const payload = {
      ...fixtures.inquiries.minimal,
      email: createRandomEmail('default_pri'),
    };
    const createRes = await testClient.post('/api/inquiries', payload);
    const ticketId = createRes.data.ticketId;

    const listRes = await testClient.get('/api/inquiries');
    const items = listRes.data.inquiries || listRes.data;
    const ticket = items.find((i: any) => i.ticketId === ticketId || i.ticket_id === ticketId);
    expect(ticket).toBeDefined();
    expect(ticket.priority).toBe('medium');
  });
});
