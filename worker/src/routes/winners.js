/**
 * GET /api/winners: the Daily Challenge winners and their prizes, newest first, with the rules. Payout
 * addresses never leave the database; a paid prize links to its transaction instead.
 */

import { all } from '../lib/db.js';
import { displayName } from '../lib/runs.js';
import { error, json } from '../lib/http.js';
import { PRIZE_CAP_LAMPORTS, PRIZE_MIN_LAMPORTS, PRIZE_PCT } from '../lib/prize.js';

const WHY = {
    'no eligible winner': 'No verified run with a passed bot check and a payout address.',
    'fees not measured yet': 'No creator fees measured for that day yet.',
    'below 0.01 SOL, rolled over': 'Under 0.01 SOL, so it rolled over to the next day.'
};

export async function winners(env) {
    const rows = await all(
        env,
        `SELECT w.date, w.score, w.payout_status, w.payout_token, w.payout_amount, w.payout_tx, w.note,
                w.player_id, p.name
           FROM daily_winners w LEFT JOIN players p ON p.id = w.player_id
          ORDER BY w.date DESC LIMIT 14`
    );
    if (!rows) return error(503, 'db_unavailable', 'Storage is unavailable.');
    const live = !!(env.TOKEN_MINT && env.PRIZE_WALLET);
    return json(
        {
            // 'wallet_pending': the coin is out, the prize wallet isn't funded yet.
            status: live ? 'live' : env.TOKEN_MINT ? 'wallet_pending' : 'not_live',
            rule: {
                token: 'ANSEM',
                share: PRIZE_PCT,
                capSol: PRIZE_CAP_LAMPORTS / 1e9,
                minSol: PRIZE_MIN_LAMPORTS / 1e9,
                text: `The verified #1 of each Daily Challenge who left a Solana address is paid ${PRIZE_PCT * 100}% of that day's creator fees (at most ${PRIZE_CAP_LAMPORTS / 1e9} SOL), bought as $ANSEM, after 00:10 UTC. Holding the coin is never required.`
            },
            winners: rows.map((r) => {
                let why = null;
                try {
                    const note = JSON.parse(r.note || '{}');
                    why = note.why || (r.payout_status === 'skipped' ? note.policy : null) || null;
                } catch {
                    why = null;
                }
                return {
                    date: r.date,
                    name: displayName(r.name, r.player_id),
                    score: r.score,
                    status: r.payout_status,
                    token: r.payout_token || null,
                    amountRaw: r.payout_status === 'paid' ? r.payout_amount : null,
                    tx: r.payout_tx || null,
                    why: why ? WHY[why] || why : null
                };
            })
        },
        { maxAge: 60 }
    );
}
