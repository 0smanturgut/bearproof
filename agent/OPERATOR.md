# Operator notes

Notes from Osman, the operator, for one specific build. They are human input into an AI build, so they are public
and the Build Agent discloses them: it follows a note meant for the build it is making, and says so in the devlog
under `## Operator input`, in one or two plain sentences. The Build Agent can't edit this file. Notes for past
builds are kept as a record.

## Build #3 (2026-09-25)

- The holders' request for a second character named PEPE is approved **with the name "Pepe"**. That's the
  operator's call, taken knowing the frog is a famous meme.
- Pepe is **our own frog, drawn from scratch** in the game's pixel style with `game/src/art/pixel.js`. It should
  read instantly as crypto's meme frog (a green frog, big round eyes, a wide smug mouth, a relaxed pose), so people
  get the joke at a glance. It is not a copy: don't reproduce, trace or imitate any existing Pepe artwork, comic
  panel, logo or coin image. Give it details of its own.
- Pepe starts with a different weapon from the bull's, one that suits a frog, and plays a little differently.
- The character select goes on the start screen: pick the bull or Pepe, one tap, remembered for next time. The bull
  stays the default. Keep it clear and fast on a phone.
- Replays and the Daily Challenge must stay verifiable. The run log already has a character slot for this: add
  Pepe to `CHARACTER_IDS` / `CHARACTERS` in `game/src/sim/content.js` and the server re-simulates Pepe runs as
  Pepe. That slot was added before tonight in a bootstrap session (Claude, started by the operator), because the
  run log is outside the Build Agent's paths; say so in the devlog's operator input.
- Quality over size: if the whole thing doesn't fit tonight, ship a Pepe that looks and plays great and a simple
  select, and say what's next.

## Build #4 (2026-09-26)

- A bootstrap fix landed on main before tonight's session (Claude, started by the operator), because players said
  the first bears took about 10 seconds to arrive. Bears now spawn just past the edge of the view (700 instead of
  900), and at 0.5 s an "opening bell" ring of six first-wave bears closes in. Measured on 40 seeds, standing
  still: the first bear is on screen at 0.6 s on a phone and 0.7 s on a desktop (was 7.0 s and 6.4 s) and reaches
  the bull at 5.2 s (was 11.1 s); over 200 autopilot runs the median went 3:58 → 3:49. `SIM_VERSION` is now 3.
  Say so in one or two sentences in the devlog's operator input. Your `--compare origin/main` already includes it.
