// God Candle (Build #12): the fourth crate loot. It wipes every bear near the bull and takes a slice off bosses.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/sim.js';
import { Enemy, SupplyCrate } from '../src/sim/entities.js';
import { RunRecorder, replay } from '../src/sim/runlog.js';
import { createBot } from '../src/sim/bot.js';
import { BOSSES, CRATE_LOOT, CRATE_LOOT_IDS, SIM, enemyDef } from '../src/sim/content.js';

const GC = CRATE_LOOT.god_candle;

function quiet(seed = 5) {
    const sim = new Simulation({ seed });
    sim._spawn = () => {};
    sim._dropCrate = () => {};
    sim.player.weapons.length = 0; // only the candle does damage here
    return sim;
}

function bear(sim, id, dx, dy) {
    const e = new Enemy(sim.player.x + dx, sim.player.y + dy, enemyDef(id), 1, 1, sim);
    sim.enemies.push(e);
    return e;
}

/** Open a god candle crate right next to the bull; returns the events of that tick. */
function open(sim) {
    const c = new SupplyCrate(sim.player.x + 5, sim.player.y, 'god_candle');
    c.fall = 0;
    sim.crates.push(c);
    sim.drainEvents();
    sim.step(0);
    return sim.drainEvents();
}

test('god candle: in the loot table, with a radius and a boss share', () => {
    assert.ok(CRATE_LOOT_IDS.includes('god_candle'));
    assert.equal(GC.radius, 400);
    assert.equal(GC.bossShare, 0.1);
    assert.match(GC.toast, /GOD CANDLE/);
});

test('god candle: every bear inside the radius dies, shields too; bears outside are untouched', () => {
    const sim = quiet();
    const near = [
        bear(sim, 'red_candle', 60, 0),
        bear(sim, 'rug_puller', -250, 120),
        bear(sim, 'grizzly', 0, GC.radius - 10)
    ];
    const far = bear(sim, 'bag_holder', GC.radius + 40, 0);
    const farHp = far.hp;
    const ev = open(sim);
    const fx = ev.find((e) => e.t === 'godCandle');
    assert.ok(fx, 'emits the slam');
    assert.equal(fx.wiped, 3);
    assert.equal(fx.r, GC.radius);
    assert.ok(near.every((e) => e.hp <= 0));
    assert.ok(!near[2].shielded, 'the grizzly shield is gone');
    assert.equal(far.hp, farHp);
    // the kills resolve like any other: counted, scored, and each drops its candle
    sim.step(0);
    assert.equal(sim.stats.kills, 3);
    assert.equal(sim.xp.length, 3);
    assert.deepEqual(
        sim.enemies.map((e) => e.id),
        ['bag_holder']
    );
});

test('god candle: a boss in range loses exactly 10% of its max HP and lives', () => {
    const sim = quiet();
    const boss = new Enemy(sim.player.x + 150, sim.player.y, BOSSES.CAPITULATION, 1, 1, sim);
    sim.enemies.push(boss);
    const before = boss.hp;
    open(sim);
    assert.ok(Math.abs(before - boss.hp - boss.maxHp * GC.bossShare) < 1e-9);
    sim.step(0);
    assert.ok(sim.enemies.includes(boss));
    assert.equal(sim.stats.bossKills, 0);
});

test('god candle: no bear spawns for 4 s, then they trickle back in without a burst', () => {
    const sim = new Simulation({ seed: 9 });
    sim._dropCrate = () => {};
    const bot = createBot();
    while (sim.time < 95) {
        if (sim.choices) sim.choose(bot.pick(sim));
        else sim.step(bot.move(sim));
    }
    assert.ok(!sim.over);
    const crowd = sim.enemies.length;
    open(sim);
    const lastUid = Math.max(...sim.enemies.map((e) => e.uid), 0);
    const fresh = () => sim.enemies.filter((e) => e.uid > lastUid).length;
    while (sim.time < 95 + GC.calm - 0.1) {
        if (sim.choices) sim.choose(bot.pick(sim));
        else sim.step(bot.move(sim));
    }
    assert.equal(fresh(), 0, 'nothing spawned during the calm');
    while (sim.time < 95 + GC.calm + 1) {
        if (sim.choices) sim.choose(bot.pick(sim));
        else sim.step(bot.move(sim));
    }
    const n = fresh();
    assert.ok(
        n >= 1 && n <= 3,
        `${n} new bears in the first second after the calm (crowd was ${crowd})`
    );
});

test('god candle: the calm does not hold back a boss that is due', () => {
    const sim = new Simulation({ seed: 9 });
    sim._dropCrate = () => {};
    sim.player.weapons.length = 0;
    const due = sim.bossPlan[0].spawnAt;
    sim.tick = Math.round((due - 1) / SIM.DT); // jump to a second before the boss is due
    open(sim);
    const seen = [];
    while (sim.time < due + 0.1 && !sim.over) {
        if (sim.choices) sim.choose(0);
        else sim.step(0);
        for (const e of sim.drainEvents()) if (e.t === 'boss') seen.push(sim.time);
    }
    assert.equal(seen.length, 1, 'the boss arrived during the calm');
    assert.ok(Math.abs(seen[0] - due) < 0.05);
});

test('god candle: shows up among the drops of a long run', () => {
    const sim = new Simulation({ seed: 11 });
    sim._spawn = () => {};
    const loot = [];
    for (let i = 0; i < 40; i++) {
        sim.time = sim.nextCrateAt;
        sim._dropCrate();
        loot.push(sim.crates.at(-1).loot);
    }
    const n = loot.filter((id) => id === 'god_candle').length;
    assert.ok(n >= 6 && n <= 20, `${n} of 40`);
});

test('runlog: a run that opens a god candle replays exactly', () => {
    let checked = 0;
    for (let seed = 1; seed <= 12 && checked < 2; seed++) {
        const sim = new Simulation({ seed });
        const rec = new RunRecorder(seed, null, sim.characterId);
        const bot = createBot();
        let opened = 0;
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
            for (const e of sim.drainEvents()) if (e.t === 'godCandle') opened++;
        }
        if (!opened) continue;
        checked++;
        const r = replay(rec.toBytes());
        assert.ok(r.ok, r.error);
        assert.equal(r.hash, sim.stateHash());
        assert.deepEqual(r.summary, sim.summary());
    }
    assert.equal(checked, 2, 'found two bot runs that opened a god candle');
});
