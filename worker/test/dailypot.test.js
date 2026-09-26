import test from 'node:test';
import assert from 'node:assert/strict';
import { Keypair, PublicKey } from '@solana/web3.js';
import { excludedPlayers } from '../src/cron.js';
import { LockLost, advancePot, claimDayPot, dailyPotFrom, rolloverIn } from '../src/dailypot.js';
import { LAMPORTS } from '../src/lib/prize.js';
import { fakeD1, fakeKV } from './helpers/d1.js';

const SOL = LAMPORTS;
const D = '2026-09-27';
const NOW = Date.parse('2026-09-28T00:20:00Z');
const OPS = new Set(['op']);
const wallet = (i) => Keypair.fromSeed(new Uint8Array(32).fill(i)).publicKey.toBase58();
const OFF_CURVE = PublicKey.findProgramAddressSync(
    [Buffer.from('vault')],
    new PublicKey(wallet(9))
)[0].toBase58();

function setup({
    bounty = { type: 'bosses', bosses: 1, name: 'Rug Lord Hunt' },
    pendingRun = false,
    archival = true
} = {}) {
    const DB = fakeD1();
    const exec = (sql, ...args) => DB.db.prepare(sql).run(...args);
    exec(
        'INSERT INTO daily_challenges (date, build, seed, stage, created_at) VALUES (?, 5, 1, ?, 0)',
        D,
        'chart'
    );
    const run = (id, player, score, status, bot, stats) =>
        exec(
            `INSERT INTO runs (id, player_id, mode, challenge_date, build, seed, claimed_score, claimed_time_ms,
               claimed_kills, claimed_level, duration_ms, status, bot_check, created_at, stats)
             VALUES (?, ?, 'daily', ?, 5, 1, ?, 0, 0, 1, 0, ?, ?, ?, ?)`,
            id,
            player,
            D,
            score,
            status,
            bot,
            score,
            stats
                ? JSON.stringify({ t: 600000, lvl: 30, k: 3000, bk: 0, won: false, ...stats })
                : null
        );
    run('r3', 'op', 9500, 'verified', 'passed', { bk: 1 }); // the operator: ranks, never paid
    run('r1', 'p1', 9000, 'verified', 'passed', { bk: 1 });
    run('r2', 'p2', 8000, 'verified', 'passed', { bk: 0 });
    run('r2b', 'p2', 5000, 'verified', 'passed', { bk: 1 }); // p2's weaker run clears the bounty
    run('r4', 'p4', 7000, 'verified', 'passed', { bk: 1 }); // no address
    run('r5', 'p5', 6000, 'verified', 'skipped', { bk: 1 }); // bot check not passed
    run('r6', 'p6', 99999, 'rejected', 'passed', { bk: 1 }); // failed verification: a cheat
    run('r7', 'p7', 4000, 'verified', 'passed', { bk: 1 }); // address that can't hold tokens
    if (pendingRun) run('r8', 'p8', 20000, 'pending', 'passed', null);
    for (const [p, a] of [
        ['op', wallet(1)],
        ['p1', wallet(2)],
        ['p2', wallet(3)],
        ['p5', wallet(5)],
        ['p7', OFF_CURVE]
    ])
        exec(
            'INSERT INTO payout_addresses (player_id, sol_address, created_at) VALUES (?, ?, 0)',
            p,
            a
        );
    return {
        DB,
        CONFIG: fakeKV(),
        PRIZE_WALLET_KEY: 'unused-by-the-fake-chain',
        ANSEM_MINT: 'ANSEM',
        ...(archival ? { HELIUS_API_KEY: 'test' } : {}),
        ASSETS: {
            fetch: async (req) =>
                new URL(req.url).pathname === '/b/5/bounty.json' && bounty
                    ? new Response(JSON.stringify(bounty))
                    : new Response('not found', { status: 404 })
        }
    };
}

const row = async (env, date = D) =>
    env.DB.prepare('SELECT * FROM daily_winners WHERE date = ?').bind(date).first();
const noteOf = async (env) => JSON.parse((await row(env)).note);
const claim = (env, opts = {}) =>
    claimDayPot(env, D, { fees: 0.5 * SOL, excluded: OPS, now: NOW, ...opts });

/** Hold the row's lock the way cron.js does, run advancePot, release it. */
let clock = 1;
async function advance(env, chain) {
    const lock = clock++;
    env.DB.db.prepare('UPDATE daily_winners SET lock_until = ? WHERE date = ?').run(lock, D);
    try {
        await advancePot(env, await row(env), { lock, chain });
    } finally {
        env.DB.db
            .prepare('UPDATE daily_winners SET lock_until = NULL WHERE date = ? AND lock_until = ?')
            .run(D, lock);
    }
}

test('claimDayPot: places and bounty shares go to the right players, once', async () => {
    const env = setup();
    assert.equal(await claim(env), true);
    const note = await noteOf(env);
    assert.deepEqual(
        note.recipients.map((r) => [r.kind, r.place ?? '-', r.playerId, r.lamports]),
        [
            ['place', 1, 'p1', 0.072 * SOL],
            ['place', 2, 'p2', 0.048 * SOL],
            ['bounty', '-', 'p1', 0.04 * SOL],
            ['bounty', '-', 'p2', 0.04 * SOL]
        ]
    );
    assert.equal(note.bounty.cleared, 5, 'op, p1, p2 (second run), p4, p7 cleared it');
    const r = await row(env);
    assert.equal(r.payout_status, 'pending');
    assert.equal(r.payout_amount, String(0.2 * SOL));
    assert.deepEqual(note.rollover.out, { places: 0, bounty: 0 });
    assert.equal(await claim(env), false, 'a day is settled once');
});

test('claimDayPot: the operator list is required (it never defaults to nobody)', async () => {
    await assert.rejects(claim(setup(), { excluded: undefined }), /operator list/);
});

test('claimDayPot: waits for the verifier, then settles without the stragglers after 12 h', async () => {
    const env = setup({ pendingRun: true });
    assert.equal(await claim(env), false);
    assert.equal(await row(env), null);
    const late = Date.parse(`${D}T00:00:00Z`) + 36 * 3600000 + 1;
    assert.equal(await claim(env, { now: late }), true);
    assert.match((await noteOf(env)).leftOut, /1 run/);
});

test('claimDayPot: a build without a bounty rolls the bounty share over', async () => {
    const env = setup({ bounty: null });
    await claim(env);
    const note = await noteOf(env);
    assert.deepEqual(
        note.recipients.map((r) => r.kind),
        ['place', 'place']
    );
    assert.equal(note.bounty.none, 'no bounty in this build');
    assert.equal(note.rollover.out.bounty, 0.08 * SOL);
});

test('claimDayPot: a day nobody could be paid is filed under a fair run, never a rejected one', async () => {
    const env = setup();
    await claim(env, { fees: null });
    const r = await row(env);
    assert.equal(r.payout_status, 'skipped');
    assert.equal(r.run_id, 'r1', 'not the rejected r6 (99,999) nor the operator');
});

test('rolloverIn: read from the last settled day in D1, so a rollover is used once', async () => {
    const env = setup({ bounty: null });
    env.CONFIG.map.set('prize:rollover', String(0.03 * SOL)); // the #1-only rule's, before the first pot day
    assert.deepEqual(await rolloverIn(env, D), { places: 0.03 * SOL, bounty: 0 });
    await claim(env);
    const note = await noteOf(env);
    assert.equal(note.rollover.in.places, 0.03 * SOL);
    assert.equal(env.CONFIG.map.get('prize:rollover'), '0');
    // Even if resetting that key had failed, the next day reads this day's rollover.out, not the key.
    env.CONFIG.map.set('prize:rollover', String(0.03 * SOL));
    assert.deepEqual(await rolloverIn(env, '2026-09-28'), { places: 0, bounty: 0.08 * SOL });
});

function fakeChain({
    balance = 1 * SOL,
    swapFails = 0,
    confirmFails = new Set(),
    refuse = new Map()
} = {}) {
    const s = { sent: [], swaps: 0, status: new Map(), bought: new Map(), readable: true, n: 0 };
    const signed = (to, amount, kind) => ({
        signature: `SIG${++s.n}`,
        lastValidBlockHeight: 100,
        raw: { to, amount, kind, sig: `SIG${s.n}` }
    });
    return {
        s,
        connection: () => ({}),
        signerFromSecret: async () => ({ publicKey: { toBase58: () => 'PRIZE' } }),
        mintInfo: async () => ({ programId: 'TOKEN_2022', decimals: 6 }),
        solBalance: async () => balance,
        signSwap: async () => {
            s.swaps++;
            if (s.swaps <= swapFails) throw new Error('jupiter: no route');
            return {
                signature: `SWAP${s.swaps}`,
                lastValidBlockHeight: 100,
                raw: { kind: 'swap', sig: `SWAP${s.swaps}` },
                quotedOut: 1_010_000n
            };
        },
        boughtBy: async (_c, sig) => (s.readable ? (s.bought.get(sig) ?? null) : null),
        signTokenTransfer: async (_c, _s, _m, to, amount) => signed(to, amount, 'token'),
        signSolTransfer: async (_c, _s, to, lamports) => signed(to, lamports, 'sol'),
        broadcast: async (_c, raw) => {
            const why = refuse.get(raw.sig);
            if (why) {
                refuse.delete(raw.sig);
                throw Object.assign(new Error(why), { name: 'SendTransactionError' });
            }
            s.sent.push(raw);
            if (raw.kind === 'swap') s.bought.set(raw.sig, 1_000_000n); // the fill, a little under the quote
        },
        confirmSignature: async (_c, sig) => {
            if (confirmFails.has(sig)) throw new Error('confirmation timed out');
            s.status.set(sig, 'confirmed');
            return sig;
        },
        signatureState: async (_c, sig) => s.status.get(sig) || 'expired',
        refusedBeforeSend: (err) =>
            /simulation failed|SendTransactionError/i.test(`${err.name} ${err.message}`)
    };
}

async function settled(opts) {
    const env = setup(opts);
    await claim(env);
    return env;
}
const transfers = (chain) => chain.s.sent.filter((t) => t.kind !== 'swap');

test('advancePot: one swap, what it bought split proportionally, ledger rows, then paid', async () => {
    const env = await settled();
    const chain = fakeChain();
    await advance(env, chain);
    assert.equal(chain.s.swaps, 1);
    assert.deepEqual(
        transfers(chain).map((t) => t.amount),
        [360000n, 240000n, 200000n, 200000n],
        'split of the 1,000,000 bought (read from the swap), not the 1,010,000 quoted'
    );
    const r = await row(env);
    assert.equal(r.payout_status, 'paid');
    assert.equal(r.payout_amount, '1000000');
    assert.equal(r.lock_until, null);
    const ledger = env.DB.db.prepare('SELECT memo FROM ledger ORDER BY memo').all();
    assert.deepEqual(
        ledger.map((l) => l.memo),
        [
            `bearproof:prize:${D}:bounty`,
            `bearproof:prize:${D}:bounty`,
            `bearproof:prize:${D}:buy`,
            `bearproof:prize:${D}:place-1`,
            `bearproof:prize:${D}:place-2`
        ]
    );
});

test('advancePot: without the lock it stops before sending anything', async () => {
    const env = await settled();
    const chain = fakeChain();
    await assert.rejects(advancePot(env, await row(env), { lock: 12345, chain }), LockLost);
    assert.equal(chain.s.sent.length, 0);
    assert.equal((await noteOf(env)).step, 'claimed');
});

test('advancePot: a swap that landed is never bought again, whatever went wrong after it', async () => {
    const env = await settled();
    // Its confirmation times out, and then its transaction isn't readable yet.
    const chain = fakeChain({ confirmFails: new Set(['SWAP1']) });
    await advance(env, chain);
    assert.equal((await noteOf(env)).swapSig, 'SWAP1');
    chain.s.status.set('SWAP1', 'confirmed');
    chain.s.readable = false;
    await advance(env, chain);
    assert.equal((await noteOf(env)).step, 'claimed');
    chain.s.readable = true;
    await advance(env, chain);
    assert.equal(chain.s.swaps, 1, 'one swap');
    const r = await row(env);
    assert.equal(r.payout_status, 'paid');
    assert.equal(r.payout_token, 'ANSEM', 'no SOL fallback');
});

test('advancePot: a transfer that landed but went unconfirmed is never sent twice', async () => {
    const env = await settled();
    const chain = fakeChain({ confirmFails: new Set(['SIG1']) });
    await advance(env, chain);
    assert.equal(transfers(chain).length, 4);
    assert.equal((await row(env)).payout_status, 'pending');
    chain.s.status.set('SIG1', 'confirmed'); // it had landed after all
    await advance(env, chain);
    assert.equal(transfers(chain).length, 4, 'no second transfer to place 1');
    assert.equal((await row(env)).payout_status, 'paid');
});

test('advancePot: a transfer that never landed is sent again once two runs agree it expired', async () => {
    const env = await settled();
    const chain = fakeChain({ confirmFails: new Set(['SIG1']) });
    await advance(env, chain);
    await advance(env, chain);
    assert.equal(transfers(chain).length, 4, 'one lookup is not enough to pay again');
    await advance(env, chain);
    assert.equal(transfers(chain).length, 5);
    assert.equal(transfers(chain)[4].amount, 360000n);
    assert.deepEqual(
        (await noteOf(env)).recipients.map((r) => [r.status, r.tx]),
        [
            ['sent', 'SIG5'],
            ['sent', 'SIG2'],
            ['sent', 'SIG3'],
            ['sent', 'SIG4']
        ]
    );
});

test('advancePot: on an RPC without history, an unconfirmed transfer is left for the operator', async () => {
    const env = await settled({ archival: false });
    const chain = fakeChain({ confirmFails: new Set(['SIG1']) });
    for (let i = 0; i < 4; i++) await advance(env, chain);
    assert.equal(transfers(chain).length, 4, 'never sent again');
    const first = (await noteOf(env)).recipients[0];
    assert.equal(first.sig, 'SIG1');
    assert.match(first.lastError, /left for the operator/);
    assert.equal((await row(env)).payout_status, 'pending');
});

test('advancePot: a transfer refused before it left the RPC is signed again next run', async () => {
    const env = await settled();
    const chain = fakeChain({
        refuse: new Map([['SIG1', 'Transaction simulation failed: insufficient funds']])
    });
    await advance(env, chain);
    const r0 = (await noteOf(env)).recipients[0];
    assert.equal(r0.sig, null);
    assert.equal(r0.attempts, 1);
    await advance(env, chain);
    assert.equal((await row(env)).payout_status, 'paid');
    assert.equal(transfers(chain).length, 4);
});

test('advancePot: waits for a top-up instead of failing when the prize wallet is short', async () => {
    const env = await settled();
    const chain = fakeChain({ balance: 0.1 * SOL });
    await advance(env, chain);
    assert.equal(chain.s.swaps, 0);
    const note = await noteOf(env);
    assert.equal(note.step, 'claimed');
    assert.match(note.waiting, /waiting for a top-up/);
});

test('advancePot: pays SOL after two failed swaps, and says so', async () => {
    const env = await settled();
    const chain = fakeChain({ swapFails: 2 });
    await advance(env, chain);
    assert.equal(chain.s.sent.length, 0);
    await advance(env, chain);
    assert.deepEqual(
        transfers(chain).map((t) => [t.kind, t.amount]),
        [
            ['sol', BigInt(0.072 * SOL)],
            ['sol', BigInt(0.048 * SOL)],
            ['sol', BigInt(0.04 * SOL)],
            ['sol', BigInt(0.04 * SOL)]
        ]
    );
    const r = await row(env);
    assert.equal(r.payout_status, 'paid');
    assert.equal(r.payout_token, 'SOL');
    assert.equal((await noteOf(env)).fallback, 'SOL after two failed swaps');
});

test('dailyPotFrom: decided once, 5 minutes after the 26 Sep poll closed', async () => {
    const open = Date.parse('2026-09-26T20:59:00Z');
    const justClosed = Date.parse('2026-09-26T21:01:00Z');
    const settledAt = Date.parse('2026-09-26T21:06:00Z');
    let asked = 0;
    const winner = (id) => async () => (asked++, id === undefined ? undefined : id && { id });

    let env = { CONFIG: fakeKV() };
    assert.equal(await dailyPotFrom(env, open, winner('op-daily-pot')), null);
    assert.equal(await dailyPotFrom(env, justClosed, winner('op-daily-pot')), null);
    assert.equal(asked, 0, 'the vote is not read until late votes have landed');
    assert.equal(await dailyPotFrom(env, settledAt, winner(undefined)), undefined, 'unknown');
    assert.equal(env.CONFIG.map.has('pot:from'), false, 'an unreadable vote is asked again');
    assert.equal(await dailyPotFrom(env, settledAt, winner('op-daily-pot')), '2026-09-27');
    assert.equal(await dailyPotFrom(env, settledAt, winner('stop-loss')), '2026-09-27', 'cached');

    env = { CONFIG: fakeKV() };
    assert.equal(await dailyPotFrom(env, settledAt, winner('stop-loss')), null);
    assert.equal(env.CONFIG.map.get('pot:from'), 'no');
    env = { CONFIG: fakeKV() };
    assert.equal(await dailyPotFrom(env, settledAt, winner(null)), null, 'no votes at all');
    const broken = { CONFIG: { get: async () => Promise.reject(new Error('KV down')) } };
    assert.equal(await dailyPotFrom(broken, settledAt, winner('op-daily-pot')), undefined);
});

test('excludedPlayers fails closed: an unreadable operator list stops the payout', async () => {
    assert.deepEqual(await excludedPlayers({ CONFIG: fakeKV() }), new Set());
    assert.deepEqual(
        await excludedPlayers({ CONFIG: fakeKV({ 'prize:excluded_players': '["op"]' }) }),
        new Set(['op'])
    );
    await assert.rejects(
        excludedPlayers({ CONFIG: fakeKV({ 'prize:excluded_players': 'not json' }) })
    );
    await assert.rejects(
        excludedPlayers({ CONFIG: { get: async () => Promise.reject(new Error('KV down')) } })
    );
});
