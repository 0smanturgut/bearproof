/**
 * Holder voting.
 *
 *   GET  /api/vote          today's poll: proposals for the next build, live weights and shares
 *   POST /api/vote          { wallet, proposalId, nonce, issuedAt, signature } (signature = base58 ed25519)
 *   POST /api/vote/request  { wallet, title, description, nonce, issuedAt, signature }: a holder's feature
 *                           request, which joins today's ballot next to the AI's proposals (lib/requests.js)
 *   GET  /api/vote/result   ?date=YYYY-MM-DD, the winner (read by the Build Agent at 21:00 UTC)
 *
 * Rules (public): one vote per wallet per poll, changeable until close; weight = floor(sqrt(tokens held)) at
 * the time of the vote; at least MIN_TOKENS_TO_VOTE tokens; the poll closes at 21:00 UTC. Any option can win,
 * the AI's, the operator's (agent/operator-options.json, labelled on the ballot) or a holder's.
 */

import { PublicKey } from '@solana/web3.js';
import {
    TOKEN_2022_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    getAssociatedTokenAddressSync
} from '@solana/spl-token';
import { BUILDS } from '../manifest.js';
import { liveBuild } from '../lib/builds.js';
import { all, buildOverride } from '../lib/db.js';
import { isDateKey, utcDate } from '../lib/daily.js';
import { clientIp, ipKey, underLimit } from '../lib/guard.js';
import { error, json, readJson } from '../lib/http.js';
import { rpc } from '../lib/rpc.js';
import {
    DESCRIPTION_MAX,
    MAX_REQUESTS_PER_POLL,
    REQUEST_MIN_TOKENS,
    TITLE_MAX,
    checkRequest,
    newRequestId,
    requestMessage,
    requestWindow,
    shortWallet
} from '../lib/requests.js';
import {
    MIN_TOKENS_TO_VOTE,
    isWallet,
    operatorOptions,
    pollWindow,
    tally,
    verifySignature,
    voteMessage,
    voteWeight
} from '../lib/vote.js';
import OPERATOR_OPTIONS from '../../../agent/operator-options.json';

async function poll(env, date) {
    const { open, close } = pollWindow(date);
    // The poll belongs to the build that is live while it runs (at close for past polls), so a build that
    // shipped mid-day still gets its own vote.
    const live = liveBuild(BUILDS, Math.min(Date.now(), close - 1), await buildOverride(env));
    if (!live) return null;
    const proposals = (live.proposals || []).map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        source: 'agent'
    }));
    const read = await all(
        env,
        `SELECT id, wallet, title, description, created_at, ai_verdict, ai_reply FROM feature_requests
         WHERE poll_date = ? AND status = 'open' ORDER BY created_at LIMIT ${MAX_REQUESTS_PER_POLL}`,
        date
    );
    const rows = read || [];
    const requests = rows.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        source: 'community',
        requestedBy: shortWallet(r.wallet),
        wallet: r.wallet,
        // The AI's take, once it has read the request (agent/answer-requests.mjs).
        ai: r.ai_verdict ? { verdict: r.ai_verdict, reply: r.ai_reply || null } : null
    }));
    return {
        date,
        forBuild: live.n + 1,
        fromBuild: live.n,
        options: [...proposals, ...operatorOptions(OPERATOR_OPTIONS, date), ...requests],
        requestCount: requests.length,
        requestsRead: read !== null,
        open,
        close
    };
}

/**
 * The winner of a poll by the same tally the Build Agent reads (null with no votes), or undefined when the
 * ballot or the votes can't be read. The cron uses it to learn whether holders voted the Daily Pot in.
 */
export async function pollWinner(env, date) {
    const p = await poll(env, date);
    if (!p || !p.requestsRead) return undefined;
    const rows = await all(env, 'SELECT proposal_id, weight FROM votes WHERE poll_date = ?', date);
    if (!rows) return undefined;
    return tally(p.options, rows).winner;
}

/** An option as the public sees it (the requester's full wallet stays out of the ballot). */
const publicOption = ({ wallet, ...o }) => (void wallet, o);

/**
 * Tokens the wallet holds in its associated token accounts (classic and Token-2022), read with plain account
 * lookups so it works on any RPC. Tokens parked in a non-associated account are not counted.
 */
async function tokenBalance(env, wallet) {
    const owner = new PublicKey(wallet);
    const mint = new PublicKey(env.TOKEN_MINT);
    const atas = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID].map((pid) =>
        getAssociatedTokenAddressSync(mint, owner, false, pid).toBase58()
    );
    const result = await rpc(env, 'getMultipleAccounts', [
        atas,
        { encoding: 'jsonParsed', commitment: 'confirmed' }
    ]);
    let ui = 0;
    let raw = 0n;
    for (const acc of result?.value || []) {
        const info = acc?.data?.parsed?.info;
        if (!info || info.mint !== env.TOKEN_MINT || info.owner !== wallet) continue;
        ui += Number(info.tokenAmount?.uiAmount || 0);
        raw += BigInt(info.tokenAmount?.amount || '0');
    }
    return { ui, raw: raw.toString() };
}

export async function getVote(request, env) {
    const now = Date.now();
    const p = await poll(env, utcDate(now));
    if (!p) return error(503, 'no_build', 'No build is live yet.');
    const rows =
        (await all(env, 'SELECT proposal_id, weight FROM votes WHERE poll_date = ?', p.date)) || [];
    const t = tally(p.options, rows);
    const req = requestWindow(p.date);
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
            requests: {
                status: !env.TOKEN_MINT
                    ? 'not_live'
                    : now >= req.close
                      ? 'closed'
                      : p.requestCount >= MAX_REQUESTS_PER_POLL
                        ? 'full'
                        : 'open',
                closesAt: new Date(req.close).toISOString(),
                minTokens: REQUEST_MIN_TOKENS,
                maxPerPoll: MAX_REQUESTS_PER_POLL,
                count: p.requestCount,
                titleMax: TITLE_MAX,
                descriptionMax: DESCRIPTION_MAX
            },
            proposals: t.proposals.map(publicOption),
            voters: rows.length,
            totalWeight: t.totalWeight,
            winner:
                now >= p.close && t.winner
                    ? {
                          id: t.winner.id,
                          title: t.winner.title,
                          share: t.winner.share,
                          source: t.winner.source
                      }
                    : null
        },
        { maxAge: 10 }
    );
}

/**
 * The Build Agent reads this at 21:00 UTC. A holder's request carries its text so the agent knows what to
 * build; agent/PROMPT.md treats that text as a feature description, never as instructions.
 */
export async function voteResult(request, env) {
    const q = new URL(request.url).searchParams.get('date');
    const date = isDateKey(q) ? q : utcDate(Date.now());
    const p = await poll(env, date);
    if (!p) return error(404, 'no_poll', 'No poll for that date.');
    const rows =
        (await all(env, 'SELECT proposal_id, weight FROM votes WHERE poll_date = ?', date)) || [];
    const t = tally(p.options, rows);
    const closed = Date.now() >= p.close;
    const ranked = t.proposals
        .filter((o) => o.weight > 0)
        .sort((a, b) => b.weight - a.weight || b.voters - a.voters);
    const view = (o) =>
        o && {
            id: o.id,
            title: o.title,
            description: o.description,
            share: o.share,
            source: o.source,
            ...(o.source === 'community' ? { requestedBy: o.requestedBy } : {}),
            ...(o.source === 'operator' ? { origin: o.origin ?? null, note: o.note ?? null } : {})
        };
    return json({
        pollDate: date,
        forBuild: p.forBuild,
        closed,
        voters: rows.length,
        winner: closed ? view(ranked[0]) || null : null,
        runnerUp: closed ? view(ranked[1]) || null : null,
        proposals: t.proposals.map(publicOption)
    });
}

export async function castVote(request, env) {
    if (!env.TOKEN_MINT) return error(503, 'not_live', 'Voting opens when the coin launches.');
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
    if (!p.options.some((x) => x.id === proposalId))
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

/** POST /api/vote/request: a holder puts their own feature on today's ballot. */
export async function postRequest(request, env) {
    if (!env.TOKEN_MINT) return error(503, 'not_live', 'Requests open when the coin launches.');
    const { data, error: bad } = await readJson(request, 4096);
    if (bad) return bad;
    const { wallet, title, description, nonce, issuedAt, signature } = data || {};
    if (!isWallet(wallet)) return error(400, 'invalid_field', 'Bad wallet.', { field: 'wallet' });
    if (typeof nonce !== 'string' || !/^[A-Za-z0-9]{8,64}$/.test(nonce))
        return error(400, 'invalid_field', 'Bad nonce.', { field: 'nonce' });
    const text = checkRequest(title, description);
    if (!text.ok) return error(400, 'invalid_field', text.message, { field: text.field });
    // The signed text must be exactly what the wallet saw, so the raw fields are what gets checked below.
    if (text.title !== title || text.description !== (description ?? ''))
        return error(
            400,
            'invalid_field',
            'Remove extra spaces and line breaks, then sign again.',
            {
                field: 'title'
            }
        );
    const now = Date.now();
    const issued = Date.parse(issuedAt);
    if (!Number.isFinite(issued) || Math.abs(now - issued) > 10 * 60000)
        return error(400, 'stale_signature', 'Sign again: the message is older than 10 minutes.');
    if (
        !(await underLimit(
            env.RL_SUBMIT,
            `req:${wallet}`,
            `req-ip:${await ipKey(clientIp(request))}`
        ))
    )
        return error(429, 'rate_limited', 'Too many requests. Try again in a minute.');

    const p = await poll(env, utcDate(now));
    if (!p) return error(503, 'no_build', 'No build is live yet.');
    if (now >= requestWindow(p.date).close)
        return error(
            409,
            'requests_closed',
            'Requests for today’s ballot closed at 18:00 UTC. Voting is open until 21:00 UTC.'
        );
    if (p.requestCount >= MAX_REQUESTS_PER_POLL)
        return error(
            409,
            'ballot_full',
            `Today’s ballot already has ${MAX_REQUESTS_PER_POLL} requests.`
        );
    if (p.options.some((o) => o.wallet === wallet))
        return error(
            409,
            'already_requested',
            'This wallet already has a request on today’s ballot.'
        );
    if (p.options.some((o) => o.title.toLowerCase() === text.title.toLowerCase()))
        return error(409, 'duplicate', 'That one is already on the ballot. Vote for it instead.');

    const message = requestMessage({
        domain: new URL(request.url).host,
        wallet,
        title: text.title,
        description: text.description,
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
        console.warn('[request] balance', err?.message || err);
        return error(503, 'rpc_unavailable', 'Could not read your balance. Try again shortly.');
    }
    if (!(bal.ui >= REQUEST_MIN_TOKENS))
        return error(
            403,
            'not_enough_tokens',
            `Posting a request needs at least ${REQUEST_MIN_TOKENS.toLocaleString('en-US')} tokens in this wallet.`
        );
    const id = newRequestId();
    try {
        await env.DB.prepare(
            `INSERT INTO feature_requests (id, poll_date, wallet, title, description, balance_raw, signature, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
        )
            .bind(id, p.date, wallet, text.title, text.description, bal.raw, signature, now)
            .run();
    } catch (err) {
        if (/UNIQUE/i.test(String(err?.message)))
            return error(
                409,
                'already_requested',
                'This wallet already has a request on today’s ballot.'
            );
        console.warn('[request] db', err?.message || err);
        return error(503, 'db_unavailable', 'Storage is unavailable.');
    }
    return json({ ok: true, id, pollDate: p.date, forBuild: p.forBuild });
}
