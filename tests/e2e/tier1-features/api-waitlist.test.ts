import { describe, test, expect, beforeEach, afterAll } from 'bun:test';
import { testClient, resetDatabase } from '../harness/test-client';
import { fixtures, createRandomEmail } from '../harness/fixtures';
import { assertions } from '../harness/assertions';

describe('Tier 1 — F10: Waitlist Booking Endpoint', () => {
  beforeEach(() => {
    resetDatabase();
    testClient.clearAuth();
  });

  afterAll(() => {
    testClient.clearAuth();
  });

  test('T1.4.1: POST /api/waitlist with standard payload returns 200/201 and success', async () => {
    const payload = {
      ...fixtures.waitlist.standard,
      email: createRandomEmail('std'),
    };
    const res = await testClient.post('/api/waitlist', payload);
    expect([200, 201]).toContain(res.status);
    assertions.assertJsonHeaders(res);
    expect(res.data.success).toBe(true);
  });

  test('T1.4.2: Response returns a positive integer queue position', async () => {
    const payload = {
      ...fixtures.waitlist.standard,
      email: createRandomEmail('pos'),
    };
    const res = await testClient.post('/api/waitlist', payload);
    assertions.assertWaitlistSuccess(res.data, 1);
  });

  test('T1.4.3: POST /api/waitlist with minimal payload (name and email) succeeds', async () => {
    const payload = {
      ...fixtures.waitlist.minimal,
      email: createRandomEmail('min'),
    };
    const res = await testClient.post('/api/waitlist', payload);
    expect([200, 201]).toContain(res.status);
    expect(res.data.success).toBe(true);
  });

  test('T1.4.4: POST /api/waitlist with enterprise metadata persists successfully', async () => {
    const payload = {
      ...fixtures.waitlist.enterprise,
      email: createRandomEmail('corp'),
    };
    const res = await testClient.post('/api/waitlist', payload);
    expect([200, 201]).toContain(res.status);
    assertions.assertWaitlistSuccess(res.data);
  });

  test('T1.4.5: Sequential submissions receive distinct, incrementing position numbers', async () => {
    const payload1 = {
      name: 'User One',
      email: createRandomEmail('seq1'),
    };
    const payload2 = {
      name: 'User Two',
      email: createRandomEmail('seq2'),
    };

    const res1 = await testClient.post('/api/waitlist', payload1);
    const res2 = await testClient.post('/api/waitlist', payload2);

    assertions.assertWaitlistSuccess(res1.data);
    assertions.assertWaitlistSuccess(res2.data);
    expect(res2.data.position).toBeGreaterThan(res1.data.position);
  });

  test('T1.4.6: GET /api/waitlist returns waitlist status and count', async () => {
    await testClient.loginAsAdmin();
    const res = await testClient.get('/api/waitlist');
    assertions.assertStatus(res, 200);
    expect(typeof res.data.count).toBe('number');
    expect(res.data.count).toBeGreaterThanOrEqual(0);
  });

  test('T1.4.7: Response returns JSON headers and valid payload structure', async () => {
    const payload = {
      name: 'Header Test User',
      email: createRandomEmail('hdr'),
    };
    const res = await testClient.post('/api/waitlist', payload);
    assertions.assertJsonHeaders(res);
    expect(res.data).toHaveProperty('success');
    expect(res.data).toHaveProperty('position');
  });
});
