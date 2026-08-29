# og-cdn

Open Graph images and the tags that point at them, as one edge API.

Same generator as the cards on jakelabate.com, lifted out of the site and put
behind a CDN so any project can call it. A request returns the picture. A
sibling request returns the exact `<meta>` block that references it, with an
absolute URL and declared dimensions, which is the part most implementations
get wrong.

Runs as a Cloudflare Worker. No browser, no headless Chrome, no image host.
Satori lays out the card and emits SVG, resvg rasterizes it to PNG, both as
WebAssembly inside the isolate. Cold render is roughly 200 to 400 ms, cached
renders are served from the Cloudflare edge cache and never re-execute.

## Routes

| Route | Returns |
| --- | --- |
| `GET /v1/og.png` | The rendered card. This is the `og:image` target. |
| `GET /v1/og.svg` | The same card as vector, for checking layout. Do not use it for `og:image`, no major crawler accepts SVG there. |
| `GET /v1/tags` | JSON: tag map, ready to paste HTML block, absolute image URL. |
| `GET /v1/tags.html` | Just the meta tag block, plain text. |
| `GET /v1/meta` | Tags plus the resolved card spec, for build pipelines. |
| `GET /v1/embed.js` | The client configuration script. Reads `data-*` attributes off its own tag. |
| `GET /v1/themes` | Available themes, templates, patterns, sizes, colour tokens. |
| `GET /health` | Liveness. |
| `GET /` | Docs and a live playground, served by the worker itself. |

## Quick use

Point a tag straight at it:

```html
<meta property="og:image" content="https://og.example.com/v1/og.png?title=Hello&theme=indigo" />
```

Or have the service write the whole block:

```bash
curl -s "https://og.example.com/v1/tags.html?title=Hello&site=example.com&url=https://example.com/"
```

```html
<meta property="og:type" content="website" />
<meta property="og:title" content="Hello" />
<meta property="og:url" content="https://example.com/" />
<meta property="og:site_name" content="example.com" />
<meta property="og:image" content="https://og.example.com/v1/og.png?site=example.com&title=Hello" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
```

In a build step:

```js
const res = await fetch(`https://og.example.com/v1/tags?${params}`);
const { html } = await res.json();
// splice html into <head>
```

## Sized for a message thread

The design constraint is not the 1200 by 630 canvas, it is what survives being
shown at roughly 300 points wide in a text message. That is close to a quarter
size, so a 30 pixel subtitle arrives as 8 point type and nobody reads it.

Consequences, all of them deliberate:

- **No eyebrow.** Small grey uppercase labels vanish at preview scale. The
  badge replaced it: a solid accent pill, high contrast, readable as a shape
  even when the letters are not.
- **Everything larger.** Headlines start at 104 to 132 pixels depending on
  template, subtitles at 46 to 50, footers at 44. Nothing renders below 42
  pixels, which is 11 point once scaled down.
- **Clamp, do not shrink.** Long text used to shrink until it fit, which just
  moved the failure from clipped to unreadable. Titles and subtitles now clamp
  to a line count with an ellipsis and hold their size.
- **Three stats, not four.** A fourth column pushed each value under the floor.

Two gates in `npm test` enforce this rather than leaving it as an intention:

- Every font size on every template, across four content extremes, is checked
  at its apparent size and must clear 11 point.
- Every template is rendered a second time with the canvas height unset, and
  the natural height of the content is compared against the card it has to fit
  in. This is what catches a clipped footer, which a size floor cannot see.

Both were written after the first version passed the size check and still
clipped three cards at the bottom edge.

## Parameters

| Param | Notes |
| --- | --- |
| `title` | Headline. Falls back to `site` when absent. |
| `subtitle` | Also accepted as `description`. Feeds `og:description`. |
| `badge` | A solid accent pill. The only label element on a card. |
| `site`, `author` | Footer line. `site` also feeds `og:site_name`. |
| `stat` | Repeatable, `Value|Label`, up to four. Used by the `stat` template. |
| `date`, `meta` | Byline detail for `article`, attribution line for `quote`. |
| `logo` | https URL to a PNG, JPEG, GIF or SVG. Fetched, sized from its own header, inlined as a data URI. |
| `logoWidth` | Display width in card pixels, 24 to 400. Height follows the intrinsic ratio. |
| `template` | `editorial`, `article`, `split`, `banner`, `quote`, `stat`, `minimal`, `code`. |
| `theme` | `indigo`, `ink`, `violet`, `sunset`, `forest`, `mono`, `cream`, `paper`, `slate`. |
| `pattern` | `grid`, `dots`, `diagonal`, `glow`, `off`. |
| `bg`, `bgAlt`, `fg`, `muted`, `accent`, `rule` | Hex overrides on top of the theme. |
| `size` | `og`, `square`, `wide`, `linkedin`, `story`. Or pass `w` and `h`. |
| `scale` | `1` or `2`. Renders at 2x, tags report the scaled dimensions. |
| `align` | `left` or `center`. |
| `url`, `type`, `locale`, `card`, `twitter`, `alt` | Markup only. Never fragment the image cache. |

Every value is clamped and stripped. Unknown themes and templates fall back
rather than error, bad hex is ignored, control characters are collapsed, and
attribute values are escaped on the way into HTML.

## Configure from a script tag

Drop one tag, set the brand once, and every page under it gets a card:

```html
<script src="https://og.example.com/v1/embed.js"
        data-theme="indigo"
        data-template="article"
        data-accent="#2dd4bf"
        data-logo="https://example.com/logo.svg"
        data-site="example.com"></script>
```

Every query parameter is available as a `data-` attribute, hyphenated:
`data-logo-width`, `data-bg-alt`. Repeatable stats go in one attribute,
comma separated: `data-stats="312%|Sessions,1.4s|LCP"`. Anything you leave
out is derived from the page, so a single site wide tag still produces a
correct per page card:

| Missing | Read from |
| --- | --- |
| `title` | existing `og:title`, then `h1`, then `<title>` |
| `description` | existing `og:description`, then `meta[name=description]` |
| `url` | `link[rel=canonical]`, then `location.href` |
| `site` | existing `og:site_name`, then `location.hostname` |

Set `data-auto="off"` to disable derivation. After a client side route change,
call `window.ogcdn.refresh({ title: 'New title' })`.

### The caveat that matters

Social crawlers do not execute JavaScript. Facebook, LinkedIn, X, Slack and
iMessage parse the raw HTML response, so tags injected by `embed.js` are
invisible to all of them. The script is for previewing a configuration, for
client rendered apps that need the head kept in sync, and for consumers that
do render.

For crawlers, feed the same attribute vocabulary to something that runs before
the response leaves the server:

- **Build step**: `examples/inject-tags.mjs` walks a `dist` folder, asks the
  service for each page's tag block, and splices it into the head.
- **Edge rewriter**: `examples/edge-inject.js` is a second worker that sits in
  front of an origin, reads the `data-*` attributes off the script tag already
  in the page, injects real tags, and removes the now redundant script. The
  page keeps its one line of configuration and crawlers get server rendered
  markup.

## Logos

Pass `logo` as an https URL. The service fetches it once per isolate, reads
the intrinsic dimensions out of the file header so the aspect ratio is exact
rather than guessed, and inlines it as a data URI.

The fetch is guarded, because this is the only place the service reaches a URL
a stranger supplied: https only, 512 KB cap, 3 second timeout, image content
types only, and private or link local hosts blocked outright. To restrict it
further, set `LOGO_ALLOWED_HOSTS` to a comma separated list of hostnames, and
subdomains of those hosts are accepted too.

A logo that fails any of those checks is dropped and the card renders without
it. A broken mark should never cost you the whole preview. The `x-og-logo`
response header reports `loaded`, `failed` or `none` so you can tell which
happened.

## Caching

The image cache key is the sorted set of visual parameters only, so parameter
order never splits the cache and markup-only params never cause a re-render.
Responses carry `max-age=31536000, immutable`. Change a visual parameter and
you get a different URL, therefore a new render. `x-og-cache` reports HIT or
MISS.

## Signing

The endpoint is public compute. If you do not want strangers rendering
arbitrary cards on your account:

```bash
wrangler secret put SIGNING_KEY
```

Once set, `/v1/og.png` requires a matching `sig`, and `/v1/tags` mints signed
URLs for you. Unset means open, which is fine behind a low limit or for a
personal site.

## Deploy

```bash
npm install
npm test           # renders every template locally, writes tmp/*.png
npx wrangler login
npm run deploy
```

Then set the public origin so generated URLs are absolute against your
hostname rather than whichever origin a build box happened to hit. In
`wrangler.toml`:

```toml
[vars]
PUBLIC_ORIGIN = "https://og.example.com"
```

For a custom hostname on a zone already in Cloudflare, uncomment the
`routes` block in `wrangler.toml` and redeploy. Workers custom domains
provision their own certificate, so no separate DNS record is needed.

## Fonts

Space Grotesk 700 for display, IBM Plex Sans 400 for body, IBM Plex Mono 500
for labels. All three are instanced from the variable originals, subset to
latin, and bundled as bytes, roughly 110 KB total. No render ever waits on a
font CDN. To swap a family, drop the TTF in `fonts/`, register it in the
`FONTS` array in `src/index.js`, and reference the family name in
`src/templates.js`.

## Layout

```
src/index.js      routing, caching, CORS, wasm and font wiring
src/render.js     satori and resvg, with memoised wasm init
src/templates.js  the four card layouts as plain element trees
src/theme.js      palettes, sizes, token resolution
src/params.js     parsing, clamping, canonical cache key
src/type.js       the type scale, anchored to apparent size in a preview
src/tags.js       Open Graph and Twitter tag construction
src/assets.js     remote logo fetching, guards, intrinsic size sniffing
src/embed.js      the client configuration script, generated per origin
src/sign.js       optional HMAC request signing
src/docs.js       the self-hosted docs page
examples/inject-tags.mjs  build time injection into a dist folder
examples/edge-inject.js   edge rewriter, server side tags from the script tag
test/render.test.js       runs the real pipeline in Node
```

Templates are pure functions of `(spec, tokens)` returning a Satori node, so a
new card layout is one function plus one registry entry, and no other file
changes.

Built by Jake Labate, SEO Consultant.
