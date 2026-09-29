# Build #8 plan: Whale Alert

## Regression check first

Build #7 live (24 h): 48 verified runs, 15 players, median 4:55 (Build #6, 48 h: 2:14 over 32 runs), p75 10:21
(was 8:56), best 20:00 (was 16:19), 0 wins (was 2). Doomposters fell from the top killer (26.7%) to 6.3%, which is
what Build #7 was for. Grizzlies and rug pullers now lead at 18.8% each (rug pullers were 13.3%). Rejected replays
0 → 0. `playtest --compare build-6`: 3:41 → 3:49 on the same 40 seeds, the known effect of Build #7. Nothing
broke. Worth noting: the bull's median is 2:32 against Pepe's 7:04 (Build #6: 0:54 against 7:19). That gap was
there before Build #7, and on the autopilot the two characters are even, so it's probably who plays which. Small
sample.

## Feature

No vote (the third night running). Backlog #1 (Rug Lord's phase 2) has shipped. #2 (Leverage evolution) serves a
passive that isn't in Build #7's top ten. #3 is the whale event, and every run gets to see it:

- **Whale Alert** at 1:27: a toast and a blinking marker on the screen edge the whale will come from.
- At 1:30 a whale swims across the screen, level with the bull and 70 to 130 units above or below it, at 150
  units/s. Bears it touches get shoved out of its lane and dazed (slowed 50% for 1.2 s). Bosses don't move.
- It drops an XP candle every 50 units it swims: 26 candles of 12 XP (312 XP, about a level and a half at 1:30),
  if you go and get them.
- Once per run. The bull's median run on Build #7 was 2:32, so even short runs see it.
- Sim: `Whale` in entities.js, SIM constants in content.js, `_whaleTick` in sim.js. The lane and the side come
  from `sim.rng` → `SIM_VERSION` 7 (update the pin in twist.test.js).
- Client: a whale sprite drawn from scratch (creatures.js, registered in sprites.js), an edge marker, a spray of
  water on shoved bears, a low whale call, and a toast.

## Files

- `game/src/sim/content.js`, `game/src/sim/entities.js`, `game/src/sim/sim.js`, `game/test/twist.test.js`
- `game/src/art/creatures.js`, `game/src/art/sprites.js`, `game/src/render.js`, `game/src/game.js`,
  `game/src/audio.js`
- `game/test/whale.test.js` (new)

## Tests

`whale.test.js`: a warning, then exactly one whale per run at 1:30, crossing on screen; bears in its lane get
shoved out and dazed while bosses don't; the candles add up to 312 XP; the whale is gone after it crosses; and a
run through the whale replays bit for bit from its run log. Then `playtest --compare origin/main`, smoke shots
(temporarily moving the whale to 0:43 so it's in the 0:45 shot), the art test and the three gates.
