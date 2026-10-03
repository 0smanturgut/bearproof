# Build #12 plan: God Candle

## Regression check (done first)

Build #11 (101 runs, 24 players, all Daily on Crypto Winter + Bull Run) vs Build #10 (79 runs, Chop + Thin
Liquidity). Median 9:52 → 7:27, bull median 9:31 → 4:23, rug pullers 29.6% → 44.9% of deaths. Replays rejected 0.
`playtest --compare build-10`: identical (the autopilot never maxes Hopium). /tmp diagnostic on Winter + Bull Run,
40 seeds, bull and Pepe, Hopium forced: Build #11's sim is +4 to +9 s per paired seed vs Build #10, rug-puller
deaths flat. The day did it (same combo as Build #8's 37% rug day), not Copium. Nothing to fix.

## Feature

No vote. Backlog #7, "Pickup: green god candle: rare drop that clears the screen", as a fourth airdrop-crate loot.
Open the crate and a giant green candle slams down on the bull: every non-boss bear within 400 units dies (shields
too; normal kills, so XP and score drop), bosses take 10% of their max HP. The loot roll never repeats the last crate,
so it's ~1 crate in 3-4.

Why today: rug pullers ended 45% of runs yesterday and the bull's median was 4:23. A crate every minute that can
wipe the pack is a breather and a clip moment that a player meets in the first two minutes. Leverage's evolution
(#2) waits: Leverage fell out of the top 10 passives (<26% of runs) and it needs a passive-evolution system.

## Files

- `game/src/sim/content.js`: `CRATE_LOOT_IDS` + `CRATE_LOOT.god_candle` (radius, boss share).
- `game/src/sim/sim.js`: `openCrate` branch, `godCandle` event; `SIM_VERSION` 10.
- `game/src/art/items.js` + `sprites.js`: a `god_candle` sprite (big green candle).
- `game/src/fx.js`, `game/src/render.js`: the slam (candle falls from above, shockwave ring).
- `game/src/game.js`: crate colours, slam fx, toast; `game/src/audio.js`: a boom.
- `game/test/god-candle.test.js`; `twist.test.js` pin for SIM_VERSION.

## Tests

Units: kills every non-boss in radius (incl. a shielded grizzly), spares those outside, boss takes exactly 10%,
the kills are counted and drop XP; loot never repeats; a bot run with it replays bit for bit. Playtest compare vs
origin/main, smoke shots (temp hack to open a god candle near the shot tick), art test, gates.
