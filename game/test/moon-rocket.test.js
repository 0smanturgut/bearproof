// Moon Rocket (Build #23): a fifth airdrop-crate loot. 4 s on a rocket: 1.8x speed, untouchable, and every bear
// the bull touches is rammed once per ride (shield broken, hit, knocked away; bosses don't move).

import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/sim.js';
import { Enemy, SupplyCrate } from '../src/sim/entities.js';
import { RunRecorder, replay } from '../src/sim/runlog.js';
import { createBot } from '../src/sim/bot.js';
import { encodeMove } from '../src/sim/input-codes.js';
import { BOSSES, CRATE_LOOT, CRATE_LOOT_IDS, SIM, enemyDef } from '../src/sim/content.js';

const MR = CRATE_LOOT.moon_rocket;

/** No bears spawning, no weapons: only the rocket hurts anything. */
function quiet(seed = 5) {
    const sim = new Simulation({ seed });
    sim._spawn = () => {};
    sim._exitScam = () => {};
    sim.player.weapons = [];
    return sim;
}

function ride(sim) {
    const c = new SupplyCrate(sim.player.x + 5, sim.player.y, 'moon_rocket');
    c.fall = 0;
    sim.crates.push(c);
    sim.step(0);
}

function bear(sim, id, dx, dy = 0) {
    const e = new Enemy(sim.player.x + dx, sim.player.y + dy, enemyDef(id), 1, 1, sim);
    sim.enemies.push(e);
    return e;
}

function steps(sim, seconds, code = 0) {
    const n = Math.round(seconds * SIM.TICK_RATE);
    const ev = [];
    for (let i = 0; i < n && !sim.over; i++) {
        sim.step(code);
        ev.push(...sim.drainEvents());
    }
    return ev;
}

test('moon rocket: a crate loot, appended after the four older ones', () => {
    assert.deepEqual(CRATE_LOOT_IDS.slice(0, 4), ['magnet', 'shield', 'printer', 'god_candle']);
    assert.equal(CRATE_LOOT_IDS[4], 'moon_rocket');
    assert.equal(MR.duration, 4);
    assert.equal(MR.speedMult, 1.8);
});

test('moon rocket: opening it starts a 4 s ride, and the event names it', () => {
    const sim = quiet();
    ride(sim);
    const ev = sim.drainEvents().find((e) => e.t === 'crate');
    assert.equal(ev.id, 'moon_rocket');
    // the crate opens after the bull's update, so the clock starts on the next tick
    assert.equal(sim.player.rocketTimer, MR.duration);
    steps(sim, MR.duration - 0.05);
    assert.ok(sim.player.rocketTimer > 0, 'still riding just before 4 s');
    steps(sim, 0.1);
    assert.ok(sim.player.rocketTimer <= 0, 'the ride is over after 4 s');
});

test('moon rocket: the bull moves 1.8x as far while riding', () => {
    const right = encodeMove(1, 0);
    const a = quiet();
    const x0 = a.player.x;
    steps(a, 1, right);
    const walk = a.player.x - x0;
    const b = quiet();
    ride(b);
    const x1 = b.player.x;
    steps(b, 1, right);
    const fly = b.player.x - x1;
    assert.ok(Math.abs(fly / walk - MR.speedMult) < 1e-6, `${fly} / ${walk}`);
});

test('moon rocket: no damage while riding, damage again after', () => {
    const sim = quiet();
    ride(sim);
    const hp = sim.player.hp;
    sim.player.takeDamage(50, sim);
    assert.equal(sim.player.hp, hp);
    steps(sim, MR.duration + 0.05);
    sim.player.invincibleTimer = 0;
    sim.player.takeDamage(10, sim);
    assert.ok(sim.player.hp < hp);
});

test('moon rocket: a red candle it touches is rammed dead', () => {
    const sim = quiet();
    ride(sim);
    const e = bear(sim, 'red_candle', 30);
    const ev = steps(sim, 0.1);
    assert.ok(e.hp <= 0);
    assert.equal(sim.stats.rammed, 1);
    assert.ok(ev.some((x) => x.t === 'ram' && !x.boss));
    assert.ok(ev.some((x) => x.t === 'dmg' && x.src === 'moon_rocket'));
});

test('moon rocket: a grizzly loses its shield, takes the full ram once per ride, and is knocked away', () => {
    const sim = quiet();
    ride(sim);
    const g = bear(sim, 'grizzly', 40);
    const ev = steps(sim, 0.2);
    assert.equal(g.shielded, false, 'shield broken');
    const hits = ev.filter((x) => x.t === 'dmg' && x.src === 'moon_rocket');
    assert.equal(hits.length, 1);
    assert.ok(Math.abs(hits[0].v - MR.ramDamage * sim.hpMult) < 1e-9);
    assert.ok(g.x - sim.player.x > 40, 'pushed away from the bull');
    // it walks back into the bull for the rest of the ride: no second ram
    steps(sim, MR.duration);
    assert.equal(sim.stats.rammed, 1);
    assert.ok(Math.abs(g.hp - (g.maxHp - MR.ramDamage * sim.hpMult)) < 1e-9);
});

test('moon rocket: a new ride can ram the same bear again', () => {
    const sim = quiet();
    ride(sim);
    const g = bear(sim, 'grizzly', 40);
    steps(sim, MR.duration + 0.1);
    g.x = sim.player.x + 40;
    g.y = sim.player.y;
    ride(sim);
    steps(sim, 0.1);
    assert.equal(sim.stats.rammed, 2);
});

test('moon rocket: a boss takes the ram but is not knocked', () => {
    const sim = quiet();
    ride(sim);
    const def = Object.values(BOSSES).find((b) => !b.stageOnly && !b.onlyStage);
    const boss = new Enemy(sim.player.x + 50, sim.player.y, def, 1, 1, sim);
    sim.enemies.push(boss);
    const ev = steps(sim, 0.1);
    assert.ok(boss.hp < boss.maxHp);
    assert.ok(!(boss.knockTimer > 0));
    assert.ok(ev.some((x) => x.t === 'ram' && x.boss));
});

test('moon rocket: shows up among the drops of a long run', () => {
    const sim = quiet(11);
    const loot = [];
    for (let i = 0; i < 40; i++) {
        sim.time = sim.nextCrateAt;
        sim._dropCrate();
        loot.push(sim.crates.at(-1).loot);
    }
    const n = loot.filter((id) => id === 'moon_rocket').length;
    assert.ok(n >= 5 && n <= 18, `${n} of 40`);
});

test('runlog: a run that rides a moon rocket replays exactly', () => {
    let checked = 0;
    for (let seed = 1; seed <= 16 && checked < 2; seed++) {
        const sim = new Simulation({ seed });
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
        if (!sim.stats.rammed) continue;
        checked++;
        const r = replay(rec.toBytes());
        assert.ok(r.ok, r.error);
        assert.equal(r.hash, sim.stateHash());
        assert.deepEqual(r.summary, sim.summary());
    }
    assert.equal(checked, 2, 'found two bot runs that rammed with a moon rocket');
});
