/** Small response helpers. JSON everywhere, explicit cache policy on every response. */

const BASE_HEADERS = {
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
    'access-control-allow-origin': '*'
};

export function json(data, { status = 200, maxAge = 0, headers = {} } = {}) {
    const cache = maxAge > 0 ? `public, max-age=${maxAge}` : 'no-store';
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...BASE_HEADERS, 'cache-control': cache, ...headers }
    });
}

export function error(status, code, message) {
    return json({ error: { code, message } }, { status });
}

export function redirect(location, status = 302) {
    return new Response(null, { status, headers: { location, 'cache-control': 'no-store' } });
}

/** Wrap a read handler with the edge cache (per-colo) for `seconds`. */
export async function edgeCached(request, ctx, seconds, produce) {
    const cache = caches.default;
    const key = new Request(new URL(request.url).toString(), { method: 'GET' });
    const hit = await cache.match(key);
    if (hit) return hit;
    const res = await produce();
    if (res.status === 200) ctx.waitUntil(cache.put(key, res.clone()));
    return res;
}
