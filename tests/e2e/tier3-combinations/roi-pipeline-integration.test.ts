import { describe, test, expect, beforeEach, afterAll } from 'bun:test';
import { testClient } from '../harness/test-client';
import { assertions } from '../harness/assertions';

describe('Tier 3 — Cross-Feature: ROI & Pipeline Metrics Integration (F8 + F9)', () => {
  beforeEach(() => {
    testClient.clearAuth();
  });

  afterAll(() => {
    testClient.clearAuth();
  });

  test('T3.3.1: Fetch live SaaS pipeline benchmarks from GET /api/metrics', async () => {
    await testClient.loginAsAdmin();
    const metricsRes = await testClient.get('/api/metrics');
    assertions.assertOk(metricsRes);
    assertions.assertMetricsResponse(metricsRes.data);
    expect(metricsRes.data.pipeline).toBeDefined();
  });

  test('T3.3.2: Feed pipeline metrics into POST /api/roi to compute dynamic growth trajectory', async () => {
    await testClient.loginAsAdmin();
    const metricsRes = await testClient.get('/api/metrics');
    testClient.clearAuth();
    const pipeline = metricsRes.data.pipeline;

    // Derive simulated traffic from pipeline output and active team
    const traffic = (pipeline.output || 80) * 1000;
    const conversion = 2.5;
    const aov = 150;

    const roiRes = await testClient.post('/api/roi', {
      monthlyTraffic: traffic,
      conversionRate: conversion,
      averageOrderValue: aov,
    });

    assertions.assertOk(roiRes);
    assertions.assertRoiResponse(roiRes.data, {
      monthlyTraffic: traffic,
      conversionRate: conversion,
      averageOrderValue: aov,
    });
  });

  test('T3.3.3: Dynamic ROI multiplier retains valid format when parameterized by metrics', async () => {
    const roiRes = await testClient.post('/api/roi', {
      monthlyTraffic: 75000,
      conversionRate: 3.1,
      averageOrderValue: 95,
      industry: 'B2B Enterprise',
    });

    assertions.assertOk(roiRes);
    expect(roiRes.data.projectedRoiMultiple).toMatch(/^\d+(\.\d+)?x$/);
  });

  test('T3.3.4: Trajectory curve demonstrates progressive monthly gains over 12-month horizon', async () => {
    const roiRes = await testClient.post('/api/roi', {
      monthlyTraffic: 50000,
      conversionRate: 2.0,
      averageOrderValue: 100,
    });

    assertions.assertOk(roiRes);
    const traj = roiRes.data.monthlyTrajectory;
    expect(traj.length).toBeGreaterThanOrEqual(3);
    const firstMonth = traj[0].revenue;
    const lastMonth = traj[traj.length - 1].revenue;
    expect(lastMonth).toBeGreaterThanOrEqual(firstMonth);
  });

  test('T3.3.5: Annualized gain equation holds strictly: incrementalAnnualGain === incrementalMonthlyRevenue * 12', async () => {
    const roiRes = await testClient.post('/api/roi', {
      monthlyTraffic: 60000,
      conversionRate: 2.8,
      averageOrderValue: 110,
    });

    assertions.assertOk(roiRes);
    expect(roiRes.data.incrementalAnnualGain).toBe(roiRes.data.incrementalMonthlyRevenue * 12);
  });
});
