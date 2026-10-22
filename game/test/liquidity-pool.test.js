// The Liquidity Pool (Build #31): the fifth map. Whirlpools open around the bull and drag him and the bears to
// their centre; bears in the core drown. The MEV Bot front-runs the bull; Exit Liquidity opens a drain under itself.

import test from 'node:test';
import assert from 'node:assert/strict';
import { LEGACY_SIM_VERSION, Simulation } from '../src/sim/sim.js';
import { Enemy } from '../src/sim/entities.js';
import { RunRecorder, replay } from '../src/sim/runlog.js';
import { createBot } from '../src/sim/bot.js';
import { PROPS, Terrain } from '../src/sim/terrain.js';
import {
    BOSSES,
    LEGACY_STAGE_ROTATION,
    STAGES,
    STAGE_ROTATION,
    bossesFor,
    enemyDef,
    stageForSeed,
    wavesFor
} from '../src/sim/content.js';

const RULE = STAGES.POOL.whirlpools;

/** A pool sim with nothing spawning and no weapons, so the test decides what happens. */
function quiet(seed = 4, stage = 'pool') {
    const sim = new Simulation({ seed, stage });
    sim._spawn = () => {};
    sim._exitScam = () => {};
    sim._dropCrate = () => {};
    sim._whaleTick = () => {};
    sim.player.weapons.length = 0;
    sim.player.invincibleTimer = 1e9;
    return sim;
}

const events = (sim, t) => sim.drainEvents().filter((e) => e.t === t);
const bear = (sim, id, x, y) => {
    const e = new Enemy(x, y, enemyDef(id), 1, 1, sim);
    sim.enemies.push(e);
    return e;
};
const run = (sim, seconds, code = 0) => {
    for (let i = 0; i < seconds * 60 && !sim.over; i++) {
        if (sim.choices) sim.choose(0);
        sim.step(code);
    }
};

test('liquidity pool: fifth in the rotation, its own bears, and the legacy rules never see it', () => {
    assert.deepEqual(STAGE_ROTATION, ['chop', 'eras', 'winter', 'bear_trap', 'pool']);
    assert.ok(!LEGACY_STAGE_ROTATION.includes('pool'));
    assert.equal(stageForSeed(4), 'pool');
    assert.equal(stageForSeed(123), 'bear_trap');
    assert.equal(
        stageForSeed(111545178),
        'bear_trap',
        "the 19 Oct Daily's seed still says Bear Trap"
    );
    for (let seed = 0; seed < 30; seed++)
        assert.notEqual(new Simulation({ seed, rules: LEGACY_SIM_VERSION }).stageId, 'pool');
    const waves = wavesFor('pool');
    for (const w of waves) assert.equal(w.pool.includes('mev_bot'), w.from >= 60, w.label);
    for (const id of ['chop', 'eras', 'bear_trap', 'winter'])
        for (const w of wavesFor(id))
            assert.ok(!w.pool.includes('mev_bot'), `${id} has no MEV Bots`);
});

test('liquidity pool: Exit Liquidity takes the 10:00 slot here and nowhere else', () => {
    const plan = bossesFor('pool');
    const slot = plan.find((b) => b.slot === 'liquidation');
    assert.equal(slot.id, 'exit_liquidity');
    assert.equal(slot.spawnAt, 600);
    assert.equal(plan.filter((b) => b.final).length, 1);
    for (const id of ['chop', 'eras', 'bear_trap', 'winter'])
        assert.ok(!bossesFor(id).some((b) => b.id === 'exit_liquidity'), id);
    assert.equal(BOSSES.EXIT_LIQUIDITY.summon, 'mev_bot');
});

test('liquidity pool: whirlpools open on schedule near the bull, warn first, then close', () => {
    const sim = quiet();
    run(sim, RULE.first - 0.5);
    assert.equal(sim.whirlpools.length, 0);
    sim.drainEvents();
    run(sim, 1);
    const [warn] = events(sim, 'poolWarn');
    assert.ok(warn, 'a warning goes out at 0:40');
    const d = Math.hypot(warn.x - sim.player.x, warn.y - sim.player.y);
    assert.ok(d >= RULE.minDist - 1 && d <= RULE.maxDist + 1, `opened ${d | 0} away`);
    run(sim, RULE.warn);
    assert.equal(events(sim, 'poolOpen').length, 1);
    run(sim, RULE.life);
    assert.equal(events(sim, 'poolClose').length, 1);
    assert.equal(sim.whirlpools.length, 0);
    // never more than `max` wild ones at once
    const busy = quiet(9);
    busy.whirlRule = { ...RULE, every: 1, life: 30 };
    busy.nextWhirlAt = 1;
    run(busy, 12);
    assert.equal(busy.whirlpools.filter((w) => !w.owner).length, RULE.max);
});

test('liquidity pool: the warning does not pull; the open whirlpool drags the bull and bears, not bosses', () => {
    const sim = quiet();
    const p = sim.player;
    const w = sim.openWhirlpool(p.x + 100, p.y, RULE);
    const b = bear(sim, 'bag_holder', p.x + 100, p.y - 110);
    b.speed = 0;
    const boss = new Enemy(p.x + 100, p.y + 90, BOSSES.CAPITULATION, 1, 1, sim);
    boss.speed = 0;
    sim.enemies.push(boss);
    sim.step(0);
    assert.equal(p.x, 0, 'no pull during the warning');
    run(sim, RULE.warn);
    const before = Math.hypot(w.x - p.x, w.y - p.y);
    const bBefore = Math.hypot(w.x - b.x, w.y - b.y);
    run(sim, 0.5);
    assert.ok(Math.hypot(w.x - p.x, w.y - p.y) < before - 10, 'the bull drifts in');
    assert.ok(Math.hypot(w.x - b.x, w.y - b.y) < bBefore - 10, 'the bear drifts in');
    assert.equal(boss.x, p.x * 0 + 100, 'a boss stands firm');
    // walking straight out beats the pull at the edge
    const out = quiet();
    const q = out.player;
    out.openWhirlpool(q.x - 120, q.y, { ...RULE, warn: 0.01 });
    run(out, 1, 3); // move code 3: right, away from the centre
    assert.ok(q.x > 60, `walked out to ${q.x | 0}`);
});

test('liquidity pool: bears drown in the core and pay out; the bull in the core never drops below 1 HP', () => {
    const sim = quiet();
    const p = sim.player;
    p.x = 500;
    // a long one: at `drown` of max HP a second, a full-HP bear takes 1 / drown s (one normal whirlpool only
    // finishes the bears your weapons already hurt)
    const w = sim.openWhirlpool(0, 0, { ...RULE, warn: 0.01, life: 30 });
    const victims = [bear(sim, 'red_candle', 4, 0), bear(sim, 'grizzly', -6, 3)];
    for (const v of victims) v.speed = 0;
    sim.drainEvents();
    run(sim, RULE.life);
    assert.equal(events(sim, 'drown').length, 0, 'not within one normal whirlpool');
    run(sim, 1 / RULE.drown - RULE.life + 1);
    const drowned = events(sim, 'drown');
    assert.equal(drowned.length, 2);
    assert.equal(sim.stats.drowned, 2);
    assert.equal(sim.stats.kills, 2);
    assert.ok(sim.xp.length >= 2, 'their candles drop in the core');
    assert.ok(w.life > 0);
    // the bull sits in the core: it stings, but it never kills
    const s2 = quiet();
    s2.player.invincibleTimer = 0;
    s2.player.hp = 4;
    s2.openWhirlpool(0, 0, { ...RULE, warn: 0.01, life: 30 });
    run(s2, 5);
    assert.equal(s2.player.hp, 1);
    assert.equal(s2.over, false);
    assert.ok(s2.stats.coreTime > 4);
});

test('liquidity pool: the MEV Bot runs at where the bull is going', () => {
    const sim = quiet();
    const p = sim.player;
    const bot = bear(sim, 'mev_bot', 0, -300);
    const plain = bear(sim, 'red_candle', 0, -300);
    plain.speed = bot.speed;
    for (let i = 0; i < 20; i++) sim.step(3); // the bull runs right
    assert.ok(p.vx > 0);
    assert.ok(bot.x > plain.x + 5, `the bot leads (${bot.x | 0} vs ${plain.x | 0})`);
    // standing still, it chases like anyone
    const s2 = quiet();
    const b2 = bear(s2, 'mev_bot', 0, -300);
    for (let i = 0; i < 20; i++) s2.step(0);
    assert.ok(Math.abs(b2.x) < 0.001);
    assert.ok(b2.y > -300);
});

test('liquidity pool: Exit Liquidity opens a drain under itself that follows it and closes when it dies', () => {
    const sim = quiet();
    const boss = new Enemy(300, 0, BOSSES.EXIT_LIQUIDITY, 1, 1, sim);
    sim.enemies.push(boss);
    sim.drainEvents();
    run(sim, BOSSES.EXIT_LIQUIDITY.drain.every * 0.5 + 0.1);
    const warn = events(sim, 'poolWarn').find((e) => e.boss);
    assert.ok(warn, 'the drain warns');
    const w = sim.whirlpools.find((x) => x.owner === boss);
    assert.equal(w.r, BOSSES.EXIT_LIQUIDITY.drain.radius);
    run(sim, 0.5);
    assert.equal(w.x, boss.x);
    assert.equal(w.y, boss.y);
    boss.hp = 0;
    run(sim, 0.1);
    assert.ok(!sim.whirlpools.includes(w));
});

test('liquidity pool: other maps never open a whirlpool, and a pool run replays bit for bit', () => {
    for (const stage of ['chop', 'eras', 'bear_trap', 'winter']) {
        const sim = new Simulation({ seed: 11, stage });
        assert.equal(sim.whirlRule, null);
        run(sim, 60);
        assert.equal(sim.stats.whirlpools, 0, stage);
    }
    const seed = 4; // lands on the pool
    const sim = new Simulation({ seed });
    assert.equal(sim.stageId, 'pool');
    const rec = new RunRecorder(seed);
    const bot = createBot({ phase: 3 });
    for (let i = 0; i < 60 * 1300 && !sim.over; i++) {
        if (sim.choices) {
            rec.pick(sim.tick, 0);
            sim.choose(0);
            continue;
        }
        const m = bot.move(sim);
        rec.tick(m);
        sim.step(m);
    }
    assert.ok(sim.stats.whirlpools >= 5, `${sim.stats.whirlpools} whirlpools`);
    const out = replay(rec.toBytes());
    assert.ok(out.ok, out.error);
    assert.equal(out.hash, sim.stateHash());
});

test('liquidity pool: every prop the layout places is known, and the spawn is clear', () => {
    const t = new Terrain('pool', 4);
    assert.equal(t.stage, 'pool');
    const seen = new Set();
    for (const [id] of t.setProps(t.setAt(0, 0))) seen.add(id);
    for (let gy = -12; gy < 12; gy++)
        for (let gx = -12; gx < 12; gx++) {
            const b = t.big(gx, gy);
            if (b) seen.add(b.id);
        }
    assert.ok(seen.size >= 6, [...seen].join(','));
    for (const id of seen) assert.ok(id.startsWith('pool_') && PROPS[id], id);
    for (const id of Object.keys(PROPS).filter((k) => k.startsWith('pool_')))
        assert.ok(PROPS[id].w > 0, id);
});
