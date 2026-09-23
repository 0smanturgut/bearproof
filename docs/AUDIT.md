# Audit of the fork point (`day-0`)

**Audited:** Wed 23 Sep 2026 · **Commit:** `e616704` (`release: v2.8.0`) of
[ricardo-foundry/canvas-vampire-survivors](https://github.com/ricardo-foundry/canvas-vampire-survivors) (MIT).
The local zip matched upstream `main` byte for byte. The full upstream history (25 commits) is kept in this
repo and the fork point is tagged `day-0`, so `git diff day-0..main` shows exactly what was added here.

## TL;DR

| Area               | Status                                                                                                                                                   | What we do about it                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Code quality       | Good. Modular ES modules, JSDoc everywhere, lint clean, zero runtime deps.                                                                               | Keep the module layout.                                                                           |
| Tests              | 279 unit tests, **277 pass**. The 2 failures are date time-bombs (hard-coded `2026-04-25` vs a 14-day prune window).                                     | Fix by injecting "now".                                                                           |
| Content model      | All content is plain data in `src/data.js` + `src/stages.js`.                                                                                            | Reskin mostly happens here. Good for the Build Agent.                                             |
| Determinism        | **Not deterministic.** "Daily" and "Speedrun" only seed the enemy-type pick and spawn angle. Everything else uses `Math.random` and variable frame `dt`. | Must refactor before replay verification (§5.3).                                                  |
| Headless sim       | **Not separable today.** The `Game` class mixes simulation, DOM, audio, input and rendering.                                                             | Extract a pure `Simulation` (fixed step, seeded RNG, event output).                               |
| Mobile             | Joystick exists, but the canvas is a fixed 1200×800 box letterboxed into the viewport. On a 375×812 phone the playfield is **375×250 px**.               | Full-viewport responsive canvas, portrait-first HUD.                                              |
| First-run friction | Two blocking modals (How to Play, then Tutorial offer) before the Start button.                                                                          | One tap to play. Hints go in-game.                                                                |
| Offline cache      | Service worker is cache-first with a hard-coded cache name (`survivor-v2.2.0`). Daily builds would be served stale.                                      | Immutable per-build paths (`/b/<n>/`) make cache-first safe.                                      |
| Assets             | No binary art, audio or fonts shipped. Sprites are canvas-drawn, audio is synthesised, icons are system emoji.                                           | Licensing is clean. We add OFL fonts and our own procedural pixel sprites (see `docs/ASSETS.md`). |
| Branding           | "Survivor", "Vampire Survivors style roguelite", a GitHub Pages URL, and purple vampire palette throughout.                                              | Replaced by the bull-vs-bear brand. Credit kept.                                                  |

## 1. Structure

```
index.html            Static shell: canvas, HUD, every overlay as a DOM node
styles.css            1150 lines, all UI styling (purple/vampire palette)
service-worker.js     Cache-first SW (stale-cache risk, see above)
server.js             Zero-dep Node dev server (static files, no-store)
game.js               Deprecated shim, only logs an error
src/
  main.js      1887   Game class: loop, spawn director, level-up flow, render, menus, debug hooks
  ui.js        1144   All DOM overlays; also owns the level-up roll (gameplay logic in the UI!)
  entities.js   973   Player, Enemy, Projectile, EnemyProjectile, OrbitShard, Mine, ExpOrb, Particle, FloatingText
  data.js       814   WEAPONS(11) PASSIVES(13) ENEMIES(11) BOSSES(5) WAVES(10) ACHIEVEMENTS(21) UNLOCKS
  weapons.js    406   Weapon class: melee / projectile / instant / aura / mine / nova / drain / orbit
  input.js      390   Keyboard, touch joystick (15% deadzone), gamepad polling, keymap
  storage.js    318   localStorage save, leaderboards, SeededRng (LCG)
  replay.js     306   Input recorder / player (RLE compressed move vectors)
  daily.js      285   UTC date → seed (cyrb53), stage rotation, streaks, Wordle-style share text
  stages.js     294   3 stages as modifier sets (pools, boss offsets, palette, tundra modifiers)
  i18n.js       278   en + zh-CN strings
  effects.js    259   Screen flash, ring pulse, hit bursts, emoji rain, and a delayed-callback queue
  keymap.js / konami.js / haptics.js / tutorial.js / achievements.js / audio.js / pool.js / spatial-hash.js / systems.js / config.js
test/                 16 files, node:test, no DOM needed (modules guard `window`/`document`)
scripts/              Playwright smoke tests (runtime-smoke.js, extended-smoke.js), screenshot capture, GIF script
.github/workflows/    ci.yml (lint + prettier + tests), deploy-pages.yml (GitHub Pages)
```

Dev tooling: ESLint 9, Prettier 3, Playwright + axe-core (dev only). Node ≥ 18.

## 2. How content is defined

- **Weapons** are data objects with a `type` that `Weapon.fire()` switches on (`melee`, `projectile`, `instant`,
  `aura`, `mine`, `nova`, `drain`, `orbit`). Scaling formulas are uniform (dmg +20%/lvl, cd ×0.92/lvl, range +10%/lvl).
  Level 5 is the "evolution". Per-weapon evolved behaviour is partly hard-coded by id in `weapons.js`
  (for example `if (this.id === 'knife')`), so renaming ids means touching code too.
- **Passives** are `{ effect: { statKey: value } }`, summed or multiplied by `Player`.
- **Enemies** use archetype flags (`ranged`, `dasher`, `splitter`, `shielded`, `bomber`, `illusionist`).
- **Bosses** carry `spawnAt` seconds and an `ability` (`summon` | `charge`).
- **Waves** are `[from, to)` windows with an enemy pool and spawn multiplier.
- **Stages** are modifier sets over waves/bosses (pool weights, extra enemies, boss offsets/overrides, speed/HP/cold tick).

A new enemy, weapon or boss that reuses an existing archetype is **data only**. That makes the content layer a good
surface for daily agent features. New archetypes need code in `entities.js` / `weapons.js`.

Known content bugs: `RETRO_BLASTER` (the "hidden" Konami weapon) sits in `WEAPONS`, so it shows up in the normal
level-up pool. `UNLOCKS` are computed but never applied (every run starts with the Whip).

## 3. Determinism status of Daily / Speedrun

The README describes Daily and Speedrun as "deterministic". **They are not**, beyond the spawn pattern:

| Source of divergence                                                                                           | Where                           |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Variable timestep: `dt = min(frameDelta, 0.05)`. The header says "fixed-step", the code is not.                | `main.js _frame()`              |
| `Math.random` for crits                                                                                        | `main.js:1329`, `weapons.js:71` |
| `Math.random` for dodge                                                                                        | `entities.js:191`               |
| `Math.random` for Lightning target choice, mine cluster offset, aura particles                                 | `weapons.js`                    |
| `Math.random` jitter on enemy fire/dash/clone timers and clone angles                                          | `entities.js:293-367`           |
| `Math.random` for boss spawn angle and boss summon angles                                                      | `main.js:1557, 1643`            |
| **Level-up options rolled with `Math.random` inside the UI**, and the pick is not recorded                     | `ui.js pickN()`                 |
| Evolved Frost Nova's follow-up pulse runs on the _effects_ queue, which keeps ticking during the level-up menu | `effects.js schedule()`         |
| Wall-clock (`performance.now()`) feeds achievements and speedrun splits                                        | `main.js`                       |
| `Math.sin/cos/atan2/hypot/pow` are not guaranteed bit-identical across JS engines (V8 vs JavaScriptCore)       | everywhere                      |

The replay recorder stores one quantised move vector per _rendered frame_ and plays them back at a nominal 1/60 s,
while the live sim used real frame deltas. The source code even notes that replays "mostly" reproduce.
**Conclusion:** a server cannot re-simulate a submitted run today. This blocks verified prizes.

## 4. How hard is a headless simulation?

**Medium. About one focused day, and it pairs naturally with the reskin because both touch every entity.**

What is already in our favour:

- Entities hold plain numeric state and update through `update(dt, game)`. Rendering is a separate `render(ctx)` method.
- Most modules already guard `typeof window/document` so Node tests import them.
- The spatial hash, pools, data, stages and daily seed are pure.

What must change:

1. **`Simulation` class** (`game/src/sim/`), with no DOM, audio or `performance.now()`. It owns entities, the spawn
   director, level-up rolls, damage and scoring. It advances with `step(input)` at a **fixed 1/60 s tick**.
2. **One seeded RNG** (`sfc32`/`mulberry32`) for all gameplay randomness. Cosmetic randomness (particles, shake,
   confetti) stays on `Math.random` and must never read gameplay state back.
3. **Deterministic math** (`dmath.js`: `sin`, `cos`, `atan2`, `hypot` built from `+ - * /` and `Math.sqrt`, plus
   integer-power loops instead of `Math.pow`). This keeps a run played on iPhone Safari identical when re-simulated on V8.
4. **Events out, not side effects.** The sim pushes `{type:'hit'|'kill'|'pickup'|'levelup'|'boss'...}` events.
   The client turns them into particles, floating numbers, audio and haptics. Settings like reduced motion then
   cannot change the gameplay RNG stream.
5. **Input log = move vector per tick (quantised to int8, RLE) + level-up choice indices.** The live game feeds the
   _quantised_ vector into the sim, so live play and replay are the same computation.
6. **Level-up roll moves from `ui.js` into the sim.** The UI only displays `sim.pendingChoices`.
7. **Performance for verification:** the spatial hash uses string keys (`"gx,gy"`), which allocate on every insert.
   Switch to integer keys. Estimate after that: roughly 0.1–0.3 ms per tick with ~300 enemies, so **5–15 s CPU for a
   15-minute run**. That fits a Workers Paid request (30 s CPU default) or a GitHub Actions job. It does not fit the
   Workers Free 10 ms limit. Hence "verify the top N per day + random samples" (§5.3).

Test strategy: a golden-replay test. Record a scripted run, re-simulate it in Node, and assert that the final state
hash matches. Run it twice in the same process and once in a fresh process. The Build Agent's CI runs it on every
change, so a determinism regression is a red build.

## 5. Asset licensing status

| Asset                                            | Origin                                     | Status                                                                 |
| ------------------------------------------------ | ------------------------------------------ | ---------------------------------------------------------------------- |
| Sprites                                          | Drawn with canvas primitives in code       | MIT (upstream code). Will be replaced by our procedural pixel sprites. |
| Audio                                            | Web Audio synthesis (`audio.js`), no files | MIT (upstream code)                                                    |
| Fonts                                            | None (system UI font stack)                | We add Jersey 10 + JetBrains Mono (both SIL OFL 1.1, self-hosted)      |
| Icons                                            | Unicode emoji rendered by the OS font      | No asset shipped. We replace them with our own pixel icons over time.  |
| `docs/hero.svg`, `docs/og-card.svg`, screenshots | Made by upstream                           | MIT. Removed from the shipped build during rebrand.                    |

No third-party art, audio or fonts ship at `day-0`, so licensing is clean. The ledger of what we add lives in `docs/ASSETS.md`.

## 6. Other findings

- `Game` constructor attaches ~10 window/document listeners. The debug hooks (`window.__SURV_DEBUG__`) are gated on
  hostname. Keep that gate.
- `Player.prototype.gainExp` is monkey-patched in `main.js` to reach the game through `window.__vsGame`. Replace it
  with a return value handled by the sim.
- The level-up "all maxed" path heals the player from inside `ui.js`. That is gameplay logic in the UI.
- `SeededRng` is a Numerical Recipes LCG. Its low bits are weak, and `pick()` uses `nextInt() % n`. Replace it.
- `i18n` ships en + zh-CN. We will ship English only (global CT audience) and keep the i18n mechanism.
- The upstream GitHub Pages workflow and marketing docs (Show HN, Reddit, tweets) do not apply to us. They are
  removed from the working tree and stay readable at `day-0`.
- Smoke tests (`scripts/runtime-smoke.js`) already drive a real Chromium via Playwright, capture screenshots and
  fail on console errors. **We reuse them as the Build Agent's smoke gate.**

## 7. Keep / change / drop

- **Keep:** module layout, data-driven content, spatial hash, pools, weapon archetypes, synthesised audio, joystick +
  gamepad, keymap, achievements engine, streaks, i18n mechanism, lint/format/test tooling, Playwright smoke harness.
- **Change:** loop (fixed step), RNG (seeded everywhere), sim/render split, level-up roll location, canvas sizing
  (full-viewport, portrait), service worker (per-build scope), all content names and visuals (bull vs bear),
  share text (our URL + build number).
- **Drop:** first-run modals, zh-CN strings in the shipped UI, GitHub Pages deploy, upstream marketing docs,
  Konami/emoji-rain easter eggs (they are fine, but not on-brand; the Build Agent can bring back themed ones).
