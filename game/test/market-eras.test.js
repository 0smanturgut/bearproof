// Market Eras (Build #27): the fourth map. Four eras, each with its own bears and boss; an era turns when its boss
// dies (or at its `until`), and the turn delists the bears on the field. The Flash Loan blinks onto a marked spot.

import test from 'node:test';
import assert from 'node:assert/strict';
import { LEGACY_SIM_VERSION, Simulation } from '../src/sim/sim.js';
import { Enemy } from '../src/sim/entities.js';
import { RunRecorder, replay } from '../src/sim/runlog.js';
import { createBot } from '../src/sim/bot.js';
import {
    BOSSES,
    LEGACY_STAGE_ROTATION,
    SIM,
    STAGES,
    STAGE_ROTATION,
    bossesFor,
    dailyTwistForSeed,
    enemyDef,
    stageForSeed,
    wavesFor
} from '../src/sim/content.js';

const ERAS = STAGES.ERAS.eras;

/** A Market Eras sim with nothing spawning and no weapons, so the test decides what happens. */
function quiet(seed = 5) {
    const sim = new Simulation({ seed, stage: 'eras' });
    sim._spawn = () => {};
    sim._exitScam = () => {};
    sim._dropCrate = () => {};
    sim._whaleTick = () => {};
    sim.player.weapons.length = 0;
    sim.player.invincibleTimer = 1e9;
    return sim;
}

const bossDef = (slot) => bossesFor('eras').find((b) => b.slot === slot);
const events = (sim, t) => sim.drainEvents().filter((e) => e.t === t);

test('market eras: second in the rotation, four eras in order, and the legacy rules keep three maps', () => {
    assert.deepEqual(STAGE_ROTATION, ['chop', 'eras', 'winter', 'bear_trap', 'pool']);
    assert.deepEqual(LEGACY_STAGE_ROTATION, ['chop', 'bear_trap', 'winter']);
    assert.deepEqual(
        ERAS.map((e) => e.id),
        ['genesis', 'defi', 'altseason', 'bear']
    );
    for (let i = 1; i < ERAS.length; i++) assert.ok(ERAS[i].until > ERAS[i - 1].until);
    // seeds land on all four maps; under the legacy rules the same seeds keep the three-map rotation
    const seen = new Set();
    for (let seed = 0; seed < 8; seed++) {
        seen.add(stageForSeed(seed));
        assert.equal(stageForSeed(seed, true), LEGACY_STAGE_ROTATION[seed % 3]);
        assert.equal(
            new Simulation({ seed, rules: LEGACY_SIM_VERSION }).stageId,
            stageForSeed(seed, true)
        );
        assert.equal(new Simulation({ seed }).stageId, stageForSeed(seed));
        assert.equal(dailyTwistForSeed(seed * 977, true), dailyTwistForSeed(seed * 977, true));
    }
    assert.deepEqual([...seen].sort(), ['bear_trap', 'chop', 'eras', 'pool', 'winter']);
    assert.equal(stageForSeed(1), 'eras');
});

test('market eras: its three bosses take the first three slots, here and nowhere else', () => {
    const plan = bossesFor('eras');
    assert.deepEqual(
        plan.map((b) => [b.slot, b.id, b.spawnAt]),
        [
            ['rug_lord', 'hacked_exchange', 240],
            ['capitulation', 'yield_farm', 420],
            ['liquidation', 'peak_euphoria', 570],
            ['bear_market', 'bear_market', 720]
        ]
    );
    for (const id of ['chop', 'bear_trap', 'winter']) {
        const ids = bossesFor(id).map((b) => b.id);
        for (const b of ['hacked_exchange', 'yield_farm', 'peak_euphoria'])
            assert.ok(!ids.includes(b), `${b} stays off ${id}`);
    }
    // every era but the last has a boss, and it arrives before the era's fallback
    for (const era of ERAS.slice(0, -1)) assert.ok(bossDef(era.boss).spawnAt < era.until, era.id);
    assert.equal(ERAS.at(-1).boss, null);
    // the Flash Loan joins only through DeFi Summer's extras
    for (const w of wavesFor('eras')) assert.ok(!w.pool.includes('flash_loan'));
    assert.deepEqual(ERAS[1].extra, ['flash_loan']);
});

test('market eras: the era turns when its boss dies, and the turn delists every bear but the bosses', () => {
    const sim = quiet();
    assert.equal(sim.era.id, 'genesis');
    const p = sim.player;
    const bears = [
        [200, 0],
        [-150, 80],
        [0, 260]
    ].map(([x, y]) => new Enemy(p.x + x, p.y + y, enemyDef('ponzi'), 1, 1, sim));
    for (const e of bears) e.speed = 0;
    const exchange = new Enemy(p.x + 400, p.y, bossDef('rug_lord'), 1, 1, sim);
    const farm = new Enemy(p.x - 400, p.y, bossDef('capitulation'), 1, 1, sim);
    sim.enemies.push(...bears, exchange, farm);
    for (const e of sim.enemies) e.speed = 0;
    sim.step(0);
    assert.equal(sim.eraIndex, 0, 'nothing turns while the boss lives');
    sim.drainEvents();
    sim.damageEnemy(exchange, exchange.hp + 1, false, 'test');
    sim.step(0);
    const [era] = events(sim, 'era');
    assert.ok(era, 'an era event');
    assert.equal(sim.eraIndex, 1);
    assert.equal(sim.era.id, 'defi');
    assert.equal(era.name, 'DeFi Summer');
    assert.equal(era.n, 3, 'three bears delisted');
    assert.equal(sim.stats.delisted, 3);
    // the bears are gone and left their candles, but no downlines; the other boss stays
    assert.ok(!sim.enemies.some((e) => e.id === 'ponzi' || e.id === 'downline'));
    assert.ok(sim.enemies.includes(farm));
    assert.ok(sim.xp.length >= 3);
    // a boss from another slot doesn't turn the era early: the Yield Farm does, in DeFi Summer
    sim.damageEnemy(farm, farm.hp + 1, false, 'test');
    sim.step(0);
    assert.equal(sim.era.id, 'altseason');
});

test('market eras: an era turns at its `until` if its boss still lives, and the last era stays', () => {
    const sim = quiet();
    sim.tick = Math.round(ERAS[0].until * SIM.TICK_RATE) - 2;
    sim.step(0);
    assert.equal(sim.eraIndex, 0);
    sim.step(0);
    sim.step(0);
    assert.equal(sim.eraIndex, 1);
    sim.tick = Math.round(ERAS[2].until * SIM.TICK_RATE) + 1;
    sim.step(0);
    assert.equal(sim.eraIndex, 2, 'one era per tick');
    sim.step(0);
    assert.equal(sim.era.id, 'bear');
    sim.tick = 18 * 60 * SIM.TICK_RATE;
    sim.step(0);
    assert.equal(sim.era.id, 'bear');
    // other maps have no eras
    assert.equal(new Simulation({ seed: 5, stage: 'chop' }).era, null);
});

test("market eras: each era's weights pick its bears, and the Flash Loan only comes in DeFi Summer", () => {
    const count = (eraIndex) => {
        const sim = new Simulation({ seed: 11, stage: 'eras' });
        sim.eraIndex = eraIndex;
        sim.era = ERAS[eraIndex];
        sim.eraWeights = { ...ERAS[eraIndex].poolWeights };
        const wave = sim.waves.find((w) => w.from === 300);
        const n = {};
        for (let i = 0; i < 4000; i++) {
            const id = sim._pickBear(wave);
            n[id] = (n[id] || 0) + 1;
        }
        return n;
    };
    const genesis = count(0);
    const defi = count(1);
    const alt = count(2);
    assert.ok(!genesis.flash_loan && !alt.flash_loan);
    assert.ok(defi.flash_loan > 400, `flash loans in DeFi Summer: ${defi.flash_loan}`);
    assert.ok(defi.ponzi > genesis.ponzi * 1.2, 'DeFi Summer is ponzi season');
    assert.ok(alt.pump_dump > defi.pump_dump * 1.5, 'Altcoin Season pumps');
    assert.ok(alt.paper_hands > 200, "Altcoin Season's extra paper hands");
});

test('flash loan: marks where the bull stands, holds still through the warning, then lands there', () => {
    const sim = quiet();
    const p = sim.player;
    const def = enemyDef('flash_loan');
    const e = new Enemy(p.x + 150, p.y, def, 1, 1, sim);
    e.blinkTimer = SIM.DT / 2;
    sim.enemies.push(e);
    sim.solid = false; // open ground: the mark is exactly the bull's spot
    sim.step(0);
    const [warn] = events(sim, 'blinkWarn');
    assert.ok(warn, 'a warning');
    assert.ok(Math.abs(warn.x - p.x) < 1e-9 && Math.abs(warn.y - p.y) < 1e-9, 'marked on the bull');
    assert.equal(warn.in, def.blinkWarn);
    const x0 = e.x;
    const ticks = Math.round(def.blinkWarn * SIM.TICK_RATE);
    for (let i = 0; i < ticks - 2; i++) sim.step(0);
    assert.equal(e.x, x0, 'holds still while the ring shows');
    assert.equal(events(sim, 'blink').length, 0);
    for (let i = 0; i < 3; i++) sim.step(0);
    const [blink] = events(sim, 'blink');
    assert.ok(blink, 'it blinked');
    assert.equal(sim.stats.blinks, 1);
    assert.ok(Math.abs(e.x - warn.x) < 2 && Math.abs(e.y - warn.y) < 2, 'landed on the mark');
});

test('flash loan: blinks at most `blinkDistance`, never from out of range, and the bull can step off the ring', () => {
    const sim = quiet();
    sim.solid = false;
    const p = sim.player;
    const def = enemyDef('flash_loan');
    const far = new Enemy(p.x + 600, p.y, def, 1, 1, sim);
    far.blinkTimer = 0;
    far.speed = 0;
    const mid = new Enemy(p.x, p.y + 380, def, 1, 1, sim);
    mid.blinkTimer = SIM.DT / 2;
    sim.enemies.push(far, mid);
    p.invincibleTimer = 0;
    sim.step(0);
    const warns = events(sim, 'blinkWarn');
    assert.equal(warns.length, 1, 'the far one is out of range');
    assert.ok(Math.abs(warns[0].y - (p.y + 380 - def.blinkDistance)) < 1e-6);
    // a bull that walks away isn't on the ring when it lands
    const hp = p.hp;
    for (let i = 0; i < 60; i++) sim.step(4);
    assert.equal(events(sim, 'blink').length, 1);
    assert.equal(p.hp, hp);
});

test('market eras: a run replays bit for bit, and differs on another map', () => {
    const seed = 1; // stageForSeed(1) === 'eras'
    const bot = createBot({ phase: 3 });
    const sim = new Simulation({ seed });
    assert.equal(sim.stageId, 'eras');
    const rec = new RunRecorder(seed);
    let eras = 0;
    for (let i = 0; i < 60 * 300 && !sim.over; i++) {
        if (sim.choices) {
            rec.pick(sim.tick, 0);
            sim.choose(0);
            continue;
        }
        const m = bot.move(sim);
        rec.tick(m);
        sim.step(m);
        eras += sim.drainEvents().filter((e) => e.t === 'era').length;
    }
    const out = replay(rec.toBytes());
    assert.ok(out.ok, out.error);
    assert.equal(out.hash, sim.stateHash());
    assert.equal(out.summary.stage, 'eras');
    assert.ok(eras <= 1, 'by 5:00 at most the Genesis Era has turned');
    assert.ok(BOSSES.HACKED_EXCHANGE.stageOnly && BOSSES.YIELD_FARM.stageOnly);
});

test('market eras: each era plays the calm track in its own key and voice; no era leaves it as it was', async () => {
    const { calmStep, ERA_VOICES } = await import('../src/music.js');
    assert.deepEqual(calmStep(3), calmStep(3, null));
    assert.equal(calmStep(0)[0].type, 'triangle');
    const firsts = new Set();
    for (const era of ERAS) {
        assert.ok(ERA_VOICES[era.id], era.id);
        const n = calmStep(0, era.id)[0];
        assert.equal(n.type, ERA_VOICES[era.id].lead);
        firsts.add(`${n.type}:${Math.round(n.freq)}`);
    }
    assert.equal(firsts.size, ERAS.length, 'four eras, four voices');
});

test('market eras: every era paints its own marks on the floor', async () => {
    const { Layout } = await import('../src/world.js');
    const seen = new Set();
    for (const era of ERAS) {
        const L = new Layout('eras', 5);
        L.era = era.id;
        const ids = new Set();
        for (let j = -1; j <= 1; j++)
            for (let i = -1; i <= 1; i++) for (const d of L.chunk(i, j).decals) ids.add(d.id);
        assert.ok(ids.size > 0, `${era.id} has decals`);
        for (const id of ids) {
            assert.ok(!seen.has(id), `${id} belongs to one era`);
            seen.add(id);
        }
    }
});
