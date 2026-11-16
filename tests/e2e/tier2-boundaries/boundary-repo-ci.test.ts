import { describe, test, expect } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

describe('Tier 2 — Boundary: GitHub Actions CI/CD Pipeline & Repository Contracts (F24-F25)', () => {
  const rootDir = process.cwd();
  const ciPath = path.resolve(rootDir, '.github/workflows/ci.yml');

  test('T2.10.1: CI workflow step validation: defines strict order from setup to quality gate', () => {
    expect(fs.existsSync(ciPath)).toBe(true);
    const ciContent = fs.readFileSync(ciPath, 'utf8');

    const expectedSteps = [
      'actions/checkout',
      'oven-sh/setup-bun',
      'bun install --frozen-lockfile',
      'bun run lint',
      'bun run typecheck',
      'bun test',
      'bun run build',
      'npx react-doctor@latest',
    ];

    let lastIndex = -1;
    for (const step of expectedSteps) {
      const idx = ciContent.indexOf(step);
      expect(idx).toBeGreaterThan(-1);
      expect(idx).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }
  });

  test('T2.10.2: Runner environment constraints: strictly pins to standard ubuntu-latest runner', () => {
    const ciContent = fs.readFileSync(ciPath, 'utf8');
    expect(ciContent).toContain('runs-on: ubuntu-latest');
    expect(ciContent).not.toMatch(/container:\s*\S+/);
  });

  test('T2.10.3: Setup-bun action versioning: specifies official oven-sh/setup-bun@v2', () => {
    const ciContent = fs.readFileSync(ciPath, 'utf8');
    expect(ciContent).toContain('uses: oven-sh/setup-bun@v2');
    expect(ciContent).toContain('bun-version: latest');
  });

  test('T2.10.4: Git workflow trigger boundaries: triggers on push and pull_request for main branches', () => {
    const ciContent = fs.readFileSync(ciPath, 'utf8');
    expect(ciContent).toMatch(/push:\s+branches:\s*\[.*main.*\]/);
    expect(ciContent).toMatch(/pull_request:\s+branches:\s*\[.*main.*\]/);
  });

  test('T2.10.5: Zero-secret resilience: CI workflow operates without requiring mandatory repository secrets', () => {
    const ciContent = fs.readFileSync(ciPath, 'utf8');
    // Ensure test/build job does not fail on external forks due to missing required secrets
    expect(ciContent).not.toMatch(/\$\{\{\s*secrets\.[A-Z0-9_]+\s*\}\}/);
  });

  test('T2.10.6: Frozen lockfile enforcement: dependency installation step specifies --frozen-lockfile', () => {
    const ciContent = fs.readFileSync(ciPath, 'utf8');
    expect(ciContent).toContain('bun install --frozen-lockfile');
  });

  test('T2.10.7: React Doctor quality gate step executes in CI pipeline', () => {
    const ciContent = fs.readFileSync(ciPath, 'utf8');
    expect(ciContent).toContain('npx react-doctor@latest --score');
  });
});
