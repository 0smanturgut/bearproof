/**
 * GET /api/onchain: the treasury and prize wallet's on-chain moves as SQD Network indexed them (lib/sqd.js), newest
 * first, each marked with whether our own ledger lists the same transaction, plus the last 24 hours in totals.
 * It is the independent half of the receipts: nothing here comes from the ledger's own chain reader.
 */
import { all, first } from '../lib/db.js';
import { error, json } from '../lib/http.js';
import { DUST_LAMPORTS } from '../lib/treasury.js';
import { SQD_PORTAL, chainMoves, readState } from '../lib/sqd.js';

const DAY = 86400000;
const ANSEM_DECIMALS = 6;

/** A signed base-unit string as a decimal amount: '-1500000', 9 → '-0.0015'. */
export function units(delta, decimals) {
    let v = BigInt(delta);
    const neg = v < 0n;
    if (neg) v = -v;
    const s = v.toString().padStart(decimals + 1, '0');
    const whole = s.slice(0, s.length - decimals);
    const frac = s.slice(s.length - decimals).replace(/0+$/, '');
    return `${neg ? '-' : ''}${whole}${frac ? '.' + frac : ''}`;
}

export async function onchain(env) {
    const rows = await chainMoves(env, { limit: 60 });
    if (!rows) return error(503, 'db_unavailable', 'Storage is unavailable.');
    const wallet = (a) =>
        a === env.TREASURY_WALLET ? 'treasury' : a === env.PRIZE_WALLET ? 'prize' : 'other';
    const asset = (a) => (a === 'SOL' ? 'SOL' : a === env.ANSEM_MINT ? 'ANSEM' : a);
    const moves = rows.map((r) => {
        const sol = r.asset === 'SOL';
        const dir = r.delta.startsWith('-') ? 'out' : 'in';
        const dust = sol && dir === 'in' && !r.in_ledger && BigInt(r.delta) < BigInt(DUST_LAMPORTS);
        return {
            ts: new Date(r.ts).toISOString(),
            slot: r.slot,
            tx: r.sig,
            solscan: `https://solscan.io/tx/${r.sig}`,
            wallet: wallet(r.account),
            asset: asset(r.asset),
            amount: units(r.delta, sol ? 9 : ANSEM_DECIMALS),
            direction: dir,
            failed: !!r.failed,
            inLedger: !!r.in_ledger,
            // Why the ledger doesn't list it, when that is the rule and not a gap.
            note: r.failed
                ? 'failed transaction: only its network fee moved'
                : dust
                  ? `under ${units(String(DUST_LAMPORTS), 9)} SOL from an unknown sender: the ledger doesn't list dust (often spam)`
                  : null
        };
    });
    const since = Date.now() - DAY;
    const day =
        (await all(
            env,
            `SELECT m.account, m.asset,
                    SUM(CASE WHEN CAST(m.delta AS INTEGER) > 0 THEN CAST(m.delta AS INTEGER) ELSE 0 END) AS inflow,
                    SUM(CASE WHEN CAST(m.delta AS INTEGER) < 0 THEN -CAST(m.delta AS INTEGER) ELSE 0 END) AS outflow,
                    COUNT(*) AS n,
                    SUM(EXISTS (SELECT 1 FROM ledger l WHERE l.tx_signature = m.sig)) AS listed
             FROM chain_moves m WHERE m.ts >= ?1 AND m.failed = 0 GROUP BY m.account, m.asset`,
            since
        )) || [];
    const span = await first(env, 'SELECT COUNT(*) AS n, MIN(ts) AS since FROM chain_moves');
    const { cursor, syncedAt } = await readState(env);
    return json(
        {
            source: {
                name: 'SQD Network',
                url: 'https://sqd.dev',
                dataset: SQD_PORTAL,
                note: 'Finalized Solana blocks from the SQD Portal, read by our Worker every 15 minutes, separately from our own ledger.'
            },
            wallets: { treasury: env.TREASURY_WALLET || null, prize: env.PRIZE_WALLET || null },
            indexedToSlot: cursor,
            syncedAt: syncedAt ? new Date(syncedAt).toISOString() : null,
            indexed: {
                moves: span?.n ?? 0,
                since: span?.since ? new Date(span.since).toISOString() : null
            },
            last24h: day.map((d) => ({
                wallet: wallet(d.account),
                asset: asset(d.asset),
                in: units(String(d.inflow || 0), d.asset === 'SOL' ? 9 : ANSEM_DECIMALS),
                out: units(String(d.outflow || 0), d.asset === 'SOL' ? 9 : ANSEM_DECIMALS),
                moves: d.n,
                inLedger: d.listed
            })),
            moves
        },
        { maxAge: 60 }
    );
}
