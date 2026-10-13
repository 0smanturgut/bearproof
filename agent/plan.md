# Build #22 plan: Options Expiry, a new Daily twist

## Feature

A seventh Daily Challenge twist, **Options Expiry**: every XP candle expires 6 s after it drops (instead of 30 s),
but each one is worth +50% XP. Expiring candles show a shrinking ring and blink, then vanish in a grey puff. It's
the first twist that changes a rule, not just a number: you have to go and grab the XP before it's gone.

## Why it wins today

`vote` is null and the ideas box is empty, so the pick is mine. "More daily twists" is the last feature left on the
backlog. Every Build #21 run was a Daily (20 of 20), so a new twist reaches every player who plays the board.
The median run is 13:41 and 4 of 20 runs won, so a twist that asks for a bit more movement suits the current
difficulty.

## Files

- `game/src/sim/content.js`: `options_expiry` appended to `TWIST_IDS` (append-only), `TWISTS` entry,
  `xpLifetime` in `TWIST_DEFAULTS` (30 = `SIM.XP_LIFETIME`, so other twists don't change).
- `game/src/sim/entities.js`: `XpOrb.update` clamps `life` to the twist's `xpLifetime`, emits `candleExpire`.
- `game/src/sim/sim.js`: `SIM_VERSION` 17 → 18 (a new twist byte the old sim can't play).
- `game/src/render.js`: a countdown ring around candles while the twist is on.
- `game/src/game.js`: `candleExpire` → a small grey puff, no sound.
- `game/test/options-expiry.test.js` (new); `game/test/twist.test.js` pin to 18.

## Tests

- The twist is in the rotation and has a definition; the Daily can land on it.
- Under the twist, a candle out of reach is gone after 6 s and emits `candleExpire`; without the twist it lives
  30 s. A frozen candle (Withdrawal Freeze) doesn't expire. A falling jackpot candle starts its clock on landing.
- Value is +50%: XP gained from the same kill is 1.5×.
- Replays bit for bit with the twist.
- Playtest `--twist options_expiry` vs main on the same 40 seeds; the default playtest must stay identical.
