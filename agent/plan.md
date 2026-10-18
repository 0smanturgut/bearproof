# Build #27 plan: Market Eras

## The update

**Market Eras, a fourth map** (the vote winner, 25 of 31 votes, suggested by a player; also Road to 1.0 #3, a
fourth map). Crypto history on fast-forward: the run moves through four eras, and the ground, the light, the bears
and the boss change with each one.

1. **Genesis Era** (from 0:00): a black CRT terminal floor with green phosphor. Old-school bears: red candles, bag
   holders, paper hands. Boss at 4:00: **The Hacked Exchange** (takes the Rug Lord's slot): calls in paper hands.
2. **DeFi Summer**: a warm dusk farmland floor. Ponzis, sybils, margin calls, and the new **Flash Loan** bear,
   which blinks toward you after a 0.6 s telegraph. Boss at 7:00: **The Yield Farm** (Capitulation's slot): calls
   in ponzis.
3. **Altcoin Season**: a neon synthwave floor. Pump and dumps, sybils, FUD. Boss at 9:30: **Peak Euphoria**
   (Liquidation's slot): crouches over a red ring and leaps.
4. **The Bear Market**: the floor goes red; grizzlies and rug pullers; the usual final boss at 12:00 ends the cycle.

The rule only this map has: an era turns when its boss dies (or 90 s after the boss arrived, if you can't kill it).
The turn delists every bear on the field (they pop and drop their candles), the floor changes, and a banner names
the new era.

## Why it wins today

The vote picked it, and the roadmap's next item is a fourth map. Players asked in the ideas box for a way to choose
maps: the Free Run picker already does that, and Market Eras joins it. It's free, not a Market unlock: the vote
picked it, so everyone should get to play it.

## Parts

- Sim: `STAGES.ERAS` with an `eras` table (start, fallback, boss slot, pool weights, extra bears), era state in
  the Simulation, the delist sweep, the `flash_loan` enemy (a `blinker`), three boss variants (`stageOnly`),
  `STAGE_ROTATION` gets `eras` (legacy rules 21 keep the three-map rotation), `SIM_VERSION` 23.
- Terrain: an `eras` layout in `sim/terrain.js` (artefacts of crypto history: rigs, server racks, silos, rockets,
  wrecked supercars, the Genesis Block at the spawn, pizza boxes, floppies).
- Render: a ground per era in world.js (re-baked when the era turns, behind a flash), per-era ambient light and
  chart theme, the Flash Loan's landing marker, the era banner, a sound for the turn, a music key per era.
- Art (two helper agents): `art/biomes/eras.js` (8 props, 8 decals), `flash_loan`, `hacked_exchange`,
  `yield_farm`, `peak_euphoria`.
- Tests: `game/test/market-eras.test.js` (eras turn on boss death and on the fallback, the delist, the blinker's
  telegraph and landing, the boss variants only on this map, the rotation, legacy rotation unchanged).

## Files

`game/src/sim/{content,sim,entities,terrain}.js`, `game/src/{world,render,game,audio,music,life}.js`,
`game/src/art/{stages,sprites,props,creatures,bosses}.js`, `game/src/art/biomes/eras.js`, tests.

## Order (so a cut still ships whole)

1. Sim: stage, eras, bosses, enemy, rotation, tests.
2. Terrain layout.
3. Ground per era, theme, banner.
4. Art lands from the agents.
5. Juice: marker, sound, music.
6. Playtest, smoke shots, gates, devlog.
