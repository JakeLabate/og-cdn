/**
 * Turn a URLSearchParams into a validated, clamped card spec.
 *
 * Everything here is defensive. The endpoint is public, the inputs arrive from
 * whoever pasted a URL into a meta tag, and a bad value must degrade rather
 * than throw.
 */

import {
  DEFAULT_PATTERN,
  DEFAULT_SIZE,
  DEFAULT_TEMPLATE,
  DEFAULT_THEME,
  PATTERNS,
  SIZES,
  TEMPLATES,
  THEMES,
  resolveTheme,
} from './theme.js';

const LIMITS = {
  title: 180,
  subtitle: 300,
  site: 80,
  author: 80,
  statLabel: 40,
  statValue: 24,
  alt: 300,
  date: 40,
  meta: 60,
  logo: 600,
};

function clean(value, max) {
  if (value == null) return '';
  return String(value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Pull up to four `stat` pairs. Format: stat=Value|Label, repeatable. */
function parseStats(sp) {
  const out = [];
  for (const raw of sp.getAll('stat').slice(0, 4)) {
    const [value, label = ''] = String(raw).split('|');
    const v = clean(value, LIMITS.statValue);
    if (!v) continue;
    out.push({ value: v, label: clean(label, LIMITS.statLabel) });
  }
  return out;
}

function parseSize(sp) {
  const named = sp.get('size');
  if (named && SIZES[named]) return { ...SIZES[named] };
  const preset = SIZES[DEFAULT_SIZE];
  return {
    w: clampInt(sp.get('w'), 320, 2400, preset.w),
    h: clampInt(sp.get('h'), 200, 2400, preset.h),
  };
}

function parseUrl(value) {
  if (!value) return '';
  try {
    const u = new URL(String(value));
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    return u.toString();
  } catch {
    return '';
  }
}

export function parseSpec(searchParams) {
  const sp = searchParams;

  const themeName = THEMES[sp.get('theme')] ? sp.get('theme') : DEFAULT_THEME;
  const template = TEMPLATES.includes(sp.get('template'))
    ? sp.get('template')
    : DEFAULT_TEMPLATE;

  const size = parseSize(sp);

  const spec = {
    template,
    themeName,
    tokens: resolveTheme(themeName, {
      bg: sp.get('bg'),
      bgAlt: sp.get('bgAlt'),
      fg: sp.get('fg'),
      muted: sp.get('muted'),
      accent: sp.get('accent'),
      rule: sp.get('rule'),
    }),
    width: size.w,
    height: size.h,
    scale: clampInt(sp.get('scale'), 1, 2, 1),
    title: clean(sp.get('title'), LIMITS.title),
    subtitle: clean(sp.get('subtitle') || sp.get('description'), LIMITS.subtitle),
    site: clean(sp.get('site'), LIMITS.site),
    author: clean(sp.get('author'), LIMITS.author),
    stats: parseStats(sp),
    date: clean(sp.get('date'), LIMITS.date),
    meta: clean(sp.get('meta'), LIMITS.meta),
    align: sp.get('align') === 'center' ? 'center' : 'left',
    pattern: PATTERNS.includes(sp.get('pattern')) ? sp.get('pattern') : DEFAULT_PATTERN,
    format: sp.get('format') === 'svg' ? 'svg' : 'png',

    // Populated later by the asset resolver. Templates read `logo`, which is
    // either null or { src, width, height }, and never touch the raw URL.
    logoUrl: parseUrl(clean(sp.get('logo'), LIMITS.logo)),
    logoWidth: clampInt(sp.get('logoWidth'), 24, 400, 88),
    logo: null,
  };

  if (!spec.title) spec.title = spec.site || 'Untitled';

  return spec;
}

/** Metadata fields that describe the page rather than the picture. */
export function parseMeta(searchParams) {
  const sp = searchParams;
  return {
    title: clean(sp.get('title'), LIMITS.title),
    description: clean(sp.get('subtitle') || sp.get('description'), LIMITS.subtitle),
    url: parseUrl(sp.get('url')),
    siteName: clean(sp.get('site'), LIMITS.site),
    author: clean(sp.get('author'), LIMITS.author),
    type: clean(sp.get('type'), 40) || 'website',
    locale: clean(sp.get('locale'), 12) || 'en_US',
    twitterCard: sp.get('card') === 'summary' ? 'summary' : 'summary_large_image',
    twitterSite: clean(sp.get('twitter'), 40),
    alt: clean(sp.get('alt'), LIMITS.alt),
  };
}

/**
 * The canonical param order for a cache key. Sorting means two callers who
 * wrote the same params in a different order share one cached render.
 */
export function canonicalQuery(searchParams) {
  const pairs = [];
  for (const [k, v] of searchParams.entries()) {
    if (k === 'sig') continue;
    pairs.push([k, v]);
  }
  pairs.sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1));
  const out = new URLSearchParams();
  for (const [k, v] of pairs) out.append(k, v);
  return out.toString();
}
