// Exit Scam (Build #15): from 3:00 a scammer pockets the XP candles on the floor and runs for the exit.
// Kill it and the bag spills out; let it get away and the XP is gone.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/sim.js';
import { Enemy, XpOrb } from '../src/sim/entities.js';
import { RunRecorder, replay } from '../src/sim/runlog.js';
import { createBot } from '../src/sim/bot.js';
import { ENEMIES, SIM, WAVES, enemyDef } from '../src/sim/content.js';
import { encodeMove } from '../src/sim/input-codes.js';
import { SPRITES } from '../src/art/sprites.js';
import { guideSections } from '../src/guide.js';

const SCAM = ENEMIES.EXIT_SCAM;

/** No regular spawns, no crates, no weapons, and the bull can't be hurt. */
function quiet(seed = 5) {
    const sim = new Simulation({ seed });
    sim._spawn = () => {};
    sim._dropCrate = () => {};
    sim.player.weapons.length = 0;
    sim.player.shieldTimer = 1e9;
    return sim;
}

function scammer(sim, x, y) {
    sim._exitScam = () => {};
    const e = new Enemy(x, y, enemyDef('exit_scam'), 1, 1, sim);
    sim.enemies.push(e);
    return e;
}

function candle(sim, x, y, value = 10, fall = 0) {
    const o = new XpOrb(x, y, value, fall);
    sim.xp.push(o);
    return o;
}

function run(sim, seconds, events = []) {
    for (let i = 0; i < Math.round(seconds * SIM.TICK_RATE); i++) {
        sim.step(0);
        events.push(...sim.drainEvents());
    }
    return events;
}

const xpOnFloor = (sim) => sim.xp.reduce((s, o) => s + o.value, 0);

test('exit scam: defined, drawn, described, and not in any wave', () => {
    assert.equal(SCAM.id, 'exit_scam');
    assert.ok(SCAM.thief);
    assert.ok(SCAM.description && SCAM.tip);
    assert.ok(SPRITES.exit_scam.frames.length === 4);
    assert.ok(SCAM.fleeSpeed < SIM.PLAYER_SPEED, 'the bull can catch it');
    for (const w of WAVES) assert.ok(!w.pool.includes('exit_scam'), w.label);
    const g = guideSections()
        .find((s) => s.id === 'bears')
        .entries.find((e) => e.id === 'exit_scam');
    assert.deepEqual(g.tags, ['From 3:00, one every 45 s']);
});

test('exit scam: the first walks in at 3:00, then one every 45 s, just off screen', () => {
    const sim = quiet();
    const scams = () => sim.enemies.filter((e) => e.id === 'exit_scam');
    while (sim.time < SIM.SCAM_FIRST - 0.1) sim.step(0);
    assert.equal(scams().length, 0);
    const ev = run(sim, 0.2);
    assert.equal(scams().length, 1);
    assert.equal(ev.filter((e) => e.t === 'scam').length, 1);
    const d = Math.hypot(scams()[0].x - sim.player.x, scams()[0].y - sim.player.y);
    assert.ok(Math.abs(d - SIM.SPAWN_RADIUS) < 30, `spawned ${d} out`); // and walked a few steps
    run(sim, SIM.SCAM_EVERY - 0.3);
    assert.equal(sim.enemies.filter((e) => e.id === 'exit_scam').length, 1);
    run(sim, 0.3);
    assert.equal(sim.enemies.filter((e) => e.id === 'exit_scam').length, 2);
});

test('exit scam: walks to a candle and pockets it, and the bull never gets that XP', () => {
    const sim = quiet();
    const e = scammer(sim, 400, 0);
    const o = candle(sim, 400, 200, 12);
    const exp = sim.player.exp;
    const ev = run(sim, 3);
    assert.ok(o.dead);
    assert.ok(!sim.xp.includes(o));
    assert.equal(e.bag, 12);
    assert.equal(e.bagCount, 1);
    assert.equal(sim.player.exp, exp);
    assert.deepEqual(
        ev.filter((x) => x.t === 'scamGrab').map((x) => x.n),
        [1]
    );
});

test('exit scam: goes for the nearest candle, and ignores falling and vacuumed ones', () => {
    const sim = quiet();
    const e = scammer(sim, 400, 0);
    const falling = candle(sim, 430, 0, 50, 99);
    const pulled = candle(sim, 370, 0, 10);
    pulled.vacuum = true;
    pulled.update = () => {}; // hold it still: only the scammer's choice matters here
    const far = candle(sim, 400, 300, 10);
    const near = candle(sim, 400, -150, 10);
    run(sim, 1.6);
    assert.ok(near.dead, 'took the nearest one first');
    assert.ok(!far.dead && !falling.dead && !pulled.dead);
    assert.equal(e.bagCount, 1);
});

test('exit scam: with a full bag it runs straight away from the bull at its flee speed', () => {
    const sim = quiet();
    const e = scammer(sim, 300, 0);
    e.bagCount = SCAM.bagMax - 1;
    e.bag = 70;
    candle(sim, 300, 20, 10);
    const ev = run(sim, 0.5);
    assert.ok(e.fleeing);
    const runs = ev.filter((x) => x.t === 'scamRun');
    assert.equal(runs.length, 1);
    assert.equal(runs[0].n, SCAM.bagMax);
    assert.equal(runs[0].v, 80);
    const x0 = e.x;
    run(sim, 1);
    assert.ok(Math.abs(e.x - x0 - SCAM.fleeSpeed) < 1, `ran ${e.x - x0}`);
    assert.ok(Math.abs(e.y) < 25, 'straight away from the bull');
});

test('exit scam: a bull that gives chase from 300 behind catches it before the exit', () => {
    const sim = quiet();
    const e = scammer(sim, 300, 0);
    e.bagCount = 3;
    e.bag = 30;
    e.fleeing = true;
    const right = encodeMove(1, 0);
    let caught = false;
    while (sim.enemies.includes(e) && !caught) {
        sim.step(right);
        caught = Math.hypot(e.x - sim.player.x, e.y - sim.player.y) < e.size + sim.player.size;
    }
    assert.ok(caught, `escaped at x ${e.x}`);
    assert.ok(e.x < SCAM.escapeRange + sim.player.x);
});

test('exit scam: greed runs out 10 s after the first grab, even with candles left', () => {
    const sim = quiet();
    const e = scammer(sim, 300, 0);
    e.bagCount = 1;
    e.bag = 10;
    e.speed = 0; // it never reaches the candle
    candle(sim, 300, 400, 10);
    run(sim, SCAM.greed - 0.1);
    assert.ok(!e.fleeing);
    run(sim, 0.2);
    assert.ok(e.fleeing);
});

test('exit scam: with nothing left to take it runs; with an empty bag it walks at you', () => {
    const sim = quiet();
    const loaded = scammer(sim, 300, 0);
    loaded.bagCount = 2;
    loaded.bag = 20;
    const empty = scammer(sim, -300, 0);
    run(sim, 0.1);
    assert.ok(loaded.fleeing);
    assert.ok(!empty.fleeing);
    assert.ok(empty.x > -300, 'the empty one comes at the bull');
});

test('exit scam: past escapeRange it is gone with the bag, and no XP drops', () => {
    const sim = quiet();
    const e = scammer(sim, SCAM.escapeRange - 2, 0);
    e.bagCount = 3;
    e.bag = 36;
    e.fleeing = true;
    const ev = run(sim, 0.2);
    assert.ok(!sim.enemies.includes(e));
    assert.equal(sim.xp.length, 0);
    assert.equal(sim.stats.scamsEscaped, 1);
    assert.equal(sim.stats.kills, 0);
    const gone = ev.filter((x) => x.t === 'scamGone');
    assert.equal(gone.length, 1);
    assert.equal(gone[0].v, 36);
    assert.equal(gone[0].n, 3);
});

test('exit scam: kill it and the whole bag spills out, plus its own XP', () => {
    const sim = quiet();
    const e = scammer(sim, 300, 0);
    e.bagCount = 4;
    e.bag = 50;
    e.hp = 0;
    const ev = run(sim, 1 / SIM.TICK_RATE);
    assert.equal(sim.xp.length, 5);
    assert.equal(xpOnFloor(sim), 50 + SCAM.exp);
    assert.equal(sim.stats.scamsBusted, 1);
    const bust = ev.find((x) => x.t === 'scamBust');
    assert.equal(bust.v, 50);
    assert.equal(bust.n, 4);
});

test('exit scam: killed with an empty bag it just drops its own XP', () => {
    const sim = quiet();
    const e = scammer(sim, 300, 0);
    e.hp = 0;
    const ev = run(sim, 1 / SIM.TICK_RATE);
    assert.equal(sim.xp.length, 1);
    assert.equal(xpOnFloor(sim), SCAM.exp);
    assert.equal(sim.stats.scamsBusted, 0);
    assert.ok(!ev.some((x) => x.t === 'scamBust'));
});

test('runlog: a run where scammers grab candles replays exactly', () => {
    let checked = 0;
    for (let seed = 1; seed <= 12 && checked < 2; seed++) {
        const sim = new Simulation({ seed });
        const rec = new RunRecorder(seed, null, sim.characterId);
        const bot = createBot();
        let grabs = 0;
        while (!sim.over && sim.tick < SIM.MAX_TICKS) {
            if (sim.choices) {
                const i = bot.pick(sim);
                rec.pick(sim.tick, i);
                sim.choose(i);
                continue;
            }
            const code = bot.move(sim);
            rec.tick(code);
            sim.step(code);
            for (const e of sim.drainEvents()) if (e.t === 'scamGrab') grabs++;
        }
        if (!grabs) continue;
        checked++;
        const r = replay(rec.toBytes());
        assert.ok(r.ok, r.error);
        assert.equal(r.hash, sim.stateHash());
        assert.deepEqual(r.summary, sim.summary());
    }
    assert.equal(checked, 2, 'found two bot runs where a scammer grabbed a candle');
});
