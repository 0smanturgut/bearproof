import test from 'node:test';
import assert from 'node:assert/strict';
import { drawCard, headline, statusLine } from '../src/og/card.js';
import { measure } from '../src/og/font.js';

const run = {
    id: 'abc123def456ghi78',
    mode: 'daily',
    challengeDate: '2026-09-24',
    build: 2,
    day: 2,
    score: 128450,
    timeMs: 392000,
    kills: 1412,
    level: 23,
    status: 'pending'
};

test('card: a valid 1200×630 indexed PNG', async () => {
    const png = await drawCard(run).png();
    assert.deepEqual([...png.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    const dv = new DataView(png.buffer, png.byteOffset);
    assert.equal(String.fromCharCode(...png.slice(12, 16)), 'IHDR');
    assert.equal(dv.getUint32(16), 1200);
    assert.equal(dv.getUint32(20), 630);
    assert.equal(png[25], 3, 'indexed colour');
    assert.ok(png.length < 100_000, `small enough to serve fast (${png.length} bytes)`);
});

test('card: the same run always draws the same pixels', async () => {
    const a = await drawCard(run).png();
    const b = await drawCard({ ...run }).png();
    assert.deepEqual(a, b);
});

test('card: status is always shown, and a pending run never looks verified', () => {
    assert.match(statusLine(run)[0], /PENDING/);
    assert.match(statusLine({ ...run, status: 'verified' })[0], /VERIFIED/);
    assert.match(statusLine({ ...run, status: 'rejected' })[0], /NOT RANKED/);
    assert.match(statusLine({ ...run, status: 'weird' })[0], /PENDING/);
    assert.equal(headline(run), 'SURVIVED 06:32 OF THE BEAR MARKET');
});

test('card: huge scores shrink to fit instead of overflowing', () => {
    assert.doesNotThrow(() => drawCard({ ...run, score: 9_999_999_999 }));
    assert.ok(measure('9,999,999,999', 7) <= 760);
});
