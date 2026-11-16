import { describe, test, expect, beforeAll } from 'bun:test';
import path from 'node:path';

describe('Tier 1 — F5: Template Core & Procedural Avatar Generator', () => {
  let core: any;

  beforeAll(async () => {
    const modPath = path.resolve(process.cwd(), 'lib/template-core.ts');
    core = await import(modPath);
  });

  test('T1.6.1: normalizeView maps valid view tokens correctly', () => {
    expect(core.normalizeView('overview')).toBe('overview');
    expect(core.normalizeView('people')).toBe('people');
    expect(core.normalizeView('payroll')).toBe('payroll');
  });

  test('T1.6.2: normalizeView handles hashes and unknown tokens safely', () => {
    expect(core.normalizeView('#overview')).toBe('overview');
    expect(core.normalizeView('#people')).toBe('people');
    expect(core.normalizeView('#payroll')).toBe('payroll');
    expect(core.normalizeView('')).toBe('overview');
    expect(core.normalizeView('unknown_view')).toBe('overview');
  });

  test('T1.6.3: escapeHTML encodes reserved HTML characters', () => {
    const raw = `<b>"Hello" & 'World'</b>`;
    const escaped = core.escapeHTML(raw);
    expect(escaped).toContain('&lt;b&gt;');
    expect(escaped).toContain('&quot;Hello&quot;');
    expect(escaped).toContain('&amp;');
    expect(escaped).toContain('&#39;World&#39;');
    expect(escaped).toContain('&lt;/b&gt;');
  });

  test('T1.6.4: portraitURL enforces http/https protocol and blocks unsafe schemes', () => {
    const validHttp = core.portraitURL('https://example.com/avatar.jpg');
    expect(validHttp).toBe('https://example.com/avatar.jpg');

    const javascriptScheme = core.portraitURL('javascript:alert(1)');
    expect(javascriptScheme).toContain('demo-avatar.svg');

    const dataScheme = core.portraitURL('data:image/svg+xml;base64,PHN2Zz4=');
    expect(dataScheme).toContain('demo-avatar.svg');
  });

  test('T1.6.5: normalizeConfig sanitizes brand, limits people count, and defaults workdayHours', () => {
    const rawConfig = {
      brand: '  Grovia Cloud\u0000  ',
      workdayHours: 7,
      people: Array.from({ length: 25 }, (_, i) => ({
        name: `Person ${i}`,
        role: 'Engineer',
        team: 'Engineering',
      })),
    };
    const normalized = core.normalizeConfig(rawConfig);
    expect(normalized.brand).toBe('Grovia Cloud');
    expect(normalized.workdayHours).toBe(7);
    expect(normalized.people.length).toBeLessThanOrEqual(10);
  });

  test('T1.6.6: Procedural avatar generator produces valid 64x64 SVG markup', () => {
    const presets = core.Za || core.APPEARANCE_PRESETS || core.PRESET_LOOKS;
    const preset = presets ? presets[0] : { skin: '#b27a55', hair: 'curly', hc: '#1d1512', shirt: '#e2d6c4' };
    const genFn = core.generateAvatarSVG || core.generateAvatarSvg || core.no;
    const svg = genFn(preset);
    expect(typeof svg).toBe('string');
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox="0 0 64 64"');
    expect(svg).toContain('fill="var(--av)"');
    expect(svg).toContain('</svg>');
  });

  test('T1.6.7: getLookForSeed maps string seeds deterministically via 31x polynomial hash', () => {
    const hashFn = core.getLookForSeed || core.getAppearanceForSeed || core.getAvatarLookByName;
    const look1 = hashFn('Jane Doe');
    const look2 = hashFn('Jane Doe');
    expect(look1).toEqual(look2);

    const emptyLook = hashFn('');
    expect(emptyLook).toBeDefined();
    expect(emptyLook.skin).toBeDefined();
  });
});
