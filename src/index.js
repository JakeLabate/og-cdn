/**
 * og-cdn worker entry.
 *
 * GET /v1/og.png     the image itself, the thing og:image points at
 * GET /v1/og.svg     same card as vector, useful for debugging layout
 * GET /v1/tags       JSON: the tag list, an HTML block, and the image URL
 * GET /v1/tags.html  the same HTML block on its own, ready to paste in head
 * GET /v1/meta       tags plus the resolved card spec, for build pipelines
 * GET /v1/themes     the available themes, templates and sizes
 * GET /health        liveness
 * GET /              docs and a live playground
 */

import yogaWasm from './vendor/yoga.wasm';
import resvgWasm from './vendor/resvg.wasm';

import spaceGroteskBold from '../fonts/SpaceGrotesk-Bold.ttf';
import plexSansRegular from '../fonts/IBMPlexSans-Regular.ttf';
import plexMonoMedium from '../fonts/IBMPlexMono-Medium.ttf';

import { initRuntime, render } from './render.js';
import { canonicalQuery, parseMeta, parseSpec } from './params.js';
import { buildTags, tagsToHtml, tagsToObject } from './tags.js';
import { signQuery, verifyQuery } from './sign.js';
import { PATTERNS, SIZES, TEMPLATES, THEMES } from './theme.js';
import { resolveLogo } from './assets.js';
import { docsPage } from './docs.js';
import { embedScript } from './embed.js';
import { resolveBase, routePath } from './routing.js';

const FONTS = [
  { name: 'Space Grotesk', data: spaceGroteskBold, weight: 700, style: 'normal' },
  { name: 'IBM Plex Sans', data: plexSansRegular, weight: 400, style: 'normal' },
  { name: 'IBM Plex Mono', data: plexMonoMedium, weight: 500, style: 'normal' },
];

const IMAGE_MAX_AGE = 60 * 60 * 24 * 365;
const TAGS_MAX_AGE = 60 * 60 * 24;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${TAGS_MAX_AGE}`,
      ...CORS,
      ...extra,
    },
  });
}

function fail(status, message, hint) {
  return json({ error: message, hint }, status, { 'cache-control': 'no-store' });
}



/**
 * Params that affect the picture. Everything else (url, type, locale, card)
 * only affects the markup, and must not fragment the image cache.
 */
const IMAGE_PARAMS = new Set([
  'title', 'subtitle', 'description', 'site', 'author',
  'stat', 'date', 'meta', 'theme', 'template', 'size', 'w', 'h', 'scale',
  'align', 'pattern', 'bg', 'bgAlt', 'fg', 'muted', 'accent', 'rule',
  'logo', 'logoWidth',
]);

function imageParams(searchParams) {
  const out = new URLSearchParams();
  for (const [k, v] of searchParams.entries()) {
    if (IMAGE_PARAMS.has(k)) out.append(k, v);
  }
  return out;
}

async function buildImageUrl(base, env, searchParams, ext = 'png') {
  const params = imageParams(searchParams);
  const canonical = canonicalQuery(params);
  const target = `${base}/v1/og.${ext}`;
  if (!env.SIGNING_KEY) return canonical ? `${target}?${canonical}` : target;
  const sig = await signQuery(canonical, env.SIGNING_KEY);
  return `${target}?${canonical}&sig=${sig}`;
}

async function handleImage(request, env, ctx, url, ext, prefix) {
  const canonical = canonicalQuery(imageParams(url.searchParams));

  if (env.SIGNING_KEY) {
    const ok = await verifyQuery(canonical, url.searchParams.get('sig'), env.SIGNING_KEY);
    if (!ok) {
      return fail(403, 'invalid or missing signature', 'Generate URLs via /v1/tags so they are signed for you.');
    }
  }

  const cache = caches.default;
  // The prefix is part of the key. One worker can be mounted at more than one
  // path, and two mounts must not serve each other's renders.
  const cacheKey = new Request(
    `${new URL(request.url).origin}${prefix}/v1/og.${ext}?${canonical}`,
    { method: 'GET' }
  );
  const hit = await cache.match(cacheKey);
  if (hit) {
    const res = new Response(hit.body, hit);
    res.headers.set('x-og-cache', 'HIT');
    return res;
  }

  const spec = parseSpec(new URLSearchParams(canonical));
  spec.format = ext === 'svg' ? 'svg' : 'png';

  // A logo that cannot be fetched leaves spec.logo null and the card renders
  // without it. A broken mark must never cost the whole preview.
  const [logo] = await Promise.all([
    resolveLogo(spec.logoUrl, spec.logoWidth, env),
    initRuntime({ yogaWasm, resvgWasm, fonts: FONTS }),
  ]);
  spec.logo = logo;

  let out;
  try {
    out = await render(spec);
  } catch (err) {
    return fail(500, 'render failed', String(err && err.message ? err.message : err));
  }

  const response = new Response(out.body, {
    headers: {
      'content-type': out.contentType,
      'cache-control': `public, max-age=${IMAGE_MAX_AGE}, immutable`,
      'x-og-cache': 'MISS',
      'x-og-template': spec.template,
      'x-og-theme': spec.themeName,
      'x-og-logo': spec.logoUrl ? (spec.logo ? 'loaded' : 'failed') : 'none',
      ...CORS,
    },
  });

  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

async function handleTags(base, env, url, mode) {
  const meta = parseMeta(url.searchParams);
  const spec = parseSpec(url.searchParams);
  const imageUrl = await buildImageUrl(base, env, url.searchParams, 'png');

  const image = {
    url: imageUrl,
    width: spec.width * spec.scale,
    height: spec.height * spec.scale,
    type: 'image/png',
    alt: meta.alt || meta.title || spec.title,
  };

  const tags = buildTags({ ...meta, title: meta.title || spec.title }, image);
  const html = tagsToHtml(tags);

  if (mode === 'html') {
    return new Response(html + '\n', {
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': `public, max-age=${TAGS_MAX_AGE}`,
        ...CORS,
      },
    });
  }

  const payload = { image, tags: tagsToObject(tags), html };
  if (mode === 'meta') {
    payload.spec = {
      template: spec.template,
      theme: spec.themeName,
      width: spec.width,
      height: spec.height,
      scale: spec.scale,
      tokens: spec.tokens,
      title: spec.title,
      subtitle: spec.subtitle,
      stats: spec.stats,
      date: spec.date,
      meta: spec.meta,
      logo: spec.logoUrl ? (spec.logo ? 'loaded' : 'failed') : 'none',
    };
    payload.signed = Boolean(env.SIGNING_KEY);
  }
  return json(payload);
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return fail(405, 'method not allowed', 'This service is read only.');
    }

    const url = new URL(request.url);
    const { base, prefix } = resolveBase(request.url, env);
    const path = routePath(url.pathname, prefix);

    if (path === null) {
      return fail(404, 'not mounted here', `This service is mounted at ${prefix || '/'}.`);
    }

    try {
      switch (path) {
        case '/':
          return new Response(docsPage(base), {
            headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' },
          });

        case '/health':
          return json({
            ok: true,
            service: 'og-cdn',
            base,
            time: new Date().toISOString(),
          });

        case '/v1/og.png':
          return handleImage(request, env, ctx, url, 'png', prefix);

        case '/v1/og.svg':
          return handleImage(request, env, ctx, url, 'svg', prefix);

        case '/v1/tags':
          return handleTags(base, env, url, 'tags');

        case '/v1/tags.html':
          return handleTags(base, env, url, 'html');

        case '/v1/meta':
          return handleTags(base, env, url, 'meta');

        case '/v1/embed.js':
          return new Response(
            embedScript(base, { signed: Boolean(env.SIGNING_KEY) }),
            {
              headers: {
                'content-type': 'text/javascript; charset=utf-8',
                'cache-control': 'public, max-age=3600',
                ...CORS,
              },
            }
          );

        case '/v1/themes':
          return json({
            themes: Object.keys(THEMES),
            templates: TEMPLATES,
            patterns: PATTERNS,
            sizes: SIZES,
            tokens: THEMES,
          });

        default:
          return fail(404, 'no such route', `See ${base}/ for the route list.`);
      }
    } catch (err) {
      return fail(500, 'unhandled error', String(err && err.message ? err.message : err));
    }
  },
};
