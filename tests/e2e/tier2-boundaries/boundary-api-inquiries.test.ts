import { describe, test, expect, beforeEach, afterAll } from 'bun:test';
import { testClient, resetDatabase } from '../harness/test-client';
import { fixtures, createRandomEmail } from '../harness/fixtures';
import { assertions } from '../harness/assertions';

describe('Tier 2 — Boundary: Inquiries Management Endpoint', () => {
  beforeEach(async () => {
    resetDatabase();
    await testClient.loginAsAdmin();
  });

  afterAll(() => {
    testClient.clearAuth();
  });

  test('T2.3.1: Missing subject field returns HTTP 400 Bad Request', async () => {
    const res = await testClient.post('/api/inquiries', {
      name: 'No Subject',
      email: createRandomEmail('nosubj'),
      message: 'This is a message with sufficient length but no subject.',
    });
    assertions.assertStatus(res, 400);
  });

  test('T2.3.2: Missing message field returns HTTP 400 Bad Request', async () => {
    const res = await testClient.post('/api/inquiries', {
      name: 'No Message',
      email: createRandomEmail('nomsg'),
      subject: 'Inquiry without message',
    });
    assertions.assertStatus(res, 400);
  });

  test('T2.3.3: Message shorter than 10 characters returns HTTP 400', async () => {
    const res = await testClient.post('/api/inquiries', {
      name: 'Short Message Submitter',
      email: createRandomEmail('short'),
      subject: 'Valid Subject',
      message: 'Too short',
    });
    assertions.assertStatus(res, 400);
  });

  test('T2.3.4: Missing email field returns HTTP 400 Bad Request', async () => {
    const res = await testClient.post('/api/inquiries', {
      name: 'No Email User',
      subject: 'Missing Email Test',
      message: 'Valid length message without an email address provided.',
    });
    assertions.assertStatus(res, 400);
  });

  test('T2.3.5: Invalid priority enum value returns HTTP 400', async () => {
    const res = await testClient.post('/api/inquiries', {
      name: 'Priority Tester',
      email: createRandomEmail('badpri'),
      subject: 'Priority Check',
      message: 'Testing an invalid priority level on submission.',
      priority: 'super-urgent',
    });
    assertions.assertStatus(res, 400);
  });

  test('T2.3.6: Invalid status transition in PATCH returns HTTP 400', async () => {
    const createRes = await testClient.post('/api/inquiries', {
      ...fixtures.inquiries.standard,
      email: createRandomEmail('statustest'),
    });
    const ticketId = createRes.data.ticketId;

    const patchRes = await testClient.patch(`/api/inquiries/${ticketId}`, {
      status: 'exploded_and_gone',
    });
    assertions.assertStatus(patchRes, 400);
  });

  test('T2.3.7: PATCH on non-existent ticket ID returns HTTP 404 Not Found', async () => {
    const patchRes = await testClient.patch('/api/inquiries/GROV-999999', {
      status: 'in_progress',
    });
    assertions.assertStatus(patchRes, 404);
  });

  test('T2.3.8: Empty body in PATCH request returns HTTP 400 Bad Request', async () => {
    const createRes = await testClient.post('/api/inquiries', {
      ...fixtures.inquiries.standard,
      email: createRandomEmail('emptypatch'),
    });
    const ticketId = createRes.data.ticketId;

    const patchRes = await testClient.patch(`/api/inquiries/${ticketId}`, {});
    assertions.assertStatus(patchRes, 400);
  });

  test('T2.3.9: SQL injection in ticket ID handled safely without syntax exception', async () => {
    const patchRes = await testClient.patch("/api/inquiries/GROV-8492' OR 1=1 --", {
      status: 'resolved',
    });
    expect([400, 404]).toContain(patchRes.status);
  });

  test('T2.3.10: Massive message payload (50,000 characters) rejected or bounded with 400', async () => {
    const res = await testClient.post('/api/inquiries', {
      name: 'Spam Sender',
      email: createRandomEmail('spam'),
      subject: 'Massive message payload',
      message: 'M'.repeat(50000),
    });
    expect([400, 413]).toContain(res.status);
  });

  test('T2.3.11: Unicode and emoji in message preserved safely', async () => {
    const payload = {
      name: 'Jean-Luc Picard 🚀',
      email: createRandomEmail('picard'),
      subject: 'Enterprise Warp Drive Issue ✨',
      message: 'Engage! The dilithium crystals need recalibration for sector 001. 🌌',
    };
    const res = await testClient.post('/api/inquiries', payload);
    expect([200, 201]).toContain(res.status);
    expect(res.data.success).toBe(true);
  });

  test('T2.3.12: Whitespace-only subject returns HTTP 400', async () => {
    const res = await testClient.post('/api/inquiries', {
      name: 'Whitespace Subject',
      email: createRandomEmail('whitesubj'),
      subject: '     \t   ',
      message: 'Message with whitespace-only subject line.',
    });
    assertions.assertStatus(res, 400);
  });

  test('T2.3.13: DELETE /api/inquiries returns HTTP 405 Method Not Allowed', async () => {
    const res = await testClient.delete('/api/inquiries');
    assertions.assertStatus(res, 405);
  });
});
