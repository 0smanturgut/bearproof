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
