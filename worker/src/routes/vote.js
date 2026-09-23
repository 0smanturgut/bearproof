/**
 * Holder voting.
 *
 *   GET  /api/vote          today's poll: proposals for the next build, live weights and shares
 *   POST /api/vote          { wallet, proposalId, nonce, issuedAt, signature } (signature = base58 ed25519)
 *   GET  /api/vote/result   ?date=YYYY-MM-DD, the winner (read by the Build Agent at 13:00 UTC)
 *
 * Rules (public): one vote per wallet per poll, changeable until close; weight = floor(sqrt(tokens held)) at
 * the time of the vote; at least MIN_TOKENS_TO_VOTE tokens; the poll closes at 13:00 UTC.
 */

import { BUILDS } from '../manifest.js';
import { buildForDate } from '../lib/builds.js';
import { all, buildOverride } from '../lib/db.js';
import { isDateKey, utcDate } from '../lib/daily.js';
import { clientIp, ipKey, underLimit } from '../lib/guard.js';
import { error, json, readJson } from '../lib/http.js';
import {
    MIN_TOKENS_TO_VOTE,
    isWallet,
    pollWindow,
    tally,
    verifySignature,
    voteMessage,
    voteWeight
} from '../lib/vote.js';

async function poll(env, date) {
    const live = buildForDate(BUILDS, date, await buildOverride(env));
    if (!live) return null;
    const proposals = (live.proposals || []).map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description
    }));
    const { open, close } = pollWindow(date);
    return { date, forBuild: live.n + 1, fromBuild: live.n, proposals, open, close };
}

async function tokenBalance(env, wallet) {
    const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${env.HELIUS_API_KEY}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getTokenAccountsByOwner',
            params: [wallet, { mint: env.TOKEN_MINT }, { encoding: 'jsonParsed' }]
        })
    });
    if (!res.ok) throw new Error(`rpc ${res.status}`);
    const body = await res.json();
    if (body.error) throw new Error(body.error.message || 'rpc error');
    let ui = 0;
    let raw = 0n;
    for (const acc of body.result?.value || []) {
        const amt = acc.account?.data?.parsed?.info?.tokenAmount;
        if (!amt) continue;
        ui += Number(amt.uiAmount || 0);
        raw += BigInt(amt.amount || '0');
    }
    return { ui, raw: raw.toString() };
}

export async function getVote(request, env) {
    const now = Date.now();
    const p = await poll(env, utcDate(now));
    if (!p) return error(503, 'no_build', 'No build is live yet.');
    const rows =
        (await all(env, 'SELECT proposal_id, weight FROM votes WHERE poll_date = ?', p.date)) || [];
    const t = tally(p.proposals, rows);
    return json(
        {
            pollDate: p.date,
            forBuild: p.forBuild,
            status: !env.TOKEN_MINT ? 'not_live' : now < p.close ? 'open' : 'closed',
            closesAt: new Date(p.close).toISOString(),
            rule: {
                weight: 'floor(sqrt(tokens held))',
                minTokens: MIN_TOKENS_TO_VOTE,
                oneVotePerWallet: true
            },
            proposals: t.proposals,
            voters: rows.length,
            totalWeight: t.totalWeight,
            winner:
                now >= p.close && t.winner
                    ? { id: t.winner.id, title: t.winner.title, share: t.winner.share }
                    : null
        },
        { maxAge: 10 }
    );
}

export async function voteResult(request, env) {
    const q = new URL(request.url).searchParams.get('date');
    const date = isDateKey(q) ? q : utcDate(Date.now());
    const p = await poll(env, date);
    if (!p) return error(404, 'no_poll', 'No poll for that date.');
    const rows =
        (await all(env, 'SELECT proposal_id, weight FROM votes WHERE poll_date = ?', date)) || [];
    const t = tally(p.proposals, rows);
    const closed = Date.now() >= p.close;
    return json({
        pollDate: date,
        forBuild: p.forBuild,
        closed,
        voters: rows.length,
        winner:
            closed && t.winner
                ? { id: t.winner.id, title: t.winner.title, share: t.winner.share }
                : null,
        proposals: t.proposals
    });
}

export async function castVote(request, env) {
    if (!env.TOKEN_MINT || !env.HELIUS_API_KEY)
        return error(503, 'not_live', 'Voting opens when the coin launches.');
    const { data, error: bad } = await readJson(request, 4096);
    if (bad) return bad;
    const { wallet, proposalId, nonce, issuedAt, signature } = data || {};
    if (!isWallet(wallet)) return error(400, 'invalid_field', 'Bad wallet.', { field: 'wallet' });
    if (typeof nonce !== 'string' || !/^[A-Za-z0-9]{8,64}$/.test(nonce))
        return error(400, 'invalid_field', 'Bad nonce.', { field: 'nonce' });
    const now = Date.now();
    const issued = Date.parse(issuedAt);
    if (!Number.isFinite(issued) || Math.abs(now - issued) > 10 * 60000)
        return error(400, 'stale_signature', 'Sign again: the message is older than 10 minutes.');
    if (
        !(await underLimit(
            env.RL_SUBMIT,
            `vote:${wallet}`,
            `vote-ip:${await ipKey(clientIp(request))}`
        ))
    )
        return error(429, 'rate_limited', 'Too many requests. Try again in a minute.');

    const p = await poll(env, utcDate(now));
    if (!p || now >= p.close)
        return error(
            409,
            'poll_closed',
            'Today’s poll is closed. The next one opens at 00:00 UTC.'
        );
    if (!p.proposals.some((x) => x.id === proposalId))
        return error(400, 'invalid_field', 'Unknown proposal.', { field: 'proposalId' });

    const domain = new URL(request.url).host;
    const message = voteMessage({
        domain,
        wallet,
        proposalId,
        forBuild: p.forBuild,
        pollDate: p.date,
        nonce,
        issuedAt
    });
    if (!(await verifySignature(wallet, message, signature)))
        return error(401, 'bad_signature', 'The signature does not match this wallet and message.');

    let bal;
    try {
        bal = await tokenBalance(env, wallet);
    } catch (err) {
        console.warn('[vote] balance', err?.message || err);
        return error(503, 'rpc_unavailable', 'Could not read your balance. Try again shortly.');
    }
    const weight = voteWeight(bal.ui);
    if (weight < 1)
        return error(
            403,
            'not_a_holder',
            `Voting needs at least ${MIN_TOKENS_TO_VOTE} tokens in this wallet.`
        );
    try {
        await env.DB.prepare(
            `INSERT INTO votes (poll_date, wallet, proposal_id, weight, balance_raw, signature, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT (poll_date, wallet) DO UPDATE SET proposal_id = excluded.proposal_id,
                 weight = excluded.weight, balance_raw = excluded.balance_raw, signature = excluded.signature,
                 created_at = excluded.created_at`
        )
            .bind(p.date, wallet, proposalId, weight, bal.raw, signature, now)
            .run();
    } catch (err) {
        console.warn('[vote] db', err?.message || err);
        return error(503, 'db_unavailable', 'Storage is unavailable.');
    }
    return json({ ok: true, pollDate: p.date, proposalId, weight });
}
