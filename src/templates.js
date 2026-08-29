/**
 * Card layouts as plain Satori element trees.
 *
 * No JSX, no build step. Each template is a pure function of (spec, tokens)
 * that returns a Satori node, so templates stay testable in isolation and a
 * new layout is one function plus one registry entry.
 *
 * Templates make layout decisions only. Every size comes from `type()` and
 * every space from `sp()`, both of which read src/scale.js and record what
 * they returned so the test suite can prove no template invented a number.
 * If a layout needs a value the scale does not have, the scale is wrong and
 * that is where the change goes.
 */

import {
  INLINE,
  LEADING,
  LINES,
  headlineLines,
  MEASURE_EM,
  PAD,
  SPACE,
  STACK,
  STROKE,
  TRACKING,
  TYPE,
  space,
  titleStepFor,
  typeStep,
} from './scale.js';

const DISPLAY = 'Space Grotesk';
const BODY = 'IBM Plex Sans';
const MONO = 'IBM Plex Mono';

/* Instrumentation -------------------------------------------------------- */

let usedSizes = [];
let usedSpaces = [];

export function sizesUsed() {
  return usedSizes.slice();
}
export function spacesUsed() {
  return usedSpaces.slice();
}

/* Token accessors -------------------------------------------------------- */

/**
 * Templates never name a number, only a relationship. Each accessor records
 * the token it resolved so the suite can prove no template reached past the
 * system for an arbitrary value.
 */
function resolve(kind, table, role, k) {
  const units = table[role];
  if (units === undefined) throw new Error(`no ${kind} token named ${role}`);
  usedSpaces.push({ kind, role, units });
  return Math.round(space(units) * k);
}

/** Vertical gap between stacked elements. */
const stack = (role, k) => resolve('stack', STACK, role, k);

/** Horizontal gap between items on one line. */
const inline = (role, k) => resolve('inline', INLINE, role, k);

/** Padding. */
const pad = (role, k) => resolve('pad', PAD, role, k);

/**
 * A complete type style: size from the scale, leading and tracking from the
 * role. Nothing here takes a raw pixel value.
 */
function type(step, k, { leading = 'body', tracking = 'body', family = BODY } = {}) {
  const size = Math.round(typeStep(step) * k);
  usedSizes.push({ px: size, step });
  return {
    fontFamily: family,
    fontSize: size,
    lineHeight: LEADING[leading],
    letterSpacing: Math.round(TRACKING[tracking] * size),
  };
}

function stroke(weight, k) {
  return Math.max(1, Math.round(STROKE[weight] * k));
}

/* Primitives ------------------------------------------------------------- */

const h = (type_, props = {}, ...children) => ({
  type: type_,
  props: { ...props, children: children.length === 1 ? children[0] : children },
});

const box = (style, ...children) =>
  h('div', { style: { display: 'flex', ...style } }, ...children.filter(Boolean));

/**
 * Text leaves render as blocks, not flex containers. Satori only honours
 * lineClamp on a block and silently ignores it on a flex box, which is what
 * once let long headlines run past the bottom of the card.
 */
const text = (value, style) => h('div', { style: { display: 'block', ...style } }, value);

/**
 * Clamp rather than shrink. Satori drops the overflow and appends an ellipsis,
 * which keeps type at a size someone can read in a thread.
 */
const clamp = (lines) => ({ lineClamp: lines, textOverflow: 'ellipsis' });

/** Cap body copy at a comfortable measure rather than the full card width. */
const measure = (style) => ({ ...style, maxWidth: style.fontSize * MEASURE_EM });

/* Shared pieces ---------------------------------------------------------- */

/** The resolved logo, or nothing. A logo that failed to load is simply absent. */
function logoMark(spec, k, widthOverride) {
  if (!spec.logo) return null;
  const w = Math.round((widthOverride || spec.logo.width) * k);
  const ratio = spec.logo.height / spec.logo.width;
  return h('img', {
    src: spec.logo.src,
    width: w,
    height: Math.max(1, Math.round(w * ratio)),
    style: { display: 'flex', objectFit: 'contain' },
  });
}

/**
 * Background texture, drawn as a background image so it costs no layout nodes
 * and never affects the flow of anything above it.
 */
function patternLayer(spec, tokens) {
  const fill = { display: 'flex', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 };
  const cell = space(SPACE.gutter); // grid texture rides the same 8pt system

  switch (spec.pattern) {
    case 'grid':
      return h('div', {
        style: {
          ...fill,
          opacity: 0.5,
          backgroundImage: `linear-gradient(to right, ${tokens.rule} 1px, transparent 1px), linear-gradient(to bottom, ${tokens.rule} 1px, transparent 1px)`,
          backgroundSize: `${cell}px ${cell}px`,
        },
      });
    case 'dots':
      return h('div', {
        style: {
          ...fill,
          opacity: 0.7,
          backgroundImage: `radial-gradient(${tokens.rule} 1.6px, transparent 1.6px)`,
          backgroundSize: `${space(SPACE.base)}px ${space(SPACE.base)}px`,
        },
      });
    case 'diagonal':
      return h('div', {
        style: {
          ...fill,
          opacity: 0.45,
          backgroundImage: `repeating-linear-gradient(45deg, ${tokens.rule} 0px, ${tokens.rule} 1px, transparent 1px, transparent ${space(SPACE.tight)}px)`,
        },
      });
    case 'glow':
      return h('div', {
        style: {
          ...fill,
          backgroundImage: `radial-gradient(circle at 12% 0%, ${tokens.accent}40 0%, transparent 55%), radial-gradient(circle at 100% 100%, ${tokens.bgAlt} 0%, transparent 60%)`,
        },
      });
    default:
      return null;
  }
}

function accentBar(tokens, k) {
  return h('div', {
    style: {
      display: 'flex',
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: stroke('bar', k),
      backgroundColor: tokens.accent,
    },
  });
}

function shell(spec, tokens, inner, { bar = true } = {}) {
  const k = spec.width / 1200;
  const kids = [];
  const pattern = patternLayer(spec, tokens);
  if (pattern) kids.push(pattern);
  if (bar) kids.push(accentBar(tokens, k));
  kids.push(inner);

  return h(
    'div',
    {
      style: {
        display: 'flex',
        position: 'relative',
        width: spec.width,
        // Left unset when measuring, so satori reports the natural height of
        // the content and the test suite can prove nothing overflows.
        ...(spec.measure ? {} : { height: spec.height }),
        backgroundColor: tokens.bg,
        color: tokens.fg,
        fontFamily: BODY,
        overflow: 'hidden',
      },
    },
    ...kids
  );
}

/** One page frame for every template, so cards share a margin. */
function frame(spec, k, extra = {}) {
  return {
    position: 'relative',
    flexDirection: 'column',
    width: '100%',
    height: '100%',
    paddingTop: pad('pageTop', k),
    paddingRight: pad('page', k),
    paddingBottom: pad('page', k),
    paddingLeft: pad('page', k),
    ...extra,
  };
}

function titleText(spec, tokens, k) {
  const allowed = headlineLines(spec.template, Boolean(spec.subtitle));
  return text(spec.title, {
    ...type(titleStepFor(spec.template, spec.title, { hasDeck: Boolean(spec.subtitle) }), k, {
      leading: 'display',
      tracking: 'display',
      family: DISPLAY,
    }),
    color: tokens.fg,
    ...clamp(allowed),
  });
}

function subtitleText(spec, tokens, k, { lines = LINES.deck, step = TYPE.body } = {}) {
  if (!spec.subtitle) return null;
  return text(
    spec.subtitle,
    measure({
      ...type(step, k, { leading: 'lead' }),
      color: tokens.muted,
      ...clamp(lines),
    })
  );
}

function captionText(value, tokens, k, { color, family = BODY, tracking = 'body' } = {}) {
  return text(value, {
    ...type(TYPE.caption, k, { leading: 'caption', family, tracking }),
    color: color || tokens.muted,
    ...clamp(1),
  });
}

/** Footer line, with the logo taking the right edge when one is present. */
function footerRow(spec, tokens, k, { withLogo = true } = {}) {
  const left = [];
  if (spec.site) {
    left.push(captionText(spec.site, tokens, k, { color: tokens.fg, family: MONO, tracking: 'mono' }));
  }
  if (spec.site && spec.author) {
    left.push(captionText('/', tokens, k, { color: tokens.rule }));
  }
  if (spec.author) {
    left.push(captionText(spec.author, tokens, k));
  }

  const mark = withLogo ? logoMark(spec, k, space(SPACE.wide) + space(SPACE.page)) : null;
  if (!left.length && !mark) return null;

  return box(
    {
      alignItems: 'center',
      justifyContent: 'space-between',
      borderTop: `${stroke('hairline', k)}px solid ${tokens.rule}`,
      paddingTop: stack('related', k),
      marginTop: stack('section', k),
    },
    box({ alignItems: 'center', gap: inline('base', k) }, ...left),
    mark
  );
}

/* Templates -------------------------------------------------------------- */

function editorial(spec, tokens) {
  const k = spec.width / 1200;

  const parts = [];
  const mark = logoMark(spec, k);
  if (mark) {
    parts.push(box({ alignSelf: spec.align === 'center' ? 'center' : 'flex-start' }, mark));
  }
  // Three lines only when there is no subtitle competing for the space.
  parts.push(titleText(spec, tokens, k));
  const sub = subtitleText(spec, tokens, k);
  if (sub) parts.push(sub);

  return shell(
    spec,
    tokens,
    box(
      frame(spec, k),
      box(
        {
          flexDirection: 'column',
          justifyContent: 'center',
          gap: stack('related', k),
          flexGrow: 1,
          alignItems: spec.align === 'center' ? 'center' : 'flex-start',
          textAlign: spec.align === 'center' ? 'center' : 'left',
        },
        ...parts
      ),
      footerRow(spec, tokens, k, { withLogo: false })
    )
  );
}

function stat(spec, tokens) {
  const k = spec.width / 1200;

  // Three is the most that stays readable once the card is a thumbnail. A
  // fourth column would push each value below the floor.
  const cells = spec.stats.slice(0, 3).map((s) =>
    box(
      {
        flexDirection: 'column',
        gap: stack('related', k),
        borderLeft: `${stroke('marker', k)}px solid ${tokens.accent}`,
        paddingLeft: pad('marker', k),
      },
      text(s.value, {
        ...type(TYPE.titleLg, k, { leading: 'display', tracking: 'display', family: DISPLAY }),
        color: tokens.fg,
        ...clamp(1),
      }),
      captionText(s.label, tokens, k, { family: MONO, tracking: 'mono' })
    )
  );

  return shell(
    spec,
    tokens,
    box(
      frame(spec, k, { justifyContent: 'space-between', gap: stack('group', k) }),
      titleText(spec, tokens, k),
      box({ gap: inline('group', k), flexGrow: 1, alignItems: 'center' }, ...cells),
      footerRow(spec, tokens, k)
    )
  );
}

function minimal(spec, tokens) {
  const k = spec.width / 1200;
  const kids = [
    logoMark(spec, k),
    titleText(spec, tokens, k),
    subtitleText(spec, tokens, k),
  ];
  if (spec.site) {
    kids.push(
      captionText(spec.site, tokens, k, {
        color: tokens.accent,
        family: MONO,
        tracking: 'mono',
      })
    );
  }

  return shell(
    spec,
    tokens,
    box(
      frame(spec, k, {
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: stack('related', k),
      }),
      ...kids
    )
  );
}

function code(spec, tokens) {
  const k = spec.width / 1200;

  const dot = space(SPACE.tight);
  const chrome = box(
    { alignItems: 'center', gap: inline('tight', k) },
    ...['#ff5f57', '#febc2e', '#28c840'].map((c) =>
      h('div', {
        style: {
          display: 'flex',
          width: Math.round(dot * k),
          height: Math.round(dot * k),
          borderRadius: 999,
          backgroundColor: c,
        },
      })
    )
  );

  const inner = [
    chrome,
    text(spec.title, {
      ...type(titleStepFor('code', spec.title, { hasDeck: Boolean(spec.subtitle) }), k, {
        leading: 'lead',
        family: MONO,
      }),
      color: tokens.fg,
      ...clamp(headlineLines('code', Boolean(spec.subtitle))),
    }),
  ];

  if (spec.subtitle) {
    inner.push(
      text(spec.subtitle, {
        ...type(TYPE.caption, k, { leading: 'lead', family: MONO, tracking: 'mono' }),
        color: tokens.accent,
        ...clamp(1),
      })
    );
  }

  return shell(
    spec,
    tokens,
    box(
      frame(spec, k),
      box(
        {
          flexDirection: 'column',
          gap: stack('related', k),
          backgroundColor: tokens.bgAlt,
          border: `${stroke('hairline', k)}px solid ${tokens.rule}`,
          borderRadius: space(SPACE.tight),
          padding: pad('card', k),
          flexGrow: 1,
        },
        ...inner
      ),
      footerRow(spec, tokens, k)
    )
  );
}

/** Panel on the left carrying the mark, content on the right. */
function split(spec, tokens) {
  const k = spec.width / 1200;
  // Held on the grid rather than taken as a percentage, so the divider lands
  // on the same rhythm as everything inside the card.
  const panelWidth = Math.round(space(SPACE.wide * 4) * k);

  const panel = box(
    {
      width: panelWidth,
      height: '100%',
      backgroundColor: tokens.bgAlt,
      borderRight: `${stroke('bar', k)}px solid ${tokens.accent}`,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      padding: pad('panel', k),
    },
    logoMark(spec, k, space(SPACE.wide) * 2),
    !spec.logo && spec.site
      ? text(spec.site, {
          ...type(TYPE.lead, k, { leading: 'display', tracking: 'display', family: DISPLAY }),
          color: tokens.fg,
          textAlign: 'center',
          ...clamp(2),
        })
      : null
  );

  // The content column is sized explicitly. A flex item defaults to a min
  // width of auto, so a long unbroken headline would otherwise push straight
  // through the right edge of the card.
  const content = box(
    {
      flexDirection: 'column',
      justifyContent: 'center',
      gap: stack('related', k),
      width: spec.width - panelWidth,
      padding: pad('page', k),
    },
    titleText(spec, tokens, k),
    subtitleText(spec, tokens, k, { step: TYPE.caption }),
    spec.logo && spec.site
      ? captionText(spec.site, tokens, k, {
          color: tokens.accent,
          family: MONO,
          tracking: 'mono',
        })
      : null
  );

  return shell(
    spec,
    tokens,
    box({ position: 'relative', width: '100%', height: '100%' }, panel, content),
    { bar: false }
  );
}

/** Pull quote, with the attribution carried by author, meta and site. */
function quote(spec, tokens) {
  const k = spec.width / 1200;

  const attribution = [];
  if (spec.author) {
    attribution.push(captionText(spec.author, tokens, k, { color: tokens.fg }));
  }
  if (spec.meta || spec.site) {
    attribution.push(
      captionText(spec.meta || spec.site, tokens, k, { family: MONO, tracking: 'mono' })
    );
  }

  return shell(
    spec,
    tokens,
    box(
      frame(spec, k, { justifyContent: 'center', gap: stack('related', k) }),
      text('\u201C', {
        ...type(TYPE.lead, k, { leading: 'flush', family: DISPLAY }),
        color: tokens.accent,
      }),
      titleText(spec, tokens, k),
      attribution.length
        ? box(
            {
              alignItems: 'center',
              gap: inline('base', k),
              borderLeft: `${stroke('marker', k)}px solid ${tokens.accent}`,
              paddingLeft: pad('marker', k),
              marginTop: stack('group', k),
            },
            logoMark(spec, k, space(SPACE.wide)),
            box({ flexDirection: 'column' }, ...attribution)
          )
        : null
    )
  );
}

/** Compact horizontal lockup. Holds up best of all of them at thumbnail size. */
function banner(spec, tokens) {
  const k = spec.width / 1200;

  const copy = box(
    { flexDirection: 'column', gap: stack('related', k), flexGrow: 1 },
    titleText(spec, tokens, k),
    subtitleText(spec, tokens, k, { step: TYPE.caption }),
    spec.site
      ? captionText(spec.site, tokens, k, {
          color: tokens.accent,
          family: MONO,
          tracking: 'mono',
        })
      : null
  );

  return shell(
    spec,
    tokens,
    box(
      {
        position: 'relative',
        width: '100%',
        height: '100%',
        alignItems: 'center',
        gap: inline('group', k),
        padding: pad('page', k),
      },
      logoMark(spec, k, space(SPACE.wide) * 2),
      copy
    ),
    { bar: false }
  );
}

/** Byline card: site, headline, then author, date and read time. */
function article(spec, tokens) {
  const k = spec.width / 1200;

  const byline = [];
  const separator = () => captionText('\u00B7', tokens, k, { color: tokens.rule });
  if (spec.author) {
    byline.push(captionText(spec.author, tokens, k, { color: tokens.fg }));
  }
  if (spec.date) {
    if (byline.length) byline.push(separator());
    byline.push(captionText(spec.date, tokens, k));
  }
  if (spec.meta) {
    if (byline.length) byline.push(separator());
    byline.push(captionText(spec.meta, tokens, k, { family: MONO, tracking: 'mono' }));
  }

  const head = box(
    { alignItems: 'center', justifyContent: 'space-between' },
    spec.site
      ? captionText(spec.site, tokens, k, {
          color: tokens.accent,
          family: MONO,
          tracking: 'mono',
        })
      : null,
    logoMark(spec, k, space(SPACE.wide) + space(SPACE.section))
  );

  const body = box(
    {
      flexDirection: 'column',
      justifyContent: 'center',
      gap: stack('related', k),
      flexGrow: 1,
    },
    titleText(spec, tokens, k),
    subtitleText(spec, tokens, k, { step: TYPE.caption })
  );

  return shell(
    spec,
    tokens,
    box(
      frame(spec, k),
      head,
      body,
      byline.length
        ? box(
            {
              alignItems: 'center',
              gap: inline('tight', k),
              borderTop: `${stroke('hairline', k)}px solid ${tokens.rule}`,
              paddingTop: stack('related', k),
              marginTop: stack('section', k),
            },
            ...byline
          )
        : null
    )
  );
}

const REGISTRY = { editorial, stat, minimal, code, split, quote, banner, article };

export function buildTree(spec) {
  usedSizes = [];
  usedSpaces = [];
  const fn = REGISTRY[spec.template] || editorial;
  return fn(spec, spec.tokens);
}
