// Bear Spray (Build #16): a new weapon. A cone at the nearest bear that shoves bears back and breaks a grizzly's
// shield in one hit. Evolves at Lv 5 into Max Pain: a wider cone that slows.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/sim.js';
import { Enemy } from '../src/sim/entities.js';
import { Weapon } from '../src/sim/weapons.js';
import { RunRecorder, replay } from '../src/sim/runlog.js';
import { createBot } from '../src/sim/bot.js';
import { BOSSES, CHARACTER_IDS, SIM, WEAPONS, enemyDef } from '../src/sim/content.js';
import { ICONS } from '../src/art/sprites.js';
import { guideSections } from '../src/guide.js';

const SPRAY = WEAPONS.BEAR_SPRAY;

/** A bull with only Bear Spray at `level`, and hand-placed bears of `kind` that stand still. */
function field(positions, { level = 1, kind = 'bag_holder' } = {}) {
    const sim = new Simulation({ seed: 11 });
    const spray = new Weapon(SPRAY);
    spray.level = level;
    sim.player.weapons = [spray];
    const def = enemyDef(kind) || Object.values(BOSSES).find((b) => b.id === kind);
    sim.enemies = positions.map(([x, y]) => {
        const e = new Enemy(sim.player.x + x, sim.player.y + y, def, 1, 1, sim);
        e.speed = 0;
        e.abilityTimer = 99; // a boss doesn't use its ability mid-test
        return e;
    });
    sim.spatial.rebuild(sim.enemies);
    return { sim, spray };
}

const hurt = (e) => e.hp < e.maxHp;

test('bear spray: a weapon for every character, with an icon and a guide entry', () => {
    assert.equal(SPRAY.id, 'bear_spray');
    assert.equal(SPRAY.type, 'spray');
    assert.equal(SPRAY.character, undefined, 'not a signature weapon');
    assert.ok(ICONS.bear_spray, 'icon exists');
    for (const character of CHARACTER_IDS) {
        const sim = new Simulation({ seed: 3, character });
        const { live } = sim._upgradePool();
        assert.ok(
            live.some((c) => c.id === 'bear_spray' && c.isNew),
            `${character} can be offered it`
        );
    }
    const e = guideSections()
        .find((s) => s.id === 'weapons')
        .entries.find((x) => x.id === 'bear_spray');
    assert.equal(e.extra, `Lv 5 → Max Pain: ${SPRAY.evolveDescription}`);
});

test('bear spray: hits the bears in the cone, misses the ones beside, behind and out of reach', () => {
    const { sim, spray } = field([
        [100, 0], // the target
        [100, 40], // 22° off the aim: inside a 60° cone
        [100, 90], // 42° off: outside
        [-120, 0], // behind the bull
        [200, 0] // past the reach (150 + its size)
    ]);
    assert.ok(spray.getRange(sim.player) < 200 - 18);
    spray.fire(sim.player, sim);
    assert.deepEqual(sim.enemies.map(hurt), [true, true, false, false, false]);
    const ev = sim.drainEvents().find((x) => x.t === 'spray');
    assert.ok(ev && Math.abs(ev.a) < 1e-9, 'aimed at the nearest bear');
    assert.ok(Math.abs(ev.half - Math.PI / 6) < 1e-12, 'a 60° cone');
});

test('bear spray: a bear on top of the bull gets sprayed even from behind', () => {
    const { sim, spray } = field([
        [60, 0], // the nearest, so the aim is to the right
        [-20, 0] // touching the bull's back
    ]);
    sim.enemies[0].x = sim.player.x + 15; // now the right one is nearest
    sim.spatial.rebuild(sim.enemies);
    spray.fire(sim.player, sim);
    assert.ok(hurt(sim.enemies[0]));
    assert.ok(hurt(sim.enemies[1]), 'touching counts');
});

test('bear spray: a hit bear is shoved straight back by the knockback; a boss stays put', () => {
    const { sim, spray } = field([[60, 80]]);
    const e = sim.enemies[0];
    spray.fire(sim.player, sim);
    for (let i = 0; i < 12; i++) e.update(1 / 60, sim);
    const d = Math.hypot(e.x - sim.player.x, e.y - sim.player.y);
    assert.ok(Math.abs(d - (100 + SPRAY.knockback)) < 1e-6, `shoved to ${d}`);
    assert.ok(
        Math.abs((e.y - sim.player.y) / (e.x - sim.player.x) - 80 / 60) < 1e-9,
        'straight away'
    );
    assert.ok(!(e.knockTimer > 0), 'the shove is over by 0.2 s');

    const boss = field([[100, 0]], { kind: 'rug_lord' });
    const b = boss.sim.enemies[0];
    boss.spray.fire(boss.sim.player, boss.sim);
    assert.ok(hurt(b));
    for (let i = 0; i < 12; i++) b.update(1 / 60, boss.sim);
    assert.equal(b.x, boss.sim.player.x + 100);
});

test("bear spray: breaks a grizzly's whole shield, and its own hit lands at full damage", () => {
    const { sim, spray } = field([[100, 0]], { kind: 'grizzly' });
    const g = sim.enemies[0];
    assert.ok(g.shielded && g.shieldHp === 60);
    const dmg = spray.getDamage(sim.player);
    spray.fire(sim.player, sim);
    assert.equal(g.shielded, false);
    assert.equal(g.shieldHp, 0);
    assert.equal(g.maxHp - g.hp, dmg, 'not halved');
    assert.equal(sim.stats.shieldsBroken, 1);
    const ev = sim.drainEvents();
    assert.ok(ev.some((x) => x.t === 'shieldBreak'));
    // Horns at the same damage only chip the shield: half the hit goes into it
    const horns = field([[100, 0]], { kind: 'grizzly' });
    const g2 = horns.sim.enemies[0];
    horns.sim.damageEnemy(g2, dmg, false, 'horns');
    assert.equal(g2.maxHp - g2.hp, dmg / 2);
    assert.ok(g2.shielded);
});

test('bear spray: Max Pain at Lv 5 sprays a 100° cone and slows what it hits 40% for 1.5 s', () => {
    const at = (level) => {
        const { sim, spray } = field(
            [
                [100, 0],
                [100, 90] // 42° off the aim
            ],
            { level }
        );
        spray.fire(sim.player, sim);
        return sim.enemies;
    };
    const [a4, b4] = at(4);
    assert.ok(!hurt(b4), 'Lv 4 misses the wide bear');
    assert.ok(!(a4.slowTimer > 0), 'Lv 4 never slows');
    const [a5, b5] = at(5);
    assert.ok(hurt(b5), 'Max Pain reaches it');
    for (const e of [a5, b5]) {
        assert.equal(e.slowTimer, SPRAY.evolveSlowDuration);
        assert.equal(e.slowPct, SPRAY.evolveSlowPct);
    }
});

test("bear spray: Max Pain never weakens Circuit Breaker's stronger freeze", () => {
    const { sim, spray } = field([[100, 0]], { level: 5 });
    const e = sim.enemies[0];
    e.slowTimer = 0.5;
    e.slowPct = 0.5;
    spray.fire(sim.player, sim);
    assert.equal(e.slowPct, 0.5);
    assert.equal(e.slowTimer, 0.5);
});

test('bear spray: runs that take it break shields and replay bit for bit', () => {
    let broken = 0;
    for (const [seed, character] of [
        [4, 'bull'],
        [9, 'pepe']
    ]) {
        const sim = new Simulation({ seed, character });
        const rec = new RunRecorder(seed, null, sim.characterId);
        const bot = createBot();
        while (!sim.over && sim.tick < SIM.MAX_TICKS) {
            if (sim.choices) {
                const s = sim.choices.findIndex((c) => c.id === 'bear_spray');
                const i = s >= 0 ? s : bot.pick(sim);
                rec.pick(sim.tick, i);
                sim.choose(i);
                continue;
            }
            const code = bot.move(sim);
            rec.tick(code);
            sim.step(code);
            sim.drainEvents();
        }
        assert.ok(
            sim.player.weapons.some((w) => w.id === 'bear_spray'),
            `${character} took it`
        );
        broken += sim.stats.shieldsBroken;
        const r = replay(rec.toBytes());
        assert.ok(r.ok, r.error);
        assert.equal(r.hash, sim.stateHash());
        assert.deepEqual(r.summary, sim.summary());
    }
    assert.ok(broken > 0, `shields broken: ${broken}`);
});
