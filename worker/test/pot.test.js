import test from 'node:test';
import assert from 'node:assert/strict';
import { LAMPORTS } from '../src/lib/prize.js';
import {
    MAX_BOUNTY_SHARES,
    POT_CAP_LAMPORTS,
    ROLLOVER_CAP_LAMPORTS,
    SHARE_MIN_LAMPORTS,
    bountyShares,
    placeShares,
    planPot,
    potAmount,
    splitBought
} from '../src/lib/pot.js';

const SOL = LAMPORTS;
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

test('pot = min(40% of the day’s fees, 1 SOL), split 60/40; unmeasured fees pay nothing', () => {
    assert.deepEqual(potAmount(null), {
        lamports: 0,
        places: 0,
        bounty: 0,
        reason: 'fees not measured yet'
    });
    assert.equal(potAmount(-5).lamports, 0);
    const p = potAmount(0.234 * SOL); // 25 Sep, measured
    assert.equal(p.lamports, Math.floor(0.234 * SOL * 0.4));
    assert.equal(p.places + p.bounty, p.lamports);
    assert.equal(p.places, Math.floor(p.lamports * 0.6));
    assert.equal(potAmount(10 * SOL).lamports, POT_CAP_LAMPORTS);
    assert.equal(potAmount(10 * SOL).reason, 'capped at 1 SOL');
});

test('places: as many of the top 10 as keep every share at 0.01 SOL or more', () => {
    // 25 Sep: 0.0562 SOL for places pays 3 places.
    const s25 = placeShares(0.0562 * SOL, 11);
    assert.equal(s25.length, 3);
    assert.ok(s25[2] >= SHARE_MIN_LAMPORTS);
    assert.ok(s25[0] > s25[1] && s25[1] > s25[2], 'best place gets most');
    // 24 Sep: 0.248 SOL pays 7.
    assert.equal(placeShares(0.248 * SOL, 22).length, 7);
    // Enough for all ten.
    assert.equal(placeShares(1 * SOL, 40).length, 10);
    // Never more places than eligible players; one player takes it all.
    assert.deepEqual(placeShares(0.05 * SOL, 1), [0.05 * SOL]);
    // Too small for even one place.
    assert.deepEqual(placeShares(0.009 * SOL, 5), []);
    assert.deepEqual(placeShares(1 * SOL, 0), []);
    for (const total of [0.0562, 0.248, 0.6, 1].map((x) => x * SOL))
        assert.ok(sum(placeShares(total, 10)) <= total, 'never pays more than the total');
});

test('bounty: equal shares, fewer when they would drop under 0.01 SOL, at most 25', () => {
    assert.deepEqual(bountyShares(0.0374 * SOL, 2), [0.0187 * SOL, 0.0187 * SOL]);
    assert.equal(bountyShares(0.0374 * SOL, 5).length, 3, 'best three of five');
    assert.deepEqual(bountyShares(0.0374 * SOL, 0), []);
    assert.deepEqual(bountyShares(0.009 * SOL, 3), []);
    assert.equal(bountyShares(1 * SOL, 100).length, MAX_BOUNTY_SHARES);
});

const run = (id, player, score) => ({ id, player_id: player, claimed_score: score });

test('planPot: places skip the operator and players without an address, one place per address', () => {
    const board = [
        run('r1', 'op', 900),
        run('r2', 'p2', 800),
        run('r3', 'p3', 700),
        run('r4', 'p4', 600),
        run('r5', 'p5', 500),
        run('r6', 'p6', 400)
    ];
    const addresses = new Map([
        ['op', 'OPERATOR'],
        ['p2', 'A2'],
        ['p4', 'A4'],
        ['p5', 'A2'], // same person, second browser
        ['p6', 'A6']
    ]);
    const plan = planPot({
        board,
        clearers: null,
        addresses,
        excluded: new Set(['op']),
        pot: { places: 0.3 * SOL, bounty: 0.2 * SOL },
        rollover: { places: 0, bounty: 0 }
    });
    assert.deepEqual(
        plan.recipients.map((r) => [r.kind, r.place, r.playerId, r.to]),
        [
            ['place', 1, 'p2', 'A2'],
            ['place', 2, 'p4', 'A4'],
            ['place', 3, 'p6', 'A6']
        ]
    );
    assert.deepEqual(
        plan.skipped.map((s) => s.why),
        [
            'operator run, not prize-eligible',
            'no payout address',
            'address already paid a share of this kind'
        ]
    );
    // No bounty in this build: its share rolls over (capped); the places were paid, so nothing rolls there.
    assert.deepEqual(plan.rollover, { places: 0, bounty: 0.2 * SOL });
});

test('planPot: bounty clearers share equally; a player can win a place and a bounty share', () => {
    const plan = planPot({
        board: [run('r1', 'p1', 900), run('r2', 'p2', 800)],
        clearers: [run('r1', 'p1', 900), run('r9', 'p3', 300)],
        addresses: new Map([
            ['p1', 'A1'],
            ['p2', 'A2'],
            ['p3', 'A3']
        ]),
        pot: { places: 0.05 * SOL, bounty: 0.03 * SOL },
        rollover: { places: 0, bounty: 0.01 * SOL }
    });
    const bounty = plan.recipients.filter((r) => r.kind === 'bounty');
    assert.deepEqual(
        bounty.map((r) => [r.playerId, r.lamports]),
        [
            ['p1', 0.02 * SOL],
            ['p3', 0.02 * SOL]
        ]
    );
    assert.deepEqual(plan.rollover, { places: 0, bounty: 0 });
});

test('planPot: nothing payable rolls over, capped at 0.5 SOL each', () => {
    const plan = planPot({
        board: [run('r1', 'p1', 900)],
        clearers: [],
        addresses: new Map(),
        pot: { places: 0.6 * SOL, bounty: 0.4 * SOL },
        rollover: { places: 0.2 * SOL, bounty: 0.3 * SOL }
    });
    assert.deepEqual(plan.recipients, []);
    assert.deepEqual(plan.rollover, {
        places: ROLLOVER_CAP_LAMPORTS,
        bounty: ROLLOVER_CAP_LAMPORTS
    });
});

test('splitBought: proportional, exact total, dust to the first recipient', () => {
    const parts = splitBought(1000n, [0.03 * SOL, 0.02 * SOL, 0.01 * SOL]);
    assert.equal(
        parts.reduce((a, b) => a + b, 0n),
        1000n
    );
    assert.deepEqual(parts, [501n, 333n, 166n]);
    assert.deepEqual(splitBought(0n, [5, 5]), [0n, 0n]);
});
