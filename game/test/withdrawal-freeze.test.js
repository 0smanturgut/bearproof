// Withdrawal Freeze (Build #20): Crypto Winter's mini-boss at 3:30. It freezes XP candles near it; its death
// thaws them to the bull and slows the bears around him.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, SIM_VERSION } from '../src/sim/sim.js';
import { Enemy, XpOrb } from '../src/sim/entities.js';
import { createBot } from '../src/sim/bot.js';
import { BOSSES, STAGE_ROTATION, bossesFor, enemyDef } from '../src/sim/content.js';
import { bossArrival } from '../src/guide.js';
import { SPRITES } from '../src/art/sprites.js';

const WF = BOSSES.WITHDRAWAL_FREEZE;

function quiet(stage = 'winter') {
    const sim = new Simulation({ seed: 5, stage });
    sim._spawn = () => {};
    sim._exitScam = () => {};
    sim._dropCrate = () => {};
    sim._whaleTick = () => {};
    sim._coldTick = () => {};
    sim.player.weapons.length = 0;
    sim.player.invincibleTimer = 1e9; // nothing here should be about the bull taking hits
    return sim;
}

function freezeBoss(sim, dx, dy) {
    const e = new Enemy(sim.player.x + dx, sim.player.y + dy, WF, 1, 1, sim);
    e.abilityTimer = 1e9; // no jumping in these tests
    e.speed = 0;
    sim.enemies.push(e);
    return e;
}

function candle(sim, x, y, value = 10) {
    const o = new XpOrb(x, y, value);
    sim.xp.push(o);
    return o;
}

test('withdrawal freeze: on the Crypto Winter schedule at 3:30, and on no other stage', () => {
    assert.ok(SIM_VERSION >= 17, 'Withdrawal Freeze shipped in SIM_VERSION 17');
    for (const s of STAGE_ROTATION) {
        const plan = bossesFor(s).find((b) => b.id === 'withdrawal_freeze');
        if (s === 'winter') assert.equal(plan?.spawnAt, 210);
        else assert.equal(plan, undefined, `not on ${s}`);
    }
    // the rest of Winter's schedule is unchanged
    assert.deepEqual(
        bossesFor('winter').map((b) => b.id),
        ['withdrawal_freeze', 'rug_lord', 'capitulation', 'long_winter', 'bear_market']
    );
    assert.equal(bossArrival('withdrawal_freeze'), '3:30, Crypto Winter only');
    assert.ok(SPRITES.withdrawal_freeze.frames.length === 4);
    assert.ok(SPRITES.xp_candle_frozen.frames.length === 2);
});

test('withdrawal freeze: spawns on a Winter run with a warning, and never on a Chop Zone run', () => {
    for (const [stage, want] of [
        ['winter', true],
        ['chop', false]
    ]) {
        const sim = new Simulation({ seed: 3, stage });
        // survive to 3:30 standing still, with no bears to slow the sim down: only the boss schedule matters
        sim.player.hp = sim.player.maxHp = sim.player.baseMaxHp = 1e9;
        sim._exitScam = () => {};
        const spawn = sim._spawn.bind(sim);
        sim._spawn = (dt) => {
            sim.spawnAcc = 0;
            spawn(dt);
        };
        let warned = false;
        let spawned = false;
        while (sim.time < 211 && !sim.over) {
            if (sim.choices) sim.choose(0);
            else sim.step(0);
            for (const e of sim.drainEvents()) {
                if (e.t === 'bossWarn' && e.id === 'withdrawal_freeze') warned = true;
                if (e.t === 'boss' && e.id === 'withdrawal_freeze') spawned = true;
            }
        }
        assert.equal(warned, want, stage);
        assert.equal(spawned, want, stage);
        assert.equal(
            sim.enemies.some((e) => e.id === 'withdrawal_freeze'),
            want,
            stage
        );
    }
});

test('withdrawal freeze: landed candles inside the radius freeze; outside, falling or other bosses do not', () => {
    const sim = quiet();
    const boss = freezeBoss(sim, 400, 0);
    const inside = candle(sim, boss.x + WF.freezeRadius - 5, boss.y);
    const outside = candle(sim, boss.x + WF.freezeRadius + 5, boss.y);
    const falling = new XpOrb(boss.x, boss.y + 10, 10, 5);
    sim.xp.push(falling);
    sim.drainEvents();
    sim.step(0);
    const ev = sim.drainEvents();
    assert.ok(inside.frozen);
    assert.ok(!outside.frozen);
    assert.ok(!falling.frozen, 'a jackpot candle still in the air is not frozen');
    assert.equal(sim.stats.candlesFrozen, 1);
    assert.equal(ev.filter((e) => e.t === 'candleFreeze').length, 1);

    // another boss doesn't freeze anything
    const s2 = quiet();
    const lord = new Enemy(s2.player.x + 400, s2.player.y, BOSSES.RUG_LORD, 1, 1, s2);
    lord.abilityTimer = 1e9;
    s2.enemies.push(lord);
    const c = candle(s2, lord.x + 10, lord.y);
    s2.step(0);
    assert.ok(!c.frozen);
});

test('withdrawal freeze: a frozen candle cannot be picked up, pulled in, scammed, or expire', () => {
    const sim = quiet();
    freezeBoss(sim, 600, 0);
    // sitting right under the bull, but frozen
    const o = candle(sim, sim.player.x + 2, sim.player.y);
    o.frozen = true;
    const life = o.life;
    const exp = sim.player.exp;
    for (let i = 0; i < 120; i++) sim.step(0);
    assert.ok(!o.dead, 'not collected');
    assert.equal(sim.player.exp, exp);
    assert.equal(o.life, life, 'the clock is frozen too');
    assert.equal(o.x, sim.player.x + 2);

    // an Exit Scammer walks past it
    const scam = new Enemy(o.x + 5, o.y, enemyDef('exit_scam'), 1, 1, sim);
    sim.enemies.push(scam);
    sim.step(0);
    assert.equal(scam.bagCount, 0);
    assert.ok(!o.dead);
});

test('withdrawal freeze: killing it thaws every frozen candle to the bull and slows the bears near him', () => {
    const sim = quiet();
    const boss = freezeBoss(sim, 300, 0);
    const orbs = [candle(sim, boss.x + 20, boss.y), candle(sim, boss.x - 40, boss.y + 30)];
    sim.step(0);
    assert.ok(orbs.every((o) => o.frozen));
    const near = new Enemy(sim.player.x - 200, sim.player.y, enemyDef('rug_puller'), 1, 1, sim);
    const far = new Enemy(
        sim.player.x - WF.thawRadius - 60,
        sim.player.y,
        enemyDef('red_candle'),
        1,
        1,
        sim
    );
    sim.enemies.push(near, far);
    sim.drainEvents();
    sim.damageEnemy(boss, boss.hp + 1, false, 'test');
    sim.step(0);
    const ev = sim.drainEvents();
    const thaw = ev.find((e) => e.t === 'thaw');
    assert.ok(thaw, 'emits the thaw');
    assert.equal(thaw.n, 2);
    assert.equal(thaw.slowed, 1);
    assert.ok(ev.some((e) => e.t === 'bossDown' && e.id === 'withdrawal_freeze'));
    assert.ok(
        orbs.every((o) => !o.frozen && o.vacuum),
        'thawed candles fly to the bull'
    );
    assert.equal(sim.stats.candlesThawed, 2);
    assert.ok(near.slowTimer > WF.thawTime - 0.1 && near.slowPct >= WF.thawSlow);
    assert.ok(!(far.slowTimer > 0), 'a bear outside the burst is not slowed');
    // and they arrive
    const exp0 = sim.player.exp;
    const level0 = sim.player.level;
    for (let i = 0; i < 120 && orbs.some((o) => !o.dead); i++) {
        if (sim.choices) sim.choose(0);
        else sim.step(0);
    }
    assert.ok(
        orbs.every((o) => o.dead),
        'both candles collected'
    );
    assert.ok(sim.player.exp > exp0 || sim.player.level > level0);
});

test('withdrawal freeze: a bot run on Winter is deterministic, and the autopilot ignores frozen candles', () => {
    const play = () => {
        const sim = new Simulation({ seed: 77, stage: 'winter' });
        sim.player.hp = sim.player.maxHp = sim.player.baseMaxHp = 5000;
        const bot = createBot();
        while (!sim.over && sim.time < 330) {
            if (sim.choices) sim.choose(bot.pick(sim));
            else sim.step(bot.move(sim));
        }
        return sim;
    };
    const a = play();
    const b = play();
    assert.equal(a.stateHash(), b.stateHash());
    assert.ok(a.bossSpawned.has('withdrawal_freeze'));
    assert.ok(a.stats.candlesFrozen > 0, 'it froze something in a real run');

    // the bot heads for a free candle, not a closer frozen one
    const sim = quiet();
    const frozen = candle(sim, sim.player.x + 40, sim.player.y);
    frozen.frozen = true;
    candle(sim, sim.player.x - 120, sim.player.y);
    const bot = createBot();
    const code = bot.move(sim);
    const one = new Simulation({ seed: 5 });
    const x0 = one.player.x;
    one.step(code);
    assert.ok(one.player.x < x0, 'moves left, toward the free candle');
});
