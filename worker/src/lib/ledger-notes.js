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
            },
        // 1 Oct 19:33 UTC and 3 Oct 21:06–21:14 UTC: four sends from the treasury to the operator's own wallets,
        // made by him in the ClawPump dashboard. On 4 Oct he said he took them to pay himself back for the bills he
        // had covered since day 1. The amounts are on-chain; the purpose is his statement (docs/TREASURY.md).
        qncm3YHKRu48HAuTUN565VEdccvjqJaXai2mA4fZSGccSiWTZ6b5RWGBUg7MGghPPN1BGStiYS18K4FgytqRB3L: {
            category: 'reimbursement',
            memo: 'operator reimbursement: the operator sent 1 SOL from the treasury to his own wallet (3iu3…cjoD), by hand. He says it pays him back for the project bills he covered out of pocket; of those, only AI compute is measured (labelled 4 Oct)'
        },
        '22AkZ7xWcss9EtKgeZojffyqu9G61EGWScN5L6NZbKfTb1XteT3BxTRYYWAnXFuc73ELT7Brsd9fqUrazgxXry5M':
            {
                category: 'reimbursement',
                memo: 'operator reimbursement: 0.01 SOL from the treasury to the operator’s own wallet (3hup…f7Q8), by hand; same purpose as the 1 Oct row, by his statement (labelled 4 Oct)'
            },
        '4VxVbnHi3ie5V4vbJPM2WA6bTfBjKjFfXCRkHs7WXUGRQyb7Tv9N7WyqnWVHquDY4n9M5XA2SiibhF64382ym7Bs':
            {
                category: 'reimbursement',
                memo: 'operator reimbursement: 0.2 SOL from the treasury to the operator’s own wallet (28Rp…NeE4, where the 27 Sep send also went), by hand; same purpose as the 1 Oct row, by his statement (labelled 4 Oct)'
            },
        '52463o9P613ffUv8UrMCt13qbVCwKNbWY3K4DbYncEXYK1TBnS7CePsLmLedkvRPv62GWtyEFghU5u677PjQvzCG':
            {
                category: 'reimbursement',
                memo: 'operator reimbursement: 0.0621 SOL from the treasury to the operator’s own wallet (4fmU…N2tA), by hand; same purpose as the 1 Oct row, by his statement. It left 0.002 SOL in the treasury (labelled 4 Oct)'
            },
        // 5 Oct 00:39 UTC: the first Streamflow lock had released 24,798,035.65 $BPROOF to the treasury at 00:22 UTC.
        // The operator moved all of the treasury's tokens and 0.2 SOL to a new wallet, 25FF…L3Vv, which locked
        // 25,776,163.15 in Streamflow (BhKhjz…kuyT) at 00:44:52 UTC, until 31 Dec 2026 21:00 UTC; he said the
        // ClawPump treasury wallet returned an error when he tried to lock from it. Checked on-chain: sender =
        // recipient = 25FF…L3Vv, not cancellable, not transferable.
        ocgVEDrL1CqHBL6bKgDcu2ajnVPyVyt5yu5ZxRRHikjPVqq2E9TSnRTYr2cCj4fQyQ6skZPXPvSFbzQxuDsicjQ: {
            category: 'launch',
            memo: 're-lock: the operator moved all of the treasury’s $BPROOF (25,905,043.96: the launch buy the first lock released at 00:22 UTC, and the 29 Sep buyback) to a new wallet he made for this (25FF…L3Vv), because the ClawPump treasury wallet couldn’t create a lock. At 00:44 UTC that wallet locked 25,776,163.15 in Streamflow until 31 Dec 2026, 21:00 UTC; it can’t be cancelled or transferred (labelled 5 Oct)'
        },
        '4GRMNNvGfZ7RoDQdoEFua5WEbh35VP7BHmGbvbbWFfyZAguzF5XVHoDX6TFJPHd4ZqRcfwSMYTo4cjBSgjqTwoRC':
            {
                category: 'launch',
                memo: 're-lock: 0.2 SOL to the same new wallet (25FF…L3Vv) for the lock’s fees; Streamflow took 0.168 SOL, and 0.032 SOL was still in that wallet at 00:51 UTC (labelled 5 Oct)'
            },
        // 4 Oct 16:53 UTC, 0.2 SOL from the treasury to the operator's own wallet 3hup…f7Q8, in the ClawPump
        // dashboard; 21:36 UTC the same day, 0.2 SOL from that wallet back to the treasury. Both checked on-chain.
        // The operator has given no purpose, so the rows say only what the chain shows.
        '2b8AT4VtREWwajUraUj1LgWEnbftPsnVmKGkFJ5zedCbJzFaJWbQTufuAxEbjth7MogHg9QpauAezk6Yu63xZRD6':
            {
                category: 'other',
                memo: 'out and back: 0.2 SOL from the treasury to the operator’s own wallet (3hup…f7Q8), by hand. That wallet sent 0.2 SOL back at 21:36 UTC the same day, so the treasury is down only the 0.000005 SOL network fee (labelled 6 Oct)'
            },
        '3StCepSeeWGfeJtBUEY7gAAJsuytM9QYsJLqemfKyCxKEyYK8FGu94oNBizBUdDkKRxxWvWcsCjqF9DpEexWL67H':
            {
                category: 'other',
                memo: 'out and back: the 0.2 SOL that went to the operator’s own wallet (3hup…f7Q8) at 16:53 UTC, sent back by that wallet (labelled 6 Oct)'
            },
        // 5 Oct 20:19 UTC, 0.2707 SOL from the treasury to 21NB…SnKb, a wallet first funded by 3hup…f7Q8 that
        // day at 15:43 UTC. The operator said he was sending money to the prize wallet. On-chain: 21NB…SnKb sent
        // 0.05 SOL to 3A2h…BybK (a new address with no other transaction) at 20:19:28 UTC and 0.2 SOL to the prize
        // wallet at 21:38:30 UTC; the cron paid the waiting 4 Oct Daily Pot at 21:45 UTC. docs/TREASURY.md.
        '4DhzYbY2Ak2GuMaPkq4KPqcV6kjLkYqjGDrXaxDwvvLnKySMPRckDDzkJ9VvzQ8LcEMxL1RurPmfyumHBrPY26hf':
            {
                category: 'other',
                memo: 'prize wallet top-up, sent through a new wallet of the operator’s (21NB…SnKb) instead of straight to the prize wallet. 0.2 SOL reached the prize wallet at 21:38 UTC, and the 4 Oct Daily Pot that was waiting for it was paid at 21:45 UTC. The other 0.0707 SOL had not reached it by 6 Oct, 00:20 UTC: 0.05 SOL went to another new address (3A2h…BybK) at 20:19 UTC, and 0.0207 SOL stayed in 21NB…SnKb (labelled 6 Oct)'
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
