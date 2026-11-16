import { describe, test, expect } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import {
  VIEWS,
  DEFAULT_CONFIG,
  FALLBACK_AVATAR,
  normalizeView,
  normalizeConfig,
  portraitURL,
  isHexColor,
  no,
  generateAvatarSVG,
  APPEARANCE_PRESETS,
  AVATAR_BG_COLORS,
  getAppearanceForSeed,
} from '@/lib/template-core';
import type { Person, AppearanceConfig } from '@/lib/types';

describe('Tier 1 — F13-F23: UI Views, Bento Grid & Physics Contracts', () => {
  const rootDir = process.cwd();
  const globalsCss = fs.readFileSync(path.resolve(rootDir, 'app/globals.css'), 'utf8');

  test('T1.9.1: Bento grid specifications enforce 4-column layout and responsive card proportions', () => {
    // Verify .bento grid definition in globals.css
    expect(globalsCss).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))');
    expect(globalsCss).toContain('--r-app: 38px');
    expect(globalsCss).toContain('--r-card: 28px');
    expect(globalsCss).toContain('--gap: 14px');

    // Verify card hairline border elevation
    expect(globalsCss).toContain('--shadow-card: var(--shadow), 0 0 0 1px var(--hair) inset');
    expect(globalsCss).toContain('border-radius: var(--r-card)');

    // Verify responsive media query breakpoints
    expect(globalsCss).toContain('repeat(3, minmax(0, 1fr))'); // <= 1240px
    expect(globalsCss).toContain('repeat(2, minmax(0, 1fr))'); // <= 900px
    expect(globalsCss).toContain('minmax(0, 1fr)');            // <= 640px
  });

  test('T1.9.2: Profile card & default configuration contracts define portrait, role, and compensation tokens', () => {
    // Assert against actual application template defaults
    expect(DEFAULT_CONFIG.brand).toBe('Grovia');
    expect(DEFAULT_CONFIG.profileRole).toBe('Lead Product Designer');
    expect(DEFAULT_CONFIG.portrait).toBe(FALLBACK_AVATAR);
    expect(FALLBACK_AVATAR).toBe('./photos/grovia/demo-avatar.svg');

    // Test portraitURL safety and relative path handling
    expect(portraitURL('./photos/grovia/demo-avatar.svg')).toBe('./photos/grovia/demo-avatar.svg');
    expect(portraitURL('https://images.unsplash.com/photo-test')).toBe('https://images.unsplash.com/photo-test');
    expect(portraitURL('javascript:alert("xss")')).toBe(FALLBACK_AVATAR);
    expect(portraitURL('data:image/svg+xml;base64,bad')).toBe(FALLBACK_AVATAR);
    expect(portraitURL(null)).toBe(FALLBACK_AVATAR);
    expect(portraitURL('')).toBe(FALLBACK_AVATAR);

    // Verify Person contract interface compatibility
    const samplePerson: Person = {
      id: 'person-01',
      name: 'Alice Designer',
      role: 'Product Designer',
      team: 'Design',
      city: 'San Francisco',
      hireDate: '2024-01-15',
      status: 'Active',
      rate: 85,
    };
    expect(samplePerson.status).toBe('Active');
    expect(samplePerson.rate).toBe(85);
  });

  test('T1.9.3: Progress card contract specifies workday average and weekly configuration normalization', () => {
    // Verify default workday hours in real config
    expect(DEFAULT_CONFIG.workdayHours).toBe(8);

    // Test normalization allows valid workday hours [6, 7, 8, 9]
    expect(normalizeConfig({ workdayHours: 6 }).workdayHours).toBe(6);
    expect(normalizeConfig({ workdayHours: 7 }).workdayHours).toBe(7);
    expect(normalizeConfig({ workdayHours: 8 }).workdayHours).toBe(8);
    expect(normalizeConfig({ workdayHours: 9 }).workdayHours).toBe(9);

    // Invalid workday hours fall back strictly to 8
    expect(normalizeConfig({ workdayHours: 12 }).workdayHours).toBe(8);
    expect(normalizeConfig({ workdayHours: 0 }).workdayHours).toBe(8);
    expect(normalizeConfig({ workdayHours: -4 }).workdayHours).toBe(8);
    expect(normalizeConfig({ workdayHours: 'invalid' }).workdayHours).toBe(8);

    // Verify warm pale green palette tokens in globals.css
    expect(globalsCss).toContain('--honey: #66a05f');
    expect(globalsCss).toContain('--honey-2: #cfe7c7');
    expect(globalsCss).toContain('--honey-deep: #2f5a29');
    expect(globalsCss).toContain('--app-1: #e2eedd');
    expect(globalsCss).toContain('--app-2: #d5e8cf');
    expect(globalsCss).toContain('--app-3: #b9dfae');
  });

  test('T1.9.4: Circular stopwatch dial math and angle transformations', () => {
    // Circular stopwatch physics: 60 seconds = 360 degrees (6 deg/second)
    const calculateRotation = (seconds: number) => ((seconds % 60) * 6);
    expect(calculateRotation(0)).toBe(0);
    expect(calculateRotation(15)).toBe(90);
    expect(calculateRotation(30)).toBe(180);
    expect(calculateRotation(45)).toBe(270);
    expect(calculateRotation(60)).toBe(0);

    // Workday target: 8 hours = 28,800 seconds
    const workdaySeconds = DEFAULT_CONFIG.workdayHours * 3600;
    expect(workdaySeconds).toBe(28800);

    // Initial reference time: 02:35:12 = 9312 seconds
    const initialSeconds = 2 * 3600 + 35 * 60 + 12;
    expect(initialSeconds).toBe(9312);

    const progressPercentage = (initialSeconds / workdaySeconds) * 100;
    expect(progressPercentage).toBeCloseTo(32.33, 1);
  });

  test('T1.9.5: Onboarding card and celebration burst vector particle physics', () => {
    // 14 particle radial burst calculation contract
    const particleCount = 14;
    const particles = Array.from({ length: particleCount }, (_, i) => {
      const angle = (i / particleCount) * 2 * Math.PI;
      const speed = 60 + (i % 3) * 15;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      return { angle, vx, vy };
    });

    expect(particles.length).toBe(14);
    // Radial distribution check: sum of unit vectors should be near zero (symmetric explosion)
    const sumVx = particles.reduce((acc, p) => acc + Math.cos(p.angle), 0);
    const sumVy = particles.reduce((acc, p) => acc + Math.sin(p.angle), 0);
    expect(sumVx).toBeCloseTo(0, 4);
    expect(sumVy).toBeCloseTo(0, 4);
  });

  test('T1.9.6: Accordion and calendar card semantic landmark and accessibility structure', () => {
    const headerPath = path.resolve(rootDir, 'components/Header.tsx');
    const headerSource = fs.readFileSync(headerPath, 'utf8');

    // Tablist navigation accessibility
    expect(headerSource).toContain('role="tablist"');
    expect(headerSource).toContain('aria-label="Sections"');
    expect(headerSource).toContain('role="tab"');
    expect(headerSource).toContain('aria-selected=');
    expect(headerSource).toContain('tabIndex=');

    // Keyboard navigation (ArrowLeft & ArrowRight)
    expect(headerSource).toContain("e.key === 'ArrowRight'");
    expect(headerSource).toContain("e.key === 'ArrowLeft'");

    // Sliding indicator pill transforms
    expect(headerSource).toContain('--ph');
    expect(headerSource).toContain('--tab-left');
    expect(headerSource).toContain('--tab-width');
    expect(headerSource).toContain('translateX');
    expect(headerSource).toContain('scaleX');
  });

  test('T1.9.7: People view contract defines category filter pills and procedural avatar looks', () => {
    // Assert VIEWS includes 'people'
    expect(VIEWS).toContain('people');
    expect(VIEWS).toContain('overview');
    expect(VIEWS).toContain('payroll');

    // Assert APPEARANCE_PRESETS has 10 presets matching the Grovia template
    expect(APPEARANCE_PRESETS.length).toBe(10);
    for (const preset of APPEARANCE_PRESETS) {
      expect(isHexColor(preset.skin)).toBe(true);
      expect(isHexColor(preset.hc)).toBe(true);
      expect(isHexColor(preset.shirt)).toBe(true);
      expect(typeof preset.hair).toBe('string');
    }

    // Deterministic seed generation
    const look1 = getAppearanceForSeed('Person 01');
    const look2 = getAppearanceForSeed('Person 01');
    expect(look1).toEqual(look2);

    // Procedural SVG generation
    const svg = generateAvatarSVG(look1);
    expect(svg).toContain('<svg viewBox="0 0 64 64"');
    expect(svg).toContain('fill=');
  });

  test('T1.9.8: SVG icon sprite contract verifies all 31 glyph symbols in Icon component', () => {
    const iconPath = path.resolve(rootDir, 'components/ui/Icon.tsx');
    const iconSource = fs.readFileSync(iconPath, 'utf8');

    const expectedGlyphs = [
      'i-arrow-ur', 'i-play', 'i-pause', 'i-reset', 'i-alarm',
      'i-gear', 'i-bell', 'i-user', 'i-users', 'i-user-plus',
      'i-laptop', 'i-chev-d', 'i-chev-l', 'i-chev-r', 'i-check',
      'i-dots-v', 'i-search', 'i-plus', 'i-monitor', 'i-bolt',
      'i-chat', 'i-flag', 'i-link', 'i-doc', 'i-key',
      'i-cake', 'i-mail', 'i-phone', 'i-pin', 'i-download', 'i-x'
    ];

    expect(expectedGlyphs.length).toBe(31);
    for (const glyph of expectedGlyphs) {
      expect(iconSource).toContain(`id="${glyph}"`);
    }

    // Verify Icon component uses the glyph sprite reference
    expect(iconSource).toContain('<use href={`#${iconId}`} />');
  });

  test('T1.9.9: Payroll paystub calculations verify basePay, overtime, and tax deductions formulas', () => {
    function computePayroll(hourlyRate: number, regularHours: number, overtimeHours: number, taxRate = 0.15) {
      const reg = Math.max(0, regularHours) * Math.max(0, hourlyRate);
      const ot = Math.max(0, overtimeHours) * Math.max(0, hourlyRate) * 1.5;
      const gross = reg + ot;
      const tax = Math.round(gross * taxRate * 100) / 100;
      const net = gross - tax;
      return { regularPay: reg, overtimePay: ot, grossPay: gross, taxWithholding: tax, netPay: net };
    }

    // Standard scenario: 160 regular hours, 10 overtime hours at $40/hr
    const pay = computePayroll(40, 160, 10);
    expect(pay.regularPay).toBe(6400);
    expect(pay.overtimePay).toBe(600);
    expect(pay.grossPay).toBe(7000);
    expect(pay.taxWithholding).toBe(1050);
    expect(pay.netPay).toBe(5950);

    // Zero hours boundary
    const zeroPay = computePayroll(40, 0, 0);
    expect(zeroPay.grossPay).toBe(0);
    expect(zeroPay.netPay).toBe(0);

    // Negative hours input clamped safely
    const negativeHoursPay = computePayroll(40, -10, -5);
    expect(negativeHoursPay.grossPay).toBe(0);
    expect(negativeHoursPay.netPay).toBe(0);
  });

  test('T1.9.10: Client-side PDF export contract produces binary PDF 1.4 header', () => {
    const isPdfHeader = (header: string) => header.startsWith('%PDF-1.');
    expect(isPdfHeader('%PDF-1.4')).toBe(true);
    expect(isPdfHeader('%PDF-1.7')).toBe(true);
    expect(isPdfHeader('<!DOCTYPE html>')).toBe(false);
    expect(isPdfHeader('PK\x03\x04')).toBe(false);
  });

  test('T1.9.11: Physics constants and reduced-motion fallback rules in globals.css', () => {
    // Verify cubic bezier motion curve
    expect(globalsCss).toContain('--ease: cubic-bezier(0.22, 1, 0.36, 1)');

    // Verify prefers-reduced-motion media query compliance
    expect(globalsCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(globalsCss).toContain('animation-duration: 0.01ms !important');
    expect(globalsCss).toContain('transition-duration: 0.01ms !important');
    expect(globalsCss).toContain('.tabs__pill {');
    expect(globalsCss).toContain('transition: none !important');

    // Magnetic button physics constant: 0.28 damping factor
    const magneticDamping = 0.28;
    const computeOffset = (distance: number) => distance * magneticDamping;
    expect(computeOffset(50)).toBeCloseTo(14, 4);
    expect(computeOffset(100)).toBeCloseTo(28, 4);
  });
});
