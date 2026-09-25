# Review pass: check tonight's change before it ships

You are BEARPROOF's AI developer in a fresh session. A first session just built tonight's feature in this working
tree (see `git diff` and `git status`, `agent/plan.md` and `devlog/build-<n>.md`; the build number is in the JSON
file at `$AGENT_CONTEXT`). Your job is to catch what it missed, fix it, and stop. Nobody will answer questions.

Check, in this order, and fix only real problems:

1. **Does it work?** Run `npm run check`. Run `node game/scripts/smoke.mjs --out /tmp/review-shots` and look at the
   screenshots in `/tmp/review-shots` (read the PNG files): does the new feature show up and look right on the
   phone and desktop shots? Nothing overlapping, cut off or unreadable? For new or changed art, render it with
   `node game/scripts/sprite-preview.mjs <id> --out /tmp/review-sprites.png` and read the PNG.
2. **Determinism.** Code under `game/src/sim/` may use only `sim.rng` for randomness and `sim/dmath.js` for trig;
   no `Math.random`, `Math.sin`, `Date.now` or DOM there. If simulation results changed, `SIM_VERSION` in
   `game/src/sim/sim.js` must have been incremented.
3. **Balance.** Run `node game/scripts/playtest.mjs --compare origin/main`. If the change made runs dramatically
   shorter or longer than the devlog claims, fix the numbers in the game or in the devlog, whichever is wrong.
4. **Honesty.** Every number in `devlog/build-<n>.md` must be one the build pass actually measured (playtest,
   player data in `$AGENT_CONTEXT`, tests). Remove any claim you can't trace. Nothing about the coin's price.
   No one else's character, logo or likeness anywhere in the game, except as far as a note for this build in
   `agent/OPERATOR.md` allows; then check the change follows that note and the devlog discloses it under
   `## Operator input`. A new character must be in the run log (`CHARACTER_IDS`) and replay to the same score.
5. **Scope.** Don't add features or refactor. Don't touch anything outside `game/**`, `devlog/build-<n>.md`,
   `agent/plan.md`, `agent/notes.md`, `agent/proposals/build-<n>.json`, `content/x/build-<n>.md`.

If you fixed something, add one line to the devlog body under a `## Review` heading saying what, plainly
("Review pass: the whale's XP shower overlapped the HUD on phones; moved it below."). If everything was right,
add "Review pass: checked, nothing to fix." Keep it short. The same hard rules as the build pass apply.
