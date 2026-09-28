// Doomposters type before they post (Build #7): every shot comes after a 0.6 s wind-up where the poster stands
// still, and they only fire from inside a phone's view.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/sim.js';
import { Enemy } from '../src/sim/entities.js';
import { RunRecorder, replay } from '../src/sim/runlog.js';
import { createBot } from '../src/sim/bot.js';
import { ENEMIES, SIM } from '../src/sim/content.js';

const DOOM = ENEMIES.DOOMPOSTER;
const DT = SIM.DT;

/** A sim with no spawns and one doomposter at (x, y), ready to fire. */
function withPoster(x, y) {
    const sim = new Simulation({ seed: 5 });
    sim._spawn = () => {};
    const e = new Enemy(x, y, DOOM, 1, 1, sim);
    e.fireTimer = 0;
    return { sim, e, p: sim.player };
}

function tick(sim, e, seconds) {
    const events = [];
    for (let i = 0; i < Math.round(seconds / DT); i++) {
        e.update(DT, sim);
        events.push(...sim.drainEvents());
    }
    return events;
}

test('doomposter: its data puts it inside a phone view (~520 across) with a wind-up', () => {
    assert.ok(DOOM.firingRange <= 260, 'fires from inside half a phone view');
    assert.ok(DOOM.keepDistance < DOOM.firingRange);
    assert.equal(DOOM.windup, 0.6);
});

test('doomposter: types for the whole wind-up, standing still, then posts one shot', () => {
    const { sim, e } = withPoster(DOOM.keepDistance, 0);
    const typing = tick(sim, e, DT);
    assert.equal(typing.filter((ev) => ev.t === 'enemyTyping').length, 1);
    assert.ok(e.windup > 0);
    const x0 = e.x;
    const quiet = tick(sim, e, DOOM.windup - 3 * DT);
    assert.equal(
        quiet.filter((ev) => ev.t === 'enemyShot').length,
        0,
        'no shot during the wind-up'
    );
    assert.equal(sim.enemyProjectiles.length, 0);
    assert.equal(e.x, x0, 'stands still while typing');
    const shot = tick(sim, e, 4 * DT);
    assert.equal(shot.filter((ev) => ev.t === 'enemyShot').length, 1);
    assert.equal(sim.enemyProjectiles.length, 1);
    assert.equal(e.windup, 0);
});

test('doomposter: the shot goes where the bull is when it fires, not where it was', () => {
    const { sim, e, p } = withPoster(DOOM.keepDistance, 0);
    tick(sim, e, DT); // starts typing, bull at (0, 0)
    p.y = 120; // the bull moves during the wind-up
    tick(sim, e, DOOM.windup + DT);
    const b = sim.enemyProjectiles[0];
    assert.ok(b, 'a shot went out');
    const want = Math.atan2(p.y - e.y, p.x - e.x);
    assert.ok(Math.abs(b.angle - want) < 1e-9);
});

test('doomposter: keeps the old cadence, one shot per fireCooldown', () => {
    const { sim, e } = withPoster(DOOM.keepDistance, 0);
    const events = tick(sim, e, DOOM.fireCooldown * 4 + DOOM.windup);
    const shots = events.filter((ev) => ev.t === 'enemyShot').length;
    assert.ok(shots >= 4 && shots <= 5, `${shots} shots`);
});

test('doomposter: never starts typing from beyond its firing range', () => {
    const { sim, e } = withPoster(DOOM.firingRange + 60, 0);
    e.speed = 0; // hold it out of range
    const events = tick(sim, e, 5);
    assert.equal(events.filter((ev) => ev.t === 'enemyTyping').length, 0);
    assert.equal(sim.enemyProjectiles.length, 0);
});

test('doomposter: Bear Trap runs replay bit for bit through the run log', () => {
    let typed = 0;
    for (const seed of [4, 7, 10]) {
        const sim = new Simulation({ seed, twist: 'flash_crash' });
        assert.equal(sim.stageId, 'bear_trap');
        const rec = new RunRecorder(seed, 'flash_crash', sim.characterId);
        const bot = createBot();
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
            typed += sim.drainEvents().filter((ev) => ev.t === 'enemyTyping').length;
        }
        const r = replay(rec.toBytes());
        assert.ok(r.ok, r.error);
        assert.equal(r.hash, sim.stateHash());
    }
    assert.ok(typed > 0, 'doomposters typed in these runs');
});
