# Build #15 plan: Exit Scam

**Feature.** A new bear, the Exit Scammer: a bear in a hoodie with a sack. From 3:00, one walks in every 45 s. It
ignores the bull and heads for loose XP candles on the floor, pocketing each one it touches. Once the sack holds 8
candles, or 10 s after its first grab, or when there's nothing left to take, it runs straight away from the bull at
200 (the bull runs 240). If it gets 650 away, it's gone with the XP ("EXIT SCAMMED"). Kill it and the whole bag spills
out as candles around it ("BAG RECOVERED"). While it runs off screen, an arrow on the screen edge points at it.

**Why today.** It won the holder vote (1 wallet voted), and it was my proposal. Build #14's median run was 5:36, so
the 3:00 start reaches most runs. It's a chase moment: leave your spot to get your XP back, or let it go.

**Regression check.** Build #14 (67 runs) vs #13 (115 runs): grizzly deaths 15.3% → 27.4%, doomposters a new #3
(14.5%). The 6 Oct Daily was Bear Trap (doomposters ×1.8) on Leverage Day (bears hit 50% harder).
`playtest --compare build-13` is identical (3:40 → 3:40), and with `--twist leverage_day` grizzlies cause 69% of
deaths on both builds. It's the Daily, not Build #14. Nothing to fix.

**Files.**

- `game/src/sim/content.js`: `ENEMIES.EXIT_SCAM` (`thief` archetype), `SIM.SCAM_FIRST/SCAM_EVERY`.
- `game/src/sim/entities.js`: thief behaviour (seek candle, grab, run, escape), `bag`/`bagCount`/`fleeing`.
- `game/src/sim/sim.js`: the 3:00 + every 45 s spawn, the bag spill on kill, stats. `SIM_VERSION` 13.
- `game/src/art/creatures.js`, `sprites.js`: the `exit_scam` sprite (4-frame run).
- `game/src/render.js`: the bag count over its head, the edge arrow while it runs; `game.js`, `audio.js`: toasts,
  sounds, bursts. `guide.js`: when it shows up.
- `game/test/exit-scam.test.js`; `twist.test.js` SIM_VERSION pin.

**Tests.** It spawns at 3:00 and every 45 s after; it walks to a candle and pockets it (the candle is gone, the bag
has its value); it runs when the bag is full or greed runs out; it escapes past 650 and takes the XP; killing it spills
exactly the bag plus its own XP; it never takes a falling jackpot candle or a vacuumed one; a run replays bit for bit.
Then a /tmp diagnostic counting grabs, busts and escapes on bot runs, playtest --compare origin/main, smoke shots,
determinism.
