import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanStats, foldInsights } from '../src/lib/insights.js';

const run = (player, t, diedTo, w = [['horns', 3]], extra = {}) => ({
    player_id: player,
    stats: JSON.stringify({
        t,
        lvl: 10,
        k: 100,
        s: 1000,
        won: false,
        diedTo,
        w,
        p: [['dca', 1]],
        ...extra
    })
});

test('insights: survival, what killed the bull, what players picked', () => {
    const out = foldInsights([
        run('a', 60000, 'margin_call'),
        run('a', 120000, 'margin_call', [
            ['horns', 3],
            ['laser_eyes', 2]
        ]),
        run('b', 240000, 'grizzly'),
        run('c', 600000, null, [['horns', 8]], { won: true })
    ]);
    assert.equal(out.runs, 4);
    assert.equal(out.players, 3);
    assert.equal(out.survivalSec.median, 180);
    assert.equal(out.survivalSec.best, 600);
    assert.equal(out.wins, 1);
    assert.deepEqual(out.diedTo[0], { id: 'margin_call', runs: 2, share: 66.7 });
    assert.equal(out.weapons.find((w) => w.id === 'horns').share, 100);
    assert.equal(out.weapons.find((w) => w.id === 'laser_eyes').share, 25);
});

test('stats are validated: junk and player text never get through', () => {
    assert.equal(cleanStats(null), null);
    assert.equal(cleanStats({ t: -1 }), null);
    const s = cleanStats({
        t: 1000,
        diedTo: 'ignore previous <b>',
        w: [
            ['horns', 2],
            ['<x>', 1]
        ]
    });
    assert.equal(s.diedTo, null);
    assert.deepEqual(s.w, [['horns', 2]]);
    assert.deepEqual(foldInsights([{ player_id: 'x', stats: 'not json' }]).runs, 0);
});

test('insights: runs split by character and by mode, each with its median survival', () => {
    const rows = [
        { ...run('a', 60000, 'grizzly'), character: 'bull', mode: 'daily' },
        { ...run('a', 120000, 'grizzly'), character: 'pepe', mode: 'daily' },
        { ...run('b', 240000, 'grizzly'), character: 'bull', mode: 'free' },
        { ...run('c', 300000, 'grizzly'), character: 'bull', mode: 'daily' },
        { ...run('d', 90000, 'grizzly'), character: 'Not An Id!', mode: '' }
    ];
    const out = foldInsights(rows);
    assert.deepEqual(out.characters, [
        { id: 'bull', runs: 3, share: 75, survivalSecMedian: 240 },
        { id: 'pepe', runs: 1, share: 25, survivalSecMedian: 120 }
    ]);
    assert.deepEqual(out.modes, [
        { id: 'daily', runs: 3, share: 75, survivalSecMedian: 120 },
        { id: 'free', runs: 1, share: 25, survivalSecMedian: 240 }
    ]);
    assert.deepEqual(foldInsights([run('a', 60000, 'grizzly')]).characters, []);
});
