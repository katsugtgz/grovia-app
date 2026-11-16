import { describe, test, expect, beforeEach } from 'bun:test';
import { testClient, resetDatabase } from '../harness/test-client';
import { fixtures, createRandomEmail } from '../harness/fixtures';
import { assertions } from '../harness/assertions';

describe('Tier 3 — Cross-Feature: Waitlist & Metrics Sync (F8 + F10)', () => {
  beforeEach(() => {
    resetDatabase();
  });

  test('T3.1.1: Baseline capture: GET /api/metrics and GET /api/waitlist return consistent initial state', async () => {
    const metricsRes = await testClient.get('/api/metrics');
    assertions.assertOk(metricsRes);
    assertions.assertMetricsResponse(metricsRes.data);

    const waitlistRes = await testClient.get('/api/waitlist');
    assertions.assertOk(waitlistRes);
    expect(typeof waitlistRes.data.count).toBe('number');
  });

  test('T3.1.2: Registering new waitlist user increments waitlist count and assigns position', async () => {
    const beforeRes = await testClient.get('/api/waitlist');
    const startCount = beforeRes.data.count;

    const email = createRandomEmail('sync');
    const postRes = await testClient.post('/api/waitlist', {
      name: 'Sync Test User',
      email,
      company: 'Sync Corp',
    });
    expect([200, 201]).toContain(postRes.status);
    expect(postRes.data.position).toBeGreaterThanOrEqual(startCount + 1);

    const afterRes = await testClient.get('/api/waitlist');
    expect(afterRes.data.count).toBe(startCount + 1);
  });

  test('T3.1.3: Waitlist additions maintain healthy metrics status', async () => {
    const email = createRandomEmail('metric_sync');
    await testClient.post('/api/waitlist', {
      name: 'Metrics User',
      email,
    });

    const metricsRes = await testClient.get('/api/metrics');
    assertions.assertOk(metricsRes);
    expect(metricsRes.data.teamCount).toBeGreaterThan(0);
    expect(metricsRes.data.pipeline).toBeDefined();
  });

  test('T3.1.4: Multiple sequential registrations increment waitlist count monotonically', async () => {
    const startRes = await testClient.get('/api/waitlist');
    const initialCount = startRes.data.count;

    for (let i = 0; i < 3; i++) {
      const email = createRandomEmail(`mono_${i}`);
      const res = await testClient.post('/api/waitlist', {
        name: `Mono User ${i}`,
        email,
      });
      expect([200, 201]).toContain(res.status);
    }

    const endRes = await testClient.get('/api/waitlist');
    expect(endRes.data.count).toBe(initialCount + 3);
  });

  test('T3.1.5: Rejected duplicate registration does NOT falsely increment waitlist count', async () => {
    const email = createRandomEmail('no_falsy_inc');
    const firstRes = await testClient.post('/api/waitlist', {
      name: 'Original Submitter',
      email,
    });
    expect([200, 201]).toContain(firstRes.status);

    const countAfterFirst = (await testClient.get('/api/waitlist')).data.count;

    const dupRes = await testClient.post('/api/waitlist', {
      name: 'Duplicate Attempt',
      email,
    });
    assertions.assertStatus(dupRes, 409);

    const countAfterDup = (await testClient.get('/api/waitlist')).data.count;
    expect(countAfterDup).toBe(countAfterFirst);
  });
});
