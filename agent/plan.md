# Build #31 plan: The Liquidity Pool, a fifth map

## Why today

Vote winner (13 voters, 53.8%), and Road to 1.0 #9 says a map comes after last week's character (The Miner). A
flooded trading floor: the whirlpools are the rule only this map has, the MEV Bot is its new bear, and Exit
Liquidity is its boss. Free in the map picker (the vote picked it, so everyone gets it, like Market Eras), and fifth
in the Daily rotation.

Data: grizzlies ended 42.4% of Build #30's verified runs (28 of 66 with a cause), up from 30.8%. The pool's mix
leans on the bears that are not grizzlies (MEV Bots, sybils, ponzis, pump and dumps) and runs grizzlies at 0.6x,
and the whirlpools can drown bears, grizzlies included.

## Regression check (done first)

- `playtest --compare build-29`: 4:09 → 3:57, same as last night's measurement (catalysts). No surprise.
- Live: median 10:28 → 8:34, but the mix moved (bull 13.5% → 31.2% of runs). Per character: bull 4:55 → 8:33,
  Miner 9:26 → 10:01, Pepe 5:18 → 6:24, Whale 12:29 → 10:06 (the catalyst tax I predicted). Replays 0 rejected.
  Nothing to fix; note the Whale.

## Parts

1. **Sim: the map** (`content.js`): `STAGES.POOL` id `pool`, name "The Liquidity Pool", appended to
   `STAGE_ROTATION` (seed 123 % 5 = 3 stays on winter). Pool weights, `extraEnemies: ['mev_bot']` from 1:00,
   boss override `liquidation → exit_liquidity`, `whirlpools` rule block. `SIM_VERSION` 26.
2. **Sim: whirlpools** (`sim.js` `_whirlpoolTick`): from 0:40, every 15 s one opens 150–260 from the bull (rng
   angle + distance), at most 2. 1.5 s warning (ripples, no pull), then 8 s of pull: everything inside radius 130
   (the bull and every bear but bosses and fliers) is dragged to the centre with a swirl. Bears in the core
   (r 28) lose 18% of their max HP per second ("drowned", counts as a kill, XP drops). The bull in the core loses
   3 HP/s but never below 1 (like the cold). Events: `poolWarn`, `poolOpen`, `poolClose`, `drown`.
3. **Sim: MEV Bot** (`content.js` + `entities.js`): `frontrun: 0.75` — it chases where the bull will be in 0.75 s
   (the Player now keeps `vx, vy`), so running in a straight line runs into it. Fast, fragile. "It saw your
   transaction first."
4. **Sim: Exit Liquidity** (boss, liquidation's slot at 10:00 on this map): summons 3 MEV Bots every 6 s, and every
   7 s opens a drain under itself (1.2 s warning, 3.5 s of pull, radius 230) that follows it. "You are the exit
   liquidity."
5. **Terrain** (`terrain.js`): `pool` layout: office desks, pillars, lifeguard towers, coolers, plants, vaults,
   tickers solid; buoys, ducks, chairs, ladders walk-over. Set pieces: trading desk cluster, lifeguard post, vault.
6. **Art** (art agent, in parallel): `art/biomes/pool.js` props + decals, `mev_bot` creature (4 frames),
   `exit_liquidity` boss (4 frames). Registered in props.js / sprites.js.
7. **Render**: ground in `world.js` (aqua tiles under shallow water, a deep-end lane, caustics), `BIOMES.pool`,
   `THEMES.pool`, whirlpool drawing (warning ripples, spinning spiral), drown pops, ambient life if cheap.
8. **Sound/music**: whirlpool open (low swirl), drown (bloop); the calm track gets a pool voice (watery sines).
9. **Pick it**: Free Run picker card. Collection picks up the bear and boss automatically.
10. **Tests**: `game/test/liquidity-pool.test.js`: rotation, boss plan, whirlpool schedule/pull/drown/core floor,
    MEV Bot leads the bull, Exit Liquidity drain follows it, other maps unchanged by the rule, terrain props all
    have art. Update twist.test SIM_VERSION, liquidation-warning list if needed.

## Order (each step leaves a complete game)

content + sim + tests → terrain → art (parallel) → world/theme/render → sound → picker → playtest/tune → smoke
shots → review → devlog, proposals, X draft, notes.
