/**
 * Palettes and sizing presets.
 *
 * A theme is a small token bag. Templates read tokens, never raw hex, so a new
 * theme is a data change and never a template change.
 */

export const THEMES = {
  indigo: {
    bg: '#0f1320',
    bgAlt: '#161d33',
    fg: '#f2f4f8',
    muted: '#93a0bd',
    accent: '#2dd4bf',
    rule: '#27314d',
  },
  ink: {
    bg: '#14171c',
    bgAlt: '#1c2027',
    fg: '#f5f6f7',
    muted: '#9aa3ae',
    accent: '#4ade80',
    rule: '#2a2f37',
  },
  cream: {
    bg: '#fbf7f1',
    bgAlt: '#f3ece1',
    fg: '#1c1a17',
    muted: '#6b6459',
    accent: '#d97757',
    rule: '#e3d9c9',
  },
  paper: {
    bg: '#ffffff',
    bgAlt: '#f4f5f7',
    fg: '#111318',
    muted: '#5c6470',
    accent: '#2563eb',
    rule: '#e3e6ea',
  },
  slate: {
    bg: '#1e293b',
    bgAlt: '#273449',
    fg: '#f1f5f9',
    muted: '#94a3b8',
    accent: '#38bdf8',
    rule: '#334155',
  },
};

export const DEFAULT_THEME = 'indigo';

/** Named canvas sizes. Anything else comes in as explicit w and h. */
export const SIZES = {
  og: { w: 1200, h: 630 },
  square: { w: 1200, h: 1200 },
  wide: { w: 1600, h: 840 },
  linkedin: { w: 1200, h: 627 },
  story: { w: 1080, h: 1920 },
};

export const DEFAULT_SIZE = 'og';

export const TEMPLATES = ['editorial', 'stat', 'minimal', 'code'];
export const DEFAULT_TEMPLATE = 'editorial';

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function normalizeHex(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!HEX.test(raw)) return null;
  const body = raw.replace(/^#/, '');
  const full =
    body.length === 3
      ? body
          .split('')
          .map((c) => c + c)
          .join('')
      : body;
  return '#' + full.toLowerCase();
}

/**
 * Resolve a theme name plus any per request colour overrides into a token bag.
 */
export function resolveTheme(name, overrides = {}) {
  const base = THEMES[name] || THEMES[DEFAULT_THEME];
  const out = { ...base };
  for (const key of ['bg', 'bgAlt', 'fg', 'muted', 'accent', 'rule']) {
    const hex = normalizeHex(overrides[key]);
    if (hex) out[key] = hex;
  }
  return out;
}
