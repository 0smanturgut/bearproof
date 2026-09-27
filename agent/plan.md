# Build #6 plan: Rug Lord's second phase

## Regression check first

Build #5 didn't change the simulation (bounty only). Live data: median 5:35 (was 7:30 on Build #4), wins 4 → 0,
boss kills per run 1.24 → 0.57, rejected replays 6 → 0. Tongue (Pepe's starter) is in 75% of runs, Horns fell
84% → 38%, so most runs moved to Pepe. `playtest --compare build-4` is identical (3:41 → 3:41), and Pepe on the
autopilot matches the bull (3:41). Nothing in the code to fix; report it honestly with the limits.

## Feature

No vote today, so the top backlog item: **Rug Lord's second phase**. Below 50% HP he pulls the rug:

- He enrages once (toast, shake, red flash): "RUG LORD IS PULLING THE RUG".
- Every 5 s: a 0.8 s warning (the rug appears under the bull, pointing at him), then a 1.6 s pull that slides the
  bull toward him at 110 px/s (130 was tried: running away barely gained ground). The bull runs at 240, so running away still gains on a boss walking at 80.
- Direction is fixed when the warning starts (no rng), stops the moment he dies.
- Rug Lord is the first boss (5:00, 4:00 on Bear Trap) and ends 21.7% of runs via his rug pullers; the backlog
  item is the one players meet first as a boss.

## Files

- `game/src/sim/content.js`: `phase2` data on RUG_LORD.
- `game/src/sim/entities.js`: the phase logic on the boss Enemy.
- `game/src/sim/sim.js`: `SIM_VERSION` 4 → 5; `game/test/twist.test.js` pin.
- `game/src/art/items.js`, `game/src/art/sprites.js`: a scrolling rug sprite.
- `game/src/render.js`: draw the rug under the bull during warning and pull.
- `game/src/game.js`, `game/src/audio.js`: toast, shake, whoosh, haptics.
- `game/test/rug.test.js`: phase trigger, warning, pull distance, escape, stops on death.

## Test

Unit tests on the boss directly, `playtest --compare origin/main`, smoke screenshots (temporarily force the rug
on screen at the smoke shot), sprite preview, determinism gate.
