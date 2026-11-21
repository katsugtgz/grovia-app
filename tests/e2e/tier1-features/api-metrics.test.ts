import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { testClient } from '../harness/test-client';
import { assertions } from '../harness/assertions';

describe('Tier 1 — F8: SaaS Metrics Endpoint', () => {
  beforeAll(async () => {
    await testClient.loginAsAdmin();
  });

  afterAll(() => {
    testClient.clearAuth();
  });
  test('T1.2.1: GET /api/metrics returns HTTP 200 with JSON content-type', async () => {
    const res = await testClient.get('/api/metrics');
    assertions.assertStatus(res, 200);
    assertions.assertJsonHeaders(res);
  });

  test('T1.2.2: Top-level counts (team, hiring, projects) are non-negative integers', async () => {
    const res = await testClient.get('/api/metrics');
    assertions.assertOk(res);
    expect(typeof res.data.teamCount).toBe('number');
    expect(res.data.teamCount).toBeGreaterThan(0);
    expect(typeof res.data.hiringCount).toBe('number');
    expect(res.data.hiringCount).toBeGreaterThanOrEqual(0);
    expect(typeof res.data.projectsCount).toBe('number');
    expect(res.data.projectsCount).toBeGreaterThanOrEqual(0);
  });

  test('T1.2.3: Pipeline metrics contain percentages between 0 and 100', async () => {
    const res = await testClient.get('/api/metrics');
    assertions.assertOk(res);
    const p = res.data.pipeline;
    expect(p).toBeDefined();
    for (const key of ['interviews', 'hired', 'projectTime', 'output'] as const) {
      expect(typeof p[key]).toBe('number');
      expect(p[key]).toBeGreaterThanOrEqual(0);
      expect(p[key]).toBeLessThanOrEqual(100);
    }
  });

  test('T1.2.4: weeklyWorkdayAverage matches template benchmark range (~6.6h)', async () => {
    const res = await testClient.get('/api/metrics');
    assertions.assertOk(res);
    expect(typeof res.data.weeklyWorkdayAverage).toBe('number');
    expect(res.data.weeklyWorkdayAverage).toBeGreaterThan(5);
    expect(res.data.weeklyWorkdayAverage).toBeLessThan(10);
  });

  test('T1.2.5: benchmarkQuartile is populated with valid benchmark indicator', async () => {
    const res = await testClient.get('/api/metrics');
    assertions.assertOk(res);
    expect(typeof res.data.benchmarkQuartile).toBe('string');
    expect(res.data.benchmarkQuartile.length).toBeGreaterThan(0);
  });

  test('T1.2.6: activeSessions is non-negative integer', async () => {
    const res = await testClient.get('/api/metrics');
    assertions.assertOk(res);
    expect(typeof res.data.activeSessions).toBe('number');
    expect(res.data.activeSessions).toBeGreaterThanOrEqual(0);
  });

  test('T1.2.7: Metrics endpoint is strictly read-only and idempotent', async () => {
    const res1 = await testClient.get('/api/metrics');
    const res2 = await testClient.get('/api/metrics');

    assertions.assertOk(res1);
    assertions.assertOk(res2);
    expect(res1.data.teamCount).toBe(res2.data.teamCount);
    expect(res1.data.weeklyWorkdayAverage).toBe(res2.data.weeklyWorkdayAverage);
  });
});
