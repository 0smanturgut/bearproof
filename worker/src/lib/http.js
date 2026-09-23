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
