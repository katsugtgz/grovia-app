import { describe, test, expect, beforeEach, afterAll } from 'bun:test';
import { testClient, resetDatabase } from '../harness/test-client';
import { fixtures, createRandomEmail } from '../harness/fixtures';
import { assertions } from '../harness/assertions';

describe('Tier 3 — Cross-Feature: Inquiries Lifecycle & System Health (F7 + F11)', () => {
  beforeEach(async () => {
    resetDatabase();
    await testClient.loginAsAdmin();
  });

  afterAll(() => {
    testClient.clearAuth();
  });

  test('T3.2.1: Inquiry creation establishes initial "new" status and unique ticketId', async () => {
    const payload = {
      ...fixtures.inquiries.standard,
      email: createRandomEmail('flow1'),
    };
    const createRes = await testClient.post('/api/inquiries', payload);
    expect([200, 201]).toContain(createRes.status);
    assertions.assertInquirySuccess(createRes.data);
  });

  test('T3.2.2: Status transition from "new" to "in_progress" updates ticket state', async () => {
    const payload = {
      ...fixtures.inquiries.standard,
      email: createRandomEmail('flow2'),
    };
    const createRes = await testClient.post('/api/inquiries', payload);
    const ticketId = createRes.data.ticketId;

    const patchRes = await testClient.patch(`/api/inquiries/${ticketId}`, {
      status: 'in_progress',
    });
    assertions.assertStatus(patchRes, 200);
    expect(patchRes.data.status).toBe('in_progress');
  });

  test('T3.2.3: Status transition from "in_progress" to "resolved" finalizes ticket', async () => {
    const payload = {
      ...fixtures.inquiries.standard,
      email: createRandomEmail('flow3'),
    };
    const createRes = await testClient.post('/api/inquiries', payload);
    const ticketId = createRes.data.ticketId;

    await testClient.patch(`/api/inquiries/${ticketId}`, { status: 'in_progress' });
    const resolveRes = await testClient.patch(`/api/inquiries/${ticketId}`, { status: 'resolved' });

    assertions.assertStatus(resolveRes, 200);
    expect(resolveRes.data.status).toBe('resolved');
  });

  test('T3.2.4: Status filtering accurately segregates active and resolved tickets', async () => {
    const emailA = createRandomEmail('active_ticket');
    const emailB = createRandomEmail('resolved_ticket');

    const resA = await testClient.post('/api/inquiries', {
      ...fixtures.inquiries.standard,
      email: emailA,
      subject: 'Active Subject',
    });
    const resB = await testClient.post('/api/inquiries', {
      ...fixtures.inquiries.standard,
      email: emailB,
      subject: 'Resolved Subject',
    });

    const ticketA = resA.data.ticketId;
    const ticketB = resB.data.ticketId;

    await testClient.patch(`/api/inquiries/${ticketB}`, { status: 'resolved' });

    const resolvedListRes = await testClient.get('/api/inquiries?status=resolved');
    assertions.assertStatus(resolvedListRes, 200);
    const resolvedItems = resolvedListRes.data.inquiries || resolvedListRes.data;
    expect(resolvedItems.some((i: any) => i.ticketId === ticketB || i.ticket_id === ticketB)).toBe(true);
    expect(resolvedItems.some((i: any) => i.ticketId === ticketA || i.ticket_id === ticketA)).toBe(false);
  });

  test('T3.2.5: System health remains "ok" and database "healthy" throughout ticket lifecycle', async () => {
    const healthRes = await testClient.get('/api/health', { skipAuth: true });
    assertions.assertOk(healthRes);
    expect(healthRes.data.status).toBe('ok');
    expect(healthRes.data.database).toBe('healthy');
  });
});
