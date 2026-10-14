# Build #23 plan

No holder vote (`vote: null`), the ideas box and the chat are empty. `chosenBy: agent`.

## Regression first: Bear Trap's opening

Build #22's median fell from 13:42 (Build #21) to 4:51 and the bull's from 13:57 to 0:40 (15 runs). The 40-seed
playtest of Build #22 against #21 is identical, and Options Expiry doesn't hurt the opening (idle and reckless bots
last as long or longer with it). What I found instead: on the Bear Trap stage, doomposters (weight 1.8) are added to
every wave from 0:00, so ~62% of the opening bears are shooters. An idle bull dies in 12 s there (76 s on Chop), a
cautious bull that never charges ends at level 2. That rule is old, not Build #22's, but it is the harshest start in
the game and doomposters + bag holders ended 9 of Build #22's 27 lost runs.

Fix: a stage's `extraEnemies` join from `extraFrom` s (Bear Trap: 60, when doomposters join everywhere anyway). The
opening minute on Bear Trap is then red candles and bag holders like the other stages.

## Feature: Moon Rocket (a fifth airdrop-crate loot)

Grab the crate and the bull rides a rocket for 4 s: 1.8x speed, untouchable, and every bear it touches is rammed once
per ride (damage scaled with the clock like bear HP, knocked away; bosses take the hit but don't move). It was on the
Build #23 ballot with no votes; it's a power moment everyone sees in the first minutes (the first crate is at 0:40),
and grizzlies (37% of Build #22's deaths) are exactly what you want to ram.

## Files

- `game/src/sim/content.js`: `extraFrom` on Bear Trap and in `wavesFor`; `CRATE_LOOT.moon_rocket`, appended id.
- `game/src/sim/entities.js`: `Player.rocketTimer`, speed, no damage while riding.
- `game/src/sim/sim.js`: open the loot, `_rocketRam()`, `stats.rammed`, `ram` event, `SIM_VERSION` 19.
- `game/src/art/items.js`, `sprites.js`: a rocket sprite (4 frames, flame).
- `game/src/render.js`, `game.js`, `fx.js`, `audio.js`: the rocket under the bull, flame trail, ram hits, sound.

## Tests

- `game/test/moon-rocket.test.js`: loot listed, opening it sets 4 s; speed 1.8x; no damage while riding; a bear is
  rammed once per ride and knocked; a boss is hit but not moved; it ends on time; a run with a rocket replays.
- `game/test/bear-trap-opening.test.js`: no doomposters before 1:00 on Bear Trap, still weighted after; Chop and
  Winter waves unchanged.
- Playtest `--compare origin/main`, the /tmp idle and flee bots on Bear Trap, smoke shots, determinism.
