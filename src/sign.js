/**
 * Optional HMAC signing.
 *
 * A public image renderer is a free compute endpoint for anyone who finds it.
 * When SIGNING_KEY is set, every image request must carry a `sig` derived from
 * the canonical query string, so only URLs you generated will render.
 */

const encoder = new TextEncoder();
const keyCache = new Map();

async function getKey(secret) {
  let key = keyCache.get(secret);
  if (!key) {
    key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    keyCache.set(secret, key);
  }
  return key;
}

export async function signQuery(canonical, secret, length = 16) {
  const key = await getKey(secret);
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(canonical));
  return [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length);
}

/** Constant time compare, so a signature cannot be recovered byte by byte. */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyQuery(canonical, provided, secret) {
  if (!provided) return false;
  const expected = await signQuery(canonical, secret, provided.length);
  return safeEqual(expected, provided);
}
