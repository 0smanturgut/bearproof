/**
 * Public notes on ledger rows the chain can't label by itself. The ledger syncs the treasury only, and it reads any
 * send to the costs wallet as a compute (or hosting) reimbursement. When money goes through the costs wallet for
 * something else, it is relabelled here by transaction signature, and the onward transfer (which the sync doesn't
 * see) is listed here too. Every entry is a real transaction, checked on-chain before it's added; docs/TREASURY.md
 * says why each one exists.
 */
export const LEDGER_NOTES = {
    // signature -> { category, memo }
    relabel: {},
    // [{ tx, ts (ISO), direction, amountSol, category, memo }]
    extra: []
};

/** Apply the notes to /api/ledger entries (newest first). Pure, so it's testable. */
export function applyNotes(entries, notes = LEDGER_NOTES) {
    const out = entries.map((e) => {
        const n = e.tx && notes.relabel[e.tx];
        return n ? { ...e, category: n.category, memo: n.memo } : e;
    });
    for (const x of notes.extra) {
        if (out.some((e) => e.tx === x.tx)) continue;
        out.push({
            ts: x.ts,
            direction: x.direction,
            category: x.category,
            amountSol: x.amountSol,
            tokenMint: null,
            tokenAmount: null,
            tokenAmountRaw: null,
            usdEstimate: null,
            memo: x.memo,
            tx: x.tx,
            solscan: `https://solscan.io/tx/${encodeURIComponent(x.tx)}`,
            source: 'operator',
            measured: true
        });
    }
    return out.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
}
