/**
 * GET /api/ledger: every inflow and outflow, newest first. On-chain rows link to Solscan. Off-chain rows
 * (e.g. an API invoice) say whether the number is measured or an estimate. An empty list is a real answer.
 */

import { all } from '../lib/db.js';
import { error, json } from '../lib/http.js';

export async function ledger(env) {
    const rows = await all(
        env,
        `SELECT ts, direction, category, amount_lamports, token_mint, token_amount, usd_estimate, memo,
            tx_signature, source, measured
        FROM ledger ORDER BY ts DESC LIMIT 100`
    );
    if (!rows) return error(503, 'db_unavailable', 'Storage is unavailable. Try again shortly.');
    return json(
        {
            wallets: {
                treasury: env.TREASURY_WALLET || null,
                prize: env.PRIZE_WALLET || null,
                costs: env.COSTS_WALLET || null
            },
            entries: rows.map((r) => ({
                ts: new Date(r.ts).toISOString(),
                direction: r.direction,
                category: r.category,
                amountSol: r.amount_lamports === null ? null : r.amount_lamports / 1e9,
                tokenMint: r.token_mint,
                tokenAmount: r.token_amount,
                usdEstimate: r.usd_estimate,
                memo: r.memo,
                tx: r.tx_signature,
                solscan: r.tx_signature
                    ? `https://solscan.io/tx/${encodeURIComponent(r.tx_signature)}`
                    : null,
                source: r.source,
                measured: r.measured === 1
            })),
            generatedAt: new Date().toISOString()
        },
        { maxAge: 30 }
    );
}
