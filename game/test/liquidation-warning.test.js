// Liquidation Warning (Build #14): charge bosses crouch over a red ring that marks where they land, then jump.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/sim.js';
import { Enemy } from '../src/sim/entities.js';
import { createBot } from '../src/sim/bot.js';
import { BOSSES, SIM } from '../src/sim/content.js';

const LIQ = BOSSES.LIQUIDATION;
const WARN_TICKS = Math.round(LIQ.chargeWarn * SIM.TICK_RATE);

function quiet(seed = 5) {
    const sim = new Simulation({ seed });
    sim._spawn = () => {};
    sim._dropCrate = () => {};
    sim.player.weapons.length = 0; // nothing hurts the boss unless the test does
    return sim;
}

/** A boss `dx` to the right of the bull, standing still, about to use its jump on the next tick. */
function boss(sim, dx, id = 'liquidation') {
    const def = Object.values(BOSSES).find((b) => b.id === id);
    const e = new Enemy(sim.player.x + dx, sim.player.y, def, 1, 1, sim);
    e.speed = 0;
    e.abilityTimer = SIM.DT / 2;
    sim.enemies.push(e);
    return e;
}

const events = (sim, t) => sim.drainEvents().filter((e) => e.t === t);

test('liquidation warning: every charge boss warns for 1 s', () => {
    const chargers = Object.values(BOSSES).filter((b) => b.ability === 'charge');
    assert.deepEqual(chargers.map((b) => b.id).sort(), [
        'bear_market',
        'liquidation',
        'long_winter'
    ]);
    for (const b of chargers) {
        assert.equal(b.chargeWarn, 1, b.id);
        assert.match(b.description, /red ring/, b.id);
    }
});

test('liquidation warning: the jump marks a ring first, and the boss holds still over it', () => {
    const sim = quiet();
    const e = boss(sim, 400);
    e.speed = LIQ.speed; // it would walk, but it braces instead
    sim.drainEvents();
    sim.step(0);
    const [warn] = events(sim, 'chargeWarn');
    assert.ok(warn, 'a chargeWarn event');
    assert.equal(warn.in, LIQ.chargeWarn);
    assert.equal(warn.r, e.size + sim.player.size);
    assert.ok(Math.abs(warn.x - (e.x - LIQ.chargeDistance)) < 2, 'the spot is 120 toward the bull');
    assert.ok(e.leapWarn > 0);
    const x0 = e.x;
    for (let i = 0; i < WARN_TICKS - 2; i++) sim.step(0);
    assert.equal(e.x, x0, 'it did not move while crouched');
    assert.equal(events(sim, 'charge').length, 0, 'and has not jumped yet');
});

test('liquidation warning: it lands on the marked spot 1 s later, even if the bull ran', () => {
    const sim = quiet();
    const e = boss(sim, 400);
    sim.step(0);
    const { leapX, leapY } = e;
    sim.player.y += 300; // the bull runs off sideways
    sim.drainEvents();
    for (let i = 0; i < WARN_TICKS + 1; i++) sim.step(0);
    const [land] = events(sim, 'charge');
    assert.ok(land, 'it jumped');
    assert.equal(e.x, leapX);
    assert.equal(e.y, leapY);
    assert.equal(land.hit, false);
    assert.equal(e.leapWarn, 0);
});

test('liquidation warning: stay in the ring and the landing hits you; step out and it does not', () => {
    for (const stay of [true, false]) {
        const sim = quiet();
        const e = boss(sim, 100); // closer than 120: the ring is right under the bull
        sim.step(0);
        assert.equal(e.leapX, sim.player.x, 'it never jumps past the bull');
        if (!stay) sim.player.x -= e.leapR + 5; // out of the ring, but still in front of where it stood
        const hp = sim.player.hp;
        sim.drainEvents();
        for (let i = 0; i < WARN_TICKS + 1; i++) sim.step(0);
        const [land] = events(sim, 'charge');
        assert.equal(land.hit, stay);
        if (stay) assert.equal(sim.player.hp, hp - LIQ.damage);
        else assert.equal(sim.player.hp, hp);
    }
});

test('liquidation warning: the next jump comes on the same 4.5 s cadence', () => {
    const sim = quiet();
    const e = boss(sim, 1000);
    const at = [];
    for (let i = 0; i < 10 * SIM.TICK_RATE; i++) {
        sim.step(0);
        for (const ev of sim.drainEvents()) if (ev.t === 'chargeWarn') at.push(sim.tick);
    }
    assert.equal(at.length, 3);
    // the crouch doesn't pause the cooldown (±1 tick of float rounding in the timer)
    assert.ok(Math.abs(at[1] - at[0] - LIQ.abilityCooldown * SIM.TICK_RATE) <= 1, `${at}`);
    // two landings so far (the third is still crouching), 120 each
    assert.ok(
        Math.abs(e.x - (sim.player.x + 1000 - 2 * LIQ.chargeDistance)) < 1e-6,
        'and it still closes in'
    );
});

test('liquidation warning: the Bear Market marks 140, The Long Winter 120', () => {
    for (const [id, dist] of [
        ['bear_market', 140],
        ['long_winter', 120]
    ]) {
        const sim = quiet();
        const e = boss(sim, 500, id);
        sim.step(0);
        assert.ok(Math.abs(e.x - e.leapX - dist) < 1e-9, id);
    }
});

test('liquidation warning: a bot fighting Liquidation plays out bit for bit twice', () => {
    const hashes = [];
    for (let k = 0; k < 2; k++) {
        const sim = new Simulation({ seed: 11 });
        const bot = createBot();
        let jumps = 0;
        while (!sim.over && sim.time < 60) {
            if (sim.choices) sim.choose(bot.pick(sim));
            else sim.step(bot.move(sim));
            if (sim.tick === 600) boss(sim, 300).speed = LIQ.speed;
            for (const ev of sim.drainEvents()) if (ev.t === 'charge') jumps++;
        }
        assert.ok(jumps >= 3, `jumps: ${jumps}`);
        hashes.push(sim.stateHash());
    }
    assert.equal(hashes[0], hashes[1]);
});
