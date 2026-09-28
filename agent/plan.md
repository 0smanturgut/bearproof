# Build #7 plan: doomposters type before they post

## Regression check first

Build #6 live (24 h): 28 verified runs, 10 players, median 1:06 (Build #5: 5:27 over 72 runs), p75 8:56 (was
8:56), doomposters 29.6% of deaths (not in Build #5's top six), 0 rejected replays. `playtest --compare build-5`
is identical (3:41 → 3:41): the rug pull only touches runs that reach Rug Lord, so it can't explain a 1:06
median. The 28 Sep Daily was Bear Trap + Flash Crash: doomposters in every wave from 0:00 at 1.8× weight, twice
the spawns. The autopilot doesn't die early on that combo (a per-stage diagnostic: median 8:49, none dead
before 2:00), so it's a human problem: on a phone the view is ~520 wide, doomposters keep 260 away (the screen
edge) and fire from 360 (off-screen), with no tell. Nothing Build #6 changed is broken; small sample.

## Feature

No vote. Backlog #2 (Leverage evolution) serves a passive that isn't in Build #6's top ten picks; the top
killer is doomposters, so tonight's feature is theirs:

- **Typing tell.** Before every shot a doomposter stops, raises its phone and a "…" typing bubble pops over it
  for 0.6 s, then the shot goes where you were at the end of the wind-up. Cadence unchanged (2.4 s).
- **On screen.** Fire range 360 → 250, keep distance 260 → 200: on a phone they shoot from inside the view.
- Sound: a tiny keyboard tick at wind-up. Reduced motion: bubble without bounce.

## Files

- `game/src/sim/content.js` (doomposter data: `windup`, ranges), `game/src/sim/entities.js` (wind-up state),
  `game/src/sim/sim.js` (`SIM_VERSION` 6), `game/test/twist.test.js` (pin).
- `game/src/render.js` (bubble), `game/src/audio.js` + event hookup (tick).
- `game/test/doomposter.test.js` (new).

## Tests

- Wind-up: no shot before 0.6 s of typing, shot after, aimed at where the bull was when it fired; stands still
  while typing; never fires from beyond 250.
- Replays of autopilot runs on Bear Trap stay bit-identical through the run log.
- Playtest `--compare origin/main`, smoke shots on phone and desktop (bubble visible), determinism gate.
