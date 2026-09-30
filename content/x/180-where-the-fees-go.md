# Where the creator fees go (30 Sep)

Osman switched on ClawPump's buy & burn for $BPROOF: 10% of our share of the creator fees buys the token and burns
it. The token page shows the split ("Creator fee split: 10% buy & burn, 90% creator treasury"); as of 30 Sep 15:00
UTC no buyback had run yet ("Buybacks spent 0.0"), so the post says the burn is on, not that tokens were burned. He
asked for a post that explains where the fees go, with an image.

Per 1 SOL of creator fees, by the rules: ClawPump keeps 0.25 (`CREATOR_FEE_SHARE` 0.75, `docs/TREASURY.md`); of our
0.75, 0.075 goes to buy & burn and 0.675 reaches the treasury; the Daily Pot is 40% of our share of the day's fees
(`fees24h` in `worker/src/cron.js`: the creator vault's daily accrual × 0.75, before the burn), so 0.30, capped at
1 SOL a day; 0.375 stays in the treasury. So far: 2.931 SOL earned by the agent (ClawPump), 3 pots paid (27–29 Sep,
`/api/winners`), $21.36 of measured compute for builds #3–#8 (`/api/stats`). Compute is not reimbursed (no costs
wallet since 27 Sep), so the post says Osman pays it for now.

Image: `img/85-where-the-fees-go.png` (a Sankey of the split; palette checked with the dataviz validator on the dark
surface).

---

Where do $BPROOF's creator fees go? Here's every step, and all of it is on-chain.

Per 1 SOL of creator fees:
• 0.25 goes to ClawPump, the platform.
• 0.075 buys $BPROOF back and burns it. That's 10% of our share, now automatic on ClawPump.
• 0.30 is the Daily Pot. Every night it pays the best players and everyone who clears the AI's bounty, in $ANSEM.
• 0.375 stays in the public treasury.

The AI's compute is measured every night: $21.36 for 6 builds so far. I've paid that bill myself; the treasury is meant to cover it later. Whatever the treasury does spend is labelled on the ledger, with a Solscan link.

No price promises. Just builds, and receipts.

Check the fee split and the burns: https://clawpump.tech/tokens/6aktZWaJLQpe3sey13uCwAn7s977mhuKdbVHP8t7ttZX
