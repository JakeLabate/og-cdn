/**
 * Edge injection.
 *
 * The embed script is convenient but client side, and no social crawler runs
 * JavaScript. This worker closes that gap: it sits in front of an origin,
 * reads the same `data-*` attributes off the og-cdn script tag already in the
 * page, and rewrites the head with real tags before the response leaves the
 * edge. The page keeps one line of configuration, and crawlers get server
 * rendered markup.
 *
 * Deploy as its own worker on a route covering the site:
 *
 *   [[routes]]
 *   pattern = "example.com/*"
 *   zone_name = "example.com"
 *
 *   [vars]
 *   OG_SERVICE = "https://cdn.example.com/open-graph"
 *
 * If you would rather not add a script tag to the page at all, set
 * OG_DEFAULTS to a query string and every page gets the same brand config
 * with title and description derived from the page itself.
 */

const OG_TAG_PATTERN = /^(og:|twitter:|article:)/;

class ConfigCollector {
  constructor() {
    this.config = null;
    this.title = '';
    this.description = '';
    this.canonical = '';
    this.inTitle = false;
  }

  element(el) {
    const tag = el.tagName;

    if (tag === 'script') {
      const src = el.getAttribute('src') || '';
      if (src.includes('/v1/embed.js')) {
        // HTMLRewriter exposes attributes as an iterator, not a dataset.
        const cfg = {};
        for (const [name, value] of el.attributes) {
          if (!name.startsWith('data-')) continue;
          const key = name
            .slice(5)
            .replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          if (value) cfg[key] = value;
        }
        this.config = cfg;
        // The tags are now server side, so the client script is dead weight.
        el.remove();
      }
      return;
    }

    if (tag === 'title') {
      this.inTitle = true;
      return;
    }

    if (tag === 'link' && (el.getAttribute('rel') || '').toLowerCase() === 'canonical') {
      this.canonical = el.getAttribute('href') || '';
      return;
    }

    if (tag === 'meta') {
      const name = (el.getAttribute('name') || '').toLowerCase();
      const property = (el.getAttribute('property') || '').toLowerCase();
      if (name === 'description' && !this.description) {
        this.description = el.getAttribute('content') || '';
      }
      // Strip whatever was there so the injected block is the only source.
      if (OG_TAG_PATTERN.test(property) || OG_TAG_PATTERN.test(name)) el.remove();
    }
  }

  text(chunk) {
    if (this.inTitle) {
      this.title += chunk.text;
      if (chunk.lastInTextNode) this.inTitle = false;
    }
  }
}

function buildQuery(config, collector, pageUrl, defaults) {
  const params = new URLSearchParams(defaults || '');
  for (const [k, v] of Object.entries(config || {})) {
    if (k === 'auto' || k === 'stats') continue;
    params.set(k, v);
  }
  if (config && config.stats) {
    for (const s of config.stats.split(',')) {
      if (s.trim()) params.append('stat', s.trim());
    }
  }
  if (!params.get('title') && collector.title) params.set('title', collector.title.trim());
  if (!params.get('description') && !params.get('subtitle') && collector.description) {
    params.set('description', collector.description);
  }
  if (!params.get('url')) params.set('url', collector.canonical || pageUrl);
  if (!params.get('site')) params.set('site', new URL(pageUrl).hostname);
  return params;
}

export default {
  async fetch(request, env, ctx) {
    const response = await fetch(request);
    const type = response.headers.get('content-type') || '';
    if (!type.includes('text/html')) return response;

    const service = (env.OG_SERVICE || '').replace(/\/$/, '');
    if (!service) return response;

    // First pass reads the page. Buffering is required because the tags to
    // inject depend on a script tag that may appear after the injection point.
    const collector = new ConfigCollector();
    const scanned = new HTMLRewriter()
      .on('script', collector)
      .on('title', collector)
      .on('link', collector)
      .on('meta', collector)
      .transform(response.clone());
    const html = await scanned.text();

    if (!collector.config && !env.OG_DEFAULTS) {
      return new Response(html, response);
    }

    const params = buildQuery(collector.config, collector, request.url, env.OG_DEFAULTS);

    let block = '';
    try {
      const res = await fetch(`${service}/v1/tags.html?${params}`, {
        cf: { cacheTtl: 3600, cacheEverything: true },
      });
      if (res.ok) block = await res.text();
    } catch {
      // An unreachable tag service must not take the page down with it.
      block = '';
    }
    if (!block) return new Response(html, response);

    const out = html.replace(/<\/head>/i, `${block}</head>`);
    return new Response(out, {
      status: response.status,
      headers: response.headers,
    });
  },
};
