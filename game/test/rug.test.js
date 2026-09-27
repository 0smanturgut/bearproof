// Rug Lord's second phase (Build #6): below half HP he pulls the rug. A warning, then the floor slides the bull
// toward him; running away still gets you out, and the pull ends when he does.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/sim.js';
import { Enemy } from '../src/sim/entities.js';
import { RunRecorder, replay } from '../src/sim/runlog.js';
import { createBot } from '../src/sim/bot.js';
import { BOSSES, SIM } from '../src/sim/content.js';

const PH = BOSSES.RUG_LORD.phase2;
const DT = SIM.DT;

/** A sim with no bears spawning and Rug Lord at (x, y), at `hpShare` of his HP. */
function withLord(x, y, hpShare) {
    const sim = new Simulation({ seed: 11 });
    sim._spawn = () => {};
    const lord = new Enemy(x, y, BOSSES.RUG_LORD, 1, 1, sim);
    lord.hp = lord.maxHp * hpShare;
    lord.abilityTimer = 1e9; // no summons: only the rug moves the bull here
    return { sim, lord, p: sim.player };
}

/** Advance only the boss, `seconds` long; returns the events it emitted. */
function tickLord(sim, lord, seconds) {
    const events = [];
    for (let i = 0; i < Math.round(seconds / DT); i++) {
        lord.update(DT, sim);
        events.push(...sim.drainEvents());
    }
    return events;
}

test('rug: above half HP, Rug Lord never pulls', () => {
    const { sim, lord, p } = withLord(3000, 0, 0.51);
    const events = tickLord(sim, lord, 20);
    assert.equal(lord.enraged, false);
    assert.equal(events.filter((e) => e.t.startsWith('rug')).length, 0);
    assert.equal(p.x, 0);
    assert.equal(p.y, 0);
});

test('rug: at half HP he enrages once, warns, then slides the bull toward him', () => {
    const { sim, lord, p } = withLord(3000, 0, 0.5);
    const warn = tickLord(sim, lord, PH.warn - DT);
    assert.equal(warn.filter((e) => e.t === 'rugPhase').length, 1);
    const w = warn.find((e) => e.t === 'rugWarn');
    assert.ok(w, 'a warning comes first');
    assert.ok(Math.abs(w.angle) < 1e-9, 'the rug points at him');
    assert.equal(p.x, 0, 'the warning never moves the bull');

    const pull = tickLord(sim, lord, PH.pull + 2 * DT);
    assert.equal(pull.filter((e) => e.t === 'rugPull').length, 1);
    assert.equal(pull.filter((e) => e.t === 'rugPhase').length, 0, 'enraged only once');
    const slid = PH.speed * PH.pull;
    assert.ok(Math.abs(p.x - slid) < PH.speed * 2 * DT, `slid ${p.x.toFixed(1)} of ${slid}`);
    assert.ok(Math.abs(p.y) < 1e-9);
});

test('rug: one pull every few seconds, the direction fixed at the warning', () => {
    const { sim, lord, p } = withLord(0, -3000, 0.3);
    const events = tickLord(sim, lord, PH.every * 4 - DT);
    const warns = events.filter((e) => e.t === 'rugWarn');
    const pulls = events.filter((e) => e.t === 'rugPull');
    assert.equal(warns.length, 4);
    assert.equal(pulls.length, 4);
    for (const e of pulls)
        assert.ok(Math.abs(e.angle + Math.PI / 2) < 0.05, 'pulled up, toward him');
    assert.ok(p.y < -PH.speed * PH.pull * 3.9, `four pulls, bull at y ${p.y.toFixed(0)}`);
    assert.ok(Math.abs(p.x) < 1);
});

test('rug: running away during a pull still gains ground on him', () => {
    const { sim, lord, p } = withLord(400, 0, 0.4);
    tickLord(sim, lord, PH.warn + DT);
    assert.ok(lord.rugPull > 0, 'the pull is on');
    const before = lord.x - p.x;
    for (let i = 0; i < Math.round((PH.pull - 2 * DT) / DT); i++) {
        p.update(DT, sim, -1, 0);
        lord.update(DT, sim);
        sim.drainEvents();
    }
    assert.ok(lord.rugPull > 0, 'still inside the same pull');
    const after = lord.x - p.x;
    assert.ok(after > before + 25, `distance ${before.toFixed(0)} → ${after.toFixed(0)}`);
});

test('rug: the pull stops the moment Rug Lord is rekt', () => {
    const { sim, lord, p } = withLord(900, 0, 0.4);
    sim.enemies.push(lord);
    for (let i = 0; i < Math.round((PH.warn + 0.3) / DT); i++) sim.step(0);
    assert.ok(lord.rugPull > 0 && p.x > 0, 'the bull is sliding');
    lord.hp = 0;
    sim.step(0);
    const x = p.x;
    for (let i = 0; i < 60; i++) sim.step(0);
    assert.equal(p.x, x);
    assert.equal(sim.stats.bossKills, 1);
});

test('rug: autopilot runs that meet the rug pull replay exactly', (t) => {
    const tally = { lord: 0, enraged: 0, pulls: 0, rekt: 0, replayed: 0 };
    for (let seed = 1; seed <= 40; seed++) {
        const sim = new Simulation({ seed });
        const rec = new RunRecorder(seed, null, sim.characterId);
        const bot = createBot();
        let enraged = false;
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
            for (const e of sim.drainEvents()) {
                if (e.t === 'boss' && e.id === 'rug_lord') tally.lord++;
                if (e.t === 'rugPhase') enraged = true;
                if (e.t === 'rugPull') tally.pulls++;
                if (e.t === 'bossDown' && e.id === 'rug_lord') tally.rekt++;
            }
        }
        if (!enraged) continue;
        tally.enraged++;
        if (tally.replayed >= 3) continue;
        const r = replay(rec.toBytes());
        assert.ok(r.ok, r.error);
        assert.equal(r.hash, sim.stateHash());
        tally.replayed++;
    }
    t.diagnostic(`rug: ${JSON.stringify(tally)} over 40 autopilot runs`);
    assert.ok(tally.enraged >= 1, 'some autopilot run gets him under half');
    assert.ok(tally.pulls >= tally.enraged);
});
