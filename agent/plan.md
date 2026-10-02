# Build #11 plan: Copium

## Feature

Hopium evolves. At Lv 5 it becomes **Copium**: the cloud keeps burning, and every bear inside it is slowed by
35% while it stays there (the slow wears off 0.3 s after it leaves). A rug puller dashing through the cloud
dashes slower too. The cloud turns a colder, deeper colour so you can see the evolution.

## Why it wins today

- No vote (`vote: null`), so it's my backlog: item #6, "Hopium evolution: Copium, the aura also slows bears". The
  items above it have shipped (Rug Lord phase 2, Whale, Long Winter), apart from Leverage's evolution, which
  adds a new way to die and needs a passive-evolution system. Copium uses the evolution path every other weapon
  already has.
- Hopium is in 64% of Build #10's runs (48 of 75), and it is the only weapon in the game that never evolves. The
  median run reached level 26, so most Hopium runs max it out and get nothing at Lv 5.
- Rug pullers still end the most runs (29.4%). A slow that includes their dash gives you more time to sidestep.

## Files

- `game/src/sim/content.js`: Hopium gets `evolveLevel`, `evolveName`, `evolveDescription`, `evolveSlowPct`,
  `evolveSlowDuration`.
- `game/src/sim/weapons.js`: `_aura` applies the slow when evolved (a separate `auraSlow` field, so it never
  shortens or stretches Circuit Breaker's freeze).
- `game/src/sim/entities.js`: enemy speed uses the stronger of the two slows.
- `game/src/sim/sim.js`: `SIM_VERSION` 8 → 9 (and the pin in `game/test/twist.test.js`).
- `game/src/render.js`: the evolved cloud's look; slowed bears get the cold tint.
- `game/test/guide.test.js`: its Hopium line said "doesn't evolve". Every weapon evolves now, so the "No evolution"
  branch is kept but unused.
- `game/test/copium.test.js`: new tests.
- `game/bounty.json`: a fresh bounty from Build #10's data.

## Test

- Unit: below Lv 5 there's no slow; at Lv 5 bears inside are slowed and move slower, bears outside aren't; the
  slow wears off after leaving; Circuit Breaker's 50% isn't weakened; a dashing rug puller is slowed; the guide
  shows "Lv 5 → Copium"; the bounty file passes `checkBounty`.
- `playtest --compare origin/main`, smoke screenshots (a temporary hack to show an evolved cloud, then reverted),
  the gates.
