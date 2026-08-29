/**
 * The design system.
 *
 * Everything a template can measure comes from here. Templates hold layout
 * decisions and nothing else, because a scale only works if there is exactly
 * one place a number can come from. The test suite reads the same tokens back
 * and fails the build if a template used a size or a space that is not on
 * them.
 *
 * Two systems, both anchored to a real constraint rather than to taste:
 *
 *   Type is a modular scale. One base, one ratio, seven steps. The base is the
 *   legibility floor, not an arbitrary body size, so no step can be too small
 *   by construction.
 *
 *   Space is an 8 point grid. Every padding, gap and offset is a whole number
 *   of grid units, which is what gives a card a consistent rhythm instead of
 *   an accumulation of nudges.
 */

/* Legibility ------------------------------------------------------------- */

/** Apparent width of a link preview in a message thread, in points. */
export const PREVIEW_WIDTH = 320;

/** Nothing on a card may read smaller than this once scaled to a preview. */
export const MIN_APPARENT_PT = 11;

/* Type scale ------------------------------------------------------------- */

/**
 * Step 0 is the legibility floor rounded up to the grid. Deriving the base
 * from the constraint rather than picking it means the smallest step on the
 * scale is, by definition, the smallest readable size.
 */
export const TYPE_BASE = 44;

/** Major third. Wide enough that adjacent steps are clearly different. */
export const TYPE_RATIO = 1.25;

export const TYPE_STEPS = Array.from({ length: 7 }, (_, i) =>
  Math.round(TYPE_BASE * Math.pow(TYPE_RATIO, i))
);

/** Named steps, so templates name an intent rather than an index. */
export const TYPE = {
  caption: 0,
  body: 1,
  lead: 2,
  title: 3,
  titleLg: 4,
  display: 5,
  displayLg: 6,
};

export function typeStep(index) {
  const i = Math.min(TYPE_STEPS.length - 1, Math.max(0, index));
  return TYPE_STEPS[i];
}

/* Leading ---------------------------------------------------------------- */

/**
 * Large type needs tighter leading than small type. One value per role rather
 * than a number chosen per element.
 */
export const LEADING = {
  display: 1.08,
  lead: 1.25,
  body: 1.4,
  caption: 1.2,
  flush: 1,
};

/* Tracking --------------------------------------------------------------- */

/**
 * Optical correction, expressed in em so it scales with the size it is applied
 * to. Large display type looks loose at default spacing, monospace captions
 * look cramped.
 */
export const TRACKING = {
  display: -0.022,
  body: 0,
  mono: 0.012,
};

/* Space ------------------------------------------------------------------ */

export const GRID = 8;

/** Named spatial steps. The names describe the relationship, not the pixels. */
export const SPACE = {
  none: 0,
  hairline: 1,
  tight: 2,
  snug: 3,
  base: 4,
  loose: 5,
  section: 6,
  gutter: 7,
  page: 8,
  wide: 10,
};

export function space(units) {
  return Math.round(units) * GRID;
}

/* Strokes ---------------------------------------------------------------- */

/**
 * Rules and borders are not spacing and do not belong on the spatial grid.
 * They are optical weights, so they get their own small set.
 */
export const STROKE = {
  hairline: 2,
  rule: 3,
  marker: 6,
  bar: 8,
};

/* Measure ---------------------------------------------------------------- */

/** Comfortable line length for body copy, in em. Roughly 55 characters. */
export const MEASURE_EM = 28;

/* Derived ---------------------------------------------------------------- */

/** Smallest permitted size on a 1200 wide card, in card pixels. */
export const MIN_SIZE = Math.ceil(MIN_APPARENT_PT / (PREVIEW_WIDTH / 1200));

/** Apparent point size of a card pixel measurement in a message preview. */
export function apparentPt(sizePx, cardWidth) {
  return sizePx * (PREVIEW_WIDTH / cardWidth);
}

/* Title sizing ----------------------------------------------------------- */

/** Where each template's headline starts on the scale. */
export const TITLE_STEP = {
  minimal: TYPE.displayLg,
  editorial: TYPE.display,
  article: TYPE.display,
  banner: TYPE.titleLg,
  split: TYPE.titleLg,
  stat: TYPE.titleLg,
  quote: TYPE.titleLg,
  code: TYPE.body,
};

/**
 * Long headlines step down the scale rather than being multiplied by an
 * arbitrary factor, so every rendered size is still a step on the scale.
 * Display headlines stop at TYPE.title and clamp from there, because below
 * that the card stops reading as a headline at preview size.
 */
export function titleStepFor(template, title, { hasDeck = false } = {}) {
  const base = TITLE_STEP[template] ?? TYPE.display;
  const floor = base >= TYPE.titleLg ? TYPE.title : TYPE.caption;

  const len = title.length;
  let drop = 0;
  if (len > 28) drop = 1;
  if (len > 55) drop = 2;
  if (len > 90) drop = 3;

  // A headline paired with a deck sits one step lower than a headline
  // carrying the card alone. This is the hierarchy rule, not a space saving
  // measure: two competing display sizes read as an argument.
  if (hasDeck) drop += 1;

  return Math.max(floor, base - drop);
}
