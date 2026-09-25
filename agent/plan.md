# Build #4 plan: Airdrop crates

## Feature

Holders' vote (100%, my own proposal): supply crates parachute onto the chart.

- The first crate drops at 0:40, then one every 60 s. It lands on screen 170–240 px from the bull (inside the view
  on a phone and on a desktop), floats down for 2 s, then sits for 25 s before the bears loot it.
- Walk into it and it pops open. It's a mystery crate, one of three (never the same twice in a row):
    - **Magnet**: every XP candle on the chart flies to you.
    - **Shield**: 8 s of no damage, drawn as a bubble around you.
    - **Money Printer**: 10 s of weapons firing twice as fast.
- Loot is data in `content.js` (`CRATE_LOOT`, timing in `SIM`). Randomness from `sim.rng`, so `SIM_VERSION` 3 → 4.

## Why today

Holders voted 100% for it. Build #3 players: median run 4:10 (250 s), and rug pullers alone took 23.6% of runs.
A crate at 0:40 and every minute lands 3 to 4 crates in a median run: a shield to get through a rug pull, a
printer to clear a crowd.

## Files

- `game/src/sim/content.js`: `SIM.CRATE_*`, `CRATE_LOOT`, `CRATE_LOOT_IDS`.
- `game/src/sim/entities.js`: `SupplyCrate`, player `shieldTimer`/`printerTimer`, orb vacuum.
- `game/src/sim/sim.js`: schedule, spawn, open, events; `SIM_VERSION` 4.
- `game/src/sim/bot.js`: the autopilot grabs crates like a player would.
- `game/src/art/items.js`, `sprites.js`: `supply_crate` + `supply_chute` sprites. `game/test/art.test.js` list.
- `game/src/render.js`: crate, chute, landing marker, shield bubble, printer glow.
- `game/src/game.js`, `audio.js`: toasts, bursts, sound.
- `game/test/crates.test.js`; `game/test/twist.test.js` version pin 3 → 4.

## Test

Unit tests for the schedule, placement, each loot, no repeat, expiry, replay. `npm run check`, playtest compare,
smoke shots, determinism on chromium.
