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

## The design system

Everything measurable lives in `src/scale.js`. Templates make layout decisions
and nothing else. A template that needs a value the scale does not have is a
signal the scale is wrong, and the change goes there.

### Type

A modular scale: one base, one ratio, seven steps.

```
44   55   69   86   107   134   168
```

The base is not a body size somebody liked. It is the legibility floor. A link
preview in a message thread renders around 300 points wide, close to a quarter
of the card, so 44 pixels is 11.7 point in the place it actually gets read.
Deriving the base from that constraint means the smallest step on the scale is
by definition the smallest readable size, and no template can pick something
too small.

The ratio is 1.25, a major third. Wide enough that adjacent steps read as
deliberately different rather than as a mistake.

Steps are named by intent, not index: `caption`, `body`, `lead`, `title`,
`titleLg`, `display`, `displayLg`.

### Hierarchy

Long headlines step **down the scale** rather than being multiplied by a
factor, so every rendered size is still a step. A headline paired with a deck
drops one further step, because two competing display sizes read as an
argument. Display headlines stop at `title` and clamp from there: below that
the card stops reading as a headline at preview size, and a truncated headline
someone can read beats a complete one they cannot.

### Leading and tracking

One value per role rather than a number per element. Display leading is 1.08,
lead 1.25, body 1.4, caption 1.2. Tracking is expressed in em so it scales
with what it is applied to: display is tightened by 0.022em, monospace
captions opened by 0.012em.

### Space

An 8 point grid, but templates never name a number. They name a relationship,
and the system resolves it:

```
stack    related 24   group 32   section 48
inline   tight 8      base 16    group 40
pad      card 24      panel 32   page 56   pageTop 64
```

Three rules govern those values.

**Proximity.** Related things sit closer than unrelated things, and the steps
between related, group and section are clearly separated rather than adjacent,
so the difference reads as intent.

**A gap between two elements must exceed the leading inside them.** This is
the rule the previous version broke: the headline sat 8 pixels above its deck
while the deck's own lines were 14 pixels apart, so the two read as one block.
A gate now checks it.

**Vertical and horizontal are different axes** and do not share values. A row
of inline items reads as a unit at spacing that looks cramped in a stack.

`pageTop` is one unit larger than `page` because the accent bar occupies the
top edge, so content clears it rather than appearing to start higher than the
side margins. Rules and borders are optical weights, not spacing, so they sit
off the grid in their own set.

### Line allocation

The headline is the message and the deck is a supporting line, not a
paragraph, so the deck clamps to one line and the headline takes the rest.
Truncating the deck costs a qualifier; truncating the headline costs the point
of the card.

How many lines the headline gets is a property of the frame, not a preference.
`article` carries a head row and a byline as well as the body, so it holds one
fewer line than `editorial`, which carries only body and footer. `split` is a
tall narrow column and holds more. The overflow gate fails the build if any of
those capacities is wrong, so they are measured rather than chosen.

### Enforced, not intended

A scale only means something if a template cannot step off it. `sp()` and
`type()` record every value they return, and `npm test` fails the build if:

- any rendered size is not a step on the scale
- any space is not a named token from the relationship vocabulary
- a gap between elements does not clear the leading inside them
- the stack and inline scales collapse into one set of values
- any declared spacing token goes unused, which would mean the vocabulary
  claims a distinction it does not make
- the scale is not the ratio applied to the base
- fewer than four of the seven steps are used, which would mean the middle of
  the scale is decorative
- a headline with a deck does not drop a step
- anything reads below 11 point at preview scale
- any template overflows its own card

The last one is the one that keeps earning its place. The first version of
this cleared the size floor and still clipped three cards at the bottom edge,
which a size check cannot see. It works by rendering each template a second
time with the canvas height unset and comparing the natural content height
against the card it has to fit in.

## Parameters

| Param | Notes |
| --- | --- |
| `title` | Headline. Falls back to `site` when absent. |
| `subtitle` | Also accepted as `description`. Feeds `og:description`. |
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
src/scale.js      the design system: type scale, grid, leading, tracking
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
