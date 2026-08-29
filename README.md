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
| `GET /v1/themes` | Available themes, templates, sizes, colour tokens. |
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

## Parameters

| Param | Notes |
| --- | --- |
| `title` | Headline. Falls back to `site` when absent. |
| `subtitle` | Also accepted as `description`. Feeds `og:description`. |
| `eyebrow`, `badge` | Small label above the headline, and a pill beside it. |
| `site`, `author` | Footer line. `site` also feeds `og:site_name`. |
| `stat` | Repeatable, `Value|Label`, up to four. Used by the `stat` template. |
| `template` | `editorial`, `stat`, `minimal`, `code`. |
| `theme` | `indigo`, `ink`, `cream`, `paper`, `slate`. |
| `bg`, `bgAlt`, `fg`, `muted`, `accent`, `rule` | Hex overrides on top of the theme. |
| `size` | `og`, `square`, `wide`, `linkedin`, `story`. Or pass `w` and `h`. |
| `scale` | `1` or `2`. Renders at 2x, tags report the scaled dimensions. |
| `align`, `pattern` | `left` or `center`, and `grid` or `off`. |
| `url`, `type`, `locale`, `card`, `twitter`, `alt` | Markup only. Never fragment the image cache. |

Every value is clamped and stripped. Unknown themes and templates fall back
rather than error, bad hex is ignored, control characters are collapsed, and
attribute values are escaped on the way into HTML.

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
src/tags.js       Open Graph and Twitter tag construction
src/sign.js       optional HMAC request signing
src/docs.js       the self-hosted docs page
test/render.test.js  runs the real pipeline in Node
```

Templates are pure functions of `(spec, tokens)` returning a Satori node, so a
new card layout is one function plus one registry entry, and no other file
changes.

Built by Jake Labate, SEO Consultant.
