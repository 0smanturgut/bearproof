// The solid map (sim/terrain.js), piggy banks, pickups, the boss's treasure chest, and rerolls/skips of level-up
// cards (SIM_VERSION 22): all part of the deterministic simulation, so all of it must replay bit for bit.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/sim.js';
import { Terrain, PROPS, isSolid, CHUNK } from '../src/sim/terrain.js';
import { Breakable, Enemy, Pickup } from '../src/sim/entities.js';
import {
    BOSSES,
    CHOICE_REROLL,
    CHOICE_SKIP,
    PICKUPS,
    SIM,
    STAGE_ROTATION,
    enemyDef
} from '../src/sim/content.js';
import { RunRecorder, replay } from '../src/sim/runlog.js';
import { encodeMove } from '../src/sim/input-codes.js';
import { createBot } from '../src/sim/bot.js';

/** A sim with nothing spawning, no crates and no weapons: just the bull and the map. */
function quiet(stage = 'chop', seed = 7) {
    const sim = new Simulation({ seed, stage });
    sim._spawn = () => {};
    sim._dropCrate = () => {};
    sim._exitScam = () => {};
    sim._whaleTick = () => {};
    sim.player.weapons.length = 0;
    return sim;
}

/** The first solid prop of `kind` (id prefix or predicate) found around the origin, outside the spawn. */
function findProp(terrain, ok) {
    for (let r = 1; r < 8; r++)
        for (let j = -r; j <= r; j++)
            for (let i = -r; i <= r; i++)
                for (const p of terrain.chunkProps(i, j)) if (isSolid(p.id) && ok(p)) return p;
    return null;
}

test('terrain: the same map and seed lay out the same props, colliders and piggy banks', () => {
    for (const stage of STAGE_ROTATION) {
        const a = new Terrain(stage, 99);
        const b = new Terrain(stage, 99);
        for (let j = -2; j <= 2; j++)
            for (let i = -2; i <= 2; i++)
                assert.deepEqual(
                    a.chunkProps(i, j).map((p) => [p.id, p.x, p.y, p.flip]),
                    b.chunkProps(i, j).map((p) => [p.id, p.x, p.y, p.flip])
                );
        assert.deepEqual(a.breakablesNear(0, 0, 1500), b.breakablesNear(0, 0, 1500));
        // the caches don't matter: forgetting everything gives the same answers
        const probe = (t) => {
            const out = [];
            for (let k = 0; k < 300; k++)
                out.push(t.blocked(Math.sin(k) * 900, Math.cos(k * 1.7) * 900, 14));
            return out;
        };
        const before = probe(a);
        a.forget();
        assert.deepEqual(probe(a), before);
        assert.deepEqual(probe(b), before);
    }
});

test('terrain: the spawn is clear, and there is plenty solid around it', () => {
    for (const stage of STAGE_ROTATION)
        for (const seed of [1, 42, 777]) {
            const t = new Terrain(stage, seed);
            assert.ok(!t.blocked(0, 18, 20), `${stage}/${seed}: the bull starts free`);
            let solids = 0;
            for (let j = -4; j < 4; j++)
                for (let i = -4; i < 4; i++)
                    for (const p of t.chunkProps(i, j)) if (isSolid(p.id)) solids++;
            assert.ok(solids > 40, `${stage}/${seed}: ${solids} solid props in 2048x2048`);
        }
    // every solid prop has a footprint smaller than its sprite, and nothing small is solid
    for (const [id, def] of Object.entries(PROPS))
        if (def.w < 16) assert.ok(!def.solid || def.tall, id);
});

test('terrain: the bull walks into a wall and stops; it slides along it', () => {
    const sim = quiet('bear_trap', 11);
    const car = findProp(sim.terrain, (p) => p.id === 'trap_car');
    assert.ok(car, 'a car somewhere downtown');
    const p = sim.player;
    p.x = car.x - 140;
    p.y = car.y - 15 - p.size * SIM.BODY_FEET;
    const right = encodeMove(1, 0);
    for (let i = 0; i < 120; i++) sim.step(right);
    assert.ok(p.x < car.x - 60, `stopped short of the car (x ${p.x.toFixed(1)} vs ${car.x})`);
    // pushing diagonally into it slides the bull along its side
    const y0 = p.y;
    const diag = encodeMove(1, 1);
    for (let i = 0; i < 30; i++) sim.step(diag);
    assert.ok(p.y > y0 + 20, 'slid down along the car');
});

test('terrain: a bear walks around a tree to reach the bull; bosses and FUD clouds go through', () => {
    const sim = quiet('chop', 3);
    const tree = findProp(sim.terrain, (p) => p.id.startsWith('chop_pine') || p.id === 'chop_oak');
    assert.ok(tree);
    const p = sim.player;
    p.x = tree.x + 90;
    p.y = tree.y - 4 - p.size * SIM.BODY_FEET;
    p.shieldTimer = 1e9;
    const bear = new Enemy(tree.x - 90, tree.y - 4 - 12, enemyDef('grizzly'), 1, 1, sim);
    sim.enemies.push(bear);
    let reached = false;
    for (let i = 0; i < 60 * 6 && !reached; i++) {
        sim.step(0);
        reached = Math.hypot(bear.x - p.x, bear.y - p.y) < bear.size + p.size + 2;
        assert.ok(!sim.terrain.blocked(bear.x, bear.y + bear.size * 0.5, bear.size * 0.6 - 1));
    }
    assert.ok(reached, 'the grizzly went round the trunk');
    // a FUD cloud flies straight through the same trunk
    const cloud = new Enemy(tree.x - 90, tree.y - 4 - 8, enemyDef('fud_cloud'), 1, 1, sim);
    assert.ok(cloud.def.flies);
    assert.ok(Object.values(BOSSES).every((b) => b.boss));
});

test('piggy bank: one waits in sight of every spawn, the bull smashes it by running into it', () => {
    for (const stage of STAGE_ROTATION) {
        const sim = quiet(stage, 5);
        sim.step(0);
        const pig = sim.breakables.find((b) => b.x === -30 && b.y === 120);
        assert.ok(pig, `${stage}: the spawn's piggy bank`);
        const p = sim.player;
        p.x = -30;
        p.y = 100;
        sim.step(0);
        assert.equal(pig.hp, 0);
        assert.equal(sim.stats.smashed, 1);
        assert.ok(sim.broken.has(pig.key));
        const ev = sim.drainEvents().find((e) => e.t === 'smash');
        assert.ok(ev && ev.loot);
        // never comes back
        for (let i = 0; i < 60; i++) sim.step(0);
        assert.ok(!sim.breakables.some((b) => b.key === pig.key));
    }
});

test('piggy bank: any weapon smashes it, but no weapon aims at it and it never counts as a kill', () => {
    const sim = new Simulation({ seed: 5, stage: 'chop' });
    sim._spawn = () => {};
    sim._dropCrate = () => {};
    const p = sim.player;
    p.x = -30 + 60; // horns reach sideways
    p.y = 120;
    sim.step(0);
    assert.ok(sim.spatial.findNearest(p.x, p.y, 9999) === null, 'aimed weapons see no target');
    for (let i = 0; i < 120 && sim.stats.smashed === 0; i++) sim.step(0);
    assert.equal(sim.stats.smashed, 1, 'the horns smashed it');
    assert.equal(sim.stats.kills, 0);
    assert.equal(sim.stats.damageDealt, 0);
});

test('pickups: ramen heals, CLOUT banks, the sweep pulls every candle, halt freezes bears, squeeze wipes them', () => {
    const take = (kind, setup = () => {}) => {
        const sim = quiet('chop', 9);
        setup(sim);
        sim.pickups.push(new Pickup(sim.player.x, sim.player.y, kind, 10));
        sim.step(0);
        return sim;
    };
    let sim = take('ramen', (s) => (s.player.hp = 40));
    assert.equal(sim.player.hp, 40 + PICKUPS.ramen.heal);
    sim = take('clout');
    assert.equal(sim.stats.clout, PICKUPS.clout.clout);
    assert.equal(sim.summary().clout, PICKUPS.clout.clout);
    sim = take('magnet', (s) => {
        s.xp.push({ x: 600, y: 0, value: 5, fall: 0, update() {}, dead: false });
    });
    assert.ok(sim.xp[0].vacuum);
    sim = take('halt', (s) => s.enemies.push(new Enemy(60, 0, enemyDef('red_candle'), 1, 1, s)));
    const frozen = sim.enemies[0];
    const x0 = frozen.x;
    const hp0 = sim.player.hp;
    for (let i = 0; i < 60 * 3; i++) sim.step(0);
    assert.equal(frozen.x, x0, 'halted bears stand still');
    assert.equal(sim.player.hp, hp0, 'and touch nothing');
    for (let i = 0; i < 60 * 3; i++) sim.step(0);
    assert.notEqual(frozen.x, x0, 'then the market reopens');
    sim = take('squeeze', (s) => {
        for (let k = 0; k < 5; k++)
            s.enemies.push(new Enemy(200 + k * 30, 0, enemyDef('grizzly'), 1, 1, s));
    });
    sim.step(0); // the wiped bears are counted when the next tick clears the dead
    assert.equal(sim.stats.kills, 5);
    assert.equal(sim.stats.pickups, 1);
});

test('chest: every boss drops one; it levels up what the bull owns (an evolution can come out of it)', () => {
    const sim = quiet('chop', 21);
    sim.player.weapons.length = 0;
    const s2 = new Simulation({ seed: 21, stage: 'chop' }); // a horns bull
    s2._spawn = () => {};
    const boss = new Enemy(250, 0, BOSSES.RUG_LORD, 1, 1, s2);
    s2.enemies.push(boss);
    boss.hp = 0;
    s2._cullDead();
    const drop = s2.drainEvents().find((e) => e.t === 'chestDrop');
    assert.ok(drop, 'a chest fell');
    const chest = s2.pickups.find((pk) => pk.kind === 'chest');
    assert.ok(chest && chest.maxLife === SIM.CHEST_LIFE);
    const horns = s2.player.weapons[0];
    horns.level = horns.def.evolveLevel - 1;
    s2.player.x = chest.x;
    s2.player.y = chest.y;
    s2.step(0);
    const ev = s2.drainEvents();
    const opened = ev.find((e) => e.t === 'chest');
    assert.ok(opened && opened.items.length >= 1);
    assert.equal(s2.stats.chests, 1);
    assert.equal(horns.level, horns.def.evolveLevel, 'the only thing to level was the horns');
    assert.ok(ev.some((e) => e.t === 'evolve' && e.id === horns.id));
    assert.ok(opened.items[0].evolves);
    void sim;
});

test('level-up: two rerolls and two skips a run; extra ones fall back to a card', () => {
    const sim = quiet('chop', 4);
    sim.pendingLevelUps = 1;
    sim._rollChoices();
    const first = sim.choices.map((c) => c.id).join();
    assert.ok(sim.choose(CHOICE_REROLL));
    assert.equal(sim.rerolls, SIM.REROLLS - 1);
    assert.ok(sim.choices, 'still choosing');
    assert.ok(sim.drainEvents().some((e) => e.t === 'reroll'));
    void first;
    assert.ok(sim.choose(CHOICE_SKIP));
    assert.equal(sim.skips, SIM.SKIPS - 1);
    assert.equal(sim.choices, null);
    assert.equal(sim.picks, 0, 'a skip is not a pick');
    // out of rerolls: the index falls back to the last card
    sim.rerolls = 0;
    sim.pendingLevelUps = 1;
    sim._rollChoices();
    const last = sim.choices[2];
    sim.choose(CHOICE_REROLL);
    assert.equal(sim.choices, null);
    assert.equal(sim.picks, 1);
    void last;
});

test('replay: an autopilot run on every map, with rerolls, skips, piggy banks and walls, replays bit for bit', () => {
    let rerolled = 0;
    let skipped = 0;
    for (const stage of STAGE_ROTATION) {
        const seed = stage === 'chop' ? 3 : stage === 'bear_trap' ? 4 : 5; // stageForSeed(seed) === stage
        const sim = new Simulation({ seed });
        assert.equal(sim.stageId, stage);
        const rec = new RunRecorder(seed);
        // play well until the fourth level-up, then charge in so the run ends quickly
        const careful = createBot({ phase: 17 });
        const reckless = createBot({ phase: 17, style: 'reckless' });
        let n = 0;
        while (!sim.over) {
            if (sim.choices) {
                n++;
                // the third level-up rerolls, the fourth skips
                const i = n === 3 ? CHOICE_REROLL : n === 4 ? CHOICE_SKIP : careful.pick(sim);
                rec.pick(sim.tick, i);
                sim.choose(i);
            } else {
                const code = (n < 5 ? careful : reckless).move(sim);
                rec.tick(code);
                sim.step(code);
            }
            sim.drainEvents();
        }
        const out = replay(rec.toBytes());
        assert.ok(out.ok, `${stage}: ${out.error}`);
        assert.equal(out.hash, sim.stateHash(), `${stage}: same final state`);
        assert.equal(out.summary.score, sim.stats.score);
        rerolled += sim.stats.rerolls;
        skipped += sim.stats.skips;
    }
    assert.ok(rerolled > 0 && skipped > 0, `exercised: ${rerolled} rerolls, ${skipped} skips`);
});

test('terrain: chunk props never straddle chunks (each belongs to the chunk of its foot)', () => {
    const t = new Terrain('bear_trap', 8);
    for (let j = -2; j <= 2; j++)
        for (let i = -2; i <= 2; i++)
            for (const p of t.chunkProps(i, j)) {
                assert.ok(p.x >= i * CHUNK && p.x < (i + 1) * CHUNK);
                assert.ok(p.y >= j * CHUNK && p.y < (j + 1) * CHUNK);
            }
    assert.ok(new Breakable(1, 0, 0).breakable);
});
