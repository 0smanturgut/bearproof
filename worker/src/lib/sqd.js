/**
 * The treasury and prize wallet, read from the chain by SQD Network (D75): an index of their on-chain moves that
 * doesn't come from our own ledger code, so anyone can compare the two (/api/onchain, /receipts).
 *
 * Source: the SQD Portal's public Solana dataset (https://portal.sqd.dev/datasets/solana-mainnet), finalized
 * blocks only. The cron reads forward from a cursor (CONFIG `sqd:state`, { cursor: last slot done, syncedAt }) a
 * few requests at a time: the public portal is rate-limited, and a 15-minute step of new slots is one or two
 * requests. On the very first run it starts BACKFILL_HOURS back. Re-reading a range is harmless (INSERT OR IGNORE),
 * so the cursor is written once per run. Rows are one per (transaction, wallet, asset): native SOL for both wallets,
 * and $ANSEM token accounts the prize wallet owns (the Daily Pot's payouts).
 */
import { all } from './db.js';

export const SQD_PORTAL = 'https://portal.sqd.dev/datasets/solana-mainnet';
export const BACKFILL_HOURS = 24;
const MAX_REQUESTS = 20;
const BUDGET_MS = 45000;

/** The stream query for a slot range. */
export function sqdQuery({ fromBlock, toBlock, wallets, ansemMint, prizeWallet }) {
    const tokenBalances =
        ansemMint && prizeWallet
            ? [
                  { preOwner: [prizeWallet], preMint: [ansemMint], transaction: true },
                  { postOwner: [prizeWallet], postMint: [ansemMint], transaction: true }
              ]
            : [];
    return {
        type: 'solana',
        fromBlock,
        toBlock,
        fields: {
            block: { number: true, timestamp: true },
            transaction: { transactionIndex: true, signatures: true, err: true },
            balance: { transactionIndex: true, account: true, pre: true, post: true },
            tokenBalance: {
                transactionIndex: true,
                account: true,
                preMint: true,
                postMint: true,
                preOwner: true,
                postOwner: true,
                preAmount: true,
                postAmount: true
            }
        },
        balances: [{ account: wallets, transaction: true }],
        ...(tokenBalances.length ? { tokenBalances } : {})
    };
}

const int = (v) => {
    try {
        return BigInt(typeof v === 'number' ? Math.trunc(v) : (v ?? 0));
    } catch {
        return 0n;
    }
};

/**
 * One response body (JSON Lines, one block per line) → the rows it holds and the last slot it covered.
 * Only the given wallets' SOL and the prize wallet's $ANSEM are kept; a zero change is not a move.
 */
export function parseBatch(text, { wallets, ansemMint, prizeWallet }) {
    const rows = [];
    let last = null;
    const mine = new Set(wallets);
    for (const line of String(text || '').split('\n')) {
        if (!line.trim()) continue;
        let b;
        try {
            b = JSON.parse(line);
        } catch {
            continue;
        }
        const head = b && b.header;
        if (!head || !Number.isFinite(head.number)) continue;
        last = head.number;
        const txs = new Map((b.transactions || []).map((t) => [t.transactionIndex, t]));
        const tx = (i) => txs.get(i);
        const ts = Number(head.timestamp) * 1000;
        for (const bal of b.balances || []) {
            if (!mine.has(bal.account)) continue;
            const delta = int(bal.post) - int(bal.pre);
            const t = tx(bal.transactionIndex);
            const sig = t && t.signatures && t.signatures[0];
            if (!sig || delta === 0n) continue;
            rows.push({
                sig,
                account: bal.account,
                asset: 'SOL',
                slot: head.number,
                ts,
                delta: String(delta),
                failed: t.err ? 1 : 0
            });
        }
        for (const tb of b.tokenBalances || []) {
            const mint = tb.postMint || tb.preMint;
            const owner = tb.postOwner || tb.preOwner;
            if (mint !== ansemMint || owner !== prizeWallet) continue;
            const delta = int(tb.postAmount) - int(tb.preAmount);
            const t = tx(tb.transactionIndex);
            const sig = t && t.signatures && t.signatures[0];
            if (!sig || delta === 0n) continue;
            rows.push({
                sig,
                account: prizeWallet,
                asset: mint,
                slot: head.number,
                ts,
                delta: String(delta),
                failed: t.err ? 1 : 0
            });
        }
    }
    return { rows, last };
}

async function getJson(fetcher, url) {
    const r = await fetcher(url, { headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(`sqd ${r.status} ${url.split('/').slice(-2).join('/')}`);
    return r.json();
}

/**
 * Read new finalized slots from SQD into `chain_moves`. Returns { from, to, head, requests, rows } or a reason
 * it stopped early. Safe to call every cron run: it never waits on a busy portal, it just goes on next time.
 */
export async function syncSqd(env, { now = Date.now(), fetcher = fetch } = {}) {
    const wallets = [env.TREASURY_WALLET, env.PRIZE_WALLET].filter(
        (w) => typeof w === 'string' && w
    );
    if (!wallets.length) return { skipped: 'no wallets' };
    const opts = {
        wallets,
        ansemMint: env.ANSEM_MINT || null,
        prizeWallet: env.PRIZE_WALLET || null
    };
    const head = (await getJson(fetcher, `${SQD_PORTAL}/finalized-head`)).number;
    if (!Number.isFinite(head)) return { skipped: 'no head' };
    const state = await readState(env);
    let cursor = state.cursor;
    if (cursor === null) {
        const at = Math.floor(now / 1000) - BACKFILL_HOURS * 3600;
        const start = (await getJson(fetcher, `${SQD_PORTAL}/timestamps/${at}/block`)).block_number;
        if (!Number.isFinite(start)) return { skipped: 'no start block' };
        cursor = start - 1;
    }
    const from = cursor + 1;
    let requests = 0;
    let written = 0;
    const t0 = Date.now();
    while (cursor < head && requests < MAX_REQUESTS && Date.now() - t0 < BUDGET_MS) {
        requests++;
        const r = await fetcher(`${SQD_PORTAL}/finalized-stream`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/jsonl' },
            body: JSON.stringify(sqdQuery({ fromBlock: cursor + 1, toBlock: head, ...opts }))
        });
        if (r.status === 204) {
            cursor = head; // nothing more up to head
            break;
        }
        if (r.status === 429 || r.status === 503 || r.status === 529) break; // busy: next run goes on
        if (!r.ok) throw new Error(`sqd stream ${r.status}`);
        const { rows, last } = parseBatch(await r.text(), opts);
        if (last === null || last <= cursor) break;
        if (rows.length) {
            await env.DB.batch(
                rows.map((x) =>
                    env.DB.prepare(
                        `INSERT OR IGNORE INTO chain_moves (sig, account, asset, slot, ts, delta, failed)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
                    ).bind(x.sig, x.account, x.asset, x.slot, x.ts, x.delta, x.failed)
                )
            );
            written += rows.length;
        }
        cursor = last;
    }
    await env.CONFIG.put('sqd:state', JSON.stringify({ cursor, syncedAt: now }));
    return { from, to: cursor, head, requests, rows: written };
}

/** CONFIG `sqd:state`: { cursor, syncedAt } (both null before the first run). */
export async function readState(env) {
    let st = null;
    try {
        st = JSON.parse((await env.CONFIG.get('sqd:state')) || 'null');
    } catch {
        st = null;
    }
    const cursor = Number(st && st.cursor);
    const syncedAt = Number(st && st.syncedAt);
    return {
        cursor: Number.isFinite(cursor) && cursor > 0 ? cursor : null,
        syncedAt: Number.isFinite(syncedAt) && syncedAt > 0 ? syncedAt : null
    };
}

/** The newest moves, each marked with whether our own ledger has the same transaction. */
export async function chainMoves(env, { limit = 60 } = {}) {
    const rows = await all(
        env,
        `SELECT m.sig, m.account, m.asset, m.slot, m.ts, m.delta, m.failed,
                EXISTS (SELECT 1 FROM ledger l WHERE l.tx_signature = m.sig) AS in_ledger
         FROM chain_moves m ORDER BY m.ts DESC, m.slot DESC LIMIT ?1`,
        limit
    );
    return rows;
}
