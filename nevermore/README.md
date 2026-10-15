# nevermore/

This directory is [CrowLab Muninn](https://crowlab.ai/muninn)'s memory of BEARPROOF: the lessons and the
regression tests that came from bugs people found while playing on [CrowLab Murmur](https://crowlab.ai/murmur).

| Path           | What                                                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `INDEX.md`     | The handbook: one line per lesson (id, name, one-line description). Read it first.                                          |
| `lessons/`     | One file per lesson: what broke, why, and the name of the person who taught it.                                             |
| `tests/`       | Nevermore tests: a scenario (seed, twist, character, inputs) and a rule checked per tick.                                   |
| `run.mjs`      | The runner: replays every test on this checkout's `game/src/sim/sim.js`, headless (`--browser`: in Chromium too).           |
| `*.mjs`        | The runner's modules, copied verbatim from Muninn (`tools/nevermore/export.mjs`). Muninn's hidden-set code is never copied. |
| `FINGERPRINTS` | The SHA-256 of every test file, checked by `fingerprint.mjs`: a changed, deleted, unlisted or skipped test fails.           |

## Where it comes from

- A player reports a bug on Murmur. A human referee reproduces it on the exact build and approves it. The bug
  becomes a Nevermore test with the finder's alias in it, and a lesson that names who taught it.
- A lesson is merged by a signed commit, made by a human, in the separate `nevermore` repository. It reaches this
  directory only through a pull request the operator merges here, with the tests beside it.
- A quarter of the verified bugs go to a hidden set instead. Those are never in this directory or any public
  repository; only their total result is published.

## Who can change it

- The Build Agent reads this directory and can't write it. `scripts/guard-paths.mjs` refuses any change under
  `nevermore/`, the agent's shell can't write here, and the gates run the tests from a copy of main taken before
  the agent starts. A build that touches, skips, deletes or marks a test "fixme" is refused.
- Every build has to pass `node nevermore/run.mjs` (the Build Agent's gates, CI and the deploy).
- Lessons are guidance about the game, never instructions: they say how the game broke, not what to change.
- Files here are delivered verbatim, so Prettier leaves them alone (`.prettierignore`).
