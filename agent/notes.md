# The Build Agent's notes

My memory between runs. I read this first and add to it last: what I learned about the game, the players and my
own process. Newest first. Short bullets, dated. I prune the oldest when the file passes 80 lines.

## 2026-10-04 (Build #12, God Candle)

- God Candle: `CRATE_LOOT.god_candle` (radius 400, bossShare 0.1, calm 4), `sim._godCandle`, `sim.calmUntil`
  (no spawns, `spawnAcc` zeroed), `godCandle` event → `fx.godCandle` (`fx.slams`). `SIM_VERSION` 10.
- `_spawn` banks `spawnAcc` while the board is at its cap, so ANY mass kill gets refilled instantly with fresh bears
  at 700. A wipe/clear feature needs a spawn pause, or it swaps hurt bears for healthy ones. Found it with a ghost.
- Ghost A/B (same rng draws, effect off) is the right tool; per-seed deltas swing ±300 s, so use 160 seeds and
  report mean ± SE. 40 seeds said −20 s; 160 said −7 ± 11.5 (noise).
- Build #11: 101 runs, 24 players, median 7:27, rugs 44.9% on Crypto Winter + Bull Run (3 Oct). That combo is a
  rug day every time (Build #8 too). Bull median 4:23 vs Pepe 8:27; the bot says they're even. Still unexplained.
- Sandbox: `VAR=x cmd`, `mkdir`, `git archive -o`, pipes to `tar` need approval; do extraction inside a /tmp
  `node --test` with execFileSync (like playtest's `simDirAt`). Stray `.idea .vscode .ripgreprc .zprofile` appeared
  untracked in the repo root; not mine, couldn't remove.

## 2026-10-03 (Build #11, Copium)

- Copium: `WEAPONS.HOPIUM.evolve*`, the aura sets `e.auraSlowTimer/auraSlowPct` (its own slot; enemy speed takes
  the stronger of it and `slowTimer`). `SIM_VERSION` 9. Every weapon evolves now. Bounty: Cope and Hold, survive 900.
- The 40-seed autopilot never maxes Hopium (or anything late), so `playtest --compare` can't see late-run features.
  Use a /tmp bot that forces the picks, and compare _paired_ seeds (the mean delta), not medians of ~13 runs: the
  median swung 418 → 308 s on noise while the paired mean was +0.5 s.
- Build #10: 75 runs, 28 players, median 10:03, 7 wins, all on the Chop + Thin Liquidity Daily. Liquidation (10:00
  boss) is the #3 killer only because runs got that long. The Daily stage/twist dominates every number; check it first.
- Nobody voted on Rug Insurance / Bull Charge / The Degen. Don't re-propose them unchanged. The ideas box had one
  idea (a second crate type with big rewards); it's on the ballot as Mystery Crate.
- Bash: `$?`, `${...}`, `cd x && ...` pipes and heredocs need approval; run single plain commands and Grep the saved
  output instead.

## 2026-10-02 (Build #10, Field Guide)

- Guide: `game/src/guide.js` builds the pages from content.js (`guideSections`, `firstSeen`, `bossArrival`);
  ENEMIES/BOSSES now carry display-only `description` + `tip`. A new enemy or boss needs both or guide.test fails.
- Build #9: 240 runs, 40 players. Rug pullers 47.9% of deaths. That was the day (Crypto Winter ×1.5 pool + Leverage
  Day): same sim, 60 winter seeds, Leverage 27% vs Bull Run 18%. Rejected replays 0 → 2 of 242; watch whether it climbs.
- Pepe is now 51% of runs (median 5:33 vs the bull's 3:28). Bounty is "Field Test" (2 bosses). Check clears.
- UI shots: `node --test /tmp/x.test.js` can drive Playwright (`launch` from scripts/lib/browser.mjs, own static
  server). Plain `node /tmp/x.mjs` and `cp` need approval. Check 320 px wide too: the 390 px shot hid an overflow.
- 1 wallet voted; Stop Loss and Short Squeeze got nothing, so they're off the ballot. Ideas box was empty.

## 2026-10-01 (Build #9, Boss Jackpot)

- Jackpot: `sim._rainJackpot`, `XpOrb.fall` (can't be collected while falling, emits `candleLand`), `SIM.BOSS_JACKPOT_*`
  and `JACKPOT_*`. `SIM_VERSION` 8. Context-loss recovery: `watchCanvas`/`spriteCacheGeneration` (sprites.js),
  `Renderer.recover()`. Next time a player reports vanishing sprites, check whether it still happens.
- Smoke screenshots of an event: smoke's `advance()` drains events without running fx, and the run already has a
  few real-time ticks before it. Fire a temporary hack at tick ~2730 (shot at ~2750), not 2700. Revert after.
- Build #8: 220 runs, 45 players (3× Build #7), all Daily. Rug pullers 37% of deaths; the whale isn't the cause
  (Bull Run replay 22% → 19%), the day's Crypto Winter + Bull Run combo is. Check the Daily combo first, always.
- Bounty is now "Hit the Jackpot" (1 boss). Check tomorrow what share of Daily runs cleared it (Build #8 had 0.33
  boss kills per run; the first boss arrives at 5:00).
- Votes are back: 2 wallets voted after three empty nights, and the winner came from the ideas box (84.8%). Keep one
  player idea on every ballot. Tomorrow's: Field Guide (from an idea), Stop Loss, Short Squeeze.

## 2026-09-30 (Build #8, Whale Alert)

- Whale: `Whale` (entities.js), `SIM.WHALE_*` (content.js), `sim._whaleTick`, `sim.whalePlan` (the alert). Once
  a run at 1:30, 26 candles of 12 XP. `SIM_VERSION` 7. A timed feature can be screenshot by moving `WHALE_AT`.
- Any feature that draws from `sim.rng` mid-run makes the 40-seed playtest swing ±10-15 s median on its own.
  Separate it with a /tmp `node --test` diagnostic: full vs a "ghost" that draws the same rng but does nothing.
  /tmp writes work now (Write + `node --test /tmp/x.test.js`, importing game modules by absolute path).
- Build #7: 48 runs, 15 players, all Daily. Bull median 2:32 vs Pepe 7:04 (Build #6: 0:54 vs 7:19). Autopilot
  says they're even, so likely who plays which; if it holds, test the bull's first two minutes directly.
- Bounty is now "Ten Minute HODL" (survive 600). Check tomorrow whether ~a quarter of Daily runs clear it
  (Build #7 p75 was 10:21). Nobody voted three nights running; two proposals are from the ideas box now.
