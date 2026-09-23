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

/** `extra` adds machine-readable detail, e.g. `{ field: 'claimed.score' }` for a validation error. */
export function error(status, code, message, extra = {}) {
    return json({ error: { code, message, ...extra } }, { status });
}

export function redirect(location, status = 302) {
    return new Response(null, { status, headers: { location, 'cache-control': 'no-store' } });
}

/**
 * Read a JSON body of at most `maxBytes`, streaming so an oversized body is cut off early (a missing or
 * lying Content-Length can't get past the cap). Returns `{ data }` or `{ error: Response }`.
 */
export async function readJson(request, maxBytes) {
    const tooLarge = () => ({
        error: error(413, 'too_large', `Request body is larger than ${maxBytes} bytes.`)
    });
    if (Number(request.headers.get('content-length') || 0) > maxBytes) return tooLarge();
    const chunks = [];
    let size = 0;
    if (request.body) {
        const reader = request.body.getReader();
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > maxBytes) {
                await reader.cancel();
                return tooLarge();
            }
            chunks.push(value);
        }
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const c of chunks) {
        bytes.set(c, offset);
        offset += c.byteLength;
    }
    try {
        return { data: JSON.parse(new TextDecoder().decode(bytes)) };
    } catch {
        return { error: error(400, 'invalid_json', 'Body must be valid JSON.') };
    }
}

/**
 * Wrap a read handler with the edge cache (per-colo) for `seconds`. `keyUrl` overrides the cache key, so
 * junk query strings can't be used to skip the cache.
 *
 * A Cache API hit comes back with the zone's Browser Cache TTL (4 h) in place of our Cache-Control, which
 * would freeze live numbers in browsers for hours. So the original header travels with the cached copy
 * (x-origin-cache-control) and is put back on every hit.
 */
export async function edgeCached(request, ctx, seconds, produce, keyUrl = null) {
    const cache = caches.default;
    const key = new Request(keyUrl || new URL(request.url).toString(), { method: 'GET' });
    const hit = await cache.match(key);
    if (hit) {
        const out = new Response(hit.body, hit);
        out.headers.set(
            'cache-control',
            hit.headers.get('x-origin-cache-control') || `public, max-age=${seconds}`
        );
        out.headers.delete('x-origin-cache-control');
        return out;
    }
    const res = await produce();
    if (res.status === 200) {
        const stored = new Response(res.clone().body, res);
        stored.headers.set(
            'x-origin-cache-control',
            res.headers.get('cache-control') || `public, max-age=${seconds}`
        );
        ctx.waitUntil(cache.put(key, stored));
    }
    return res;
}
