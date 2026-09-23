import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildForDate, liveBuild, shippedCount } from '../src/lib/builds.js';
import {
    dailySeed,
    dayNumber,
    isDateKey,
    nextUtcMidnight,
    stageForSeed
} from '../src/lib/daily.js';

const B = [
    { n: 0, activatesAt: '2026-09-23T00:00:00Z', title: 'upstream' },
    { n: 1, activatesAt: '2026-09-24T18:00:00Z', title: 'reskin' },
    { n: 2, activatesAt: '2026-09-26T00:00:00Z', title: 'first daily' },
    { n: 3, activatesAt: '2026-09-27T00:00:00Z', title: 'revoked one', revoked: true }
];

test('liveBuild picks the latest activated build', () => {
    assert.equal(liveBuild(B, Date.parse('2026-09-23T12:00:00Z')).n, 0);
    assert.equal(liveBuild(B, Date.parse('2026-09-24T18:00:00Z')).n, 1);
    assert.equal(liveBuild(B, Date.parse('2026-09-25T23:59:59Z')).n, 1);
    assert.equal(liveBuild(B, Date.parse('2026-09-26T00:00:00Z')).n, 2);
});

test('liveBuild skips revoked builds and honours the override', () => {
    assert.equal(liveBuild(B, Date.parse('2026-09-28T00:00:00Z')).n, 2);
    assert.equal(liveBuild(B, Date.parse('2026-09-28T00:00:00Z'), '1').n, 1);
    assert.equal(
        liveBuild(B, Date.parse('2026-09-28T00:00:00Z'), 99).n,
        2,
        'unknown override is ignored'
    );
    assert.equal(liveBuild(B, Date.parse('2026-09-01T00:00:00Z')), null);
});

test('buildForDate pins the build live at 00:00 UTC', () => {
    // Build 1 activated at 18:00 on the 24th, so the 24th's challenge stays on build 0.
    assert.equal(buildForDate(B, '2026-09-24').n, 0);
    assert.equal(buildForDate(B, '2026-09-25').n, 1);
    assert.equal(buildForDate(B, '2026-09-26').n, 2);
});

test('shippedCount excludes the upstream baseline and future builds', () => {
    assert.equal(shippedCount(B, Date.parse('2026-09-23T12:00:00Z')), 0);
    assert.equal(shippedCount(B, Date.parse('2026-09-26T01:00:00Z')), 2);
});

test('dailySeed is deterministic, salt-dependent and non-zero', async () => {
    const a = await dailySeed('2026-09-24', 'salt-a');
    assert.equal(a, await dailySeed('2026-09-24', 'salt-a'));
    assert.notEqual(a, await dailySeed('2026-09-24', 'salt-b'));
    assert.notEqual(a, await dailySeed('2026-09-25', 'salt-a'));
    assert.ok(Number.isInteger(a) && a > 0 && a <= 0xffffffff);
    assert.ok(['chop', 'bear_trap', 'winter'].includes(stageForSeed(a)));
});

test('date helpers', () => {
    assert.ok(isDateKey('2026-09-23'));
    assert.ok(!isDateKey('2026-9-23'));
    assert.ok(!isDateKey('../etc'));
    assert.equal(
        new Date(nextUtcMidnight(Date.parse('2026-09-23T15:00:00Z'))).toISOString(),
        '2026-09-24T00:00:00.000Z'
    );
    assert.equal(dayNumber('2026-09-23', Date.parse('2026-09-23T10:00:00Z')), 1);
    assert.equal(dayNumber('2026-09-23', Date.parse('2026-10-01T23:00:00Z')), 9);
});

test('builds.json manifest is well formed', () => {
    const { builds } = JSON.parse(
        readFileSync(new URL('../../builds/builds.json', import.meta.url))
    );
    assert.ok(builds.length >= 1);
    const ns = new Set();
    for (const b of builds) {
        assert.ok(Number.isInteger(b.n) && !ns.has(b.n), `unique integer n (${b.n})`);
        ns.add(b.n);
        assert.ok(b.ref && b.commit && b.title && b.mode, `build ${b.n} has ref/commit/title/mode`);
        assert.ok(
            ['upstream', 'bootstrap', 'agent', 'human'].includes(b.mode),
            `build ${b.n} mode`
        );
        assert.ok(Number.isFinite(Date.parse(b.activatesAt)), `build ${b.n} activatesAt`);
    }
    assert.equal(builds[0].n, 0);
    assert.equal(builds[0].ref, 'day-0');
});
