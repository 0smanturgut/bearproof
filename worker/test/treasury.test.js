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

test('operator top-up from the costs wallet', () => {
    const r = classifyTx(tx({ from: COSTS, to: T, lamports: 3e7 }), 's', T, known);
    assert.equal(r.category, 'other');
    assert.equal(r.memo, 'operator top-up');
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

test('a payment to a known launch address is the coin launch', () => {
    const LAUNCH = 'Launch1111111111111111111111111111111111111';
    const r = classifyTx(tx({ from: T, to: LAUNCH, lamports: 7e8 }), 's3', T, {
        ...known,
        launch: [LAUNCH]
    });
    assert.equal(r.category, 'launch');
    assert.match(r.memo, /coin launch: paid to ClawPump/);
});
