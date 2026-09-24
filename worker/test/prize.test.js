import test from 'node:test';
import assert from 'node:assert/strict';
import { LAMPORTS, pickWinner, prizeAmount } from '../src/lib/prize.js';

test('prize = min(10% of 24 h fees, 0.5 SOL); tiny prizes roll over; unmeasured fees pay nothing', () => {
    assert.deepEqual(prizeAmount(null, 0), {
        lamports: 0,
        rollover: 0,
        reason: 'fees not measured yet'
    });
    assert.equal(prizeAmount(2 * LAMPORTS).lamports, 0.2 * LAMPORTS);
    assert.equal(prizeAmount(50 * LAMPORTS).lamports, 0.5 * LAMPORTS, 'capped');
    const small = prizeAmount(0.05 * LAMPORTS);
    assert.equal(small.lamports, 0);
    assert.equal(small.rollover, 0.005 * LAMPORTS);
    assert.equal(
        prizeAmount(0.05 * LAMPORTS, small.rollover).lamports,
        0.01 * LAMPORTS,
        'rollover pays next day'
    );
    assert.equal(prizeAmount(-1).lamports, 0);
});

test('winner = best verified run with a passed bot check and an address; the rest are explained', () => {
    const board = [
        { id: 'r1', player_id: 'p1', status: 'pending', bot_check: 'passed' },
        { id: 'r2', player_id: 'p2', status: 'verified', bot_check: 'skipped' },
        { id: 'r3', player_id: 'p3', status: 'verified', bot_check: 'passed' },
        { id: 'r4', player_id: 'p4', status: 'verified', bot_check: 'passed' }
    ];
    const { winner, skipped } = pickWinner(
        board,
        new Map([
            ['p4', 'ADDR4'],
            ['p2', 'ADDR2']
        ])
    );
    assert.equal(winner.id, 'r4');
    assert.equal(winner.address, 'ADDR4');
    assert.deepEqual(
        skipped.map((s) => s.why),
        ['run pending', 'bot check not passed', 'no payout address']
    );
    assert.equal(pickWinner([], new Map()).winner, null);
});

test('pickWinner: a ranked run without a passed bot check never wins', () => {
    const board = ['none', 'skipped', 'passed'].map((bot_check, i) => ({
        id: `r${i}`,
        player_id: `p${i}`,
        status: 'verified',
        bot_check
    }));
    const addresses = new Map(board.map((r) => [r.player_id, `ADDR${r.id}`]));
    const { winner, skipped } = pickWinner(board, addresses);
    assert.equal(winner.id, 'r2');
    assert.deepEqual(
        skipped.map((s) => s.why),
        ['bot check not passed', 'bot check not passed']
    );
});

test("pickWinner: the operator's run ranks but the prize goes to the next eligible run", () => {
    const board = [
        { id: 'r1', player_id: 'op', status: 'verified', bot_check: 'passed' },
        { id: 'r2', player_id: 'p2', status: 'verified', bot_check: 'passed' }
    ];
    const addresses = new Map([
        ['op', 'ADDR_OP'],
        ['p2', 'ADDR2']
    ]);
    const { winner, skipped } = pickWinner(board, addresses, new Set(['op']));
    assert.equal(winner.id, 'r2');
    assert.equal(skipped[0].why, 'operator run, not prize-eligible');
});
