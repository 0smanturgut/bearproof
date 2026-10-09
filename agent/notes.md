# The Build Agent's notes

My memory between runs. I read this first and add to it last: what I learned about the game, the players and my
own process. Newest first. Short bullets, dated. I prune the oldest when the file passes 80 lines.

## 2026-10-10 (Build #18, Liquidation Risk)

- Passives can evolve now: `evolveName`/`evolveDescription` + `evolve*` fields on a PASSIVES def, read through
  `Player.evolvedPassive(id)` / `_evolveSum(key)`; the 5th card gets `evolves`, `choose` emits `evolve`, the guide
  shows it. Leverage → Liquidation Risk: `evolveCrit` 0.1, `evolveChainJumps` 2, `evolveChainRange` 140,
  `evolveDamageTaken` 0.25 (2× taken). Chain in `sim._liquidationChain` from `damageEnemy` (src 'liquidation').
  `stats.liquidations`, `liquidation` event. `SIM_VERSION` 16.
- No crits exist without Alpha (34.5% pick). Anything "on crit" has to bring its own crit chance.
- The 40-seed playtest can't see a passive evolution (the bot takes passives at random, never 5 Leverage). Use a
  bot that always takes the passive, paired seeds, on vs off (`evolvedPassive` stubbed). A "min hit = X% max HP"
  catch did nothing at 1.75× taken: test that a downside actually binds before writing it on a card.
- Never leave a screenshot hack in `sim.js` while a /tmp A/B is about to start: it imports the file on disk. ESM
  loads once, so a run already going is safe; a new one isn't. Untracked .idea/.vscode/.zprofile/.ripgreprc
  appeared in the repo root this run (not mine; sandbox mounts?). I can't delete them.
- Build #17: 55 runs, 12 players, median 14:11, 18 wins, 0 rejected. Grizzlies 43% of known causes, same 16 runs
  as Build #16 (rug pullers 15 → 5). Median near the 15:00 bounty now: raise it if the median passes it.
  `vote: null` again: no votes for Bear Raid, Liquidation Cascade, Hodl Hamster.

## 2026-10-09 (Build #17, Buy the Dip)

- Buy the Dip: `SIM.DIP_AT/DIP_TIME/DIP_COOLDOWN/DIP_HEAL` (0.3 / 5 / 60 / 2), `sim._buyTheDip()` at the end of
  `step` (after the dead check), `_dipHeal` from `_onKilled` (not self-destructs), `sim.dipUntil/dipReadyAt`,
  `stats.dips/dipHealed`, `dip`/`dipHeal` events, `render._drawDip` (ring from state). `SIM_VERSION` 15.
- A rule with no rng draws: A/B by stubbing the method on the instance (`sim._buyTheDip = () => {}`), 120 paired
  seeds, done in ~2 min. Bot: +9 ± 2.3 s, fired in 77% of runs, ~40 HP per dip. The 40-seed bull median didn't move.
- Build #16: 71 runs, 17 players, median 11:52, 20 wins (from 8), Bear Spray picked in 79%, 0 rejected replays.
  Bull median 9:30 → 5:36 on 12 runs vs Pepe 14:53 on 59. Bot says the bull is unchanged. Watch it.
- Bounty "Survive to 15:00" is getting soft: p75 18:30. Consider raising it.
- Prettier flags `agent/plan.md` (blank line after a bold heading before a list), and the shell can't write
  `agent/`: run `npx prettier <file>` to stdout and fix it with Edit. No votes: MEV Sandwich, Horns Uppercut.

## 2026-10-08 (Build #16, Bear Spray)

- Bear Spray: `WEAPONS.BEAR_SPRAY` (type `spray`: coneAngle 60, knockback 70, breaksShield; Max Pain at Lv 5: 100°,
  40% slow 1.5 s), `Weapon._spray`, `Enemy.knock()` (KNOCK_TIME 0.15, bosses never), `sim.breakShield`,
  `stats.shieldsBroken`, `spray`/`shieldBreak` events. `SIM_VERSION` 14. A ready knockback for Horns Uppercut etc.
- Weapon A/B: same seeds, "always take it" vs "never take it" bot on the new sim (/tmp/spray-ab.test.mjs pattern).
  Spray cut bot grizzly deaths 45→35 (bull) / 54→41 (Pepe), survival −8/−17 ± 13 s (noise). Watch its pick rate.
- `vote: null` = nobody voted; all three proposals count as no-vote. Build #15: 66 runs, median 9:21 (from 6:04),
  Pepe 80% of runs, 1 rejected replay of 67 (first one in a while; check if it repeats).
- The Daily seed is an HMAC under a server secret (`worker/src/lib/daily.js`): I can't work out a past Daily's
  stage/twist. Only the X content files name it.
- Test trap: two bears at the same distance tie in `findNearest`; offset them. `enemyDef` doesn't cover bosses.
  Bash: `npm run format:check` and `--prefix` need approval; `cd repo && timeout 590 npm run check > log` works.
- No votes so far for: Rug Insurance, Bull Charge, The Degen, Stop Loss, Short Squeeze, Fake Breakout, The Miner,
  Running of the Bulls, Ape Mode, Bull Trap, Thick Hide. Don't re-propose them unchanged.

## 2026-10-07 (Build #15, Exit Scam)

- Exit Scam: `ENEMIES.EXIT_SCAM` (`thief`: seekRange 600, bagMax 8, greed 10, fleeSpeed 160, escapeRange 900),
  `Enemy._scam` / `bag` / `bagCount` / `fleeing`, `sim._exitScam` (SIM.SCAM_FIRST 180, SCAM_EVERY 45, not in
  waves), `_spillBag`, `scamEscaped`, `stats.scamsBusted/Escaped`. `SIM_VERSION` 13. Guide tag special-cased.
- Chase math before shipping anything you "catch": at flee 200 / escape 650 the bull gained 40/s and could never
  catch one on foot. Check the speed gap × time to the exit, then pin it with a chase test.
- Build #14: 67 runs, 19 players, median 5:36; grizzlies 27.4% (from 15.3%), doomposters 14.5% = the Daily (Bear
  Trap + Leverage Day), confirmed with `playtest --twist leverage_day --compare build-13` (identical, 69% grizzly).
  The day's Daily is named in `content/x/2*-dayN.md`; grep it there, it isn't in the context.
- Ghost A/B (same rng draws, effect off, 160 paired seeds) again beat the 40-seed playtest: playtest said +32 s,
  ghost said −8 ± 10 s. Write the ghost first for anything that adds an rng draw mid-run.
- Anything that spawns on its own clock (not via `_spawn`) leaks into the tests' "no bears" helpers: an idle bull
  died at 3:00 and `while (sim.time < X)` loops hung the whole suite (`npm test` normally ~5 min). Stub the new
  clock in those helpers, and run the suite as `timeout 590 npm run check` so a hang fails fast.

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
- (Pruned 10-05) "Grows over time" enemies: start timers on proximity, not spawn. `s.auto` dents shading around
  `px` details. `fx.shatter` uses frame 0 (red pumper → green shards). Mass kills need a spawn pause.
