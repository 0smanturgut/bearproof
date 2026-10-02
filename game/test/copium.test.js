// Copium (Build #11): Hopium evolves at Lv 5, and bears inside the cloud move slower while they stay there.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/sim.js';
import { Enemy } from '../src/sim/entities.js';
import { Weapon } from '../src/sim/weapons.js';
import { RunRecorder, replay } from '../src/sim/runlog.js';
import { createBot } from '../src/sim/bot.js';
import { SIM, WEAPONS, enemyDef } from '../src/sim/content.js';
import { guideSections } from '../src/guide.js';

const HOPIUM = WEAPONS.HOPIUM;

/** A bull with only Hopium at `level`, and hand-placed bears of `kind`. */
function field(positions, { level = 1, kind = 'bag_holder' } = {}) {
    const sim = new Simulation({ seed: 11 });
    const hopium = new Weapon(HOPIUM);
    hopium.level = level;
    sim.player.weapons = [hopium];
    const def = enemyDef(kind);
    sim.enemies = positions.map(
        ([x, y]) => new Enemy(sim.player.x + x, sim.player.y + y, def, 1, 1, sim)
    );
    sim.spatial.rebuild(sim.enemies);
    return { sim, hopium };
}

/** How far a bear moves in one 1/60 s step. */
function step(e, sim) {
    const x = e.x;
    const y = e.y;
    e.update(1 / 60, sim);
    return Math.hypot(e.x - x, e.y - y);
}

test('copium: the data says Lv 5, 35%, and the guide shows it', () => {
    assert.equal(HOPIUM.evolveLevel, 5);
    assert.equal(HOPIUM.evolveName, 'Copium');
    assert.equal(HOPIUM.evolveSlowPct, 0.35);
    const weapons = guideSections().find((s) => s.id === 'weapons');
    const e = weapons.entries.find((x) => x.id === 'hopium');
    assert.equal(e.extra, 'Lv 5 → Copium: Bears in the cloud move 35% slower.');
    assert.ok(e.evolves);
    assert.match(weapons.intro, /Every one evolves/);
});

test('copium: plain Hopium burns but never slows', () => {
    const { sim, hopium } = field([[60, 0]], { level: 4 });
    assert.ok(!hopium.isEvolved());
    hopium.fire(sim.player, sim);
    const [e] = sim.enemies;
    assert.ok(e.hp < e.maxHp, 'it still burns');
    assert.ok(!(e.auraSlowTimer > 0));
});

test('copium: at Lv 5 bears inside move 35% slower, bears outside are untouched', () => {
    const { sim, hopium } = field(
        [
            [60, 0], // inside
            [0, 400] // far outside
        ],
        { level: 5 }
    );
    assert.ok(hopium.isEvolved());
    const reach = hopium.getRange(sim.player);
    assert.ok(reach > 60 && reach < 400);
    // the same bears on a plain field, for the base speed
    const plain = field([[60, 0]], { level: 4 });
    const base = step(plain.sim.enemies[0], plain.sim);

    hopium.fire(sim.player, sim);
    const [inside, outside] = sim.enemies;
    assert.ok(inside.auraSlowTimer > 0);
    assert.ok(!(outside.auraSlowTimer > 0));
    assert.ok(Math.abs(step(inside, sim) - base * 0.65) < 1e-9, 'inside moves at 65%');
    assert.ok(Math.abs(step(outside, sim) - base) < 1e-9, 'outside keeps full speed');
});

test('copium: the slow wears off about 0.3 s after a bear leaves the cloud', () => {
    const { sim, hopium } = field([[60, 0]], { level: 5 });
    hopium.fire(sim.player, sim);
    const e = sim.enemies[0];
    for (let i = 0; i < 17; i++) e.update(1 / 60, sim);
    assert.ok(e.auraSlowTimer > 0, 'still slowed at 0.28 s');
    for (let i = 0; i < 3; i++) e.update(1 / 60, sim);
    assert.ok(!(e.auraSlowTimer > 0), 'free by 0.33 s');
});

test("copium: doesn't weaken or stretch Circuit Breaker's freeze; the stronger slow wins", () => {
    const { sim, hopium } = field([[60, 0]], { level: 5 });
    const plain = field([[60, 0]], { level: 4 });
    const base = step(plain.sim.enemies[0], plain.sim);
    const e = sim.enemies[0];
    e.slowTimer = 1.2;
    e.slowPct = 0.5;
    hopium.fire(sim.player, sim);
    assert.equal(e.slowTimer, 1.2, 'the freeze timer is untouched');
    assert.equal(e.slowPct, 0.5);
    assert.ok(Math.abs(step(e, sim) - base * 0.5) < 1e-9, '50% beats 35%, no stacking');
});

test('copium: a rug puller dashing through the cloud dashes 35% slower', () => {
    const run = (level) => {
        const { sim, hopium } = field([[100, 0]], { level, kind: 'rug_puller' });
        const e = sim.enemies[0];
        e.dashTimer = 0;
        e.update(1 / 60, sim); // winds up the dash at the bull
        assert.ok(e.dashActive > 0);
        hopium.fire(sim.player, sim);
        return step(e, sim);
    };
    const free = run(4);
    const slowed = run(5);
    assert.ok(free > 0);
    assert.ok(Math.abs(slowed - free * 0.65) < 1e-9);
});

test('copium: a run that evolves Hopium replays bit for bit', () => {
    // The bot takes Hopium whenever it's offered; the first seed whose run evolves it plays on with the slow.
    const play = (seed) => {
        const sim = new Simulation({ seed });
        const rec = new RunRecorder(seed, null, sim.characterId);
        const bot = createBot();
        let slowedTicks = 0;
        while (!sim.over && sim.tick < SIM.MAX_TICKS) {
            if (sim.choices) {
                const h = sim.choices.findIndex((c) => c.id === 'hopium');
                const i = h >= 0 ? h : bot.pick(sim);
                rec.pick(sim.tick, i);
                sim.choose(i);
                continue;
            }
            const code = bot.move(sim);
            rec.tick(code);
            sim.step(code);
            sim.drainEvents();
            if (sim.enemies.some((e) => e.auraSlowTimer > 0)) slowedTicks++;
        }
        return { sim, rec, slowedTicks };
    };
    let run = null;
    for (let seed = 1; seed <= 12 && !run; seed++) {
        const r = play(seed);
        if (r.sim.player.weapons.some((w) => w.id === 'hopium' && w.isEvolved())) run = r;
    }
    assert.ok(run, 'some run evolved Hopium');
    const { sim, rec, slowedTicks } = run;
    assert.ok(slowedTicks > 60, `Copium slowed bears on ${slowedTicks} ticks`);
    const bytes = rec.toBytes();
    const r = replay(bytes);
    assert.ok(r.ok, r.error);
    assert.equal(r.hash, sim.stateHash());
    assert.deepEqual(r.summary, sim.summary());
});
