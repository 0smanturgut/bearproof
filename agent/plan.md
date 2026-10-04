# Build #13 plan: Pump and Dump

**Feature.** A new bear, Pump and Dump: a balloon on stubby legs that swells as it walks at you (green while it
pumps, red when it's about to dump). Pop it and red candles spill out: 2 if you pop it early, up to 6 at full size.
If it reaches you fully pumped, it dumps on its own: 6 red candles at point blank and no XP for you. In the wave
pools from 2:30.

**Why today.** It won the holder vote (1 wallet voted). Build #12's regression check found nothing to fix first.

**Regression check.** Build #12 vs #11: median 7:19 → 8:15, deaths shifted to Liquidation/bag holders (a different
Daily stage; Liquidation at 10:00 means it wasn't Winter). `playtest --compare build-11`: 3:35 → 3:47; bull with
Daily twists on 80 seeds 4:43 → 4:45, no early deaths. Nothing to fix.

**Files.**

- `game/src/sim/content.js`: `ENEMIES.PUMP_DUMP` (pumper archetype), new 2:30–3:00 wave window, pump_dump in later
  pools.
- `game/src/sim/entities.js`: swell (pump 0→1 over 6 s, size 14→26) and self-dump when fully pumped and close.
- `game/src/sim/sim.js`: dump candles on death (2 + 4×pump), `dump` event, wave toast only on a new label,
  `SIM_VERSION` 11.
- `game/src/art/creatures.js` + `sprites.js`: `pumpDump` sprite, 4 frames = 4 swell stages.
- `game/src/render.js`: frame by swell, wobble when full. `game/src/game.js`/fx/audio: pop burst + sound.
- `game/test/pump-dump.test.js`.

**Tests.** Swell rate and size; kill early → 2 candles, kill full → 6; self-dump at full near the bull gives no XP
and 6 candles; never in pools before 2:30, present after; bot run replays bit for bit. Then playtest --compare
origin/main, smoke shots, determinism.
