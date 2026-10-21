// Catalysts (Build #30, SIM_VERSION 25): a weapon evolves at Lv 5 only while the bull holds its `evolveWith`
// passive. Either order works, the level-up cards say so, and the legacy rules (sim 21) keep Lv 5 alone.

import test from 'node:test';
import assert from 'node:assert/strict';
import { LEGACY_SIM_VERSION, Simulation } from '../src/sim/sim.js';
import { Weapon } from '../src/sim/weapons.js';
import { PASSIVES, SIM, WEAPONS, enemyDef, weaponDef } from '../src/sim/content.js';
import { Enemy } from '../src/sim/entities.js';

const passiveById = (id) => Object.values(PASSIVES).find((p) => p.id === id);

/** A sim with nothing spawning: no bears, no level-ups unless a test deals them. */
function quiet(opts = {}) {
    const sim = new Simulation({ seed: 7, stage: 'chop', ...opts });
    sim._spawn = () => {};
    return sim;
}

/** Deal exactly these cards, then pick the one at `index`. */
function dealAndPick(sim, cards, index = 0) {
    sim.choices = cards;
    sim.pendingLevelUps = 1;
    sim.choose(index);
    return sim.drainEvents();
}

test('catalysts: every weapon evolves at Lv 5 with a passive that exists, and says which', () => {
    for (const w of Object.values(WEAPONS)) {
        assert.equal(w.evolveLevel, SIM.WEAPON_MAX_LEVEL, `${w.id} evolves at max level`);
        assert.ok(w.evolveName && w.evolveDescription, `${w.id} has an evolution`);
        assert.ok(passiveById(w.evolveWith), `${w.id}'s catalyst ${w.evolveWith} is a passive`);
    }
    // the base weapons (everyone's pool) each have their own catalyst
    const base = Object.values(WEAPONS).filter((w) => !w.character);
    assert.equal(new Set(base.map((w) => w.evolveWith)).size, base.length);
});

test('catalysts: Lv 5 without the passive does not evolve; taking it then evolves on that pick', () => {
    const sim = quiet();
    const horns = sim.player.weapons[0];
    horns.level = 4;
    let ev = dealAndPick(sim, [{ kind: 'weapon', id: 'horns', level: 5, evolves: false }]);
    assert.equal(horns.level, 5);
    assert.equal(horns.isEvolved(), false);
    assert.ok(horns.awaitsCatalyst());
    assert.ok(!ev.some((e) => e.t === 'evolve'));
    ev = dealAndPick(sim, [{ kind: 'passive', id: 'momentum', level: 1, isNew: true }]);
    assert.ok(horns.isEvolved());
    assert.deepEqual(
        ev.filter((e) => e.t === 'evolve').map((e) => e.id),
        ['horns']
    );
    // announced once: a second stack doesn't evolve it again
    ev = dealAndPick(sim, [{ kind: 'passive', id: 'momentum', level: 2 }]);
    assert.ok(!ev.some((e) => e.t === 'evolve'));
});

test('catalysts: the passive first, then Lv 5 evolves on the weapon card', () => {
    const sim = quiet();
    sim.player.addPassive(PASSIVES.MOMENTUM);
    const horns = sim.player.weapons[0];
    horns.level = 4;
    const ev = dealAndPick(sim, [{ kind: 'weapon', id: 'horns', level: 5, evolves: true }]);
    assert.ok(horns.isEvolved());
    assert.deepEqual(
        ev.filter((e) => e.t === 'evolve').map((e) => e.id),
        ['horns']
    );
});

test('catalysts: the cards say what evolves and what it still needs', () => {
    const sim = quiet();
    sim.player.weapons[0].level = 4; // horns
    sim.player.weapons.push(new Weapon(weaponDef('hopium'), sim.player));
    let pool = sim._upgradePool().live;
    const horns = pool.find((c) => c.id === 'horns');
    assert.equal(horns.evolves, false);
    assert.equal(horns.needs, 'momentum');
    const momentum = pool.find((c) => c.id === 'momentum');
    assert.equal(momentum.catalystFor, 'horns');
    assert.equal(pool.find((c) => c.id === 'dca').catalystFor, 'hopium');
    assert.equal(pool.find((c) => c.id === 'alpha').catalystFor, undefined);
    // with Momentum held, the Lv 5 card evolves
    sim.player.addPassive(PASSIVES.MOMENTUM);
    pool = sim._upgradePool().live;
    assert.equal(pool.find((c) => c.id === 'horns').evolves, true);
    assert.equal(pool.find((c) => c.id === 'horns').needs, undefined);
    // a weapon waiting at Lv 5: its catalyst's card says it evolves it
    const s2 = quiet();
    s2.player.weapons[0].level = 5;
    const card = s2._upgradePool().live.find((c) => c.id === 'momentum');
    assert.equal(card.evolvesWeapon, 'horns');
    assert.equal(card.evolves, undefined, "the passive itself doesn't evolve");
});

test('catalysts: evolved numbers only apply with the catalyst', () => {
    const sim = quiet();
    const w = new Weapon(weaponDef('dead_cat_bounce'), sim.player);
    w.level = 5;
    const before = w.getCooldown(sim.player);
    sim.player.addPassive(PASSIVES.SLIPPAGE);
    assert.ok(w.isEvolved());
    assert.ok(Math.abs(w.getCooldown(sim.player) - before * 0.95) < 1e-9);
});

test('catalysts: a chest that brings a weapon to Lv 5 evolves it only with the catalyst', () => {
    for (const hasIt of [false, true]) {
        const sim = quiet();
        const horns = sim.player.weapons[0];
        horns.level = 4;
        if (hasIt)
            for (let k = 0; k < SIM.PASSIVE_MAX_STACK; k++)
                sim.player.addPassive(PASSIVES.MOMENTUM);
        sim.rng.next = () => 0.99; // one item, and the last in the pool
        sim._openChest({ x: 0, y: 0 });
        const ev = sim.drainEvents();
        const chest = ev.find((e) => e.t === 'chest');
        assert.equal(horns.level, 5);
        assert.equal(chest.items[0].evolves, hasIt);
        assert.equal(
            ev.some((e) => e.t === 'evolve' && e.id === 'horns'),
            hasIt
        );
    }
});

test('catalysts: the legacy rules (sim 21) still evolve at Lv 5 alone, with no catalyst hints', () => {
    const sim = quiet({ rules: LEGACY_SIM_VERSION });
    const horns = sim.player.weapons[0];
    horns.level = 4;
    const pool = sim._upgradePool().live;
    assert.equal(pool.find((c) => c.id === 'horns').evolves, true);
    assert.equal(pool.find((c) => c.id === 'momentum').catalystFor, undefined);
    const ev = dealAndPick(sim, [{ kind: 'weapon', id: 'horns', level: 5, evolves: true }]);
    assert.ok(horns.isEvolved());
    assert.ok(ev.some((e) => e.t === 'evolve' && e.id === 'horns'));
});

test('catalysts: the autopilot takes the card that evolves a waiting weapon', async () => {
    const { createBot } = await import('../src/sim/bot.js');
    const sim = quiet();
    sim.choices = [
        { kind: 'weapon', id: 'laser_eyes', level: 1, isNew: true },
        { kind: 'passive', id: 'momentum', level: 1, isNew: true, evolvesWeapon: 'horns' },
        { kind: 'passive', id: 'alpha', level: 1, isNew: true }
    ];
    assert.equal(createBot().pick(sim), 1);
});

test("catalysts: Double Bounce's extra cat is the new rules only; the legacy rules keep their count", () => {
    const cats = (opts, withCatalyst) => {
        const sim = quiet(opts);
        const w = new Weapon(weaponDef('dead_cat_bounce'), sim._owner());
        w.level = 5;
        if (withCatalyst) sim.player.addPassive(PASSIVES.SLIPPAGE);
        sim.enemies = [new Enemy(150, 0, enemyDef('bag_holder'), 1, 1, sim)];
        sim.spatial.rebuild(sim.enemies);
        sim.projectiles = [];
        w._projectile(sim.player, sim);
        return sim.projectiles.length;
    };
    const legacy = cats({ rules: LEGACY_SIM_VERSION }, false);
    assert.equal(legacy, 3, 'Lv 5: 1 + 2 cats, as in Build #26');
    assert.equal(cats({}, true), legacy + 1);
    assert.equal(cats({}, false), legacy, 'no catalyst, no evolution');
});

test('catalysts: with every passive slot full, the catalyst of a waiting weapon is still offered', () => {
    const sim = quiet();
    sim.player.weapons[0].level = 5; // horns, waiting on Momentum
    for (const id of ['alpha', 'dca', 'hedge', 'conviction', 'liquidity', 'compounding'])
        sim.player.addPassive(Object.values(PASSIVES).find((p) => p.id === id));
    assert.equal(sim.player.passiveOrder.length, SIM.MAX_PASSIVES);
    const pool = sim._upgradePool().live;
    const momentum = pool.find((c) => c.id === 'momentum');
    assert.equal(momentum?.evolvesWeapon, 'horns');
    assert.ok(!pool.some((c) => c.id === 'slippage'), 'other new passives still wait for a slot');
});

test('catalysts: a shared catalyst evolves every weapon waiting on it, one event each', () => {
    const sim = quiet({ character: 'miner' });
    const pick = sim.player.weapons[0];
    pick.level = 5;
    const breaker = new Weapon(weaponDef('circuit_breaker'), sim.player);
    breaker.level = 5;
    sim.player.weapons.push(breaker);
    const card = sim._upgradePool().live.find((c) => c.id === 'high_frequency');
    assert.equal(card.evolvesWeapon, 'pickaxe', 'the card names the first one');
    const ev = dealAndPick(sim, [card]);
    assert.deepEqual(
        ev.filter((e) => e.t === 'evolve').map((e) => e.id),
        ['pickaxe', 'circuit_breaker']
    );
});
