import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, SIM_VERSION } from '../src/sim/sim.js';
import { RunRecorder, decodeRunLog, replay } from '../src/sim/runlog.js';
import { createBot } from '../src/sim/bot.js';
import { SIM, TWISTS, TWIST_IDS, dailyTwistForSeed, stageForSeed } from '../src/sim/content.js';

/** Play with the bot for `ticks`, then recklessly until the run ends. */
function play(seed, twist, ticks = 60 * 60) {
    const sim = new Simulation({ seed, twist });
    const rec = new RunRecorder(seed, twist);
    const calm = createBot();
    const reckless = createBot({ style: 'reckless' });
    while (!sim.over && sim.tick < SIM.MAX_TICKS) {
        if (sim.choices) {
            const i = calm.pick(sim);
            rec.pick(sim.tick, i);
            sim.choose(i);
            continue;
        }
        const code = (sim.tick < ticks ? calm : reckless).move(sim);
        rec.tick(code);
        sim.step(code);
        sim.drainEvents();
    }
    return { sim, bytes: rec.toBytes() };
}

test('twist: every id has a definition, and the daily twist is never "none"', () => {
    for (const id of TWIST_IDS) assert.ok(TWISTS[id], id);
    const seen = new Set();
    for (let seed = 0; seed < 400; seed++) {
        const t = dailyTwistForSeed(seed);
        assert.notEqual(t, 'none');
        assert.equal(t, dailyTwistForSeed(seed), 'pure function of the seed');
        seen.add(t);
    }
    assert.equal(seen.size, TWIST_IDS.length - 1, 'the rotation reaches every twist');
    // stage and twist use different bits, so a stage doesn't always get the same twist
    const pairs = new Set();
    for (let seed = 0; seed < 60; seed++)
        pairs.add(`${stageForSeed(seed)}:${dailyTwistForSeed(seed)}`);
    assert.ok(pairs.size > 6);
});

test('twist: written into the log and replayed bit for bit', () => {
    const seed = 424242;
    const twist = 'flash_crash';
    const { sim, bytes } = play(seed, twist);
    assert.equal(sim.summary().twist, twist);
    const log = decodeRunLog(bytes);
    assert.equal(log.twist, twist);
    const r = replay(bytes);
    assert.ok(r.ok, r.error);
    assert.equal(r.twist, twist);
    assert.equal(r.hash, sim.stateHash());
    assert.deepEqual(r.summary, sim.summary());
});

test('twist: changes the run for the same inputs', () => {
    const seed = 99;
    const plain = new Simulation({ seed });
    const crash = new Simulation({ seed, twist: 'flash_crash' });
    for (let i = 0; i < 60 * 30; i++) {
        for (const s of [plain, crash]) {
            if (s.choices) s.choose(0);
            if (!s.over) s.step(0);
            s.drainEvents();
        }
    }
    assert.ok(crash.enemies.length > plain.enemies.length, 'flash crash spawns more bears');
    assert.notEqual(crash.stateHash(), plain.stateHash());
    assert.equal(new Simulation({ seed, twist: 'nope' }).twistId, 'none', 'unknown twist = none');
});

test('runlog: version-1 logs (no twist byte) still decode as "none"', () => {
    const { bytes } = play(7, null, 60 * 20);
    assert.equal(bytes[2], 3);
    assert.equal(bytes[8], 0, 'twist byte 0 = none');
    // version 1 = no twist byte and no character byte
    const v1 = new Uint8Array(bytes.length - 2);
    v1.set(bytes.subarray(0, 8));
    v1.set(bytes.subarray(10), 8);
    v1[2] = 1;
    const log = decodeRunLog(v1);
    assert.equal(log.twist, 'none');
    assert.equal(log.character, 'bull');
    assert.equal(log.seed, 7);
    const bad = bytes.slice();
    bad[8] = 250;
    assert.throws(() => decodeRunLog(bad), /unknown twist/);
    assert.equal(SIM_VERSION, 4);
});
