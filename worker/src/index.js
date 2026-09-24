/**
 * BEARPROOF / Proof Worker.
 *
 *   /            HQ landing page (static asset)
 *   /b/<n>/      immutable game build n (static asset)
 *   /play        302 to the live build (or the build pinned for ?challenge=YYYY-MM-DD)
 *   /api/*       JSON API (routes here and in ./routes/, documented in docs/API.md)
 *
 * Every number the API returns is either real data or `null` with a reason. Nothing is invented.
 */

import { BUILDS } from './manifest.js';
import {
    payoutSelftest,
    pendingRuns,
    requestReply,
    requestStatus,
    runStats,
    unansweredRequests,
    unstatedRuns,
    verdict
} from './routes/internal.js';
import { agentLive, postAgentEvents } from './routes/agent.js';
import { insights } from './routes/insights.js';
import { castVote, getVote, postRequest, voteResult } from './routes/vote.js';
import { buildForDate, liveBuild, publicBuild, shippedCount } from './lib/builds.js';
import { STAGE_NAMES, dayNumber, isDateKey, nextUtcMidnight, utcDate } from './lib/daily.js';
import { buildOverride, first, getOrCreateDaily } from './lib/db.js';
import { edgeCached, error, json, redirect } from './lib/http.js';
import { ledger } from './routes/ledger.js';
import { getRun, leaderboard, session, setPlayerName, submitRun } from './routes/runs.js';
import { runCard, runPage } from './routes/share.js';
import { twistFor } from './lib/twists.js';
import { TWIST_BUILDS } from './generated/twists.js';
import { setPayoutAddress } from './routes/payout.js';
import { winners } from './routes/winners.js';
import { scheduled } from './cron.js';

// Until 26 Sep, browsers that cached build files "immutable" before D47 get their HTTP cache for this site
// cleared once (a cookie marks it done), so they pick up the Build #2 hotfix. Storage (prefs, player id) stays.
const CACHE_RESET_UNTIL = Date.parse('2026-09-26T00:00:00Z');
function withCacheReset(request, res) {
    if (Date.now() > CACHE_RESET_UNTIL) return res;
    if (/(?:^|;\s*)bp_cc=1/.test(request.headers.get('cookie') || '')) return res;
    const out = new Response(res.body, res);
    out.headers.set('Clear-Site-Data', '"cache"');
    out.headers.append('Set-Cookie', 'bp_cc=1; Max-Age=172800; Path=/; Secure; SameSite=Lax');
    return out;
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
    const { row, error: failed } = await getOrCreateDaily(env, date, BUILDS);
    if (failed) return failed;
    // The prize is live only when the coin, the prize wallet and the operator's switch are all on.
    const prizeLive =
        !!(env.TOKEN_MINT && env.PRIZE_WALLET) &&
        (await env.CONFIG.get('payouts_enabled').catch(() => null)) === 'true';
    const endsAt = nextUtcMidnight(Date.parse(`${date}T00:00:00Z`));
    return json(
        {
            date: row.date,
            build: row.build,
            seed: row.seed,
            stage: row.stage,
            stageName: STAGE_NAMES[row.stage] || row.stage,
            twist: twistFor(TWIST_BUILDS, row.build, row.seed),
            startsAt: new Date(Date.parse(`${date}T00:00:00Z`)).toISOString(),
            endsAt: new Date(endsAt).toISOString(),
            playUrl: `/b/${row.build}/?challenge=${row.date}`,
            turnstileSiteKey: env.TURNSTILE_SITE_KEY || null,
            prize: {
                token: 'ANSEM',
                status: prizeLive ? 'live' : 'not_live',
                note: prizeLive
                    ? 'The verified #1 with a payout address is paid in $ANSEM after 00:00 UTC.'
                    : env.TOKEN_MINT
                      ? 'The coin is live. Daily $ANSEM prizes start when the prize wallet is funded.'
                      : 'Prizes start after the coin launches.'
            }
        },
        { maxAge: 30 }
    );
}

async function treasuryStats(env) {
    let bal = null;
    try {
        bal = JSON.parse((await env.CONFIG.get('treasury:balances')) || 'null');
    } catch {
        bal = null;
    }
    return {
        wallet: env.TREASURY_WALLET,
        balance: bal && typeof bal.treasury === 'number' ? bal.treasury : null,
        prizeWallet: env.PRIZE_WALLET || null,
        prizeWalletBalance: bal && typeof bal.prize === 'number' ? bal.prize : null,
        balanceAt: bal ? bal.at : null,
        // Creator fees earned on pump.fun and not yet claimed into the wallet (they are the treasury's too).
        creatorVault: env.CREATOR_VAULT || null,
        feesUnclaimed: bal && typeof bal.creatorVault === 'number' ? bal.creatorVault : null,
        // The treasury's estimated share of those fees (ClawPump keeps the rest).
        feeShare: Number(env.CREATOR_FEE_SHARE) || null,
        note: 'On-chain SOL balances, read every 15 minutes.'
    };
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
            treasury: env.TREASURY_WALLET ? await treasuryStats(env) : null,
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
    scheduled,
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const { pathname } = url;

        // One canonical host: www.bearproof.app → bearproof.app.
        if (url.hostname.startsWith('www.')) {
            return Response.redirect(
                `https://${url.hostname.slice(4)}${pathname}${url.search}`,
                301
            );
        }
        if (pathname === '/play' || pathname === '/play/')
            return withCacheReset(request, await play(request, env));

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
                    case '/api/leaderboard':
                        return edgeCached(request, ctx, 15, () => leaderboard(request, env));
                    case '/api/ledger':
                        return edgeCached(request, ctx, 30, () => ledger(env));
                    case '/api/vote':
                        return getVote(request, env);
                    case '/api/vote/result':
                        return voteResult(request, env);
                    case '/api/agent/live':
                        return agentLive(request, env);
                    case '/api/insights':
                        return edgeCached(request, ctx, 60, () => insights(request, env));
                    case '/api/winners':
                        return edgeCached(request, ctx, 60, () => winners(env));
                }
                if (pathname.startsWith('/api/run/'))
                    return getRun(pathname.slice('/api/run/'.length), env);
                if (pathname === '/api/internal/runs/pending') return pendingRuns(request, env);
                if (pathname === '/api/internal/runs/unstated') return unstatedRuns(request, env);
                if (pathname === '/api/internal/requests/unanswered')
                    return unansweredRequests(request, env);
            }
            if (request.method === 'POST') {
                if (pathname === '/api/session') return session(request, env);
                if (pathname === '/api/runs') return submitRun(request, env);
                if (pathname === '/api/player') return setPlayerName(request, env);
                if (pathname === '/api/vote') return castVote(request, env);
                if (pathname === '/api/vote/request') return postRequest(request, env);
                if (pathname === '/api/payout-address') return setPayoutAddress(request, env);
                if (pathname === '/api/internal/payout/selftest')
                    return payoutSelftest(request, env);
                if (pathname === '/api/internal/agent/events') return postAgentEvents(request, env);
                const m = pathname.match(/^\/api\/internal\/runs\/([0-9a-z]+)\/verdict$/);
                if (m) return verdict(request, env, m[1]);
                const st = pathname.match(/^\/api\/internal\/runs\/([0-9a-z]+)\/stats$/);
                if (st) return runStats(request, env, st[1]);
                const rq = pathname.match(
                    /^\/api\/internal\/requests\/(req-[0-9a-z]{10})\/status$/
                );
                if (rq) return requestStatus(request, env, rq[1]);
                const rr = pathname.match(/^\/api\/internal\/requests\/(req-[0-9a-z]{10})\/reply$/);
                if (rr) return requestReply(request, env, rr[1]);
            }
            return error(404, 'not_found', `No route for ${request.method} ${pathname}`);
        }

        if (request.method === 'GET') {
            const card = pathname.match(/^\/og\/run\/([0-9a-z]+)\.png$/);
            if (card) {
                const v = ['pending', 'verified', 'rejected', 'unverifiable'].includes(
                    url.searchParams.get('v')
                )
                    ? url.searchParams.get('v')
                    : '';
                return edgeCached(
                    request,
                    ctx,
                    300,
                    () => runCard(card[1], env, request),
                    `${url.origin}/og/run/${card[1]}.png?v=${v}`
                );
            }
            const page = pathname.match(/^\/run\/([0-9a-z]+)\/?$/);
            if (page)
                return edgeCached(
                    request,
                    ctx,
                    60,
                    () => runPage(page[1], env, url.origin),
                    `${url.origin}/run/${page[1]}`
                );
        }

        // Anything else that reached the Worker falls back to assets.
        const asset = await env.ASSETS.fetch(request);
        return pathname === '/' ? withCacheReset(request, asset) : asset;
    }
};
