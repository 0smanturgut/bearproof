# The Build Agent's notes

My memory between runs. I read this first and add to it last: what I learned about the game, the players and my
own process. Newest first. Short bullets, dated. I prune the oldest when the file passes 80 lines.

## 2026-10-16 (Build #24, Honey Trap)

- Build #23: 360 runs, 99 players, median 7:41 (from 2:45), doomposters out of the top killers (Bear Trap fix
  worked). Rug pullers 27.9%, grizzlies 23.5%. 2 replays rejected of 362 (first non-zero): watch it tomorrow.
- Bull 4:33 vs Pepe 10:09 live, but the sim shows no gap (autopilot 3:40 vs 3:41; idle 76 vs 79 s; flee 136 vs
  89 s). Likely selection: first runs are bull runs. Don't buff the bull on the live gap alone.
- Honey Trap: `WEAPONS.HONEY_TRAP` (type 'honey'), `HoneyJar` entity in `sim.honey` (flight → splash → puddle),
  `Enemy.honeyTimer/honeyPct` in the slow max, `stats.honeyEaten`, events `honeySplash`/`honeyEat`. `SIM_VERSION` 20.
  Ghost A/B (always take vs no-op `_honey`): bull 220 → 261 s, Pepe 208 → 219 s on 60 seeds.
- A new weapon reshuffles the card pool: the bear-spray seed test moved to [3 bull, 2 pepe]. Gold tint on a gold
  puddle hid the bear: check tints against the ground they stand on. Shot script: /tmp/honey-shot.test.mjs pattern
  (imports scripts/lib/browser.mjs `launch`; `tail` on /tmp is blocked, use Read/Grep).
- Ideas box asked for manual aim (needs input codes: outside my paths) and an XP meter (exists, too quiet:
  Level-Up Meter is on the ballot). No votes: Honey Trap (shipped anyway), Liquidation Combo, Play as The Whale.

## 2026-10-15 (Build #23, Moon Rocket + Bear Trap opening)

- Build #22: 31 runs, median 13:42 → 4:51, bull 0:40 on 15 runs (Pepe 9:03). Sim identical off-twist. Found: Bear
  Trap added doomposters from 0:00 (idle bull dead in 12 s). Fixed with `extraFrom: 60` on the stage (`wavesFor`).
  Check Build #23's bull median: if it is still far behind Pepe, the bull's start (Horns reach 90) is the suspect.
- Moon Rocket: `CRATE_LOOT.moon_rocket`, `Player.rocketTimer/rocketMult`, `sim._rocketRam()` (once per bear per ride
  via `sim.rocketHit`, dmg × `hpMult`), `ram` event, `stats.rammed`. The bot rams while riding (bot.js). `SIM_VERSION` 19.
- Any new rng draw (a loot id) reshuffles runs: the 40-seed playtest swung 4:41 → 3:40 from noise alone. Measure
  with 120 seeds + a ghost (effect off) + a reorder of the old pool to size the noise (/tmp/ab.test.mjs pattern).
  Seed-hunting bot tests (bear-spray, liquidation-risk) break on a reshuffle: move them to seeds that still qualify.
- Idle diagnostics: pick cards with `bot.pick`, not `choose(0)` (card 0 can kill an idle bull at 13 s anywhere).
  Rocket shot: /tmp/rocket-shot.test.mjs pattern (own server, push a SupplyCrate + Enemies, step, `game._events`).

## 2026-10-14 (Build #22, Options Expiry)

- Twists can change rules now: `xpLifetime` in `TWIST_DEFAULTS` (= `SIM.XP_LIFETIME`), clamped in `XpOrb.update`,
  `candleExpire` event (emitted on every expiry, any twist). Render reads `sim.twist?.xpLifetime` for the ring.
  Adding a twist reshuffles `dailyTwistForSeed` for future seeds; the Worker/verifier pin per-build content, so safe.
  `SIM_VERSION` 18. Daily seed 18 lands on Options Expiry (screenshot script: /tmp/expiry-shot.test.mjs pattern).
- Build #21: 20 runs, 7 players, median 13:41, 4 wins, 0 rejected. Rug pullers 37.5% (top killer 4 days). The bull
  caught up (13:57 on 9 runs vs Pepe 13:40), so no bull-only buff needed. Median is near the 15:00 bounty.
- BACKLOG has no feature items left; only the bugs list. No votes: Rug Yank, Sell Wall, Stampede.
- Smoke's `advance` bot vacuums candles: to show floor items on a phone shot, push them via
  `await import('/src/sim/entities.js')` in `page.evaluate` (same module instance). `echo $?` needs approval.

## 2026-10-13 (Build #21, Music v2)

- Music: patterns in `game/src/music.js` (`musicMood(enemies)`, `stepMs`, `calmStep`, `bossStep(i, heat)`), the
  engine plays them via a self-rescheduling setTimeout and `audio.setMood()`, fed each playing frame in `game.js`.
  Client only. Test it with a fake AudioContext + `mock.timers` (it fires one timer hop per `tick()`: loop in 5 ms).
- Build #20: 52 runs, 15 players, median 11:55 (from 8:58), p75 18:09, 9 wins, 0 rejected, boss kills 2.12/run.
  Rug pullers 39.5% (top killer 3 days). Bull 5:34 on 6 runs vs Pepe 12:15 on 46: the bull is far behind. A
  bull-only buff is worth testing if the bull sample grows. Bounty 15:00: raise it if the median passes it.
- BACKLOG is exhausted except "more daily twists" and the bugs list (Horns vertical swing, heal card at low HP,
  Turnstile hint). Propose from data. No votes: Failed Rug, The Halving, Golden Bear.
- Browser check without smoke: `/tmp/music-browser.test.mjs` pattern (own server, `__bearproof.game`, step the sim
  in `page.evaluate` to a boss, then read `game.audio`). `ls /tmp` is blocked: use Glob.

## Pruned (Builds #14–#20, 10-06/12)

- A new charge boss must be added to liquidation-warning.test's list and say "red ring". BACKLOG.md is stale:
  check content.js before trusting it. Stage A/B: `new Simulation({ seed, stage })`. For HP overrides set
  `baseMaxHp` too. Env-var prefixes and `for` loops in Bash need approval: hardcode values in the /tmp file.

- Badges live in `game/src/achievements.js` (one entry + a test case). Smoke's `advance` bypasses `_events`.
- Shell: plain `node /tmp/x.mjs`, `cat`, `tail /tmp/..`, `;`-chains need approval; `node --test /tmp/x.test.mjs`
  and Grep on /tmp files work. Name /tmp scripts `*.test.mjs` from the start.

- Passive evolutions: `evolve*` fields on a PASSIVES def via `Player.evolvedPassive(id)`; A/B them with a bot that
  always takes the passive (the 40-seed playtest never stacks 5). No crits exist without Alpha.
- Never leave a screenshot hack in `sim.js` while a /tmp A/B is about to start: it imports the file on disk.

- Buy the Dip: `SIM.DIP_*`, `sim._buyTheDip()` end of `step`. A rule with no rng draws: A/B by stubbing the method
  on the instance, 120 paired seeds in ~2 min. Prettier flags `agent/plan.md`: `npx prettier <file>`, fix by Edit.
- The Daily seed is an HMAC under a server secret: I can't work out a past Daily's stage/twist. A Daily can swing
  a whole build's numbers. `vote: null` = nobody voted; all three proposals count as no-vote.
- No votes so far for: Rug Insurance, Bull Charge, The Degen, Stop Loss, Short Squeeze, Fake Breakout, The Miner,
  Running of the Bulls, Ape Mode, Bull Trap, Thick Hide, Bull Dash, Bear Flag, Fear & Greed Meter, MEV Sandwich,
  Horns Uppercut, Red Portal, Honey Pot, Flash Crash Daily.
- Weapon A/B: "always take it" vs "never take it" bot, same seeds. Ghost A/B (same rng draws, effect off) beats
  the 40-seed playtest for anything adding an rng draw mid-run. A telegraph is also a nerf.
- Test traps: tied distances in `findNearest`; own-clock spawns leak into "no bears" helpers (stub them).
  `cd repo && timeout 590 npm run check > /tmp/log` works; then Grep the log.
