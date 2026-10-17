# Build #26 plan: Play as The Whale (Road to 1.0 #2)

## Why this wins tonight

- The vote: "Play as The Whale" won (2 votes), and it is Road to 1.0 item 2: a third character, unlocked in the
  Market. The vote and the roadmap agree, so it headlines; `chosenBy: holders` (the field's name for the vote).
- Regression check first: Build #25 was cosmetic. `playtest --compare build-24` is identical (4:16 → 4:16), so the
  live drop (median 8:31 → 6:30, bull 9:11 → 4:48, boss kills 2.02 → 1.16) is the Daily seed, not code. Both windows
  are 100% Daily, and #24's window held two Dailies. 1 replay rejected of 280: noted, not chased.
- CLOUT has nothing to buy that changes how you play. A character is the first thing in the Market that does,
  while staying fair: picking a character is allowed in the Daily, and the run log carries it.
- Data: rug pullers 38.8% and grizzlies 22% of deaths. Both rush you in a straight line. A slow, big character
  needs something that shoves rushers back, so the starter is a wall that pushes them away.

## The Whale

- **Stats:** 150 HP (bull 100, Pepe 90), 0.85× speed, a bigger body (size 24 vs 18: easier to touch, harder to
  dodge with). Slow and huge, as promised.
- **Starter weapon: Buy Wall** (Whale only, like Pepe's tongue). Every ~2.2 s a green wall of buy orders rolls out
  from the Whale. It hits each bear once as it passes and shoves it back (bosses don't move). Evolves at Lv5 into
  **Tsunami Bid**: a second, wider wall follows the first.
- **Trait: Sweep the Book.** Once a minute (1:00, 2:00, ...) every XP candle within 640 units (a phone screen)
  flies to the Whale, like a Magnet crate. Frozen and falling candles stay put. A HUD pip counts down to it, and it
  has its own toast, sound and ring.
- **Unlock:** 750 CLOUT in a new Market tab, Characters. The bull and Pepe stay free. The select card shows a lock
  and the price; tapping it opens the Market. Bought = selected.

## Parts, in build order (each step leaves a complete game)

1. Sim: `CHARACTERS.whale` (appended, index 2), `size`, `sweepEvery`/`sweepRadius`; `WEAPONS.BUY_WALL` (type
   'wall', `character: 'whale'`); a `BuyWall` entity in `sim.walls`; `_sweep()`; stats `swept`, `sweeps`; events
   `wall`, `sweep`. `SIM_VERSION` 21 (the new weapon changes the card pool for the other characters too).
2. Tests: `game/test/the-whale.test.js` (stats, the wall hits each bear once and shoves it, bosses don't move,
   evolved double wall, sweep timing/radius/frozen, card pool, run log round trip, determinism).
3. Art: `creatures.whaleHero` (40×32, 4-frame waddle, deep ocean blue, a gold chain, a spout), the `buy_wall`
   icon, the `whale` material; registered in sprites.js.
4. Render + juice: the wall ring with order-book ticks, the sweep ring, the sweep countdown pip, sfx (`wall`,
   `sweep`), toasts.
5. Profile/Market: `char_whale` item (`unlock: 'whale'`), `characterUnlocked()`, the Characters tab, the locked
   select card, fallback to the bull if not owned.
6. Playtest `--character whale --compare origin/main`, tune; smoke shots on phone and desktop; gates.
7. Devlog, proposals, X draft, notes.

## Files

`game/src/sim/{content,sim,entities,weapons}.js`, `game/src/art/{creatures,icons,materials,sprites}.js`,
`game/src/{render,game,audio,ui,main,profile}.js`, `game/styles.css`, `game/test/the-whale.test.js`,
`game/test/profile.test.js` (add cases), devlog, proposals, X draft, notes.
