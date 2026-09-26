/**
 * GET /api/pot: today's Daily Pot so far, for the HQ and the stream. Fees are measured on-chain from the creator
 * vault every 15 minutes and err low; the final pot is worked out after the day closes (cron.js).
 *
 *   status: 'off' (not voted in, or the vote is still open) | 'next' (voted in, starts with `from`) | 'on'
 */

import { fees24h } from '../cron.js';
import { bountyClearers, bountyFor, dailyPotFrom, eligibleRuns, rolloverIn } from '../dailypot.js';
import { bountyText } from '../lib/bounty.js';
import { utcDate } from '../lib/daily.js';
import { first } from '../lib/db.js';
import { json } from '../lib/http.js';
import { POT_RULE_DETAILS, POT_RULE_TEXT, placeShares, potAmount } from '../lib/pot.js';

const sol = (lamports) => Math.round(lamports) / 1e9;

export async function pot(env) {
    const now = Date.now();
    const today = utcDate(now);
    const from = await dailyPotFrom(env, now).catch(() => null);
    if (!from) return json({ status: 'off' }, { maxAge: 60 });
    const rule = { text: POT_RULE_TEXT, details: POT_RULE_DETAILS };
    if (today < from) return json({ status: 'next', from, rule }, { maxAge: 60 });

    const fees = await fees24h(env, today);
    const p = potAmount(fees);
    const rollover = (await rolloverIn(env, today)) || { places: 0, bounty: 0 };
    const places = p.places + rollover.places;
    const bountyPot = p.bounty + rollover.bounty;
    const daily = await first(env, 'SELECT build FROM daily_challenges WHERE date = ?', today);
    const b = daily ? await bountyFor(env, daily.build) : null;
    let bounty = null;
    if (b?.bounty) {
        const runs = await eligibleRuns(env, today);
        bounty = {
            name: b.bounty.name,
            text: bountyText(b.bounty),
            // Players whose verified run cleared it so far (runs are verified within the hour).
            cleared: runs ? bountyClearers(runs, b.bounty).length : null
        };
    }
    return json(
        {
            status: 'on',
            from,
            date: today,
            measured: fees !== null,
            feesSol: fees === null ? null : sol(fees),
            potSol: sol(p.lamports),
            placesSol: sol(places),
            bountySol: sol(bountyPot),
            // Places the top of the board would share at this size (fewer if fewer players left an address).
            places: placeShares(places, 10).length,
            bounty,
            rule
        },
        { maxAge: 60 }
    );
}
