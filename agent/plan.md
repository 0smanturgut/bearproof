# Build #25 plan: Profile, CLOUT and the Market (Road to 1.0, part 1)

## Why this wins tonight

- The vote: "Global Boss Battle" (a holder's request, 1 wallet voted). Its core is a shared, server-side health bar,
  which is outside my paths, and the operator's note for this build says so: ship a single-player slice of it under
  "Also in this build" and headline Road to 1.0 item 1.
- Road to 1.0 item 1 is the public promise ("levels and progression, an in-game shop") and nothing shipped covers it.
- 246 verified runs from 43 players yesterday, median 8:12: people play many runs each (5.7 per player), so a
  reward that carries over between runs fits how they play.

## Parts

1. **Profile** (`game/src/profile.js`, stored inside the one prefs key): lifetime runs, time, kills, boss kills, wins,
   boss damage, best run per character and per map, player XP and level, CLOUT balance, owned items, equipped items.
   Normalised on load so an old save (or a broken one) never loses prefs, badges or name.
2. **CLOUT**, the play-only currency: paid by every finished run (time survived, bears rekt, bosses, a win, the
   bounty). Never bought, never traded, not a coin. Count-up on the game-over receipt, line by line, with a tick
   sound, then the player-level bar fills; a level-up pays a small CLOUT bonus with its own moment.
3. **Player level**: XP = CLOUT earned. Shown on the title screen in a profile strip (level, bar, balance) that opens
   the Market.
4. **The Market**: a screen off the title. Tabs: SKINS (2 bull, 2 Pepe, redrawn in the pixel engine), TRAILS (2),
   FINALES (2 death effects), STATS (lifetime stats, bests, the Eternal Bear). Buy, equip, unequip. All cosmetic:
   nothing touches the Simulation, so the Daily stays fair.
5. **Also: the Eternal Bear** (single-player slice of the holders' Global Boss Battle): one persistent boss whose
   bar every run's boss damage drains. When it falls you get a CLOUT bounty and it comes back bigger. The sim gets a
   pure counter `stats.bossDamage` (no result changes, no SIM_VERSION bump).

## Art and sound

- Skins: `bull`/`pepe` generators take a skin (materials + details: shades, glowing eyes, a scarf). Registered
  as sprites `bull_gold`, `bull_midnight`, `pepe_frost`, `pepe_night`.
- Trails and finales are fx bursts (respect reduced motion via fx.calm).
- Sounds: a CLOUT tick and a purchase chime in `audio.js`.

## Tests

- `game/test/profile.test.js`: payout formula, level curve, applyRun accumulates and keeps bests, buy/equip rules
  (no buying without balance, no double buy), normalisation of old/broken saves, Eternal Bear rollover, sim
  `bossDamage` counted and identical state hash.
- art.test for new sprites; smoke shots of title, Market and receipt.

## Files

`game/src/profile.js` (new), `prefs.js`, `sim/sim.js` (counter), `art/creatures.js`, `art/sprites.js`, `render.js`,
`game.js`, `ui.js`, `main.js`, `audio.js`, `index.html`, `styles.css`, `game/test/profile.test.js`.

## Order (so a cut still ships whole)

1. profile.js + tests → 2. payout on game over with count-up → 3. title strip → 4. Market with skins → 5. trails and
   finales → 6. Eternal Bear → 7. shots, gates, devlog.
