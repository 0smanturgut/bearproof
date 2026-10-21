// The Collection (Build #30): what a player has met is saved in the profile, and the guide locks the rest.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
    COLLECTION,
    COLLECTION_KINDS,
    collectionTotals,
    createCollector,
    defaultSeen,
    mergeSeen,
    normalizeSeen
} from '../src/collection.js';
import { guideSections } from '../src/guide.js';
import { defaultProfile, normalizeProfile, applyRun } from '../src/profile.js';
import { Simulation } from '../src/sim/sim.js';
import { Enemy } from '../src/sim/entities.js';
import { BOSSES, PASSIVES, WEAPONS, enemyDef } from '../src/sim/content.js';
import { ICONS } from '../src/art/sprites.js';

test('collection: every weapon, passive, bear and boss, and every evolution', () => {
    assert.deepEqual(COLLECTION_KINDS, ['weapons', 'evolutions', 'passives', 'bears', 'bosses']);
    assert.equal(COLLECTION.weapons.length, Object.values(WEAPONS).length);
    assert.ok(
        COLLECTION.evolutions.includes('horns') && COLLECTION.evolutions.includes('leverage')
    );
    assert.equal(COLLECTION.bosses.length, Object.values(BOSSES).length);
    // every weapon evolution has its own icon
    for (const w of Object.values(WEAPONS)) assert.ok(ICONS[`evo_${w.id}`], `evo_${w.id} icon`);
});

test('collection: a saved record is cleaned up, deduped and kept in content order', () => {
    assert.deepEqual(normalizeSeen(null), defaultSeen());
    assert.deepEqual(normalizeSeen('junk'), defaultSeen());
    const s = normalizeSeen({
        weapons: ['laser_eyes', 'horns', 'horns', 'nope', 7],
        bears: 'red_candle',
        bosses: ['rug_lord']
    });
    assert.deepEqual(s.weapons, ['horns', 'laser_eyes']);
    assert.deepEqual(s.bears, []);
    assert.deepEqual(s.bosses, ['rug_lord']);
    assert.deepEqual(mergeSeen({ weapons: ['horns'] }, { weapons: ['hopium'] }).weapons, [
        'horns',
        'hopium'
    ]);
    const t = collectionTotals(s);
    assert.equal(t.found, 3);
    assert.equal(t.kinds.weapons.total, COLLECTION.weapons.length);
});

test('collection: the collector picks up weapons, passives, evolutions, bears and bosses once', () => {
    const sim = new Simulation({ seed: 7, stage: 'chop' });
    sim._spawn = () => {};
    const c = createCollector({ bears: ['red_candle'] });
    sim.enemies = [
        new Enemy(300, 0, enemyDef('red_candle'), 1, 1, sim),
        new Enemy(-300, 0, enemyDef('grizzly'), 1, 1, sim),
        new Enemy(0, 300, BOSSES.RUG_LORD, 1, 1, sim)
    ];
    let fresh = c.observe(sim);
    assert.deepEqual(fresh, [
        { kind: 'weapons', id: 'horns' },
        { kind: 'bears', id: 'grizzly' },
        { kind: 'bosses', id: 'rug_lord' }
    ]);
    assert.deepEqual(c.observe(sim), [], 'nothing twice');
    // Lv 5 alone isn't an evolution; with Momentum it is
    sim.player.weapons[0].level = 5;
    assert.deepEqual(c.observe(sim), []);
    sim.player.addPassive(PASSIVES.MOMENTUM);
    fresh = c.observe(sim);
    assert.deepEqual(fresh, [
        { kind: 'evolutions', id: 'horns' },
        { kind: 'passives', id: 'momentum' }
    ]);
    assert.deepEqual(c.seen().bears, ['red_candle', 'grizzly']);
});

test('collection: the profile keeps it, an old save starts empty, and a run never drops it', () => {
    assert.deepEqual(defaultProfile().seen, defaultSeen());
    const old = { clout: 50, owned: [], missions: {} }; // a Build #29 save
    const p = normalizeProfile(old);
    assert.deepEqual(p.seen, defaultSeen());
    assert.equal(p.clout, 50);
    p.seen.weapons = ['horns'];
    const after = applyRun(p, {
        timeMs: 60000,
        kills: 10,
        bossKills: 0,
        bossDamage: 0,
        won: false,
        score: 100,
        character: 'bull',
        stage: 'chop'
    }).profile;
    assert.deepEqual(after.seen.weapons, ['horns']);
});

test('collection: the guide locks what was not met, keeps hints and recipes, and counts', () => {
    const seen = { weapons: ['horns'], evolutions: [], bears: ['red_candle'] };
    const sections = guideSections(seen);
    const tab = (id) => sections.find((s) => s.id === id);
    assert.equal(tab('weapons').count, `1/${COLLECTION.weapons.length}`);
    assert.match(tab('weapons').intro, /^Found 1 of /);
    const horns = tab('weapons').entries.find((e) => e.id === 'horns');
    assert.equal(horns.name, 'Horns');
    assert.ok(!horns.locked);
    const laser = tab('weapons').entries.find((e) => e.id === 'laser_eyes');
    assert.equal(laser.name, '???');
    assert.ok(laser.locked && laser.silhouette);
    const stampede = tab('evolutions').entries.find((e) => e.id === 'horns');
    assert.equal(stampede.name, '???');
    assert.equal(stampede.stats, 'Recipe: Horns Lv 5 + Momentum', 'the recipe stays readable');
    // the plain guide (no record) is all open
    assert.ok(guideSections().every((s) => s.entries.every((e) => !e.silhouette)));
    // the loot tab isn't collected
    assert.equal(tab('loot').count, undefined);
});
