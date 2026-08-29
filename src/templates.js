/**
 * Card layouts as plain Satori element trees.
 *
 * No JSX, no build step. Each template is a pure function of (spec, tokens)
 * that returns a Satori node, so templates stay testable in isolation and a
 * new layout is one function plus one registry entry.
 *
 * Every size comes from src/type.js. Templates never invent a number, because
 * the legibility floor is only enforceable if there is one place to enforce
 * it. Text goes through `text()`, which records the size it used so the test
 * suite can assert nothing on a rendered card falls below that floor.
 */

import { SCALE, TITLE_BASE, titleSize } from './type.js';

const DISPLAY = 'Space Grotesk';
const BODY = 'IBM Plex Sans';
const MONO = 'IBM Plex Mono';

/** Sizes used by the render currently being built. Reset by buildTree. */
let used = [];
export function sizesUsed() {
  return used.slice();
}

const h = (type, props = {}, ...children) => ({
  type,
  props: { ...props, children: children.length === 1 ? children[0] : children },
});

const box = (style, ...children) =>
  h('div', { style: { display: 'flex', ...style } }, ...children.filter(Boolean));

/**
 * Text leaves render as blocks, not flex containers. Satori only honours
 * lineClamp on a block, and silently ignores it on a flex box, which is what
 * let long headlines run three times past the bottom of the card.
 */
function text(value, style) {
  if (style && style.fontSize) used.push(style.fontSize);
  return h('div', { style: { display: 'block', ...style } }, value);
}

/**
 * Clamp rather than shrink. Satori drops the overflow and appends an ellipsis,
 * which keeps the type at a size someone can actually read in a thread.
 */
function clamped(lines) {
  return { lineClamp: lines, textOverflow: 'ellipsis' };
}

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

  switch (spec.pattern) {
    case 'grid':
      return h('div', {
        style: {
          ...fill,
          opacity: 0.5,
          backgroundImage: `linear-gradient(to right, ${tokens.rule} 1px, transparent 1px), linear-gradient(to bottom, ${tokens.rule} 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        },
      });
    case 'dots':
      return h('div', {
        style: {
          ...fill,
          opacity: 0.7,
          backgroundImage: `radial-gradient(${tokens.rule} 1.6px, transparent 1.6px)`,
          backgroundSize: '32px 32px',
        },
      });
    case 'diagonal':
      return h('div', {
        style: {
          ...fill,
          opacity: 0.45,
          backgroundImage: `repeating-linear-gradient(45deg, ${tokens.rule} 0px, ${tokens.rule} 1px, transparent 1px, transparent 14px)`,
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
      height: Math.round(12 * k),
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

/**
 * The badge is the only label element on a card now. It survives a message
 * preview because it is a solid accent block, not small grey type.
 */
function badgePill(spec, tokens, k) {
  if (!spec.badge) return null;
  return text(spec.badge, {
    fontFamily: MONO,
    fontSize: Math.round(SCALE.badge * k),
    color: tokens.bg,
    backgroundColor: tokens.accent,
    // Text leaves are blocks now, and a block in a flex column stretches to
    // the full width. Only the badge has a background, so only the badge shows
    // it, as a pill running the whole card.
    alignSelf: 'flex-start',
    padding: `${Math.round(10 * k)}px ${Math.round(22 * k)}px`,
    borderRadius: Math.round(8 * k),
  });
}

function titleText(spec, tokens, k, lines = 3, base) {
  return text(spec.title, {
    fontFamily: DISPLAY,
    fontSize: titleSize(spec.title, k, base || TITLE_BASE[spec.template] || TITLE_BASE.editorial),
    lineHeight: 1.08,
    letterSpacing: Math.round(-2 * k),
    color: tokens.fg,
    ...clamped(lines),
  });
}

function subtitleText(spec, tokens, k, { lines = 2, tight = false, color } = {}) {
  if (!spec.subtitle) return null;
  return text(spec.subtitle, {
    fontSize: Math.round((tight ? SCALE.subtitleTight : SCALE.subtitle) * k),
    lineHeight: 1.32,
    color: color || tokens.muted,
    ...clamped(lines),
  });
}

/** Footer line, with the logo taking the right edge when one is present. */
function footerRow(spec, tokens, k, { withLogo = true } = {}) {
  const left = [];
  if (spec.site) {
    left.push(
      text(spec.site, {
        fontFamily: MONO,
        fontSize: Math.round(SCALE.footer * k),
        color: tokens.fg,
        ...clamped(1),
      })
    );
  }
  if (spec.site && spec.author) {
    left.push(text('/', { fontSize: Math.round(SCALE.footer * k), color: tokens.muted }));
  }
  if (spec.author) {
    left.push(
      text(spec.author, {
        fontSize: Math.round(SCALE.footer * k),
        color: tokens.muted,
        ...clamped(1),
      })
    );
  }

  const mark = withLogo ? logoMark(spec, k, Math.min(spec.logoWidth, 150)) : null;
  if (!left.length && !mark) return null;

  return box(
    {
      alignItems: 'center',
      justifyContent: 'space-between',
      borderTop: `${Math.max(2, Math.round(3 * k))}px solid ${tokens.rule}`,
      paddingTop: Math.round(20 * k),
    },
    box({ alignItems: 'center', gap: Math.round(16 * k) }, ...left),
    mark
  );
}

function editorial(spec, tokens) {
  const k = spec.width / 1200;
  const pad = Math.round(50 * k);

  const mark = logoMark(spec, k);
  const badge = badgePill(spec, tokens, k);

  const head = [];
  if (mark || badge) {
    head.push(
      box(
        {
          alignItems: 'center',
          gap: Math.round(24 * k),
          alignSelf: spec.align === 'center' ? 'center' : 'flex-start',
        },
        mark,
        badge
      )
    );
  }
  // Three lines only when there is no subtitle competing for the space.
  head.push(titleText(spec, tokens, k, spec.subtitle ? 2 : 3));
  const sub = subtitleText(spec, tokens, k, { lines: 2 });
  if (sub) head.push(sub);

  const body = box(
    {
      flexDirection: 'column',
      justifyContent: 'center',
      gap: Math.round(20 * k),
      flexGrow: 1,
      alignItems: spec.align === 'center' ? 'center' : 'flex-start',
      textAlign: spec.align === 'center' ? 'center' : 'left',
    },
    ...head
  );

  return shell(
    spec,
    tokens,
    box(
      {
        position: 'relative',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        padding: pad,
        paddingTop: Math.round(pad * 1.15),
      },
      body,
      footerRow(spec, tokens, k, { withLogo: false })
    )
  );
}

function stat(spec, tokens) {
  const k = spec.width / 1200;
  const pad = Math.round(46 * k);

  // Three is the most that stays readable once the card is a thumbnail. A
  // fourth column would push each value below the floor.
  const cells = spec.stats.slice(0, 3).map((s) =>
    box(
      {
        flexDirection: 'column',
        gap: Math.round(8 * k),
        borderLeft: `${Math.max(3, Math.round(6 * k))}px solid ${tokens.accent}`,
        paddingLeft: Math.round(24 * k),
      },
      text(s.value, {
        fontFamily: DISPLAY,
        fontSize: Math.round(SCALE.statValue * k),
        color: tokens.fg,
        ...clamped(1),
      }),
      text(s.label, {
        fontFamily: MONO,
        fontSize: Math.round(SCALE.statLabel * k),
        color: tokens.muted,
        ...clamped(1),
      })
    )
  );

  const head = box(
    { flexDirection: 'column', gap: Math.round(18 * k), alignItems: 'flex-start' },
    badgePill(spec, tokens, k),
    titleText(spec, tokens, k, 2)
  );

  return shell(
    spec,
    tokens,
    box(
      {
        position: 'relative',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        padding: pad,
        paddingTop: Math.round(pad * 1.15),
        justifyContent: 'space-between',
      },
      head,
      box({ gap: Math.round(48 * k), flexGrow: 1, alignItems: 'center' }, ...cells),
      footerRow(spec, tokens, k)
    )
  );
}

function minimal(spec, tokens) {
  const k = spec.width / 1200;
  const kids = [
    logoMark(spec, k),
    titleText(spec, tokens, k, spec.subtitle ? 2 : 3),
    subtitleText(spec, tokens, k, { lines: 2 }),
  ];
  if (spec.site) {
    kids.push(
      text(spec.site, {
        fontFamily: MONO,
        fontSize: Math.round(SCALE.footer * k),
        color: tokens.accent,
        marginTop: Math.round(10 * k),
        ...clamped(1),
      })
    );
  }

  return shell(
    spec,
    tokens,
    box(
      {
        position: 'relative',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        padding: Math.round(56 * k),
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: Math.round(18 * k),
      },
      ...kids
    )
  );
}

function code(spec, tokens) {
  const k = spec.width / 1200;
  const pad = Math.round(38 * k);

  const chrome = box(
    { alignItems: 'center', gap: Math.round(14 * k) },
    ...['#ff5f57', '#febc2e', '#28c840'].map((c) =>
      h('div', {
        style: {
          display: 'flex',
          width: Math.round(20 * k),
          height: Math.round(20 * k),
          borderRadius: 999,
          backgroundColor: c,
        },
      })
    )
  );

  const inner = [
    box(
      { alignItems: 'center', justifyContent: 'space-between', height: Math.round(28 * k) },
      chrome,
      spec.badge
        ? text(spec.badge, {
            fontFamily: MONO,
            fontSize: Math.round(SCALE.bylineMeta * k),
            color: tokens.muted,
            ...clamped(1),
          })
        : null
    ),
    text(spec.title, {
      fontFamily: MONO,
      fontSize: titleSize(spec.title, k, TITLE_BASE.code),
      lineHeight: 1.25,
      color: tokens.fg,
      ...clamped(2),
    }),
  ];

  if (spec.subtitle) {
    inner.push(
      text(spec.subtitle, {
        fontFamily: MONO,
        fontSize: Math.round(SCALE.codeBody * k),
        lineHeight: 1.3,
        color: tokens.accent,
        ...clamped(1),
      })
    );
  }

  return shell(
    spec,
    tokens,
    box(
      {
        position: 'relative',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        padding: pad,
        paddingTop: Math.round(pad * 1.25),
        gap: Math.round(14 * k),
      },
      box(
        {
          flexDirection: 'column',
          gap: Math.round(16 * k),
          backgroundColor: tokens.bgAlt,
          border: `${Math.max(2, Math.round(3 * k))}px solid ${tokens.rule}`,
          borderRadius: Math.round(20 * k),
          padding: Math.round(26 * k),
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
  const panelWidth = Math.round(spec.width * 0.3);

  const panel = box(
    {
      width: panelWidth,
      height: '100%',
      backgroundColor: tokens.bgAlt,
      borderRight: `${Math.max(3, Math.round(8 * k))}px solid ${tokens.accent}`,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: Math.round(20 * k),
      padding: Math.round(36 * k),
    },
    logoMark(spec, k, Math.min(spec.logoWidth * 1.8, (panelWidth - Math.round(72 * k)) / k)),
    !spec.logo && spec.site
      ? text(spec.site, {
          fontFamily: DISPLAY,
          fontSize: Math.round(52 * k),
          color: tokens.fg,
          textAlign: 'center',
          ...clamped(2),
        })
      : null
  );

  // The content column is sized explicitly. A flex item defaults to a min
  // width of auto, so a long unbroken headline would otherwise push straight
  // through the right edge of the card.
  const contentWidth = spec.width - panelWidth;
  const kContent = (contentWidth - Math.round(112 * k)) / 1200;

  const content = box(
    {
      flexDirection: 'column',
      justifyContent: 'center',
      gap: Math.round(22 * k),
      width: contentWidth,
      padding: Math.round(56 * k),
    },
    badgePill(spec, tokens, k),
    text(spec.title, {
      fontFamily: DISPLAY,
      fontSize: titleSize(spec.title, kContent, 150),
      lineHeight: 1.1,
      letterSpacing: Math.round(-1.6 * k),
      ...clamped(3),
    }),
    subtitleText(spec, tokens, k, { lines: 2, tight: true }),
    spec.logo && spec.site
      ? text(spec.site, {
          fontFamily: MONO,
          fontSize: Math.round(SCALE.bylineMeta * k),
          color: tokens.accent,
          marginTop: Math.round(6 * k),
          ...clamped(1),
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
  const pad = Math.round(50 * k);

  const attribution = [];
  if (spec.author) {
    attribution.push(
      text(spec.author, {
        fontSize: Math.round(SCALE.byline * k),
        color: tokens.fg,
        ...clamped(1),
      })
    );
  }
  if (spec.meta || spec.site) {
    attribution.push(
      text(spec.meta || spec.site, {
        fontFamily: MONO,
        fontSize: Math.round(SCALE.bylineMeta * k),
        color: tokens.muted,
        ...clamped(1),
      })
    );
  }

  return shell(
    spec,
    tokens,
    box(
      {
        position: 'relative',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        padding: pad,
        paddingTop: Math.round(pad * 1.1),
        justifyContent: 'center',
        gap: Math.round(20 * k),
      },
      text('\u201C', {
        fontFamily: DISPLAY,
        fontSize: Math.round(SCALE.quoteGlyph * k),
        lineHeight: 1,
        color: tokens.accent,
      }),
      titleText(spec, tokens, k, 3, TITLE_BASE.quote),
      attribution.length
        ? box(
            {
              alignItems: 'center',
              gap: Math.round(20 * k),
              borderLeft: `${Math.max(3, Math.round(6 * k))}px solid ${tokens.accent}`,
              paddingLeft: Math.round(24 * k),
            },
            logoMark(spec, k, Math.min(spec.logoWidth, 80)),
            box({ flexDirection: 'column', gap: Math.round(6 * k) }, ...attribution)
          )
        : null
    )
  );
}

/** Compact horizontal lockup. Holds up best of all of them at thumbnail size. */
function banner(spec, tokens) {
  const k = spec.width / 1200;

  const copy = box(
    { flexDirection: 'column', gap: Math.round(16 * k), flexGrow: 1 },
    badgePill(spec, tokens, k),
    titleText(spec, tokens, k, 2),
    subtitleText(spec, tokens, k, { lines: 2, tight: true }),
    spec.site
      ? text(spec.site, {
          fontFamily: MONO,
          fontSize: Math.round(SCALE.bylineMeta * k),
          color: tokens.accent,
          marginTop: Math.round(4 * k),
          ...clamped(1),
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
        gap: Math.round(40 * k),
        padding: Math.round(54 * k),
      },
      logoMark(spec, k, Math.max(spec.logoWidth, 150)),
      copy
    ),
    { bar: false }
  );
}

/** Byline card: site, headline, then author, date and read time. */
function article(spec, tokens) {
  const k = spec.width / 1200;
  const pad = Math.round(54 * k);
  const dot = () => text('\u00B7', { fontSize: Math.round(SCALE.byline * k), color: tokens.rule });

  const byline = [];
  if (spec.author) {
    byline.push(
      text(spec.author, { fontSize: Math.round(SCALE.byline * k), color: tokens.fg, ...clamped(1) })
    );
  }
  if (spec.date) {
    if (byline.length) byline.push(dot());
    byline.push(
      text(spec.date, {
        fontSize: Math.round(SCALE.byline * k),
        color: tokens.muted,
        ...clamped(1),
      })
    );
  }
  if (spec.meta) {
    if (byline.length) byline.push(dot());
    byline.push(
      text(spec.meta, {
        fontFamily: MONO,
        fontSize: Math.round(SCALE.bylineMeta * k),
        color: tokens.muted,
        ...clamped(1),
      })
    );
  }

  const head = box(
    { alignItems: 'center', justifyContent: 'space-between' },
    badgePill(spec, tokens, k) ||
      (spec.site
        ? text(spec.site, {
            fontFamily: MONO,
            fontSize: Math.round(SCALE.footer * k),
            color: tokens.accent,
            ...clamped(1),
          })
        : null),
    logoMark(spec, k, Math.min(spec.logoWidth, 140))
  );

  const body = box(
    { flexDirection: 'column', justifyContent: 'center', gap: Math.round(20 * k), flexGrow: 1 },
    titleText(spec, tokens, k, spec.subtitle ? 2 : 3),
    subtitleText(spec, tokens, k, { lines: 2, tight: true })
  );

  return shell(
    spec,
    tokens,
    box(
      {
        position: 'relative',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        padding: pad,
        paddingTop: Math.round(pad * 1.15),
      },
      head,
      body,
      byline.length
        ? box(
            {
              alignItems: 'center',
              gap: Math.round(14 * k),
              borderTop: `${Math.max(2, Math.round(3 * k))}px solid ${tokens.rule}`,
              paddingTop: Math.round(20 * k),
            },
            ...byline
          )
        : null
    )
  );
}

const REGISTRY = { editorial, stat, minimal, code, split, quote, banner, article };

export function buildTree(spec) {
  used = [];
  const fn = REGISTRY[spec.template] || editorial;
  return fn(spec, spec.tokens);
}
