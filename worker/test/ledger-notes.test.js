import test from 'node:test';
import assert from 'node:assert/strict';
import { applyNotes } from '../src/lib/ledger-notes.js';

test('ledger notes: relabel by signature, add the onward transfer, keep newest first', () => {
    const entries = [
        {
            ts: '2026-09-26T02:00:00.000Z',
            category: 'compute',
            memo: 'compute reimbursement',
            tx: 'A',
            amountSol: 1
        },
        {
            ts: '2026-09-26T00:17:16.000Z',
            category: 'compute',
            memo: 'compute reimbursement',
            tx: 'B',
            amountSol: 0.07
        }
    ];
    const notes = {
        relabel: { A: { category: 'marketing', memo: 'marketing: paid post (1 of 2)' } },
        extra: [
            {
                tx: 'C',
                ts: '2026-09-26T02:05:00.000Z',
                direction: 'out',
                amountSol: 1,
                category: 'marketing',
                memo: 'paid on'
            }
        ]
    };
    const out = applyNotes(entries, notes);
    assert.deepEqual(
        out.map((e) => e.tx),
        ['C', 'A', 'B']
    );
    assert.equal(out[1].category, 'marketing');
    assert.equal(out[2].category, 'compute', 'other rows untouched');
    assert.match(out[0].solscan, /solscan\.io\/tx\/C$/);
    assert.equal(applyNotes(entries).length, 2, 'no notes, no change');
});

test('ledger notes: the 1 and 3 Oct sends to the operator say who took them and whose statement the purpose is', () => {
    const sigs = [
        'qncm3YHKRu48HAuTUN565VEdccvjqJaXai2mA4fZSGccSiWTZ6b5RWGBUg7MGghPPN1BGStiYS18K4FgytqRB3L',
        '22AkZ7xWcss9EtKgeZojffyqu9G61EGWScN5L6NZbKfTb1XteT3BxTRYYWAnXFuc73ELT7Brsd9fqUrazgxXry5M',
        '4VxVbnHi3ie5V4vbJPM2WA6bTfBjKjFfXCRkHs7WXUGRQyb7Tv9N7WyqnWVHquDY4n9M5XA2SiibhF64382ym7Bs',
        '52463o9P613ffUv8UrMCt13qbVCwKNbWY3K4DbYncEXYK1TBnS7CePsLmLedkvRPv62GWtyEFghU5u677PjQvzCG'
    ];
    const out = applyNotes(
        sigs.map((tx, i) => ({
            ts: `2026-10-0${i ? 3 : 1}T21:0${i}:00.000Z`,
            category: 'other',
            memo: 'outgoing to …',
            tx,
            amountSol: 1
        }))
    );
    for (const e of out) {
        assert.equal(e.category, 'reimbursement');
        assert.match(e.memo, /^operator reimbursement: /);
        assert.match(e.memo, /operator(’s)? .*own wallet/, 'names the recipient as the operator');
        assert.match(e.memo, /He says|his statement/, 'the purpose is attributed, not asserted');
    }
});

test('ledger notes: the 5 Oct top-up that went through another wallet says where each part of it is', () => {
    const tx =
        '4DhzYbY2Ak2GuMaPkq4KPqcV6kjLkYqjGDrXaxDwvvLnKySMPRckDDzkJ9VvzQ8LcEMxL1RurPmfyumHBrPY26hf';
    const [e] = applyNotes([
        {
            ts: '2026-10-05T20:19:08.000Z',
            category: 'other',
            memo: 'outgoing to 21NB…SnKb',
            tx,
            amountSol: 0.270694231
        }
    ]);
    assert.equal(
        e.category,
        'other',
        'not all of it reached the prize wallet, so it isn’t filed as a sweep'
    );
    assert.match(
        e.memo,
        /^prize wallet top-up, sent through a new wallet of the operator’s \(21NB…SnKb\)/
    );
    assert.match(e.memo, /0\.2 SOL reached the prize wallet/);
    assert.match(e.memo, /0\.05 SOL went to another new address \(3A2h…BybK\)/);
    assert.match(e.memo, /0\.0207 SOL stayed in 21NB…SnKb/);
    // The three parts are the whole send (less the 0.000005 SOL fee the treasury paid).
    assert.equal(Math.round((0.2 + 0.05 + 0.0207) * 1e4), Math.round(0.270689231 * 1e4));
});

test('ledger notes: the 4 Oct out-and-back is told on both rows, without a purpose nobody gave', () => {
    const out = applyNotes([
        {
            ts: '2026-10-04T21:36:41.000Z',
            category: 'other',
            memo: 'incoming from 3hup…f7Q8',
            tx: '3StCepSeeWGfeJtBUEY7gAAJsuytM9QYsJLqemfKyCxKEyYK8FGu94oNBizBUdDkKRxxWvWcsCjqF9DpEexWL67H',
            amountSol: 0.2
        },
        {
            ts: '2026-10-04T16:53:29.000Z',
            category: 'other',
            memo: 'outgoing to 3hup…f7Q8',
            tx: '2b8AT4VtREWwajUraUj1LgWEnbftPsnVmKGkFJ5zedCbJzFaJWbQTufuAxEbjth7MogHg9QpauAezk6Yu63xZRD6',
            amountSol: 0.200005
        }
    ]);
    for (const e of out) {
        assert.equal(e.category, 'other');
        assert.match(e.memo, /^out and back: /);
        assert.match(e.memo, /operator’s own wallet \(3hup…f7Q8\)/);
        assert.equal(/reimburs|pays? him back/i.test(e.memo), false);
    }
    assert.match(out[1].memo, /sent 0\.2 SOL back at 21:36 UTC the same day/);
});
