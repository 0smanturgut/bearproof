import test from 'node:test';
import assert from 'node:assert/strict';
import { Keypair, PublicKey } from '@solana/web3.js';
import { excludedPlayers } from '../src/cron.js';
import {
    LockLost,
    advancePot,
    claimDayPot,
    claimTopUp,
    dailyPotFrom,
    rolloverIn
} from '../src/dailypot.js';
import { planTopUp } from '../src/lib/pot.js';
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
async function advance(env, chain, now = NOW + 15 * 60000) {
    const lock = clock++;
    env.DB.db.prepare('UPDATE daily_winners SET lock_until = ? WHERE date = ?').run(lock, D);
    try {
        await advancePot(env, await row(env), { lock, chain, now });
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
    busy = 0,
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
            if (busy > 0) {
                busy--;
                throw Object.assign(new Error('jupiter: busy (HTTP 429: Rate limit)'), {
                    transient: true
                });
            }
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

test('advancePot: Jupiter too busy to quote is not a failed swap; after 6 h it counts', async () => {
    const env = await settled();
    const chain = fakeChain({ busy: 3 });
    await advance(env, chain);
    await advance(env, chain, NOW + 5 * 3600000);
    let note = await noteOf(env);
    assert.equal(note.step, 'claimed');
    assert.equal(note.swapFailures, undefined);
    assert.equal(note.jupiterBusy, 2);
    await advance(env, chain, NOW + 7 * 3600000); // still busy 7 h after the day was settled: one failure
    note = await noteOf(env);
    assert.equal(note.swapFailures, 1);
    await advance(env, chain, NOW + 7.25 * 3600000); // Jupiter answers: paid in $ANSEM
    const r = await row(env);
    assert.equal(r.payout_status, 'paid');
    assert.equal(r.payout_token, 'ANSEM');
    assert.equal(chain.s.swaps, 1);
});

test('advancePot: a share that still cannot be sent 72 h after the day was settled is marked failed', async () => {
    const env = await settled();
    const chain = fakeChain({ swapFails: 2 });
    await advance(env, chain);
    await advance(env, chain, NOW + 73 * 3600000); // second failed swap: SOL, but it is too late to send
    const note = await noteOf(env);
    assert.equal(transfers(chain).length, 0);
    assert.ok(note.recipients.every((r) => r.status === 'failed'));
    assert.match(note.recipients[0].lastError, /gave up after 72 h/);
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

// --- Top-up of a day whose pot was measured short ----------------------------------------------------------------

const TOP = `${D}:topup`;
const topNote = async (env) => JSON.parse((await row(env, TOP)).note);
/** The day as the 14 Oct one went: settled from a short measurement (pot 0.04 SOL) and paid in full. */
async function paidShort(opts) {
    const env = setup(opts);
    env.DB.db.prepare('UPDATE runs SET verified_at = ?').run(NOW - 3600000);
    await claim(env, { fees: 0.1 * SOL });
    await advance(env, fakeChain());
    assert.equal((await row(env)).payout_status, 'paid');
    return env;
}
const topUp = (env, opts = {}) =>
    claimTopUp(env, D, { fees: 0.5 * SOL, excluded: OPS, now: NOW + 9 * 3600000, ...opts });

test('claimTopUp: each player gets the difference to the plan the right pot makes, once', async () => {
    const env = await paidShort();
    assert.deepEqual(
        (await noteOf(env)).recipients.map((r) => [r.kind, r.playerId, r.lamports]),
        [
            ['place', 'p1', 0.024 * SOL],
            ['bounty', 'p1', 0.016 * SOL]
        ],
        'the short pot: one place, one bounty share'
    );
    assert.equal(await topUp(env), true);
    const note = await topNote(env);
    assert.deepEqual(
        note.recipients.map((r) => [r.kind, r.place ?? '-', r.playerId, r.lamports, r.paidBefore]),
        [
            ['place', 1, 'p1', 0.048 * SOL, 0.024 * SOL],
            ['place', 2, 'p2', 0.048 * SOL, undefined],
            ['bounty', '-', 'p1', 0.024 * SOL, 0.016 * SOL],
            ['bounty', '-', 'p2', 0.04 * SOL, undefined]
        ]
    );
    assert.equal(note.topUpOf, D);
    assert.deepEqual(note.paidBefore, { feesLamports: 0.1 * SOL, lamports: 0.04 * SOL });
    const r = await row(env, TOP);
    assert.equal(r.payout_status, 'pending');
    assert.equal(
        r.payout_amount,
        String(0.16 * SOL),
        'the new pot (0.2) less what was paid (0.04)'
    );
    assert.equal(await topUp(env), false, 'once');
    assert.deepEqual(
        await rolloverIn(env, '2026-09-28'),
        { places: 0, bounty: 0 },
        'the next day reads the day, not its top-up'
    );

    // The cron pays it like any day: its own swap, transfers and ledger rows.
    const chain = fakeChain();
    Object.assign(chain.s, { n: 100, swaps: 100 }); // signatures unique across both payouts, as on chain
    const lock = clock++;
    env.DB.db.prepare('UPDATE daily_winners SET lock_until = ? WHERE date = ?').run(lock, TOP);
    await advancePot(env, r, { lock, chain, now: NOW + 9 * 3600000 });
    assert.equal(chain.s.sent.filter((t) => t.kind === 'swap').length, 1);
    assert.equal(transfers(chain).length, 4);
    assert.equal((await row(env, TOP)).payout_status, 'paid');
    const memos = env.DB.db
        .prepare("SELECT memo FROM ledger WHERE memo LIKE '%:topup:%' ORDER BY memo")
        .all()
        .map((l) => l.memo);
    assert.deepEqual(memos, [
        `bearproof:prize:${TOP}:bounty`,
        `bearproof:prize:${TOP}:bounty`,
        `bearproof:prize:${TOP}:buy`,
        `bearproof:prize:${TOP}:place-1`,
        `bearproof:prize:${TOP}:place-2`
    ]);
});

test('claimTopUp: nothing when the pot was not short, or the day is not paid yet', async () => {
    const env = await paidShort();
    assert.equal(await topUp(env, { fees: 0.1 * SOL }), false, 'same measurement');
    assert.equal(await topUp(env, { fees: 0.05 * SOL }), false, 'a lower one');
    assert.equal(await row(env, TOP), null);
    const unpaid = setup();
    unpaid.DB.db.prepare('UPDATE runs SET verified_at = ?').run(NOW - 3600000);
    await claim(unpaid, { fees: 0.1 * SOL });
    assert.equal(await topUp(unpaid), false, 'still being paid');
    assert.equal(await topUp(setup()), false, 'never settled');
});

test('claimTopUp: works from what settling saw, not runs or addresses that came later', async () => {
    const env = await paidShort();
    const exec = (sql, ...a) => env.DB.db.prepare(sql).run(...a);
    // After the day was settled: a run verified late that would top the board, and p4 saving an address.
    exec(
        `INSERT INTO runs (id, player_id, mode, challenge_date, build, seed, claimed_score, claimed_time_ms,
           claimed_kills, claimed_level, duration_ms, status, bot_check, created_at, verified_at)
         VALUES ('late', 'p9', 'daily', ?, 5, 1, 9900, 0, 0, 1, 0, 'verified', 'passed', 1, ?)`,
        D,
        NOW + 3600000
    );
    exec(
        'INSERT INTO payout_addresses (player_id, sol_address, created_at) VALUES (?, ?, ?)',
        'p9',
        wallet(7),
        0
    );
    exec(
        'INSERT INTO payout_addresses (player_id, sol_address, created_at) VALUES (?, ?, ?)',
        'p4',
        wallet(6),
        NOW + 3600000
    );
    assert.equal(await topUp(env), true);
    const who = (await topNote(env)).recipients.map((r) => r.playerId);
    assert.equal(who.includes('p9'), false, 'verified after settling');
    assert.equal(who.includes('p4'), false, 'address saved after settling');
});

test('claimTopUp: a paid player who changed address since is topped up where they were paid', async () => {
    const env = await paidShort();
    env.DB.db
        .prepare('UPDATE payout_addresses SET sol_address = ?, created_at = ? WHERE player_id = ?')
        .run(wallet(8), NOW + 3600000, 'p1');
    assert.equal(await topUp(env), true);
    const p1 = (await topNote(env)).recipients.filter((r) => r.playerId === 'p1');
    assert.deepEqual(
        p1.map((r) => r.to),
        [wallet(2), wallet(2)]
    );
});

test('claimTopUp: a day with an unsent share is left for the operator', async () => {
    const env = await paidShort();
    const note = await noteOf(env);
    note.recipients[1].status = 'failed';
    env.DB.db
        .prepare('UPDATE daily_winners SET note = ? WHERE date = ?')
        .run(JSON.stringify(note), D);
    await assert.rejects(topUp(env), /wasn't sent/);
    assert.equal(await row(env, TOP), null);
});

test('planTopUp: refuses a corrected plan that drops, moves or shrinks a paid share', () => {
    const paid = [{ kind: 'place', place: 1, runId: 'r1', playerId: 'p1', to: 'A', lamports: 10 }];
    const keep = (x) => [{ ...paid[0], ...x }];
    assert.deepEqual(
        planTopUp(paid, keep({ lamports: 25 })).map((r) => [r.lamports, r.paidBefore]),
        [[15, 10]]
    );
    assert.throws(() => planTopUp(paid, []), /doesn't keep/);
    assert.throws(() => planTopUp(paid, keep({ playerId: 'p2' })), /doesn't keep/);
    assert.throws(() => planTopUp(paid, keep({ to: 'B' })), /doesn't keep/);
    assert.throws(() => planTopUp(paid, keep({ lamports: 9 })), /shrink/);
    assert.deepEqual(planTopUp(paid, keep({ lamports: 10 })), [], 'owed nothing: left out');
});

test('claimDayPot: a day from 15 Oct 2026 is capped at 0.5 SOL, an earlier one at 1 SOL', async () => {
    const env = setup();
    assert.equal(await claim(env, { fees: 13.28 * SOL }), true);
    assert.equal((await noteOf(env)).pot.lamports, 1 * SOL, `${D} keeps the 1 SOL cap`);
    const late = setup();
    for (const t of ['daily_challenges', 'runs'])
        late.DB.db
            .prepare(`UPDATE ${t} SET ${t === 'runs' ? 'challenge_date' : 'date'} = ?`)
            .run('2026-10-16');
    assert.equal(
        await claimDayPot(late, '2026-10-16', {
            fees: 13.28 * SOL,
            excluded: OPS,
            now: Date.parse('2026-10-17T00:20:00Z')
        }),
        true
    );
    const note = JSON.parse((await row(late, '2026-10-16')).note);
    assert.equal(note.pot.lamports, 0.5 * SOL);
    assert.equal(note.pot.reason, 'capped at 0.5 SOL');
});
