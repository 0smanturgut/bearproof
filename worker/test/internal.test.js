import test from 'node:test';
import assert from 'node:assert/strict';
import { authorized } from '../src/routes/internal.js';

const req = (auth) =>
    new Request('https://x/api/internal/runs/pending', {
        headers: auth ? { authorization: auth } : {}
    });

test('internal endpoints need the exact bearer token', () => {
    const env = { INGEST_TOKEN: 'secret-token' };
    assert.equal(authorized(req('Bearer secret-token'), env), true);
    assert.equal(authorized(req('Bearer secret-tokeN'), env), false);
    assert.equal(authorized(req('Bearer secret-token-extra'), env), false);
    assert.equal(authorized(req('secret-token'), env), false);
    assert.equal(authorized(req(null), env), false);
    assert.equal(authorized(req('Bearer '), env), false);
    assert.equal(authorized(req('Bearer x'), {}), false, 'no token configured = closed');
});
