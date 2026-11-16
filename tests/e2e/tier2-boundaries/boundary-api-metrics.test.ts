import { describe, test, expect } from 'bun:test';
import { testClient } from '../harness/test-client';
import { assertions } from '../harness/assertions';

describe('Tier 2 — Boundary: SaaS Metrics Endpoint (F8)', () => {
  test('T2.5.1: POST request to /api/metrics returns HTTP 405 Method Not Allowed', async () => {
    const res = await testClient.post('/api/metrics', { action: 'override' });
    assertions.assertStatus(res, 405);
    const allow = res.headers.get('allow') || '';
    expect(allow).toContain('GET');
  });

  test('T2.5.2: DELETE request to /api/metrics returns HTTP 405 Method Not Allowed', async () => {
    const res = await testClient.delete('/api/metrics');
    assertions.assertStatus(res, 405);
    const allow = res.headers.get('allow') || '';
    expect(allow).toContain('GET');
  });

  test('T2.5.3: PUT request to /api/metrics returns HTTP 405 Method Not Allowed', async () => {
    const res = await (testClient as any).request('PUT', '/api/metrics');
    assertions.assertStatus(res, 405);
    const allow = res.headers.get('allow') || '';
    expect(allow).toContain('GET');
  });

  test('T2.5.4: PATCH request to /api/metrics returns HTTP 405 Method Not Allowed', async () => {
    const res = await testClient.patch('/api/metrics', { activeSessions: 999 });
    assertions.assertStatus(res, 405);
    const allow = res.headers.get('allow') || '';
    expect(allow).toContain('GET');
  });

  test('T2.5.5: Invalid query parameters (corrupt range, negative limit) return HTTP 200 without crashing', async () => {
    const res = await testClient.get('/api/metrics?range=invalid_century&refresh=corrupt&limit=-50');
    assertions.assertOk(res);
    assertions.assertJsonHeaders(res);
    expect(typeof res.data.teamCount).toBe('number');
  });

  test('T2.5.6: Empty query string /api/metrics? returns standard metrics response', async () => {
    const res = await testClient.get('/api/metrics?');
    assertions.assertOk(res);
    assertions.assertJsonHeaders(res);
    expect(typeof res.data.weeklyWorkdayAverage).toBe('number');
  });

  test('T2.5.7: HTTP parameter pollution (repeated refresh keys) is handled safely', async () => {
    const res = await testClient.get('/api/metrics?refresh=true&refresh=false&refresh=1');
    assertions.assertOk(res);
    expect(typeof res.data.activeSessions).toBe('number');
  });

  test('T2.5.8: Metrics response schema enforces non-negative integer counts and valid quartiles', async () => {
    const res = await testClient.get('/api/metrics');
    assertions.assertOk(res);
    expect(Number.isInteger(res.data.teamCount)).toBe(true);
    expect(res.data.teamCount).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(res.data.hiringCount)).toBe(true);
    expect(res.data.hiringCount).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(res.data.projectsCount)).toBe(true);
    expect(res.data.projectsCount).toBeGreaterThanOrEqual(0);
    expect(typeof res.data.benchmarkQuartile).toBe('string');
  });
});
