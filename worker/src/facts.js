/**
 * What the Telegram bot knows (docs/DECISIONS.md D62): the same live numbers the HQ shows, read through the
 * Worker's own routes and tables, so the bot and the site can't disagree. The commands, the announcements and
 * the FACTS block the chat model answers from (lib/words.js) all use this. Anything unknown is null and is said
 * to be unknown.
 *
 * This module bundles the build manifest and every build's content, so the cron and the webhook load it only
 * when they need it (like the vote route in dailypot.js); that keeps their own modules testable in Node.
 */

import { BUILDS } from './manifest.js';
import { TWIST_BUILDS } from './generated/twists.js';
import { liveBuild, shippedCount } from './lib/builds.js';
import { STAGE_NAMES, dayNumber, nextUtcMidnight, utcDate } from './lib/daily.js';
import { latestDigest } from './community.js';
import { buildOverride, first, getOrCreateDaily } from './lib/db.js';
import { CHAT_MODEL } from './lib/claude.js';
import { site } from './lib/telegram.js';
import { twistFor } from './lib/twists.js';
import { insights } from './routes/insights.js';
import { pot } from './routes/pot.js';
import { leaderboard } from './routes/runs.js';
import { getVote } from './routes/vote.js';

/** The JSON a route handler would send, or null when it can't answer. */
async function read(response) {
    try {
        const res = await response;
        return res && res.status === 200 ? await res.json() : null;
    } catch {
        return null;
    }
}

let DEVLOG = { at: 0, entries: [] };

/** The compiled devlog (dist/devlog.json, straight from git), cached for five minutes per isolate. */
export async function devlogEntries(env, now = Date.now()) {
    if (now - DEVLOG.at < 5 * 60000 && DEVLOG.entries.length) return DEVLOG.entries;
    try {
        const res = await env.ASSETS.fetch(new Request(`${site(env)}/devlog.json`));
        const body = res.ok ? await res.json() : null;
        if (Array.isArray(body?.entries))
            DEVLOG = { at: now, entries: body.entries.filter((e) => e && typeof e === 'object') };
    } catch (err) {
        console.warn('[facts] devlog', err?.message || err);
    }
    return DEVLOG.entries;
}

const names = (o) =>
    Object.values(o || {})
        .map((x) => x.name || x.id)
        .filter(Boolean)
        .join(', ');

/**
 * The facts, at most 30 seconds old: a busy chat asks for them with every reply, and they cost a dozen queries.
 * The cache key carries the UTC day, so nothing from before 00:00 survives the build switch. `fresh` skips the
 * cache (the cron's announcements).
 */
export async function gather(env, now = Date.now(), { fresh = false } = {}) {
    const cache = !fresh && typeof caches !== 'undefined' ? caches.default : null;
    const key = `${site(env)}/__telegram/facts/${utcDate(now)}`;
    if (cache) {
        try {
            const hit = await cache.match(key);
            if (hit) return { ...(await hit.json()), now };
        } catch (err) {
            console.warn('[facts] cache', err?.message || err);
        }
    }
    const f = await readFacts(env, now);
    if (cache) {
        try {
            await cache.put(
                key,
                new Response(JSON.stringify(f), {
                    headers: { 'content-type': 'application/json', 'cache-control': 'max-age=30' }
                })
            );
        } catch (err) {
            console.warn('[facts] cache', err?.message || err);
        }
    }
    return f;
}

async function readFacts(env, now) {
    const today = utcDate(now);
    const live = liveBuild(BUILDS, now, await buildOverride(env));
    const url = site(env);
    const [vote, board, runs24, potNow, entries, players, top, spent, bal, digest, daily, enabled] =
        await Promise.all([
            read(getVote(new Request(`${url}/api/vote`), env)),
            read(leaderboard(new Request(`${url}/api/leaderboard`), env)),
            read(insights(new Request(`${url}/api/insights?hours=24`), env)),
            read(pot(env)),
            devlogEntries(env, now),
            first(env, 'SELECT COUNT(*) AS n FROM play_sessions WHERE date = ?', today),
            first(
                env,
                "SELECT claimed_score AS score, status FROM runs WHERE challenge_date = ? AND status != 'rejected' ORDER BY claimed_score DESC LIMIT 1",
                today
            ),
            first(
                env,
                `SELECT COALESCE(SUM(usd), 0) AS usd,
                        COALESCE(SUM(CASE WHEN id LIKE 'tg-%' THEN usd ELSE 0 END), 0) AS chat,
                        COALESCE(SUM(CASE WHEN id LIKE 'tg-%' THEN 0 ELSE 1 END), 0) AS runs
                   FROM compute_costs WHERE measured = 1`
            ),
            env.CONFIG.get('treasury:balances')
                .then((s) => JSON.parse(s || 'null'))
                .catch(() => null),
            latestDigest(env),
            getOrCreateDaily(env, today, BUILDS).catch(() => ({})),
            env.CONFIG.get('payouts_enabled').catch(() => null)
        ]);
    const content = live ? TWIST_BUILDS[live.n] : null;
    const row = daily?.row || null;
    const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    return {
        now,
        today,
        day: dayNumber(env.PROJECT_START_DATE, now),
        shipped: shippedCount(BUILDS, now),
        live: live
            ? {
                  n: live.n,
                  title: live.title,
                  mode: live.mode,
                  activatesAt: live.activatesAt,
                  costUsd: live.costUsd ?? null
              }
            : null,
        entry: (live && entries.find((e) => e.build === live.n)) || null,
        nextBuildAt: nextUtcMidnight(now),
        game: content
            ? {
                  weapons: names(content.WEAPONS),
                  passives: names(content.PASSIVES),
                  enemies: names(content.ENEMIES),
                  bosses: names(content.BOSSES),
                  characters: names(content.CHARACTERS)
              }
            : null,
        daily: row
            ? {
                  build: row.build,
                  stage: STAGE_NAMES[row.stage] || row.stage,
                  twist: twistFor(TWIST_BUILDS, row.build, row.seed)
              }
            : null,
        playersToday: players ? players.n : null,
        topToday: top ? { score: top.score, verified: top.status === 'verified' } : null,
        vote,
        board,
        runs24,
        pot: potNow,
        prizeLive: !!(env.TOKEN_MINT && env.PRIZE_WALLET) && enabled === 'true',
        treasury: {
            wallet: env.TREASURY_WALLET || null,
            sol: num(bal?.treasury),
            prizeWallet: env.PRIZE_WALLET || null,
            prizeSol: num(bal?.prize),
            feesUnclaimed: num(bal?.creatorVault),
            at: bal?.at || null
        },
        compute: spent ? { usd: spent.usd, chatUsd: spent.chat, runs: spent.runs } : null,
        mint: env.TOKEN_MINT || null,
        ansemMint: env.ANSEM_MINT || null,
        model: env.TELEGRAM_CHAT_MODEL || CHAT_MODEL,
        digest
    };
}
