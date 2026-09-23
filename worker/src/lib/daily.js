/**
 * Daily challenge helpers. The seed is an HMAC of the date under a server secret, so nobody can
 * pre-compute tomorrow's run before it is revealed at 00:00 UTC.
 */

export const STAGES = ['forest', 'crypt', 'tundra'];

/** 'YYYY-MM-DD' for a UTC timestamp. */
export function utcDate(ms) {
    return new Date(ms).toISOString().slice(0, 10);
}

export function isDateKey(s) {
    return (
        typeof s === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(s) &&
        Number.isFinite(Date.parse(`${s}T00:00:00Z`))
    );
}

/** Milliseconds of the next 00:00 UTC after `ms`. */
export function nextUtcMidnight(ms) {
    const d = new Date(ms);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

/** uint32 seed = first 4 bytes of HMAC-SHA256(salt, "daily:" + date). Never 0. */
export async function dailySeed(dateStr, salt) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        enc.encode(salt),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const sig = new Uint8Array(
        await crypto.subtle.sign('HMAC', key, enc.encode(`daily:${dateStr}`))
    );
    const seed = ((sig[0] << 24) | (sig[1] << 16) | (sig[2] << 8) | sig[3]) >>> 0;
    return seed || 1;
}

/** Stage rotation derived from the seed (the game can also ignore this if a build has one stage). */
export function stageForSeed(seed, stages = STAGES) {
    return stages[seed % stages.length];
}

/** 1-based day counter: the project start date is Day 1. */
export function dayNumber(startDate, nowMs) {
    const start = Date.parse(`${startDate}T00:00:00Z`);
    if (!Number.isFinite(start)) return null;
    return Math.max(1, Math.floor((nowMs - start) / 86400000) + 1);
}
