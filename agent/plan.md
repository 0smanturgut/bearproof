# Build #19 plan: Badges (Achievements v2)

**Regression check first.** Build #18's median run halved (14:09 → 6:50, 51 runs) and rug pullers went from 13% to
36% of deaths. Same-seed playtest vs Build #17: identical (the bot never evolves Leverage). Forcing each Daily stage
on the same 40 seeds: Crypto Winter alone cuts the bot's median ~30% and lifts rug pullers to 25–38% of deaths, the
same mix as Build #18. Every run was a Daily, so the 10 Oct Daily was very likely a Winter day. Nothing to fix.

**Feature.** Nobody voted (`vote: null`), so I take the top backlog item that hasn't shipped: Achievements v2.
14 themed badges ("-50% Day", "Bought the Dip", "Rugged the Rugger", "Survived the Winter"...). Each unlocks
mid-run with a toast and a chime, is kept on the device, shows on the receipt ("NEW BADGES"), and the Field Guide
gets a Badges tab listing all of them, locked ones dimmed with how to get them.

**Why today.** A player sees it in their first run (the first-minute and 100-kill badges land early), and it gives
the features of the last week (Bear Spray, Buy the Dip, Liquidation Risk, Exit Scam) a goal to chase. No sim change.

**Files.**

- `game/src/achievements.js` (new): the badge list, a per-run tracker (`observe(sim, events)` returns new unlocks),
  the guide section. No DOM.
- `game/src/game.js`: tracker per run (not in attract), toast queue, save to prefs, list on the receipt.
- `game/src/prefs.js`: `achievements: {}`. `game/src/main.js`: Badges tab after the guide's four.
- `game/src/ui.js`, `game/index.html`, `game/styles.css`: receipt line, locked style, five tabs.

**Tests.** `game/test/achievements.test.js`: list is valid (unique ids, art exists), each badge unlocks on the right
state and not before, an unlocked badge never fires twice, "-50% Day" needs the 2 minutes, a real bot run unlocks
the early ones, the guide section marks locked/unlocked. Playtest must be identical (no sim change). Smoke shots.
