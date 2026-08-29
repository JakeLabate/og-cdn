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

import { initRuntime, render } from '../src/render.js';
import { parseSpec, parseMeta, canonicalQuery } from '../src/params.js';
import { buildTags, tagsToHtml, tagsToObject } from '../src/tags.js';

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

initRuntime({
  yogaWasm: read('src/vendor/yoga.wasm'),
  resvgWasm: read('src/vendor/resvg.wasm'),
  fonts: [
    { name: 'Space Grotesk', data: read('fonts/SpaceGrotesk-Bold.ttf'), weight: 700, style: 'normal' },
    { name: 'IBM Plex Sans', data: read('fonts/IBMPlexSans-Regular.ttf'), weight: 400, style: 'normal' },
    { name: 'IBM Plex Mono', data: read('fonts/IBMPlexMono-Medium.ttf'), weight: 500, style: 'normal' },
  ],
});

const cases = [
  ['editorial-indigo', 'template=editorial&theme=indigo&eyebrow=Field%20notes&title=Structured%20data%20is%20the%20substrate%20both%20engines%20feed%20on&subtitle=Why%20the%20same%20markup%20serves%20classic%20search%20and%20generative%20answers&site=jakelabate.com&author=Jake%20Labate'],
  ['editorial-cream', 'template=editorial&theme=cream&badge=New&title=SchemaCDN&subtitle=Deploy%20and%20govern%20structured%20data%20across%20every%20template&site=schemacdn.com'],
  ['stat-ink', 'template=stat&theme=ink&eyebrow=Audit&title=Technical%20SEO%20audit%20results&stat=312%25%7COrganic%20sessions&stat=1.4s%7CLCP&stat=98%7CPages%20fixed&site=jakelabate.com'],
  ['minimal-paper', 'template=minimal&theme=paper&title=Open%20Graph%2C%20on%20demand&subtitle=One%20endpoint%20for%20the%20card%20and%20the%20markup&site=og.jakelabate.com'],
  ['code-slate', 'template=code&theme=slate&badge=curl&title=curl%20-s%20https%3A%2F%2Fog.example.com%2Fv1%2Ftags.html%3Ftitle%3DHello&subtitle=%23%20writes%20the%20whole%20head%20block%20for%20you&site=og.example.com'],
  ['long-title-overflow', 'template=editorial&theme=indigo&title=' + encodeURIComponent('A deliberately overlong headline used to prove the size ramp keeps very long strings inside the safe area of the card without clipping or overflow') + '&site=example.com'],
  ['custom-colors', 'template=editorial&theme=indigo&bg=%23120b1f&accent=%23f0abfc&fg=fff&title=Custom%20token%20override&site=example.com'],
  ['square-2x', 'size=square&scale=2&template=minimal&theme=ink&title=Square%20at%202x&site=example.com'],
];

console.log('render cases');
for (const [name, qs] of cases) {
  const spec = parseSpec(new URLSearchParams(qs));
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

console.log('\nno em dashes in source');
{
  const files = [
    'src/index.js', 'src/render.js', 'src/params.js', 'src/tags.js',
    'src/templates.js', 'src/theme.js', 'src/sign.js', 'src/docs.js',
    'test/render.test.js', 'README.md',
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
