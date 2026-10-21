// Run reports (report.js): the game-over damage report and the pause screen's build sheet. Both read the sim,
// never write it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { OTHER_SOURCES, buildSheet, createDamageReport } from '../src/report.js';
import { Simulation } from '../src/sim/sim.js';
import { Enemy } from '../src/sim/entities.js';
import { Weapon } from '../src/sim/weapons.js';
import { createBot } from '../src/sim/bot.js';
import { PASSIVES, SIM, WEAPONS, enemyDef } from '../src/sim/content.js';
import { ICONS, SPRITES } from '../src/art/sprites.js';

/** A stand-in for the sim: the fields the damage report reads. */
function fake(weapons = []) {
    return {
        time: 0,
        stats: { damageDealt: 0 },
        player: {
            weapons: weapons.map(([id, level]) => {
                const def = Object.values(WEAPONS).find((d) => d.id === id);
                return { id, level, def };
            }),
            evolvedPassive: () => null
        }
    };
}
const dmg = (src, v) => ({ t: 'dmg', src, v, crit: false });

/** Advance the fake: `events` happened at `time`, and the sim's damage counter moved by `dealt`. */
function tick(report, sim, time, events, dealt) {
    sim.time = time;
    sim.stats.damageDealt += dealt;
    report.observe(sim, events);
}

test('damage report: sums each source, biggest first, with shares and DPS over the time held', () => {
    const sim = fake([['horns', 2]]);
    const r = createDamageReport();
    r.observe(sim); // the run starts: horns held from 0
    tick(r, sim, 1, [dmg('horns', 30), dmg('horns', 20)], 50);
    sim.player.weapons.push({ id: 'laser_eyes', level: 1, def: WEAPONS.LASER_EYES });
    tick(r, sim, 10, [], 0); // picked up at 0:10
    tick(r, sim, 30, [dmg('laser_eyes', 100), dmg('horns', 50)], 150);
    const { total, rows, more } = r.rows(sim);
    assert.equal(total, 200);
    assert.equal(more, 0);
    assert.deepEqual(
        rows.map((x) => [x.id, x.name, x.damage, x.level]),
        [
            ['horns', 'Horns', 100, 2],
            ['laser_eyes', 'Laser Eyes', 100, 1]
        ],
        'a tie goes by id, so the order is stable'
    );
    assert.equal(rows[0].share, 0.5);
    assert.equal(rows[0].dps, 100 / 30, 'Horns: 100 over the whole 30 s');
    assert.equal(rows[1].dps, 100 / 20, 'Laser Eyes: 100 over the 20 s it was held');
    assert.equal(rows[1].icon, 'laser_eyes');
    tick(r, sim, 31, [dmg('laser_eyes', 1)], 1);
    assert.equal(r.rows(sim).rows[0].id, 'laser_eyes', 'biggest first');
});

test('damage report: hits the sim deals without an event go to Hopium, or to the God Candle that wiped', () => {
    const sim = fake([
        ['horns', 1],
        ['hopium', 3]
    ]);
    const r = createDamageReport();
    r.observe(sim);
    tick(r, sim, 1, [dmg('horns', 10)], 10 + 7); // 7 from Hopium's cloud: quiet
    tick(r, sim, 2, [{ t: 'godCandle', wiped: 4 }], 400); // the wipe is quiet too
    tick(r, sim, 3, [dmg('god_candle', 60)], 60); // its boss hit is loud
    const by = Object.fromEntries(r.rows(sim).rows.map((x) => [x.id, x]));
    assert.equal(by.hopium.damage, 7);
    assert.equal(by.god_candle.damage, 460);
    assert.equal(by.god_candle.name, 'God Candle');
    assert.equal(by.god_candle.tag, 'CRATE');
    assert.equal(by.god_candle.dps, null, 'a crate is a burst: no DPS');
    assert.equal(by.horns.damage, 10);

    // No cloud and no candle: quiet damage has no source to go to, so nothing is made up.
    const bare = fake([['horns', 1]]);
    const r2 = createDamageReport();
    r2.observe(bare);
    tick(r2, bare, 1, [dmg('horns', 5)], 9);
    assert.equal(r2.rows(bare).total, 5);
});

test('damage report: evolved names, the Liquidation Risk chain, unknown sources, and the top 6', () => {
    const sim = fake([
        ['horns', 5],
        ['green_candle', 5],
        ['airdrop', 1],
        ['limit_order', 1],
        ['buyback', 1],
        ['tongue', 1]
    ]);
    const r = createDamageReport();
    r.observe(sim);
    tick(
        r,
        sim,
        5,
        [
            dmg('horns', 900),
            dmg('green_candle', 800),
            dmg('liquidation', 700),
            dmg('moon_rocket', 600),
            dmg('airdrop', 500),
            dmg('limit_order', 400),
            dmg('buyback', 300),
            dmg('mystery_beam', 200)
        ],
        4400
    );
    const all = r.rows(sim, { max: 10 }).rows;
    const by = Object.fromEntries(all.map((x) => [x.id, x]));
    assert.equal(by.horns.name, 'Stampede');
    assert.equal(by.horns.evolved, true);
    assert.equal(by.green_candle.name, 'God Candle', 'the evolved weapon, not the crate');
    assert.equal(by.green_candle.tag, null);
    assert.equal(by.liquidation.name, 'Liquidation Risk');
    assert.equal(by.liquidation.tag, 'CHAIN');
    assert.equal(by.liquidation.icon, 'leverage');
    assert.equal(by.moon_rocket.dps, null);
    assert.equal(by.mystery_beam.name, 'Mystery Beam');
    const top = r.rows(sim);
    assert.equal(top.rows.length, 6);
    assert.equal(top.more, 2);
    assert.deepEqual(
        top.rows.map((x) => x.id),
        ['horns', 'green_candle', 'liquidation', 'moon_rocket', 'airdrop', 'limit_order']
    );
    for (const s of Object.values(OTHER_SOURCES))
        assert.ok(s.icon in ICONS || s.icon in SPRITES, `${s.name}: icon "${s.icon}" exists`);
});

test("damage report: Hopium's quiet cloud is counted on a real sim", () => {
    const sim = new Simulation({ seed: 11 });
    const hopium = new Weapon(WEAPONS.HOPIUM);
    sim.player.weapons = [hopium];
    const def = enemyDef('bag_holder');
    sim.enemies = [
        [40, 0],
        [-40, 10]
    ].map(([x, y]) => new Enemy(sim.player.x + x, sim.player.y + y, def, 1, 1, sim));
    const r = createDamageReport();
    r.observe(sim);
    for (let i = 0; i < 120 && !sim.over; i++) {
        sim.step(0);
        r.observe(sim, sim.drainEvents());
    }
    const { total, rows } = r.rows(sim);
    assert.ok(sim.stats.damageDealt > 0, 'the cloud hit something');
    assert.equal(rows[0].id, 'hopium');
    assert.ok(
        Math.abs(total - sim.stats.damageDealt) < 1e-6,
        `${total} vs ${sim.stats.damageDealt}`
    );
});

test('reports: reading a real run every tick never changes it, and every point of damage is accounted for', () => {
    const play = (watch) => {
        const sim = new Simulation({ seed: 777, stage: 'chop' });
        const bot = createBot({ style: 'survive', phase: 3 });
        const r = watch ? createDamageReport() : null;
        r?.observe(sim);
        while (!sim.over && sim.time < 120) {
            while (sim.choices) {
                sim.choose(bot.pick(sim));
                r?.observe(sim, sim.drainEvents());
            }
            sim.step(bot.move(sim));
            const events = sim.drainEvents();
            if (r) {
                r.observe(sim, events);
                buildSheet(sim); // the pause screen reads the same getters
            }
        }
        return { hash: sim.stateHash(), sim, r };
    };
    const off = play(false);
    const on = play(true);
    assert.equal(on.hash, off.hash, 'watching never changes the run');
    const { total, rows } = on.r.rows(on.sim, { max: 99 });
    assert.ok(rows.length >= 2, rows.map((x) => x.id).join(','));
    assert.ok(
        Math.abs(total - on.sim.stats.damageDealt) < 1e-6 * on.sim.stats.damageDealt,
        `${total} vs ${on.sim.stats.damageDealt}`
    );
    const shares = rows.reduce((a, x) => a + x.share, 0);
    assert.ok(Math.abs(shares - 1) < 1e-9);
    for (const x of rows) assert.ok(x.dps === null || x.dps > 0, x.id);
});

const stat = (sheet, id) => sheet.stats.find((s) => s.id === id);

test('build sheet: a fresh bull, every stat at its base', () => {
    const sheet = buildSheet(new Simulation({ seed: 1 }));
    assert.deepEqual(sheet.weapons, [
        {
            id: 'horns',
            name: 'Horns',
            base: 'Horns',
            icon: 'horns',
            level: 1,
            max: SIM.WEAPON_MAX_LEVEL,
            evolved: false
        }
    ]);
    assert.deepEqual(sheet.passives, []);
    assert.deepEqual(sheet.slots, { weapons: SIM.MAX_WEAPONS, passives: SIM.MAX_PASSIVES });
    assert.deepEqual(
        sheet.stats.map((s) => [s.label, s.value, s.tone]),
        [
            ['MAX HP', '100', ''],
            ['DAMAGE', '0%', 'flat'],
            ['COOLDOWN', '0%', 'flat'],
            ['AREA', '0%', 'flat'],
            ['SPEED', '0%', 'flat'],
            ['MAGNET', '0%', 'flat'],
            ['CRIT', '0%', 'flat'],
            ['XP GAIN', '0%', 'flat']
        ]
    );
});

test('build sheet: passives, evolutions and the real multipliers', () => {
    const sim = new Simulation({ seed: 1 });
    const p = sim.player;
    p.weapons[0].level = 5;
    const add = (def, n) => {
        for (let i = 0; i < n; i++) p.addPassive(def);
    };
    add(PASSIVES.THICK_SKIN, 2);
    add(PASSIVES.LEVERAGE, 5);
    add(PASSIVES.DCA, 1);
    add(PASSIVES.HIGH_FREQUENCY, 2);
    add(PASSIVES.COLD_WALLET, 1);
    add(PASSIVES.HEDGE, 1);
    const sheet = buildSheet(sim);
    // Lv 5 without its catalyst (Momentum) is still the Horns (SIM_VERSION 25)
    assert.equal(sheet.weapons[0].name, 'Horns');
    assert.equal(sheet.weapons[0].evolved, false);
    const s2 = new Simulation({ seed: 1 });
    s2.player.weapons[0].level = 5;
    s2.player.addPassive(PASSIVES.MOMENTUM);
    const evolved = buildSheet(s2).weapons[0];
    assert.equal(evolved.name, 'Stampede');
    assert.equal(evolved.base, 'Horns');
    assert.equal(evolved.evolved, true);
    assert.deepEqual(
        sheet.passives.map((x) => [x.id, x.name, x.count, x.evolved]),
        [
            ['thick_skin', 'Thick Skin', 2, false],
            ['leverage', 'Liquidation Risk', 5, true],
            ['dca', 'DCA', 1, false],
            ['high_frequency', 'High Frequency', 2, false],
            ['cold_wallet', 'Cold Wallet', 1, false],
            ['hedge', 'Hedge', 1, false]
        ]
    );
    assert.equal(stat(sheet, 'hp').value, '144');
    assert.equal(stat(sheet, 'hp').tone, 'up');
    assert.equal(stat(sheet, 'damage').value, '+205%', '1.25^5');
    assert.equal(stat(sheet, 'cooldown').value, '-15%', '0.92^2');
    assert.equal(stat(sheet, 'cooldown').tone, 'up', 'a shorter cooldown is better');
    assert.equal(stat(sheet, 'crit').value, '10%', "Liquidation Risk's crit");
    assert.equal(stat(sheet, 'armor').value, '-1/HIT');
    assert.equal(stat(sheet, 'regen').value, '0.5/S');
    assert.equal(stat(sheet, 'taken').value, '+84%', '(1 - 8%) x 2');
    assert.equal(stat(sheet, 'taken').tone, 'down');
    assert.equal(stat(sheet, 'dodge'), undefined, 'no Slippage, no dodge row');

    // A crate's Money Printer is not part of the build.
    p.printerTimer = 5;
    p.printerMult = 0.5;
    assert.equal(stat(buildSheet(sim), 'cooldown').value, '-15%');
});

test("build sheet: the character, the map and the Daily's twist are in the numbers", () => {
    const pepe = buildSheet(new Simulation({ seed: 1, character: 'pepe', stage: 'chop' }));
    assert.equal(stat(pepe, 'hp').value, '90');
    assert.equal(stat(pepe, 'speed').value, '+10%');
    assert.equal(pepe.weapons[0].id, 'tongue');
    const winter = buildSheet(new Simulation({ seed: 1, stage: 'winter' }));
    assert.equal(stat(winter, 'speed').value, '-10%');
    assert.equal(stat(winter, 'speed').tone, 'down');
    const lev = buildSheet(new Simulation({ seed: 1, twist: 'leverage_day' }));
    assert.equal(stat(lev, 'damage').value, '+50%');
    const bull = buildSheet(new Simulation({ seed: 1, twist: 'bull_run' }));
    assert.equal(stat(bull, 'speed').value, '+25%');
});
