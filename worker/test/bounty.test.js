import test from 'node:test';
import assert from 'node:assert/strict';
import { BOUNTY_TYPES, bountyText, checkBounty, clearsBounty } from '../src/lib/bounty.js';

test('checkBounty keeps only the known fields of a valid bounty', () => {
    assert.deepEqual(checkBounty({ type: 'bosses', bosses: 1, name: 'Rug Lord Hunt', pay: 99 }), {
        ok: true,
        bounty: { type: 'bosses', bosses: 1, name: 'Rug Lord Hunt' }
    });
    assert.deepEqual(checkBounty({ type: 'win', name: 'Kill the bear' }).bounty, {
        type: 'win',
        name: 'Kill the bear'
    });
    for (const [type, spec] of Object.entries(BOUNTY_TYPES)) {
        if (!spec.param) continue;
        const at = (v) => checkBounty({ type, [spec.param]: v, name: 'Edge case' }).ok;
        assert.ok(at(spec.min) && at(spec.max), `${type}: bounds are inclusive`);
        assert.ok(!at(spec.min - 1) && !at(spec.max + 1), `${type}: out of range is refused`);
        assert.ok(!at(spec.min + 0.5) && !at(String(spec.min)), `${type}: integers only`);
    }
});

test('checkBounty refuses unknown types, missing names and names with links or handles', () => {
    assert.equal(checkBounty(null).ok, false);
    assert.equal(checkBounty([]).ok, false);
    assert.equal(checkBounty({ type: 'toString', name: 'Prototype' }).ok, false);
    assert.equal(checkBounty({ type: 'score', score: 5, name: 'Nope' }).ok, false);
    assert.equal(checkBounty({ type: 'win' }).ok, false);
    assert.equal(checkBounty({ type: 'win', name: 'ab' }).ok, false);
    assert.equal(checkBounty({ type: 'win', name: 'x'.repeat(33) }).ok, false);
    assert.equal(checkBounty({ type: 'win', name: 'go to evil.com' }).ok, false);
    assert.equal(checkBounty({ type: 'win', name: 'ask @someone' }).ok, false);
    assert.equal(checkBounty({ type: 'win', name: 'treasury drain' }).ok, false);
});

test('clearsBounty reads the verifier stats; ending the bear market counts as surviving', () => {
    const run = { t: 612000, lvl: 31, k: 2400, bk: 1, won: false };
    const b = (raw) => checkBounty({ name: 'Test bounty', ...raw }).bounty;
    assert.equal(clearsBounty(b({ type: 'survive', seconds: 600 }), run), true);
    assert.equal(clearsBounty(b({ type: 'survive', seconds: 900 }), run), false);
    assert.equal(clearsBounty(b({ type: 'survive', seconds: 900 }), { ...run, won: true }), true);
    assert.equal(clearsBounty(b({ type: 'level', level: 31 }), run), true);
    assert.equal(clearsBounty(b({ type: 'level', level: 32 }), run), false);
    assert.equal(clearsBounty(b({ type: 'kills', kills: 2500 }), run), false);
    assert.equal(clearsBounty(b({ type: 'bosses', bosses: 1 }), run), true);
    assert.equal(clearsBounty(b({ type: 'win' }), run), false);
    assert.equal(clearsBounty(b({ type: 'win' }), { ...run, won: true }), true);
    assert.equal(clearsBounty(b({ type: 'win' }), null), false);
    assert.equal(clearsBounty(null, run), false);
});

test('bountyText says the condition the same way everywhere', () => {
    const b = (raw) => checkBounty({ name: 'Test bounty', ...raw }).bounty;
    assert.equal(bountyText(b({ type: 'survive', seconds: 600 })), 'Survive to 10:00');
    assert.equal(bountyText(b({ type: 'survive', seconds: 330 })), 'Survive to 5:30');
    assert.equal(bountyText(b({ type: 'level', level: 30 })), 'Reach level 30');
    assert.equal(bountyText(b({ type: 'kills', kills: 5000 })), '5,000 kills in one run');
    assert.equal(bountyText(b({ type: 'bosses', bosses: 1 })), 'Defeat a boss');
    assert.equal(bountyText(b({ type: 'bosses', bosses: 2 })), 'Defeat 2 bosses');
    assert.equal(bountyText(b({ type: 'win' })), 'End the bear market');
    assert.equal(bountyText(null), null);
});
