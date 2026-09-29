// Whale Alert (Build #8): once a run, an alert at 1:27, then at 1:30 a whale swims across the screen level with the
// bull. Bears in its lane get shoved aside and dazed, bosses hold their ground, and it leaves a trail of candles.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/sim.js';
import { Enemy, Whale } from '../src/sim/entities.js';
import { RunRecorder, replay } from '../src/sim/runlog.js';
import { createBot } from '../src/sim/bot.js';
import { BOSSES, ENEMIES, SIM } from '../src/sim/content.js';

const DT = SIM.DT;

/** A sim with no spawns, so nothing but the whale happens. */
function quietSim(seed) {
    const sim = new Simulation({ seed });
    sim._spawn = () => {};
    return sim;
}

/** Step until `seconds`, collecting events. */
function runTo(sim, seconds) {
    const events = [];
    while (sim.time < seconds - 1e-9 && !sim.over) {
        sim.step(0);
        for (const ev of sim.drainEvents()) events.push({ ...ev, time: sim.time });
    }
    return events;
}

test('whale: the alert goes out at 1:27, the whale shows up at 1:30, on screen and level with the bull', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
        const sim = quietSim(seed);
        const before = runTo(sim, SIM.WHALE_AT - SIM.WHALE_WARN - DT);
        assert.equal(before.filter((e) => e.t.startsWith('whale')).length, 0, 'nothing early');
        const events = runTo(sim, SIM.WHALE_AT + 0.5);
        const warn = events.filter((e) => e.t === 'whaleWarn');
        const come = events.filter((e) => e.t === 'whale');
        assert.equal(warn.length, 1);
        assert.equal(come.length, 1);
        assert.ok(Math.abs(warn[0].time - (SIM.WHALE_AT - SIM.WHALE_WARN)) < DT * 1.5);
        assert.ok(Math.abs(come[0].time - SIM.WHALE_AT) < DT * 1.5);
        assert.equal(come[0].dir, warn[0].dir, 'it comes from the side the alert showed');
        const lane = Math.abs(come[0].y - sim.player.y);
        assert.ok(lane >= SIM.WHALE_LANE_MIN && lane <= SIM.WHALE_LANE_MAX, `lane ${lane}`);
        // Starts off screen on the side it swims from.
        assert.equal(Math.sign(sim.player.x - come[0].x), come[0].dir);
        assert.ok(Math.abs(come[0].x - sim.player.x) >= 600);
    }
});

test('whale: once a run, drops 26 candles worth 312 XP along its lane, then leaves', () => {
    const sim = quietSim(9);
    const hp = sim.player.hp;
    const events = runTo(sim, SIM.WHALE_AT + 20);
    const gone = events.filter((e) => e.t === 'whaleGone');
    assert.equal(gone.length, 1);
    assert.equal(gone[0].drops, 26);
    assert.equal(sim.whale, null, 'gone after it crosses');
    const candles = sim.xp.filter((o) => o.value === SIM.WHALE_CANDLE);
    assert.equal(candles.length + events.filter((e) => e.t === 'pickup').length, 26);
    const total = candles.reduce((a, o) => a + o.value, 0);
    assert.ok(total <= 312);
    assert.equal(26 * SIM.WHALE_CANDLE, 312);
    // It crossed in about length / speed seconds.
    const took = gone[0].time - SIM.WHALE_AT;
    assert.ok(Math.abs(took - (SIM.WHALE_START * 2) / SIM.WHALE_SPEED) < 0.1, `took ${took}`);
    assert.equal(sim.player.hp, hp, 'the whale never hurts the bull');
    const later = runTo(sim, 300);
    assert.equal(later.filter((e) => e.t === 'whale' || e.t === 'whaleWarn').length, 0);
});

test('whale: bears in its lane get shoved out and dazed, bosses hold their ground', () => {
    const sim = quietSim(3);
    sim.enemies = [];
    const w = new Whale(0, 400, 1);
    const bear = new Enemy(20, 405, ENEMIES.GRIZZLY, 1, 1, sim);
    const above = new Enemy(10, 390, ENEMIES.RED_CANDLE, 1, 1, sim);
    const far = new Enemy(20, 400 + SIM.WHALE_RY + 80, ENEMIES.RED_CANDLE, 1, 1, sim);
    const boss = new Enemy(-10, 400, BOSSES.RUG_LORD, 1, 1, sim);
    sim.enemies.push(bear, above, far, boss);
    const farY = far.y;
    w.update(DT, sim);
    const shoves = sim.drainEvents().filter((e) => e.t === 'whaleShove');
    assert.equal(shoves.length, 2);
    assert.equal(w.shoved, 2);
    assert.ok(bear.y >= w.y + SIM.WHALE_RY + bear.size - 1e-9, 'shoved down, out of the lane');
    assert.ok(above.y <= w.y - SIM.WHALE_RY - above.size + 1e-9, 'shoved up, out of the lane');
    assert.ok(bear.slowTimer > 0 && bear.slowPct >= SIM.WHALE_DAZE_SLOW, 'dazed');
    assert.equal(far.y, farY, 'out of reach, untouched');
    assert.equal(far.slowTimer, 0);
    assert.equal(boss.y, 400, 'bosses hold their ground');
    // A bear already shoved doesn't count twice.
    bear.y = w.y;
    w.update(DT, sim);
    assert.equal(sim.drainEvents().filter((e) => e.t === 'whaleShove').length, 0);
    assert.equal(w.shoved, 2);
});

test('whale: autopilot runs through the whale replay bit for bit', () => {
    let crossed = 0;
    for (const seed of [2, 5, 8]) {
        const sim = new Simulation({ seed });
        const rec = new RunRecorder(seed, sim.twistId, sim.characterId);
        const bot = createBot();
        while (!sim.over) {
            if (sim.choices) {
                const i = bot.pick(sim);
                rec.pick(sim.tick, i);
                sim.choose(i);
                continue;
            }
            const code = bot.move(sim);
            rec.tick(code);
            sim.step(code);
            crossed += sim.drainEvents().filter((ev) => ev.t === 'whaleGone').length;
        }
        const r = replay(rec.toBytes());
        assert.ok(r.ok, r.error);
        assert.equal(r.hash, sim.stateHash());
    }
    assert.ok(crossed > 0, 'a whale crossed in these runs');
});
