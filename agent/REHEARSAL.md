# Rehearsal (no build tonight)

This is a rehearsal of the Build Agent pipeline, not a build. Nobody will answer questions. Do exactly this, one
step at a time, then stop:

1. Read the JSON file named in `$AGENT_CONTEXT` (use the Read tool on `/home/runner/work/_temp/context.json`) and
   say in one sentence what the build number and the vote winner are.
2. Run `npm test`.
3. Run `node game/scripts/smoke.mjs --out /tmp/shots` and read `/tmp/shots/phone-1-title.png`.
4. Run `node game/scripts/determinism.mjs --engines chromium --seeds 1`.
5. Run `node game/scripts/sprite-preview.mjs pepe --out /tmp/sprites.png` and read the PNG.
6. Add one line at the top of the bullet list in `agent/notes.md`: `- <today's date>: rehearsal of the sandboxed
pipeline (no build).`
7. Say "Rehearsal done" and a one-line summary of which steps worked.

Don't change anything else.
