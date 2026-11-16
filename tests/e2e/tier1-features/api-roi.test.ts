import { describe, test, expect } from 'bun:test';
import { testClient } from '../harness/test-client';
import { fixtures } from '../harness/fixtures';
import { assertions } from '../harness/assertions';

describe('Tier 1 — F9: ROI & Growth Calculator Endpoint', () => {
  test('T1.3.1: POST /api/roi with standard payload returns HTTP 200', async () => {
    const res = await testClient.post('/api/roi', fixtures.roi.standard);
    assertions.assertStatus(res, 200);
    assertions.assertJsonHeaders(res);
  });

  test('T1.3.2: Response adheres to RoiResponse contract schema', async () => {
    const res = await testClient.post('/api/roi', fixtures.roi.standard);
    assertions.assertOk(res);
    assertions.assertRoiResponse(res.data, fixtures.roi.standard);
  });

  test('T1.3.3: Mathematical accuracy: currentMonthlyRevenue = traffic * (CR/100) * AOV', async () => {
    const payload = fixtures.roi.standard;
    const res = await testClient.post('/api/roi', payload);
    assertions.assertOk(res);
    const expectedCurrent = Math.round(payload.monthlyTraffic * (payload.conversionRate / 100) * payload.averageOrderValue);
    expect(Math.abs(res.data.currentMonthlyRevenue - expectedCurrent)).toBeLessThanOrEqual(2);
  });

  test('T1.3.4: Growth modeling: projectedMonthlyRevenue exceeds baseline current revenue', async () => {
    const res = await testClient.post('/api/roi', fixtures.roi.ecommerce);
    assertions.assertOk(res);
    expect(res.data.projectedMonthlyRevenue).toBeGreaterThan(res.data.currentMonthlyRevenue);
    expect(res.data.projectedConversionRate).toBeGreaterThan(fixtures.roi.ecommerce.conversionRate);
  });

  test('T1.3.5: Annualization invariant: incrementalAnnualGain === incrementalMonthlyRevenue * 12', async () => {
    const res = await testClient.post('/api/roi', fixtures.roi.enterprise);
    assertions.assertOk(res);
    expect(res.data.incrementalMonthlyRevenue).toBe(res.data.projectedMonthlyRevenue - res.data.currentMonthlyRevenue);
    expect(res.data.incrementalAnnualGain).toBe(res.data.incrementalMonthlyRevenue * 12);
  });

  test('T1.3.6: monthlyTrajectory produces monotonic revenue sequence', async () => {
    const res = await testClient.post('/api/roi', fixtures.roi.standard);
    assertions.assertOk(res);
    const traj = res.data.monthlyTrajectory;
    expect(Array.isArray(traj)).toBe(true);
    expect(traj.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < traj.length; i++) {
      expect(traj[i].revenue).toBeGreaterThanOrEqual(traj[i - 1].revenue);
    }
  });

  test('T1.3.7: Optional industry parameter accepted without schema error', async () => {
    const res = await testClient.post('/api/roi', {
      ...fixtures.roi.standard,
      industry: 'FinTech Growth',
    });
    assertions.assertOk(res);
    expect(res.status).toBe(200);
  });
});
