// Honey Trap (Build #24): a weapon that lobs a honey jar at the nearest bear. It splashes on landing and leaves a
// puddle: bears inside move 55% slower, grizzlies stop to eat, bosses don't stick. Evolved (Honeypot): bigger,
// longer puddles that burn.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/sim.js';
import { Enemy, HoneyJar } from '../src/sim/entities.js';
import { Weapon } from '../src/sim/weapons.js';
import { RunRecorder, replay } from '../src/sim/runlog.js';
import { createBot } from '../src/sim/bot.js';
import { BOSSES, SIM, WEAPONS, enemyDef, weaponDef } from '../src/sim/content.js';

const HT = WEAPONS.HONEY_TRAP;

/** No bears spawning, no weapons. */
function quiet(seed = 5) {
    const sim = new Simulation({ seed });
    sim._spawn = () => {};
    sim._exitScam = () => {};
    sim.player.weapons = [];
    return sim;
}

function bear(sim, id, dx, dy = 0) {
    const e = new Enemy(sim.player.x + dx, sim.player.y + dy, enemyDef(id), 1, 1, sim);
    sim.enemies.push(e);
    return e;
}

/** A landed puddle at (x, y): no splash, just the honey. */
function puddle(sim, x, y, { radius = 200, life = HT.puddleLife, burn = 0 } = {}) {
    const h = new HoneyJar(x, y, x, y, HT, HT.id, { radius, damage: 0, life, burn });
    h.flight = 0;
    sim.honey.push(h);
    return h;
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

/** How far the bear moves in `seconds`, after one tick to let the puddle take hold. */
function travel(sim, e, seconds) {
    sim.step(0);
    const x = e.x;
    const y = e.y;
    steps(sim, seconds);
    return Math.hypot(e.x - x, e.y - y);
}

test('honey trap: a weapon for every character, appended last', () => {
    const all = Object.values(WEAPONS);
    assert.equal(all[all.length - 1].id, 'honey_trap');
    assert.equal(HT.type, 'honey');
    assert.equal(HT.character, undefined);
    assert.equal(HT.evolveName, 'Honeypot');
    assert.deepEqual(HT.eatenBy, ['grizzly']);
});

test('honey trap: lobs a jar at the nearest bear, and it splashes when it lands', () => {
    const sim = quiet();
    sim.player.weapons = [new Weapon(weaponDef('honey_trap'))];
    const near = bear(sim, 'bag_holder', 150);
    bear(sim, 'bag_holder', -240);
    sim.step(0);
    sim.drainEvents();
    assert.equal(sim.honey.length, 1);
    const jar = sim.honey[0];
    assert.ok(
        Math.abs(jar.x - 150) < 3 && Math.abs(jar.y) < 1e-9,
        `aimed at the near bear: ${jar.x}`
    );
    assert.ok(!jar.landed);
    const hp = near.hp;
    const ev = steps(sim, HT.flight - 0.05);
    assert.equal(near.hp, hp, 'no damage while it flies');
    assert.ok(!ev.some((e) => e.t === 'honeySplash'));
    const ev2 = steps(sim, 0.1);
    const splash = ev2.find((e) => e.t === 'honeySplash');
    assert.ok(splash, 'it splashes');
    assert.ok(jar.landed);
    assert.ok(Math.abs(hp - near.hp - HT.baseDamage) < 1e-9, `splash hit ${hp - near.hp}`);
});

test('honey trap: no bear in range, no throw', () => {
    const sim = quiet();
    sim.player.weapons = [new Weapon(weaponDef('honey_trap'))];
    bear(sim, 'bag_holder', HT.baseRange + 100);
    sim.step(0);
    assert.equal(sim.honey.length, 0);
});

test('honey trap: bears in the puddle move 55% slower, bears outside at full speed', () => {
    const a = quiet();
    const free = bear(a, 'red_candle', 300);
    const full = travel(a, free, 0.5);
    const b = quiet();
    const stuck = bear(b, 'red_candle', 300);
    puddle(b, 300, 0);
    const slow = travel(b, stuck, 0.5);
    assert.ok(Math.abs(slow / full - (1 - HT.slowPct)) < 1e-6, `${slow} / ${full}`);
    assert.ok(stuck.honeyTimer > 0);
});

test('honey trap: a dashing rug puller sticks too', () => {
    const run = (honey) => {
        const sim = quiet();
        const e = bear(sim, 'rug_puller', 300);
        e.dashTimer = 0; // dash on the next tick
        if (honey) puddle(sim, 300, 0, { radius: 400 });
        sim.step(0);
        assert.ok(e.dashActive > 0, 'dashing');
        return travel(sim, e, 0.3);
    };
    const ratio = run(true) / run(false);
    assert.ok(Math.abs(ratio - (1 - HT.slowPct)) < 1e-6, `${ratio}`);
});

test('honey trap: a grizzly sits down to eat, once per puddle', () => {
    const sim = quiet();
    const g = bear(sim, 'grizzly', 250);
    puddle(sim, 250, 0);
    sim.step(0);
    assert.equal(sim.drainEvents().filter((e) => e.t === 'honeyEat').length, 1);
    const x = g.x;
    const ev = steps(sim, 2);
    assert.equal(g.x, x, 'it does not move while it eats');
    assert.equal(g.honeyPct, 1);
    assert.equal(ev.filter((e) => e.t === 'honeyEat').length, 0, 'one meal per puddle');
    assert.equal(sim.stats.honeyEaten, 1);
    // a second puddle on the same grizzly is a second meal
    puddle(sim, 250, 0);
    const ev2 = steps(sim, 0.1);
    assert.equal(ev2.filter((e) => e.t === 'honeyEat').length, 1);
    assert.equal(sim.stats.honeyEaten, 2);
});

test('honey trap: other bears never eat, they only slow down', () => {
    const sim = quiet();
    const e = bear(sim, 'bag_holder', 250);
    puddle(sim, 250, 0);
    steps(sim, 0.5);
    assert.equal(e.honeyPct, HT.slowPct);
    assert.equal(sim.stats.honeyEaten, 0);
});

test('honey trap: bosses do not stick', () => {
    const run = (honey) => {
        const sim = quiet();
        const e = new Enemy(250, 0, BOSSES.RUG_LORD, 1, 1, sim);
        e.abilityTimer = 99;
        sim.enemies.push(e);
        if (honey) puddle(sim, 250, 0);
        return travel(sim, e, 0.5);
    };
    assert.equal(run(true), run(false));
});

test('honey trap: the puddle dries up after 4 s, and bears walk at full speed again', () => {
    const sim = quiet();
    const e = bear(sim, 'bag_holder', 250);
    const h = puddle(sim, 250, 0, { radius: 400 });
    steps(sim, HT.puddleLife - 0.1);
    assert.ok(!h.dead && sim.honey.length === 1);
    steps(sim, 0.3);
    assert.ok(h.dead);
    assert.equal(sim.honey.length, 0);
    const x = e.x;
    const y = e.y;
    steps(sim, 0.5);
    const moved = Math.hypot(e.x - x, e.y - y);
    assert.ok(Math.abs(moved - e.def.speed * 0.5) < 1, `${moved}`);
});

test('honeypot (evolved): bigger, longer puddles that burn twice a second', () => {
    const sim = quiet();
    const w = new Weapon(weaponDef('honey_trap'));
    w.level = SIM.WEAPON_MAX_LEVEL;
    assert.ok(w.isEvolved());
    sim.player.weapons = [w];
    const g = bear(sim, 'bag_holder', 120);
    g.hp = g.maxHp = 1e6;
    sim.step(0);
    const jar = sim.honey[0];
    const range = w.getRange(sim.player);
    assert.ok(Math.abs(jar.radius - HT.puddleRadius * (range / HT.baseRange) * 1.4) < 1e-9);
    assert.equal(jar.maxLife, HT.evolveLife);
    const dmg = w.getDamage(sim.player);
    assert.ok(Math.abs(jar.burn - dmg * HT.evolveBurn) < 1e-9);
    sim.player.weapons = []; // just this one jar from here
    steps(sim, HT.flight + 0.02);
    const hp = g.hp;
    const ev = steps(sim, 1.0);
    const burns = ev.filter((e) => e.t === 'dmg' && e.src === 'honey_trap').length;
    assert.equal(burns, 2, 'two burns in a second');
    assert.ok(Math.abs(hp - g.hp - 2 * jar.burn) < 1e-6);
});

test('honey trap: a plain puddle never burns', () => {
    const sim = quiet();
    const e = bear(sim, 'bag_holder', 250);
    e.hp = e.maxHp = 1e6;
    puddle(sim, 250, 0);
    steps(sim, 2);
    assert.equal(e.hp, 1e6);
});

test('runlog: runs that take honey trap replay exactly', () => {
    let checked = 0;
    for (let seed = 1; seed <= 20 && checked < 2; seed++) {
        const sim = new Simulation({ seed });
        const rec = new RunRecorder(seed, null, sim.characterId);
        const bot = createBot({ phase: seed });
        while (!sim.over && sim.time < 360) {
            if (sim.choices) {
                // always take honey when it's offered, else the bot's pick
                let i = sim.choices.findIndex((c) => c.id === 'honey_trap');
                if (i < 0) i = bot.pick(sim);
                rec.pick(sim.tick, i);
                sim.choose(i);
                continue;
            }
            const code = bot.move(sim);
            rec.tick(code);
            sim.step(code);
            sim.drainEvents();
        }
        if (!sim.stats.honeyEaten) continue;
        checked++;
        const r = replay(rec.toBytes());
        assert.ok(r.ok, r.error);
        assert.equal(r.hash, sim.stateHash());
        assert.deepEqual(r.summary, sim.summary());
    }
    assert.equal(checked, 2, 'found two bot runs where a grizzly ate honey');
});
