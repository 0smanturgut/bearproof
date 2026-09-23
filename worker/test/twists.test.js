import test from 'node:test';
import assert from 'node:assert/strict';
import { twistFor } from '../src/lib/twists.js';
import * as content from '../../game/src/sim/content.js';

test("twists: named with the pinned build's own code", () => {
    const builds = { 3: content };
    const seed = 2101284632;
    const t = twistFor(builds, 3, seed);
    assert.equal(t.id, content.dailyTwistForSeed(seed));
    assert.equal(t.name, content.TWISTS[t.id].name);
    assert.ok(t.description);
    assert.equal(twistFor(builds, 2, seed), null, 'builds before twists have none');
    assert.equal(twistFor({ 4: { TWISTS: {} } }, 4, seed), null);
    assert.equal(twistFor(undefined, 3, seed), null);
});
