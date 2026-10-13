import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/sim.js';
import { XpOrb } from '../src/sim/entities.js';
import { RunRecorder, replay } from '../src/sim/runlog.js';
import { createBot } from '../src/sim/bot.js';
import { SIM, TWISTS, TWIST_IDS, dailyTwistForSeed, twistDef } from '../src/sim/content.js';

const DT = 1 / 60;

/** A sim whose bull can't die, so a test can idle as long as it likes. */
function sturdy(twist) {
    const sim = new Simulation({ seed: 5, twist });
    const p = sim.player;
    p.baseMaxHp = p.maxHp = p.hp = 1e9;
    return sim;
}

/** A candle far out of the bull's reach. */
function farCandle(sim, value = 10, fall = 0) {
    const o = new XpOrb(sim.player.x + 1500, sim.player.y + 1500, value, fall);
    sim.xp.push(o);
    return o;
}

/** Step `sec` seconds, idle, taking the first card whenever one opens. Returns the events. */
function idle(sim, sec) {
    const events = [];
    for (let i = 0; i < Math.round(sec * 60); i++) {
        if (sim.choices) sim.choose(0);
        sim.step(0);
        events.push(...sim.drainEvents());
    }
    return events;
}

test('options expiry: appended to the twists, in the Daily rotation, worded on its card', () => {
    assert.equal(TWIST_IDS.at(-1), 'options_expiry', 'TWIST_IDS is append-only');
    assert.equal(TWIST_IDS.indexOf('thin_liquidity'), 6, 'older twists keep their byte');
    const t = twistDef('options_expiry');
    assert.equal(t.xpLifetime, 6);
    assert.equal(t.xpMult, 1.5);
    assert.match(TWISTS.options_expiry.description, /6 s.*\+50%/);
    // every other twist keeps the normal clock
    for (const id of TWIST_IDS)
        if (id !== 'options_expiry') assert.equal(twistDef(id).xpLifetime, SIM.XP_LIFETIME);
    let days = 0;
    for (let seed = 0; seed < 420; seed++) if (dailyTwistForSeed(seed) === 'options_expiry') days++;
    assert.ok(days > 0, 'the Daily can land on it');
});

test('options expiry: a candle nobody takes is gone after 6 s, with a puff event', () => {
    const sim = sturdy('options_expiry');
    const o = farCandle(sim);
    const early = idle(sim, 5.8);
    assert.equal(o.dead, false, 'still there at 5.8 s');
    assert.ok(!early.some((e) => e.t === 'candleExpire' && e.x === o.x && e.y === o.y));
    const late = idle(sim, 0.4);
    assert.equal(o.dead, true, 'gone by 6.2 s');
    assert.ok(late.some((e) => e.t === 'candleExpire' && e.x === o.x && e.y === o.y));
});

test('options expiry: without the twist the same candle lasts its 30 s', () => {
    const sim = sturdy(null);
    const o = farCandle(sim);
    idle(sim, 29.5);
    assert.equal(o.dead, false, 'still there at 29.5 s');
    const late = idle(sim, 1);
    assert.equal(o.dead, true);
    assert.ok(late.some((e) => e.t === 'candleExpire' && e.x === o.x));
});

test('options expiry: a falling jackpot candle starts its clock when it lands; a frozen one waits', () => {
    const sim = sturdy('options_expiry');
    const falling = farCandle(sim, 10, 3);
    idle(sim, 3 + 5.5);
    assert.equal(falling.dead, false, '5.5 s on the floor after a 3 s fall');
    idle(sim, 0.7);
    assert.equal(falling.dead, true);

    const iced = farCandle(sim);
    iced.frozen = true;
    idle(sim, 10);
    assert.equal(iced.dead, false, 'Withdrawal Freeze holds the clock');
    iced.frozen = false;
    idle(sim, 6.2);
    assert.equal(iced.dead, true, 'thawed, it expires like any other');
});

test('options expiry: a candle you do take is worth +50%', () => {
    const plain = new Simulation({ seed: 3 });
    const twisted = new Simulation({ seed: 3, twist: 'options_expiry' });
    for (const sim of [plain, twisted]) {
        const p = sim.player;
        const o = new XpOrb(p.x, p.y, 4);
        sim.collectXp(o);
    }
    assert.ok(plain.player.exp > 0);
    assert.equal(twisted.player.exp, plain.player.exp * 1.5);
});

test('options expiry: a full run replays bit for bit, and differs from the plain run', () => {
    const seed = 2024;
    const twist = 'options_expiry';
    const sim = new Simulation({ seed, twist });
    const rec = new RunRecorder(seed, twist, sim.characterId);
    const bot = createBot();
    let expired = 0;
    while (!sim.over && sim.tick < 60 * 60 * 4) {
        if (sim.choices) {
            const i = bot.pick(sim);
            rec.pick(sim.tick, i);
            sim.choose(i);
            continue;
        }
        const code = bot.move(sim);
        rec.tick(code);
        sim.step(code);
        for (const e of sim.drainEvents()) if (e.t === 'candleExpire') expired++;
    }
    assert.ok(expired > 0, 'some candles expire in a real run');
    const r = replay(rec.toBytes());
    assert.ok(r.ok, r.error);
    assert.equal(r.twist, twist);
    assert.equal(r.hash, sim.stateHash());
    assert.deepEqual(r.summary, sim.summary());
});

test('options expiry: XpOrb clamps its clock to the twist, never extends it', () => {
    const sim = sturdy('options_expiry');
    const o = new XpOrb(sim.player.x + 1500, sim.player.y, 5);
    o.life = 2;
    o.update(DT, sim);
    assert.ok(o.life < 2, 'a shorter clock stays short');
    const o2 = new XpOrb(sim.player.x + 1500, sim.player.y, 5);
    o2.update(DT, sim);
    assert.ok(o2.life <= 6 && o2.life > 5.9);
});
