import test from 'node:test';
import assert from 'node:assert/strict';
import { rpc, rpcUrls } from '../src/lib/rpc.js';

const reply = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => (typeof body === 'string' ? JSON.parse(body) : body)
});

test('endpoint order: SOLANA_RPC, Helius, then the public ones', () => {
    const urls = rpcUrls({ SOLANA_RPC: 'https://a', HELIUS_API_KEY: 'k' });
    assert.equal(urls[0], 'https://a');
    assert.match(urls[1], /helius-rpc\.com\/\?api-key=k$/);
    assert.ok(urls.length >= 4);
});

test('a 429 is retried, then the next endpoint answers', async () => {
    const calls = [];
    const fetchFn = async (url) => {
        calls.push(url);
        return url.includes('publicnode') ? reply(429, {}) : reply(200, { result: { value: 7 } });
    };
    const out = await rpc({}, 'getBalance', ['W'], { fetchFn, backoffMs: 0 });
    assert.deepEqual(out, { value: 7 });
    assert.equal(
        calls.filter((u) => u.includes('publicnode')).length,
        2,
        'one retry on the same endpoint'
    );
});

test('RPC errors fall through; when every endpoint fails the last error is thrown', async () => {
    const fetchFn = async () => reply(200, { error: { message: 'paid plans only' } });
    await assert.rejects(
        rpc({}, 'getBalance', ['W'], { fetchFn, backoffMs: 0 }),
        /paid plans only/
    );
    const flaky = async () => {
        throw new Error('network down');
    };
    await assert.rejects(
        rpc({}, 'getBalance', ['W'], { fetchFn: flaky, backoffMs: 0 }),
        /network down/
    );
});
