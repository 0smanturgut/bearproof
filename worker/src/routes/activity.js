/**
 * GET /api/activity: what just happened, newest first, for the control room on /live. Runs submitted and
 * verified, votes, holder requests and the AI's replies, treasury movements, prizes. Public data only: names are
 * board names, wallets are shortened, nothing a player typed except a request's title (shown on the ballot too).
 */

import { all } from '../lib/db.js';
import { displayName } from '../lib/runs.js';
import { json } from '../lib/http.js';
import { shortWallet } from '../lib/requests.js';

const DAY = 86400000;
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');

export async function activity(env) {
    const since = Date.now() - 2 * DAY;
    const [runs, votes, requests, ledger, winners] = await Promise.all([
        all(
            env,
            `SELECT r.id, r.mode, r.claimed_score, r.claimed_time_ms, r.status, r.created_at, r.verified_at,
                    r.player_id, p.name
               FROM runs r LEFT JOIN players p ON p.id = r.player_id
              WHERE r.created_at >= ? AND r.mode = 'daily' ORDER BY r.created_at DESC LIMIT 30`,
            since
        ),
        all(
            env,
            `SELECT v.wallet, v.proposal_id, v.weight, v.created_at, f.title AS req_title
               FROM votes v LEFT JOIN feature_requests f ON f.id = v.proposal_id
              WHERE v.created_at >= ? ORDER BY v.created_at DESC LIMIT 20`,
            since
        ),
        all(
            env,
            `SELECT id, wallet, title, created_at, ai_verdict, ai_reply, ai_at FROM feature_requests
              WHERE status = 'open' AND created_at >= ? ORDER BY created_at DESC LIMIT 12`,
            since
        ),
        all(
            env,
            'SELECT ts, direction, category, amount_lamports, token_mint, token_amount, memo, tx_signature FROM ledger WHERE ts >= ? ORDER BY ts DESC LIMIT 12',
            since
        ),
        all(
            env,
            "SELECT date, score, payout_token, payout_amount, payout_tx, created_at FROM daily_winners WHERE payout_status = 'paid' ORDER BY date DESC LIMIT 3"
        )
    ]);
    const items = [];
    for (const r of runs || []) {
        const who = displayName(r.name, r.player_id);
        items.push({
            ts: r.created_at,
            kind: 'run',
            text: `${who} finished a Daily Challenge run: ${fmt(r.claimed_score)} points in ${Math.floor(r.claimed_time_ms / 60000)}:${String(Math.floor((r.claimed_time_ms % 60000) / 1000)).padStart(2, '0')}.`
        });
        if (r.status === 'verified' && r.verified_at)
            items.push({
                ts: r.verified_at,
                kind: 'verified',
                text: `Replayed ${who}'s ${fmt(r.claimed_score)} from its recorded inputs on the server: same score. Verified.`
            });
        if (r.status === 'rejected' && r.verified_at)
            items.push({
                ts: r.verified_at,
                kind: 'rejected',
                text: `Replayed a ${fmt(r.claimed_score)} claim: the inputs don't produce it. Rejected.`
            });
    }
    for (const v of votes || [])
        items.push({
            ts: v.created_at,
            kind: 'vote',
            text: `${shortWallet(v.wallet)} voted for ${v.req_title ? `"${v.req_title}"` : v.proposal_id.replace(/-/g, ' ')} with weight ${fmt(v.weight)}.`
        });
    for (const q of requests || []) {
        items.push({
            ts: q.created_at,
            kind: 'request',
            text: `${shortWallet(q.wallet)} put a request on the ballot: "${q.title}".`
        });
        if (q.ai_at && q.ai_verdict)
            items.push({
                ts: q.ai_at,
                kind: 'reply',
                text: `My take on "${q.title}": ${{ day: 'doable in a day', slice: 'a first slice', no: "won't build" }[q.ai_verdict]}.${q.ai_reply ? ` ${q.ai_reply}` : ''}`
            });
    }
    const sol = (lamports) => ((Number(lamports) || 0) / 1e9).toFixed(3);
    // $ANSEM has 6 decimals; amounts are stored raw.
    const ansem = (raw) =>
        (Number(raw) / 1e6).toLocaleString('en-US', { maximumFractionDigits: 2 });
    for (const l of ledger || []) {
        if (l.category === 'prize') {
            const day =
                (String(l.memo || '').match(/prize:(\d{4}-\d{2}-\d{2})/) || [])[1] || 'the day';
            if (/:send$/.test(l.memo || '')) continue; // the prize line below says it
            items.push({
                ts: l.ts,
                kind: 'ledger',
                text: /:buy$/.test(l.memo || '')
                    ? `Prize wallet bought ${ansem(l.token_amount)} $ANSEM with ${sol(l.amount_lamports)} SOL for the ${day} winner.`
                    : /sol-fallback/.test(l.memo || '')
                      ? `Prize wallet paid ${sol(l.amount_lamports)} SOL to the ${day} winner (the $ANSEM swap failed twice).`
                      : `Prize wallet out: ${sol(l.amount_lamports)} SOL, ${l.memo || 'prize'}.`,
                tx: l.tx_signature || null
            });
            continue;
        }
        items.push({
            ts: l.ts,
            kind: l.category === 'creator_fees' ? 'fees' : 'ledger',
            text:
                l.category === 'creator_fees'
                    ? `Creator fees reached the treasury: ${((l.amount_lamports || 0) / 1e9).toFixed(3)} SOL.`
                    : `Treasury ${l.direction === 'in' ? 'in' : 'out'}: ${((l.amount_lamports || 0) / 1e9).toFixed(3)} SOL, ${l.memo || l.category}.`,
            tx: l.tx_signature || null
        });
    }
    for (const w of winners || []) {
        // Shown when it was sent (the ledger's send row), not when the winner was picked.
        const sent = (ledger || []).find((l) =>
            new RegExp(`prize:${w.date}:(send|sol-fallback)$`).test(l.memo || '')
        );
        items.push({
            ts: sent ? sent.ts : w.created_at,
            kind: 'prize',
            text: `Prize paid for ${w.date}: ${w.payout_token === 'SOL' ? `${sol(w.payout_amount)} SOL` : `${ansem(w.payout_amount)} $${w.payout_token || 'ANSEM'}`} to the verified #1.`,
            tx: w.payout_tx || null
        });
    }
    items.sort((a, b) => b.ts - a.ts);
    return json(
        {
            items: items.slice(0, 40).map((i) => ({ ...i, ts: new Date(i.ts).toISOString() })),
            generatedAt: new Date().toISOString()
        },
        { maxAge: 10 }
    );
}
