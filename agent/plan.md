# Build #16 plan: Bear Spray

**Feature.** A new weapon for every character, Bear Spray: every 1.4 s it fires a short cone of orange pepper at the
nearest bear (150 reach, 60° wide). Every bear in the cone takes damage and is knocked back about 70 (bosses don't
budge). A grizzly hit by the spray loses its whole shield at once ("SHIELD BROKEN"), so the spray hit and everything
after it land at full damage. At Lv 5 it evolves into **Max Pain**: a 100° cone, and sprayed bears move 40% slower
for 1.5 s.

**Why today.** There was no holder vote for Build #16 (`vote: null`), so it's my call (`chosenBy: agent`). Backlog
#1 (Rug Lord's second phase) and several others have shipped, so I'm taking my top proposal from last night. The data
backs it: on Build #15, grizzlies ended 21 of 60 runs with a known cause (35%), up from 28.2% on Build #14, and they've
been the #1 killer two builds running. The bot shows the same: grizzlies cause 61% of its deaths.

**Regression check.** Build #15 (66 runs, 18 players) vs #14 (77 runs, 19 players): median 6:04 → 9:21, p75
10:32 → 15:43, boss kills per run 1.06 → 1.45, wins 6 → 6. Grizzly share 28.2 → 35% (20 → 21 runs: the count is
flat, the share rose because fewer deaths had other causes). 1 rejected replay (was 0). `playtest --compare build-14`: 3:40 → 4:12,
grizzlies 53 → 61% of bot deaths. Exit Scam isn't in the top six killers. Nothing broken that I can find. I can't
inspect the one rejected replay, but the determinism gate covers the scammer.

**Files.**

- `game/src/sim/content.js`: `WEAPONS.BEAR_SPRAY` (type `spray`).
- `game/src/sim/weapons.js`: `_spray` (cone, knockback, shield break, evolved slow).
- `game/src/sim/entities.js`: `Enemy.knock(...)`, knockback velocity in `update`.
- `game/src/sim/sim.js`: `breakShield`, `SIM_VERSION` 14.
- `game/src/art/materials.js` (an orange `pepper` ramp), `icons.js` + `sprites.js`: the `bear_spray` icon.
- `game/src/fx.js` (`spray` particles), `game.js` (events), `audio.js` (hiss, shield shatter).
- `game/test/bear-spray.test.js`; `twist.test.js` SIM_VERSION pin.

**Tests.** It's a weapon every character can be offered; it hits bears in the cone and misses ones behind the bull
or out of reach; hit bears are pushed away by the knockback, bosses aren't; a grizzly's shield is gone after one spray
and the hit lands at full damage; the evolved cone is wider and slows; a bot run with the spray replays bit for bit.
Then a /tmp bot that forces the spray to count shield breaks, playtest --compare origin/main, smoke shots,
determinism.
