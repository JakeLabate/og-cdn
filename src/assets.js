/**
 * Remote asset resolution for logos.
 *
 * This is the one place the service reaches out to a URL a stranger supplied,
 * so it is the one place that needs real guards. Every fetch is https only,
 * capped in size, capped in time, restricted by content type, and optionally
 * restricted by host. Anything that fails returns null and the card renders
 * without a logo rather than erroring, because a missing mark is a much better
 * outcome than a missing share preview.
 */

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 3000;
const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/svg+xml',
  'image/gif',
]);

// Resolved logos are reused across requests in the same isolate. Keyed on URL,
// bounded so a spray of distinct URLs cannot grow it without limit.
const memo = new Map();
const MEMO_MAX = 64;

function memoSet(key, value) {
  if (memo.size >= MEMO_MAX) memo.delete(memo.keys().next().value);
  memo.set(key, value);
  return value;
}

/** Hosts that must never be fetched, since the worker sits inside a network. */
const BLOCKED_HOST = /^(localhost$|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|.*\.internal$|.*\.local$)/i;

function allowed(url, env) {
  if (url.protocol !== 'https:') return false;
  if (BLOCKED_HOST.test(url.hostname)) return false;
  const list = (env && env.LOGO_ALLOWED_HOSTS) || '';
  if (!list.trim()) return true;
  const hosts = list.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
  return hosts.some((h) => url.hostname === h || url.hostname.endsWith('.' + h));
}

function base64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Intrinsic dimensions, read from the file itself.
 *
 * Satori will guess when an image has no explicit size, and a guess that comes
 * out wrong distorts the mark. Reading the header is cheap and exact.
 */
export function imageSize(bytes, contentType) {
  if (contentType.includes('svg')) {
    const head = new TextDecoder().decode(bytes.subarray(0, 2048));
    const vb = head.match(/viewBox\s*=\s*["']\s*[-\d.]+[,\s]+[-\d.]+[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
    if (vb) return { w: parseFloat(vb[1]), h: parseFloat(vb[2]) };
    const w = head.match(/\bwidth\s*=\s*["']([\d.]+)/i);
    const h = head.match(/\bheight\s*=\s*["']([\d.]+)/i);
    if (w && h) return { w: parseFloat(w[1]), h: parseFloat(h[1]) };
    return null;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // PNG: IHDR is always the first chunk, width and height at a fixed offset.
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    return { w: view.getUint32(16), h: view.getUint32(20) };
  }

  // GIF: little endian width and height in the logical screen descriptor.
  if (bytes.length > 10 && bytes[0] === 0x47 && bytes[1] === 0x49) {
    return { w: view.getUint16(6, true), h: view.getUint16(8, true) };
  }

  // JPEG: walk the segment chain to the start of frame marker.
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i < bytes.length - 9) {
      if (bytes[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = bytes[i + 1];
      const isFrame = marker >= 0xc0 && marker <= 0xcf &&
        marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrame) return { w: view.getUint16(i + 7), h: view.getUint16(i + 5) };
      i += 2 + view.getUint16(i + 2);
    }
  }

  return null;
}

/**
 * @returns {Promise<{src: string, width: number, height: number}|null>}
 */
export async function resolveLogo(rawUrl, displayWidth, env) {
  if (!rawUrl) return null;

  const key = `${rawUrl}|${displayWidth}`;
  if (memo.has(key)) return memo.get(key);

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return memoSet(key, null);
  }
  if (!allowed(url, env)) return memoSet(key, null);

  let res;
  try {
    res = await fetch(url.toString(), {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: 'image/*' },
      cf: { cacheTtl: 86400, cacheEverything: true },
    });
  } catch {
    return memoSet(key, null);
  }
  if (!res.ok) return memoSet(key, null);

  const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!ALLOWED_TYPES.has(type)) return memoSet(key, null);

  const declared = Number.parseInt(res.headers.get('content-length') || '', 10);
  if (Number.isFinite(declared) && declared > MAX_BYTES) return memoSet(key, null);

  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length === 0 || buf.length > MAX_BYTES) return memoSet(key, null);

  const natural = imageSize(buf, type);
  const ratio = natural && natural.w > 0 && natural.h > 0 ? natural.h / natural.w : 1;

  return memoSet(key, {
    src: `data:${type === 'image/jpg' ? 'image/jpeg' : type};base64,${base64(buf)}`,
    width: displayWidth,
    height: Math.max(1, Math.round(displayWidth * ratio)),
  });
}
