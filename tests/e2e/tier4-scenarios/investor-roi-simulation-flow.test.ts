import { describe, test, expect } from 'bun:test';
import { testClient } from '../harness/test-client';
import { assertions } from '../harness/assertions';

describe('Tier 4 — Real-World Scenario: Investor ROI & Executive Modeling Flow', () => {
  test('T4.2.1: Executive models Conservative, Target, and Aggressive growth scenarios', async () => {
    const conservative = {
      monthlyTraffic: 30000,
      conversionRate: 1.5,
      averageOrderValue: 80,
      industry: 'B2B SaaS - Conservative',
    };
    const target = {
      monthlyTraffic: 60000,
      conversionRate: 2.5,
      averageOrderValue: 120,
      industry: 'B2B SaaS - Target',
    };
    const aggressive = {
      monthlyTraffic: 120000,
      conversionRate: 3.5,
      averageOrderValue: 150,
      industry: 'B2B SaaS - Aggressive',
    };

    const resCons = await testClient.post('/api/roi', conservative);
    const resTarget = await testClient.post('/api/roi', target);
    const resAggr = await testClient.post('/api/roi', aggressive);

    assertions.assertOk(resCons);
    assertions.assertOk(resTarget);
    assertions.assertOk(resAggr);

    assertions.assertRoiResponse(resCons.data, conservative);
    assertions.assertRoiResponse(resTarget.data, target);
    assertions.assertRoiResponse(resAggr.data, aggressive);
  });

  test('T4.2.2: Monotonicity validation across tiers: Aggressive > Target > Conservative projected revenue', async () => {
    const resCons = await testClient.post('/api/roi', {
      monthlyTraffic: 25000,
      conversionRate: 1.8,
      averageOrderValue: 100,
    });
    const resTarget = await testClient.post('/api/roi', {
      monthlyTraffic: 50000,
      conversionRate: 2.8,
      averageOrderValue: 120,
    });
    const resAggr = await testClient.post('/api/roi', {
      monthlyTraffic: 100000,
      conversionRate: 4.0,
      averageOrderValue: 140,
    });

    expect(resAggr.data.projectedMonthlyRevenue).toBeGreaterThan(resTarget.data.projectedMonthlyRevenue);
    expect(resTarget.data.projectedMonthlyRevenue).toBeGreaterThan(resCons.data.projectedMonthlyRevenue);

    expect(resAggr.data.incrementalAnnualGain).toBeGreaterThan(resTarget.data.incrementalAnnualGain);
    expect(resTarget.data.incrementalAnnualGain).toBeGreaterThan(resCons.data.incrementalAnnualGain);
  });

  test('T4.2.3: Trajectory horizon: 12-month projections demonstrate non-decreasing progression', async () => {
    const res = await testClient.post('/api/roi', {
      monthlyTraffic: 80000,
      conversionRate: 2.2,
      averageOrderValue: 110,
    });

    assertions.assertOk(res);
    const traj = res.data.monthlyTrajectory;
    expect(traj.length).toBeGreaterThanOrEqual(3);

    for (let i = 1; i < traj.length; i++) {
      expect(traj[i].revenue).toBeGreaterThanOrEqual(traj[i - 1].revenue);
    }
  });
});
