/**
 * Treasury receipts, read from chain (read-only, no keys):
 *   - SOL balances of the treasury and prize wallets, cached in CONFIG for /api/stats,
 *   - every SOL movement of the treasury wallet, written to the public ledger with its Solscan link.
 *
 * Labels are conservative. An inflow is "creator_fees" only when it comes from a known fee source
 * (CONFIG `ledger:fee_sources`, a JSON list of addresses). Anything unrecognised is "other" with the
 * counterparty in the memo, so the ledger never claims more than the chain shows.
 *
 * Anyone can send SOL with a memo to a public wallet, so incoming memos are never shown (spam and scam
 * links would land on the HQ), and inflows under DUST_LAMPORTS from unknown wallets are not listed.
 */

import { rpc } from './rpc.js';

const MAX_TX_PER_RUN = 10;
export const DUST_LAMPORTS = 1_000_000; // 0.001 SOL

function transfers(tx) {
    const out = [];
    const walk = (ixs) => {
        for (const ix of ixs || []) {
            if (ix.program === 'system' && ix.parsed?.type === 'transfer') out.push(ix.parsed.info);
        }
    };
    walk(tx.transaction?.message?.instructions);
    for (const inner of tx.meta?.innerInstructions || []) walk(inner.instructions);
    return out;
}

function memoOf(tx) {
    for (const ix of tx.transaction?.message?.instructions || []) {
        if (ix.program === 'spl-memo' && typeof ix.parsed === 'string')
            return ix.parsed.slice(0, 200);
    }
    return null;
}

const short = (a) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : 'unknown');
const fmtTokens = (n) => Math.round(n).toLocaleString('en-US');

/** How the tx moved `mint` tokens: the wallet's change, and who else gained (by owner). */
function tokenMoves(tx, wallet, mint) {
    if (!mint) return { mine: 0, gainers: [] };
    const amt = (b) =>
        Number(b?.uiTokenAmount?.uiAmount ?? b?.uiTokenAmount?.uiAmountString ?? 0) || 0;
    const byOwner = new Map();
    for (const b of tx.meta?.preTokenBalances || [])
        if (b.mint === mint) byOwner.set(b.owner, (byOwner.get(b.owner) || 0) - amt(b));
    for (const b of tx.meta?.postTokenBalances || [])
        if (b.mint === mint) byOwner.set(b.owner, (byOwner.get(b.owner) || 0) + amt(b));
    const gainers = [...byOwner]
        .filter(([o, d]) => o !== wallet && d > 0)
        .sort((a, b) => b[1] - a[1]);
    return { mine: byOwner.get(wallet) || 0, gainers };
}

/**
 * Turn one parsed transaction into a ledger row for `wallet`, or null when it moved no SOL for it.
 * Pure: everything it needs is passed in.
 */
export function classifyTx(tx, signature, wallet, known = {}) {
    if (!tx || tx.meta?.err) return null;
    const keys = (tx.transaction?.message?.accountKeys || []).map((k) =>
        typeof k === 'string' ? k : k.pubkey
    );
    const idx = keys.indexOf(wallet);
    if (idx < 0) return null;
    const delta = (tx.meta.postBalances?.[idx] ?? 0) - (tx.meta.preBalances?.[idx] ?? 0);
    if (!delta) return null;
    const direction = delta > 0 ? 'in' : 'out';
    const moves = transfers(tx);
    const peer =
        direction === 'in'
            ? moves.find((m) => m.destination === wallet)?.source
            : moves.find((m) => m.source === wallet)?.destination;
    const memo = direction === 'out' ? memoOf(tx) : null; // only our own memos
    const fromFeeSource = direction === 'in' && peer && (known.feeSources || []).includes(peer);
    const fromOperator = direction === 'in' && peer && peer === known.costs;
    if (direction === 'in' && !fromFeeSource && !fromOperator && delta < DUST_LAMPORTS) return null;
    let category = 'other';
    let label;
    if (direction === 'in') {
        if (fromFeeSource) {
            category = 'creator_fees';
            label = 'creator fees claimed from pump.fun';
        } else if (fromOperator) {
            label = 'operator top-up';
        } else {
            label = `incoming from ${short(peer)}`;
        }
    } else if (known.mint && keys.includes(known.mint)) {
        // Launch day receipts, said plainly: the creation, any buy at launch, any tokens moved out.
        const t = tokenMoves(tx, wallet, known.mint);
        category = 'launch';
        if (t.mine > 0) {
            label = `coin launch · launch buy of ${fmtTokens(t.mine)} $BPROOF (${((t.mine / 1e9) * 100).toFixed(2)}% of supply)`;
        } else if (t.mine < 0) {
            const to = t.gainers[0]?.[0];
            label = `moved ${fmtTokens(-t.mine)} $BPROOF to ${short(to)}`;
        } else {
            label = 'coin launch';
        }
    } else if (peer && peer === known.prize) {
        category = 'sweep';
        label = 'prize wallet top-up';
    } else if (peer && peer === known.costs) {
        category = /hosting/i.test(memo || '') ? 'hosting' : 'compute';
        label = `${category} reimbursement to the costs wallet`;
    } else {
        label = `outgoing to ${short(peer)}`;
    }
    return {
        id: signature,
        ts: (tx.blockTime || 0) * 1000,
        direction,
        category,
        lamports: Math.abs(delta),
        memo: memo ? `${label} · ${memo}` : label,
        tx: signature,
        // Sends from the treasury are made by the operator in the ClawPump dashboard (docs/TREASURY.md).
        source: direction === 'in' ? 'chain' : 'operator'
    };
}

async function knownAddresses(env) {
    let feeSources = [];
    try {
        feeSources = JSON.parse((await env.CONFIG.get('ledger:fee_sources')) || '[]');
    } catch {
        feeSources = [];
    }
    return {
        feeSources,
        prize: env.PRIZE_WALLET || null,
        costs: env.COSTS_WALLET || null,
        mint: env.TOKEN_MINT || null
    };
}

/** Cache SOL balances for /api/stats. */
export async function snapshotBalances(env, nowMs) {
    // creatorVault: pump.fun's per-creator fee account. Its balance is creator fees earned but not claimed yet.
    const wallets = {
        treasury: env.TREASURY_WALLET,
        prize: env.PRIZE_WALLET,
        creatorVault: env.CREATOR_VAULT
    };
    const out = { at: new Date(nowMs).toISOString() };
    for (const [k, addr] of Object.entries(wallets)) {
        if (!addr) continue;
        const r = await rpc(env, 'getBalance', [addr, { commitment: 'confirmed' }]);
        out[k] = r.value / 1e9;
    }
    await env.CONFIG.put('treasury:balances', JSON.stringify(out));
    return out;
}

/** Append the treasury's new SOL movements to the ledger, oldest first, a few per run. */
export async function syncLedger(env) {
    const wallet = env.TREASURY_WALLET;
    if (!wallet) return 0;
    const cursor = await env.CONFIG.get('ledger:cursor');
    const sigs = await rpc(env, 'getSignaturesForAddress', [
        wallet,
        { limit: 1000, commitment: 'confirmed', ...(cursor ? { until: cursor } : {}) }
    ]);
    const todo = (sigs || []).slice().reverse().slice(0, MAX_TX_PER_RUN); // oldest first
    if (!todo.length) return 0;
    const known = await knownAddresses(env);
    let written = 0;
    for (const s of todo) {
        if (!s.err) {
            const tx = await rpc(env, 'getTransaction', [
                s.signature,
                {
                    encoding: 'jsonParsed',
                    maxSupportedTransactionVersion: 1,
                    commitment: 'confirmed'
                }
            ]);
            const row = classifyTx(tx, s.signature, wallet, known);
            if (row) {
                await env.DB.prepare(
                    `INSERT OR IGNORE INTO ledger (id, ts, direction, category, amount_lamports, memo, tx_signature, source, measured)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'chain', 1)`
                )
                    .bind(
                        row.id,
                        row.ts,
                        row.direction,
                        row.category,
                        row.lamports,
                        row.memo,
                        row.tx
                    )
                    .run();
                written++;
            }
        }
        await env.CONFIG.put('ledger:cursor', s.signature);
    }
    return written;
}
