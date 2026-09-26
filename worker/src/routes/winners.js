/**
 * GET /api/winners: the Daily Challenge prizes, newest first, with the rules in force. Payout addresses never leave
 * the database; a paid prize links to its transaction instead. A Daily Pot day (lib/pot.js) lists every recipient.
 */

import { dailyPotFrom } from '../dailypot.js';
import { utcDate } from '../lib/daily.js';
import { all } from '../lib/db.js';
import { displayName } from '../lib/runs.js';
import { error, json } from '../lib/http.js';
import {
    PLACE_WEIGHTS,
    POT_CAP_LAMPORTS,
    POT_PCT,
    POT_RULE_DETAILS,
    POT_RULE_TEXT,
    PLACES_SHARE,
    SHARE_MIN_LAMPORTS
} from '../lib/pot.js';
import { PRIZE_CAP_LAMPORTS, PRIZE_MIN_LAMPORTS, PRIZE_PCT } from '../lib/prize.js';

const WHY = {
    'no eligible winner': 'No verified run with a passed bot check and a payout address.',
    'fees not measured yet': 'No creator fees measured for that day yet.',
    'below 0.01 SOL, rolled over': 'Under 0.01 SOL, so it rolled over to the next day.'
};

const ONE_RULE = {
    token: 'ANSEM',
    share: PRIZE_PCT,
    capSol: PRIZE_CAP_LAMPORTS / 1e9,
    minSol: PRIZE_MIN_LAMPORTS / 1e9,
    text: `The verified #1 of each Daily Challenge who left a Solana address is paid ${PRIZE_PCT * 100}% of that day's creator fees (at most ${PRIZE_CAP_LAMPORTS / 1e9} SOL), bought as $ANSEM, after 00:10 UTC. Holding the coin is never required.`
};

const POT_RULE = {
    policy: 'daily-pot',
    token: 'ANSEM',
    share: POT_PCT,
    capSol: POT_CAP_LAMPORTS / 1e9,
    placesShare: PLACES_SHARE,
    weights: PLACE_WEIGHTS,
    minShareSol: SHARE_MIN_LAMPORTS / 1e9,
    text: POT_RULE_TEXT,
    details: POT_RULE_DETAILS
};

/** A Daily Pot day as the public sees it: who got what, never where it went. */
function potDay(note, names) {
    const token = note.token || 'ANSEM';
    const payouts = (note.recipients || []).map((r) => ({
        kind: r.kind,
        place: r.place ?? null,
        name: names.get(r.playerId) || displayName(null, r.playerId),
        status: r.status,
        token,
        amountRaw: r.status === 'sent' ? r.amount : null,
        tx: r.status === 'sent' ? r.tx : null
    }));
    const why = note.waiting
        ? 'Payout waiting for the prize wallet top-up.'
        : !payouts.length
          ? note.pot?.reason === 'fees not measured yet'
              ? WHY['fees not measured yet']
              : 'Nobody could be paid, so the pot rolled over to the next day.'
          : null;
    return {
        payouts,
        bounty: note.bounty?.name
            ? {
                  name: note.bounty.name,
                  type: note.bounty.type,
                  cleared: note.bounty.cleared ?? null
              }
            : null,
        why
    };
}

export async function winners(env) {
    const rows = await all(
        env,
        `SELECT w.date, w.score, w.payout_status, w.payout_token, w.payout_amount, w.payout_tx, w.note,
                w.player_id, p.name
           FROM daily_winners w LEFT JOIN players p ON p.id = w.player_id
          ORDER BY w.date DESC LIMIT 14`
    );
    if (!rows) return error(503, 'db_unavailable', 'Storage is unavailable.');
    const live =
        !!(env.TOKEN_MINT && env.PRIZE_WALLET) &&
        (await env.CONFIG.get('payouts_enabled').catch(() => null)) === 'true';
    const from = await dailyPotFrom(env).catch(() => null);
    const today = utcDate(Date.now());

    const notes = rows.map((r) => {
        try {
            return JSON.parse(r.note || '{}');
        } catch {
            return {};
        }
    });
    // Board names of every Daily Pot recipient, in one query.
    const ids = [
        ...new Set(
            notes.flatMap((n) =>
                n.policy === 'daily-pot' ? (n.recipients || []).map((r) => r.playerId) : []
            )
        )
    ];
    const names = new Map();
    if (ids.length) {
        const found = await all(
            env,
            `SELECT id, name FROM players WHERE id IN (${ids.map(() => '?').join(',')})`,
            ...ids
        );
        for (const p of found || []) names.set(p.id, displayName(p.name, p.id));
    }

    return json(
        {
            // 'wallet_pending': the coin is out, the prize wallet isn't funded yet.
            status: live ? 'live' : env.TOKEN_MINT ? 'wallet_pending' : 'not_live',
            rule:
                from && today >= from
                    ? { ...POT_RULE, from }
                    : { ...ONE_RULE, ...(from ? { next: { ...POT_RULE, from } } : {}) },
            winners: rows.map((r, i) => {
                const note = notes[i];
                const base = {
                    date: r.date,
                    name: displayName(r.name, r.player_id),
                    score: r.score,
                    status: r.payout_status,
                    token: r.payout_token || null
                };
                if (note.policy === 'daily-pot')
                    return {
                        ...base,
                        policy: 'daily-pot',
                        amountRaw: r.payout_status === 'paid' ? r.payout_amount : null,
                        tx: r.payout_tx || null,
                        ...potDay(note, names)
                    };
                const why =
                    note.why || (r.payout_status === 'skipped' ? note.policy : null) || null;
                return {
                    ...base,
                    amountRaw: r.payout_status === 'paid' ? r.payout_amount : null,
                    tx: r.payout_tx || null,
                    why: why ? WHY[why] || why : null
                };
            })
        },
        { maxAge: 60 }
    );
}
