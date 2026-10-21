// The Miner, the fourth character (Build #29): his stats, the Pickaxe (out and back, cracks shields), Block
// Reward (kills mine blocks, a block is a quake, the difficulty adjusts), and that his runs replay as the Miner.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/sim.js';
import { Enemy } from '../src/sim/entities.js';
import { RunRecorder, decodeRunLog, replay } from '../src/sim/runlog.js';
import { createBot } from '../src/sim/bot.js';
import { CHARACTERS, CHARACTER_IDS, PASSIVES, SIM, WEAPONS, enemyDef } from '../src/sim/content.js';

const PICK = WEAPONS.PICKAXE;
const MINER = CHARACTERS.miner;

/** A Miner sim with hand-placed, standing bears (tough bag holders unless `id` says otherwise), nothing else. */
function field(positions, { level = 1, id = 'bag_holder', hp = 1000 } = {}) {
    const sim = new Simulation({ seed: 7, character: 'miner' });
    sim.enemies = positions.map(([x, y]) => new Enemy(x, y, enemyDef(id), 1, 1, sim));
    for (const e of sim.enemies) {
        e.speed = 0;
        if (hp) e.hp = e.maxHp = hp;
    }
    sim.spatial.rebuild(sim.enemies); // the pick aims through the spatial hash
    const pick = sim.player.weapons[0];
    pick.level = level;
    // Diamond Pickaxe needs its catalyst (SIM_VERSION 25)
    if (level >= PICK.evolveLevel) sim.player.addPassive(PASSIVES.HIGH_FREQUENCY);
    return { sim, pick };
}

/** Fly the picks for `secs` with the bears frozen in place. */
function fly(sim, secs) {
    for (let i = 0; i < Math.round(secs * 60); i++) {
        sim.spatial.rebuild(sim.enemies);
        sim._updateList(sim.pickaxes, SIM.DT);
    }
}

test('miner: index 3, starts with the Pickaxe, 110 HP, a little slow', () => {
    assert.equal(CHARACTER_IDS.indexOf('miner'), 3, 'append-only: the miner is byte 3');
    const sim = new Simulation({ seed: 3, character: 'miner' });
    assert.equal(sim.characterId, 'miner');
    assert.deepEqual(
        sim.player.weapons.map((w) => w.id),
        ['pickaxe']
    );
    assert.equal(sim.player.hp, 110);
    assert.equal(sim.player.maxHp, 110);
    assert.ok(Math.abs(sim.player.getSpeedMult() - 0.95) < 1e-12);
    assert.equal(sim.player.size, SIM.PLAYER_SIZE);
    assert.equal(sim.blockNeed, MINER.blockKills);
    assert.equal(sim.blockProgress, 0);
    assert.equal(MINER.sprite, 'miner_hero');
    // nobody else mines
    for (const c of ['bull', 'pepe', 'whale']) {
        const other = new Simulation({ seed: 3, character: c });
        assert.equal(other.blockNeed, 0);
        assert.equal(other.blockProgress, null);
    }
});

test('pickaxe: only the Miner gets it, never from a level-up card', () => {
    assert.equal(PICK.character, 'miner');
    for (const c of ['bull', 'pepe', 'whale']) {
        const sim = new Simulation({ seed: 11, character: c });
        const bot = createBot();
        while (!sim.over && sim.tick < 4 * 60 * 60) {
            while (sim.choices) {
                assert.ok(
                    !sim.choices.some((ch) => ch.id === 'pickaxe'),
                    `${c} was offered the Pickaxe`
                );
                sim.choose(bot.pick(sim));
            }
            sim.step(bot.move(sim));
            sim.events.length = 0;
        }
    }
});

test('pickaxe: flies out to its range and back, hitting a bear once each way; misses one past its range', () => {
    const { sim, pick } = field([
        [80, 0],
        [400, 0] // well past 170
    ]);
    pick.fire(sim.player, sim);
    assert.equal(sim.pickaxes.length, 1);
    assert.ok(sim.drainEvents().some((e) => e.t === 'fire' && e.w === 'pickaxe'));
    fly(sim, 0.25);
    const near = sim.enemies[0];
    assert.ok(near.hp < near.maxHp, 'hit on the way out');
    assert.equal(sim.stats.pickHits, 1);
    // out to 170 (0.4 s) and back (0.4 s)
    fly(sim, 1.2);
    assert.equal(sim.pickaxes.length, 0, 'the pick is gone once it is back in the paw');
    assert.equal(sim.stats.pickHits, 2, 'and hit the near bear again on the way back');
    assert.ok(sim.drainEvents().some((e) => e.t === 'pickTurn'));
    assert.equal(sim.enemies[1].hp, sim.enemies[1].maxHp, 'the far bear was never reached');
    const lost = near.maxHp - near.hp;
    assert.ok(lost >= PICK.baseDamage * 2 - 1e-9 && lost <= PICK.baseDamage * 4 + 1e-9);
});

test('pickaxe: comes back to where the Miner is now, not where he threw it', () => {
    const { sim, pick } = field([[60, 0]]);
    pick.fire(sim.player, sim);
    const p = sim.pickaxes[0];
    fly(sim, 0.5); // turned around by now
    assert.ok(p.back);
    sim.player.y = 120;
    fly(sim, 1);
    assert.ok(p.dead);
    assert.ok(Math.abs(p.y - 120) < 30, 'it homed in on the moved Miner');
});

test("pickaxe: a hit cracks a grizzly's whole shield, so the hit lands in full", () => {
    const { sim, pick } = field([[70, 0]], { id: 'grizzly', hp: 0 });
    const g = sim.enemies[0];
    assert.ok(g.shielded && g.shieldHp > 0);
    const hp0 = g.hp;
    pick.fire(sim.player, sim);
    fly(sim, 0.25);
    assert.equal(g.shielded, false);
    assert.equal(g.shieldHp, 0);
    assert.equal(sim.stats.shieldsBroken, 1);
    const lost = hp0 - g.hp;
    assert.ok(lost >= PICK.baseDamage - 1e-9, `not halved (lost ${lost})`);
    assert.ok(sim.drainEvents().some((e) => e.t === 'shieldBreak'));
});

test('pickaxe: does nothing with no bear in range', () => {
    const { sim, pick } = field([[500, 0]]);
    pick.fire(sim.player, sim);
    assert.equal(sim.pickaxes.length, 0);
});

test('diamond pickaxe: from level 5, two picks in a fan, each harder', () => {
    const { sim, pick } = field([[100, 0]], { level: 5 });
    assert.ok(pick.isEvolved());
    pick.fire(sim.player, sim);
    assert.equal(sim.pickaxes.length, PICK.evolveFan);
    const [a, b] = sim.pickaxes;
    assert.ok(a.diamond && b.diamond);
    assert.ok(Math.abs(a.uy + b.uy) < 1e-9 && a.uy !== 0, 'fanned evenly around the aim');
    // level 5: base * (1 + 4 * 0.2), then the evolution's 20%
    assert.ok(Math.abs(a.damage - PICK.baseDamage * 1.8 * PICK.evolveDamageMult) < 1e-9);
});

test('block reward: every block needs more kills; a quake hits, cracks shields and shoves inside its radius', () => {
    const { sim } = field(
        [
            [100, 0],
            [700, 0]
        ],
        { id: 'grizzly', hp: 0 }
    );
    const [g, far] = sim.enemies;
    const gHp = g.hp;
    // kill bears one by one until the first block
    const dead = () => {
        const e = new Enemy(30, 30, enemyDef('red_candle'), 1, 1, sim);
        e.hp = 0;
        sim.enemies.push(e);
        sim._cullDead();
    };
    for (let i = 0; i < MINER.blockKills - 1; i++) dead();
    assert.equal(sim.blockPending, 0);
    assert.ok(Math.abs(sim.blockProgress - (MINER.blockKills - 1) / MINER.blockKills) < 1e-12);
    dead();
    assert.equal(sim.blockPending, 1);
    assert.equal(sim.blockKills, 0);
    assert.equal(
        sim.blockNeed,
        Math.round(MINER.blockKills * MINER.blockGrowth),
        'the difficulty adjusts'
    );
    sim.drainEvents();
    sim._mineBlock();
    assert.equal(sim.blockPending, 0);
    assert.equal(sim.stats.blocks, 1);
    assert.equal(g.shielded, false, 'the quake cracks the shield');
    assert.ok(Math.abs(gHp - g.hp - MINER.blockDamage) < 1e-9, 'and hits in full');
    assert.ok(g.knockTimer > 0 && g.knockVx > 0, 'shoved away from the Miner');
    assert.equal(far.hp, far.maxHp, 'out of reach');
    assert.ok(far.shielded);
    const ev = sim.drainEvents().find((e) => e.t === 'block');
    assert.ok(ev);
    assert.equal(ev.n, 1);
    assert.equal(ev.count, 1);
    assert.equal(ev.r, MINER.blockRadius);
    assert.equal(sim.stats.quakeHits, 1);
});

test('block reward: delisted bears and self-destructs do not count; a quake fires on the next step', () => {
    const { sim } = field([]);
    sim.blockKills = MINER.blockKills - 1;
    const e = new Enemy(30, 30, enemyDef('red_candle'), 1, 1, sim);
    e.hp = 0;
    e.delisted = true;
    const s = new Enemy(30, 30, enemyDef('red_candle'), 1, 1, sim);
    s.hp = 0;
    s.selfDestructed = true;
    sim.enemies.push(e, s);
    sim._cullDead();
    assert.equal(sim.blockKills, MINER.blockKills - 1);
    const k = new Enemy(30, 30, enemyDef('red_candle'), 1, 1, sim);
    k.hp = 0;
    sim.enemies.push(k);
    sim.step(0);
    assert.equal(sim.stats.blocks, 1, 'the step resolves the block it counted');
    assert.ok(sim.drainEvents().some((ev) => ev.t === 'block'));
});

test('block reward: a bull run never mines', () => {
    const sim = new Simulation({ seed: 7, character: 'bull' });
    for (let i = 0; i < 100; i++) {
        const e = new Enemy(30, 30, enemyDef('red_candle'), 1, 1, sim);
        e.hp = 0;
        sim.enemies.push(e);
    }
    sim._cullDead();
    assert.equal(sim.blockPending, 0);
    assert.equal(sim.blockKills, 0);
});

test('runlog: a Miner run replays as the Miner, and differs as the bull', () => {
    const seed = 21;
    const sim = new Simulation({ seed, character: 'miner' });
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
    assert.ok(sim.stats.pickHits > 0, 'the pick hits things in a real run');
    assert.ok(sim.stats.blocks > 0, 'and blocks get mined');
    const bytes = rec.toBytes();
    assert.equal(decodeRunLog(bytes).character, 'miner');
    const r = replay(bytes);
    assert.ok(r.ok, r.error);
    assert.equal(r.hash, sim.stateHash());
    assert.deepEqual(r.summary, sim.summary());
    const asBull = bytes.slice();
    asBull[9] = 0;
    const rb = replay(asBull);
    assert.ok(!rb.ok || rb.hash !== sim.stateHash());
});
