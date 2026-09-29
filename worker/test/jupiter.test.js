import test from 'node:test';
import assert from 'node:assert/strict';
import { jupiter } from '../src/lib/solana.js';

function withFetch(replies, fn) {
    const real = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url) => {
        calls.push(url);
        const [status, body] = replies[Math.min(calls.length, replies.length) - 1];
        return new Response(body, { status });
    };
    return fn(calls).finally(() => (globalThis.fetch = real));
}

test('jupiter: a rate limit is asked again, and the answer comes back as JSON', () =>
    withFetch(
        [
            [429, 'Rate limit exceeded'],
            [200, '{"outAmount":"5"}']
        ],
        async (calls) => {
            assert.deepEqual(await jupiter('https://j/quote', undefined, [0, 0]), {
                outAmount: '5'
            });
            assert.equal(calls.length, 2);
        }
    ));

test('jupiter: still busy after the retries throws a transient error (not a failed swap)', () =>
    withFetch([[429, 'Rate limit exceeded']], async (calls) => {
        const err = await jupiter('https://j/quote', undefined, [0, 0]).catch((e) => e);
        assert.equal(err.transient, true);
        assert.match(err.message, /jupiter: busy \(HTTP 429: Rate limit/);
        assert.equal(calls.length, 3);
    }));

test('jupiter: an answer with an error in it (no route) is returned, not retried', () =>
    withFetch([[400, '{"error":"no route"}']], async (calls) => {
        assert.deepEqual(await jupiter('https://j/quote', undefined, [0, 0]), {
            error: 'no route'
        });
        assert.equal(calls.length, 1);
    }));
