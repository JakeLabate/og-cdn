/**
 * Where the service lives.
 *
 * The worker can be mounted at the root of a hostname or under a path on a
 * hostname that serves other things. Both cases need the same two answers:
 * which prefix to strip before routing, and which absolute base to write into
 * generated URLs.
 *
 * These are separate questions and conflating them is the usual bug. The
 * prefix a request arrives with is not necessarily the base you want in an
 * og:image tag, because a build box may hit the worker on its workers.dev
 * origin while the tag has to point at the public hostname.
 */

/** Normalise a path fragment to either '' or '/something' with no trailing slash. */
export function normalizePrefix(value) {
  const raw = String(value || '').trim();
  if (!raw || raw === '/') return '';
  return '/' + raw.replace(/^\/+/, '').replace(/\/+$/, '');
}

/**
 * Resolve the public base and the routing prefix.
 *
 * PUBLIC_BASE is the single setting that matters in production. Give it the
 * full absolute base, path included, and both answers come from it:
 *
 *   PUBLIC_BASE = "https://cdn.example.com/open-graph"
 *
 * BASE_PATH exists for the case where the hostname varies but the path does
 * not, such as a preview deployment.
 *
 * @returns {{ base: string, prefix: string, origin: string }}
 */
export function resolveBase(requestUrl, env = {}) {
  const url = new URL(requestUrl);
  const origin = `${url.protocol}//${url.host}`;

  if (env.PUBLIC_BASE) {
    try {
      const pub = new URL(env.PUBLIC_BASE);
      const prefix = normalizePrefix(pub.pathname);
      return {
        base: `${pub.protocol}//${pub.host}${prefix}`,
        prefix,
        origin: `${pub.protocol}//${pub.host}`,
      };
    } catch {
      // A malformed PUBLIC_BASE should not take the service down. Fall through
      // to the request origin and let the response reveal the misconfiguration.
    }
  }

  const prefix = normalizePrefix(env.BASE_PATH);
  return { base: `${origin}${prefix}`, prefix, origin };
}

/**
 * Strip the mount prefix from a request path.
 *
 * @returns {string|null} the route path, or null if the request did not arrive
 *   under the prefix at all.
 */
export function routePath(pathname, prefix) {
  let path = pathname;

  if (prefix) {
    if (path === prefix) return '/';
    if (!path.startsWith(prefix + '/')) return null;
    path = path.slice(prefix.length);
  }

  path = path.replace(/\/+$/, '');
  return path || '/';
}
