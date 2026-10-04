// Pump and Dump (Build #13): a bear that swells as it walks at you and pops into red candles.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/sim.js';
import { Enemy } from '../src/sim/entities.js';
import { RunRecorder, replay } from '../src/sim/runlog.js';
import { createBot } from '../src/sim/bot.js';
import { ENEMIES, SIM, WAVES, enemyDef, pickWeighted, wavesFor } from '../src/sim/content.js';

const PD = ENEMIES.PUMP_DUMP;

function quiet(seed = 5) {
    const sim = new Simulation({ seed });
    sim._spawn = () => {};
    sim._dropCrate = () => {};
    sim.player.weapons.length = 0; // nothing hurts it unless the test does
    return sim;
}

function pumper(sim, dx, dy) {
    const e = new Enemy(sim.player.x + dx, sim.player.y + dy, enemyDef('pump_dump'), 1, 1, sim);
    sim.enemies.push(e);
    return e;
}

/** Kill `e` this tick; returns the events of the tick. */
function pop(sim, e) {
    sim.drainEvents();
    e.hp = 0;
    sim.step(0);
    return sim.drainEvents();
}

const candles = (sim) => sim.enemies.filter((e) => e.id === 'red_candle');

test('pump and dump: defined, with a sprite, a description and a tip', () => {
    assert.equal(PD.id, 'pump_dump');
    assert.ok(PD.pumper);
    assert.equal(PD.dumpInto, 'red_candle');
    assert.ok(enemyDef(PD.dumpInto));
    assert.ok(PD.description && PD.tip);
});

test('pump and dump: swells from its size to pumpSize over pumpTime seconds, then stops', () => {
    const sim = quiet();
    const e = pumper(sim, 300, 0);
    e.speed = 0; // it never reaches the bull
    for (let i = 0; i < (PD.pumpTime / 2) * SIM.TICK_RATE; i++) sim.step(0);
    assert.ok(Math.abs(e.pump - 0.5) < 0.01, `half way: ${e.pump}`);
    assert.ok(Math.abs(e.size - (PD.size + PD.pumpSize) / 2) < 0.2);
    for (let i = 0; i < PD.pumpTime * SIM.TICK_RATE; i++) sim.step(0);
    assert.equal(e.pump, 1);
    assert.equal(e.size, PD.pumpSize);
    assert.ok(e.hp > 0, 'swelling alone never pops it');
});

test('pump and dump: it only starts to pump once it is within pumpRange of the bull', () => {
    const sim = quiet();
    const far = pumper(sim, PD.pumpRange + 50, 0);
    far.speed = 0;
    for (let i = 0; i < 3 * SIM.TICK_RATE; i++) sim.step(0);
    assert.equal(far.pump, 0);
    assert.equal(far.size, PD.size);
    far.x = sim.player.x + PD.pumpRange - 20;
    sim.step(0);
    assert.ok(far.pump > 0, 'started');
    far.x = sim.player.x + PD.pumpRange + 50; // backing off doesn't let the air out
    const was = far.pump;
    sim.step(0);
    assert.ok(far.pump > was);
});

test('pump and dump: half as common as other bears in its pools', () => {
    assert.equal(PD.spawnWeight, 0.5);
    const pool = ['red_candle', 'pump_dump'];
    let n = 0;
    const N = 3000;
    for (let i = 0; i < N; i++) if (pickWeighted(pool, 'chop', () => i / N) === 'pump_dump') n++;
    assert.equal(n, N / 3);
});

test('pump and dump: popped at once it spills 2 red candles and pays its XP', () => {
    const sim = quiet();
    const e = pumper(sim, 300, 0);
    const ev = pop(sim, e);
    assert.equal(candles(sim).length, PD.dumpMin);
    const d = ev.find((x) => x.t === 'dump');
    assert.ok(d);
    assert.equal(d.n, 2);
    assert.equal(d.self, false);
    assert.equal(sim.stats.kills, 1);
    assert.equal(sim.xp.length, 1);
});

test('pump and dump: the more it pumped, the more it dumps (2, 3, 4, 5, 6)', () => {
    const seen = [];
    for (const pump of [0, 0.25, 0.5, 0.75, 1]) {
        const sim = quiet();
        const e = pumper(sim, 300, 0);
        e.pump = pump;
        pop(sim, e);
        seen.push(candles(sim).length);
    }
    assert.deepEqual(seen, [2, 3, 4, 5, 6]);
});

test('pump and dump: the candles land in a ring around it, not on one spot', () => {
    const sim = quiet();
    const e = pumper(sim, 300, 0);
    e.pump = 1;
    e.size = PD.pumpSize;
    const { x, y } = e;
    pop(sim, e);
    const cs = candles(sim);
    for (const c of cs) {
        const d = Math.hypot(c.x - x, c.y - y);
        assert.ok(Math.abs(d - (PD.pumpSize + 8)) < 1e-6, `candle at ${d}`);
    }
    assert.equal(new Set(cs.map((c) => `${Math.round(c.x)},${Math.round(c.y)}`)).size, 6);
});

test('pump and dump: fully pumped and close, it dumps by itself: 6 candles, no XP, no kill', () => {
    const sim = quiet();
    const e = pumper(sim, 70, 0);
    e.pump = 1;
    e.size = PD.pumpSize;
    sim.drainEvents();
    sim.step(0);
    const ev = sim.drainEvents();
    assert.ok(e.hp <= 0);
    const d = ev.find((x) => x.t === 'dump');
    assert.ok(d, 'it dumped');
    assert.equal(d.n, 6);
    assert.equal(d.self, true);
    assert.equal(candles(sim).length, 6);
    assert.equal(sim.stats.kills, 0);
    assert.equal(sim.xp.length, 0);
});

test('pump and dump: not yet fully pumped, it walks right up to you without dumping', () => {
    const sim = quiet();
    const e = pumper(sim, 70, 0);
    e.pump = 0.9;
    sim.step(0);
    assert.ok(e.hp > 0);
    assert.equal(candles(sim).length, 0);
});

test('pump and dump: never in the pools before 2:30, in every pool after, on every stage', () => {
    for (const stage of ['chop', 'bear_trap', 'winter']) {
        for (const w of wavesFor(stage)) {
            const has = w.pool.includes('pump_dump');
            if (w.from < 150) assert.ok(!has, `${stage} ${w.label} from ${w.from}`);
            else assert.ok(has, `${stage} ${w.label} from ${w.from}`);
        }
    }
    assert.equal(WAVES.find((w) => w.pool.includes('pump_dump')).from, 150);
});

test('waves: the 2:30 split keeps "Ponzi Unwinds" one wave, with one toast', () => {
    const sim = quiet();
    sim.player.update = () => {};
    const labels = [];
    sim.tick = Math.round(110 / SIM.DT);
    sim.step(0); // the jump itself lands in Rug Season
    sim.drainEvents();
    while (sim.time < 200) {
        sim.step(0);
        for (const e of sim.drainEvents()) if (e.t === 'wave') labels.push(e.label);
    }
    assert.deepEqual(labels, ['Ponzi Unwinds', 'Grizzly Country']);
    assert.ok(sim.wave.pool.includes('pump_dump'));
});

test('pump and dump: shows up in a real bot run after 2:30', () => {
    const sim = new Simulation({ seed: 3 });
    const bot = createBot();
    let first = null;
    while (!sim.over && sim.time < 300 && first === null) {
        if (sim.choices) sim.choose(bot.pick(sim));
        else sim.step(bot.move(sim));
        if (sim.enemies.some((e) => e.id === 'pump_dump')) first = sim.time;
    }
    assert.ok(first !== null, 'one spawned before 5:00');
    assert.ok(first >= 150, `first at ${first}`);
});

test('runlog: a run with pump and dumps popping replays exactly', () => {
    let checked = 0;
    for (let seed = 1; seed <= 12 && checked < 2; seed++) {
        const sim = new Simulation({ seed });
        const rec = new RunRecorder(seed, null, sim.characterId);
        const bot = createBot();
        let dumps = 0;
        while (!sim.over && sim.tick < SIM.MAX_TICKS) {
            if (sim.choices) {
                const i = bot.pick(sim);
                rec.pick(sim.tick, i);
                sim.choose(i);
                continue;
            }
            const code = bot.move(sim);
            rec.tick(code);
            sim.step(code);
            for (const e of sim.drainEvents()) if (e.t === 'dump') dumps++;
        }
        if (!dumps) continue;
        checked++;
        const r = replay(rec.toBytes());
        assert.ok(r.ok, r.error);
        assert.equal(r.hash, sim.stateHash());
        assert.deepEqual(r.summary, sim.summary());
    }
    assert.equal(checked, 2, 'found two bot runs where a pump and dump popped');
});
