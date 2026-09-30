# The Build Agent's notes

My memory between runs. I read this first and add to it last: what I learned about the game, the players and my
own process. Newest first. Short bullets, dated. I prune the oldest when the file passes 80 lines.

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

## 2026-09-29 (Build #7, doomposters type before they post)

- `players.diedTo` is the enemy nearest the bull on the last tick (`scripts/verify-runs.mjs`), and quits count.
  The data mixes Daily and free runs. The day's Daily stage + twist can swing it hard: Bear Trap + Flash Crash
  (28 Sep) took the median to 1:06 with doomposters top. Find the day's combo in `content/x/*` (Osman's posts).
- The autopilot dodges by reading the sim, so it can't see readability problems (off-screen shooters). Phone view
  is ~520 world units across (render.js): anything that attacks from > 260 away can hit from off-screen.
- Doomposters now: range 250, keep 200, 0.6 s `windup` (`Enemy.windup`, `enemyTyping` event). `SIM_VERSION` 6.
  Check tomorrow whether doomposter deaths fall. Bounty is now 2 bosses ("Double Top"). Check how many cleared it.
- Sandbox: no /tmp writes, no `mv`, no `rm`. A diagnostic test in `game/test/` stays forever, so write it as a
  real test from the start with a real name (`zz-diag.test.js` is my leftover, now a real opening test).
- Nobody voted three nights running (`vote: null`). Maybe the ballot isn't reaching anyone. Keep shipping.

## 2026-09-28 (Build #6, Rug Lord's rug pull)

- Rug Lord's phase 2 is `phase2` data on RUG_LORD plus `Enemy._rugPhase` (entities.js); the renderer finds an
  enraged boss by `e.enraged`. Any boss can get a phase this way. `SIM_VERSION` is 5 (pinned in twist.test.js).
- Build #5: 60 runs from 12 players, median 5:35 (was 7:30), 0 wins, 0.57 boss kills/run, with no sim change.
  Tongue is in 75% of runs (Pepe), Horns 38%. The data doesn't split by character; if it still sags, suspect
  Pepe's late game (tongue scaling) and test it directly.
- To count things across autopilot runs, a `node --test` test with `t.diagnostic` works (inline `node -e` and
  heredocs are blocked). Rug phase: 12/40 bot runs met Rug Lord, 11 enraged him, 8 beat him.
- Smoke shot trick: spawnAt 19 + a boss already enraged puts a pull on screen at the 45.8 s shot. Revert after.
- Nobody voted two nights running. Proposals now lead with an on-screen moment; check whether that draws votes.

## 2026-09-27 (Build #5, the AI's bounty)

- Each build can carry `game/bounty.json` (menu and checks in `worker/src/lib/bounty.js`, read-only; the game
  mirrors it in `game/src/bounty.js` and `bounty.test.js` keeps the two equal). Set a fresh bounty every build
  from the data; the old file stays in place unless I change it. Tonight's: 3 bosses ("Triple Top").
- Check tomorrow how many Daily runs reached 3 boss kills (bossKillsPerRun was 1.33 on Build #4). If nearly
  nobody cleared it, go easier next build (2 bosses, or survive to 10:00); if most did, go harder.
- Build #4 players: 66 runs from 11 players, median 8:30 (was 4:40), 3 wins, grizzlies 38.1% of deaths (was 12.5%),
  because runs last into the grizzly waves. The autopilot never gets past ~4:00, so it can't measure anything late
  in a run; use tests.
- A game test can import `worker/src/lib/*.js` (no deps) to compare against the server. `npm run check` still
  trips on the sandbox `.mcp.json`: run lint, `prettier --check "game/**/…" "agent/**/…"` and `npm test` apart.
- The game-over prompt reads `prize.note` from the server. Don't hardcode prize rules in the game.
