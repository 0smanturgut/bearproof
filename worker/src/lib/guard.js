/** Abuse guards: rate limits and Cloudflare Turnstile. The client IP is only ever used hashed or in flight. */

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export function clientIp(request) {
    return request.headers.get('cf-connecting-ip') || '';
}

/** Hex SHA-256 of a static prefix + the IP. Used as a rate-limit key, never stored. */
export async function ipKey(ip) {
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(`bearproof-rl-v1:${ip}`)
    );
    return [...new Uint8Array(digest).slice(0, 16)]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

/** True when every key is under its limit. A missing or failing limiter fails open. */
export async function underLimit(limiter, ...keys) {
    if (!limiter) return true;
    for (const key of keys) {
        try {
            const { success } = await limiter.limit({ key });
            if (!success) return false;
        } catch (err) {
            console.warn('[ratelimit]', err?.message || err);
        }
    }
    return true;
}

/**
 * Verify a Turnstile token. Returns 'skipped' when no secret is configured, 'none' when the client sent no
 * token (the widget wanted a tap that never came, or didn't load), 'passed', 'failed' for a token
 * Cloudflare rejects, or 'unavailable' when siteverify can't be reached. Only 'passed' runs can win prizes;
 * 'skipped' and 'none' runs still rank, so a player who missed the checkbox doesn't lose their run.
 */
export async function verifyTurnstile(env, token, ip) {
    if (!env.TURNSTILE_SECRET) return 'skipped';
    if (!token) return 'none';
    const form = new FormData();
    form.append('secret', env.TURNSTILE_SECRET);
    form.append('response', token);
    if (ip) form.append('remoteip', ip);
    try {
        const res = await fetch(SITEVERIFY, { method: 'POST', body: form });
        if (!res.ok) return 'unavailable';
        const out = await res.json();
        return out.success ? 'passed' : 'failed';
    } catch (err) {
        console.warn('[turnstile]', err?.message || err);
        return 'unavailable';
    }
}
