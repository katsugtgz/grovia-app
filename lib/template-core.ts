import type { AppearanceConfig, HairStyle, TemplateConfig, TemplateSettings, ViewType } from './types';

/**
 * Valid view IDs supported by the Grovia motion template.
 */
export const VIEWS: readonly ViewType[] = Object.freeze(['overview', 'people', 'payroll'] as const);

/**
 * Normalizes input view string (handling hash prefixes, query params, case, and whitespace)
 * falling back safely to 'overview'.
 */
export function normalizeView(value: unknown): ViewType {
  if (typeof value === 'string') {
    const clean = value.replace(/^#/, '').split('?')[0].toLowerCase().trim();
    if ((VIEWS as readonly string[]).includes(clean)) {
      return clean as ViewType;
    }
  }
  return 'overview';
}

/**
 * HTML entity escaper preventing XSS vulnerabilities.
 */
export function escapeHTML(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return char;
    }
  });
}

/**
 * Fallback avatar path.
 */
export const FALLBACK_AVATAR = './photos/grovia/demo-avatar.svg';

/**
 * Validates and safely resolves avatar URLs, rejecting dangerous URI schemes.
 */
export function portraitURL(value: unknown, base = 'https://example.invalid/'): string {
  if (!value || typeof value !== 'string') return FALLBACK_AVATAR;
  const trimmed = value.trim();
  if (!trimmed) return FALLBACK_AVATAR;
  // Disallow javascript:, data:, vbscript: schemes
  if (/^(?:javascript|data|vbscript):/i.test(trimmed)) return FALLBACK_AVATAR;
  try {
    const url = new URL(trimmed, base);
    if (!['https:', 'http:'].includes(url.protocol)) return FALLBACK_AVATAR;
    if (url.origin === 'https://example.invalid') {
      // Relative path: must start with '/' or './'
      if (!trimmed.startsWith('/') && !trimmed.startsWith('./')) {
        return FALLBACK_AVATAR;
      }
    }
    return trimmed;
  } catch {
    return FALLBACK_AVATAR;
  }
}

/**
 * Safe hex color validator.
 */
export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(value.trim());
}

function safeColor(value: unknown, fallback: string): string {
  return isHexColor(value) ? value.trim() : fallback;
}

/**
 * Default fallback appearance for avatars.
 */
export const DEFAULT_APPEARANCE: AppearanceConfig = Object.freeze({
  skin: '#eec8a3',
  hair: 'bob',
  hc: '#1d1716',
  shirt: '#c9b6d8',
});

/**
 * Vector hair styles matching the Grovia reference template.
 */
const hairStyles: Record<string, (color: string) => string> = {
  long: (c: string) =>
    `<path fill="${c}" d="M18.5 29c0-9.5 6-15.5 13.5-15.5S45.5 19.5 45.5 29v15.5c0 2-3.5 3-6 1.8V31h-15v15.3c-2.5 1.2-6 .2-6-1.8z"/>`,
  bob: (c: string) =>
    `<path fill="${c}" d="M19 29c0-9.5 6-15.5 13-15.5S45 19.5 45 29v8.5c0 1.8-2.4 2.6-4.5 1.8H23.5c-2.1.8-4.5 0-4.5-1.8z"/>`,
  afro: (c: string) =>
    `<circle fill="${c}" cx="32" cy="24.5" r="15.5"/>`,
  curly: (c: string) =>
    [
      [21, 22, 5.5],
      [26.5, 16.5, 6],
      [33, 15, 6.5],
      [39.5, 17.5, 6],
      [43.5, 23.5, 5.5],
      [19.5, 29.5, 4.6],
      [44.5, 30, 4.6],
      [19.5, 36, 4.3],
      [44.5, 36.5, 4.3],
    ]
      .map(([cx, cy, r]) => `<circle fill="${c}" cx="${cx}" cy="${cy}" r="${r}"/>`)
      .join(''),
  coils: (c: string) =>
    [
      [23, 22.5, 3.6],
      [26.5, 18.8, 3.8],
      [31, 17, 4],
      [35.5, 17.4, 3.9],
      [39.6, 19.8, 3.7],
      [42, 24, 3.2],
      [21.6, 26.5, 2.8],
      [42.6, 27.6, 2.6],
    ]
      .map(([cx, cy, r]) => `<circle fill="${c}" cx="${cx}" cy="${cy}" r="${r}"/>`)
      .join(''),
  pony: (c: string) =>
    `<ellipse fill="${c}" cx="44.5" cy="33" rx="3.4" ry="7.5" transform="rotate(-12 44.5 33)"/>`,
  bun: (c: string) =>
    `<circle fill="${c}" cx="32" cy="13" r="5.2"/>`,
  short: () => '',
};

const topHairline = (c: string) =>
  `<path fill="${c}" d="M20.6 28.5c0-8.2 5-13.3 11.4-13.3s11.4 5.1 11.4 13.3c-2.2-4.4-5.6-6.6-11.4-6.6s-9.2 2.2-11.4 6.6z"/>`;

/**
 * Procedural vector avatar generator producing standalone SVG markup.
 * Exactly replicates reference template function `no(look)`.
 */
export function no(look?: Partial<AppearanceConfig> | null, bgColor: string = 'var(--av)'): string {
  const conf: AppearanceConfig = look
    ? {
        skin: safeColor(look.skin, DEFAULT_APPEARANCE.skin),
        hair: look.hair || DEFAULT_APPEARANCE.hair,
        hc: safeColor(look.hc, DEFAULT_APPEARANCE.hc),
        shirt: safeColor(look.shirt, DEFAULT_APPEARANCE.shirt),
        beard: look.beard,
        glasses: look.glasses,
      }
    : DEFAULT_APPEARANCE;

  const hairKey = (conf.hair as HairStyle) || 'bob';
  const hairShape = hairStyles[hairKey]?.(conf.hc) || '';
  const hairline = ['afro', 'curly', 'coils'].includes(hairKey) ? '' : topHairline(conf.hc);

  const beardPath = conf.beard
    ? `<path fill="${conf.hc}" opacity=".85" d="M21.3 30.5c.8 6.8 4.8 10 10.7 10s9.9-3.2 10.7-10c-2.3 2.6-5.2 3.8-10.7 3.8s-8.4-1.2-10.7-3.8z"/>`
    : '';

  const glassesPath = conf.glasses
    ? `<g fill="none" stroke="#3b2b20" stroke-width="1.1"><circle cx="27.6" cy="29.6" r="3.3"/><circle cx="36.4" cy="29.6" r="3.3"/><path d="M30.9 29.4h2.2"/></g>`
    : '';

  return `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <rect width="64" height="64" fill="${bgColor}"/>
    ${hairShape}
    <path fill="${conf.shirt}" d="M11 64c0-12 8.5-19.5 21-19.5S53 52 53 64z"/>
    <path fill="${conf.skin}" d="M28 37h8v8.5c0 2.2-1.8 3.5-4 3.5s-4-1.3-4-3.5z"/>
    <path fill="#000" opacity=".12" d="M28 40.5c2.6 1.4 5.4 1.4 8 0V37h-8z"/>
    <circle fill="${conf.skin}" cx="32" cy="29" r="11"/>
    ${hairline}
    ${beardPath}
    <circle fill="#2a211b" cx="27.6" cy="29.6" r="1.25"/><circle fill="#2a211b" cx="36.4" cy="29.6" r="1.25"/>
    <path fill="none" stroke="#2a211b" stroke-width="1.3" stroke-linecap="round" d="M28.8 34.2q3.2 2.6 6.4 0"/>
    ${glassesPath}
  </svg>`;
}

export const generateAvatarSvg = no;
export const generateAvatarSVG = no;

/**
 * 10 Presets from reference GROVIA template.
 */
export const APPEARANCE_PRESETS: readonly AppearanceConfig[] = Object.freeze([
  { skin: '#b27a55', hair: 'curly', hc: '#1d1512', shirt: '#e2d6c4' },
  { skin: '#c68a5e', hair: 'short', hc: '#1f1a17', shirt: '#6f7550', beard: true },
  { skin: '#efcaa6', hair: 'long', hc: '#1b1716', shirt: '#cdb48e' },
  { skin: '#f1cdae', hair: 'short', hc: '#c29a5f', shirt: '#9aa0a6', glasses: true },
  { skin: '#6e4428', hair: 'afro', hc: '#1c1512', shirt: '#d9a531' },
  { skin: '#e3b287', hair: 'pony', hc: '#4a2e1f', shirt: '#f7f3ea' },
  { skin: '#ecc59b', hair: 'short', hc: '#161313', shirt: '#2f3a56' },
  { skin: '#f0c5a0', hair: 'bob', hc: '#8a3b22', shirt: '#efe3cc' },
  { skin: '#c48c63', hair: 'short', hc: '#231a15', shirt: '#4a4a48', beard: true },
  { skin: '#f5d5ba', hair: 'bun', hc: '#d9b977', shirt: '#a8b89a', glasses: true },
]);

export const PRESET_LOOKS = APPEARANCE_PRESETS;

export const AVATAR_BG_COLORS: readonly string[] = Object.freeze([
  '#f2d9a0', '#cfe0c8', '#e7cdbf', '#cbd8ea', '#e4d3ea', '#d6e2dc',
]);

/**
 * Deterministic appearance generator based on a string seed (e.g. teammate name).
 */
export function getAppearanceForSeed(seed: string): AppearanceConfig {
  const code = [...seed].reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 7);
  return APPEARANCE_PRESETS[code % APPEARANCE_PRESETS.length];
}

export const getAvatarLookByName = getAppearanceForSeed;

/**
 * Sanitize text field helper.
 */
function sanitizeText(value: unknown, fallback = '', limit = 80): string {
  if (typeof value !== 'string') return fallback;
  return value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, limit);
}

/**
 * Default template configuration.
 */
export const DEFAULT_CONFIG: TemplateConfig = Object.freeze({
  brand: 'Grovia',
  greetingName: 'Person 05',
  workdayHours: 8,
  portrait: FALLBACK_AVATAR,
  profileName: 'Demo Person 01',
  profileRole: 'Lead Product Designer',
  showPurchaseBadge: true,
  colors: {},
  people: [],
});

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/**
 * Normalizes user-supplied template configuration.
 */
export function normalizeConfig(input: unknown): TemplateConfig {
  const data = asObject(input);
  const colors: Record<string, string> = {};
  if (data.colors && typeof data.colors === 'object') {
    for (const [k, v] of Object.entries(data.colors as Record<string, unknown>)) {
      if (/^[a-z][\w-]{0,30}$/.test(k) && isHexColor(v)) {
        colors[k] = v;
      }
    }
  }

  const fields = ['name', 'role', 'team', 'city', 'since', 'status', 'email', 'phone', 'bday'] as const;
  const people = Array.isArray(data.people)
    ? data.people.slice(0, 10).map((person) => {
        const source = asObject(person);
        const safe: Record<string, unknown> = {};
        for (const field of fields) {
          if (typeof source[field] === 'string') safe[field] = sanitizeText(source[field]);
        }
        if (isHexColor(source.av)) safe.av = source.av;
        if (Number.isFinite(source.rate) && (source.rate as number) >= 0 && (source.rate as number) <= 10000) {
          safe.rate = source.rate;
        }
        return safe;
      })
    : [];

  const workday = Number(data.workdayHours);
  const workdayHours = [6, 7, 8, 9].includes(workday) ? workday : 8;

  return {
    brand: sanitizeText(data.brand, 'Grovia', 40) || 'Grovia',
    greetingName: sanitizeText(data.greetingName, 'Person 05', 24) || 'Person 05',
    workdayHours,
    portrait: portraitURL(data.portrait),
    profileName: sanitizeText(data.profileName, DEFAULT_CONFIG.profileName, 60),
    profileRole: sanitizeText(data.profileRole, DEFAULT_CONFIG.profileRole, 60),
    showPurchaseBadge: typeof data.showPurchaseBadge === 'boolean' ? data.showPurchaseBadge : true,
    colors,
    people,
  };
}

/**
 * Read settings with storage fallback.
 */
export function readSettings(key: string, defaults: TemplateSettings, storage?: { getItem: (k: string) => string | null }): TemplateSettings {
  try {
    const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!target) return { ...defaults };
    const saved = asObject(JSON.parse(target.getItem(key) || '{}'));
    const dayNum = Number(saved.day);
    return {
      name: sanitizeText(saved.name, defaults.name, 24) || defaults.name,
      day: [6, 7, 8, 9].includes(dayNum) ? dayNum : defaults.day,
    };
  } catch {
    return { ...defaults };
  }
}

/**
 * Save configuration to storage.
 */
export function saveConfig(config: unknown, storage?: { setItem: (k: string, v: string) => void; removeItem: (k: string) => void }): boolean {
  try {
    const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!target) return false;
    target.setItem('grovia-template:config', JSON.stringify(normalizeConfig(config)));
    target.removeItem('grovia-template:settings');
    return true;
  } catch {
    return false;
  }
}

/**
 * Clear configuration from storage.
 */
export function clearConfig(storage?: { removeItem: (k: string) => void }): boolean {
  try {
    const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!target) return false;
    target.removeItem('grovia-template:config');
    target.removeItem('grovia-template:settings');
    return true;
  } catch {
    return false;
  }
}
