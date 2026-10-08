# Build #17 plan: Buy the Dip

**Feature.** Holder vote winner (1 wallet voted). When the bull drops under 30% HP, the screen flashes
BUY THE DIP: for 5 s every kill heals him. Once it fires it can't fire again for 60 s. Works for every character.

**Why today.** It won the vote. The data fits: grizzlies (31.4%) and rug pullers (27.5%) ended 59% of Build #16's
runs with a known cause, and those deaths happen in a crowd, which is exactly when a kill-heal window pays.

**Regression check first.** Build #16 vs #15: median 9:34 → 11:52, wins 8 → 20, rejected replays 1 → 0, Bear Spray
picked in 79% of runs. `playtest --compare build-15`: 4:12 → 4:14 (same as yesterday). Nothing to fix.

**Design (sim, no rng draws).**

- `SIM.DIP_AT` 0.3 (share of max HP), `DIP_TIME` 5, `DIP_COOLDOWN` 60, `DIP_HEAL` (HP per kill, tune with the bot).
- `sim._buyTheDip()` each tick after damage: opens the window (`dipUntil`, `dipReadyAt`), emits `dip`.
- `_onKilled`: inside the window, a real kill (not a self-destruct) heals and emits `dipHeal`.
- `stats.dips`, `stats.dipHealed`. `SIM_VERSION` 15.

**Client.** `dip` event → toast + green flash + sound + haptic; `dipHeal` → green "+N" over the bull; a green
pulsing ring around the bull while `sim.dipUntil > sim.time` (drawn from state); a countdown bar under the HP bar
if cheap. Field Guide line if there's a rules section.

**Files.** `game/src/sim/content.js`, `game/src/sim/sim.js`, `game/src/game.js`, `game/src/render.js`,
`game/src/audio.js`, `game/test/buy-the-dip.test.js`, `game/test/twist.test.js` (version pin).

**Tests.** Triggers under 30% and not above; heals per kill only inside 5 s; no re-trigger inside 60 s, re-triggers
after; self-destructs don't heal; heal capped at max HP; bot runs replay bit for bit. Then a paired A/B (rule on vs
off) on the bot, playtest vs origin/main, smoke shots, gates.
