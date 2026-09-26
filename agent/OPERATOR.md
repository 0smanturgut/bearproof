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

## Build #5 (2026-09-27)

- Whatever wins: a bootstrap change (Claude, started by the operator) landed in `game/src/game.js` before tonight.
  The game-over prompt for a prize address now shows the server's wording of the prize rule (`prize.note` from
  `/api/daily`), so it stays right if holders change the rules. Say so in one sentence under `## Operator input`.
  The simulation didn't change.

The rest of this note applies only if the holders pick the operator's option **"Daily Pot: the AI pays its players in $ANSEM"**
(`op-daily-pot`). If anything else wins, ignore the rest.

- **What the option is.** The operator put a change to the prize rules to the holder vote. From the Build #5 Daily
  Challenge on, the daily prize grows from 10% to 40% of the day's creator fees: 60% pays the top places of the
  Daily board, 40% is shared by everyone whose verified Daily Challenge run clears the bounty you set for the
  build. Paid in $ANSEM, free to play, holding the coin never required.
- **Your part is the bounty, in the game.**
    - Put the build's bounty in `game/bounty.json`, exactly that path: it's served at `/b/5/bounty.json` and the
      server reads it there. Pick one type from the menu in `worker/src/lib/bounty.js` (read it; you can't edit
      it). The file must pass its `checkBounty`, e.g. `{ "type": "bosses", "bosses": 1, "name": "Rug Lord Hunt" }`.
      A file that fails means no bounty for the build.
    - Choose it from the data in your context: hard enough that most players miss it, reachable for a good run.
    - Show it before the run starts (start screen, next to the Daily Challenge), track it in the HUD during a Daily
      Challenge run without covering the play area, and say on the end screen whether the run cleared it. Word
      the condition exactly as `bountyText` does ("Survive to 10:00"), next to your name for it. Only Daily
      Challenge runs count; say so where it matters.
    - The game's check has to agree with `clearsBounty` (same stats: run time, level, kills, boss kills, won). Add
      a test in `game/test/` that validates `game/bounty.json` with `checkBounty` and compares your check with
      `clearsBounty` on a few runs.
    - Money copy, word for word, nothing more: near the bounty, "Clear it to share today's bounty in $ANSEM."; after
      a cleared Daily run, "Bounty cleared. Paid after 00:10 UTC if the run verifies and you left a Solana
      address." No amounts, percentages or pot sizes in the game. A cleared bounty may add one line to the share
      text, e.g. "Cleared the AI's bounty: Rug Lord Hunt".
- **Not your part:** the prize rules, the pot, the paid places, verification and payments. They are Worker code
  outside your paths, written by a bootstrap session (Claude, started by the operator) on 26 Sep while the vote was
  still open. The Worker reads the vote result itself and only switches the new rules on if this option won. The
  first payout under them is at 00:10 UTC on 28 Sep, for the Build #5 Daily Challenge. Say so in one or two
  sentences under `## Operator input`: players asked for this on X (in replies and DMs to the operator's account),
  and the operator put it to the vote because the prize rules are outside your reach.
