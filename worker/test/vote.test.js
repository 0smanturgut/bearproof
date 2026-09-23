import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { base58 } from '../../scripts/new-wallet.mjs';
import {
    base58Decode,
    isWallet,
    pollWindow,
    tally,
    verifySignature,
    voteMessage,
    voteWeight
} from '../src/lib/vote.js';

test('vote weight is floor(sqrt(tokens)) above the minimum', () => {
    assert.equal(voteWeight(999), 0);
    assert.equal(voteWeight(1000), 31);
    assert.equal(voteWeight(1_000_000), 1000);
    assert.equal(voteWeight(100_000_000), 10000, '100x the tokens = 10x the say');
    assert.equal(voteWeight(NaN), 0);
});

test('base58 round trip and wallet shape', () => {
    const bytes = Uint8Array.from({ length: 32 }, (_, i) => (i * 37) & 0xff);
    assert.deepEqual(Array.from(base58Decode(base58(bytes))), Array.from(bytes));
    assert.ok(isWallet('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'));
    assert.ok(!isWallet('0OIl-not-base58'));
    assert.ok(!isWallet('abc'));
});

test('a real ed25519 signature over the exact message verifies; anything else fails', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const wallet = base58(publicKey.export({ format: 'der', type: 'spki' }).subarray(-32));
    const fields = {
        domain: 'bearproof.example',
        wallet,
        proposalId: 'rug-lord-phase-2',
        forBuild: 2,
        pollDate: '2026-09-24',
        nonce: 'abc12345',
        issuedAt: '2026-09-24T08:00:00.000Z'
    };
    const msg = voteMessage(fields);
    assert.match(msg, /sends no transaction and moves no funds/);
    const sig = base58(sign(null, Buffer.from(msg), privateKey));
    assert.equal(await verifySignature(wallet, msg, sig), true);
    assert.equal(
        await verifySignature(wallet, voteMessage({ ...fields, proposalId: 'other' }), sig),
        false
    );
    assert.equal(
        await verifySignature(wallet, voteMessage({ ...fields, domain: 'evil.example' }), sig),
        false
    );
    assert.equal(await verifySignature(wallet, msg, sig.slice(0, -2) + '11'), false);
});

test('tally shares and winner; poll closes 21:00 UTC', () => {
    const props = [
        { id: 'a', title: 'A' },
        { id: 'b', title: 'B' },
        { id: 'c', title: 'C' }
    ];
    const t = tally(props, [
        { proposal_id: 'a', weight: 31 },
        { proposal_id: 'b', weight: 1000 },
        { proposal_id: 'a', weight: 31 },
        { proposal_id: 'zzz', weight: 5000 }
    ]);
    assert.equal(t.totalWeight, 1062);
    assert.equal(t.winner.id, 'b');
    assert.equal(t.proposals.find((p) => p.id === 'a').voters, 2);
    assert.equal(tally(props, []).winner, null);
    const w = pollWindow('2026-09-24');
    assert.equal(new Date(w.close).toISOString(), '2026-09-24T21:00:00.000Z');
});
