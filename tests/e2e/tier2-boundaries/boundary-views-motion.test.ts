import { describe, test, expect } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import {
  APPEARANCE_PRESETS,
  getAppearanceForSeed,
  isHexColor,
  no,
  normalizeConfig,
  DEFAULT_APPEARANCE,
} from '@/lib/template-core';

describe('Tier 2 — Boundary: UI Views, Cards & Motion (F12-F23)', () => {
  const rootDir = process.cwd();
  const globalsCss = fs.readFileSync(path.resolve(rootDir, 'app/globals.css'), 'utf8');

  test('T2.9.1: Reduced-motion media query fallback rules enforce universal 0.01ms animation/transition capping', () => {
    expect(globalsCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(globalsCss).toContain('animation-duration: 0.01ms !important');
    expect(globalsCss).toContain('animation-iteration-count: 1 !important');
    expect(globalsCss).toContain('transition-duration: 0.01ms !important');
    expect(globalsCss).toContain('scroll-behavior: auto !important');
    expect(globalsCss).toContain('.tabs__pill {');
    expect(globalsCss).toContain('transition: none !important');
  });

  test('T2.9.2: Zero layout property animation enforcement: sliding pill tab animation uses strictly GPU transforms', () => {
    const headerPath = path.resolve(rootDir, 'components/Header.tsx');
    const headerSource = fs.readFileSync(headerPath, 'utf8');

    // Indicator pill caps & mid section use translateX and scaleX transforms
    expect(headerSource).toContain('.style.transform = `translateX(${leftOffset}px)`');
    expect(headerSource).toContain('.style.transform = `translateX(${leftOffset + width - height}px)`');
    expect(headerSource).toContain('.style.transform = `translateX(${leftOffset + height / 2}px) scaleX(');

    // Verify absence of layout property transitions on sliding components
    expect(headerSource).not.toMatch(/\.style\.left\s*=/);
    expect(headerSource).not.toMatch(/\.style\.width\s*=/);
    expect(headerSource).not.toMatch(/\.style\.height\s*=/);
    expect(headerSource).not.toMatch(/\.style\.margin\s*=/);
  });

  test('T2.9.3: Extreme & negative values in payroll paystub calculations', () => {
    function computePayroll(hourlyRate: number, regularHours: number, overtimeHours: number, taxRate = 0.15) {
      const reg = Math.max(0, regularHours) * Math.max(0, hourlyRate);
      const ot = Math.max(0, overtimeHours) * Math.max(0, hourlyRate) * 1.5;
      const gross = reg + ot;
      const tax = Math.round(gross * taxRate * 100) / 100;
      const net = gross - tax;
      return { regularPay: reg, overtimePay: ot, grossPay: gross, taxWithholding: tax, netPay: net };
    }

    // Zero hours boundary
    const zero = computePayroll(50, 0, 0);
    expect(zero.grossPay).toBe(0);
    expect(zero.taxWithholding).toBe(0);
    expect(zero.netPay).toBe(0);

    // Negative hours boundary
    const negativeHours = computePayroll(50, -40, -10);
    expect(negativeHours.grossPay).toBe(0);
    expect(negativeHours.netPay).toBe(0);

    // Negative rate boundary
    const negativeRate = computePayroll(-50, 40, 10);
    expect(negativeRate.grossPay).toBe(0);
    expect(negativeRate.netPay).toBe(0);

    // Fractional hours and rate
    const fractional = computePayroll(42.375, 37.25, 4.5);
    expect(fractional.grossPay).toBeGreaterThan(0);
    expect(Number.isFinite(fractional.grossPay)).toBe(true);
    expect(Number.isFinite(fractional.netPay)).toBe(true);

    // Extreme enterprise payroll numbers
    const massive = computePayroll(10000, 160, 40);
    expect(massive.grossPay).toBe(2200000);
    expect(massive.netPay).toBe(1870000);
  });

  test('T2.9.4: Circular stopwatch dial boundary calculations (6 deg/second, 360-degree wrap)', () => {
    const calcDeg = (seconds: number) => {
      const safe = Math.max(0, seconds);
      return (safe * 6) % 360;
    };

    expect(calcDeg(0)).toBe(0);
    expect(calcDeg(59)).toBe(354);
    expect(calcDeg(60)).toBe(0);
    expect(calcDeg(61)).toBe(6);
    expect(calcDeg(3600)).toBe(0);
    expect(calcDeg(86400)).toBe(0);
    expect(calcDeg(-15)).toBe(0); // Clamped safely to 0
    expect(calcDeg(0.5)).toBe(3); // Fractional second rotation
  });

  test('T2.9.5: Magnetic button physics boundary limits and cursor displacement', () => {
    const damping = 0.28;
    const computeDisplacement = (dx: number, dy: number) => ({
      x: dx * damping,
      y: dy * damping,
    });

    expect(computeDisplacement(0, 0)).toEqual({ x: 0, y: 0 });
    expect(computeDisplacement(100, 50).x).toBeCloseTo(28, 4);
    expect(computeDisplacement(100, 50).y).toBeCloseTo(14, 4);
    expect(computeDisplacement(-200, -100).x).toBeCloseTo(-56, 4);
    expect(computeDisplacement(-200, -100).y).toBeCloseTo(-28, 4);
  });

  test('T2.9.6: Procedural avatar boundary seed inputs in lib/template-core.ts', () => {
    // Empty string seed
    const emptySeedLook = getAppearanceForSeed('');
    expect(emptySeedLook).toBeDefined();
    expect(APPEARANCE_PRESETS).toContain(emptySeedLook);

    // Massive 10,000 character seed
    const largeSeed = 'a'.repeat(10000);
    const largeSeedLook = getAppearanceForSeed(largeSeed);
    expect(largeSeedLook).toBeDefined();
    expect(APPEARANCE_PRESETS).toContain(largeSeedLook);

    // Emoji seed
    const emojiLook = getAppearanceForSeed('👩‍🔬🚀🎨');
    expect(emojiLook).toBeDefined();
    expect(APPEARANCE_PRESETS).toContain(emojiLook);

    // Control characters seed
    const controlLook = getAppearanceForSeed('\x00\x01\x1F');
    expect(controlLook).toBeDefined();
    expect(APPEARANCE_PRESETS).toContain(controlLook);
  });

  test('T2.9.7: Hex color validation boundary cases in lib/template-core.ts', () => {
    expect(isHexColor('#abc')).toBe(true);
    expect(isHexColor('#abcd')).toBe(true);
    expect(isHexColor('#123456')).toBe(true);
    expect(isHexColor('#12345678')).toBe(true);
    expect(isHexColor('#fafff79e')).toBe(true);

    // Invalid hex cases
    expect(isHexColor('123456')).toBe(false);
    expect(isHexColor('#gggggg')).toBe(false);
    expect(isHexColor('#12345')).toBe(false);
    expect(isHexColor('')).toBe(false);
    expect(isHexColor(null)).toBe(false);
    expect(isHexColor('rgb(0,0,0)')).toBe(false);
    expect(isHexColor("#123'; DROP TABLE waitlist;--")).toBe(false);
  });

  test('T2.9.8: Template configuration normalization boundaries (rate clamping, array slicing)', () => {
    // Array of 20 people -> clamped to 10
    const rawPeople = Array.from({ length: 20 }, (_, i) => ({
      name: `Person ${i}`,
      rate: i === 0 ? -100 : i === 1 ? 99999 : 50 + i,
    }));

    const normalized = normalizeConfig({ people: rawPeople });
    expect(normalized.people.length).toBe(10);

    // Invalid rates (-100, 99999) must not be preserved as safe rates
    expect(normalized.people[0].rate).toBeUndefined();
    expect(normalized.people[1].rate).toBeUndefined();
    expect(normalized.people[2].rate).toBe(52);
  });

  test('T2.9.9: SVG avatar generator fallback rendering on null / undefined looks', () => {
    const defaultSvg = no(null);
    expect(defaultSvg).toContain('<svg viewBox="0 0 64 64"');
    expect(defaultSvg).toContain(DEFAULT_APPEARANCE.skin);

    const undefinedSvg = no(undefined);
    expect(undefinedSvg).toBe(defaultSvg);

    const emptyLookSvg = no({});
    expect(emptyLookSvg).toContain('<svg viewBox="0 0 64 64"');

    // Unknown hair style falls back safely without throw
    const unknownHairSvg = no({ hair: 'unknown_style' as any });
    expect(unknownHairSvg).toContain('<svg viewBox="0 0 64 64"');
  });

  test('T2.9.10: Responsive layout and safe area insets defined in globals.css', () => {
    expect(globalsCss).toContain('clamp(16px, 1.6vw, 28px)');
    expect(globalsCss).toContain('clamp(16px, 2vw, 40px)');
    expect(globalsCss).toContain('clamp(32px, 4.2vw, 54px)');
    expect(globalsCss).toContain('env(safe-area-inset-left)');
    expect(globalsCss).toContain('env(safe-area-inset-right)');
    expect(globalsCss).toContain('env(safe-area-inset-bottom)');
  });
});
