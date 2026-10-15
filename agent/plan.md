# Build #24 plan: Honey Trap

## Feature

**Honey Trap**, a new weapon in the level-up pool (both characters). Every 3.2 s it lobs a honey jar at the
nearest bear. The jar flies for 0.4 s, splashes for damage and leaves a honey puddle for 4 s. Bears in the puddle
move 55% slower, and a dashing rug puller sticks too. A grizzly that walks in sits down and eats: it stops until
the honey is gone. Bosses don't stick. At Lv 5 it evolves into **Honeypot** ("you can buy in, you can't sell"):
puddles 40% bigger, they last 6 s, and they burn every bear inside twice a second.

## Why today

- No vote (nobody voted for Build #24), the ideas box has nothing I can ship safely tonight (aiming needs new
  input codes in the run log, outside my paths; there is already an XP bar), and the chat only had praise.
- Rug pullers (27.9%) and grizzlies (23.5%) ended half of Build #23's 319 lost runs. Honey Trap goes at both.
  It was on last night's ballot, where nobody voted.

## Regression check (done before coding)

- Build #23 vs #22: median 2:45 → 7:41 on 360 vs 194 runs, doomposters 13.7% → under 3.8%, rejected replays 0 → 2.
  `playtest --compare build-22`: 4:41 → 3:40, the reshuffle noise measured last night.
- Bull 4:33 vs Pepe 10:09 live. Bots (survive, idle, flee, circle) show no gap: selection (first runs are bull
  runs), not a sim bug. No change.

## Files

- `game/src/sim/content.js`: `WEAPONS.HONEY_TRAP`, appended.
- `game/src/sim/weapons.js`: `_honey`.
- `game/src/sim/entities.js`: `HoneyJar` entity, `Enemy.honeyTimer/honeyPct` in the slow.
- `game/src/sim/sim.js`: `sim.honey` list, `stats.honeyEaten`, `SIM_VERSION` 20.
- `game/src/render.js`: puddles on the ground, jars in flight, a honey tint.
- `game/src/game.js`: splash and eat juice + sound; `game/src/audio.js`: `honey` sfx.
- `game/src/art/items.js`, `icons.js`, `sprites.js`: `honey_jar` sprite, `honey_trap` icon.
- `game/test/honey-trap.test.js`: new tests. `twist.test.js` SIM_VERSION pin.

## Tests

- Unit: throws at the nearest bear, splash damage on landing, slow inside, none outside, grizzly stops, boss
  untouched, puddle expires, evolved puddle is bigger/longer and burns, bot run with honey replays bit for bit.
- Playtest `--compare origin/main` plus an always-take vs ghost (effect off) A/B on 120 seeds.
- Smoke screenshots, sprite preview of the jar and icon, determinism gate.
