// Boss Jackpot (Build #9): a boss kill pays triple its usual score and its XP rains down as a ring of gold candles
// that land one after another. Plus the Build #9 operator note: baked canvases get painted again after a lost
// 2D context.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/sim.js';
import { Enemy } from '../src/sim/entities.js';
import { RunRecorder, replay } from '../src/sim/runlog.js';
import { createBot } from '../src/sim/bot.js';
import { BOSSES, ENEMIES, SIM } from '../src/sim/content.js';
import {
    bakeSprite,
    clearSpriteCache,
    spriteCacheGeneration,
    watchCanvas
} from '../src/art/sprites.js';
import { Renderer } from '../src/render.js';

const DT = SIM.DT;

/** A quiet sim with `boss` dead at (x, y); resolves the kill and returns the events. */
function killBoss(def, x = 300, y = 0) {
    const sim = new Simulation({ seed: 5 });
    sim._spawn = () => {};
    const boss = new Enemy(x, y, def, 1, 1, sim);
    sim.enemies.push(boss);
    boss.hp = 0;
    const before = sim.stats.score;
    sim._cullDead();
    return { sim, boss, gained: sim.stats.score - before, events: sim.drainEvents() };
}

test('jackpot: a boss kill pays triple its usual score, and the event carries the payout', () => {
    for (const def of [BOSSES.RUG_LORD, BOSSES.CAPITULATION]) {
        const { sim, gained, events } = killBoss(def);
        const want = def.exp * SIM.BOSS_SCORE_MULT * SIM.BOSS_JACKPOT_MULT;
        assert.equal(gained, want);
        assert.equal(SIM.BOSS_JACKPOT_MULT, 3);
        const down = events.find((e) => e.t === 'bossDown');
        assert.equal(down.jackpot, want);
        assert.equal(sim.stats.bossKills, 1);
    }
    assert.equal(killBoss(BOSSES.RUG_LORD).gained, 7500, 'Rug Lord: 2,500 → 7,500');
});

test('jackpot: a plain bear still pays its XP in score and drops one candle', () => {
    const sim = new Simulation({ seed: 5 });
    sim._spawn = () => {};
    const bear = new Enemy(300, 0, ENEMIES.RUG_PULLER, 1, 1, sim);
    sim.enemies.push(bear);
    bear.hp = 0;
    const before = sim.stats.score;
    sim._cullDead();
    assert.equal(sim.stats.score - before, bear.exp);
    assert.equal(sim.xp.length, 1);
    assert.equal(sim.xp[0].fall, 0);
    const down = sim.drainEvents().find((e) => e.t === 'bossDown');
    assert.equal(down, undefined);
});

test('jackpot: the boss XP falls as a ring of gold candles around the body, same total', () => {
    const { sim, boss } = killBoss(BOSSES.RUG_LORD);
    assert.equal(sim.xp.length, SIM.JACKPOT_CANDLES);
    const total = sim.xp.reduce((a, o) => a + o.value, 0);
    assert.ok(Math.abs(total - boss.exp) < 1e-9, `total ${total}`);
    for (const o of sim.xp) {
        assert.ok(o.value >= 50, 'big enough to draw as a gold candle');
        const d = Math.hypot(o.x - boss.x, o.y - boss.y);
        assert.ok(
            d >= SIM.JACKPOT_RING_MIN - 1e-6 && d <= SIM.JACKPOT_RING_MAX + 1e-6,
            `ring ${d}`
        );
    }
    const falls = sim.xp.map((o) => o.fall);
    for (let i = 1; i < falls.length; i++)
        assert.ok(falls[i] > falls[i - 1], 'they land one after another');
    assert.ok(Math.abs(falls[0] - SIM.JACKPOT_FALL) < 1e-9);
});

test('jackpot: a falling candle can not be picked up or pulled in; once landed it can', () => {
    const { sim } = killBoss(BOSSES.RUG_LORD, 0, 0);
    const last = sim.xp[sim.xp.length - 1];
    sim.player.x = last.x;
    sim.player.y = last.y;
    last.vacuum = true;
    const start = { x: last.x, y: last.y, life: last.life };
    const lands = [];
    const exp0 = sim.player.exp;
    const level0 = sim.player.level;
    let t = 0;
    while (last.fall > 0) {
        for (const o of sim.xp) if (!o.dead) o.update(DT, sim);
        t += DT;
        lands.push(...sim.drainEvents().filter((e) => e.t === 'candleLand'));
        if (last.fall > 0) {
            assert.equal(last.dead, false, 'not collected in the air');
            assert.deepEqual({ x: last.x, y: last.y, life: last.life }, start, 'frozen in the air');
        }
    }
    assert.ok(Math.abs(t - SIM.JACKPOT_FALL * SIM.JACKPOT_CANDLES) < DT * 1.5, `landed at ${t}`);
    assert.equal(lands.length, SIM.JACKPOT_CANDLES, 'one landing event per candle');
    last.update(DT, sim);
    assert.equal(last.dead, true, 'picked up once it landed');
    assert.ok(sim.player.exp > exp0 || sim.player.level > level0);
});

test('jackpot: autopilot runs with boss kills replay bit for bit', (t) => {
    const tally = { runs: 0, jackpots: 0, replayed: 0 };
    for (let seed = 1; seed <= 40 && tally.replayed < 2; seed++) {
        const sim = new Simulation({ seed });
        const rec = new RunRecorder(seed, null, sim.characterId);
        const bot = createBot();
        let hit = 0;
        while (!sim.over) {
            if (sim.choices) {
                const i = bot.pick(sim);
                rec.pick(sim.tick, i);
                sim.choose(i);
                continue;
            }
            const code = bot.move(sim);
            rec.tick(code);
            sim.step(code);
            for (const e of sim.drainEvents()) if (e.t === 'bossDown' && e.jackpot > 0) hit++;
        }
        tally.runs++;
        if (!hit) continue;
        tally.jackpots += hit;
        const r = replay(rec.toBytes());
        assert.ok(r.ok, r.error);
        assert.equal(r.hash, sim.stateHash());
        tally.replayed++;
    }
    t.diagnostic(`jackpot: ${JSON.stringify(tally)}`);
    assert.ok(tally.replayed >= 1, 'some autopilot run kills a boss');
});

// --- lost canvas context (Build #9 operator note) ----------------------------------------------------------

/** A stand-in DOM canvas: enough for baking, and it can fire context events. */
function fakeCanvas() {
    const listeners = {};
    return {
        width: 0,
        height: 0,
        listeners,
        addEventListener(type, fn) {
            (listeners[type] ||= []).push(fn);
        },
        fire(type) {
            for (const fn of listeners[type] || []) fn({ type });
        },
        getContext() {
            return { fillRect() {}, drawImage() {}, fillStyle: '', imageSmoothingEnabled: true };
        }
    };
}

test('context loss: a baked sprite is baked again after its canvas loses or gets back its context', () => {
    const had = globalThis.document;
    globalThis.document = { createElement: () => fakeCanvas() };
    try {
        clearSpriteCache();
        const a = bakeSprite('bull', 2);
        assert.ok(a && a.length, 'baked with the stand-in canvas');
        assert.equal(bakeSprite('bull', 2), a, 'cached');
        const gen = spriteCacheGeneration();
        a[0].fire('contextrestored');
        assert.equal(spriteCacheGeneration(), gen + 1);
        const b = bakeSprite('bull', 2);
        assert.notEqual(b, a, 'painted again on fresh canvases');
        b[0].fire('contextlost');
        assert.notEqual(bakeSprite('bull', 2), b);
    } finally {
        if (had === undefined) delete globalThis.document;
        else globalThis.document = had;
    }
});

test('context loss: the renderer drops its own baked canvases and the sprite cache on recover', () => {
    const r = Object.create(Renderer.prototype);
    r.ctx = { imageSmoothingEnabled: true };
    r._cache = { shadow: {}, 'blob:1,2,3': {} };
    const gen = spriteCacheGeneration();
    r.recover();
    assert.deepEqual(r._cache, {});
    assert.equal(r.ctx.imageSmoothingEnabled, false);
    assert.equal(spriteCacheGeneration(), gen + 1);
    assert.equal(r._gen, spriteCacheGeneration(), 'in step with the sprite cache');
    // Any watched canvas losing its context moves the generation on, which the renderer follows in draw().
    const c = watchCanvas(fakeCanvas());
    c.fire('contextlost');
    assert.notEqual(r._gen, spriteCacheGeneration());
    assert.equal(watchCanvas(null), null, 'no canvas API (Node): nothing to watch');
});
