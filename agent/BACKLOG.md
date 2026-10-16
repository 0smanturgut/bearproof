# The Build Agent's backlog

What the Build Agent builds when holders don't pick something else. The operator maintains this file between runs
(the agent can't edit it, so it can't rewrite its own guardrails); the agent may suggest a different order in
`agent/notes.md`.

Since Build #25 every build is a major update (`## The bar` in `agent/PROMPT.md`): BEARPROOF is heading for Steam
and the app stores, so each night has to make it a bigger, deeper, more complete game.

## Road to 1.0

In order. Take the first one that isn't shipped and fits inside your paths. Each line is one night unless it says
"part 1"; then ship part 1 complete and put part 2 on the next ballot.

1. **Profile, player level, currency and the Market (part 1).** One save profile that keeps everything a player owns: lifetime
   stats, best run per character and per map, badges, unlocks, settings. Every run pays out an in-game currency
   (for time survived, kills, bosses, the bounty), shown with a satisfying count-up on the game-over screen. A
   Market screen off the start menu spends it on things that don't touch the simulation: skins for the bull and
   Pepe (recoloured and re-detailed in the pixel engine, not a tint), and a trail or a death effect. Give the
   currency a themed name that isn't "coin" or "token". Keep it fair: everything in part 1 is cosmetic. A player level
   rises with every run (shown on the start screen with a bar, a level-up moment and a small currency reward), so
   progress carries over between runs. The public promise (an X post, 16 Oct) is "levels and progression, new
   characters to unlock, an in-game shop" before the stores: items 1 to 3 are that promise.
2. **A third playable character, unlocked in the Market.** Original, on theme, with their own animated sprite,
   starter weapon, a trait that changes how a run plays (not just numbers), stats, select card and sounds. Price
   them so a few good runs unlock them; the bull and Pepe stay free.
3. **A fourth map, unlocked in the Market.** Its own ground and props, enemy mix with at least one new enemy, a
   hazard or rule only it has, its own boss or boss variant, a music mood, and a map pick for free play (choose
   the seed, see `agent/PROMPT.md`). The Daily keeps rotating through every map.
4. **Missions.** A list of goals per character and per map ("Survive 10:00 on Crypto Winter as Pepe", "Kill Rug
   Lord without taking a hit") that pay currency once, with progress shown on the start screen and a toast when
   one completes. Replaces nothing: badges stay.
5. **Endless mode, or Boss Rush.** A second mode next to free play and the Daily, with its own board label on the
   game-over screen (the score stays a free run unless the operator adds a mode byte to the run log).
6. **Evolutions for every weapon.** A full evolution table: each base weapon has an evolution with its own art,
   effect and the passive it needs, and the level-up card says what it will become. A "Collection" screen shows
   every weapon, passive, evolution, enemy and boss seen so far.
7. **Run summary.** Damage per weapon, kills per enemy type, a timeline of levels and bosses, best moment; shareable.
8. **First-run tutorial and a pause menu worth the name.** A 30-second guided first run on phones and desktops,
   and a pause menu with settings (volume, shake, damage numbers, quality), controls and quit.
9. **More characters and maps.** After the four above, alternate: a character one night, a map the next, each
   unlocked in the Market. Holders' ideas welcome (The Whale, The Degen, The Miner have been asked for before).
10. **Localization.** Every string in one table, then Turkish, Spanish and Portuguese, with a language picker.

### Waiting on the operator

These need code outside the agent's paths first. The operator adds the base in a bootstrap session, says so in
`agent/OPERATOR.md`, and then the agent builds the game side.

- **Permanent upgrades in the Market** (more HP, speed, magnet range...): need a loadout slot in the run log so the
  server re-simulates them. Free play only; the Daily stays upgrade-free.
- **Accounts and cloud save**: sign-in and a profile API on the Worker. Until then the save stays on the device.
- **Store builds** (Steam, App Store, Google Play wrappers, store pages, achievements APIs): operator work.

## Also in this build (small, when there's time)

- **Rug Pull Warning**: rug pullers flash a red line along their dash path before they go.
- **Level-Up Meter**: a fatter XP bar that counts down the candles to the next level.
- **Rug Lord's second phase**: below 50% HP he pulls the rug: the floor scrolls and the player slides.
- **Whale event**: once per run a whale crosses the screen and drops a burst of XP candles.
- **More daily twists**: the twist table (`TWISTS` in `game/src/sim/content.js`) has room for more rule changes.

## Bugs and debt

- Characters vanish on some Android phones (a player on a Samsung A52 with Chrome, 30 Sep): after a canvas
  context loss the baked sprite canvases come back blank and are never redrawn. See the Build #9 note in
  `agent/OPERATOR.md`.
- Horns only hit left and right; a vertical swing on evolution could feel better.
- Take-profit cards appear only when everything is maxed; consider a heal card at low HP.
- Bot check on the receipt screen (`game/src/turnstile.js`): when Turnstile wants a tap, the box appears with no
  hint and the submit gives up after 15 s, so the run ranks without a passed check and can't win the prize. Show
  a line like "Tap the box to make this run prize-eligible", wait up to 2 minutes once the widget turns
  interactive (`before-interactive-callback`), and keep the rest of the receipt usable meanwhile.
