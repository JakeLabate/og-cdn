/**
 * Build step example.
 *
 * Walks a folder of HTML files, asks the service for the tag block that
 * matches each page, and splices it into the head. Run it after your site
 * builds and before you publish.
 *
 *   node examples/inject-tags.mjs ./dist https://og.example.com https://example.com
 *
 * Existing og: and twitter: tags are removed first, so the script is safe to
 * run repeatedly on the same output folder.
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const [, , distDir = './dist', service = 'http://localhost:8787', siteBase = ''] = process.argv;

const DEFAULTS = { theme: 'indigo', template: 'editorial', site: hostOf(siteBase) };

function hostOf(u) {
  try {
    return new URL(u).host;
  } catch {
    return '';
  }
}

function textOf(html, re) {
  const m = html.match(re);
  return m ? m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
}

async function* htmlFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(full);
    else if (entry.name.endsWith('.html')) yield full;
  }
}

function pageUrl(file) {
  if (!siteBase) return '';
  const rel = relative(distDir, file).split(sep).join('/');
  const path = rel.replace(/index\.html$/, '').replace(/\.html$/, '/');
  return new URL(path, siteBase.endsWith('/') ? siteBase : siteBase + '/').toString();
}

let count = 0;

for await (const file of htmlFiles(distDir)) {
  const html = await readFile(file, 'utf8');

  const title =
    textOf(html, /<meta\s+name="og-title"\s+content="([^"]*)"/i) ||
    textOf(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
    textOf(html, /<title[^>]*>([\s\S]*?)<\/title>/i);

  const description = textOf(html, /<meta\s+name="description"\s+content="([^"]*)"/i);

  if (!title) {
    console.warn('skip, no title found:', file);
    continue;
  }

  const params = new URLSearchParams({ ...DEFAULTS, title });
  if (description) params.set('description', description);
  const url = pageUrl(file);
  if (url) params.set('url', url);

  const res = await fetch(`${service}/v1/tags?${params}`);
  if (!res.ok) {
    console.error('tag request failed:', file, res.status, await res.text());
    continue;
  }
  const { html: block } = await res.json();

  const stripped = html.replace(
    /[ \t]*<meta\s+(?:property="og:[^"]*"|name="twitter:[^"]*")[^>]*>\s*\n?/gi,
    ''
  );

  if (!/<\/head>/i.test(stripped)) {
    console.warn('skip, no head element:', file);
    continue;
  }

  await writeFile(file, stripped.replace(/<\/head>/i, block + '\n</head>'), 'utf8');
  count++;
  console.log('tagged', relative(distDir, file));
}

console.log(`\n${count} file(s) updated`);
