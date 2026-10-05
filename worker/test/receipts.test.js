import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeD1, fakeKV } from './helpers/d1.js';
import { activity } from '../src/routes/activity.js';
import { waitingWhy, winners } from '../src/routes/winners.js';

const NOW = Date.parse('2026-10-05T22:00:00Z');
const ANSEM = '9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump';

function makeEnv() {
    return {
        DB: fakeD1(),
        CONFIG: fakeKV({ 'pot:from': '2026-09-27', payouts_enabled: 'true' }),
        TOKEN_MINT: 'mint',
        PRIZE_WALLET: 'prize'
    };
}

async function prizeRow(env, { tx, ts, lamports = null, tokens = null, memo }) {
    await env.DB.prepare(
        `INSERT INTO ledger (id, ts, direction, category, amount_lamports, token_mint, token_amount, memo, tx_signature, source, measured)
         VALUES (?1, ?2, 'out', 'prize', ?3, ?4, ?5, ?6, ?1, 'agent', 1)`
    )
        .bind(tx, ts, lamports, tokens ? ANSEM : null, tokens, memo)
        .run();
}

test('activity: a Daily Pot payout reads as what each player got, never as "0.000 SOL"', async () => {
    const env = makeEnv();
    const t = NOW - 15 * 60000;
    await prizeRow(env, {
        tx: 'buy',
        ts: t,
        lamports: 63477844,
        tokens: '48161568',
        memo: 'bearproof:prize:2026-10-04:buy'
    });
    await prizeRow(env, {
        tx: 'p1',
        ts: t + 3000,
        tokens: '17338167',
        memo: 'bearproof:prize:2026-10-04:place-1'
    });
    await prizeRow(env, {
        tx: 'p2',
        ts: t + 6000,
        tokens: '11558775',
        memo: 'bearproof:prize:2026-10-04:place-2'
    });
    await prizeRow(env, {
        tx: 'b1',
        ts: t + 9000,
        tokens: '9632313',
        memo: 'bearproof:prize:2026-10-04:bounty'
    });
    // 28 Sep was paid in SOL after two failed swaps: those shares carry lamports and no token amount.
    await prizeRow(env, {
        tx: 's1',
        ts: t - 3600000,
        lamports: 16624600,
        memo: 'bearproof:prize:2026-09-28:place-1'
    });
    await prizeRow(env, {
        tx: 's2',
        ts: t - 3590000,
        lamports: 11083067,
        memo: 'bearproof:prize:2026-09-28:bounty'
    });
    // The #1-only rule's single transfer is told by the prize line, not as a ledger line.
    await prizeRow(env, {
        tx: 'old',
        ts: t - 7200000,
        tokens: '7056614',
        memo: 'bearproof:prize:2026-09-26:send'
    });
    const { items } = await (await activity(env, NOW)).json();
    const by = Object.fromEntries(items.map((i) => [i.tx, i.text]));
    assert.equal(
        by.buy,
        'Prize wallet bought 48.16 $ANSEM with 0.063 SOL for the 2026-10-04 payout.'
    );
    assert.equal(by.p1, 'Prize wallet sent 17.34 $ANSEM to #1 of the 2026-10-04 Daily Challenge.');
    assert.equal(by.p2, 'Prize wallet sent 11.56 $ANSEM to #2 of the 2026-10-04 Daily Challenge.');
    assert.equal(
        by.b1,
        'Prize wallet sent 9.63 $ANSEM to a player who cleared the 2026-10-04 bounty.'
    );
    assert.equal(by.s1, 'Prize wallet sent 0.017 SOL to #1 of the 2026-09-28 Daily Challenge.');
    assert.equal(
        by.s2,
        'Prize wallet sent 0.011 SOL to a player who cleared the 2026-09-28 bounty.'
    );
    assert.equal(by.old, undefined);
    for (const i of items) assert.equal(/0\.000 SOL|bearproof:prize/.test(i.text), false, i.text);
});

test('winners: a payout waiting for the prize wallet says how much it holds and how much the day needs', async () => {
    assert.equal(
        waitingWhy('prize wallet holds 0.0421 SOL, needs 0.0835: waiting for a top-up'),
        'Payout waiting for the prize wallet top-up: at the last check it held 0.0421 SOL, and this day needs 0.0835 SOL.'
    );
    assert.equal(waitingWhy('waiting'), 'Payout waiting for the prize wallet top-up.');
    assert.equal(waitingWhy(true), 'Payout waiting for the prize wallet top-up.');

    const env = makeEnv();
    const note = {
        policy: 'daily-pot',
        step: 'claimed',
        recipients: [
            { kind: 'place', place: 1, playerId: 'p1', lamports: 22852024, status: 'pending' },
            { kind: 'bounty', playerId: 'p1', lamports: 12695569, status: 'pending' }
        ],
        waiting: 'prize wallet holds 0.0421 SOL, needs 0.0835: waiting for a top-up'
    };
    await env.DB.prepare(
        `INSERT INTO daily_winners (date, run_id, player_id, score, payout_status, payout_token, payout_amount, note, created_at)
         VALUES ('2026-10-04', 'r1', 'p1', 340587, 'pending', 'ANSEM', '35547593', ?1, ?2)`
    )
        .bind(JSON.stringify(note), NOW - 3600000)
        .run();
    const body = await (await winners(env)).json();
    const day = body.winners[0];
    assert.equal(day.status, 'pending');
    assert.equal(day.waiting, true);
    assert.match(day.why, /it held 0\.0421 SOL, and this day needs 0\.0835 SOL\.$/);
    assert.equal(day.amountRaw, null, 'nothing is shown as paid');
    assert.deepEqual(
        day.payouts.map((p) => [p.kind, p.status, p.amountRaw, p.tx]),
        [
            ['place', 'pending', null, null],
            ['bounty', 'pending', null, null]
        ]
    );
    assert.equal(JSON.stringify(body).includes('holds'), false, 'the cron’s own note stays inside');
});

test('activity: a relabelled treasury row keeps its direction', async () => {
    const env = makeEnv();
    const row = (id, direction, lamports, ts) =>
        env.DB.prepare(
            `INSERT INTO ledger (id, ts, direction, category, amount_lamports, memo, tx_signature, source, measured)
             VALUES (?1, ?2, ?3, 'other', ?4, 'unlabelled', ?1, 'chain', 1)`
        )
            .bind(id, ts, direction, lamports)
            .run();
    const out =
        '2b8AT4VtREWwajUraUj1LgWEnbftPsnVmKGkFJ5zedCbJzFaJWbQTufuAxEbjth7MogHg9QpauAezk6Yu63xZRD6';
    const back =
        '3StCepSeeWGfeJtBUEY7gAAJsuytM9QYsJLqemfKyCxKEyYK8FGu94oNBizBUdDkKRxxWvWcsCjqF9DpEexWL67H';
    await row(out, 'out', 200005000, Date.parse('2026-10-04T16:53:29Z'));
    await row(back, 'in', 200000000, Date.parse('2026-10-04T21:36:41Z'));
    const { items } = await (await activity(env, NOW)).json();
    const by = Object.fromEntries(items.map((i) => [i.tx, i.text]));
    assert.match(by[out], /^Treasury out: 0\.200 SOL, out and back: /);
    assert.match(by[back], /^Treasury in: 0\.200 SOL, out and back: /);
});
