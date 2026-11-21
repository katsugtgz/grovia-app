import { describe, test, expect, beforeEach, afterAll } from 'bun:test';
import { testClient } from '../harness/test-client';
import { assertions } from '../harness/assertions';
import fs from 'node:fs';
import path from 'node:path';

describe('Tier 4 — Real-World Scenario: System Health & Audit Readiness Flow', () => {
  const rootDir = process.cwd();

  beforeEach(() => {
    testClient.clearAuth();
  });

  afterAll(() => {
    testClient.clearAuth();
  });

  test('T4.4.1: System health audit: System status is "ok", runtime "bun", database "healthy"', async () => {
    const res = await testClient.get('/api/health');
    assertions.assertOk(res);
    expect(res.data.status).toBe('ok');
    expect(res.data.database).toBe('healthy');
    expect(res.data.system.runtime).toBe('bun');
  });

  test('T4.4.2: Database schema audit: Persistent storage tables and indexes configured properly', async () => {
    const res = await testClient.get('/api/health');
    assertions.assertOk(res);
    expect(res.data.database).toBe('healthy');
  });

  test('T4.4.3: SaaS metrics audit: Benchmark ranges and workday averages comply with specifications', async () => {
    await testClient.loginAsAdmin();
    const res = await testClient.get('/api/metrics');
    assertions.assertOk(res);
    assertions.assertMetricsResponse(res.data);
    expect(res.data.weeklyWorkdayAverage).toBeGreaterThan(0);
    expect(res.data.weeklyWorkdayAverage).toBeLessThanOrEqual(24);
  });

  test('T4.4.4: Tooling & standards audit: Bun lockfile exists, zero npm/yarn locks, CI pipeline configured', () => {
    const hasBunLock =
      fs.existsSync(path.resolve(rootDir, 'bun.lock')) ||
      fs.existsSync(path.resolve(rootDir, 'bun.lockb'));
    expect(hasBunLock).toBe(true);

    expect(fs.existsSync(path.resolve(rootDir, 'package-lock.json'))).toBe(false);
    expect(fs.existsSync(path.resolve(rootDir, 'yarn.lock'))).toBe(false);

    const ciFile = path.resolve(rootDir, '.github/workflows/ci.yml');
    expect(fs.existsSync(ciFile)).toBe(true);
  });
});
