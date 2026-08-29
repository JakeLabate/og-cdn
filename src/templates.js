/**
 * Card layouts as plain Satori element trees.
 *
 * No JSX, no build step. Each template is a pure function of (spec, tokens)
 * that returns a Satori node, so templates stay testable in isolation.
 */

const DISPLAY = 'Space Grotesk';
const BODY = 'IBM Plex Sans';
const MONO = 'IBM Plex Mono';

const h = (type, props = {}, ...children) => ({
  type,
  props: { ...props, children: children.length === 1 ? children[0] : children },
});

const box = (style, ...children) => h('div', { style: { display: 'flex', ...style } }, ...children);

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

/** Faint grid, drawn as a background image so it costs no layout nodes. */
function gridLayer(tokens, on) {
  if (!on) return null;
  const line = tokens.rule;
  return h('div', {
    style: {
      display: 'flex',
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      opacity: 0.5,
      backgroundImage: `linear-gradient(to right, ${line} 1px, transparent 1px), linear-gradient(to bottom, ${line} 1px, transparent 1px)`,
      backgroundSize: '60px 60px',
    },
  });
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

function shell(spec, tokens, inner) {
  const k = spec.width / 1200;
  const kids = [accentBar(tokens, k)];
  const grid = gridLayer(tokens, spec.pattern === 'grid');
  if (grid) kids.push(grid);
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

function footerRow(spec, tokens, k) {
  if (!spec.site && !spec.author) return null;
  const kids = [];
  if (spec.site) {
    kids.push(
      text(spec.site, {
        fontFamily: MONO,
        fontSize: Math.round(24 * k),
        color: tokens.fg,
      })
    );
  }
  if (spec.site && spec.author) {
    kids.push(text('/', { fontSize: Math.round(24 * k), color: tokens.muted }));
  }
  if (spec.author) {
    kids.push(
      text(spec.author, {
        fontSize: Math.round(24 * k),
        color: tokens.muted,
      })
    );
  }
  return box(
    {
      alignItems: 'center',
      gap: Math.round(14 * k),
      borderTop: `${Math.max(1, Math.round(2 * k))}px solid ${tokens.rule}`,
      paddingTop: Math.round(26 * k),
    },
    ...kids
  );
}

function editorial(spec, tokens) {
  const k = spec.width / 1200;
  const pad = Math.round(72 * k);
  const head = [];

  const eyebrow = eyebrowRow(spec, tokens, k);
  if (eyebrow) head.push(eyebrow);

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

  const parts = [body];
  const footer = footerRow(spec, tokens, k);
  if (footer) parts.push(footer);

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
      ...parts
    )
  );
}

function stat(spec, tokens) {
  const k = spec.width / 1200;
  const pad = Math.round(72 * k);
  const head = [];

  const eyebrow = eyebrowRow(spec, tokens, k);
  if (eyebrow) head.push(eyebrow);

  head.push(
    text(spec.title, {
      fontFamily: DISPLAY,
      fontSize: titleSize(spec.title, k, 64),
      lineHeight: 1.1,
      letterSpacing: Math.round(-1.2 * k),
    })
  );

  const cells = spec.stats.map((s) =>
    box(
      {
        flexDirection: 'column',
        gap: Math.round(6 * k),
        borderLeft: `${Math.max(2, Math.round(4 * k))}px solid ${tokens.accent}`,
        paddingLeft: Math.round(20 * k),
      },
      text(s.value, {
        fontFamily: DISPLAY,
        fontSize: Math.round(56 * k),
        color: tokens.fg,
      }),
      text(s.label, {
        fontFamily: MONO,
        fontSize: Math.round(19 * k),
        color: tokens.muted,
      })
    )
  );

  const parts = [
    box({ flexDirection: 'column', gap: Math.round(22 * k) }, ...head),
    box({ gap: Math.round(44 * k), flexGrow: 1, alignItems: 'center' }, ...cells),
  ];

  const footer = footerRow(spec, tokens, k);
  if (footer) parts.push(footer);

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
      ...parts
    )
  );
}

function minimal(spec, tokens) {
  const k = spec.width / 1200;
  const kids = [
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
    box({ alignItems: 'center', justifyContent: 'space-between' }, chrome,
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

  const window_ = box(
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
  );

  const parts = [window_];
  const footer = footerRow(spec, tokens, k);
  if (footer) parts.push(footer);

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
      ...parts
    )
  );
}

const REGISTRY = { editorial, stat, minimal, code };

export function buildTree(spec) {
  const fn = REGISTRY[spec.template] || editorial;
  return fn(spec, spec.tokens);
}
