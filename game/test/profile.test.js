import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    ETERNAL_BEAR,
    LEVEL,
    MARKET,
    MARKET_BY_ID,
    PAY,
    applyRun,
    bearHp,
    buy,
    defaultProfile,
    equip,
    equippedItem,
    levelForXp,
    normalizeProfile,
    runPayout,
    skinSprite,
    xpToNext
} from '../src/profile.js';
import { SPRITES } from '../src/art/sprites.js';
import { ICONS } from '../src/art/sprites.js';
import { CHARACTER_IDS } from '../src/sim/content.js';
import { Simulation } from '../src/sim/sim.js';
import { createBot } from '../src/sim/bot.js';
import { DEFAULT_PREFS } from '../src/prefs.js';

const run = (o = {}) => ({
    timeMs: 0,
    kills: 0,
    bossKills: 0,
    bossDamage: 0,
    score: 0,
    won: false,
    character: 'bull',
    stage: 'chop',
    ...o
});

test('a run pays CLOUT for time, kills, bosses, a win and the bounty', () => {
    const p = runPayout(run({ timeMs: 492000, kills: 1500, bossKills: 2, won: true }), {
        bountyCleared: true
    });
    const by = Object.fromEntries(p.lines.map((l) => [l.id, l.v]));
    assert.equal(by.time, Math.floor(492 / PAY.perSeconds));
    assert.equal(by.kills, Math.floor(1500 / PAY.perKills));
    assert.equal(by.bosses, 2 * PAY.boss);
    assert.equal(by.win, PAY.win);
    assert.equal(by.bounty, PAY.bounty);
    assert.equal(p.total, by.time + by.kills + by.bosses + by.win + by.bounty);
    // a quick death still pays something for the time, and never a negative
    const short = runPayout(run({ timeMs: 12000, kills: 3 }));
    assert.deepEqual(
        short.lines.map((l) => l.id),
        ['time', 'kills']
    );
    assert.equal(short.total, 2);
});

test('the player level curve: 200 XP, then 100 more per level', () => {
    assert.equal(xpToNext(1), LEVEL.base);
    assert.equal(xpToNext(3), LEVEL.base + 2 * LEVEL.step);
    assert.deepEqual(levelForXp(0), { level: 1, into: 0, need: 200 });
    assert.deepEqual(levelForXp(199), { level: 1, into: 199, need: 200 });
    assert.deepEqual(levelForXp(200), { level: 2, into: 0, need: 300 });
    assert.deepEqual(levelForXp(550), { level: 3, into: 50, need: 400 });
});

test('applyRun banks the stats, keeps the bests and pays a level bonus', () => {
    let p = defaultProfile();
    const a = applyRun(p, run({ timeMs: 600000, kills: 2000, bossKills: 2, score: 90000 }));
    // 120 + 100 + 60 = 280 CLOUT: crosses level 2 (200 XP)
    assert.equal(a.payout.total, 280);
    assert.deepEqual(a.levelUps, [2]);
    assert.equal(a.levelReward, LEVEL.reward);
    assert.equal(a.profile.clout, 280 + LEVEL.reward);
    assert.equal(a.profile.xp, 280); // the bonus is CLOUT, not XP
    assert.equal(a.profile.level, 2);
    assert.equal(a.profile.runs, 1);
    assert.deepEqual(a.profile.best.character.bull, { score: 90000, timeMs: 600000 });
    assert.deepEqual(a.profile.best.stage.chop, { score: 90000, timeMs: 600000 });
    p = a.profile;
    // a worse run doesn't overwrite the best; a Pepe run gets its own
    const b = applyRun(p, run({ timeMs: 60000, score: 100, character: 'pepe' }));
    assert.deepEqual(b.profile.best.character.bull, { score: 90000, timeMs: 600000 });
    assert.deepEqual(b.profile.best.character.pepe, { score: 100, timeMs: 60000 });
    assert.equal(b.profile.runs, 2);
    assert.equal(b.profile.timeMs, 660000);
    // applyRun never mutates what it was given
    assert.equal(p.runs, 1);
});

test('the Eternal Bear: boss damage drains its bar across runs, then it falls, pays and comes back bigger', () => {
    let p = defaultProfile();
    const hp = bearHp(1);
    assert.equal(hp, ETERNAL_BEAR.baseHp);
    let r = applyRun(p, run({ bossDamage: hp - 1000 }));
    assert.equal(r.profile.bear.damage, hp - 1000);
    assert.equal(r.bear.felled, 0);
    p = r.profile;
    const before = p.clout;
    r = applyRun(p, run({ bossDamage: 5000 }));
    assert.equal(r.bear.felled, 1);
    assert.equal(r.bear.reward, ETERNAL_BEAR.reward);
    assert.equal(r.profile.bear.tier, 2);
    assert.equal(r.profile.bear.damage, 4000); // the overflow goes into the next bear
    assert.equal(r.bear.hp, bearHp(2));
    assert.equal(r.profile.clout, before + r.payout.total + r.levelReward + ETERNAL_BEAR.reward);
    // one huge run can fell two at once
    const big = applyRun(defaultProfile(), run({ bossDamage: bearHp(1) + bearHp(2) }));
    assert.equal(big.bear.felled, 2);
    assert.equal(big.profile.bear.tier, 3);
    assert.equal(big.bear.reward, 2 * ETERNAL_BEAR.reward + ETERNAL_BEAR.rewardStep);
});

test('the Market: buy needs the CLOUT, an item is bought once and goes on at once', () => {
    const p = defaultProfile();
    assert.equal(buy(p, 'bull_gold').error, 'short');
    p.clout = 1000;
    const r = buy(p, 'bull_gold');
    assert.ok(r.ok);
    assert.equal(r.profile.clout, 1000 - MARKET_BY_ID.bull_gold.price);
    assert.ok(r.profile.owned.includes('bull_gold'));
    assert.equal(r.profile.equipped['skin:bull'], 'bull_gold');
    assert.equal(skinSprite(r.profile, 'bull'), 'bull_gold');
    assert.equal(skinSprite(r.profile, 'pepe'), null);
    assert.equal(buy(r.profile, 'bull_gold').error, 'owned');
    assert.equal(buy(r.profile, 'nope').error, 'unknown');
    // back to the default, and on again
    const off = equip(r.profile, 'bull_default');
    assert.equal(skinSprite(off.profile, 'bull'), null);
    assert.equal(equip(off.profile, 'bull_gold').profile.equipped['skin:bull'], 'bull_gold');
    // can't equip what you don't own
    assert.equal(equip(off.profile, 'pepe_night').ok, false);
    assert.equal(equippedItem(off.profile, 'trail'), null);
});

test('an old, empty or hand-edited save becomes a valid profile', () => {
    assert.deepEqual(normalizeProfile(null), defaultProfile());
    assert.deepEqual(normalizeProfile('junk'), defaultProfile());
    const p = normalizeProfile({
        clout: -50,
        xp: 650,
        runs: 3.7,
        owned: ['bull_gold', 'free_money', 'trail_gold'],
        equipped: { 'skin:bull': 'bull_gold', trail: 'pepe_night', finale: 'finale_supernova' },
        best: { character: { bull: { score: 5, timeMs: 9 }, 'bad id!': { score: 1 } } },
        bear: { tier: 0, damage: 1e12 }
    });
    assert.equal(p.clout, 0);
    assert.equal(p.level, 3);
    assert.equal(p.runs, 3);
    assert.ok(p.owned.includes('bull_gold') && p.owned.includes('trail_gold'));
    assert.ok(!p.owned.includes('free_money'));
    assert.ok(p.owned.includes('bull_default') && p.owned.includes('finale_none'));
    assert.equal(p.equipped['skin:bull'], 'bull_gold');
    assert.equal(p.equipped.trail, 'trail_none'); // wrong slot
    assert.equal(p.equipped.finale, 'finale_none'); // not owned
    assert.deepEqual(Object.keys(p.best.character), ['bull']);
    assert.equal(p.bear.tier, 1);
    assert.ok(p.bear.damage < bearHp(1));
    // the prefs save carries the profile under one key, next to everything a player already had
    assert.ok('profile' in DEFAULT_PREFS);
    assert.ok('achievements' in DEFAULT_PREFS && 'name' in DEFAULT_PREFS);
});

test('every Market item has its art and a free default in every slot', () => {
    const slots = new Set(MARKET.map((i) => i.slot));
    for (const c of CHARACTER_IDS) assert.ok(slots.has(`skin:${c}`), `skins for ${c}`);
    for (const slot of slots)
        assert.ok(
            MARKET.some((i) => i.slot === slot && i.price === 0),
            `free ${slot}`
        );
    for (const i of MARKET) {
        if (i.sprite) {
            const def = SPRITES[i.sprite];
            assert.ok(def, i.sprite);
            assert.equal(def.frames.length, 4, `${i.sprite} animates`);
        } else assert.ok(ICONS[i.icon], `icon ${i.icon}`);
        assert.ok(i.price === 0 || i.price >= 400, `${i.id} costs a few runs`);
        assert.ok(!/coin|token/i.test(`${i.name} ${i.text}`), `${i.id} never says coin or token`);
    }
    // a skin is the same size as its character, so hitboxes, shadows and the select card don't move
    assert.equal(SPRITES.bull_gold.w, SPRITES.bull.w);
    assert.equal(SPRITES.pepe_frost.h, SPRITES.pepe.h);
});

test('bossDamage counts the damage bosses took and leaves the simulation alone', () => {
    const play = () => {
        const sim = new Simulation({ seed: 1 });
        const bot = createBot();
        let dmg = 0;
        while (!sim.over && sim.tick < 60 * 60 * 12) {
            if (sim.choices) {
                sim.choose(bot.pick(sim));
                continue;
            }
            const before = sim.enemies.filter((e) => e.boss).map((e) => [e, e.hp]);
            sim.step(bot.move(sim));
            for (const [e, hp] of before) dmg += hp - Math.max(0, e.hp);
        }
        return { sim, dmg };
    };
    const { sim, dmg } = play();
    assert.ok(sim.stats.bossKills >= 1, 'seed 1 kills a boss');
    assert.ok(sim.summary().bossDamage > 0);
    // at least what the bosses' HP bars lost (a killing blow's overkill counts too), never more than all damage
    assert.ok(sim.stats.bossDamage >= dmg - 1, `${sim.stats.bossDamage} vs ${dmg}`);
    assert.ok(sim.stats.bossDamage <= sim.stats.damageDealt);
    assert.equal(play().sim.stateHash(), sim.stateHash());
});
