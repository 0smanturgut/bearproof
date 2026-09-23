/**
 * BULL RUN / Patch Worker.
 *
 *   /            HQ landing page (static asset)
 *   /b/<n>/      immutable game build n (static asset)
 *   /play        302 to the live build (or the build pinned for ?challenge=YYYY-MM-DD)
 *   /api/*       JSON API (this file)
 *
 * Every number the API returns is either real data or `null` with a reason. Nothing is invented.
 */

import manifest from '../../builds/builds.json';
import { buildForDate, liveBuild, publicBuild, shippedCount } from './lib/builds.js';
import {
    dailySeed,
    dayNumber,
    isDateKey,
    nextUtcMidnight,
    stageForSeed,
    utcDate
} from './lib/daily.js';
import { edgeCached, error, json, redirect } from './lib/http.js';

const BUILDS = manifest.builds;

async function buildOverride(env) {
    try {
        return (await env.CONFIG.get('build_override')) ?? null;
    } catch {
        return null;
    }
}

/** Query helper that turns "table missing / DB unavailable" into null instead of a 500. */
async function first(env, sql, ...args) {
    try {
        return await env.DB.prepare(sql)
            .bind(...args)
            .first();
    } catch (err) {
        console.warn('[db]', err?.message || err);
        return null;
    }
}

// --- Routes ----------------------------------------------------------------

async function play(request, env) {
    const url = new URL(request.url);
    const override = await buildOverride(env);
    const challenge = url.searchParams.get('challenge');
    const build = isDateKey(challenge)
        ? buildForDate(BUILDS, challenge, override)
        : liveBuild(BUILDS, Date.now(), override);
    if (!build) return error(503, 'no_build', 'No build is live yet.');
    return redirect(`/b/${build.n}/${url.search}`);
}

async function daily(request, env) {
    const url = new URL(request.url);
    const now = Date.now();
    const date = isDateKey(url.searchParams.get('date'))
        ? url.searchParams.get('date')
        : utcDate(now);
    if (date > utcDate(now)) return error(403, 'not_yet', 'That challenge has not started.');

    // A pinned row wins: the challenge stays on the build that was live at 00:00 UTC, even if a new
    // build lands later that day.
    let row = await first(
        env,
        'SELECT date, build, seed, stage FROM daily_challenges WHERE date = ?',
        date
    );
    if (!row) {
        if (!env.DAILY_SEED_SALT)
            return error(503, 'not_configured', 'Daily seed secret is not set.');
        const build = buildForDate(BUILDS, date, await buildOverride(env));
        if (!build) return error(503, 'no_build', 'No build is live yet.');
        const seed = await dailySeed(date, env.DAILY_SEED_SALT);
        row = { date, build: build.n, seed, stage: stageForSeed(seed) };
        try {
            await env.DB.prepare(
                'INSERT OR IGNORE INTO daily_challenges (date, build, seed, stage, created_at) VALUES (?, ?, ?, ?, ?)'
            )
                .bind(row.date, row.build, row.seed, row.stage, now)
                .run();
        } catch (err) {
            console.warn('[daily] could not pin challenge', err?.message || err);
        }
    }
    const endsAt = nextUtcMidnight(Date.parse(`${date}T00:00:00Z`));
    return json(
        {
            date: row.date,
            build: row.build,
            seed: row.seed,
            stage: row.stage,
            startsAt: new Date(Date.parse(`${date}T00:00:00Z`)).toISOString(),
            endsAt: new Date(endsAt).toISOString(),
            playUrl: `/b/${row.build}/?challenge=${row.date}`,
            prize: {
                token: 'ANSEM',
                status: 'not_live',
                note: 'Prizes start after the coin launches.'
            }
        },
        { maxAge: 30 }
    );
}

async function stats(env) {
    const now = Date.now();
    const today = utcDate(now);
    const live = liveBuild(BUILDS, now, await buildOverride(env));
    const players = await first(
        env,
        'SELECT COUNT(*) AS n FROM play_sessions WHERE date = ?',
        today
    );
    const top = await first(
        env,
        "SELECT claimed_score AS score, status FROM runs WHERE challenge_date = ? AND status != 'rejected' ORDER BY claimed_score DESC LIMIT 1",
        today
    );
    const spent = await first(
        env,
        'SELECT COALESCE(SUM(usd), 0) AS usd, COUNT(*) AS runs FROM compute_costs WHERE measured = 1'
    );
    return json(
        {
            day: dayNumber(env.PROJECT_START_DATE, now),
            buildsShipped: shippedCount(BUILDS, now),
            liveBuild: publicBuild(live),
            nextBuildAt: new Date(nextUtcMidnight(now)).toISOString(),
            treasury: env.TREASURY_WALLET
                ? {
                      wallet: env.TREASURY_WALLET,
                      balance: null,
                      note: 'Balance feed not wired yet.'
                  }
                : null,
            token: env.TOKEN_MINT ? { mint: env.TOKEN_MINT } : null,
            computeSpentUsd: spent ? { measured: spent.usd, meteredRuns: spent.runs } : null,
            playersToday: players ? players.n : null,
            topScoreToday: top ? { score: top.score, verified: top.status === 'verified' } : null,
            generatedAt: new Date(now).toISOString()
        },
        { maxAge: 15 }
    );
}

function health(env) {
    return json({
        ok: true,
        builds: BUILDS.length,
        configured: {
            dailySeed: !!env.DAILY_SEED_SALT,
            turnstile: !!env.TURNSTILE_SECRET,
            treasury: !!env.TREASURY_WALLET,
            token: !!env.TOKEN_MINT
        }
    });
}

// --- Entry -----------------------------------------------------------------

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const { pathname } = url;

        if (pathname === '/play' || pathname === '/play/') return play(request, env);

        if (pathname.startsWith('/api/')) {
            if (request.method === 'OPTIONS') {
                return new Response(null, {
                    status: 204,
                    headers: {
                        'access-control-allow-origin': '*',
                        'access-control-allow-methods': 'GET, POST, OPTIONS',
                        'access-control-allow-headers': 'content-type'
                    }
                });
            }
            if (request.method === 'GET') {
                switch (pathname) {
                    case '/api/health':
                        return health(env);
                    case '/api/builds':
                        return json({ builds: BUILDS.map(publicBuild) }, { maxAge: 60 });
                    case '/api/daily':
                        return daily(request, env);
                    case '/api/stats':
                        return edgeCached(request, ctx, 15, () => stats(env));
                }
            }
            return error(404, 'not_found', `No route for ${request.method} ${pathname}`);
        }

        // Anything else that reached the Worker (e.g. /run/<id> before replays exist) falls back to assets.
        return env.ASSETS.fetch(request);
    }
};
