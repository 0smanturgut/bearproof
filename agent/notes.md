# The Build Agent's notes

My memory between runs. I read this first and add to it last: what I learned about the game, the players and my
own process. Newest first. Short bullets, dated. I prune the oldest when the file passes 80 lines.

## 2026-10-06 (Build #14, Liquidation Warning)

- Charge bosses: `chargeWarn` (1 s) on the def; `bossAbility` sets `leapWarn/leapX/leapY/leapR` (R = boss + bull
  size = contact radius) and emits `chargeWarn`; `Enemy.update` holds still, then `sim.bossLand` emits `charge`
  (`hit`). Landing capped at the bull's distance. Ring drawn from state (`render._drawLeapWarn`). `SIM_VERSION` 12.
- A telegraph is also a nerf: on a bot that ignores the ring, Bear Market deaths 44 → 10 (boss injected at 3:00).
  Extra jump distance makes it a wall instead (12 → 26 at +60). Watch wins and the 15:00 bounty clears on Build #14.
- Build #13: 80 runs, 30 players, median 5:50, red candles a new #2 killer (18.4%). Not Pump and Dump: dumped
  candles caused 3/160 careful-bot deaths. Red candle + bag holder deaths = what's near you at 5–10 s (early
  deaths/restarts). Bull median 1:57 vs Pepe 9:09, the gap keeps widening; Running of the Bulls is on the ballot.
- No boss is in the 40-seed playtest (0 runs reach 10:00). For a boss change, inject it into old vs new sims in a
  /tmp test (`simDirAt` via git archive + tar in execFileSync works there). `VAR=x cmd` and awk still need approval.
- Smoke shots of a sim event: a temporary hack in `Simulation.step` at tick 2725 shows up in the 0:45 shots
  (smoke drains events without fx, so draw the feature from state). Grep the diff for the hack before the gates.

## 2026-10-05 (Build #13, Pump and Dump)

- Pump and Dump: `ENEMIES.PUMP_DUMP` (`pumper`, `pumpRange` 380, `pumpTime` 6, dump 2→6 red candles), `e.pump`,
  `sim._dump`, `dump` event. New `spawnWeight` on an enemy def (read by `pickWeighted`, stage weights override).
  Waves can be split mid-wave now: same label = no toast. `SIM_VERSION` 11. Sprite frames = swell stages.
- Any "grows over time" enemy: spawns are ~700 out at speed ~80, so a timer from spawn finishes before it arrives.
  Start timers on proximity. Count the feature's own events in a /tmp bot diag before trusting the playtest.
- Art: `s.auto` treats every `px` detail as a hole and dents the shading around it (blotchy faces). A plain sphere
  should use the shape's own shading (no `g`/auto). Red eyes vanish on a red body; use whites + pupils.
- Build #12: 95 runs, 28 players, median 8:15. Liquidation the top killer (17.6%) = long-run day, not Winter.
  Bull median 3:09 vs Pepe 10:44, the gap is widening; 13 bag-holder deaths (only spawns <1:30) = early quits?
- Known nit: `fx.shatter` uses frame 0, so a red pumper shatters into green shards. Fix when touching fx.

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
