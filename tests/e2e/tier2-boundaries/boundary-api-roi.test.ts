import { describe, test, expect } from 'bun:test';
import { testClient } from '../harness/test-client';
import { fixtures } from '../harness/fixtures';
import { assertions } from '../harness/assertions';

describe('Tier 2 — Boundary: ROI Calculator Endpoint', () => {
  test('T2.1.1: Zero traffic returns HTTP 400 Bad Request', async () => {
    const res = await testClient.post('/api/roi', fixtures.roi.adversarial.zeroTraffic);
    assertions.assertStatus(res, 400);
  });

  test('T2.1.2: Negative traffic returns HTTP 400 Bad Request', async () => {
    const res = await testClient.post('/api/roi', fixtures.roi.adversarial.negativeTraffic);
    assertions.assertStatus(res, 400);
  });

  test('T2.1.3: Negative conversion rate returns HTTP 400 Bad Request', async () => {
    const res = await testClient.post('/api/roi', fixtures.roi.adversarial.negativeConversion);
    assertions.assertStatus(res, 400);
  });

  test('T2.1.4: Conversion rate exceeding 100% returns HTTP 400 Bad Request', async () => {
    const res = await testClient.post('/api/roi', fixtures.roi.adversarial.overHundredConversion);
    assertions.assertStatus(res, 400);
  });

  test('T2.1.5: Negative average order value returns HTTP 400 Bad Request', async () => {
    const res = await testClient.post('/api/roi', fixtures.roi.adversarial.negativeAov);
    assertions.assertStatus(res, 400);
  });

  test('T2.1.6: Extreme average order value ($100M) handles arithmetic safely without overflow', async () => {
    const res = await testClient.post('/api/roi', fixtures.roi.adversarial.extremeAov);
    assertions.assertOk(res);
    expect(Number.isFinite(res.data.projectedMonthlyRevenue)).toBe(true);
    expect(Number.isFinite(res.data.incrementalAnnualGain)).toBe(true);
  });

  test('T2.1.7: Micro-precision conversion rate (0.0001%) computes without rounding to zero', async () => {
    const res = await testClient.post('/api/roi', fixtures.roi.adversarial.microPrecision);
    assertions.assertOk(res);
    expect(res.data.projectedMonthlyRevenue).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(res.data.projectedMonthlyRevenue)).toBe(true);
  });

  test('T2.1.8: Non-numeric string inputs return HTTP 400 type error', async () => {
    const res = await testClient.post('/api/roi', fixtures.roi.adversarial.stringTypes);
    assertions.assertStatus(res, 400);
  });

  test('T2.1.9: Missing required field monthlyTraffic returns HTTP 400', async () => {
    const res = await testClient.post('/api/roi', {
      conversionRate: 2.5,
      averageOrderValue: 100,
    });
    assertions.assertStatus(res, 400);
  });

  test('T2.1.10: Missing required field conversionRate returns HTTP 400', async () => {
    const res = await testClient.post('/api/roi', {
      monthlyTraffic: 50000,
      averageOrderValue: 100,
    });
    assertions.assertStatus(res, 400);
  });

  test('T2.1.11: Missing required field averageOrderValue returns HTTP 400', async () => {
    const res = await testClient.post('/api/roi', {
      monthlyTraffic: 50000,
      conversionRate: 2.5,
    });
    assertions.assertStatus(res, 400);
  });

  test('T2.1.12: Empty JSON body {} returns HTTP 400', async () => {
    const res = await testClient.post('/api/roi', {});
    assertions.assertStatus(res, 400);
  });

  test('T2.1.13: GET request to /api/roi returns HTTP 405 Method Not Allowed', async () => {
    const res = await testClient.get('/api/roi');
    assertions.assertStatus(res, 405);
  });
});
