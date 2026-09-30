# Build #9 plan: Boss Jackpot

## Regression check first

Build #8 live (24 h): 220 verified runs, 45 players, all Daily, median 4:20 (Build #7, 48 h: 4:55 over 48 runs),
p75 9:40 (was 10:21), best 20:00 (same), 1 win (was 0), boss kills per run 0.33 (was 0.52). Rug pullers jumped to
37% of deaths (was 18.8%). Rejected replays 0 → 0. `playtest --compare build-7`: 3:49 → 3:35 (the known RNG shift
from the whale). The day's Daily was Crypto Winter + Bull Run (+25% spawn rate). `playtest --twist bull_run --runs
80 --compare build-7`: rug puller deaths 22% → 19%, so the whale doesn't feed them; the spike is most likely the
day's combo landing on Rug Season (1:00–2:00) with many new players. Nothing to fix.

## Feature

Holders' vote: Boss Jackpot (a player's idea from the ideas box, 2 wallets voted). A boss kill:

- pays a jackpot: 3× the boss's usual kill score (Rug Lord 2,500 → 7,500), `SIM.BOSS_JACKPOT_MULT`;
- rains its XP down as a ring of 10 gold candles around the body (same total XP, so balance stays put), each
  falling in with a short stagger (`XpOrb.fall`: can't be picked up or pulled until it lands);
- shows the payout as a big gold "JACKPOT +7,500" over the body, a coin-cascade sound, gold sparks raining.

Operator note: recover from a lost 2D canvas context (Android Chrome): on `contextrestored` and when the page is
visible again, empty the sprite cache (`sprites.js`) and the renderer's `_cache`, so everything re-bakes.

Score changes → `SIM_VERSION` 8 (pin in twist.test.js). Bounty: keep or retune from data.

## Files

- `game/src/sim/content.js`, `sim.js`, `entities.js`: jackpot score, candle ring, fall timer, event.
- `game/src/game.js`, `fx.js`, `render.js`, `audio.js`: jackpot number, falling candles, sound, cache reset.
- `game/src/art/sprites.js`: a cache-clear function.
- `game/test/jackpot.test.js`: score, ring, fall, replay; cache rebuild test. `twist.test.js` pin.

## Test

Unit tests above, `npm run check`, smoke (screenshot with a boss spawn moved early, then revert), determinism,
`playtest --compare origin/main`.
