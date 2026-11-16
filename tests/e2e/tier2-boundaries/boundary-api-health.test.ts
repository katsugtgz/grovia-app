import { describe, test, expect } from 'bun:test';
import { testClient } from '../harness/test-client';
import { assertions } from '../harness/assertions';

describe('Tier 2 — Boundary: System Health Endpoint (F7)', () => {
  test('T2.7.1: POST request to /api/health returns HTTP 405 Method Not Allowed with Allow header', async () => {
    const res = await testClient.post('/api/health', { status: 'override' });
    assertions.assertStatus(res, 405);
    const allowHeader = res.headers.get('allow') || '';
    expect(allowHeader).toContain('GET');
  });

  test('T2.7.2: PUT request to /api/health returns HTTP 405 Method Not Allowed with Allow header', async () => {
    // TestClient request with PUT
    const res = await (testClient as any).request('PUT', '/api/health');
    assertions.assertStatus(res, 405);
    const allowHeader = res.headers.get('allow') || '';
    expect(allowHeader).toContain('GET');
  });

  test('T2.7.3: DELETE request to /api/health returns HTTP 405 Method Not Allowed with Allow header', async () => {
    const res = await testClient.delete('/api/health');
    assertions.assertStatus(res, 405);
    const allowHeader = res.headers.get('allow') || '';
    expect(allowHeader).toContain('GET');
  });

  test('T2.7.4: PATCH request to /api/health returns HTTP 405 Method Not Allowed with Allow header', async () => {
    const res = await testClient.patch('/api/health', { health: 'degraded' });
    assertions.assertStatus(res, 405);
    const allowHeader = res.headers.get('allow') || '';
    expect(allowHeader).toContain('GET');
  });

  test('T2.7.5: GET with arbitrary/malicious query parameters safely ignores params and returns HTTP 200', async () => {
    const maliciousEndpoint = '/api/health?debug=true&role=admin&eval=process.exit()&sqli=%27%20OR%201=1--';
    const res = await testClient.get(maliciousEndpoint);
    assertions.assertOk(res);
    assertions.assertJsonHeaders(res);
    expect(res.data.status).toBe('ok');
    expect(res.data.database).toBe('healthy');
  });

  test('T2.7.6: GET with malformed Accept header still responds with JSON content-type', async () => {
    const res = await testClient.get('/api/health', {
      headers: {
        Accept: 'application/xml, text/csv, image/webp;q=0.8',
      },
    });
    assertions.assertOk(res);
    assertions.assertJsonHeaders(res);
    expect(res.data.status).toBe('ok');
  });

  test('T2.7.7: GET response includes strict no-cache headers preventing stale health polling', async () => {
    const res = await testClient.get('/api/health');
    assertions.assertOk(res);
    const cacheControl = res.headers.get('cache-control') || '';
    expect(cacheControl).toContain('no-store');
  });

  test('T2.7.8: Health response schema enforces valid database status and runtime metadata', async () => {
    const res = await testClient.get('/api/health');
    assertions.assertOk(res);

    const validDbStates = ['healthy', 'degraded', 'unhealthy'];
    expect(validDbStates).toContain(res.data.database);
    expect(res.data.system).toBeDefined();
    expect(res.data.system.runtime).toBe('bun');
    expect(typeof res.data.version).toBe('string');
    expect(typeof res.data.uptime).toBe('number');
    expect(res.data.uptime).toBeGreaterThanOrEqual(0);
  });

  test('T2.7.9: High-concurrency burst test: 20 simultaneous GET requests all succeed with HTTP 200', async () => {
    const requests = Array.from({ length: 20 }, () => testClient.get('/api/health'));
    const responses = await Promise.all(requests);

    for (const res of responses) {
      expect(res.status).toBe(200);
      expect(res.data.status).toBe('ok');
    }
  });
});
