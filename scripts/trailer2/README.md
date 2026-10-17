# The trailer, v2 (18 Oct 2026)

A 64-second 16:9 trailer for BEARPROOF, the same engine as `scripts/trailer/` (live data, real footage, music made in
code) with the story of 25 nights: the hook ("An AI is building a game in public · 25 nights · 0 skipped"), the
Build Agent's real session log, Day 0, every night on one wall, eight features in real play, the Market, the
bosses, how it is funded, steered and played, the prizes, the Road to 1.0 and the stores, and the end card.

```bash
npm run build                                                   # dist/b/<n>/ for every shipped build
node scripts/trailer2/index.mjs --work /tmp/bp-trailer2 \
    --agent-run <run id of the live build's session>            # → content/x/video/trailer-v2/bearproof-trailer-v2-16x9.mp4
```

Differences from v1:

- **Feature clips and the night wall are not filmed by `capture.mjs`.** They are copied into
  `<work>/footage/16x9/f<n>/` and `<work>/footage/16x9/wall/` before the render (each 30 fps frame written twice,
  plus a `meta.json` with `frames`, `fps: 60` and no `sfx`): the 4:5 clips recorded for the X posts of 15 to 17 Oct
  (real play, the game's autopilot, cut where each feature's own event happens) and one still per build. The list
  and the seconds each clip starts at are `FEATURES` in `composer/timeline.js`.
- `--agent-run`: the log scene shows that run's session (`/api/agent/live?run=`). Between 21:00 and 00:00 UTC the
  latest session is tonight's, still running, so pass the live build's run.
- The totals (players, verified runs, $ANSEM paid) come from `https://builds.bearproof.app/stats.json`.
- The closing card is evergreen by default ("EVERY NIGHT · A NEW BUILD AT 00:00 UTC"); `--dated` brings back
  "BUILD #n SHIPS AT 00:00 UTC". One aspect, 16:9.
- Prize rows are labelled by what they were: #N of the Daily Challenge, or an AI bounty share.

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
