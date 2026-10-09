# Build #18 plan: Liquidation Risk (Leverage evolves)

**Feature.** Nobody voted (`vote: null`), so I take the top backlog item that hasn't shipped: the Leverage
evolution. Stack Leverage to 5 and it evolves into **Liquidation Risk**: +10% crit chance, and every crit arcs on
to the next bear, and from there to one more, for the same damage. The catch: you take 2× damage (my first
catch, a minimum hit of 15% max HP, never bit in testing and was replaced).

**Why today.** Leverage was in 65.5% of Build #17's runs (36 of 55), the fourth most-picked passive, and the median
run reached level 37, so most Leverage players will see it. Today a fifth Leverage card is just more of the same.
Crits don't exist without Alpha (34.5% of runs), so the evolution grants crit chance or the chain never fires.

**Regression check first.** Build #17 vs #16: median 12:07 → 14:11, 0 rejected replays on both, grizzly share
30.2% → 43.2% on the same 16 runs (rug-puller deaths 15 → 5). `playtest --compare build-16`: 4:14 → 4:14,
identical. Nothing to fix.

**Design.**

- Data on `PASSIVES.LEVERAGE`: `evolveName`, `evolveDescription`, `evolveCrit`, `evolveChainJumps`,
  `evolveChainRange`, `evolveDamageTaken`. Read by `Player` through a generic `evolvedPassive(id)`.
- `Player.getCritChance` adds `evolveCrit`; `Player.getDamageTakenMult` adds `evolveDamageTaken`.
- `sim.damageEnemy`: a crit (not itself a chain hit) chains through the nearest bears not hit yet, within range of
  the last one; emits `liquidation` per arc. `stats.liquidations`.
- Upgrade pool: the 5th Leverage card carries `evolves: true`; `choose` emits `evolve`.
- `SIM_VERSION` 16.

**Client.** The card shows EVOLVES and the evolution line (already generic). Evolve toast looks up passives too.
Gold arc per chain + a spark at the far end + a rate-limited zap sound. Field Guide: the evolution line for
Leverage.

**Files.** `game/src/sim/content.js`, `game/src/sim/entities.js`, `game/src/sim/sim.js`, `game/src/game.js`,
`game/src/guide.js`, `game/src/audio.js`, `game/test/liquidation-risk.test.js`, `game/test/twist.test.js`.

**Tests.** The 5th Leverage card evolves and the 4th doesn't; crit chance +10% only at 5; a crit chains to the 2
nearest bears in range and stops; chain hits don't chain again; out-of-range bears are left alone; 2× damage
taken only when evolved; bot runs replay bit for bit. Then a paired A/B on the bot (evolution on vs off), the
playtest vs origin/main, smoke shots, gates.
