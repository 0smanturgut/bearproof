import test from 'node:test';
import assert from 'node:assert/strict';
import { needles, scan } from '../../scripts/secret-scan.mjs';

const KEY = 'sk-test-0123456789abcdefghij';

test('finds a secret value in any common encoding, without printing it', () => {
    const env = { ANTHROPIC_API_KEY: KEY };
    for (const n of needles(KEY)) {
        const problems = scan(['devlog/build-9.md'], env, () => `note: ${n}\n`);
        assert.equal(problems.length, 1, n);
        assert.ok(!problems[0].includes(KEY));
    }
    assert.deepEqual(
        scan(['game/src/a.js'], env, () => 'const x = 1;'),
        []
    );
});

test('finds well-known key shapes', () => {
    const hits = (text) => scan(['f'], {}, () => text).length;
    // Built from pieces so this file doesn't trip the scan itself.
    assert.equal(hits(['sk', 'ant', 'api03', 'A'.repeat(28)].join('-')), 1);
    assert.equal(hits(`${'-'.repeat(5)}BEGIN OPENSSH ${'PRIVATE'} KEY${'-'.repeat(5)}`), 1);
    assert.equal(hits(JSON.stringify(Array.from({ length: 64 }, (_, i) => i))), 1);
    assert.equal(hits('ghp_' + 'a'.repeat(36)), 1);
    assert.equal(hits('A normal devlog line about sk-ant nothing'), 0);
});

test('short env values are ignored (too many false hits)', () => {
    assert.deepEqual(needles('short'), []);
    assert.deepEqual(needles(undefined), []);
});
