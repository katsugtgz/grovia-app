import { describe, test, expect } from 'bun:test';
import { testClient } from '../harness/test-client';
import { assertions } from '../harness/assertions';

describe('Tier 1 — F7: System Health Endpoint', () => {
  test('T1.1.1: GET /api/health returns HTTP 200 with JSON content-type', async () => {
    const res = await testClient.get('/api/health');
    assertions.assertStatus(res, 200);
    assertions.assertJsonHeaders(res);
  });

  test('T1.1.2: Response body contains required health fields', async () => {
    const res = await testClient.get('/api/health');
    assertions.assertOk(res);
    assertions.assertHealthResponse(res.data);
  });

  test('T1.1.3: Status is strictly "ok" and database is "healthy"', async () => {
    const res = await testClient.get('/api/health');
    assertions.assertOk(res);
    expect(res.data.status).toBe('ok');
    expect(res.data.database).toBe('healthy');
  });

  test('T1.1.4: System runtime reports bun and has version string', async () => {
    const res = await testClient.get('/api/health');
    assertions.assertOk(res);
    expect(res.data.system).toBeDefined();
    expect(res.data.system.runtime).toBe('bun');
    expect(typeof res.data.system.version).toBe('string');
    expect(res.data.system.version.length).toBeGreaterThan(0);
  });

  test('T1.1.5: Timestamp parses as valid ISO 8601 within recent window', async () => {
    const res = await testClient.get('/api/health');
    assertions.assertOk(res);
    const dateMs = Date.parse(res.data.timestamp);
    expect(Number.isNaN(dateMs)).toBe(false);
    const diffSeconds = Math.abs((Date.now() - dateMs) / 1000);
    expect(diffSeconds).toBeLessThanOrEqual(120);
  });

  test('T1.1.6: Health check execution latency is under 250ms', async () => {
    const start = performance.now();
    const res = await testClient.get('/api/health');
    const elapsed = performance.now() - start;
    assertions.assertOk(res);
    expect(elapsed).toBeLessThan(250);
  });

  test('T1.1.7: Multiple sequential requests are idempotent and stable', async () => {
    const res1 = await testClient.get('/api/health');
    const res2 = await testClient.get('/api/health');
    const res3 = await testClient.get('/api/health');

    assertions.assertOk(res1);
    assertions.assertOk(res2);
    assertions.assertOk(res3);

    expect(res1.data.status).toBe(res2.data.status);
    expect(res2.data.status).toBe(res3.data.status);
    expect(res3.data.status).toBe('ok');
  });
});
