/**
 * Run submission helpers. Pure functions (no env, no DB) so every rule is unit-testable in Node.
 *
 * A submission is only a *claim*. It lands as `status='pending'` and the replay verifier decides later.
 * These checks just keep obviously impossible or malformed claims off the board.
 */

import { isDateKey, utcDate } from './daily.js';

export const MAX_BODY_BYTES = 400 * 1024;
export const MAX_LOG_BYTES = 256 * 1024;
export const MAX_RUN_MS = 30 * 60 * 1000;
export const MAX_SCORE = 50_000_000;
/** A daily run that ended just after 00:00 UTC may still be filed under yesterday for this long. */
export const DAILY_GRACE_MS = 15 * 60 * 1000;
/** Clock slack for the "started before the challenge existed" check. */
const START_SKEW_MS = 60 * 1000;
const DAY_MS = 86400000;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NAME = /^[A-Za-z0-9 _.-]{1,16}$/;
const STAGE = /^[a-z_]{1,24}$/;
const B64URL = /^[A-Za-z0-9_-]+$/;
export const RUN_ID = /^[0-9a-z]{17}$/;

export function isUuidV4(s) {
    return typeof s === 'string' && UUID_V4.test(s);
}

/** Display name: trimmed, inner spaces collapsed, 1-16 of [A-Za-z0-9 _.-]. Anything else is null. */
export function sanitizeName(raw) {
    if (typeof raw !== 'string') return null;
    const s = raw.trim().replace(/ {2,}/g, ' ');
    return NAME.test(s) ? s : null;
}

export function displayName(name, playerId) {
    return name || `anon-${String(playerId).slice(0, 4)}`;
}

/**
 * Sortable random id: 9 base36 chars of milliseconds + 8 random base36 chars (17 total). Lexical order
 * is creation order, and ~41 bits of randomness make same-millisecond collisions negligible.
 */
export function newId(nowMs = Date.now()) {
    const rnd = crypto.getRandomValues(new Uint32Array(8));
    let tail = '';
    for (const r of rnd) tail += (r % 36).toString(36);
    return nowMs.toString(36).padStart(9, '0') + tail;
}

/** base64url (no padding) → Uint8Array, or null if the string isn't valid base64url. */
export function decodeBase64Url(s) {
    if (typeof s !== 'string' || !B64URL.test(s) || s.length % 4 === 1) return null;
    try {
        const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    } catch {
        return null;
    }
}

/**
 * Where a daily challenge date stands at `nowMs`: 'open' (today), 'grace' (yesterday, within
 * DAILY_GRACE_MS of midnight), 'future', or 'closed'.
 */
export function challengeWindow(date, nowMs) {
    const today = utcDate(nowMs);
    if (date === today) return 'open';
    if (date > today) return 'future';
    const midnight = Date.parse(`${today}T00:00:00Z`);
    if (date === utcDate(midnight - DAY_MS) && nowMs - midnight <= DAILY_GRACE_MS) return 'grace';
    return 'closed';
}

function isInt(v, min, max = Number.MAX_SAFE_INTEGER) {
    return Number.isSafeInteger(v) && v >= min && v <= max;
}

function reject(status, code, message, field) {
    return { ok: false, status, code, message, ...(field ? { field } : {}) };
}

const bad = (field, rule) => reject(400, 'invalid_field', `\`${field}\` ${rule}.`, field);

/**
 * Validate a run submission body.
 * @param {any} body parsed JSON
 * @param {{ builds: Array<{n:number, activatesAt:string, revoked?:boolean}>, nowMs: number }} ctx
 * @returns {{ok:true, run:object} | {ok:false, status:number, code:string, message:string, field?:string}}
 */
export function validateRun(body, { builds, nowMs }) {
    if (!body || typeof body !== 'object' || Array.isArray(body))
        return reject(400, 'invalid_body', 'Body must be a JSON object.');
    if (body.v !== 1)
        return reject(400, 'unsupported_version', 'Only submission version 1 is supported.');

    if (!isUuidV4(body.playerId)) return bad('playerId', 'must be a UUID v4');
    if (body.mode !== 'daily' && body.mode !== 'free')
        return bad('mode', "must be 'daily' or 'free'");
    if (!isInt(body.build, 0)) return bad('build', 'must be a non-negative integer');
    if (!isInt(body.seed, 0, 0xffffffff)) return bad('seed', 'must be a uint32');
    if (typeof body.stage !== 'string' || !STAGE.test(body.stage))
        return bad('stage', 'must be 1-24 chars of [a-z_]');

    const c = body.claimed;
    if (!c || typeof c !== 'object') return bad('claimed', 'must be an object');
    if (!isInt(c.score, 0, MAX_SCORE))
        return bad('claimed.score', `must be an integer 0-${MAX_SCORE}`);
    if (!isInt(c.timeMs, 0, MAX_RUN_MS))
        return bad('claimed.timeMs', `must be an integer 0-${MAX_RUN_MS}`);
    if (!isInt(c.kills, 0)) return bad('claimed.kills', 'must be a non-negative integer');
    if (!isInt(c.level, 1)) return bad('claimed.level', 'must be a positive integer');
    if (!isInt(body.durationMs, 0)) return bad('durationMs', 'must be a non-negative integer');

    if (typeof body.log !== 'string' || body.log.length === 0)
        return bad('log', 'must be a non-empty base64url string');
    const logTooLarge = () =>
        reject(400, 'log_too_large', `Input log is larger than ${MAX_LOG_BYTES} bytes.`, 'log');
    if (body.log.length > Math.ceil((MAX_LOG_BYTES * 4) / 3)) return logTooLarge();
    const log = decodeBase64Url(body.log);
    if (!log || log.length === 0) return bad('log', 'must be a non-empty base64url string');
    if (log.length > MAX_LOG_BYTES) return logTooLarge();

    if (body.turnstileToken !== undefined && body.turnstileToken !== null) {
        if (typeof body.turnstileToken !== 'string' || body.turnstileToken.length > 2048)
            return bad('turnstileToken', 'must be a string of at most 2048 chars');
    }

    const build = builds.find((b) => b.n === body.build);
    if (!build || build.revoked || Date.parse(build.activatesAt) > nowMs)
        return reject(
            400,
            'unknown_build',
            `Build ${body.build} is not a live or past build.`,
            'build'
        );

    // Simulated time can't exceed the wall clock the run took (small tolerance for timer granularity).
    if (body.durationMs < c.timeMs * 0.97 - 2000)
        return reject(
            400,
            'implausible_run',
            'Run time exceeds the wall-clock duration.',
            'durationMs'
        );

    let challengeDate = null;
    if (body.mode === 'daily') {
        if (!isDateKey(body.challengeDate))
            return bad('challengeDate', 'must be YYYY-MM-DD for daily runs');
        const w = challengeWindow(body.challengeDate, nowMs);
        if (w === 'future') return reject(400, 'not_yet', 'That challenge has not started.');
        if (w === 'closed') return reject(400, 'challenge_closed', 'That challenge is closed.');
        // The seed is revealed at 00:00 UTC, so a run can't have started before that.
        const opensAt = Date.parse(`${body.challengeDate}T00:00:00Z`);
        if (nowMs - body.durationMs < opensAt - START_SKEW_MS)
            return reject(
                400,
                'implausible_run',
                'Run started before the challenge opened.',
                'durationMs'
            );
        challengeDate = body.challengeDate;
    }

    return {
        ok: true,
        run: {
            playerId: body.playerId.toLowerCase(),
            name: sanitizeName(body.name),
            mode: body.mode,
            challengeDate,
            build: body.build,
            seed: body.seed,
            stage: body.stage,
            score: c.score,
            timeMs: c.timeMs,
            kills: c.kills,
            level: c.level,
            durationMs: body.durationMs,
            log,
            turnstileToken: body.turnstileToken || null
        }
    };
}
