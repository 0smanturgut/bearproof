# The trailer

A 64-second trailer for BEARPROOF, rendered entirely from code and live data. Re-render it any day and it tells that
day's story: the day number, the builds, the Build Agent's last session, the ledger, the ballot and the payouts all
come from the live API and git at render time.

```bash
npm run build                      # dist/b/<n>/ for every shipped build
node scripts/trailer/index.mjs     # → content/x/video/trailer/bearproof-trailer-{16x9,9x16}.mp4 (+ .jpg posters)
```

Options: `--aspect 16x9` (or `9x16`), `--work <dir>` (intermediate frames, default in the OS temp dir),
`--out <dir>`, `--skip-capture` and `--reuse-data` (re-cut without filming again), and `--evergreen` (the closing
"BUILD #n SHIPS AT 00:00 UTC" becomes "EVERY NIGHT / A NEW BUILD AT 00:00 UTC", for a video that stays up for days,
like a pinned post). A full render of both aspects
takes about 15 minutes on an M1. Videos stay out of git (`content/x/video/` is ignored). To check a scene without a
full render: `node scripts/trailer/stills.mjs <work dir> 16x9 9.5,31,61.5` writes those seconds as PNGs.

## How it works

| File                | What                                                                                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data.mjs`          | A read-only snapshot of `/api/stats`, `/api/builds`, `/api/ledger`, `/api/winners`, `/api/vote`, `/api/activity`, `/api/agent/live`, and `git diff day-0..main`. |
| `shots.mjs`         | The footage list: every shipped build (Day 0 and the latest five) and the live build's showcase moments (opening bell, crates, bosses, level-up, phone).         |
| `capture.mjs`       | Films each shot from `dist/b/<n>/` in headless Chromium on a virtual clock (`lib/vclock.js`), 60 fps, frame-exact, and logs the game's own sound effects.        |
| `lib/director.js`   | Runs inside the build: a fixed seed, the build's own autopilot, fast-forward with recorded input, a closer camera, and the bull kept alive for the camera.       |
| `composer/`         | The picture: scenes on a 120 BPM timeline (`timeline.js`, `scenes.js`), drawn on a canvas in the game's palette and fonts, with the game's own sprites.          |
| `composer/music.js` | The soundtrack, synthesised in an `OfflineAudioContext` from the same timeline (A minor, Am–F–C–G, the game's own progression), plus the game's sound effects.   |
| `render.mjs`        | Renders the composer frame by frame into ffmpeg, and the soundtrack to WAV.                                                                                      |

Rules the trailer keeps, like the rest of the project: no number that isn't in the snapshot, no price talk, the
costs wallet is only ever "the costs wallet", and the fine print says the footage is autopilot play with the bull kept
alive for the camera. Build #0 is credited to ricardo-foundry/canvas-vampire-survivors (MIT).
