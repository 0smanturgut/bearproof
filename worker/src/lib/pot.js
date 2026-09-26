/**
 * The Daily Pot (pure, unit-tested): the prize rules put to the holder vote as ballot option `op-daily-pot` on the
 * 26 Sep 2026 poll. If that option wins, they apply to Daily Challenges from the next day on; earlier days, and
 * every day if it loses, keep lib/prize.js. Public rules (docs/TREASURY.md, and `details` below for the HQ):
 *
 *   pot     = min(40% of the day's treasury fees, 1 SOL)
 *   places  = 60% of the pot + the places rollover, split over the best verified runs of the day (one place per
 *             payout address) by PLACE_WEIGHTS, over as many places (at most 10) as keep every share ≥ 0.01 SOL.
 *   bounty  = 40% of the pot + the bounty rollover, shared equally by the players whose verified run cleared the
 *             bounty of the build the challenge ran on (one share per address, at most 25). If the shares would be
 *             under 0.01 SOL, fewer are paid, best score first. No bounty, or nobody cleared it: it rolls over.
 *   Rollovers are capped at 0.5 SOL each; anything over the cap stays in the treasury.
 */

import { LAMPORTS } from './prize.js';

export const POT_OPTION = 'op-daily-pot';
export const POT_POLL_DATE = '2026-09-26';
export const POT_PCT = 0.4;
export const POT_CAP_LAMPORTS = 1 * LAMPORTS;
export const PLACES_SHARE = 0.6;
export const PLACE_WEIGHTS = [30, 20, 14, 10, 8, 6, 4, 3, 3, 2];
export const SHARE_MIN_LAMPORTS = 0.01 * LAMPORTS;
export const MAX_BOUNTY_SHARES = 25;
export const ROLLOVER_CAP_LAMPORTS = 0.5 * LAMPORTS;

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

/** The day's fresh pot and its split, before rollovers. Unmeasured fees mean no pot. */
export function potAmount(fees24hLamports) {
    if (fees24hLamports === null || !Number.isFinite(fees24hLamports) || fees24hLamports < 0)
        return { lamports: 0, places: 0, bounty: 0, reason: 'fees not measured yet' };
    const lamports = Math.min(Math.floor(fees24hLamports * POT_PCT), POT_CAP_LAMPORTS);
    const places = Math.floor(lamports * PLACES_SHARE);
    return {
        lamports,
        places,
        bounty: lamports - places,
        reason: lamports === POT_CAP_LAMPORTS ? 'capped at 1 SOL' : "40% of the day's fees"
    };
}

/** Lamports per place, best first: as many places (≤ `eligible`, ≤ 10) as keep the smallest ≥ 0.01 SOL. */
export function placeShares(total, eligible) {
    for (let k = Math.min(eligible, PLACE_WEIGHTS.length); k >= 1; k--) {
        const w = PLACE_WEIGHTS.slice(0, k);
        const shares = w.map((x) => Math.floor((total * x) / sum(w)));
        if (shares[k - 1] >= SHARE_MIN_LAMPORTS) return shares;
    }
    return [];
}

/** Equal bounty shares for `clearers` players: fewer (best first) if a share would be under 0.01 SOL. */
export function bountyShares(total, clearers) {
    const n = Math.min(clearers, MAX_BOUNTY_SHARES, Math.floor(total / SHARE_MIN_LAMPORTS));
    return n >= 1 ? Array(n).fill(Math.floor(total / n)) : [];
}

/**
 * Plan one day's payouts.
 *   board:     best verified, bot-checked run per player, best first: [{ id, player_id, claimed_score }]
 *   clearers:  best verified, bot-checked run per player that cleared the bounty, best first (same shape);
 *              null when the build has no valid bounty
 *   addresses: Map player_id → payable Solana address; excluded: Set of player ids that can't win (operator)
 *   pot:       potAmount(); rollover: { places, bounty } carried from earlier days
 * Returns { recipients: [{ kind: 'place'|'bounty', place?, runId, playerId, to, score, lamports }], skipped,
 * rollover } where `rollover` is what carries to the next day.
 */
export function planPot({ board, clearers, addresses, excluded = new Set(), pot, rollover }) {
    const skipped = [];
    const pick = (runs, max) => {
        const out = [];
        const used = new Set();
        for (const r of runs) {
            if (out.length >= max) break;
            const to = addresses.get(r.player_id);
            const why = excluded.has(r.player_id)
                ? 'operator run, not prize-eligible'
                : !to
                  ? 'no payout address'
                  : used.has(to)
                    ? 'address already paid a share of this kind'
                    : null;
            if (why) {
                skipped.push({ runId: r.id, why });
                continue;
            }
            used.add(to);
            out.push({ runId: r.id, playerId: r.player_id, to, score: r.claimed_score });
        }
        return out;
    };

    const placesTotal = pot.places + rollover.places;
    const ranked = pick(board, PLACE_WEIGHTS.length);
    const places = placeShares(placesTotal, ranked.length).map((lamports, i) => ({
        kind: 'place',
        place: i + 1,
        ...ranked[i],
        lamports
    }));

    const bountyTotal = pot.bounty + rollover.bounty;
    const cleared = clearers ? pick(clearers, MAX_BOUNTY_SHARES) : [];
    const bounty = bountyShares(bountyTotal, cleared.length).map((lamports, i) => ({
        kind: 'bounty',
        ...cleared[i],
        lamports
    }));

    return {
        recipients: [...places, ...bounty],
        skipped,
        rollover: {
            places: places.length ? 0 : Math.min(placesTotal, ROLLOVER_CAP_LAMPORTS),
            bounty: bounty.length ? 0 : Math.min(bountyTotal, ROLLOVER_CAP_LAMPORTS)
        }
    };
}

/**
 * Split the $ANSEM a swap bought over the recipients, in proportion to their lamports. Rounding dust goes to the
 * first recipient, so the parts add up to exactly `boughtRaw`.
 */
export function splitBought(boughtRaw, lamports) {
    const total = BigInt(sum(lamports));
    if (total <= 0n || boughtRaw <= 0n) return lamports.map(() => 0n);
    const parts = lamports.map((l) => (boughtRaw * BigInt(l)) / total);
    parts[0] += boughtRaw - parts.reduce((a, b) => a + b, 0n);
    return parts;
}

/** The rules in words, for /api/winners and the HQ. */
export const POT_RULE_TEXT =
    "Every day, 40% of the day's creator fees (at most 1 SOL) is paid in $ANSEM after 00:10 UTC: 60% to the top of the Daily Challenge board, 40% shared by everyone who clears the AI's bounty. Free to play; holding the coin is never required.";

export const POT_RULE_DETAILS = [
    "The pot is 40% of the day's creator fees that reached the treasury, measured on-chain, at most 1 SOL a day.",
    '60% of it pays the best verified Daily Challenge runs, weighted 30/20/14/10/8/6/4/3/3/2 over as many of the top 10 places as keep every share at 0.01 SOL or more. One place per Solana address.',
    "40% is shared equally by every player whose verified Daily Challenge run cleared the AI's bounty for that build, one share per address, up to 25 shares. If the shares would be under 0.01 SOL, fewer are paid, best score first.",
    'Nobody cleared the bounty, or the places are too small to pay: that part rolls over to the next day, up to 0.5 SOL each.',
    'Only runs the server re-played with the same score, a passed bot check and a Solana address left on the receipt can be paid. The operator’s runs never are.',
    'The day is settled after 00:10 UTC, once the server has re-played every run; runs still unverified 12 hours after the close are left out.',
    'Paid in $ANSEM bought with the SOL at payout time; if the swap fails twice, in SOL, and the ledger says so. Network fees and new token-account rent come on top, from the prize wallet.',
    'A share that can’t be sent after three tries (or 72 hours) is shown as failed, and the operator sends it by hand, labelled on the ledger.'
];
