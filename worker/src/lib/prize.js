/**
 * Daily prize policy (pure, unit-tested). Public rules, see docs/TREASURY.md:
 *   prize = min(10% of the previous 24 h creator fees, 0.5 SOL); below 0.01 SOL it rolls over.
 *   Winner = the best verified Daily Challenge run whose bot check passed and whose player left an address.
 *   The operator's own runs rank on the board but never win (CONFIG `prize:excluded_players`).
 */

export const LAMPORTS = 1_000_000_000;
export const PRIZE_PCT = 0.1;
export const PRIZE_CAP_LAMPORTS = 0.5 * LAMPORTS;
export const PRIZE_MIN_LAMPORTS = 0.01 * LAMPORTS;

/**
 * @param {number|null} fees24hLamports creator fees received in the previous 24 h (null = not measured)
 * @param {number} rolloverLamports    earlier prizes that were too small to pay
 */
export function prizeAmount(fees24hLamports, rolloverLamports = 0) {
    if (fees24hLamports === null || !Number.isFinite(fees24hLamports) || fees24hLamports < 0) {
        return { lamports: 0, rollover: rolloverLamports, reason: 'fees not measured yet' };
    }
    const base = Math.floor(fees24hLamports * PRIZE_PCT) + Math.max(0, rolloverLamports);
    const lamports = Math.min(base, PRIZE_CAP_LAMPORTS);
    if (lamports < PRIZE_MIN_LAMPORTS)
        return { lamports: 0, rollover: lamports, reason: 'below 0.01 SOL, rolled over' };
    return {
        lamports,
        rollover: 0,
        reason: lamports === PRIZE_CAP_LAMPORTS ? 'capped at 0.5 SOL' : '10% of 24 h fees'
    };
}

/**
 * Walk the day's board (best run per player, highest score first) and return the first eligible entry,
 * plus the names of everyone skipped and why, for the public note.
 */
export function pickWinner(board, addresses, excluded = new Set()) {
    const skipped = [];
    for (const r of board) {
        if (excluded.has(r.player_id)) {
            skipped.push({ runId: r.id, why: 'operator run, not prize-eligible' });
            continue;
        }
        if (r.status !== 'verified') {
            skipped.push({ runId: r.id, why: `run ${r.status}` });
            continue;
        }
        if (r.bot_check !== 'passed') {
            skipped.push({ runId: r.id, why: 'bot check not passed' });
            continue;
        }
        const address = addresses.get(r.player_id);
        if (!address) {
            skipped.push({ runId: r.id, why: 'no payout address' });
            continue;
        }
        return { winner: { ...r, address }, skipped };
    }
    return { winner: null, skipped };
}
