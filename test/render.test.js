/**
 * Runs the real render pipeline outside Workers.
 *
 * The worker entry gets its wasm and fonts from bundler imports, which Node
 * cannot resolve, so the tests feed the same bytes in by hand. Everything
 * below this line is the exact code that runs in production.
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { initRuntime, measureHeight, render } from '../src/render.js';
import { parseSpec, parseMeta, canonicalQuery } from '../src/params.js';
import { buildTags, tagsToHtml, tagsToObject } from '../src/tags.js';
import { imageSize, resolveLogo } from '../src/assets.js';
import { embedScript } from '../src/embed.js';
import { PATTERNS, TEMPLATES, THEMES } from '../src/theme.js';
import { sizesUsed } from '../src/templates.js';
import { MIN_APPARENT_PT, MIN_SIZE, PREVIEW_WIDTH, apparentPt } from '../src/type.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = join(root, 'tmp');
mkdirSync(out, { recursive: true });

const read = (p) => readFileSync(join(root, p));

let failures = 0;
function check(label, condition, detail = '') {
  const mark = condition ? 'PASS' : 'FAIL';
  if (!condition) failures++;
  console.log(`${mark}  ${label}${detail ? '  ' + detail : ''}`);
}

/** PNG header carries width and height at a fixed offset. Verify, do not trust. */
function pngSize(buf) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

await initRuntime({
  yogaWasm: read('src/vendor/yoga.wasm'),
  resvgWasm: read('src/vendor/resvg.wasm'),
  fonts: [
    { name: 'Space Grotesk', data: read('fonts/SpaceGrotesk-Bold.ttf'), weight: 700, style: 'normal' },
    { name: 'IBM Plex Sans', data: read('fonts/IBMPlexSans-Regular.ttf'), weight: 400, style: 'normal' },
    { name: 'IBM Plex Mono', data: read('fonts/IBMPlexMono-Medium.ttf'), weight: 500, style: 'normal' },
  ],
});

// Fixture logos. Built here rather than committed so the test suite has no
// binary fixtures to keep in sync, and so the PNG path exercises real bytes.
const { Resvg } = await import('@resvg/resvg-wasm');
// Pure vector, no text. resvg loads no system fonts, so a fixture with a
// text node would render blank and make every logo look mis-sized.
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 72" width="240" height="72">
<rect x="0" y="0" width="72" height="72" rx="16" fill="#2dd4bf"/>
<path d="M22 50 L36 22 L50 50 Z" fill="#0f1320"/>
<rect x="90" y="18" width="150" height="12" rx="6" fill="#f2f4f8"/>
<rect x="90" y="38" width="110" height="12" rx="6" fill="#f2f4f8" opacity="0.65"/>
<rect x="90" y="58" width="64" height="8" rx="4" fill="#2dd4bf"/>
</svg>`;
const LOGO_SVG_BYTES = new TextEncoder().encode(LOGO_SVG);
const LOGO_PNG_BYTES = new Uint8Array(
  new Resvg(LOGO_SVG, { fitTo: { mode: 'width', value: 240 } }).render().asPng()
);

/** Stub fetch so logo resolution is exercised without leaving the process. */
function stubFetch(bytes, { type = 'image/svg+xml', status = 200, length = null } = {}) {
  globalThis.fetch = async () =>
    new Response(status === 200 ? bytes : null, {
      status,
      headers: {
        'content-type': type,
        ...(length == null ? {} : { 'content-length': String(length) }),
      },
    });
}
const realFetch = globalThis.fetch;

const cases = [
  ['editorial-indigo', 'template=editorial&theme=indigo&title=Structured%20data%20is%20the%20substrate%20both%20engines%20feed%20on&subtitle=Why%20the%20same%20markup%20serves%20classic%20search%20and%20generative%20answers&site=jakelabate.com&author=Jake%20Labate'],
  ['editorial-cream', 'template=editorial&theme=cream&title=SchemaCDN&subtitle=Deploy%20and%20govern%20structured%20data%20across%20every%20template&site=schemacdn.com'],
  ['stat-ink', 'template=stat&theme=ink&title=Technical%20SEO%20audit%20results&stat=312%25%7COrganic%20sessions&stat=1.4s%7CLCP&stat=98%7CPages%20fixed&site=jakelabate.com'],
  ['minimal-paper', 'template=minimal&theme=paper&title=Open%20Graph%2C%20on%20demand&subtitle=One%20endpoint%20for%20the%20card%20and%20the%20markup&site=og.jakelabate.com'],
  ['code-slate', 'template=code&theme=slate&title=curl%20-s%20https%3A%2F%2Fog.example.com%2Fv1%2Ftags.html%3Ftitle%3DHello&subtitle=%23%20writes%20the%20whole%20head%20block%20for%20you&site=og.example.com'],
  ['long-title-overflow', 'template=editorial&theme=indigo&title=' + encodeURIComponent('A deliberately overlong headline used to prove the size ramp keeps very long strings inside the safe area of the card without clipping or overflow') + '&site=example.com'],
  ['custom-colors', 'template=editorial&theme=indigo&bg=%23120b1f&accent=%23f0abfc&fg=fff&title=Custom%20token%20override&site=example.com'],
  ['square-2x', 'size=square&scale=2&template=minimal&theme=ink&title=Square%20at%202x&site=example.com'],
  ['split-violet', 'template=split&theme=violet&pattern=glow&title=Rebuilding%20a%20product%20taxonomy%20around%20intent&subtitle=Nine%20months%2C%20four%20thousand%20URLs&site=jakelabate.com&logo=1'],
  ['quote-sunset', 'template=quote&theme=sunset&pattern=dots&title=' + encodeURIComponent('The same markup feeds both engines, so the argument about which one matters is the wrong argument.') + '&author=Jake%20Labate&meta=SEO%20Consultant&logo=1'],
  ['banner-forest', 'template=banner&theme=forest&pattern=diagonal&title=SchemaCDN%202.0&subtitle=Governed%20structured%20data%2C%20one%20deploy&site=schemacdn.com&logo=1'],
  ['article-mono', 'template=article&theme=mono&pattern=off&title=What%20Open%20Graph%20actually%20guarantees&subtitle=And%20the%20four%20places%20every%20implementation%20quietly%20breaks&author=Jake%20Labate&date=Aug%2029%2C%202026&meta=6%20min%20read&logo=1'],
  ['editorial-logo-glow', 'template=editorial&theme=indigo&pattern=glow&title=Open%20Graph%20as%20an%20edge%20API&subtitle=The%20card%20and%20the%20markup%20from%20one%20origin&site=og.jakelabate.com&author=Jake%20Labate&logo=1'],
];

console.log('render cases');
for (const [name, qs] of cases) {
  const spec = parseSpec(new URLSearchParams(qs));
  if (new URLSearchParams(qs).get('logo') === '1') {
    stubFetch(name.includes('article') ? LOGO_PNG_BYTES : LOGO_SVG_BYTES, {
      type: name.includes('article') ? 'image/png' : 'image/svg+xml',
    });
    spec.logo = await resolveLogo('https://cdn.example.com/logo', spec.logoWidth, {});
    globalThis.fetch = realFetch;
    if (!spec.logo) throw new Error('logo fixture failed to resolve for ' + name);
  }
  const t0 = Date.now();
  const res = await render(spec);
  const ms = Date.now() - t0;
  const buf = Buffer.from(res.body);
  const size = pngSize(buf);
  writeFileSync(join(out, `${name}.png`), buf);
  check(
    name,
    Boolean(size) && size.w === spec.width * spec.scale,
    `${size ? size.w + 'x' + size.h : 'not a png'} ${Math.round(buf.length / 1024)}kb ${ms}ms`
  );
}

console.log('\nsvg output');
{
  const spec = parseSpec(new URLSearchParams('title=Vector&template=minimal'));
  spec.format = 'svg';
  const res = await render(spec);
  check('svg starts with an svg element', res.body.trimStart().startsWith('<svg'));
  check('svg content type', res.contentType.startsWith('image/svg+xml'));
}

console.log('\nparam handling');
{
  const empty = parseSpec(new URLSearchParams(''));
  check('empty query still renders a spec', empty.title === 'Untitled' && empty.width === 1200);

  const junk = parseSpec(new URLSearchParams('theme=nope&template=nope&w=99999&h=-4&scale=9&accent=zzz'));
  check('unknown theme falls back', junk.themeName === 'indigo');
  check('unknown template falls back', junk.template === 'editorial');
  check('width clamps', junk.width === 2400, String(junk.width));
  check('height clamps', junk.height === 200, String(junk.height));
  check('scale clamps', junk.scale === 2, String(junk.scale));
  check('bad hex ignored', junk.tokens.accent === '#2dd4bf');

  const inject = parseSpec(new URLSearchParams('title=' + encodeURIComponent('<script>alert(1)</script>\n\nx')));
  check('control chars collapsed', !inject.title.includes('\n'));

  const stats = parseSpec(new URLSearchParams('stat=1%7Cone&stat=2%7Ctwo&stat=3%7Cthree&stat=4%7Cfour&stat=5%7Cfive'));
  check('stats cap at four', stats.stats.length === 4);

  const a = canonicalQuery(new URLSearchParams('b=2&a=1'));
  const b = canonicalQuery(new URLSearchParams('a=1&b=2'));
  check('canonical query is order independent', a === b, a);

  const withSig = canonicalQuery(new URLSearchParams('a=1&sig=deadbeef'));
  check('sig excluded from canonical form', withSig === 'a=1', withSig);
}

console.log('\ntag output');
{
  const qs = 'title=Hello%20world&description=A%20description&url=https%3A%2F%2Fexample.com%2Fpost&site=Example&type=article&author=Jake%20Labate&twitter=%40jakelabate';
  const meta = parseMeta(new URLSearchParams(qs));
  const tags = buildTags(meta, {
    url: 'https://og.example.com/v1/og.png?title=Hello',
    width: 1200,
    height: 630,
    type: 'image/png',
    alt: 'Hello world',
  });
  const map = tagsToObject(tags);
  check('og:title present', map['og:title'] === 'Hello world');
  check('og:url absolute', map['og:url'] === 'https://example.com/post');
  check('og:image absolute', map['og:image'].startsWith('https://'));
  check('secure url mirrored', map['og:image:secure_url'] === map['og:image']);
  check('dimensions declared', map['og:image:width'] === '1200' && map['og:image:height'] === '630');
  check('article author emitted for article type', map['article:author'] === 'Jake Labate');
  check('twitter card defaults large', map['twitter:card'] === 'summary_large_image');

  const html = tagsToHtml(tags);
  check('html escapes quotes', !html.includes('content="Hello world" />') === false);
  const evil = buildTags(
    { ...meta, title: 'Quote " and <tag>' },
    { url: 'https://x.test/a.png', width: 1, height: 1, type: 'image/png', alt: '' }
  );
  check('attribute injection escaped', !tagsToHtml(evil).includes('content="Quote " and'));

  const bad = parseMeta(new URLSearchParams('url=javascript%3Aalert(1)'));
  check('non http url rejected', bad.url === '');
}


console.log('\nimage size sniffing');
{
  const svg = imageSize(LOGO_SVG_BYTES, 'image/svg+xml');
  check('svg viewBox read', svg && svg.w === 240 && svg.h === 72, JSON.stringify(svg));

  const png = imageSize(LOGO_PNG_BYTES, 'image/png');
  check('png header read', png && png.w === 240 && png.h === 72, JSON.stringify(png));

  const noViewBox = new TextEncoder().encode('<svg width="50" height="25" xmlns="http://www.w3.org/2000/svg"></svg>');
  const attrs = imageSize(noViewBox, 'image/svg+xml');
  check('svg falls back to width and height attributes', attrs && attrs.w === 50 && attrs.h === 25);

  check('garbage returns null', imageSize(new Uint8Array([1, 2, 3, 4]), 'image/png') === null);
}

console.log('\nlogo resolution guards');
{
  stubFetch(LOGO_SVG_BYTES);
  const ok = await resolveLogo('https://cdn.example.com/logo.svg', 96, {});
  check('https logo resolves', Boolean(ok) && ok.src.startsWith('data:image/svg+xml;base64,'));
  check('display width honoured', ok.width === 96, String(ok && ok.width));
  check('aspect ratio preserved', ok.height === Math.round(96 * (72 / 240)), String(ok && ok.height));

  check('http rejected', (await resolveLogo('http://cdn.example.com/logo.svg', 96, {})) === null);
  check('localhost rejected', (await resolveLogo('https://localhost/logo.svg', 96, {})) === null);
  check('private range rejected', (await resolveLogo('https://192.168.1.9/logo.svg', 96, {})) === null);
  check('link local rejected', (await resolveLogo('https://169.254.169.254/logo.svg', 96, {})) === null);
  check('garbage url rejected', (await resolveLogo('not a url', 96, {})) === null);

  check(
    'host allowlist blocks other hosts',
    (await resolveLogo('https://evil.example/logo.svg', 96, { LOGO_ALLOWED_HOSTS: 'cdn.trusted.com' })) === null
  );
  stubFetch(LOGO_SVG_BYTES);
  check(
    'host allowlist permits subdomains of a listed host',
    Boolean(await resolveLogo('https://assets.cdn.trusted.com/l.svg', 96, { LOGO_ALLOWED_HOSTS: 'cdn.trusted.com' }))
  );

  stubFetch(LOGO_SVG_BYTES, { type: 'text/html' });
  check('wrong content type rejected', (await resolveLogo('https://cdn.example.com/a.html', 96, {})) === null);

  stubFetch(LOGO_SVG_BYTES, { type: 'image/svg+xml', length: 99_999_999 });
  check('oversize content-length rejected', (await resolveLogo('https://cdn.example.com/big.svg', 96, {})) === null);

  stubFetch(LOGO_SVG_BYTES, { status: 404 });
  check('non ok response rejected', (await resolveLogo('https://cdn.example.com/404.svg', 96, {})) === null);

  globalThis.fetch = async () => {
    throw new Error('network down');
  };
  check('fetch failure degrades to null', (await resolveLogo('https://cdn.example.com/x.svg', 96, {})) === null);

  globalThis.fetch = realFetch;
  check('empty url short circuits', (await resolveLogo('', 96, {})) === null);
}

console.log('\ntemplate and theme coverage');
{
  let rendered = 0;
  for (const template of TEMPLATES) {
    const spec = parseSpec(new URLSearchParams(`template=${template}&title=Coverage%20probe&subtitle=Second%20line&site=example.com&author=Someone&stat=1%7COne`));
    const res = await render(spec);
    if (pngSize(Buffer.from(res.body))) rendered++;
  }
  check('every registered template renders', rendered === TEMPLATES.length, `${rendered}/${TEMPLATES.length}`);

  let themed = 0;
  for (const theme of Object.keys(THEMES)) {
    const spec = parseSpec(new URLSearchParams(`theme=${theme}&title=Theme%20probe`));
    const res = await render(spec);
    if (pngSize(Buffer.from(res.body))) themed++;
  }
  check('every registered theme renders', themed === Object.keys(THEMES).length, `${themed}/${Object.keys(THEMES).length}`);

  let patterned = 0;
  for (const pattern of PATTERNS) {
    const spec = parseSpec(new URLSearchParams(`pattern=${pattern}&title=Pattern%20probe`));
    if (spec.pattern !== pattern) continue;
    const res = await render(spec);
    if (pngSize(Buffer.from(res.body))) patterned++;
  }
  check('every registered pattern renders', patterned === PATTERNS.length, `${patterned}/${PATTERNS.length}`);
}

console.log('\nembed script');
{
  const src = embedScript('https://og.example.com', { signed: false });
  writeFileSync(join(out, 'embed.js'), src, 'utf8');
  check('origin baked in', src.includes('"https://og.example.com"'));
  check('unsigned build skips the network path', src.includes('var SIGNED = false;'));
  check('exposes a refresh handle', src.includes('window.ogcdn = api;'));
  check('reads dataset', src.includes('el.dataset'));
  check('logo is a configurable key', src.includes('"logo"') && src.includes('"logoWidth"'));

  const signedSrc = embedScript('https://og.example.com', { signed: true });
  check('signed build asks the worker for tags', signedSrc.includes('var SIGNED = true;'));

  // Parse it the way a browser would, to catch a template literal typo.
  const { execFileSync } = await import('node:child_process');
  let parsed = true;
  try {
    execFileSync(process.execPath, ['--check', join(out, 'embed.js')]);
  } catch {
    parsed = false;
  }
  check('embed script is syntactically valid', parsed);
}


console.log('\nlegibility floor (message preview)');
{
  // The whole point of this suite. A link preview in a message thread renders
  // around PREVIEW_WIDTH points wide, so every size on the card is checked at
  // that apparent size rather than at full resolution.
  const probes = [
    ['short title', 'title=Ship%20it'],
    ['long title', 'title=' + encodeURIComponent('A deliberately overlong headline that would once have been shrunk into illegibility rather than clamped')],
    ['full card', 'title=Open%20Graph%20as%20an%20edge%20API&subtitle=The%20card%20and%20the%20markup%20from%20one%20origin&site=og.jakelabate.com&author=Jake%20Labate'],
    ['stats', 'template=stat&title=Audit%20results&stat=312%25%7COrganic%20sessions&stat=1.4s%7CLCP&stat=98%7CPages%20fixed&site=example.com'],
    ['article', 'template=article&title=What%20Open%20Graph%20guarantees&subtitle=And%20where%20it%20breaks&author=Jake%20Labate&date=Aug%2029%2C%202026&meta=6%20min%20read&site=example.com'],
  ];

  let worst = { pt: Infinity, where: '' };
  let violations = [];

  for (const template of TEMPLATES) {
    for (const [label, qs] of probes) {
      const spec = parseSpec(new URLSearchParams(qs + '&template=' + template));
      await render(spec);
      for (const size of sizesUsed()) {
        const pt = apparentPt(size, spec.width);
        if (pt < worst.pt) worst = { pt, where: `${template}/${label} @ ${size}px` };
        if (pt < MIN_APPARENT_PT) {
          violations.push(`${template}/${label}: ${size}px reads as ${pt.toFixed(1)}pt`);
        }
      }
    }
  }

  check(
    `nothing below ${MIN_APPARENT_PT}pt at ${PREVIEW_WIDTH}pt wide`,
    violations.length === 0,
    violations.slice(0, 4).join(' | ')
  );
  check(
    'smallest type on any card',
    worst.pt >= MIN_APPARENT_PT,
    `${worst.pt.toFixed(1)}pt  (${worst.where})`
  );
  check('floor constant matches the ratio', MIN_SIZE === Math.ceil(MIN_APPARENT_PT / (PREVIEW_WIDTH / 1200)), String(MIN_SIZE));

  // A long title must clamp, not shrink past the floor.
  const longSpec = parseSpec(new URLSearchParams('title=' + encodeURIComponent('x'.repeat(400))));
  await render(longSpec);
  const titlePx = Math.max(...sizesUsed());
  check('long titles clamp instead of shrinking below the floor', titlePx >= 78, `${titlePx}px`);

  const stripped = parseSpec(new URLSearchParams('eyebrow=nope&badge=nope'));
  check('eyebrow is gone from the spec', !('eyebrow' in stripped));
  check('badge is gone from the spec', !('badge' in stripped));
}


console.log('\noverflow (content must fit the canvas)');
{
  // A size floor cannot see a clipped footer. This can: render each template
  // with the canvas height unset and compare the natural height of the
  // content against the card it has to fit inside.
  const probes = [
    ['bare', 'title=Ship%20it'],
    ['full', 'title=Open%20Graph%20as%20an%20edge%20API%20for%20every%20project&subtitle=The%20card%20and%20the%20markup%20from%20one%20origin%2C%20cached%20at%20the%20edge&site=og.jakelabate.com&author=Jake%20Labate&stat=312%25%7COrganic&stat=1.4s%7CLCP&stat=98%7CFixed&date=Aug%2029&meta=6%20min%20read'],
    ['long', 'title=' + encodeURIComponent('word '.repeat(40)) + '&subtitle=' + encodeURIComponent('filler '.repeat(40)) + '&site=example.com&author=Someone&stat=1%7CA&stat=2%7CB&stat=3%7CC&date=Aug&meta=9%20min'],
    ['unbroken', 'title=' + encodeURIComponent('Supercalifragilisticexpialidocious'.repeat(4)) + '&subtitle=short&site=example.com'],
  ];

  const over = [];
  let tallest = 0;
  for (const template of TEMPLATES) {
    for (const [label, qs] of probes) {
      const spec = parseSpec(new URLSearchParams(qs + '&template=' + template));
      const natural = await measureHeight(spec);
      tallest = Math.max(tallest, natural);
      if (natural > spec.height) {
        over.push(`${template}/${label} needs ${Math.round(natural)} of ${spec.height}`);
      }
    }
  }
  check('no template overflows its card', over.length === 0, over.slice(0, 4).join(' | '));
  check('tallest render fits', tallest <= 630, `${Math.round(tallest)}/630`);

  // The mechanism the whole thing depends on. Satori ignores lineClamp on a
  // flex container, so this guards against a regression to display: flex.
  const clampedSpec = parseSpec(new URLSearchParams('title=' + encodeURIComponent('word '.repeat(60))));
  const unclamped = parseSpec(new URLSearchParams('title=' + encodeURIComponent('word '.repeat(6))));
  const tall = await measureHeight(clampedSpec);
  const short = await measureHeight(unclamped);
  check('lineClamp is actually taking effect', tall - short < 200, `${Math.round(tall)} vs ${Math.round(short)}`);
}

console.log('\nno em dashes in source');
{
  const files = [
    'src/index.js', 'src/render.js', 'src/params.js', 'src/tags.js',
    'src/templates.js', 'src/theme.js', 'src/sign.js', 'src/docs.js',
    'src/assets.js', 'src/embed.js', 'src/type.js', 'examples/inject-tags.mjs',
    'examples/edge-inject.js', 'test/render.test.js', 'README.md',
  ];
  let found = [];
  for (const f of files) {
    if (read(f).toString('utf8').includes('\u2014')) found.push(f);
  }
  check('zero em dashes', found.length === 0, found.join(', '));
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
console.log(`images written to ${out}`);
process.exit(failures === 0 ? 0 : 1);
