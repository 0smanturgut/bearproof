// The Field Guide (Build #10): every weapon, passive, bear and boss on its page, drawn with art that exists, with
// the same numbers the simulation uses.

import test from 'node:test';
import assert from 'node:assert/strict';
import { bossArrival, clock, firstSeen, guideSections } from '../src/guide.js';
import { ICONS, SPRITES } from '../src/art/sprites.js';
import { BOSSES, ENEMIES, PASSIVES, SIM, WAVES, WEAPONS } from '../src/sim/content.js';

const sections = guideSections();
const tab = (id) => sections.find((s) => s.id === id);
const entry = (tabId, id) => tab(tabId).entries.find((e) => e.id === id);

test('guide: four tabs, and every content entry appears exactly once in its tab', () => {
    assert.deepEqual(
        sections.map((s) => s.id),
        ['weapons', 'passives', 'bears', 'bosses']
    );
    const want = {
        weapons: Object.values(WEAPONS),
        passives: Object.values(PASSIVES),
        bears: Object.values(ENEMIES),
        bosses: Object.values(BOSSES)
    };
    for (const [id, defs] of Object.entries(want)) {
        const ids = tab(id).entries.map((e) => e.id);
        assert.deepEqual(
            ids,
            defs.map((d) => d.id),
            id
        );
        assert.equal(new Set(ids).size, ids.length, `${id}: no duplicates`);
    }
});

test('guide: every entry has a name, words, numbers and art that exists', () => {
    for (const s of sections) {
        assert.ok(s.intro, `${s.id} intro`);
        for (const e of s.entries) {
            assert.ok(e.name && e.text && e.stats, `${s.id}/${e.id} has text`);
            assert.ok(e.art in ICONS || e.art in SPRITES, `${s.id}/${e.id}: art "${e.art}" exists`);
        }
    }
});

test('guide: weapons show their evolution, their numbers, and who owns them', () => {
    for (const w of Object.values(WEAPONS)) {
        const e = entry('weapons', w.id);
        if (w.evolveName) {
            assert.ok(e.evolves);
            assert.ok(e.extra.includes(w.evolveName), `${w.id} names ${w.evolveName}`);
            assert.ok(e.extra.startsWith(`Lv ${SIM.WEAPON_MAX_LEVEL} →`), e.extra);
        } else {
            assert.ok(!e.evolves);
            assert.match(e.extra, /No evolution/);
        }
        assert.ok(e.stats.startsWith(`${w.baseDamage} dmg · every ${w.baseCooldown} s`), e.stats);
    }
    assert.equal(entry('weapons', 'horns').extra, 'Lv 5 → Stampede: A full-circle sweep.');
    assert.deepEqual(entry('weapons', 'tongue').tags, ['Pepe only', "Pepe's starter"]);
    assert.deepEqual(entry('weapons', 'horns').tags, ["Bull's starter"]);
    assert.deepEqual(entry('weapons', 'laser_eyes').tags, []);
});

test('guide: bears say when they show up, where they come from, and what to do', () => {
    assert.equal(firstSeen('rug_puller'), 'From 1:30 (Rug Season)');
    assert.equal(firstSeen('red_candle'), 'From 0:00 (Opening Bell)');
    assert.equal(firstSeen('downline'), null);
    for (const e of Object.values(ENEMIES)) {
        const w = WAVES.find((x) => x.pool.includes(e.id));
        const g = entry('bears', e.id);
        assert.ok(g.text, `${e.id} has a description`);
        assert.ok(g.extra?.startsWith('Tip: '), `${e.id} has a tip`);
        assert.ok(g.stats.includes(`hits ${e.damage}`), g.stats);
        if (w) assert.ok(g.tags[0].startsWith(`From ${clock(w.from)}`), `${e.id}: ${g.tags[0]}`);
    }
    assert.deepEqual(entry('bears', 'rug_puller').tags, [
        'From 1:30 (Rug Season) · called in by Rug Lord'
    ]);
    assert.deepEqual(entry('bears', 'downline').tags, ['Splits out of Ponzi']);
    // the numbers in the words match the data
    const rp = ENEMIES.RUG_PULLER;
    assert.ok(entry('bears', 'rug_puller').text.includes(`${rp.dashInterval} s`));
    assert.ok(entry('bears', 'grizzly').text.includes(String(ENEMIES.GRIZZLY.shieldHp)));
    assert.ok(entry('bears', 'doomposter').text.includes(`${ENEMIES.DOOMPOSTER.windup} s`));
    assert.ok(entry('bears', 'margin_call').text.includes(`${ENEMIES.MARGIN_CALL.fuseTime} s`));
    assert.ok(entry('bears', 'sybil').text.includes(`${ENEMIES.SYBIL.cloneCooldown} s`));
});

test('guide: bosses show when they arrive on each Daily stage and what they pay', () => {
    assert.equal(bossArrival('rug_lord'), '5:00 (4:00 in Bear Trap)');
    assert.equal(bossArrival('capitulation'), '7:30 (7:00 in Bear Trap)');
    assert.equal(bossArrival('liquidation'), '10:00, not in Crypto Winter');
    assert.equal(bossArrival('long_winter'), '10:00, Crypto Winter only');
    assert.equal(bossArrival('bear_market'), '12:00');
    const rl = entry('bosses', 'rug_lord');
    assert.deepEqual(rl.tags, ['Arrives 5:00 (4:00 in Bear Trap)']);
    assert.ok(rl.stats.endsWith('jackpot 7,500'), rl.stats);
    for (const b of Object.values(BOSSES)) assert.ok(entry('bosses', b.id).text, b.id);
    assert.match(tab('bosses').intro, /The Bear Market/);
});
