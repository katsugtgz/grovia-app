import { expect } from 'bun:test';
import type { TestResponse } from './test-client';

export const assertions = {
  assertStatus(res: TestResponse, expectedStatus: number): void {
    expect(res.status).toBe(expectedStatus);
  },

  assertOk(res: TestResponse): void {
    expect(res.ok).toBe(true);
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
  },

  assertErrorStatus(res: TestResponse, expectedStatus: number): void {
    expect(res.ok).toBe(false);
    expect(res.status).toBe(expectedStatus);
  },

  assertJsonHeaders(res: TestResponse): void {
    const contentType = res.headers.get('content-type') || '';
    expect(contentType.toLowerCase()).toContain('application/json');
  },

  assertHealthResponse(data: any): void {
    expect(data).toBeDefined();
    expect(typeof data).toBe('object');
    expect(data.status).toBe('ok');
    expect(data.database).toBe('healthy');
    expect(typeof data.version).toBe('string');
    expect(typeof data.uptime).toBe('number');
    expect(data.uptime).toBeGreaterThanOrEqual(0);
    expect(data.system).toBeDefined();
    expect(data.system.runtime).toBe('bun');
    expect(typeof data.system.version).toBe('string');
    expect(Date.parse(data.timestamp)).not.toBeNaN();
  },

  assertMetricsResponse(data: any): void {
    expect(data).toBeDefined();
    expect(typeof data).toBe('object');
    expect(typeof data.teamCount).toBe('number');
    expect(data.teamCount).toBeGreaterThanOrEqual(0);
    expect(typeof data.hiringCount).toBe('number');
    expect(data.hiringCount).toBeGreaterThanOrEqual(0);
    expect(typeof data.projectsCount).toBe('number');
    expect(data.projectsCount).toBeGreaterThanOrEqual(0);

    expect(data.pipeline).toBeDefined();
    expect(typeof data.pipeline.interviews).toBe('number');
    expect(typeof data.pipeline.hired).toBe('number');
    expect(typeof data.pipeline.projectTime).toBe('number');
    expect(typeof data.pipeline.output).toBe('number');

    expect(typeof data.weeklyWorkdayAverage).toBe('number');
    expect(data.weeklyWorkdayAverage).toBeGreaterThan(0);
    expect(data.weeklyWorkdayAverage).toBeLessThanOrEqual(24);

    expect(typeof data.benchmarkQuartile).toBe('string');
    expect(data.benchmarkQuartile.length).toBeGreaterThan(0);
  },

  assertRoiResponse(
    data: any,
    input?: { monthlyTraffic: number; conversionRate: number; averageOrderValue: number }
  ): void {
    expect(data).toBeDefined();
    expect(typeof data.currentMonthlyRevenue).toBe('number');
    expect(typeof data.projectedMonthlyRevenue).toBe('number');
    expect(typeof data.projectedConversionRate).toBe('number');
    expect(typeof data.incrementalMonthlyRevenue).toBe('number');
    expect(typeof data.incrementalAnnualGain).toBe('number');
    expect(typeof data.projectedRoiMultiple).toBe('string');
    expect(data.projectedRoiMultiple).toMatch(/^\d+(\.\d+)?x$/);
    expect(Array.isArray(data.monthlyTrajectory)).toBe(true);
    expect(data.monthlyTrajectory.length).toBeGreaterThan(0);

    if (input && input.monthlyTraffic > 0 && input.conversionRate > 0) {
      const expectedCurrent = Math.round(
        input.monthlyTraffic * (input.conversionRate / 100) * input.averageOrderValue
      );
      expect(Math.abs(data.currentMonthlyRevenue - expectedCurrent)).toBeLessThanOrEqual(2);
      expect(data.projectedMonthlyRevenue).toBeGreaterThan(data.currentMonthlyRevenue);
      expect(data.incrementalMonthlyRevenue).toBe(data.projectedMonthlyRevenue - data.currentMonthlyRevenue);
      expect(data.incrementalAnnualGain).toBe(data.incrementalMonthlyRevenue * 12);
    }
  },

  assertWaitlistSuccess(data: any, minPosition?: number): void {
    expect(data).toBeDefined();
    expect(data.success).toBe(true);
    expect(typeof data.message).toBe('string');
    expect(typeof data.position).toBe('number');
    expect(data.position).toBeGreaterThan(0);
    if (minPosition !== undefined) {
      expect(data.position).toBeGreaterThanOrEqual(minPosition);
    }
  },

  assertInquirySuccess(data: any): void {
    expect(data).toBeDefined();
    expect(data.success).toBe(true);
    expect(typeof data.ticketId).toBe('string');
    expect(data.ticketId).toMatch(/^GROV-[A-Za-z0-9]+$/);
    expect(data.status).toBe('new');
  },
};
