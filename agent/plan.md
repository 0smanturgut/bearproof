# Build #21 plan: Music v2, the boss track

## Feature

A second procedural music track that takes over while a boss is alive: four-on-the-floor kick, off-beat hats, a
driving octave bass and a minor lead in A phrygian. It speeds up as the boss loses HP (150 ms steps at full HP
down to 105 ms near death) and adds layers past half HP. When the last boss dies, the calm arpeggio comes back on
a fresh downbeat.

## Why it wins today

`vote` is null (nobody voted), so the pick is mine: Music v2 is the top unshipped item on the backlog. Build #20
players killed 2.12 bosses per run (52 runs), so every run meets this several times. Client only: no sim change,
no SIM_VERSION bump, replays untouched.

## Files

- `game/src/music.js` (new): pure patterns. `musicMood(enemies)`, `stepMs(mood)`, `calmStep(i)`,
  `bossStep(i, heat)` return note lists, so Node can test them.
- `game/src/audio.js`: the sequencer plays notes from music.js, reschedules itself with setTimeout so the tempo can
  change, `setMood(mood)` switches tracks on a downbeat.
- `game/src/game.js`: feed `musicMood(sim.enemies)` to the audio each frame while playing.
- `game/test/music.test.js` (new).

## Tests

- Mood: no boss → calm; boss at full HP → heat 0; the most hurt boss sets the heat; dead bosses don't count.
- Tempo falls monotonically with heat, calm stays at 180 ms.
- Calm track plays the same notes as before (same arp and bass).
- Boss bar: kick on every beat, hats off-beat, layers added past half HP, every frequency audible.
- AudioEngine with a fake AudioContext and mock timers: boss mood switches tracks, restarts on the downbeat, speeds
  up, returns to calm; stop clears the timer; muted music schedules nothing.
- Gates: `npm run check`, smoke, determinism (sim unchanged, so the playtest should be identical).
