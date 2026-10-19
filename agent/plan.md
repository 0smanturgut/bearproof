# Build #28 plan: Missions

## The update

**Missions: goals that pay CLOUT.** The vote winner (13 of 16 votes) and Road to 1.0 #4. A list of goals per
character, per map and for any run ("Survive 8:00 as Pepe", "Take down the Rug Lord without taking a hit", "Reach
Altcoin Season on Market Eras"). Each pays CLOUT once, keeps its best progress between runs, shows progress on the
start screen, and pops a toast mid-run when it completes. Badges stay as they are.

## Why today

It won the vote and it's next on the roadmap. Players have CLOUT and a Market already (Builds #25-#27), but
nothing to aim a run at beyond the Daily board. Missions give every character and every map a reason to come back.
The data shapes the goals: the bull's live median is 2:53 (30 runs) against the Whale's 13:31, so the bull's first
missions are short and reachable. Rug pullers (25%) and grizzlies (19%) are the top killers, so the "no hit" goal
is a boss fight, not a horde.

## Fairness

Missions only read the sim after each step, like badges. They never change a run, a replay or the Daily board, so
there's no SIM_VERSION bump. CLOUT stays play-only. Daily and free runs both count.

## Parts

1. **Systems** `game/src/missions.js` (pure): `MISSIONS` (id, name, text, art, reward, character?, stage?,
   target, unit, value(sim, run)), `createMissionTracker(state, sim)` (mid-run completions plus best progress),
   `normalizeMissions`, `nextMission(state, character)`, `missionSection`/summary helpers.
2. **Save** `profile.missions = { done: {id: day}, best: {id: n}, unpaid: [id] }` inside the profile, normalized
   (old saves get an empty one). A mission completed mid-run is saved at once as done and unpaid; `applyRun` pays
   every unpaid mission as its own receipt line, so a tab closed mid-run still gets paid on the next receipt.
3. **Run** `game.js`: tracker per player run (never the autopilot), toast "MISSION: NAME +150 CLOUT" queued with
   the badge toasts, a chime and a haptic. The best progress is saved at run end.
4. **Start screen** a MISSIONS menu item ("4 of 30 done") and a next-mission line with a bar on the character
   card, for the character on show. A Missions screen with tabs (Any run, Bull, Pepe, Whale, Maps): art, goal,
   progress bar, reward or DONE.
5. **Receipt** a line per mission paid ("MISSION · Name +150"), counted up with the rest.
6. **Sound** a cash-register chime `audio.mission()`.
7. **Tests** `game/test/missions.test.js`: scoping (character/stage), time and count goals, the no-hit boss goal,
   era goals, best progress, saving and paying once, normalize of old/bad saves, that every mission's art exists.

## Files

game/src/missions.js (new), game/src/profile.js, game/src/game.js, game/src/ui.js, game/src/main.js,
game/index.html, game/styles.css, game/src/audio.js, game/test/missions.test.js (new).

## Order

missions.js + tests → profile save/pay → game.js tracker + toast → receipt lines → Missions screen + menu
item → character card line → sound → shots, playtest, gates, devlog.
If time runs short, the screen and the card line are the last things cut back, never the save or the payout.

## Regression check

Live #27 vs #26: median 7:58 → 7:23, bull 4:49 → 2:53 (30 runs), bag_holder new at 11.9% of deaths. Playtest
`--compare build-26`: 4:12 → 4:09. Per-map autopilot diagnostic (/tmp/stages.test.mjs) to see whether Market Eras'
Genesis Era (bag holders 1.5×, solid props) corners the bull, as one chat message said.
