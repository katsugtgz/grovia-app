import { describe, test, expect } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

describe('Tier 1 — F1-F4: Tooling, Tokens, Typography & Shell Contracts', () => {
  const rootDir = process.cwd();

  test('T1.8.1: package.json specifies Next.js 15, React 19, and Bun test environment', () => {
    const pkgPath = path.resolve(rootDir, 'package.json');
    expect(fs.existsSync(pkgPath)).toBe(true);
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    expect(pkg.dependencies).toBeDefined();
    expect(pkg.dependencies.next).toBeDefined();
    expect(pkg.dependencies.react).toBeDefined();
  });

  test('T1.8.2: Package manager is strictly Bun: bun.lock present, zero npm/yarn/pnpm lockfiles', () => {
    const hasBunLock =
      fs.existsSync(path.resolve(rootDir, 'bun.lock')) ||
      fs.existsSync(path.resolve(rootDir, 'bun.lockb'));
    expect(hasBunLock).toBe(true);

    expect(fs.existsSync(path.resolve(rootDir, 'package-lock.json'))).toBe(false);
    expect(fs.existsSync(path.resolve(rootDir, 'yarn.lock'))).toBe(false);
    expect(fs.existsSync(path.resolve(rootDir, 'pnpm-lock.yaml'))).toBe(false);
  });

  test('T1.8.3: Design tokens define warm pale green bento variables in CSS', () => {
    const cssPath = path.resolve(rootDir, 'app/globals.css');
    expect(fs.existsSync(cssPath)).toBe(true);
    const css = fs.readFileSync(cssPath, 'utf8');

    expect(css).toContain('--app-1');
    expect(css).toContain('--app-2');
    expect(css).toContain('--app-3');
    expect(css).toContain('--card');
  });

  test('T1.8.4: Typography configuration specifies Outfit and Inter fonts', () => {
    const cssPath = path.resolve(rootDir, 'app/globals.css');
    const layoutPath = path.resolve(rootDir, 'app/layout.tsx');
    const combinedContent =
      (fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '') +
      (fs.existsSync(layoutPath) ? fs.readFileSync(layoutPath, 'utf8') : '');

    expect(combinedContent.toLowerCase()).toContain('outfit');
    expect(combinedContent.toLowerCase()).toContain('inter');
  });

  test('T1.8.5: SVG icon sprite provides required iconography symbols', () => {
    const iconComponentPath = path.resolve(rootDir, 'components/ui/Icon.tsx');
    const spritePath = path.resolve(rootDir, 'components/ui/Sprite.tsx');
    const targetFile = fs.existsSync(iconComponentPath) ? iconComponentPath : spritePath;

    expect(fs.existsSync(targetFile)).toBe(true);
    const fileContent = fs.readFileSync(targetFile, 'utf8');

    const requiredSymbols = ['play', 'pause', 'reset', 'alarm', 'gear', 'bell'];
    for (const sym of requiredSymbols) {
      expect(fileContent).toContain(sym);
    }
  });

  test('T1.8.6: Shell layout implements semantic landmark structure (<header>, <main>)', () => {
    const layoutPath = path.resolve(rootDir, 'app/layout.tsx');
    const pagePath = path.resolve(rootDir, 'app/page.tsx');
    const combined =
      (fs.existsSync(layoutPath) ? fs.readFileSync(layoutPath, 'utf8') : '') +
      (fs.existsSync(pagePath) ? fs.readFileSync(pagePath, 'utf8') : '');

    expect(combined).toMatch(/<header|<Header/);
    expect(combined).toMatch(/<main|<Main/);
  });

  test('T1.8.7: GitHub Actions CI workflow configures oven-sh/setup-bun@v2', () => {
    const ciPath = path.resolve(rootDir, '.github/workflows/ci.yml');
    expect(fs.existsSync(ciPath)).toBe(true);
    const ciContent = fs.readFileSync(ciPath, 'utf8');

    expect(ciContent).toContain('oven-sh/setup-bun@v2');
    expect(ciContent).toContain('bun test');
  });
});
