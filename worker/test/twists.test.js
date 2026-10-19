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

test("the Daily map: picked and named with the pinned build's own code, so a new map counts", async () => {
    const { stageFor, stageNameFor } = await import('../src/lib/twists.js');
    const { STAGE_NAMES, stageForSeed } = await import('../src/lib/daily.js');
    const seed = 111545178; // 19 Oct 2026: 3 maps say Chop Zone, Build #27's 4 say Bear Trap
    const builds = { 27: content };
    assert.equal(stageForSeed(seed), 'chop', 'the old fixed list');
    assert.equal(stageFor(builds, 27, seed, stageForSeed), content.stageForSeed(seed));
    assert.equal(stageFor(builds, 27, seed, stageForSeed), 'bear_trap');
    assert.equal(
        stageFor(builds, 5, seed, stageForSeed),
        'chop',
        'a build without its own: the list'
    );
    assert.equal(stageNameFor(builds, 27, 'eras', STAGE_NAMES), 'Market Eras');
    assert.equal(stageNameFor(builds, 27, 'bear_trap', STAGE_NAMES), 'Bear Trap');
    assert.equal(stageNameFor({}, 3, 'winter', STAGE_NAMES), 'Crypto Winter');
    assert.equal(stageNameFor({}, 3, 'mystery', STAGE_NAMES), 'mystery');
});
