# Build #10 plan: Field Guide

## Regression check (done first)

- Build #9 vs #8 (players): median 4:20 → 4:50, best 20:00 both, wins 1 → 2, boss kills/run 0.34 → 0.52, rejected
  replays 0 → 2 (of 242). Rug pullers 37.3% → 47.9% of deaths.
- `playtest --compare build-8`: 3:35 → 3:35, rug_puller deaths 26% → 25%. The build didn't move rug pullers.
- The day did: 1 Oct Daily was Crypto Winter (rug pullers ×1.5 in the pool) with Leverage Day (they hit 50% harder).
  Same sim, 60 winter seeds: Bull Run 18% rug deaths, Leverage Day 27%. Boss-kill runs under both twists replay
  bit for bit (3/3). Nothing to fix.

## Feature

Field Guide (holder vote, 1 wallet; from a player's idea). A GUIDE button on the start screen opens a page with
four tabs: Weapons, Passives, Bears, Bosses. Each entry: its icon or sprite, name, what it does, its numbers,
and for weapons what it evolves into at level 5. Bears show when they first show up (from the wave table) and a
tip. Bosses show their arrival time and what they do.

Why it wins: the holders picked it, and a player asked for it. Rug pullers ended 47.9% of runs yesterday; a page
that says "dashes every 3.5 s, sidestep it" is the cheapest help a new player can get.

## Files

- `game/src/guide.js` (new): pure data builder, `guideSections()` from content.js. No DOM.
- `game/src/sim/content.js`: display-only `description`/`tip` on ENEMIES and BOSSES (no sim change, no
  SIM_VERSION bump).
- `game/src/ui.js`: `showGuide(tab)` renders the page.
- `game/index.html`, `game/styles.css`: the button, the screen, tabs, entries.
- `game/src/main.js`: wire the button and back.
- `game/test/guide.test.js` (new).

## Tests

- Every weapon, passive, enemy and boss appears exactly once; every icon/sprite id exists in the art tables.
- Every weapon with an evolution shows it; first-seen times match WAVES (rug puller 1:30); summoned/split-only
  bears say where they come from; Pepe's weapon says Pepe only.
- Smoke screenshots on phone and desktop with the guide open; gates; determinism unchanged.
