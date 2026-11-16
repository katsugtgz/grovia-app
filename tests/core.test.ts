import { describe, it, expect } from 'bun:test';
import {
  VIEWS,
  normalizeView,
  escapeHTML,
  portraitURL,
  isHexColor,
  no,
  generateAvatarSvg,
  DEFAULT_APPEARANCE,
  APPEARANCE_PRESETS,
  getAppearanceForSeed,
  getAvatarLookByName,
  normalizeConfig,
  readSettings,
  saveConfig,
  clearConfig,
  FALLBACK_AVATAR,
} from '@/lib/template-core';
import { GET as getHealth } from '@/app/api/health/route';
import type { HealthResponse } from '@/lib/types';

describe('lib/template-core — Core Shell & Template Logic', () => {
  describe('normalizeView', () => {
    it('returns exact match for valid views', () => {
      expect(normalizeView('overview')).toBe('overview');
      expect(normalizeView('people')).toBe('people');
      expect(normalizeView('payroll')).toBe('payroll');
    });

    it('strips hash prefixes correctly', () => {
      expect(normalizeView('#overview')).toBe('overview');
      expect(normalizeView('#people')).toBe('people');
      expect(normalizeView('#payroll')).toBe('payroll');
    });

    it('handles uppercase and leading/trailing whitespace', () => {
      expect(normalizeView('  PEOPLE  ')).toBe('people');
      expect(normalizeView('#Payroll')).toBe('payroll');
    });

    it('falls back to "overview" for invalid, malformed, or hostile inputs', () => {
      expect(normalizeView('')).toBe('overview');
      expect(normalizeView('unknown_tab')).toBe('overview');
      expect(normalizeView('"]')).toBe('overview');
      expect(normalizeView('constructor')).toBe('overview');
      expect(normalizeView('people"]')).toBe('overview');
      expect(normalizeView('#"><script>alert(1)</script>')).toBe('overview');
      expect(normalizeView(null)).toBe('overview');
      expect(normalizeView(undefined)).toBe('overview');
      expect(normalizeView(12345)).toBe('overview');
      expect(normalizeView({})).toBe('overview');
    });

    it('VIEWS array is frozen and immutable', () => {
      expect(Object.isFrozen(VIEWS)).toBe(true);
      expect(VIEWS).toEqual(['overview', 'people', 'payroll']);
    });
  });

  describe('escapeHTML', () => {
    it('escapes all standard HTML entities', () => {
      expect(escapeHTML('hello & world')).toBe('hello &amp; world');
      expect(escapeHTML('<script>')).toBe('&lt;script&gt;');
      expect(escapeHTML('"quoted"')).toBe('&quot;quoted&quot;');
      expect(escapeHTML("it's safe")).toBe('it&#39;s safe');
      expect(escapeHTML('<div class="box" id=\'a\'>&</div>')).toBe(
        '&lt;div class=&quot;box&quot; id=&#39;a&#39;&gt;&amp;&lt;/div&gt;'
      );
      expect(escapeHTML('<img src=x onerror="alert(1)"> &\'')).toBe(
        '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp;&#39;'
      );
    });

    it('handles falsy and non-string values gracefully', () => {
      expect(escapeHTML(null)).toBe('');
      expect(escapeHTML(undefined)).toBe('');
      expect(escapeHTML('')).toBe('');
      expect(escapeHTML(42)).toBe('42');
      expect(escapeHTML(0)).toBe('0');
      expect(escapeHTML(false)).toBe('false');
    });
  });

  describe('portraitURL', () => {
    it('accepts valid http and https URLs', () => {
      expect(portraitURL('https://example.com/avatar.png')).toBe('https://example.com/avatar.png');
      expect(portraitURL('http://example.com/avatar.jpg')).toBe('http://example.com/avatar.jpg');
    });

    it('rejects javascript: and data: schemes', () => {
      expect(portraitURL('javascript:alert(1)')).toBe(FALLBACK_AVATAR);
      expect(portraitURL('data:image/svg+xml;utf8,<svg></svg>')).toBe(FALLBACK_AVATAR);
      expect(portraitURL('data:image/svg+xml,<svg/>')).toBe(FALLBACK_AVATAR);
      expect(portraitURL('vbscript:msgbox')).toBe(FALLBACK_AVATAR);
    });

    it('falls back to demo avatar for invalid strings, null, or undefined', () => {
      expect(portraitURL(null)).toBe(FALLBACK_AVATAR);
      expect(portraitURL(undefined)).toBe(FALLBACK_AVATAR);
      expect(portraitURL('')).toBe(FALLBACK_AVATAR);
      expect(portraitURL('not-a-valid-url')).toBe(FALLBACK_AVATAR);
      expect(portraitURL('./photos/grovia/demo-avatar.svg')).toBe('./photos/grovia/demo-avatar.svg');
    });
  });

  describe('isHexColor', () => {
    it('validates 3, 4, 6, and 8 digit hex color codes', () => {
      expect(isHexColor('#fff')).toBe(true);
      expect(isHexColor('#1d1d1b')).toBe(true);
      expect(isHexColor('#5ea86f99')).toBe(true);
      expect(isHexColor('#0000')).toBe(true);
    });

    it('rejects invalid hex strings', () => {
      expect(isHexColor('red')).toBe(false);
      expect(isHexColor('#zzzzzz')).toBe(false);
      expect(isHexColor('123456')).toBe(false);
      expect(isHexColor(null)).toBe(false);
      expect(isHexColor('url(javascript:x)')).toBe(false);
    });
  });

  describe('procedural avatar generator `no(look)` and `generateAvatarSvg`', () => {
    it('renders valid SVG markup with default appearance when invoked with no args', () => {
      const svg = no();
      expect(svg).toContain('<svg viewBox="0 0 64 64"');
      expect(svg).toContain('aria-hidden="true"');
      expect(svg).toContain('focusable="false"');
      expect(svg).toContain(DEFAULT_APPEARANCE.skin);
      expect(svg).toContain(DEFAULT_APPEARANCE.shirt);
      expect(svg).toContain('</svg>');
    });

    it('handles null, undefined, and partial objects safely', () => {
      expect(no(null)).toContain('<svg viewBox="0 0 64 64"');
      expect(no(undefined)).toContain('<svg viewBox="0 0 64 64"');
      expect(no({})).toContain('<svg viewBox="0 0 64 64"');
      expect(no({ skin: '#112233' })).toContain('#112233');
    });

    it('correctly renders all 8 hair styles', () => {
      const styles = ['long', 'bob', 'afro', 'curly', 'coils', 'pony', 'bun', 'short'] as const;
      for (const hair of styles) {
        const svg = no({ hair });
        expect(svg).toContain('<svg viewBox="0 0 64 64"');
        if (['afro', 'curly', 'coils'].includes(hair)) {
          // Hairline is omitted for volume hair
          expect(svg).not.toContain('d="M20.6 28.5c0-8.2 5-13.3 11.4-13.3s11.4 5.1 11.4 13.3c-2.2-4.4-5.6-6.6-11.4-6.6s-9.2 2.2-11.4 6.6z"');
        } else {
          // Standard hairline is present
          expect(svg).toContain('d="M20.6 28.5c0-8.2 5-13.3 11.4-13.3s11.4 5.1 11.4 13.3c-2.2-4.4-5.6-6.6-11.4-6.6s-9.2 2.2-11.4 6.6z"');
        }
      }
    });

    it('toggles beard and glasses accessories', () => {
      const withBeard = no({ beard: true });
      expect(withBeard).toContain('opacity=".85" d="M21.3 30.5');

      const withoutBeard = no({ beard: false });
      expect(withoutBeard).not.toContain('opacity=".85" d="M21.3 30.5');

      const withGlasses = no({ glasses: true });
      expect(withGlasses).toContain('<circle cx="27.6" cy="29.6" r="3.3"/>');

      const withoutGlasses = no({ glasses: false });
      expect(withoutGlasses).not.toContain('<circle cx="27.6" cy="29.6" r="3.3"/>');
    });

    it('preserves preset count and deterministic seed generation', () => {
      expect(APPEARANCE_PRESETS.length).toBe(10);
      const app1 = getAppearanceForSeed('Person 01');
      const app2 = getAppearanceForSeed('Person 01');
      expect(app1).toEqual(app2);
      expect(getAvatarLookByName('Person 01')).toEqual(app1);
    });

    it('falls back to default colors when given invalid hex strings', () => {
      const svg = no({ skin: 'invalid-color', hc: 'bad', shirt: '#xyz' });
      expect(svg).toContain(DEFAULT_APPEARANCE.skin);
      expect(svg).toContain(DEFAULT_APPEARANCE.shirt);
    });

    it('generateAvatarSvg alias matches no()', () => {
      expect(generateAvatarSvg()).toBe(no());
    });
  });

  describe('normalizeConfig', () => {
    it('normalizes invalid config objects to safe defaults', () => {
      for (const val of [null, [], 4, 'wrong']) {
        const config = normalizeConfig(val);
        expect(config.brand).toBe('Grovia');
        expect(config.workdayHours).toBe(8);
        expect(config.portrait).toBe(FALLBACK_AVATAR);
      }
    });

    it('respects valid overrides and filters invalid colors and bounds people array', () => {
      const config = normalizeConfig({
        brand: 'Acme Corp',
        workdayHours: 7,
        colors: { primary: '#112233', hostile: '<script>' },
        greetingName: 'x'.repeat(200),
        people: Array.from({ length: 30 }, () => ({ name: 'Demo', rate: -1, secret: 'discard' })),
      });
      expect(config.brand).toBe('Acme Corp');
      expect(config.workdayHours).toBe(7);
      expect(config.colors.primary).toBe('#112233');
      expect(config.colors.hostile).toBeUndefined();
      expect(config.greetingName.length).toBe(24);
      expect(config.people.length).toBe(10);
      expect(config.people[0]).toEqual({ name: 'Demo' });
    });
  });

  describe('readSettings, saveConfig, clearConfig', () => {
    it('handles blocked or failing storage gracefully', () => {
      const defaults = { name: 'Demo', day: 8 };
      const blockedStorage = {
        getItem() { throw new Error('blocked'); },
        setItem() { throw new Error('blocked'); },
        removeItem() { throw new Error('blocked'); },
      };
      expect(readSettings('settings', defaults, blockedStorage)).toEqual(defaults);
      expect(saveConfig({}, blockedStorage)).toBe(false);
      expect(clearConfig(blockedStorage)).toBe(false);
    });

    it('handles malformed JSON in storage gracefully', () => {
      const defaults = { name: 'Demo', day: 8 };
      expect(readSettings('settings', defaults, { getItem: () => '{broken' })).toEqual(defaults);
      expect(readSettings('settings', defaults, { getItem: () => '{"name":null,"day":99}' })).toEqual(defaults);
    });

    it('persists and clears configuration correctly with functional storage', () => {
      const map = new Map<string, string>([['grovia-template:settings', 'old']]);
      const mockStorage = {
        getItem: (k: string) => map.get(k) ?? null,
        setItem: (k: string, v: string) => { map.set(k, v); },
        removeItem: (k: string) => { map.delete(k); },
      };

      expect(saveConfig({ brand: 'My Team' }, mockStorage)).toBe(true);
      const stored = JSON.parse(map.get('grovia-template:config') || '{}');
      expect(stored.brand).toBe('My Team');
      expect(map.has('grovia-template:settings')).toBe(false);

      expect(clearConfig(mockStorage)).toBe(true);
      expect(map.size).toBe(0);
    });
  });
});

describe('app/api/health/route — Health Route Handler', () => {
  it('responds with 200 OK and valid health JSON schema', async () => {
    const res = await getHealth();
    expect(res.status).toBe(200);

    const contentType = res.headers.get('Content-Type');
    expect(contentType).toContain('application/json');

    const data = (await res.json()) as HealthResponse;
    expect(data.status).toBe('ok');
    expect(data.database).toBe('healthy');
    expect(data.version).toBe('1.0.0');
    expect(data.system.runtime).toBe('bun');
    expect(typeof data.system.version).toBe('string');
    expect(data.system.version.length).toBeGreaterThan(0);
    expect(typeof data.uptime).toBe('number');
    expect(data.uptime).toBeGreaterThanOrEqual(0);

    const date = new Date(data.timestamp);
    expect(date.toISOString()).toBe(data.timestamp);
  });
});
