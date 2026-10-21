# Build #30 plan: Evolve everything + a Collection

## Why today

Vote winner (12 voters, 9 of them), Road to 1.0 #6. Every weapon already "evolves" at Lv 5 on its own, so there's no
choice in it. Tonight evolutions become the build's goal: each weapon needs its own catalyst passive, the card tells
you, and a Collection screen shows what you've found.

## Parts

1. **Catalysts (sim).** Each weapon gets an `evolveWith` passive id. A weapon evolves at Lv 5 only if the bull owns
   that passive (any stack). Order doesn't matter: Lv 5 first, then the passive, evolves it on that pick (or chest).
   One `_checkEvolutions()` pass after every card or chest emits `evolve` for each newly evolved weapon. Weapons get
   an `owner` so `isEvolved()` can check. Weak evolutions get a real effect (Double Bounce: two cats).
   SIM_VERSION 25. Autopilot learns catalysts.
   Pairs: horns+momentum, green_candle+leverage, laser_eyes+alpha, diamond_hands+conviction, airdrop+compounding,
   limit_order+cold_wallet, hopium+dca, circuit_breaker+high_frequency, buyback+thick_skin, dead_cat+slippage,
   bear_spray+hedge, honey_trap+whale_gravity; signatures: tongue+liquidity, buy_wall+whale_gravity,
   pickaxe+high_frequency.
2. **Cards (UI).** Weapon card at Lv 4→5: "EVOLVES → X" if you own the catalyst, else "NEEDS <passive>". Passive
   card: "EVOLVES <weapon> → X" when it would, or "CATALYST: <weapon>" when it helps an owned weapon.
3. **Evolution moment.** A banner with the evolved icon, a ring and sparks, a new rising synth chord.
4. **Art.** 15 evolved icons `evo_<weaponId>` (icons.js style, 16×16), used on cards, the banner, HUD slots and the
   Collection.
5. **Collection.** The Field Guide becomes the Collection: weapons, evolutions (recipe shown, art and name locked
   until you evolve it), passives, bears, bosses lock until seen; counters per tab and a total. Seen ids live in
   `profile.seen` (pure `collection.js`, saved during the run). Loot and badges tabs stay.
6. **Tests.** catalyst rules (both orders, chest, no catalyst = no evolution), card fields, collection tracker and
   normalize, existing evolution tests updated to own the catalyst.

## Files

sim/content.js, sim/weapons.js, sim/sim.js, sim/entities.js (maybe), sim/bot.js, art/icons.js, art/sprites.js,
ui.js, guide.js, collection.js (new), profile.js, game.js, main.js, audio.js, index.html, styles.css, report.js,
tests.

## Order

1 → 2 → 6 (sim tests) → 4 (parallel, agent) → 3 → 5 → playtest/tune → gates → devlog.
If time runs short, 1+2+4 is already a complete update; the Collection is the part that waits.
