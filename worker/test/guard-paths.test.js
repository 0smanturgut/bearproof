import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPaths } from '../../scripts/guard-paths.mjs';

const ok = (path, status = 'M') => ({ path, status });

test('guard: game code, content and devlog are allowed', () => {
    assert.deepEqual(
        checkPaths([
            ok('game/src/sim/content.js'),
            ok('game/src/render.js'),
            ok('devlog/build-4.md', 'A'),
            ok('game/test/new.test.js', 'A')
        ]),
        []
    );
});

test('guard: infra, money and CI paths are refused', () => {
    for (const p of [
        'worker/src/index.js',
        '.github/workflows/agent.yml',
        'wrangler.jsonc',
        'scripts/build.mjs',
        'builds/builds.json',
        'hq/index.html',
        'package.json',
        'docs/DECISIONS.md'
    ]) {
        assert.equal(checkPaths([ok(p)]).length, 1, p);
    }
});

test('guard: the gates that judge the agent are protected', () => {
    for (const p of [
        'game/scripts/smoke.mjs',
        'game/test/sim.test.js',
        'game/src/sim/dmath.js',
        'game/src/sim/rng.js',
        'game/src/sim/runlog.js',
        'game/src/sim/input-codes.js'
    ]) {
        assert.equal(checkPaths([ok(p)]).length, 1, p);
    }
    assert.equal(checkPaths([ok('game/test/client.test.js', 'D')]).length, 1, 'deleting a test');
});
