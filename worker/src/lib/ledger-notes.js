/**
 * Public notes on ledger rows the chain can't label by itself. The ledger syncs the treasury only, and it reads any
 * send to the costs wallet as a compute (or hosting) reimbursement. When money goes through the costs wallet for
 * something else, it is relabelled here by transaction signature, and the onward transfer (which the sync doesn't
 * see) is listed here too. Every entry is a real transaction, checked on-chain before it's added; docs/TREASURY.md
 * says why each one exists.
 */
export const LEDGER_NOTES = {
    // signature -> { category, memo }
    relabel: {
        // 27 Sep 19:38 UTC, 2 SOL from the treasury to 28Rp…NeE4, sent by the operator in the ClawPump dashboard.
        '4FfCJ9zTZRRYfhkJHvFM99TyN6pvzh4mbeMA8QCHeqr5N4wVeLaFmgJ9DccFN73a8uzgVj2PYfukvdPY36Y9PEfF':
            {
                category: 'marketing',
                memo: 'paid promotion: the operator paid @Mihawk_Research for a sponsored post about BEARPROOF on X (labelled 28 Sep)'
            },
        // 29 Sep 10:58 UTC, 0.1 SOL from the treasury for 1,107,008 $BPROOF, made by the operator through ClawPump.
        // Synced before the classifier knew buybacks, so it read "coin launch · launch buy".
        '3wdsVG5nENQgHLioYnDuy1Uf8fWNQThs1smsz4cNE1Tuj1RUYW3njgYWfmhzx62sTiPuMpJT3SvVtH2Hbp9m9xCH':
            {
                category: 'buyback',
                memo: 'buyback: the treasury bought 1,107,008 $BPROOF (0.11% of supply) for 0.1 SOL; the operator made it through ClawPump, and the tokens are held in the treasury wallet'
            }
    },
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
