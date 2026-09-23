/** D1 / KV access shared by the routes. */

import { buildForDate } from './builds.js';
import { dailySeed, stageForSeed, utcDate } from './daily.js';
import { error } from './http.js';

export async function buildOverride(env) {
    try {
        return (await env.CONFIG.get('build_override')) ?? null;
    } catch {
        return null;
    }
}

/** Query helper that turns "table missing / DB unavailable" into null instead of a 500. */
export async function first(env, sql, ...args) {
    try {
        return await env.DB.prepare(sql)
            .bind(...args)
            .first();
    } catch (err) {
        console.warn('[db]', err?.message || err);
        return null;
    }
}

/** Like `first`, for many rows. Returns null (not []) on failure so callers can't mistake it for "empty". */
export async function all(env, sql, ...args) {
    try {
        const { results } = await env.DB.prepare(sql)
            .bind(...args)
            .all();
        return results;
    } catch (err) {
        console.warn('[db]', err?.message || err);
        return null;
    }
}

const SELECT_DAILY = 'SELECT date, build, seed, stage FROM daily_challenges WHERE date = ?';

/**
 * The challenge for `date`, pinned on first request to the build that was live at 00:00 UTC. A pinned
 * row always wins, so a build that lands later that day never changes a running challenge.
 * @returns {Promise<{row: {date:string, build:number, seed:number, stage:string}} | {error: Response}>}
 */
export async function getOrCreateDaily(env, date, builds) {
    const now = Date.now();
    if (date > utcDate(now))
        return { error: error(403, 'not_yet', 'That challenge has not started.') };
    const pinned = await first(env, SELECT_DAILY, date);
    if (pinned) return { row: pinned };

    if (!env.DAILY_SEED_SALT)
        return { error: error(503, 'not_configured', 'Daily seed secret is not set.') };
    const build = buildForDate(builds, date, await buildOverride(env));
    if (!build) return { error: error(503, 'no_build', 'No build is live yet.') };
    const seed = await dailySeed(date, env.DAILY_SEED_SALT);
    const row = { date, build: build.n, seed, stage: stageForSeed(seed) };
    try {
        await env.DB.prepare(
            'INSERT OR IGNORE INTO daily_challenges (date, build, seed, stage, created_at) VALUES (?, ?, ?, ?, ?)'
        )
            .bind(row.date, row.build, row.seed, row.stage, now)
            .run();
    } catch (err) {
        console.warn('[daily] could not pin challenge', err?.message || err);
    }
    // Re-read: if another request pinned it first, that row is the truth.
    return { row: (await first(env, SELECT_DAILY, date)) || row };
}
