/**
 * Card layouts as plain Satori element trees.
 *
 * No JSX, no build step. Each template is a pure function of (spec, tokens)
 * that returns a Satori node, so templates stay testable in isolation and a
 * new layout is one function plus one registry entry.
 */

const DISPLAY = 'Space Grotesk';
const BODY = 'IBM Plex Sans';
const MONO = 'IBM Plex Mono';

const h = (type, props = {}, ...children) => ({
  type,
  props: { ...props, children: children.length === 1 ? children[0] : children },
});

const box = (style, ...children) =>
  h('div', { style: { display: 'flex', ...style } }, ...children.filter(Boolean));

const text = (value, style) => h('div', { style: { display: 'flex', ...style } }, value);

/**
 * Pick a title size that keeps long headlines inside the card without a
 * measurement pass. Tuned against the Space Grotesk 700 metrics.
 */
function titleSize(title, k, base = 78) {
  const len = title.length;
  let size = base;
  if (len > 30) size = base * 0.9;
  if (len > 50) size = base * 0.76;
  if (len > 75) size = base * 0.62;
  if (len > 105) size = base * 0.52;
  if (len > 140) size = base * 0.44;
  return Math.round(size * k);
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
      height: Math.round(10 * k),
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
        height: spec.height,
        backgroundColor: tokens.bg,
        color: tokens.fg,
        fontFamily: BODY,
        overflow: 'hidden',
      },
    },
    ...kids
  );
}

function eyebrowRow(spec, tokens, k) {
  if (!spec.eyebrow && !spec.badge) return null;
  const kids = [];
  if (spec.eyebrow) {
    kids.push(
      text(spec.eyebrow.toUpperCase(), {
        fontFamily: MONO,
        fontSize: Math.round(22 * k),
        letterSpacing: Math.round(2 * k),
        color: tokens.accent,
      })
    );
  }
  if (spec.badge) {
    kids.push(
      text(spec.badge, {
        fontFamily: MONO,
        fontSize: Math.round(19 * k),
        color: tokens.bg,
        backgroundColor: tokens.accent,
        padding: `${Math.round(6 * k)}px ${Math.round(14 * k)}px`,
        borderRadius: Math.round(6 * k),
      })
    );
  }
  return box({ alignItems: 'center', gap: Math.round(18 * k) }, ...kids);
}

/** Footer line, with the logo taking the right edge when one is present. */
function footerRow(spec, tokens, k, { withLogo = true } = {}) {
  const left = [];
  if (spec.site) {
    left.push(text(spec.site, { fontFamily: MONO, fontSize: Math.round(24 * k), color: tokens.fg }));
  }
  if (spec.site && spec.author) {
    left.push(text('/', { fontSize: Math.round(24 * k), color: tokens.muted }));
  }
  if (spec.author) {
    left.push(text(spec.author, { fontSize: Math.round(24 * k), color: tokens.muted }));
  }

  const mark = withLogo ? logoMark(spec, k, Math.min(spec.logoWidth, 140)) : null;
  if (!left.length && !mark) return null;

  return box(
    {
      alignItems: 'center',
      justifyContent: 'space-between',
      borderTop: `${Math.max(1, Math.round(2 * k))}px solid ${tokens.rule}`,
      paddingTop: Math.round(26 * k),
    },
    box({ alignItems: 'center', gap: Math.round(14 * k) }, ...left),
    mark
  );
}

function editorial(spec, tokens) {
  const k = spec.width / 1200;
  const pad = Math.round(72 * k);
  const head = [];

  // With a logo the mark leads and the eyebrow sits beside it, so the two
  // never stack into two near identical label rows.
  const eyebrow = eyebrowRow(spec, tokens, k);
  const mark = logoMark(spec, k);
  if (mark || eyebrow) {
    head.push(
      box(
        {
          alignItems: 'center',
          gap: Math.round(24 * k),
          alignSelf: spec.align === 'center' ? 'center' : 'flex-start',
        },
        mark,
        eyebrow
      )
    );
  }

  head.push(
    text(spec.title, {
      fontFamily: DISPLAY,
      fontSize: titleSize(spec.title, k),
      lineHeight: 1.08,
      letterSpacing: Math.round(-1.5 * k),
      color: tokens.fg,
    })
  );

  if (spec.subtitle) {
    head.push(
      text(spec.subtitle, {
        fontSize: Math.round(30 * k),
        lineHeight: 1.4,
        color: tokens.muted,
        maxWidth: '92%',
      })
    );
  }

  const body = box(
    {
      flexDirection: 'column',
      justifyContent: 'center',
      gap: Math.round(26 * k),
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
        paddingTop: Math.round(pad * 1.1),
      },
      body,
      footerRow(spec, tokens, k, { withLogo: false })
    )
  );
}

function stat(spec, tokens) {
  const k = spec.width / 1200;
  const pad = Math.round(72 * k);

  const cells = spec.stats.map((s) =>
    box(
      {
        flexDirection: 'column',
        gap: Math.round(6 * k),
        borderLeft: `${Math.max(2, Math.round(4 * k))}px solid ${tokens.accent}`,
        paddingLeft: Math.round(20 * k),
      },
      text(s.value, { fontFamily: DISPLAY, fontSize: Math.round(56 * k), color: tokens.fg }),
      text(s.label, { fontFamily: MONO, fontSize: Math.round(19 * k), color: tokens.muted })
    )
  );

  const head = box(
    { flexDirection: 'column', gap: Math.round(22 * k) },
    eyebrowRow(spec, tokens, k),
    text(spec.title, {
      fontFamily: DISPLAY,
      fontSize: titleSize(spec.title, k, 64),
      lineHeight: 1.1,
      letterSpacing: Math.round(-1.2 * k),
    })
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
        paddingTop: Math.round(pad * 1.1),
        justifyContent: 'space-between',
      },
      head,
      box({ gap: Math.round(44 * k), flexGrow: 1, alignItems: 'center' }, ...cells),
      footerRow(spec, tokens, k)
    )
  );
}

function minimal(spec, tokens) {
  const k = spec.width / 1200;
  const kids = [
    logoMark(spec, k),
    text(spec.title, {
      fontFamily: DISPLAY,
      fontSize: titleSize(spec.title, k, 94),
      lineHeight: 1.05,
      letterSpacing: Math.round(-2 * k),
      textAlign: 'center',
    }),
  ];
  if (spec.subtitle) {
    kids.push(
      text(spec.subtitle, {
        fontSize: Math.round(30 * k),
        color: tokens.muted,
        textAlign: 'center',
        maxWidth: '80%',
      })
    );
  }
  if (spec.site) {
    kids.push(
      text(spec.site, {
        fontFamily: MONO,
        fontSize: Math.round(22 * k),
        color: tokens.accent,
        marginTop: Math.round(14 * k),
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
        padding: Math.round(80 * k),
        alignItems: 'center',
        justifyContent: 'center',
        gap: Math.round(24 * k),
      },
      ...kids
    )
  );
}

function code(spec, tokens) {
  const k = spec.width / 1200;
  const pad = Math.round(64 * k);

  const chrome = box(
    { alignItems: 'center', gap: Math.round(10 * k) },
    ...['#ff5f57', '#febc2e', '#28c840'].map((c) =>
      h('div', {
        style: {
          display: 'flex',
          width: Math.round(14 * k),
          height: Math.round(14 * k),
          borderRadius: 999,
          backgroundColor: c,
        },
      })
    )
  );

  const inner = [
    box(
      { alignItems: 'center', justifyContent: 'space-between' },
      chrome,
      text(spec.badge || spec.eyebrow || '', {
        fontFamily: MONO,
        fontSize: Math.round(20 * k),
        color: tokens.muted,
      })
    ),
    text(spec.title, {
      fontFamily: MONO,
      fontSize: titleSize(spec.title, k, 46),
      lineHeight: 1.35,
      color: tokens.fg,
    }),
  ];

  if (spec.subtitle) {
    inner.push(
      text(spec.subtitle, {
        fontFamily: MONO,
        fontSize: Math.round(24 * k),
        lineHeight: 1.45,
        color: tokens.accent,
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
        paddingTop: Math.round(pad * 1.2),
        gap: Math.round(30 * k),
      },
      box(
        {
          flexDirection: 'column',
          gap: Math.round(28 * k),
          backgroundColor: tokens.bgAlt,
          border: `${Math.max(1, Math.round(2 * k))}px solid ${tokens.rule}`,
          borderRadius: Math.round(18 * k),
          padding: Math.round(40 * k),
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
  const panelWidth = Math.round(spec.width * 0.32);

  const panel = box(
    {
      width: panelWidth,
      height: '100%',
      backgroundColor: tokens.bgAlt,
      borderRight: `${Math.max(2, Math.round(6 * k))}px solid ${tokens.accent}`,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: Math.round(20 * k),
      padding: Math.round(40 * k),
    },
    logoMark(spec, k, Math.min(spec.logoWidth * 1.6, (panelWidth - Math.round(80 * k)) / k)),
    !spec.logo && spec.site
      ? text(spec.site, {
          fontFamily: DISPLAY,
          fontSize: Math.round(34 * k),
          color: tokens.fg,
          textAlign: 'center',
        })
      : null
  );

  // The content column is sized explicitly. A flex item defaults to a min
  // width of auto, so a long unbroken headline would otherwise push straight
  // through the right edge of the card.
  const contentWidth = spec.width - panelWidth;
  const kContent = (contentWidth - Math.round(128 * k)) / 1200;

  const content = box(
    {
      flexDirection: 'column',
      justifyContent: 'center',
      gap: Math.round(22 * k),
      width: contentWidth,
      padding: Math.round(64 * k),
    },
    eyebrowRow(spec, tokens, k),
    text(spec.title, {
      fontFamily: DISPLAY,
      fontSize: titleSize(spec.title, kContent, 92),
      lineHeight: 1.1,
      letterSpacing: Math.round(-1.2 * k),
    }),
    spec.subtitle
      ? text(spec.subtitle, { fontSize: Math.round(27 * k), lineHeight: 1.4, color: tokens.muted })
      : null,
    spec.logo && spec.site
      ? text(spec.site, {
          fontFamily: MONO,
          fontSize: Math.round(22 * k),
          color: tokens.accent,
          marginTop: Math.round(8 * k),
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
  const pad = Math.round(80 * k);

  const attribution = [];
  if (spec.author) {
    attribution.push(text(spec.author, { fontSize: Math.round(26 * k), color: tokens.fg }));
  }
  if (spec.meta || spec.site) {
    attribution.push(
      text(spec.meta || spec.site, {
        fontFamily: MONO,
        fontSize: Math.round(21 * k),
        color: tokens.muted,
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
        paddingTop: Math.round(pad * 0.9),
        justifyContent: 'center',
        gap: Math.round(28 * k),
      },
      text('\u201C', {
        fontFamily: DISPLAY,
        fontSize: Math.round(150 * k),
        lineHeight: 1,
        height: Math.round(84 * k),
        color: tokens.accent,
      }),
      text(spec.title, {
        fontFamily: DISPLAY,
        fontSize: titleSize(spec.title, k, 60),
        lineHeight: 1.22,
        letterSpacing: Math.round(-0.8 * k),
      }),
      attribution.length
        ? box(
            {
              alignItems: 'center',
              gap: Math.round(18 * k),
              borderLeft: `${Math.max(2, Math.round(4 * k))}px solid ${tokens.accent}`,
              paddingLeft: Math.round(20 * k),
            },
            logoMark(spec, k, Math.min(spec.logoWidth, 64)),
            box({ flexDirection: 'column', gap: Math.round(4 * k) }, ...attribution)
          )
        : null
    )
  );
}

/** Compact horizontal lockup. Holds up at small preview sizes. */
function banner(spec, tokens) {
  const k = spec.width / 1200;

  const copy = box(
    { flexDirection: 'column', gap: Math.round(12 * k), flexGrow: 1 },
    eyebrowRow(spec, tokens, k),
    text(spec.title, {
      fontFamily: DISPLAY,
      fontSize: titleSize(spec.title, k, 66),
      lineHeight: 1.08,
      letterSpacing: Math.round(-1.4 * k),
    }),
    spec.subtitle
      ? text(spec.subtitle, { fontSize: Math.round(28 * k), lineHeight: 1.35, color: tokens.muted })
      : null,
    spec.site
      ? text(spec.site, {
          fontFamily: MONO,
          fontSize: Math.round(21 * k),
          color: tokens.accent,
          marginTop: Math.round(6 * k),
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
        gap: Math.round(48 * k),
        padding: Math.round(72 * k),
      },
      logoMark(spec, k, Math.max(spec.logoWidth, 120)),
      copy
    ),
    { bar: false }
  );
}

/** Byline card: category, headline, then author, date and read time. */
function article(spec, tokens) {
  const k = spec.width / 1200;
  const pad = Math.round(72 * k);
  const dot = () => text('\u00B7', { fontSize: Math.round(25 * k), color: tokens.rule });

  const byline = [];
  if (spec.author) {
    byline.push(text(spec.author, { fontSize: Math.round(25 * k), color: tokens.fg }));
  }
  if (spec.date) {
    if (byline.length) byline.push(dot());
    byline.push(text(spec.date, { fontSize: Math.round(25 * k), color: tokens.muted }));
  }
  if (spec.meta) {
    if (byline.length) byline.push(dot());
    byline.push(
      text(spec.meta, { fontFamily: MONO, fontSize: Math.round(21 * k), color: tokens.muted })
    );
  }

  const head = box(
    { alignItems: 'center', justifyContent: 'space-between' },
    eyebrowRow(spec, tokens, k) ||
      (spec.site
        ? text(spec.site, { fontFamily: MONO, fontSize: Math.round(22 * k), color: tokens.accent })
        : null),
    logoMark(spec, k, Math.min(spec.logoWidth, 120))
  );

  const body = box(
    { flexDirection: 'column', justifyContent: 'center', gap: Math.round(24 * k), flexGrow: 1 },
    text(spec.title, {
      fontFamily: DISPLAY,
      fontSize: titleSize(spec.title, k, 72),
      lineHeight: 1.1,
      letterSpacing: Math.round(-1.6 * k),
    }),
    spec.subtitle
      ? text(spec.subtitle, {
          fontSize: Math.round(28 * k),
          lineHeight: 1.4,
          color: tokens.muted,
          maxWidth: '90%',
        })
      : null
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
        paddingTop: Math.round(pad * 1.1),
      },
      head,
      body,
      byline.length
        ? box(
            {
              alignItems: 'center',
              gap: Math.round(12 * k),
              borderTop: `${Math.max(1, Math.round(2 * k))}px solid ${tokens.rule}`,
              paddingTop: Math.round(24 * k),
            },
            ...byline
          )
        : null
    )
  );
}

const REGISTRY = { editorial, stat, minimal, code, split, quote, banner, article };

export function buildTree(spec) {
  const fn = REGISTRY[spec.template] || editorial;
  return fn(spec, spec.tokens);
}
