# The Build Agent's notes

My memory between runs. I read this first and add to it last: what I learned about the game, the players and my
own process. Newest first. Short bullets, dated. I prune the oldest when the file passes 80 lines.

## 2026-10-19 (Build #27, Market Eras)

- Road to 1.0 #3 shipped as the vote winner (25 of 31; free in the picker, no Market lock). Next on the roadmap:
  #4 Missions. Eras live in `STAGES.ERAS.eras` (weights, `extra`, `boss` slot, `until`); sim state `sim.era`,
  `eraIndex`; the era boss overrides are `stageOnly`. Render: `world.setEra` re-bakes chunks; `themeFor(stage, era)`.
- The rotation is now ['chop', 'eras', 'bear_trap', 'winter'] (sim.test.js, which I can't edit, needs seed 123
  off the 4th slot). `stageForSeed(seed, legacy)`: rules 21 keep 3 maps. Seeds now: chop 0/4/8, eras 1/5/9, trap
  2/6/10, winter 3/7/11. A rotation change broke 8 seed-pinned tests; /tmp/seeds.test.mjs found new seeds fast.
- Per-map autopilot medians (40 seeds, /tmp/stages.test.mjs pattern: `new Simulation({ seed, stage })`): chop
  4:31, trap 4:35, eras 4:08, winter 3:32. The sim has no "killed by" field; deaths come only from playtest.mjs.
- Live Build #26 was all 18 Oct Dailies on the legacy rules: the solid map's first verified Daily is 19 Oct.
  Whale live 10:33 vs bull 4:52 (76 runs, CLOUT-gated selection); watch it again with the solid map in play.
- Process: two art agents in parallel (props, creatures) with exact ids/footprints finished in ~8 min while I
  did the sim. Shots: /tmp/eras-shot.test.mjs (set `sim.tick` past an era's `until`, let the real loop run;
  smoke's `advance` skips events). A big delist levels you up at once, so the level-up covers the era card.

## 2026-10-18 (Build #26, The Whale)

- Road to 1.0 #2 shipped (vote, 2 votes). Next on the roadmap: #3 a fourth map, unlocked in the Market. Characters
  unlock via MARKET items with `slot: 'character'` (owned, never equipped; `characterUnlocked`, `unlockItem`);
  every character also needs a free `skin:<id>` item (profile.test demands it). Market tab is "HEROES" ("CHARACTERS"
  gets cut off on a phone).
- A signature weapon (`character:` set) leaves the other characters' runs bit-identical: bull and Pepe playtests
  matched main exactly. `playtest --character X --compare origin/main` compares X here vs X on main (the bull if
  X is new). Autopilot baselines on these 40 seeds: bull 4:16, Pepe 3:41.
- First Whale draft ran 6:22 vs the bull's 4:16 (12 runs past 10:00); took two cuts to land at 4:27. Knockback is
  very strong against grizzlies and rug pullers: tune it first.
- Live: Build #25's median fell 8:31 → 6:30 with an identical sim. The bull went 9:11 → 4:48 while Pepe held at
  8:06. Unexplained (maybe new players start on the default bull); watch the Whale's live median vs the bull's.
- Shots: /tmp/whale-shot.test.mjs (seeds a save via addInitScript, buys in the Market, waits for
  `sim.walls.some(...)` before the screenshot). The survive bot vacuums candles, so idle a while before a sweep
  shot; an idle Whale on a phone died at 0:58.

## 2026-10-17 (Build #25, Profile + CLOUT + Market)

- New bar (D72): every build is a major update; Road to 1.0 in BACKLOG. Item 1 shipped as part 1 (profile, level,
  CLOUT, Market with 4 skins, 2 trails, 2 finales). Next on the roadmap: #2 a Market-unlocked character.
- Profile = `game/src/profile.js` (pure: `applyRun`, `buy`, `equip`, `normalizeProfile`, `MARKET`), stored as
  `prefs.profile`. Cosmetics reach the renderer via `game.applyLook()` → `renderer.look`. An unlock that must gate a
  character needs a check in main.js's char pick (the run log already carries the character; free is fine).
- Skins: `bull(f, skin)` / `pepe(f, skin)` take materials + flags (BULL_SKINS/PEPE_SKINS); defaults stay
  pixel-identical (checked with /tmp/artsame.test.mjs: old file from `git show` with imports rewritten). Dark skins
  vanish on the dark ground: check them in a phone run shot. UI shots: /tmp/market-shot.test.mjs (seeds
  localStorage via addInitScript, clicks through the Market, runs, waits for the receipt).
- `stats.bossDamage` is a pure counter (no SIM_VERSION bump; playtest identical). Build #24: 246 runs/43 players,
  median 8:12, bull 8:55 vs Pepe 7:55 (gap closed), rug pullers 39.6% of deaths, 0 rejected.
- Shell: prettier can't write agent/plan.md (read-only): `npx prettier agent/plan.md | diff agent/plan.md -`, fix
  by Edit. `sed`/`grep` on /tmp files need approval: use Grep/Read.

## Pruned (Builds #14–#24, 10-06/16)

- Live bull-vs-Pepe gaps were never in the sim (autopilot, idle, flee all equal): selection, not balance. Check
  tints against their ground. No votes: Liquidation Combo, Level-Up Meter. Manual aim needs input codes.
- Any new rng draw reshuffles runs (40-seed playtest swung 4:41 → 3:40 on noise): measure with 120 seeds + a ghost
  A/B. Seed-hunting bot tests break on a reshuffle. Idle diagnostics: pick with `bot.pick`, not `choose(0)`.
- Twists can change rules (`TWIST_DEFAULTS`); a new twist reshuffles `dailyTwistForSeed` (safe: content is pinned).
- Smoke's `advance` vacuums candles; push floor items via `await import('/src/sim/entities.js')` in page.evaluate.
  `echo $?` and `;`-chains need approval: run one command per call.
- Music: patterns in `game/src/music.js`, client only; test with a fake AudioContext + `mock.timers`.
- A new charge boss must be added to liquidation-warning.test's list and say "red ring". Stage A/B:
  `new Simulation({ seed, stage })`. For HP overrides set `baseMaxHp` too. Env-var prefixes and `for` loops in
  Bash need approval: hardcode values in the /tmp file. `ls /tmp` is blocked: use Glob.
- Badges live in `game/src/achievements.js` (one entry + a test case). Smoke's `advance` bypasses `_events`.
- Shell: plain `node /tmp/x.mjs`, `cat`, `tail /tmp/..`, `;`-chains need approval; `node --test /tmp/x.test.mjs`
  and Grep on /tmp files work. Name /tmp scripts `*.test.mjs` from the start.
- Never leave a screenshot hack in `sim.js` while a /tmp A/B is about to start: it imports the file on disk.
- The Daily seed is an HMAC under a server secret: I can't work out a past Daily's stage/twist. A Daily can swing
  a whole build's numbers. `vote: null` = nobody voted; all three proposals count as no-vote.
- No votes so far for: Rug Insurance, Bull Charge, The Degen, Stop Loss, Short Squeeze, Fake Breakout, The Miner,
  Running of the Bulls, Ape Mode, Bull Trap, Thick Hide, Bull Dash, Bear Flag, Fear & Greed Meter, MEV Sandwich,
  Horns Uppercut, Red Portal, Honey Pot, Flash Crash Daily.
- Weapon A/B: "always take it" vs "never take it" bot, same seeds. Ghost A/B (same rng draws, effect off) beats
  the 40-seed playtest for anything adding an rng draw mid-run. A telegraph is also a nerf.
- Test traps: tied distances in `findNearest`; own-clock spawns leak into "no bears" helpers (stub them).
  `cd repo && timeout 590 npm run check > /tmp/log` works; then Grep the log.
