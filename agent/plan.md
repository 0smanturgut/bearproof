# Build #14 plan: Liquidation Warning

**Feature.** The jumping bosses (Liquidation, The Long Winter, The Bear Market) stop teleporting without a tell.
When the jump comes up, the boss crouches and a red target ring flashes on the ground where it will land. An inner
ring closes in over 1 s, then it lands on that exact spot. Stand in the ring and the landing hits you (the ring is
the contact radius, boss size + your size). Step out and it lands on nothing. The jump is still up to 120 (140 for
The Bear Market) toward you, but it no longer overshoots past you: if you're closer than that, it lands on you.
Same 4.5 s cadence.

**Why today.** It won the holder vote (1 wallet voted), and it was my proposal. Liquidation ended 15.1% of Build #12's
runs (16 of 106 deaths), the #2 killer. A jump you can't see coming is the least fair death in the game.

**Regression check.** Build #13 vs #12: median 7:52 → 5:50, red candles a new #2 killer (14 runs, 18.4%). A /tmp diag
tagged Pump and Dump's candles: 3 of 160 careful-bot deaths. A reckless bot dies at 5–10 s, almost all of it to
red candles and bag holders, so the spike looks like early deaths or restarts, not the dump.
`playtest --compare build-12`: 3:47 → 3:40. Nothing to fix.

**Files.**

- `game/src/sim/content.js`: `chargeWarn: 1` on the three charge bosses, updated descriptions.
- `game/src/sim/entities.js`: `leapWarn/leapX/leapY/leapR` state, the boss holds still while it winds up, lands
  when the timer ends.
- `game/src/sim/sim.js`: `bossAbility` charge → mark the spot and emit `chargeWarn`; `_bossLand` moves it and
  emits `charge` (with `hit`). `SIM_VERSION` 12.
- `game/src/render.js`: the target ring on the ground, crouch squash on the boss.
- `game/src/game.js`, `game/src/audio.js`: warning sound, landing ring and shake.
- `game/test/liquidation-warning.test.js`; `twist.test.js` SIM_VERSION pin.

**Tests.** The boss braces for the warning and doesn't move; it lands on the marked spot even if the bull ran; a
bull in the ring takes the hit, a bull that stepped out doesn't; no overshoot; all three charge bosses warn; a bot
run with Liquidation replays bit for bit. Then playtest --compare origin/main, a /tmp bot from 10:00 to see the
boss's kill rate before and after, smoke shots with a forced ring, determinism.
