// The rules before SIM_VERSION 22 are still played: run logs written under them replay under them, and the Daily
// Challenges dated before RULES_22_FROM keep them all day. The fixture is six autopilot runs (free runs and
// Dailies, all three characters) recorded on 18 Oct with Build #26's own code, before the solid map; this code must
// replay every one of them bit for bit.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEGACY_SIM_VERSION, RULES_22_FROM, SIM_VERSION, Simulation } from '../src/sim/sim.js';
import { RunRecorder, decodeRunLog, fromBase64Url, replay } from '../src/sim/runlog.js';
import { CHOICE_REROLL } from '../src/sim/content.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const runs = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/legacy-b26-runs.json'), 'utf8'));

test('legacy rules: every Build #26 run log replays bit for bit on this code', () => {
    assert.equal(LEGACY_SIM_VERSION, 21);
    assert.ok(runs.length >= 6);
    for (const r of runs) {
        const bytes = fromBase64Url(r.log);
        assert.equal(decodeRunLog(bytes).simVersion, 21);
        const out = replay(bytes);
        assert.ok(out.ok, `${r.seed}: ${out.error}`);
        assert.equal(out.hash, r.hash, `${r.seed}: same final state as Build #26`);
        for (const [k, v] of Object.entries(r.summary))
            assert.deepEqual(out.summary[k], v, `${r.seed}: ${k}`);
    }
});

test('legacy rules: no solid scenery, no piggy banks, no chests, no rerolls', () => {
    const sim = new Simulation({ seed: 7, rules: LEGACY_SIM_VERSION });
    assert.equal(sim.rules, 21);
    assert.equal(sim.solid, false);
    assert.equal(sim.rerolls, 0);
    assert.equal(sim.skips, 0);
    for (let i = 0; i < 60 * 30 && !sim.over; i++) {
        if (sim.choices) sim.choose(0);
        else sim.step(0);
    }
    assert.equal(sim.breakables.length, 0);
    assert.equal(sim.stats.smashed, 0);
    // a log can't carry a reroll under the old rules
    const rec = new RunRecorder(7, null, null, LEGACY_SIM_VERSION);
    rec.tick(0);
    rec.pick(1, CHOICE_REROLL);
    assert.throws(() => decodeRunLog(rec.toBytes()), /bad pick/);
});

test('legacy rules: a run says which rules it played, and the new ones are the default', () => {
    assert.equal(new Simulation({ seed: 1 }).rules, SIM_VERSION);
    assert.equal(new RunRecorder(1).toBytes()[3], SIM_VERSION);
    assert.equal(new RunRecorder(1, null, null, LEGACY_SIM_VERSION).toBytes()[3], 21);
    assert.equal(
        new Simulation({ seed: 1, rules: 99 }).rules,
        SIM_VERSION,
        'unknown: the current rules'
    );
    // the Daily of 18 Oct (already under way when the solid map shipped) keeps the old rules; later ones don't
    assert.ok('2026-10-18' < RULES_22_FROM && !('2026-10-19' < RULES_22_FROM));
});
