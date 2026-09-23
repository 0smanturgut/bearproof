# BEARPROOF

**An AI is building a game on its own budget. It ships a new version every day. You fund it, you steer it, you play it.**

- **Play / HQ:** https://bearproof.app
- **What the AI added:** `git diff day-0..main`. `day-0` is the untouched open-source game Proof started from.

BEARPROOF is a fast, mobile-first survivors-like browser game. You are a bull surviving an endless bear market.
Proof is the AI game developer building it in public. Every day at 00:00 UTC a new build ships and a new Daily
Challenge starts on that build. Proof picks the next feature from holder votes and its own judgment, then implements,
tests, ships and writes a devlog. Every step and every cost is public.

> Status: **Day 1.** Build #1, the bull-vs-bear rebuild, is live. Build #2 ships at 00:00 UTC on 24 Sep and Build #3
> on 25 Sep; both are bootstrap builds (see below). Build #0, the untouched upstream, is still playable at `/b/0/`.
> The scheduled Build Agent takes over the daily slot once its API key is in. See `docs/DECISIONS.md`.

## What's in it

- **One build a day, immutable.** Every build is a git tag and lives forever at `/b/<n>/`. The Daily Challenge is
  pinned to the build that was live at 00:00 UTC.
- **Scores that can't be faked.** The simulation is deterministic across JS engines (own sin/cos/atan2, one seeded
  RNG, fixed 60 Hz). A run is a small input log, and the server re-simulates it against that exact build before
  it can rank or win.
- **Daily twists.** Each Daily Challenge has one rule change, the same for everyone, and it's part of the replay.
- **Share cards.** `/run/<id>` unfurls as a pixel card (drawn in the Worker, no dependencies) with the score and
  its replay status.
- **Holder voting.** Sign a plain-text message with a Solana wallet (no transaction). Weight = floor(√tokens).
- **A daily $ANSEM prize** for the verified #1, bought with treasury SOL through Jupiter and sent by the Worker,
  capped at min(10% of the previous 24 h of fees, 0.5 SOL), with a kill switch. Off until the coin launches.
- **Receipts.** Treasury balance and every SOL movement are read from chain into the public ledger.
- **A guarded Build Agent.** Claude Code runs headless in GitHub Actions and may only touch game code, its devlog and
  its X draft. Tests, a headless smoke test and a cross-engine determinism check gate every merge.

## Who does what (kept true, always)

- **Proof (the AI)** writes the game code, content and devlog.
- **Osman (the operator)** set up the accounts, pays for infrastructure and has an emergency revert switch. He does
  not write the daily features. Any code he does write is labelled `Build-Mode: human`.
- **Bootstrap phase:** until the scheduled Build Agent runs on its own, the AI (Claude Code) works in sessions Osman
  starts. Those commits carry the `Build-Mode: bootstrap` trailer.

## Repo layout

| Path       | What                                                                           |
| ---------- | ------------------------------------------------------------------------------ |
| `game/`    | The game. Vanilla JS + Canvas, zero runtime dependencies.                      |
| `hq/`      | Landing page and live dashboard (static).                                      |
| `worker/`  | Cloudflare Worker: `/play`, `/api/*`, D1 migrations.                           |
| `builds/`  | Manifest of every shipped build. Builds are immutable and served at `/b/<n>/`. |
| `scripts/` | `build.mjs` assembles `dist/` from git tags; social card rendering.            |
| `docs/`    | Audit, decisions, setup, operator TODO, assets ledger.                         |

```bash
npm ci
npm run dev          # game on http://localhost:3000
npm run dev:worker   # full site + API on http://localhost:8787
npm run check        # lint + format + tests
```

Full setup: [`docs/SETUP.md`](docs/SETUP.md).

## Credit

Build #0 is [**ricardo-foundry/canvas-vampire-survivors**](https://github.com/ricardo-foundry/canvas-vampire-survivors)
v2.8.0 (MIT), used unmodified. Its history is preserved in this repo. Thank you. This project is not affiliated with
_Vampire Survivors_ or poncle. The upstream project was an homage; BEARPROOF is a new game built on its engine.

## The coin

$BPROOF launches through ClawPump on Solana. Its creator fees fund Proof's compute, hosting and the daily $ANSEM
prize, and holders get a vote on what gets built next, plus cosmetics. It is not needed to play or to win anything,
and it is not an investment.

## License

MIT. See [`LICENSE`](LICENSE). The upstream copyright notice is kept.
