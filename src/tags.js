/**
 * Tag generation.
 *
 * The service returns the picture and the markup that points at it, because
 * shipping one without the other is where most OG implementations break. The
 * image URL emitted here is always absolute, since relative og:image values
 * are the single most common cause of a blank share preview.
 */

const ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeAttr(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ESCAPE[c]);
}

/**
 * @param {object} meta parsed page metadata
 * @param {object} image { url, width, height, alt, type }
 * @returns {Array<{ kind: 'property'|'name', key: string, value: string }>}
 */
export function buildTags(meta, image) {
  const tags = [];
  const prop = (key, value) => value && tags.push({ kind: 'property', key, value });
  const name = (key, value) => value && tags.push({ kind: 'name', key, value });

  prop('og:type', meta.type);
  prop('og:title', meta.title);
  prop('og:description', meta.description);
  prop('og:url', meta.url);
  prop('og:site_name', meta.siteName);
  prop('og:locale', meta.locale);

  prop('og:image', image.url);
  prop('og:image:secure_url', image.url.startsWith('https:') ? image.url : '');
  prop('og:image:type', image.type);
  prop('og:image:width', String(image.width));
  prop('og:image:height', String(image.height));
  prop('og:image:alt', image.alt);

  if (meta.type === 'article' && meta.author) {
    prop('article:author', meta.author);
  }

  name('twitter:card', meta.twitterCard);
  name('twitter:title', meta.title);
  name('twitter:description', meta.description);
  name('twitter:image', image.url);
  name('twitter:image:alt', image.alt);
  name('twitter:site', meta.twitterSite);

  return tags;
}

export function tagsToHtml(tags, { indent = '' } = {}) {
  return tags
    .map(
      (t) =>
        `${indent}<meta ${t.kind}="${escapeAttr(t.key)}" content="${escapeAttr(t.value)}" />`
    )
    .join('\n');
}

export function tagsToObject(tags) {
  const out = {};
  for (const t of tags) out[t.key] = t.value;
  return out;
}
