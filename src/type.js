/**
 * The type scale, anchored to how small this actually gets.
 *
 * A link preview in a message thread renders around 300 points wide on a
 * phone. A 1200 pixel card is therefore shown at roughly a quarter size, so a
 * 30 pixel subtitle arrives as 8 point type and nobody reads it. Every size
 * below is chosen by working backwards from the apparent size rather than
 * from what looks balanced at full resolution.
 *
 * The rule: nothing on a card may fall below MIN_APPARENT_PT once scaled to
 * PREVIEW_WIDTH. Text that will not fit at a legible size is clamped with an
 * ellipsis instead of being shrunk, because a truncated headline someone can
 * read beats a complete one they cannot.
 */

export const PREVIEW_WIDTH = 320;
export const MIN_APPARENT_PT = 11;

/** Smallest permitted size on a 1200 wide card, in card pixels. */
export const MIN_SIZE = Math.ceil(MIN_APPARENT_PT / (PREVIEW_WIDTH / 1200));

/**
 * Roles rather than raw numbers, so a legibility decision is made once here
 * and never re-litigated inside a template.
 */
export const SCALE = {
  titleFloor: 78,
  subtitle: 50,
  subtitleTight: 46,
  footer: 44,
  byline: 44,
  bylineMeta: 42,
  badge: 42,
  statValue: 92,
  statLabel: 42,
  quoteGlyph: 104,
  codeBody: 44,
};

/** Base title size per template. Tuned against Space Grotesk 700 metrics. */
export const TITLE_BASE = {
  editorial: 124,
  article: 116,
  minimal: 132,
  banner: 112,
  split: 104,
  quote: 92,
  stat: 104,
  code: 52,
};

/**
 * Shallower ramp than a purely visual one would use. Long headlines lose some
 * size, then stop and let lineClamp do the rest.
 */
export function titleSize(title, k, base) {
  const len = title.length;
  let size = base;
  if (len > 24) size = base * 0.86;
  if (len > 40) size = base * 0.72;
  if (len > 60) size = base * 0.6;
  if (len > 85) size = base * 0.52;
  return Math.round(Math.max(size, SCALE.titleFloor) * k);
}

/** Apparent point size of a card pixel measurement in a message preview. */
export function apparentPt(sizePx, cardWidth) {
  return (sizePx * (PREVIEW_WIDTH / cardWidth));
}
