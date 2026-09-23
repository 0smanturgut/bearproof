import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readJson } from '../src/lib/http.js';
import {
    MAX_BODY_BYTES,
    MAX_LOG_BYTES,
    RUN_ID,
    challengeWindow,
    decodeBase64Url,
    displayName,
    isUuidV4,
    newId,
    sanitizeName,
    validateRun
} from '../src/lib/runs.js';

const BUILDS = [
    { n: 0, activatesAt: '2026-09-23T00:00:00Z' },
    { n: 1, activatesAt: '2026-09-24T00:00:00Z' },
    { n: 2, activatesAt: '2026-10-01T00:00:00Z' },
    { n: 3, activatesAt: '2026-09-23T12:00:00Z', revoked: true }
];
const NOW = Date.parse('2026-09-24T12:00:00Z');
const PID = '3b241101-e2bb-4255-8caf-4136c566a962';
const LOG = Buffer.from([1, 2, 3, 250, 251, 252]).toString('base64url');

function body(patch = {}) {
    const b = {
        v: 1,
        playerId: PID,
        name: 'Bull',
        mode: 'daily',
        challengeDate: '2026-09-24',
        build: 1,
        seed: 123456,
        stage: 'forest',
        claimed: { score: 1000, timeMs: 60000, kills: 50, level: 5 },
        durationMs: 65000,
        log: LOG,
        turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX'
    };
    const { claimed, ...rest } = patch;
    return { ...b, ...rest, claimed: { ...b.claimed, ...claimed } };
}

const check = (b, nowMs = NOW) => validateRun(b, { builds: BUILDS, nowMs });

test('validateRun accepts a daily run and normalises it', () => {
    const r = check(body({ playerId: PID.toUpperCase(), name: '  Bull  Run ' }));
    assert.equal(r.ok, true);
    assert.equal(r.run.playerId, PID);
    assert.equal(r.run.name, 'Bull Run');
    assert.equal(r.run.challengeDate, '2026-09-24');
    assert.equal(r.run.score, 1000);
    assert.deepEqual([...r.run.log], [1, 2, 3, 250, 251, 252]);
    assert.equal(r.run.turnstileToken, 'XXXX.DUMMY.TOKEN.XXXX');
});

test('validateRun accepts a free run and drops its challengeDate', () => {
    const r = check(body({ mode: 'free', build: 0, name: undefined, turnstileToken: undefined }));
    assert.equal(r.ok, true);
    assert.equal(r.run.challengeDate, null);
    assert.equal(r.run.name, null);
    assert.equal(r.run.turnstileToken, null);
});

test('validateRun: an invalid name is dropped, not rejected', () => {
    const r = check(body({ name: '<script>' }));
    assert.equal(r.ok, true);
    assert.equal(r.run.name, null);
});

const REJECTIONS = [
    ['non-object body', null, 'invalid_body'],
    ['array body', [], 'invalid_body'],
    ['wrong version', body({ v: 2 }), 'unsupported_version'],
    ['bad playerId', body({ playerId: 'not-a-uuid' }), 'invalid_field', 'playerId'],
    [
        'uuid v1 playerId',
        body({ playerId: 'c232ab00-9414-11ec-b3c8-9f6bdeced846' }),
        'invalid_field',
        'playerId'
    ],
    ['bad mode', body({ mode: 'ranked' }), 'invalid_field', 'mode'],
    ['float build', body({ build: 1.5 }), 'invalid_field', 'build'],
    ['string build', body({ build: '1' }), 'invalid_field', 'build'],
    ['negative seed', body({ seed: -1 }), 'invalid_field', 'seed'],
    ['seed over uint32', body({ seed: 2 ** 32 }), 'invalid_field', 'seed'],
    ['uppercase stage', body({ stage: 'Forest' }), 'invalid_field', 'stage'],
    ['long stage', body({ stage: 'a'.repeat(25) }), 'invalid_field', 'stage'],
    ['missing claimed', { ...body(), claimed: null }, 'invalid_field', 'claimed'],
    ['negative score', body({ claimed: { score: -1 } }), 'invalid_field', 'claimed.score'],
    ['score over cap', body({ claimed: { score: 50_000_001 } }), 'invalid_field', 'claimed.score'],
    ['float score', body({ claimed: { score: 10.5 } }), 'invalid_field', 'claimed.score'],
    [
        'time over 30 min',
        body({ claimed: { timeMs: 30 * 60000 + 1 }, durationMs: 40 * 60000 }),
        'invalid_field',
        'claimed.timeMs'
    ],
    ['negative kills', body({ claimed: { kills: -3 } }), 'invalid_field', 'claimed.kills'],
    ['level 0', body({ claimed: { level: 0 } }), 'invalid_field', 'claimed.level'],
    ['missing durationMs', body({ durationMs: undefined }), 'invalid_field', 'durationMs'],
    ['empty log', body({ log: '' }), 'invalid_field', 'log'],
    ['non-base64url log', body({ log: 'ab+/' }), 'invalid_field', 'log'],
    ['impossible base64 length', body({ log: 'abcde' }), 'invalid_field', 'log'],
    [
        'log over 256 KB',
        body({ log: Buffer.alloc(MAX_LOG_BYTES + 1).toString('base64url') }),
        'log_too_large',
        'log'
    ],
    ['non-string turnstile token', body({ turnstileToken: 5 }), 'invalid_field', 'turnstileToken'],
    ['unknown build', body({ build: 99 }), 'unknown_build', 'build'],
    ['future build', body({ build: 2, mode: 'free' }), 'unknown_build', 'build'],
    ['revoked build', body({ build: 3, mode: 'free' }), 'unknown_build', 'build'],
    [
        'sim time longer than wall time',
        body({ claimed: { timeMs: 600000 }, durationMs: 500000 }),
        'implausible_run',
        'durationMs'
    ],
    ['daily without date', body({ challengeDate: undefined }), 'invalid_field', 'challengeDate'],
    ['daily with bad date', body({ challengeDate: '2026-9-24' }), 'invalid_field', 'challengeDate'],
    ['daily in the future', body({ challengeDate: '2026-09-25' }), 'not_yet'],
    ['daily long closed', body({ challengeDate: '2026-09-22' }), 'challenge_closed'],
    ['yesterday outside grace', body({ challengeDate: '2026-09-23' }), 'challenge_closed']
];

for (const [name, b, code, field] of REJECTIONS) {
    test(`validateRun rejects: ${name}`, () => {
        const r = check(b);
        assert.equal(r.ok, false);
        assert.equal(r.status, 400);
        assert.equal(r.code, code);
        if (field) assert.equal(r.field, field);
        assert.ok(r.message.length > 0);
    });
}

test('validateRun: wall time tolerance (3% + 2 s) is honoured', () => {
    assert.equal(check(body({ claimed: { timeMs: 100000 }, durationMs: 95000 })).ok, true);
    assert.equal(check(body({ claimed: { timeMs: 100000 }, durationMs: 94999 })).ok, false);
});

test('validateRun: yesterday is accepted for 15 minutes after midnight', () => {
    const b = body({ challengeDate: '2026-09-24' });
    assert.equal(check(b, Date.parse('2026-09-25T00:10:00Z')).ok, true);
    assert.equal(check(b, Date.parse('2026-09-25T00:15:00Z')).ok, true);
    assert.equal(check(b, Date.parse('2026-09-25T00:15:01Z')).code, 'challenge_closed');
});

test('validateRun: a daily run cannot have started before the challenge opened', () => {
    const at = Date.parse('2026-09-24T00:00:30Z');
    const r = check(body({ durationMs: 120000 }), at);
    assert.equal(r.code, 'implausible_run');
    assert.equal(check(body({ durationMs: 65000 }), at).ok, true, '60 s clock slack');
});

test('challengeWindow', () => {
    assert.equal(challengeWindow('2026-09-24', NOW), 'open');
    assert.equal(challengeWindow('2026-09-25', NOW), 'future');
    assert.equal(challengeWindow('2026-09-23', NOW), 'closed');
    assert.equal(challengeWindow('2026-09-23', Date.parse('2026-09-24T00:05:00Z')), 'grace');
    assert.equal(challengeWindow('2026-09-30', Date.parse('2026-10-01T00:05:00Z')), 'grace');
});

test('sanitizeName and displayName', () => {
    assert.equal(sanitizeName('  Bull  Run  '), 'Bull Run');
    assert.equal(sanitizeName('a.b-c_d 1'), 'a.b-c_d 1');
    assert.equal(sanitizeName('x'.repeat(16)), 'x'.repeat(16));
    assert.equal(sanitizeName('x'.repeat(17)), null);
    assert.equal(sanitizeName('bad<b>'), null);
    assert.equal(sanitizeName('émoji🐂'), null);
    assert.equal(sanitizeName('tab\there'), null);
    assert.equal(sanitizeName('   '), null);
    assert.equal(sanitizeName(''), null);
    assert.equal(sanitizeName(42), null);
    assert.equal(sanitizeName(undefined), null);
    assert.equal(displayName('Bull', PID), 'Bull');
    assert.equal(displayName(null, PID), 'anon-3b24');
});

test('isUuidV4', () => {
    assert.ok(isUuidV4(PID));
    assert.ok(isUuidV4(PID.toUpperCase()));
    assert.ok(!isUuidV4(`${PID}0`));
    assert.ok(!isUuidV4('3b241101-e2bb-3255-8caf-4136c566a962'), 'version nibble');
    assert.ok(!isUuidV4('3b241101-e2bb-4255-7caf-4136c566a962'), 'variant nibble');
});

test('newId is 17 base36 chars and sorts by creation time', () => {
    const a = newId(Date.parse('2026-09-24T00:00:00Z'));
    const b = newId(Date.parse('2026-09-24T00:00:00.001Z'));
    const c = newId(Date.parse('2030-01-01T00:00:00Z'));
    for (const id of [a, b, c, newId()]) assert.match(id, RUN_ID);
    assert.ok(a < b && b < c);
    const same = new Set(Array.from({ length: 1000 }, () => newId(NOW)));
    assert.equal(same.size, 1000, 'random tail separates ids from the same millisecond');
});

test('decodeBase64Url round-trips and rejects junk', () => {
    const bytes = Uint8Array.from({ length: 300 }, (_, i) => (i * 37) % 256);
    for (const len of [1, 2, 3, 4, 299, 300]) {
        const enc = Buffer.from(bytes.subarray(0, len)).toString('base64url');
        assert.deepEqual([...decodeBase64Url(enc)], [...bytes.subarray(0, len)]);
    }
    assert.equal(decodeBase64Url('abc='), null, 'padding is not base64url');
    assert.equal(decodeBase64Url('a b'), null);
    assert.equal(decodeBase64Url(''), null);
    assert.equal(decodeBase64Url(null), null);
});

test('readJson enforces the byte cap and parses JSON', async () => {
    const req = (bodyText, headers = {}) =>
        new globalThis.Request('https://x.test/api/runs', {
            method: 'POST',
            body: bodyText,
            headers
        });
    const ok = await readJson(req('{"a":1}'), 100);
    assert.deepEqual(ok.data, { a: 1 });
    const big = await readJson(req('x'.repeat(101)), 100);
    assert.equal(big.error.status, 413);
    const lied = await readJson(req('{}', { 'content-length': String(MAX_BODY_BYTES + 1) }), 100);
    assert.equal(lied.error.status, 413);
    const junk = await readJson(req('{nope'), 100);
    assert.equal(junk.error.status, 400);
    assert.equal((await junk.error.json()).error.code, 'invalid_json');
});
