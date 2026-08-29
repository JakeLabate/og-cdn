/**
 * The script tag configuration surface.
 *
 * A page drops one tag, sets its brand once as data attributes, and every
 * page under it gets a card without touching the head by hand:
 *
 *   <script src="https://og.example.com/v1/embed.js"
 *           data-theme="indigo"
 *           data-accent="#2dd4bf"
 *           data-logo="https://example.com/logo.svg"
 *           data-site="example.com"
 *           data-template="article"></script>
 *
 * Read this before you rely on it: social crawlers do not execute JavaScript.
 * Facebook, LinkedIn, X, Slack and iMessage all parse the raw HTML response,
 * so tags injected here are invisible to them. This script is for previewing a
 * configuration, for client rendered apps whose route changes need the head
 * kept in sync, and for consumers that do render. For crawlers, feed the same
 * attributes to a build step (examples/inject-tags.mjs) or to the edge
 * rewriter (examples/edge-inject.js), both of which read this exact attribute
 * vocabulary and emit real server side tags.
 */

const VISUAL_KEYS = [
  'title', 'subtitle', 'description', 'badge', 'site', 'author',
  'template', 'theme', 'size', 'w', 'h', 'scale', 'align', 'pattern',
  'bg', 'bgAlt', 'fg', 'muted', 'accent', 'rule', 'logo', 'logoWidth',
  'date', 'meta',
];

const META_KEYS = ['url', 'type', 'locale', 'card', 'twitter', 'alt'];

export function embedScript(origin, { signed = false } = {}) {
  return `/* og-cdn embed. Configure with data attributes on the script tag. */
(function () {
  'use strict';

  var ORIGIN = ${JSON.stringify(origin)};
  var SIGNED = ${signed ? 'true' : 'false'};
  var VISUAL = ${JSON.stringify(VISUAL_KEYS)};
  var META = ${JSON.stringify(META_KEYS)};

  var script =
    document.currentScript ||
    (function () {
      var all = document.getElementsByTagName('script');
      for (var i = all.length - 1; i >= 0; i--) {
        if ((all[i].src || '').indexOf('/v1/embed.js') !== -1) return all[i];
      }
      return null;
    })();

  function attrs(el) {
    var out = {};
    if (!el || !el.dataset) return out;
    for (var key in el.dataset) {
      var v = el.dataset[key];
      if (v != null && String(v).length) out[key] = String(v);
    }
    return out;
  }

  function textOf(sel) {
    var el = document.querySelector(sel);
    if (!el) return '';
    return (el.content || el.textContent || '').replace(/\\s+/g, ' ').trim();
  }

  /* Anything not given explicitly is read off the page, so a single site wide
     tag produces a correct per page card without per page configuration. */
  function derive(cfg) {
    var out = {};
    for (var k in cfg) out[k] = cfg[k];
    if (out.auto === 'off') return out;

    if (!out.title) {
      out.title = textOf('meta[property="og:title"]') || textOf('h1') || document.title || '';
    }
    if (!out.subtitle && !out.description) {
      out.description =
        textOf('meta[property="og:description"]') || textOf('meta[name="description"]') || '';
    }
    if (!out.url) {
      var canonical = document.querySelector('link[rel="canonical"]');
      out.url = (canonical && canonical.href) || location.href.split('#')[0];
    }
    if (!out.site) {
      out.site = textOf('meta[property="og:site_name"]') || location.hostname;
    }
    return out;
  }

  function query(cfg, keys) {
    var p = new URLSearchParams();
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (cfg[k]) p.set(k, cfg[k]);
    }
    /* Repeatable stats arrive as data-stats="a|b,c|d". */
    if (cfg.stats) {
      cfg.stats.split(',').forEach(function (s) {
        if (s.trim()) p.append('stat', s.trim());
      });
    }
    return p;
  }

  function upsert(kind, key, value) {
    if (!value) return;
    var sel = 'meta[' + kind + '="' + key.replace(/"/g, '\\\\"') + '"]';
    var el = document.head.querySelector(sel);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(kind, key);
      document.head.appendChild(el);
    }
    el.setAttribute('content', value);
    el.setAttribute('data-og-cdn', '');
  }

  function applyMap(map) {
    for (var key in map) {
      upsert(key.indexOf('twitter:') === 0 ? 'name' : 'property', key, map[key]);
    }
  }

  /* Local path: build the tags in the browser, no network call. */
  function applyLocal(cfg, imageUrl) {
    var title = cfg.title || cfg.site || '';
    var description = cfg.subtitle || cfg.description || '';
    var w = cfg.w || (cfg.size ? '' : '1200');
    var hgt = cfg.h || (cfg.size ? '' : '630');
    var scale = parseInt(cfg.scale || '1', 10) || 1;

    var map = {
      'og:type': cfg.type || 'website',
      'og:title': title,
      'og:description': description,
      'og:url': cfg.url || '',
      'og:site_name': cfg.site || '',
      'og:locale': cfg.locale || 'en_US',
      'og:image': imageUrl,
      'og:image:secure_url': imageUrl.indexOf('https:') === 0 ? imageUrl : '',
      'og:image:type': 'image/png',
      'og:image:alt': cfg.alt || title,
      'twitter:card': cfg.card === 'summary' ? 'summary' : 'summary_large_image',
      'twitter:title': title,
      'twitter:description': description,
      'twitter:image': imageUrl,
      'twitter:image:alt': cfg.alt || title,
      'twitter:site': cfg.twitter || ''
    };
    if (w) map['og:image:width'] = String(parseInt(w, 10) * scale);
    if (hgt) map['og:image:height'] = String(parseInt(hgt, 10) * scale);
    applyMap(map);
    return map;
  }

  /* Signed path: only the worker can mint a valid sig, so ask it. */
  function applyRemote(cfg) {
    var all = query(cfg, VISUAL.concat(META));
    return fetch(ORIGIN + '/v1/tags?' + all.toString())
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data) return null;
        applyMap(data.tags);
        api.imageUrl = data.image.url;
        api.tags = data.tags;
        return data;
      })
      .catch(function () { return null; });
  }

  var api = { config: {}, imageUrl: '', tags: {}, refresh: refresh, origin: ORIGIN };

  function refresh(overrides) {
    var cfg = derive(attrs(script));
    if (overrides) for (var k in overrides) cfg[k] = overrides[k];
    api.config = cfg;

    if (SIGNED) return applyRemote(cfg);

    var url = ORIGIN + '/v1/og.png?' + query(cfg, VISUAL).toString();
    api.imageUrl = url;
    api.tags = applyLocal(cfg, url);
    return Promise.resolve(api);
  }

  window.ogcdn = api;
  refresh();
})();
`;
}
