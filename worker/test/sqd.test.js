import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBatch, sqdQuery, syncSqd, readState, SQD_PORTAL } from '../src/lib/sqd.js';
import { onchain, units } from '../src/routes/onchain.js';
import { fakeD1, fakeKV } from './helpers/d1.js';

const TREASURY = 'GNJoHj9yfn3jqNNkC5ffQDaB5vTrnvVqy4FjQuXmBLS6';
const PRIZE = 'GD9HPVpLqDxYfgf9ZNQDN3WwCfZips7tVCHAhMcchRo5';
const ANSEM = '9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump';
const OPTS = { wallets: [TREASURY, PRIZE], ansemMint: ANSEM, prizeWallet: PRIZE };

// What the SQD Portal answers: JSON Lines, one block per line, boundary blocks with a header only.
const block = (number, extra = {}) =>
    JSON.stringify({ header: { number, timestamp: 1792262000 + number }, ...extra });
const BATCH = [
    block(100),
    block(105, {
        transactions: [
            { transactionIndex: 3, signatures: ['FeeClaimSig'], err: null },
            { transactionIndex: 7, signatures: ['DustSig'], err: null }
        ],
        balances: [
            { transactionIndex: 3, account: TREASURY, pre: 95000000, post: 112152471 },
            {
                transactionIndex: 3,
                account: 'SomeoneElse1111111111111111111111111111111',
                pre: 5,
                post: 1
            },
            { transactionIndex: 7, account: TREASURY, pre: 112152471, post: 112167471 }
        ]
    }),
    block(110, {
        transactions: [
            { transactionIndex: 1, signatures: ['PayoutSig'], err: null },
            {
                transactionIndex: 2,
                signatures: ['FailedSig'],
                err: { InstructionError: [0, 'Custom'] }
            },
            { transactionIndex: 4, signatures: ['OtherMintSig'], err: null }
        ],
        balances: [
            { transactionIndex: 1, account: PRIZE, pre: 900000000, post: 899995000 },
            { transactionIndex: 2, account: PRIZE, pre: 899995000, post: 899990000 }
        ],
        tokenBalances: [
            {
                transactionIndex: 1,
                account: 'PrizeAta',
                preMint: ANSEM,
                postMint: ANSEM,
                preOwner: PRIZE,
                postOwner: PRIZE,
                preAmount: 193745883,
                postAmount: 151216288
            },
            {
                transactionIndex: 1,
                account: 'WinnerAta',
                preMint: ANSEM,
                postMint: ANSEM,
                preOwner: 'Winner',
                postOwner: 'Winner',
                preAmount: 0,
                postAmount: 42529595
            },
            {
                transactionIndex: 4,
                account: 'PrizeOther',
                preMint: 'OtherMint',
                postMint: 'OtherMint',
                preOwner: PRIZE,
                postOwner: PRIZE,
                preAmount: 5,
                postAmount: 1
            }
        ]
    }),
    block(120)
].join('\n');

test('sqd: the query asks for both wallets’ SOL and the prize wallet’s $ANSEM, with their transactions', () => {
    const q = sqdQuery({ fromBlock: 10, toBlock: 20, ...OPTS });
    assert.equal(q.type, 'solana');
    assert.deepEqual(q.balances, [{ account: [TREASURY, PRIZE], transaction: true }]);
    assert.equal(q.tokenBalances.length, 2);
    assert.deepEqual(q.tokenBalances[0].preOwner, [PRIZE]);
    assert.deepEqual(q.tokenBalances[1].postMint, [ANSEM]);
    assert.ok(
        q.fields.transaction.signatures && q.fields.balance.pre && q.fields.tokenBalance.postAmount
    );
});

test('sqd: a batch becomes one row per transaction, wallet and asset; others and zero changes are dropped', () => {
    const { rows, last } = parseBatch(BATCH, OPTS);
    assert.equal(last, 120, 'the last block of the batch, data or not');
    const by = (sig, asset = 'SOL') => rows.find((r) => r.sig === sig && r.asset === asset);
    assert.equal(rows.length, 5);
    assert.equal(by('FeeClaimSig').delta, '17152471');
    assert.equal(by('FeeClaimSig').account, TREASURY);
    assert.equal(by('DustSig').delta, '15000');
    assert.equal(by('PayoutSig').delta, '-5000', 'the network fee');
    assert.equal(
        by('PayoutSig', ANSEM).delta,
        '-42529595',
        'the $ANSEM that left the prize wallet'
    );
    assert.equal(by('FailedSig').failed, 1);
    assert.ok(!rows.some((r) => r.sig === 'OtherMintSig'), 'another token is not ours to show');
    assert.ok(!rows.some((r) => r.account.startsWith('Someone')));
    assert.equal(parseBatch('not json\n\n', OPTS).last, null);
});

function fakePortal({ head = 120, start = 100, answers = [] } = {}) {
    const calls = [];
    const fetcher = async (url, init = {}) => {
        calls.push({ url, body: init.body ? JSON.parse(init.body) : null });
        if (url.endsWith('/finalized-head')) return Response.json({ number: head, hash: 'h' });
        if (url.includes('/timestamps/')) return Response.json({ block_number: start });
        const next = answers.shift();
        if (!next) return new Response(null, { status: 204 });
        if (typeof next === 'number') return new Response('{"error":{}}', { status: next });
        return new Response(next, { status: 200 });
    };
    return { fetcher, calls };
}

test('sqd sync: the first run starts a day back, writes what it finds and remembers where it stopped', async () => {
    const env = {
        DB: fakeD1(),
        CONFIG: fakeKV(),
        TREASURY_WALLET: TREASURY,
        PRIZE_WALLET: PRIZE,
        ANSEM_MINT: ANSEM
    };
    const { fetcher, calls } = fakePortal({ answers: [BATCH] });
    const out = await syncSqd(env, { now: 1792300000000, fetcher });
    assert.equal(out.from, 100);
    assert.equal(out.to, 120);
    assert.equal(out.rows, 5);
    assert.ok(calls[1].url.includes('/timestamps/'), 'the backfill start comes from a timestamp');
    assert.equal(calls[2].url, `${SQD_PORTAL}/finalized-stream`);
    assert.equal(calls[2].body.fromBlock, 100);
    assert.deepEqual(await readState(env), { cursor: 120, syncedAt: 1792300000000 });
    const n = env.DB.db.prepare('SELECT COUNT(*) AS n FROM chain_moves').get().n;
    assert.equal(n, 5);

    // Next run: from the cursor; a re-read of the same rows adds nothing.
    const again = fakePortal({
        head: 130,
        answers: [BATCH.replace('"number":120', '"number":130')]
    });
    const out2 = await syncSqd(env, { now: 1792300900000, fetcher: again.fetcher });
    assert.equal(again.calls[1].body.fromBlock, 121, 'no timestamp lookup once there is a cursor');
    assert.equal(out2.to, 130);
    assert.equal(env.DB.db.prepare('SELECT COUNT(*) AS n FROM chain_moves').get().n, 5);
});

test('sqd sync: a busy portal ends the run quietly, keeping the cursor where it was', async () => {
    const env = {
        DB: fakeD1(),
        CONFIG: fakeKV({ 'sqd:state': JSON.stringify({ cursor: 110, syncedAt: 1 }) }),
        TREASURY_WALLET: TREASURY,
        PRIZE_WALLET: PRIZE
    };
    const { fetcher } = fakePortal({ head: 200, answers: [529] });
    const out = await syncSqd(env, { now: 5, fetcher });
    assert.equal(out.requests, 1);
    assert.equal(out.to, 110);
    assert.equal((await readState(env)).cursor, 110);
    // Nothing more to read up to the head: 204, and the cursor moves to the head.
    const quiet = fakePortal({ head: 200, answers: [] });
    assert.equal((await syncSqd(env, { now: 6, fetcher: quiet.fetcher })).to, 200);
});

test('/api/onchain: each move says whether our ledger has it, and why not when that is the rule', async () => {
    const env = {
        DB: fakeD1(),
        CONFIG: fakeKV(),
        TREASURY_WALLET: TREASURY,
        PRIZE_WALLET: PRIZE,
        ANSEM_MINT: ANSEM
    };
    const now = Date.now();
    const rows = parseBatch(BATCH, OPTS).rows.map((r, i) => ({ ...r, ts: now - (i + 1) * 60000 }));
    for (const r of rows)
        env.DB.db
            .prepare(
                'INSERT INTO chain_moves (sig, account, asset, slot, ts, delta, failed) VALUES (?, ?, ?, ?, ?, ?, ?)'
            )
            .run(r.sig, r.account, r.asset, r.slot, r.ts, r.delta, r.failed);
    env.DB.db
        .prepare(
            `INSERT INTO ledger (id, ts, direction, category, amount_lamports, tx_signature, source) VALUES
             ('a', ?1, 'in', 'creator_fees', 17152471, 'FeeClaimSig', 'chain'),
             ('b', ?1, 'out', 'prize', NULL, 'PayoutSig', 'chain')`
        )
        .run(now);
    const body = await (await onchain(env)).json();
    assert.equal(body.source.name, 'SQD Network');
    const find = (tx, asset = 'SOL') => body.moves.find((m) => m.tx === tx && m.asset === asset);
    assert.equal(find('FeeClaimSig').inLedger, true);
    assert.equal(find('FeeClaimSig').amount, '0.017152471');
    assert.equal(find('FeeClaimSig').wallet, 'treasury');
    assert.equal(find('PayoutSig', 'ANSEM').amount, '-42.529595');
    assert.equal(find('PayoutSig', 'ANSEM').inLedger, true);
    assert.equal(find('DustSig').inLedger, false);
    assert.match(find('DustSig').note, /dust/);
    assert.match(find('FailedSig').note, /failed/);
    const t = body.last24h.find((d) => d.wallet === 'treasury' && d.asset === 'SOL');
    assert.equal(t.in, '0.017167471');
    assert.equal(t.moves, 2);
    assert.equal(t.inLedger, 1);
});

test('units: base units to a decimal string, sign kept, trailing zeros dropped', () => {
    assert.equal(units('17152471', 9), '0.017152471');
    assert.equal(units('-1500000000', 9), '-1.5');
    assert.equal(units('42529595', 6), '42.529595');
    assert.equal(units('0', 9), '0');
});
