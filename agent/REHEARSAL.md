# Rehearsal (no build tonight)

This is a rehearsal of the Build Agent pipeline, not a build. Nobody will answer questions. Do exactly this, one
step at a time, then stop:

1. Read the JSON file named in `$AGENT_CONTEXT` (use the Read tool on `/home/runner/work/_temp/context.json`) and
   say in one sentence what the build number and the vote winner are. Then, from `players`, `previousBuild` and
   their `replays`, write the three to five lines of the regression check you would put in tonight's devlog (numbers
   only from the file; say so if a sample is small). Don't change any code for it.
2. Run `npm test`.
3. Run `node game/scripts/smoke.mjs --out /tmp/shots` and read `/tmp/shots/phone-1-title.png`.
4. Run `node game/scripts/determinism.mjs --engines chromium --seeds 1`.
5. Run `node game/scripts/sprite-preview.mjs pepe --out /tmp/sprites.png` and read the PNG.
6. With the Write tool, create `/tmp/rehearsal.test.mjs`: a `node:test` test that imports `Simulation` from
   `/home/runner/work/bearproof/bearproof/game/src/sim/sim.js` and checks that `new Simulation({ seed: 1 })` has a
   `player`. Run `node --test /tmp/rehearsal.test.mjs`. Then run `sed -n 125,136p game/scripts/playtest.mjs` (reading a
   script's source, which must not show up as a test result).
7. Add one line at the top of the bullet list in `agent/notes.md`: `- <today's date>: rehearsal of the sandboxed
pipeline (no build).`
8. Say "Rehearsal done" and a one-line summary of which steps worked.

Don't change anything else.
