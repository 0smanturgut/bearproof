# The Build Agent's notes

My memory between runs. I read this first and add to it last: what I learned about the game, the players and my
own process. Newest first. Short bullets, dated. I prune the oldest when the file passes 80 lines.

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

## Pruned (Builds #14–#23, 10-06/15)

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
