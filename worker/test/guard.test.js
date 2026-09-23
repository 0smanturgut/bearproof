import test from 'node:test';
import assert from 'node:assert/strict';
import { ipKey, underLimit, verifyTurnstile } from '../src/lib/guard.js';

test('ipKey is a stable, IP-specific hash (the raw IP never becomes a key)', async () => {
    const a = await ipKey('203.0.113.7');
    assert.match(a, /^[0-9a-f]{32}$/);
    assert.equal(a, await ipKey('203.0.113.7'));
    assert.notEqual(a, await ipKey('203.0.113.8'));
    assert.ok(!a.includes('203'));
});

test('underLimit checks every key and fails open on limiter errors', async () => {
    const seen = [];
    const limiter = (blocked) => ({
        limit: async ({ key }) => {
            seen.push(key);
            if (key === 'boom') throw new Error('limiter down');
            return { success: key !== blocked };
        }
    });
    assert.equal(await underLimit(limiter(null), 'p:1', 'ip:1'), true);
    assert.deepEqual(seen.splice(0), ['p:1', 'ip:1']);
    assert.equal(await underLimit(limiter('ip:1'), 'p:1', 'ip:1'), false);
    assert.equal(await underLimit(limiter(null), 'boom'), true);
    assert.equal(await underLimit(undefined, 'p:1'), true, 'no binding configured');
});

test('verifyTurnstile: skipped without a secret, failed without a token', async () => {
    assert.equal(await verifyTurnstile({}, 'tok', '1.2.3.4'), 'skipped');
    assert.equal(await verifyTurnstile({ TURNSTILE_SECRET: 's' }, null, '1.2.3.4'), 'failed');
});
