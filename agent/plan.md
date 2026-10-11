# Build #20 plan: Withdrawal Freeze (Crypto Winter mini-boss)

**Regression check first.** Build #19 (Badges) never touched the sim. `playtest --compare build-18` is identical
(4:14 → 4:14). Players: median 7:26 → 8:41 (Build #18's 48 h vs Build #19's 24 h), 0 rejected replays of 36. Rug
pullers rose 32% → 51.5% of deaths, but with no sim change that is the Daily's mix (Winter weights rug pullers 1.5×),
not a bug. Nothing to fix.

**Feature.** `vote: null`, so the top unshipped backlog item: the Crypto Winter mini-boss (items 1–3, 5–7 shipped
already). An ice bear hugging a padlocked vault, "Withdrawal Freeze", at 3:30 on Winter only. It jumps like the
other charge bosses (red ring, 1 s crouch) and freezes every landed XP candle within 150 of it. Kill it and
withdrawals reopen: the frozen candles fly to you and a frost burst slows every bear within 360 by 50% for 3 s.

**Why today.** Free runs and Dailies both take the stage from the seed, so one run in three is Winter. Rug pullers
ended 51.5% of runs, and Winter is where they're thickest. The thaw's slow is a breather against them, and the
frozen pile turns into a level-up burst you can clip.

**Files.** `game/src/sim/content.js` (boss def, `onlyStage` in `bossesFor`), `sim.js` (`freezeCandles`, `_thaw`,
stats, `SIM_VERSION` 17), `entities.js` (frozen candles, scammers skip them), `bot.js` (ignores frozen candles),
`art/bosses.js` + `art/items.js` + `art/sprites.js` (boss, frozen candle), `render.js` (frost ring, ice cubes),
`game.js` + `audio.js` (freeze tick, thaw burst, toast, sound).

**Tests.** `game/test/withdrawal-freeze.test.js`: Winter-only schedule; it spawns with a warning; the freeze radius,
falling candles and other bosses; frozen candles can't be picked up, scammed or expire; the thaw sends candles home
and slows only nearby bears; bot determinism. Winter A/B on 60 paired seeds per character. Browser shots.
