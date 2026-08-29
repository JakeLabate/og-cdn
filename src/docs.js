/**
 * The docs page is served by the worker itself so the service documents its
 * own deployed version rather than whatever a README last said.
 */

export function docsPage(origin) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>og-cdn</title>
<meta name="robots" content="noindex" />
<style>
  :root { color-scheme: dark; --bg:#0f1320; --fg:#f2f4f8; --muted:#93a0bd; --accent:#2dd4bf; --rule:#27314d; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:16px/1.55 ui-sans-serif, system-ui, sans-serif; }
  .wrap { max-width: 1040px; margin:0 auto; padding: 40px 24px 80px; }
  h1 { font-size: 30px; margin:0 0 6px; letter-spacing:-.5px; }
  h2 { font-size: 17px; margin:38px 0 12px; color:var(--accent); text-transform:uppercase; letter-spacing:1.4px; }
  p { color:var(--muted); margin:0 0 14px; }
  code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size:13.5px; }
  pre { background:#161d33; border:1px solid var(--rule); border-radius:10px; padding:14px 16px; overflow:auto; }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  th, td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--rule); vertical-align:top; }
  th { color:var(--fg); font-weight:600; }
  td:first-child { font-family: ui-monospace, monospace; color:var(--accent); white-space:nowrap; }
  td { color:var(--muted); }
  .grid { display:grid; grid-template-columns: 260px 1fr; gap:18px; align-items:start; }
  .controls { display:flex; flex-direction:column; gap:10px; }
  label { font-size:12px; text-transform:uppercase; letter-spacing:1px; color:var(--muted); }
  input, select, textarea { width:100%; background:#161d33; color:var(--fg); border:1px solid var(--rule); border-radius:8px; padding:8px 10px; font:14px ui-sans-serif, system-ui, sans-serif; }
  img.preview { width:100%; border:1px solid var(--rule); border-radius:12px; display:block; background:#161d33; }
  .out { margin-top:14px; }
  @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<div class="wrap">
  <h1>og-cdn</h1>
  <p>Open Graph images and the tags that point at them, rendered at the edge.</p>

  <h2>Playground</h2>
  <div class="grid">
    <div class="controls">
      <div><label for="t">Title</label><input id="t" value="Structured data, deployed at the edge" /></div>
      <div><label for="s">Subtitle</label><input id="s" value="One endpoint for the card and the markup" /></div>
      <div><label for="si">Site</label><input id="si" value="jakelabate.com" /></div>
      <div><label for="lg">Logo URL</label><input id="lg" placeholder="https://example.com/logo.svg" /></div>
      <div><label for="tpl">Template</label><select id="tpl">
        <option>editorial</option><option>article</option><option>split</option><option>banner</option>
        <option>quote</option><option>stat</option><option>minimal</option><option>code</option>
      </select></div>
      <div><label for="th">Theme</label><select id="th">
        <option>indigo</option><option>ink</option><option>violet</option><option>sunset</option>
        <option>forest</option><option>mono</option><option>cream</option><option>paper</option><option>slate</option>
      </select></div>
      <div><label for="pt">Pattern</label><select id="pt">
        <option>grid</option><option>dots</option><option>diagonal</option><option>glow</option><option>off</option>
      </select></div>
      <div><label for="ac">Accent override</label><input id="ac" placeholder="#2dd4bf" /></div>
    </div>
    <div>
      <img id="preview" class="preview" alt="Live preview of the generated card" />
      <pre class="out" id="url"></pre>
    </div>
  </div>

  <h2>Routes</h2>
  <table>
    <tr><th>Route</th><th>Returns</th></tr>
    <tr><td>/v1/og.png</td><td>The rendered card. This is what og:image points at.</td></tr>
    <tr><td>/v1/og.svg</td><td>The same card as vector. Useful for checking layout, not for og:image, since no major crawler accepts SVG there.</td></tr>
    <tr><td>/v1/tags</td><td>JSON with the tag map, a ready to paste HTML block, and the absolute image URL.</td></tr>
    <tr><td>/v1/tags.html</td><td>Just the meta tag block as plain text.</td></tr>
    <tr><td>/v1/meta</td><td>Tags plus the resolved card spec, for build pipelines that want to log what was rendered.</td></tr>
    <tr><td>/v1/embed.js</td><td>The client configuration script. Reads <code>data-*</code> attributes off its own tag.</td></tr>
    <tr><td>/v1/themes</td><td>Available themes, templates, patterns, sizes and colour tokens.</td></tr>
    <tr><td>/health</td><td>Liveness.</td></tr>
  </table>

  <h2>Parameters</h2>
  <table>
    <tr><th>Param</th><th>Notes</th></tr>
    <tr><td>title</td><td>Headline. Falls back to site when absent.</td></tr>
    <tr><td>subtitle</td><td>Also accepted as description. Feeds og:description.</td></tr>
    <tr><td>site, author</td><td>Footer line. site also feeds og:site_name.</td></tr>
    <tr><td>stat</td><td>Repeatable, format Value|Label, up to four. Used by the stat template.</td></tr>
    <tr><td>date, meta</td><td>Byline detail for the article template, and the attribution line for quote.</td></tr>
    <tr><td>logo</td><td>https URL to a PNG, JPEG, GIF or SVG. Fetched, sized from its own header, and inlined. A logo that fails to load is dropped rather than failing the card.</td></tr>
    <tr><td>logoWidth</td><td>Display width in card pixels, 24 to 400. Height follows the intrinsic ratio.</td></tr>
    <tr><td>template</td><td>editorial, article, split, banner, quote, stat, minimal, code.</td></tr>
    <tr><td>theme</td><td>indigo, ink, violet, sunset, forest, mono, cream, paper, slate.</td></tr>
    <tr><td>pattern</td><td>grid, dots, diagonal, glow, off.</td></tr>
    <tr><td>bg, bgAlt, fg, muted, accent, rule</td><td>Hex overrides on top of the chosen theme.</td></tr>
    <tr><td>size</td><td>og, square, wide, linkedin, story. Or pass w and h.</td></tr>
    <tr><td>scale</td><td>1 or 2. Renders at 2x for retina, tags report the scaled size.</td></tr>
    <tr><td>align</td><td>left or center.</td></tr>
    <tr><td>url, type, locale, card, twitter, alt</td><td>Markup only. These never fragment the image cache.</td></tr>
  </table>

  <h2>Use it</h2>
  <pre>&lt;meta property="og:image" content="${origin}/v1/og.png?title=Hello&amp;theme=indigo" /&gt;</pre>
  <p>Or let the service write the whole block:</p>
  <pre>curl -s "${origin}/v1/tags.html?title=Hello&amp;site=example.com&amp;url=https://example.com/"</pre>

  <h2>The design system</h2>
  <p>Type is a modular scale of seven steps, <code>44 55 69 86 107 134 168</code>, a 1.25 ratio applied to a base of 44. The base is the legibility floor rather than a chosen body size: a link preview in a message thread renders around 300 points wide, close to a quarter of the card, so 44 pixels is 11.7 point where it actually gets read.</p>
  <p>Long headlines step down the scale rather than being multiplied by a factor, and a headline paired with a deck drops one further step. Display headlines stop at 86 and clamp with an ellipsis from there, because a truncated headline someone can read beats a complete one they cannot. There are no label elements, no eyebrow and no chip, since both competed for space with the only thing anyone reads at that size.</p>
  <p>Space is an 8 point grid, one page margin on all four sides. Every value a template uses is recorded and checked: the build fails if a size is not a step on the scale, if a space is not a whole grid unit, if anything reads below 11 point at preview scale, or if any template overflows its own card.</p>

  <h2>Configure from a script tag</h2>
  <p>Drop one tag, set the brand once, and every page under it gets a card. Anything you leave out is read off the page: headline from the h1 or title, description from the meta description, URL from the canonical.</p>
  <pre>&lt;script src="${origin}/v1/embed.js"
        data-theme="indigo"
        data-template="article"
        data-accent="#2dd4bf"
        data-logo="https://example.com/logo.svg"
        data-site="example.com"&gt;&lt;/script&gt;</pre>
  <p>Every query parameter above works as a <code>data-</code> attribute, hyphenated: <code>data-logo-width</code>, <code>data-bg-alt</code>. Repeatable stats go in one attribute, comma separated: <code>data-stats="312%|Sessions,1.4s|LCP"</code>. Call <code>window.ogcdn.refresh({ title: 'New' })</code> after a client side route change.</p>
  <p><strong>Read this before relying on it.</strong> Social crawlers do not execute JavaScript. Facebook, LinkedIn, X, Slack and iMessage parse the raw HTML response, so tags injected by this script are invisible to them. Use it for previewing a configuration and for consumers that do render. For crawlers, feed the same attributes to a build step (<code>examples/inject-tags.mjs</code>) or to the edge rewriter (<code>examples/edge-inject.js</code>), which reads this exact attribute vocabulary out of the page and emits real server side tags.</p>

  <h2>Caching</h2>
  <p>Images are immutable for a year and keyed on the sorted image parameters, so parameter order never splits the cache. Markup only parameters are excluded from that key. Changing any visual parameter produces a different URL and therefore a new render.</p>

<script>
  var ids = ['t','s','si','lg','tpl','th','pt','ac'];
  function update() {
    var p = new URLSearchParams();
    var title = document.getElementById('t').value;
    var sub = document.getElementById('s').value;
    var site = document.getElementById('si').value;
    if (title) p.set('title', title);
    if (sub) p.set('subtitle', sub);
    if (site) p.set('site', site);
    var logo = document.getElementById('lg').value;
    var accent = document.getElementById('ac').value;
    if (logo) p.set('logo', logo);
    if (accent) p.set('accent', accent);
    p.set('template', document.getElementById('tpl').value);
    p.set('theme', document.getElementById('th').value);
    p.set('pattern', document.getElementById('pt').value);
    if (document.getElementById('tpl').value === 'stat') {
      p.append('stat', '312%|Organic sessions');
      p.append('stat', '1.4s|LCP');
      p.append('stat', '98|Pages fixed');
    }
    var u = '/v1/og.png?' + p.toString();
    document.getElementById('preview').src = u;
    document.getElementById('url').textContent = '${origin}' + u;
  }
  ids.forEach(function (id) {
    var el = document.getElementById(id);
    el.addEventListener('input', update);
    el.addEventListener('change', update);
  });
  update();
</script>
</div>
</body>
</html>`;
}
