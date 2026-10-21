// The Whale, the third character (Build #26): its stats, Buy Wall, Sweep the Book, and that its runs replay as
// the Whale. (whale.test.js is Whale Alert, the visitor that swims across at 1:30.)

import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/sim.js';
import { Enemy, XpOrb } from '../src/sim/entities.js';
import { RunRecorder, decodeRunLog, replay } from '../src/sim/runlog.js';
import { createBot } from '../src/sim/bot.js';
import {
    BOSSES,
    CHARACTERS,
    CHARACTER_IDS,
    PASSIVES,
    SIM,
    WEAPONS,
    enemyDef
} from '../src/sim/content.js';

/** A Whale sim with hand-placed bears (bag holders unless `id` says otherwise) and nothing else on the field. */
function field(positions, { level = 1, def = enemyDef('bag_holder') } = {}) {
    const sim = new Simulation({ seed: 7, character: 'whale' });
    sim.enemies = positions.map(([x, y]) => new Enemy(x, y, def, 1, 1, sim));
    for (const e of sim.enemies) e.speed = 0; // stand still: only the wall moves them
    const wall = sim.player.weapons[0];
    wall.level = level;
    // Tsunami Bid needs its catalyst (SIM_VERSION 25)
    if (level >= wall.def.evolveLevel) sim.player.addPassive(PASSIVES.WHALE_GRAVITY);
    return { sim, wall };
}

/** Run the walls (and the delayed follow-up) for `secs` with the enemies frozen in place. */
function roll(sim, secs) {
    for (let i = 0; i < Math.round(secs * 60); i++) {
        sim.spatial.rebuild(sim.enemies);
        for (const e of sim.enemies) {
            if (e.knockTimer > 0) {
                e.x += e.knockVx * SIM.DT;
                e.y += e.knockVy * SIM.DT;
                e.knockTimer -= SIM.DT;
            }
        }
        sim._updateList(sim.walls, SIM.DT);
        sim._runDelayed(SIM.DT);
    }
}

test('whale: index 2, starts with Buy Wall, 120 HP, slow and big', () => {
    assert.equal(CHARACTER_IDS.indexOf('whale'), 2, 'append-only: the whale is byte 2');
    const sim = new Simulation({ seed: 3, character: 'whale' });
    assert.equal(sim.characterId, 'whale');
    assert.deepEqual(
        sim.player.weapons.map((w) => w.id),
        ['buy_wall']
    );
    assert.equal(sim.player.hp, 120);
    assert.equal(sim.player.maxHp, 120);
    assert.ok(Math.abs(sim.player.getSpeedMult() - 0.85) < 1e-12);
    assert.equal(sim.player.size, 24);
    // the bull and Pepe keep their numbers
    for (const c of ['bull', 'pepe']) {
        const other = new Simulation({ seed: 3, character: c });
        assert.equal(other.player.size, SIM.PLAYER_SIZE);
        assert.equal(other.sweepIn, null);
    }
    assert.equal(CHARACTERS.whale.sprite, 'whale_hero');
});

test('buy wall: rolls out to its range, hits every bear it reaches once, misses the ones past it', () => {
    const { sim, wall } = field([
        [60, 0],
        [0, -100],
        [-90, 70],
        [400, 0] // well past 150
    ]);
    wall.fire(sim.player, sim);
    assert.equal(sim.walls.length, 1);
    const ev = sim.drainEvents();
    assert.ok(ev.some((e) => e.t === 'wall' && e.r === 150));
    assert.ok(ev.some((e) => e.t === 'fire' && e.w === 'buy_wall'));
    // not instant: after a few ticks only the closest bear has been reached
    roll(sim, 0.15);
    assert.deepEqual(
        sim.enemies.map((e) => e.hp < e.maxHp),
        [true, false, false, false]
    );
    roll(sim, 1);
    assert.equal(sim.walls.length, 0, 'the wall is gone once it reaches its range');
    const lost = sim.enemies.map((e) => e.maxHp - e.hp);
    assert.deepEqual(
        lost.map((v) => v > 0),
        [true, true, true, false]
    );
    // once each, even though a shoved bear could meet the front again
    for (const v of lost.slice(0, 3)) assert.ok(v <= WEAPONS.BUY_WALL.baseDamage * 2 + 1e-9);
    assert.equal(sim.stats.wallHits, 3);
});

test('buy wall: shoves bears straight away from the Whale; bosses take the hit but stay put', () => {
    const { sim, wall } = field([[80, 0]]);
    wall.fire(sim.player, sim);
    roll(sim, 0.6);
    const e = sim.enemies[0];
    assert.ok(e.x > 80 + WEAPONS.BUY_WALL.knockback * 0.9, `shoved out to ${e.x}`);
    assert.ok(Math.abs(e.y) < 1e-9);

    const boss = field([[80, 0]], { def: BOSSES.RUG_LORD });
    boss.wall.fire(boss.sim.player, boss.sim);
    roll(boss.sim, 0.6);
    const b = boss.sim.enemies[0];
    assert.ok(b.hp < b.maxHp);
    assert.equal(b.x, 80);
});

test('buy wall: Tsunami Bid (level 5) sends a second, wider wall right behind the first', () => {
    // a level-5 wall reaches 150 × 1.4 = 210, the second one 1.35× that: 283
    const spots = [
        [100, 0],
        [250, 0]
    ];
    const plain = field(spots, { level: 4 });
    plain.wall.fire(plain.sim.player, plain.sim);
    roll(plain.sim, 1.5);
    assert.deepEqual(
        plain.sim.enemies.map((e) => e.hp < e.maxHp),
        [true, false]
    );

    const evolved = field(spots, { level: 5 });
    assert.ok(evolved.wall.isEvolved());
    evolved.wall.fire(evolved.sim.player, evolved.sim);
    roll(evolved.sim, 1.5);
    assert.deepEqual(
        evolved.sim.enemies.map((e) => e.hp < e.maxHp),
        [true, true]
    );
    const walls = evolved.sim.drainEvents().filter((e) => e.t === 'wall');
    assert.equal(walls.length, 2);
    assert.ok(walls[1].second && walls[1].r > walls[0].r);
});

test("buy wall: a signature weapon, only on the Whale's level-up cards", () => {
    const whale = new Simulation({ seed: 4, character: 'whale' });
    assert.ok(whale._upgradePool().live.some((c) => c.id === 'buy_wall'));
    assert.ok(!whale._upgradePool().live.some((c) => c.id === 'tongue'));
    for (const c of ['bull', 'pepe']) {
        const other = new Simulation({ seed: 4, character: c });
        assert.ok(!other._upgradePool().live.some((x) => x.id === 'buy_wall'));
    }
});

test('sweep the book: on each full minute, every landed candle within the radius flies in; others stay', () => {
    const sim = new Simulation({ seed: 9, character: 'whale' });
    // no bears, no spawns: just the candles
    sim._spawn = () => {};
    sim._whaleTick = () => {};
    sim._dropCrate = () => {};
    sim._exitScam = () => {};
    sim.player.invincibleTimer = 1e9;
    sim.player.weapons.length = 0; // no walls in the way
    while (sim.tick < 50 * 60) sim.step(0);
    // candles live 30 s, so drop them 10 s before the minute
    const near = new XpOrb(500, 0, 5); // outside the magnet, inside the sweep
    const far = new XpOrb(900, 0, 5); // outside the sweep
    const falling = new XpOrb(-400, 0, 5, 30); // still falling for 30 s
    const frozen = new XpOrb(0, 450, 5);
    frozen.frozen = true;
    sim.xp.push(near, far, falling, frozen);
    while (sim.tick < 60 * 60 - 1) sim.step(0);
    assert.equal(sim.sweepIn, 1 / 60);
    assert.ok(!near.vacuum && !far.vacuum);
    assert.ok(!sim.drainEvents().some((e) => e.t === 'sweep'), 'no sweep before 1:00');
    sim.step(0);
    assert.equal(sim.sweepIn, 60);
    const ev = sim.drainEvents().find((e) => e.t === 'sweep');
    assert.ok(ev, 'a sweep at 1:00');
    assert.equal(ev.n, 1);
    assert.ok(near.vacuum, 'the near candle flies in');
    assert.ok(!far.vacuum && !falling.vacuum && !frozen.vacuum);
    for (let i = 0; i < 90; i++) sim.step(0);
    assert.ok(near.dead, 'and gets picked up');
    assert.equal(sim.stats.sweeps, 1);
    assert.equal(sim.stats.swept, 1);
});

test('sweep the book: only the Whale sweeps', () => {
    const sim = new Simulation({ seed: 9, character: 'pepe' });
    sim.tick = 60 * 60 - 1;
    sim._sweep();
    sim.tick++;
    sim._sweep();
    assert.ok(!sim.drainEvents().some((e) => e.t === 'sweep'));
});

test('runlog: a Whale run replays as the Whale, and differs as the bull', () => {
    const seed = 21;
    const sim = new Simulation({ seed, character: 'whale' });
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
        const code = (sim.tick < 60 * 60 ? bot : reckless).move(sim);
        rec.tick(code);
        sim.step(code);
        sim.drainEvents();
    }
    assert.ok(sim.stats.wallHits > 0, 'the wall hits things in a real run');
    const bytes = rec.toBytes();
    assert.equal(decodeRunLog(bytes).character, 'whale');
    const r = replay(bytes);
    assert.ok(r.ok, r.error);
    assert.equal(r.hash, sim.stateHash());
    assert.deepEqual(r.summary, sim.summary());
    const asBull = bytes.slice();
    asBull[9] = 0;
    const rb = replay(asBull);
    assert.ok(!rb.ok || rb.hash !== sim.stateHash());
});
