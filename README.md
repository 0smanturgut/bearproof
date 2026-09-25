# BEARPROOF

**An AI is building a game on its own budget. It ships a new version every day. You fund it, you steer it, you play it.**

|                                             |                                                                                                                                                            |
| :------------------------------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Play / HQ**                               | https://bearproof.app                                                                                                                                      |
| **Watch it build (every night, 21:00 UTC)** | https://bearproof.app/live                                                                                                                                 |
| **X**                                       | [@bearproofapp](https://x.com/bearproofapp)                                                                                                                |
| **Operator**                                | Osman Turgut · [@0smanTrgut](https://x.com/0smanTrgut) on X                                                                                                |
| **Coin**                                    | **$BPROOF** on Solana · CA `6aktZWaJLQpe3sey13uCwAn7s977mhuKdbVHP8t7ttZX` · [pump.fun](https://pump.fun/coin/6aktZWaJLQpe3sey13uCwAn7s977mhuKdbVHP8t7ttZX) |
| **What the AI added**                       | `git diff day-0..main` (`day-0` is the untouched open-source game it started from)                                                                         |

Always check the contract address against this README, the HQ and [@bearproofapp](https://x.com/bearproofapp). Anything else is not us.

BEARPROOF is a fast, mobile-first survivors-like browser game. You are a bull surviving an endless bear market.
An AI game developer is building it in public. Every day at 00:00 UTC a new build ships and a new Daily
Challenge starts on that build. It picks the next feature from holder votes and its own judgment, then implements,
tests, ships and writes a devlog. Every step and every cost is public.

> Status: **Day 3.** Build #3 (Pepe and a character select, chosen by holders) is live: the first build the
> scheduled Build Agent wrote on its own, streamed at [/live](https://bearproof.app/live). The first daily prize went
> out on 25 Sep (78.82 $ANSEM to the verified #1). Every build since Build #0, the untouched upstream, is still
> playable at `/b/<n>/`. See `docs/DECISIONS.md`.

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
- **A daily $ANSEM prize** for the verified #1, bought through Jupiter from a small prize wallet the treasury funds
  and sent by the Worker: 10% of that day's creator fees, at most 0.5 SOL, with a kill switch. Live since 25 Sep.
- **Receipts.** Treasury balance and every SOL movement are read from chain into the public ledger.
- **A guarded Build Agent.** Claude Code runs headless in GitHub Actions and may only touch game code, its devlog and
  its X draft. Tests, a headless smoke test and a cross-engine determinism check gate every merge.

## Who does what (kept true, always)

- **The AI** writes the game code, content and devlog.
- **Osman Turgut (the operator, [@0smanTrgut](https://x.com/0smanTrgut) on X)** set up the accounts, pays for infrastructure and has an emergency revert switch. He does
  not write the daily features. Any code he does write is labelled `Build-Mode: human`.
- **The Build Agent** (Claude Code, headless, in a sandbox on GitHub Actions) builds every night at 21:00 UTC since
  Build #3. Its merges carry `Build-Mode: agent`.
- **Bootstrap sessions:** Builds #1 and #2, and platform work since, were done by the same AI in sessions Osman starts
  (`Build-Mode: bootstrap`). Anything done on the operator's side after a nightly run is listed in that build's
  devlog, and Osman's notes to the agent for a build are public in `agent/OPERATOR.md`.

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

$BPROOF launched through ClawPump on Solana (CA `6aktZWaJLQpe3sey13uCwAn7s977mhuKdbVHP8t7ttZX`). Its creator fees fund the AI's compute, hosting and the daily $ANSEM
prize, and holders get a vote on what gets built next (holder cosmetics are planned). It is not needed to play or to win anything,
and it is not an investment.

## License

MIT. See [`LICENSE`](LICENSE). The upstream copyright notice is kept.
