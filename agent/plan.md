# Build #5 plan: the AI's bounty ("Triple Top")

## Feature

Holders picked the operator's option `op-daily-pot` (1 wallet voted). Osman's note for Build #5 says my part is the
bounty, in the game. The prize rules, pot, payouts and verification are Worker code outside my paths.

- `game/bounty.json`: `{ "type": "bosses", "bosses": 3, "name": "Triple Top" }`. Condition text, as
  `bountyText` words it: "Defeat 3 bosses".
- Title screen, inside the Daily Challenge card: the bounty name, the condition, "Daily Challenge runs only", and
  the money line word for word: "Clear it to share today's bounty in $ANSEM."
- HUD during a Daily run only: a small chip under the timer ("BOUNTY 1/3 BOSSES"), turning green when cleared,
  plus a "BOUNTY CLEARED" toast the moment it clears. Nothing over the play area.
- End screen: a receipt row "BOUNTY": cleared or missed. After a cleared, rankable Daily run, the exact line
  "Bounty cleared. Paid after 00:10 UTC if the run verifies and you left a Solana address."
- Share text: one extra line on a cleared Daily run, "Cleared the AI's bounty: Triple Top".
- No simulation change: the bounty only reads `sim.summary()` fields. No `SIM_VERSION` bump.

## Why this bounty

Build #4 players: 66 verified runs, 1.33 boss kills per run, median 8:30, p75 11:50, 3 wins. Bosses arrive at 5:00,
7:30 and 10:00 on every stage (Bear Trap earlier), with the final at 12:00. Three boss kills means beating
Liquidation (or the Long Winter), so a run has to reach about 10:30 and kill all three. That's well above the
average run, and a good run can do it. "Win" (3 of 66 runs) is too rare; "Survive to 10:00" would be cleared by
most regulars.

## Files

- `game/bounty.json` (new).
- `game/src/bounty.js` (new, pure): menu copy, `readBounty`, `bountyText`, `clearsBounty(summary)`,
  `bountyProgress`.
- `game/src/api.js`: `getBounty()` loads `./bounty.json`.
- `game/src/main.js`: load it, show it on the Daily card.
- `game/src/game.js`: HUD tracking, the toast, end screen, share line.
- `game/src/ui.js`, `game/index.html`, `game/styles.css`: the card line, the HUD chip, the receipt row.
- `game/src/share.js`: the optional bounty line.
- `game/test/bounty.test.js`: validate `game/bounty.json` with the Worker's `checkBounty`, compare my check with
  `clearsBounty` on runs mapped the way the verifier's `runStats` maps them, including real simulated runs.

## Test

Unit tests above. `npm run check`, smoke shots (title card, HUD during a daily), playtest compare (should be
identical: no sim change), determinism on chromium.
