// Badges (Build #19): themed goals that unlock mid-run, read from the sim's state and events, never written back.

import test from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENTS, badgeSection, createTracker } from '../src/achievements.js';
import { ICONS, SPRITES } from '../src/art/sprites.js';
import { Simulation } from '../src/sim/sim.js';
import { createBot } from '../src/sim/bot.js';
import { SIM } from '../src/sim/content.js';

/** A stand-in for the sim: just the fields badges read. */
function fake(over = {}) {
    return {
        time: 0,
        stageId: 'chop',
        won: false,
        ...over,
        stats: {
            kills: 0,
            damageTaken: 0,
            dipHealed: 0,
            shieldsBroken: 0,
            scamsBusted: 0,
            liquidations: 0,
            ...over.stats
        },
        player: { hp: 100, maxHp: 100, dead: false, weapons: [], passiveOrder: [], ...over.player }
    };
}
const ids = (list) => list.map((a) => a.id);

test('badges: unique ids, words, and art that exists', () => {
    assert.ok(ACHIEVEMENTS.length >= 12);
    assert.equal(new Set(ids(ACHIEVEMENTS)).size, ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) {
        assert.ok(a.name && a.text, a.id);
        assert.ok(a.art in ICONS || a.art in SPRITES, `${a.id}: art "${a.art}" exists`);
        assert.equal(typeof a.check, 'function');
    }
});

test('badges: nothing unlocks on a fresh run', () => {
    assert.deepEqual(createTracker().observe(fake()), []);
});

test('badges: each one unlocks on its own condition, and not just short of it', () => {
    const cases = [
        ['opening_bell', { time: 180 }, { time: 179.9 }],
        ['opening_bell', { time: 180 }, { time: 180, stats: { damageTaken: 5 } }],
        ['hundred_bagger', { stats: { kills: 100 } }, { stats: { kills: 99 } }],
        ['thousand_bagger', { stats: { kills: 1000 } }, { stats: { kills: 999 } }],
        ['bought_the_dip', { stats: { dipHealed: 40 } }, { stats: { dipHealed: 39 } }],
        ['bear_repellent', { stats: { shieldsBroken: 10 } }, { stats: { shieldsBroken: 9 } }],
        ['bag_recovered', { stats: { scamsBusted: 1 } }, {}],
        ['liquidator', { stats: { liquidations: 100 } }, { stats: { liquidations: 99 } }],
        [
            'full_port',
            {
                player: {
                    weapons: Array(SIM.MAX_WEAPONS).fill({}),
                    passiveOrder: Array(SIM.MAX_PASSIVES).fill('x')
                }
            },
            {
                player: {
                    weapons: Array(SIM.MAX_WEAPONS).fill({}),
                    passiveOrder: Array(SIM.MAX_PASSIVES - 1).fill('x')
                }
            }
        ],
        ['diamond_hands', { time: 600 }, { time: 599 }],
        ['survived_winter', { time: 600, stageId: 'winter' }, { time: 600, stageId: 'chop' }],
        ['bear_market_over', { won: true }, {}]
    ];
    for (const [id, yes, no] of cases) {
        // `opening_bell` and the time badges overlap: only ask whether *this* badge fired
        assert.ok(ids(createTracker().observe(fake(yes))).includes(id), `${id} unlocks`);
        assert.ok(!ids(createTracker().observe(fake(no))).includes(id), `${id} not yet`);
    }
});

test('badges: evolutions and the Rug Lord come from the events', () => {
    const t = createTracker();
    assert.deepEqual(ids(t.observe(fake(), [{ t: 'evolve', id: 'horns' }])), ['up_only']);
    assert.deepEqual(ids(t.observe(fake(), [{ t: 'bossDown', id: 'capitulation' }])), []);
    assert.deepEqual(ids(t.observe(fake(), [{ t: 'bossDown', id: 'rug_lord' }])), [
        'rugged_the_rugger'
    ]);
});

test('badges: -50% Day needs 2 minutes on your feet after dropping below half HP', () => {
    const t = createTracker();
    t.observe(fake({ time: 30, player: { hp: 60 } }));
    assert.equal(t.run.halfAt, null, 'above half: no clock');
    t.observe(fake({ time: 40, player: { hp: 49 } }));
    assert.equal(t.run.halfAt, 40);
    // healing back up doesn't reset it, and a second dip doesn't restart it
    t.observe(fake({ time: 100, player: { hp: 100 } }));
    t.observe(fake({ time: 120, player: { hp: 10 } }));
    assert.equal(t.run.halfAt, 40);
    assert.ok(!ids(t.observe(fake({ time: 159.9, player: { hp: 80 } }))).includes('minus_50'));
    assert.ok(ids(t.observe(fake({ time: 160, player: { hp: 80 } }))).includes('minus_50'));
    // dead at the 2-minute mark: no badge
    const d = createTracker();
    d.observe(fake({ time: 10, player: { hp: 20 } }));
    assert.ok(
        !ids(d.observe(fake({ time: 130, player: { hp: 0, dead: true } }))).includes('minus_50')
    );
});

test('badges: one fires once per run, and never again once the device has it', () => {
    const t = createTracker();
    assert.deepEqual(ids(t.observe(fake({ stats: { kills: 100 } }))), ['hundred_bagger']);
    assert.deepEqual(ids(t.observe(fake({ stats: { kills: 150 } }))), []);
    const saved = createTracker({ hundred_bagger: '2026-10-11' });
    assert.deepEqual(ids(saved.observe(fake({ stats: { kills: 100 } }))), []);
    assert.deepEqual(
        ids(createTracker(['hundred_bagger']).observe(fake({ stats: { kills: 100 } }))),
        []
    );
});

test('badges: a real autopilot run unlocks the early ones and plays bit for bit the same', () => {
    const play = (watch) => {
        const sim = new Simulation({ seed: 4242, stage: 'chop' });
        const bot = createBot({ style: 'survive', phase: 7 });
        const t = watch ? createTracker() : null;
        const got = [];
        while (!sim.over && sim.time < 150) {
            while (sim.choices) {
                sim.choose(bot.pick(sim));
                if (t) got.push(...t.observe(sim, sim.drainEvents()));
            }
            sim.step(bot.move(sim));
            const events = sim.drainEvents();
            if (t) got.push(...t.observe(sim, events));
        }
        return { hash: sim.stateHash(), got: ids(got), kills: sim.stats.kills };
    };
    const off = play(false);
    const on = play(true);
    assert.equal(on.hash, off.hash, 'watching never changes the run');
    assert.ok(on.kills >= 100, `the bot rekt ${on.kills} bears`);
    assert.ok(on.got.includes('hundred_bagger'), on.got.join(','));
    assert.equal(new Set(on.got).size, on.got.length, 'no repeats');
});

test('badges: the guide tab lists every badge, locked or with its date', () => {
    const s = badgeSection({ diamond_hands: '2026-10-11' });
    assert.equal(s.id, 'badges');
    assert.deepEqual(ids(s.entries), ids(ACHIEVEMENTS));
    assert.match(s.intro, new RegExp(`^1 of ${ACHIEVEMENTS.length} unlocked`));
    const dh = s.entries.find((e) => e.id === 'diamond_hands');
    assert.equal(dh.locked, false);
    assert.deepEqual(dh.tags, ['Unlocked 2026-10-11']);
    const locked = s.entries.find((e) => e.id === 'liquidator');
    assert.equal(locked.locked, true);
    assert.deepEqual(locked.tags, ['Locked']);
    assert.match(badgeSection().intro, /^0 of/);
});
