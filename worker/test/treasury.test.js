import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyTx } from '../src/lib/treasury.js';

const T = 'Treasury1111111111111111111111111111111111';
const PRIZE = 'Prize11111111111111111111111111111111111111';
const COSTS = 'Costs11111111111111111111111111111111111111';
const FEES = 'FeeSrc1111111111111111111111111111111111111';
const MINT = 'Mint111111111111111111111111111111111111111';

function tx({ from, to, lamports, fee = 5000, memo, extraKeys = [], err = null }) {
    const keys = [from, to, '11111111111111111111111111111111', ...extraKeys];
    const pre = keys.map(() => 10e9);
    const post = pre.slice();
    post[0] -= lamports + fee;
    post[1] += lamports;
    const instructions = [
        {
            program: 'system',
            parsed: { type: 'transfer', info: { source: from, destination: to, lamports } }
        }
    ];
    if (memo) instructions.push({ program: 'spl-memo', parsed: memo });
    return {
        blockTime: 1790000000,
        meta: { err, fee, preBalances: pre, postBalances: post, innerInstructions: [] },
        transaction: { message: { accountKeys: keys.map((pubkey) => ({ pubkey })), instructions } }
    };
}

const known = { feeSources: [FEES], prize: PRIZE, costs: COSTS, mint: MINT };

test('inflow from a known fee source is creator fees', () => {
    const r = classifyTx(tx({ from: FEES, to: T, lamports: 2e8 }), 'sig1', T, known);
    assert.equal(r.direction, 'in');
    assert.equal(r.category, 'creator_fees');
    assert.equal(r.lamports, 2e8);
    assert.equal(r.ts, 1790000000000);
    assert.equal(r.id, 'sig1');
    assert.equal(r.source, 'chain');
});

test('inflow from an unknown wallet is never labelled as fees', () => {
    const r = classifyTx(
        tx({ from: 'Rando111111111111111111111111111111111111111', to: T, lamports: 1e8 }),
        's',
        T,
        known
    );
    assert.equal(r.category, 'other');
    assert.match(r.memo, /incoming from Rand…1111/);
});

test('an inflow from the costs wallet is labelled as such', () => {
    const r = classifyTx(tx({ from: COSTS, to: T, lamports: 3e7 }), 's', T, known);
    assert.equal(r.category, 'other');
    assert.equal(r.memo, 'incoming from the costs wallet');
});

test('outflows: prize top-up, compute and hosting reimbursements, launch', () => {
    assert.equal(
        classifyTx(tx({ from: T, to: PRIZE, lamports: 1e9 }), 's', T, known).category,
        'sweep'
    );
    const c = classifyTx(
        tx({ from: T, to: COSTS, lamports: 4e7, memo: 'bearproof:costs:2026-09-28 compute' }),
        's',
        T,
        known
    );
    assert.equal(c.category, 'compute');
    assert.match(c.memo, /bearproof:costs:2026-09-28/);
    assert.equal(c.lamports, 4e7 + 5000); // net change of the treasury, fee included
    assert.equal(c.source, 'operator');
    assert.equal(
        classifyTx(
            tx({ from: T, to: COSTS, lamports: 1e7, memo: 'hosting 2026-09' }),
            's',
            T,
            known
        ).category,
        'hosting'
    );
    assert.equal(
        classifyTx(
            tx({
                from: T,
                to: 'Pump1111111111111111111111111111111111111111',
                lamports: 12e6,
                extraKeys: [MINT]
            }),
            's',
            T,
            known
        ).category,
        'launch'
    );
});

test('failed transactions and transactions that do not touch the wallet are skipped', () => {
    assert.equal(
        classifyTx(tx({ from: FEES, to: T, lamports: 1, err: { x: 1 } }), 's', T, known),
        null
    );
    assert.equal(classifyTx(tx({ from: FEES, to: PRIZE, lamports: 1 }), 's', T, known), null);
    assert.equal(classifyTx(null, 's', T, known), null);
});

test('incoming memos are dropped and unknown dust is not listed', () => {
    const spam = tx({
        from: 'Rando111111111111111111111111111111111111111',
        to: T,
        lamports: 5e6,
        memo: 'claim at scam.example'
    });
    const r = classifyTx(spam, 's', T, known);
    assert.doesNotMatch(r.memo, /scam/);
    const dust = tx({
        from: 'Rando111111111111111111111111111111111111111',
        to: T,
        lamports: 1000
    });
    assert.equal(classifyTx(dust, 's', T, known), null);
    assert.equal(
        classifyTx(tx({ from: FEES, to: T, lamports: 1000 }), 's', T, known).category,
        'creator_fees'
    );
});

test('launch receipts: a launch buy and a token move are spelled out', () => {
    const OTHER = 'Other11111111111111111111111111111111111111';
    const bal = (owner, uiAmount) => ({ mint: MINT, owner, uiTokenAmount: { uiAmount } });
    const buy = tx({
        from: T,
        to: 'Curve111111111111111111111111111111111111111',
        lamports: 7e8,
        extraKeys: [MINT]
    });
    buy.meta.preTokenBalances = [];
    buy.meta.postTokenBalances = [bal(T, 24_845_151.9)];
    const r1 = classifyTx(buy, 's1', T, known);
    assert.equal(r1.category, 'launch');
    assert.match(r1.memo, /launch buy of 24,845,152 \$BPROOF \(2\.48% of supply\)/);

    const move = tx({ from: T, to: OTHER, lamports: 2e6, extraKeys: [MINT] });
    move.meta.preTokenBalances = [bal(T, 24_845_151.9)];
    move.meta.postTokenBalances = [bal(T, 0), bal(OTHER, 24_845_151.9)];
    const r2 = classifyTx(move, 's2', T, known);
    assert.equal(r2.category, 'launch');
    assert.equal(r2.memo, 'moved 24,845,152 $BPROOF to Othe…1111');
});

test('a treasury buy after launch day is a buyback, not the launch buy', () => {
    const bal = (owner, uiAmount) => ({ mint: MINT, owner, uiTokenAmount: { uiAmount } });
    const buy = tx({
        from: T,
        to: 'Curve111111111111111111111111111111111111111',
        lamports: 101_451_200,
        extraKeys: [MINT]
    });
    buy.blockTime = Date.parse('2026-09-29T10:58:56Z') / 1000;
    buy.meta.preTokenBalances = [];
    buy.meta.postTokenBalances = [bal(T, 1_107_008.31)];
    const r = classifyTx(buy, 's4', T, known);
    assert.equal(r.category, 'buyback');
    assert.equal(r.memo, 'buyback: bought 1,107,008 $BPROOF (0.11% of supply)');
});

test('a payment to a known launch address is the coin launch', () => {
    const LAUNCH = 'Launch1111111111111111111111111111111111111';
    const r = classifyTx(tx({ from: T, to: LAUNCH, lamports: 7e8 }), 's3', T, {
        ...known,
        launch: [LAUNCH]
    });
    assert.equal(r.category, 'launch');
    assert.match(r.memo, /coin launch: paid to ClawPump/);
});

test('vault accrual: a rise is new fees, a drop means a claim, the first reading counts nothing', async () => {
    const { vaultAccrual } = await import('../src/lib/treasury.js');
    assert.equal(vaultAccrual(NaN, 5e8), 0);
    assert.equal(vaultAccrual(1e8, 3e8), 2e8);
    assert.equal(vaultAccrual(3e8, 2e7), 2e7, 'claimed, then 0.02 SOL accrued again');
    assert.equal(vaultAccrual(3e8, 3e8), 0);
});

// --- Daily fees from the ledger, and when the ledger is complete ------------------------------------------------

const DAY_MS = 86400000;
const CLOSE = Date.parse('2026-10-15T00:00:00Z'); // the close of 14 Oct

async function feesEnv(rows, kv = {}) {
    const { fakeD1, fakeKV } = await import('./helpers/d1.js');
    const DB = fakeD1();
    for (const [i, [ts, category, direction, lamports]] of rows.entries())
        DB.db
            .prepare(
                `INSERT INTO ledger (id, ts, direction, category, amount_lamports, memo, tx_signature, source, measured)
                 VALUES (?, ?, ?, ?, ?, '', ?, 'chain', 1)`
            )
            .run(`r${i}`, ts, direction, category, lamports, `r${i}`);
    return { DB, CONFIG: fakeKV(kv), TREASURY_WALLET: T };
}

test('fees24h: the creator fees that reached the treasury that UTC day, from the ledger', async () => {
    const { fees24h } = await import('../src/cron.js');
    const env = await feesEnv([
        [CLOSE - DAY_MS - 1, 'creator_fees', 'in', 5e9], // 13 Oct, 23:59:59.999
        [CLOSE - DAY_MS, 'creator_fees', 'in', 2e8], // 14 Oct, 00:00
        [CLOSE - 7 * 60000, 'creator_fees', 'in', 12.56e9], // 23:53, after the coin moved to PumpSwap
        [CLOSE - 6 * 60000, 'other', 'out', 13e9],
        [CLOSE - 5 * 60000, 'other', 'in', 1e9], // not from ClawPump's fee address: not fees
        [CLOSE, 'creator_fees', 'in', 1.35e9] // 15 Oct
    ]);
    assert.equal(await fees24h(env, '2026-10-14'), 12.76e9);
});

test('fees24h settle: waits until the ledger was read past the close, at most 12 hours', async () => {
    const { fees24h } = await import('../src/cron.js');
    const rows = [[CLOSE - 60000, 'creator_fees', 'in', 3e9]];
    const at = (ms) => ({ settle: true, now: CLOSE + ms });
    const unread = await feesEnv(rows);
    assert.equal(
        await fees24h(unread, '2026-10-14', at(15 * 60000)),
        undefined,
        'never read: wait'
    );
    assert.equal(await fees24h(unread, '2026-10-14'), 3e9, 'the live pot reads it as it is');
    const early = await feesEnv(rows, { 'ledger:synced_at': String(CLOSE + 60000) });
    assert.equal(
        await fees24h(early, '2026-10-14', at(15 * 60000)),
        undefined,
        'read too soon after'
    );
    const read = await feesEnv(rows, { 'ledger:synced_at': String(CLOSE + 3 * 60000) });
    assert.equal(await fees24h(read, '2026-10-14', at(15 * 60000)), 3e9);
    assert.equal(
        await fees24h(unread, '2026-10-14', at(12 * 3600000 + 1)),
        3e9,
        '12 h after the close it settles with what the ledger has'
    );
});

test('syncLedger: says the ledger is complete only when it wrote everything the chain listed', async () => {
    const { syncLedger } = await import('../src/lib/treasury.js');
    const { fakeD1, fakeKV } = await import('./helpers/d1.js');
    const NOW = CLOSE + 10 * 60000;
    const realFetch = globalThis.fetch;
    const run = async (n, { missing = new Set(), blockTime = NOW / 1000 - 60 } = {}) => {
        const sigs = Array.from({ length: n }, (_, i) => ({
            signature: `s${n - 1 - i}`, // newest first, like the RPC
            err: null,
            blockTime
        }));
        globalThis.fetch = async (url, init) => {
            const { method, params } = JSON.parse(init.body);
            const result =
                method === 'getSignaturesForAddress'
                    ? sigs
                    : missing.has(params[0])
                      ? null
                      : { ...tx({ from: FEES, to: T, lamports: 1e8 }), blockTime };
            return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, result }) };
        };
        const env = {
            DB: fakeD1(),
            CONFIG: fakeKV({ 'ledger:fee_sources': JSON.stringify([FEES]) }),
            TREASURY_WALLET: T
        };
        try {
            const written = await syncLedger(env, NOW);
            return { written, kv: env.CONFIG.map };
        } finally {
            globalThis.fetch = realFetch;
        }
    };
    let r = await run(0);
    assert.equal(r.kv.get('ledger:synced_at'), String(NOW), 'nothing new: complete');
    r = await run(3);
    assert.equal(r.kv.get('ledger:cursor'), 's2');
    assert.equal(r.kv.get('ledger:synced_at'), String(NOW), 'all three written: complete');
    r = await run(11);
    assert.equal(r.kv.get('ledger:cursor'), 's9', 'ten per run');
    assert.equal(r.kv.has('ledger:synced_at'), false, 'one left for the next run: not complete');
    r = await run(3, { missing: new Set(['s1']) });
    assert.equal(
        r.kv.get('ledger:cursor'),
        's0',
        'stops before a listed tx the RPC cannot serve yet'
    );
    assert.equal(r.kv.has('ledger:synced_at'), false);
    r = await run(3, { missing: new Set(['s1']), blockTime: NOW / 1000 - 3600 });
    assert.equal(r.kv.get('ledger:cursor'), 's2', 'an old unreadable tx is skipped, not waited on');
});
