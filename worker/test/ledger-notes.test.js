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
