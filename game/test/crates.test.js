// Airdrop crates (Build #4): the drop schedule, where they land, each loot, and that crate runs replay exactly.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/sim.js';
import { Enemy, SupplyCrate, XpOrb } from '../src/sim/entities.js';
import { RunRecorder, replay } from '../src/sim/runlog.js';
import { createBot } from '../src/sim/bot.js';
import { CRATE_LOOT, CRATE_LOOT_IDS, SIM, enemyDef } from '../src/sim/content.js';

/** A sim with no bears spawning, so the bull can stand still and watch the sky. */
function quiet(seed = 5) {
    const sim = new Simulation({ seed });
    sim._spawn = () => {};
    return sim;
}

function runTo(sim, seconds, code = 0) {
    while (sim.time < seconds - 1e-9 && !sim.over) {
        if (sim.choices) sim.choose(0);
        else sim.step(code);
    }
}

/** A landed crate right next to the bull, opened on the next tick. */
function openAt(sim, loot) {
    const c = new SupplyCrate(sim.player.x + 5, sim.player.y, loot);
    c.fall = 0;
    sim.crates.push(c);
    sim.step(0);
}

test('crates: the first drops at 0:40, then one a minute, on screen near the bull', () => {
    const sim = quiet();
    const drops = [];
    while (sim.time < 60 * 4) {
        sim.step(0);
        for (const e of sim.drainEvents())
            if (e.t === 'crateDrop') drops.push({ ...e, at: sim.tick });
    }
    assert.deepEqual(
        drops.map((d) => d.at),
        [40, 100, 160, 220].map((s) => s * SIM.TICK_RATE)
    );
    for (const d of drops) {
        const r = Math.hypot(d.x - sim.player.x, d.y - sim.player.y);
        assert.ok(r >= SIM.CRATE_DIST_MIN - 1e-9 && r <= SIM.CRATE_DIST_MAX + 1e-9, `r=${r}`);
    }
});

test('crates: loot is one of the three and never the same twice in a row', () => {
    const sim = quiet(11);
    const loot = [];
    for (let i = 0; i < 30; i++) {
        sim.time = sim.nextCrateAt;
        sim._dropCrate();
        loot.push(sim.crates.at(-1).loot);
    }
    for (const id of loot) assert.ok(CRATE_LOOT_IDS.includes(id));
    for (let i = 1; i < loot.length; i++) assert.notEqual(loot[i], loot[i - 1]);
    assert.equal(new Set(loot).size, 3, 'all three show up');
});

test('crates: can only be opened once landed, and expire if nobody comes', () => {
    const sim = quiet();
    const c = new SupplyCrate(sim.player.x + 5, sim.player.y, 'shield');
    sim.crates.push(c);
    sim.step(0);
    assert.equal(sim.stats.crates, 0, 'still falling');
    runTo(sim, SIM.CRATE_FALL + 0.1);
    assert.equal(sim.stats.crates, 1);
    assert.equal(sim.crates.length, 0);

    const far = quiet();
    far.crates.push(new SupplyCrate(500, 0, 'magnet'));
    runTo(far, SIM.CRATE_FALL + SIM.CRATE_LIFE - 0.5);
    assert.equal(far.crates.length, 1, 'still waiting');
    runTo(far, SIM.CRATE_FALL + SIM.CRATE_LIFE + 0.5);
    assert.equal(far.crates.length, 0, 'looted by the bears');
    assert.equal(far.stats.crates, 0);
});

test('shield: 8 s of no damage from bears or shots, then it wears off', () => {
    const sim = quiet();
    openAt(sim, 'shield');
    assert.ok(sim.player.shielded);
    const hp = sim.player.hp;
    sim.enemies.push(new Enemy(sim.player.x, sim.player.y, enemyDef('grizzly'), 1, 1, sim));
    runTo(sim, CRATE_LOOT.shield.duration - 0.2);
    assert.equal(sim.player.hp, hp, 'a grizzly on top of you for 8 s does nothing');
    runTo(sim, CRATE_LOOT.shield.duration + 0.5);
    assert.ok(!sim.player.shielded);
    assert.ok(sim.player.hp < hp, 'and then it hurts again');
});

test('money printer: weapons cool down twice as fast for 10 s', () => {
    const sim = quiet();
    const horns = sim.player.weapons[0];
    const base = horns.getCooldown(sim.player);
    openAt(sim, 'printer');
    assert.ok(Math.abs(horns.getCooldown(sim.player) - base * 0.5) < 1e-12);
    runTo(sim, CRATE_LOOT.printer.duration + 0.5);
    assert.ok(Math.abs(horns.getCooldown(sim.player) - base) < 1e-12);
});

test('magnet: every candle on the chart flies to the bull', () => {
    const sim = quiet();
    for (const [x, y] of [
        [900, 0],
        [-700, 600],
        [0, -1000]
    ])
        sim.xp.push(new XpOrb(x, y, 5));
    openAt(sim, 'magnet');
    assert.ok(sim.xp.every((o) => o.vacuum));
    runTo(sim, 3);
    assert.equal(sim.xp.length, 0, 'all three collected from up to 1000 px away');
});

test('runlog: a run with crates replays exactly, and the autopilot opens them', () => {
    const seed = 33;
    const sim = new Simulation({ seed });
    const rec = new RunRecorder(seed, null, sim.characterId);
    const bot = createBot();
    const reckless = createBot({ style: 'reckless' });
    while (!sim.over && sim.tick < SIM.MAX_TICKS) {
        if (sim.choices) {
            const i = bot.pick(sim);
            rec.pick(sim.tick, i);
            sim.choose(i);
            continue;
        }
        const code = (sim.tick < 60 * 60 * 3 ? bot : reckless).move(sim);
        rec.tick(code);
        sim.step(code);
        sim.drainEvents();
    }
    assert.ok(sim.stats.crates >= 1, `opened ${sim.stats.crates}`);
    const r = replay(rec.toBytes());
    assert.ok(r.ok, r.error);
    assert.equal(r.hash, sim.stateHash());
    assert.deepEqual(r.summary, sim.summary());
});

test('autopilot: grabs most of the crates that drop', (t) => {
    let dropped = 0;
    const loot = { magnet: 0, shield: 0, printer: 0 };
    for (let seed = 1; seed <= 10; seed++) {
        const sim = new Simulation({ seed });
        const bot = createBot();
        while (!sim.over) {
            if (sim.choices) sim.choose(bot.pick(sim));
            else sim.step(bot.move(sim));
            for (const e of sim.drainEvents()) {
                if (e.t === 'crateDrop') dropped++;
                else if (e.t === 'crate') loot[e.id]++;
            }
        }
    }
    const opened = loot.magnet + loot.shield + loot.printer;
    t.diagnostic(`crates: ${opened}/${dropped} opened, ${JSON.stringify(loot)}`);
    assert.ok(opened >= dropped / 2, `${opened}/${dropped}`);
});
