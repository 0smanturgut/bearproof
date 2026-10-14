// Bear Trap's opening (Build #23): its extra doomposters join from 1:00, like on every other stage. From 0:00 the
// opening ring was ~60% shooters, and a bull that stood still died in about 12 s.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/sim.js';
import { createBot } from '../src/sim/bot.js';
import { STAGES, WAVES, wavesFor } from '../src/sim/content.js';

test('bear trap: no doomposters in the waves before 1:00, in every wave from 1:00', () => {
    assert.equal(STAGES.BEAR_TRAP.extraFrom, 60);
    for (const w of wavesFor('bear_trap')) {
        assert.equal(w.pool.includes('doomposter'), w.from >= 60, `wave at ${w.from}`);
    }
});

test('bear trap: the opening minute is the default one', () => {
    const trap = wavesFor('bear_trap');
    WAVES.forEach((w, i) => {
        if (w.from < 60) assert.deepEqual(trap[i].pool, w.pool);
    });
});

test('chop and winter: waves unchanged', () => {
    for (const id of ['chop', 'winter']) {
        assert.deepEqual(
            wavesFor(id).map((w) => w.pool),
            WAVES.map((w) => w.pool)
        );
    }
});

test('bear trap: no doomposter spawns in the first minute of a run', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
        const sim = new Simulation({ seed, stage: 'bear_trap' });
        const seen = new Set();
        while (sim.time < 59.9 && !sim.over) {
            if (sim.choices) sim.choose(0);
            else sim.step(0);
            for (const e of sim.enemies) seen.add(e.id);
            sim.drainEvents();
        }
        assert.ok(!seen.has('doomposter'), `seed ${seed}: ${[...seen]}`);
    }
});

test('bear trap: a bull that stands still lives about as long as on chop (it was 12 s)', () => {
    const median = (stage) => {
        const t = [];
        for (let i = 0; i < 12; i++) {
            const seed = 1000 + i * 7919;
            const sim = new Simulation({ seed, stage });
            const bot = createBot({ phase: seed % 997 });
            while (sim.time < 120 && !sim.over) {
                if (sim.choices) sim.choose(bot.pick(sim));
                else sim.step(0);
                sim.drainEvents();
            }
            t.push(sim.time);
        }
        return t.sort((a, b) => a - b)[6];
    };
    const trap = median('bear_trap');
    assert.ok(trap > 60, `median ${trap.toFixed(1)} s`);
    assert.ok(trap > median('chop') * 0.8);
});
