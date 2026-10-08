// Buy the Dip (Build #17): drop under 30% HP and for 5 s every kill heals the bull, at most once a minute.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/sim.js';
import { Enemy } from '../src/sim/entities.js';
import { RunRecorder, replay } from '../src/sim/runlog.js';
import { createBot } from '../src/sim/bot.js';
import { SIM, enemyDef } from '../src/sim/content.js';

/** Kill one bag holder next to the bull (as a weapon would) and resolve it. */
function kill(sim, { self = false } = {}) {
    const e = new Enemy(sim.player.x + 60, sim.player.y, enemyDef('bag_holder'), 1, 1, sim);
    e.hp = 0;
    if (self) e.selfDestructed = true;
    sim.enemies.push(e);
    sim._cullDead();
}

const count = (sim, t) => sim.drainEvents().filter((e) => e.t === t);

test('buy the dip: fires under 30% of max HP, not at it', () => {
    for (const character of ['bull', 'pepe']) {
        const sim = new Simulation({ seed: 5, character });
        const p = sim.player;
        p.hp = p.maxHp * SIM.DIP_AT;
        sim.step(0);
        assert.equal(sim.stats.dips, 0, `${character}: exactly 30% is not a dip`);
        p.hp = p.maxHp * SIM.DIP_AT - 0.5;
        sim.step(0);
        assert.equal(sim.stats.dips, 1, `${character}: under 30% is`);
        const [ev] = count(sim, 'dip');
        assert.ok(ev, 'dip event');
        assert.equal(ev.in, SIM.DIP_TIME);
        assert.equal(sim.dipUntil, sim.time + SIM.DIP_TIME);
    }
});

test('buy the dip: kills heal inside the window, not before or after', () => {
    const sim = new Simulation({ seed: 5 });
    const p = sim.player;
    p.hp = 50;
    kill(sim);
    assert.equal(p.hp, 50, 'no window yet');
    p.hp = 20;
    sim.step(0);
    kill(sim);
    kill(sim);
    assert.equal(p.hp, 20 + 2 * SIM.DIP_HEAL);
    const heals = count(sim, 'dipHeal');
    assert.equal(heals.length, 2);
    assert.equal(heals[0].v, SIM.DIP_HEAL);
    assert.equal(sim.stats.dipHealed, 2 * SIM.DIP_HEAL);
    sim.time = sim.dipUntil; // the window is over
    kill(sim);
    assert.equal(p.hp, 20 + 2 * SIM.DIP_HEAL);
});

test("buy the dip: a bear that blows itself up doesn't heal, and the heal stops at max HP", () => {
    const sim = new Simulation({ seed: 5 });
    const p = sim.player;
    p.hp = 10;
    sim.step(0);
    kill(sim, { self: true });
    assert.equal(p.hp, 10);
    p.hp = p.maxHp - 0.5;
    kill(sim);
    assert.equal(p.hp, p.maxHp);
    kill(sim);
    assert.equal(p.hp, p.maxHp);
    const heals = count(sim, 'dipHeal').map((e) => e.v);
    assert.deepEqual(heals, [0.5, 0]);
});

test('buy the dip: once a minute, counted from when it fired', () => {
    const sim = new Simulation({ seed: 5 });
    const p = sim.player;
    p.hp = 10;
    sim.step(0);
    const fired = sim.time;
    assert.equal(sim.stats.dips, 1);
    sim.time = fired + SIM.DIP_COOLDOWN - 0.1;
    sim._buyTheDip();
    assert.equal(sim.stats.dips, 1, 'still cooling down');
    sim.time = fired + SIM.DIP_COOLDOWN;
    sim._buyTheDip();
    assert.equal(sim.stats.dips, 2, 'ready again');
    assert.equal(sim.dipUntil, sim.time + SIM.DIP_TIME);
});

test('buy the dip: bot runs dip, heal and replay bit for bit', () => {
    let dips = 0;
    let healed = 0;
    for (const [seed, character] of [
        [4, 'bull'],
        [9, 'pepe']
    ]) {
        const sim = new Simulation({ seed, character });
        const rec = new RunRecorder(seed, null, sim.characterId);
        const bot = createBot();
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
            sim.drainEvents();
        }
        dips += sim.stats.dips;
        healed += sim.stats.dipHealed;
        const r = replay(rec.toBytes());
        assert.ok(r.ok, r.error);
        assert.equal(r.hash, sim.stateHash());
        assert.deepEqual(r.summary, sim.summary());
    }
    assert.ok(dips > 0, `dips: ${dips}`);
    assert.ok(healed > 0, `healed: ${healed}`);
});
