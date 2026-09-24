# Build #3 plan: Pepe, the second character, and a character select

## Feature

Holders' request (100% of the vote, requested by 3hup…f7Q8): a character select and a second character, Pepe.
Osman's operator note for Build #3 approves the name "Pepe" for our own frog, drawn from scratch.

- **Pepe** (`CHARACTER_IDS[1] = 'pepe'`): an original pixel frog (green, big round eyes, wide smug mouth,
  relaxed sitting pose that hops when it moves). Own details: a gold candle-wick pendant and a pink tongue tip.
- **Starter weapon: Tongue Lash** (new `tongue` weapon type). Every cooldown it lashes at the nearest bear and hits
  every bear along the line, out to long range. Long and narrow, where the bull's Horns are short and wide.
  Evolves at level 5 into **Liquidity Grab**: three tongues in a fan. Pepe only.
- **Plays differently**: Pepe is quicker (+10% move speed) and squishier (90 max HP instead of 100). Both are
  character fields read by the Simulation.
- **Character select** on the start screen: two buttons (bull / Pepe), one tap, saved in `prefs.character`.
  The hero sprite and tagline change with the pick. The bull stays the default.

## Why today

It won the vote with 100%, and the operator approved it. Player data: the median run on Build #2 was 2:10 and
paper hands + rug pullers made up 31% of deaths, mostly early crowds. A long piercing lash that cuts a lane through
a crowd is a real alternative opening to the Horns.

## Files

- `game/src/sim/content.js`: `TONGUE` weapon, `pepe` character (`starterWeapon`, `maxHp`, `speedMult`, `sprite`).
- `game/src/sim/weapons.js`: the `tongue` fire strategy.
- `game/src/sim/sim.js` + `entities.js`: apply the character's HP and speed. The Tongue Lash is Pepe's
  signature weapon (only offered to Pepe), so every bull run replays bit-identically and `SIM_VERSION` stays 2;
  the playtest compare for the bull must come out identical to prove it.
- `game/src/art/creatures.js` (pepe), `icons.js` (tongue icon), `sprites.js` (register).
- `game/src/render.js`: draw the chosen character's sprite. `game/src/game.js`: tongue fx + sound.
- `game/index.html`, `game/styles.css`, `game/src/main.js`: character select.
- `game/test/pepe.test.js`: character stats, tongue hits along a line, not off-line, evolution fans, replay.

## Test

`npm run check`, `node --test game/test/art.test.js`, playtest `--compare origin/main` for the bull and
`--character pepe`, smoke shots (phone + desktop title), determinism on chromium.
