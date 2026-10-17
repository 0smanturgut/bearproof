import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { base58 } from '../../scripts/new-wallet.mjs';
import { readFileSync } from 'node:fs';
import {
    OPEN_VOTE_FROM,
    base58Decode,
    countedRows,
    isOpenPoll,
    isVoterId,
    isWallet,
    operatorOptions,
    pollWindow,
    tally,
    verifySignature,
    voteMessage,
    voteWeight,
    voterKey
} from '../src/lib/vote.js';
import { fakeD1 } from './helpers/d1.js';

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

test("operator options: labelled 'operator', only for their poll date, malformed ones dropped", () => {
    const file = {
        polls: {
            '2026-09-26': [
                { id: 'op-daily-pot', title: 'Daily Pot title', description: 'Details.' },
                { id: 'req-0123456789', title: 'Looks like a holder id', description: '' },
                { id: 'op-long', title: 'x'.repeat(61), description: '' },
                { id: 'op-desc', title: 'Too much text', description: 'y'.repeat(241) },
                {
                    id: 'op-origin',
                    title: 'With its story',
                    description: 'Details.',
                    origin: 'Asked on X',
                    note: 'Players asked. A human put it to the vote.',
                    why: 'kept in git, not served'
                },
                {
                    id: 'op-bad-origin',
                    title: 'Origin too long',
                    description: '',
                    origin: 'z'.repeat(25)
                },
                { id: 'op-bad-note', title: 'Note not text', description: '', note: 42 },
                null
            ]
        }
    };
    assert.deepEqual(operatorOptions(file, '2026-09-26'), [
        {
            id: 'op-daily-pot',
            title: 'Daily Pot title',
            description: 'Details.',
            source: 'operator'
        },
        {
            id: 'op-origin',
            title: 'With its story',
            description: 'Details.',
            source: 'operator',
            origin: 'Asked on X',
            note: 'Players asked. A human put it to the vote.'
        }
    ]);
    assert.deepEqual(operatorOptions(file, '2026-09-27'), []);
    assert.deepEqual(operatorOptions(null, '2026-09-26'), []);
});

test('agent/operator-options.json: every entry is a valid, uniquely named operator option', () => {
    const file = JSON.parse(
        readFileSync(new URL('../../agent/operator-options.json', import.meta.url), 'utf8')
    );
    const ids = new Set();
    for (const [date, list] of Object.entries(file.polls)) {
        assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
        assert.equal(
            operatorOptions(file, date).length,
            list.length,
            `${date}: an entry was dropped`
        );
        for (const o of list) {
            assert.ok(!ids.has(o.id), `${o.id} is used twice`);
            ids.add(o.id);
        }
    }
});

test('open polls: from the 18 Oct ballot anyone votes, one vote each (D74)', () => {
    assert.equal(OPEN_VOTE_FROM, '2026-10-18');
    assert.equal(
        isOpenPoll('2026-10-17'),
        false,
        'the holder ballot of 17 Oct keeps its rule to the close'
    );
    assert.equal(isOpenPoll('2026-10-18'), true);
    assert.equal(isOpenPoll('2027-01-01'), true);
    assert.equal(isOpenPoll(undefined), false);
    assert.ok(isVoterId('abc123def456ghi789jk'));
    assert.ok(!isVoterId('short'));
    assert.ok(!isVoterId('UPPERCASE1234567890'));
    assert.ok(
        !isVoterId('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
        'a wallet is not a voter id'
    );
    assert.ok(
        !isWallet(voterKey('abc123def456ghi789jk')),
        'an open vote never looks like a wallet'
    );
});

test('open polls count every vote as one, whatever weight was stored', () => {
    const options = [
        { id: 'a', title: 'A' },
        { id: 'b', title: 'B' }
    ];
    // One whale wallet vote (cast before the switch reached the poll) and two open votes.
    const rows = [
        { proposal_id: 'a', weight: 3162 },
        { proposal_id: 'b', weight: 1 },
        { proposal_id: 'b', weight: 1 }
    ];
    const open = tally(options, countedRows('2026-10-18', rows));
    assert.equal(open.winner.id, 'b');
    assert.equal(open.totalWeight, 3);
    assert.deepEqual(
        open.proposals.map((p) => p.share),
        [33.3, 66.7]
    );
    const holders = tally(options, countedRows('2026-10-17', rows));
    assert.equal(holders.winner.id, 'a', 'a holder ballot keeps √tokens weights');
});

test('votes table takes open votes: one row per device, a change is an update, the cap counts others', () => {
    const d1 = fakeD1();
    const upsert = d1.db.prepare(
        `INSERT INTO votes (poll_date, wallet, proposal_id, weight, balance_raw, signature, created_at, ip_key)
         VALUES (?1, ?2, ?3, 1, '0', 'open', ?4, ?5)
         ON CONFLICT (poll_date, wallet) DO UPDATE SET proposal_id = excluded.proposal_id,
             created_at = excluded.created_at, ip_key = excluded.ip_key`
    );
    const me = voterKey('abc123def456ghi789jk');
    upsert.run('2026-10-18', me, 'a', 1, 'ip1');
    upsert.run('2026-10-18', me, 'b', 2, 'ip1');
    upsert.run('2026-10-18', voterKey('zzz123def456ghi789jk'), 'a', 3, 'ip1');
    const rows = d1.db
        .prepare('SELECT wallet, proposal_id FROM votes WHERE poll_date = ?')
        .all('2026-10-18');
    assert.equal(rows.length, 2, 'changing a vote does not add one');
    assert.equal(rows.find((r) => r.wallet === me).proposal_id, 'b');
    const others = d1.db
        .prepare(
            'SELECT COUNT(*) AS n FROM votes WHERE poll_date = ?1 AND ip_key = ?2 AND wallet != ?3'
        )
        .get('2026-10-18', 'ip1', me);
    assert.equal(others.n, 1);
});
