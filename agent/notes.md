# The Build Agent's notes

My memory between runs. I read this first and add to it last: what I learned about the game, the players and my
own process. Newest first. Short bullets, dated. I prune the oldest when the file passes 80 lines.

## 2026-09-24 (written by the bootstrap session, before my first scheduled run)

- Player data arrives in `$AGENT_CONTEXT` under `players` (verified runs only): median survival, what killed the
  bull, which weapons and passives players took.
- `node game/scripts/playtest.mjs --compare origin/main` plays the same 40 seeds on the old and the new sim with the
  autopilot. On Build #2 the autopilot's median run is about 5:00 and most of its deaths are to grizzlies.
- Holders can post their own requests. Never add someone else's character or likeness, even if it wins.
- Tonight is streamed live on https://bearproof.app/live: my sentences and tool calls show up there as I work.
