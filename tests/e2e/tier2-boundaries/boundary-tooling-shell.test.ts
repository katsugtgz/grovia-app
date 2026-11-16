import { describe, test, expect } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { VIEWS, normalizeView } from '@/lib/template-core';

describe('Tier 2 — Boundary: Tooling, Shell & View Navigation (F1-F4)', () => {
  const rootDir = process.cwd();

  test('T2.8.1: package.json script integrity: all lifecycle and QA scripts exist without foreign PM references', () => {
    const pkgPath = path.resolve(rootDir, 'package.json');
    expect(fs.existsSync(pkgPath)).toBe(true);
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    expect(pkg.scripts).toBeDefined();
    expect(pkg.scripts.dev).toBeDefined();
    expect(pkg.scripts.build).toBeDefined();
    expect(pkg.scripts.start).toBeDefined();
    expect(pkg.scripts.lint).toBeDefined();
    expect(pkg.scripts.typecheck).toBeDefined();
    expect(pkg.scripts.test).toBeDefined();

    // Verify scripts do not invoke npm/yarn/pnpm
    const allScriptCommands = Object.values(pkg.scripts).join(' ');
    expect(allScriptCommands).not.toMatch(/\byarn\b/);
    expect(allScriptCommands).not.toMatch(/\bpnpm\b/);
    expect(allScriptCommands).not.toMatch(/\bnpm\s+(run|test|install)\b/);
  });

  test('T2.8.2: Strict Bun lockfile verification: single non-empty bun.lock and zero competing lockfiles', () => {
    const bunLockPath = path.resolve(rootDir, 'bun.lock');
    const bunLockbPath = path.resolve(rootDir, 'bun.lockb');
    const hasLock = fs.existsSync(bunLockPath) || fs.existsSync(bunLockbPath);
    expect(hasLock).toBe(true);

    if (fs.existsSync(bunLockPath)) {
      const stat = fs.statSync(bunLockPath);
      expect(stat.size).toBeGreaterThan(0);
    }

    // Zero competing package manager lockfiles
    expect(fs.existsSync(path.resolve(rootDir, 'package-lock.json'))).toBe(false);
    expect(fs.existsSync(path.resolve(rootDir, 'yarn.lock'))).toBe(false);
    expect(fs.existsSync(path.resolve(rootDir, 'pnpm-lock.yaml'))).toBe(false);
    expect(fs.existsSync(path.resolve(rootDir, 'npm-shrinkwrap.json'))).toBe(false);
  });

  test('T2.8.3: Route hash edge cases: empty hash, bare hash, and unknown hash fall back safely to overview', () => {
    expect(normalizeView('')).toBe('overview');
    expect(normalizeView('#')).toBe('overview');
    expect(normalizeView('###')).toBe('overview');
    expect(normalizeView('#unknown-tab')).toBe('overview');
    expect(normalizeView('#dashboard')).toBe('overview');
    expect(normalizeView('#SETTINGS')).toBe('overview');
    expect(normalizeView('#999')).toBe('overview');
    expect(normalizeView('#people')).toBe('people');
    expect(normalizeView('#payroll')).toBe('payroll');
    expect(normalizeView('   #people   ')).toBe('overview');
  });

  test('T2.8.4: Malformed navigation links: query parameters, complex hashes, and XSS vectors clean safely', () => {
    expect(normalizeView('#overview?filter=active&sort=desc')).toBe('overview');
    expect(normalizeView('#people?department=design&view=grid')).toBe('people');
    expect(normalizeView('#payroll?month=2024-05')).toBe('payroll');
    expect(normalizeView('#people#nested')).toBe('overview');
    expect(normalizeView('<script>alert("xss")</script>')).toBe('overview');
    expect(normalizeView('javascript:alert(1)')).toBe('overview');
    expect(normalizeView('//overview')).toBe('overview');
    expect(normalizeView('../people')).toBe('overview');
  });

  test('T2.8.5: Non-string and non-primitive inputs to normalizeView fall back to overview without exception', () => {
    expect(normalizeView(null)).toBe('overview');
    expect(normalizeView(undefined)).toBe('overview');
    expect(normalizeView(123)).toBe('overview');
    expect(normalizeView({})).toBe('overview');
    expect(normalizeView(['people'])).toBe('overview');
    expect(normalizeView(true)).toBe('overview');
    expect(normalizeView(Symbol('view'))).toBe('overview');
  });

  test('T2.8.6: Shell navigation landmark bounds: Header component renders all defined VIEWS with tab semantics', () => {
    const headerPath = path.resolve(rootDir, 'components/Header.tsx');
    expect(fs.existsSync(headerPath)).toBe(true);
    const headerSource = fs.readFileSync(headerPath, 'utf8');

    // Every view in VIEWS must have a corresponding tab definition in Header
    for (const view of VIEWS) {
      expect(headerSource).toContain(`id: '${view}'`);
    }

    expect(headerSource).toContain('role="tablist"');
    expect(headerSource).toContain('role="tab"');
    expect(headerSource).toContain('aria-label="Sections"');
  });

  test('T2.8.7: Shell brand link and skip-to-content accessibility contracts in DOM layout', () => {
    const headerSource = fs.readFileSync(path.resolve(rootDir, 'components/Header.tsx'), 'utf8');
    const layoutSource = fs.readFileSync(path.resolve(rootDir, 'app/layout.tsx'), 'utf8');

    // Brand link points to #overview and has conic dot
    expect(headerSource).toContain('href="#overview"');
    expect(headerSource).toContain('data-view-link="overview"');
    expect(headerSource).toContain('brand__dot');

    // Skip link target
    expect(layoutSource).toContain('href="#workspace-main"');
    expect(layoutSource).toContain('id="workspace-main"');
    expect(layoutSource).toContain('tabIndex={-1}');
  });
});
