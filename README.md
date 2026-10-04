# BEARPROOF

**An AI is building a game on its own budget. It ships a new version every day. You fund it, you steer it, you play it.**

|                                             |                                                                                                                                                                  |
| :------------------------------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Play / HQ**                               | https://bearproof.app                                                                                                                                            |
| **Watch it build (every night, 21:00 UTC)** | https://bearproof.app/live                                                                                                                                       |
| **Telegram (talk to the AI)**               | https://t.me/bearproofapp · the bot is [@bearproobot](https://t.me/bearproobot). It never DMs first and never asks for a key                                     |
| **X**                                       | [@bearproofapp](https://x.com/bearproofapp) is suspended by X (27 Sep). Until it's back, updates come from the operator, [@0smanTrgut](https://x.com/0smanTrgut) |
| **Operator**                                | Osman Turgut · [@0smanTrgut](https://x.com/0smanTrgut) on X                                                                                                      |
| **Coin**                                    | **$BPROOF** on Solana · CA `6aktZWaJLQpe3sey13uCwAn7s977mhuKdbVHP8t7ttZX` · [pump.fun](https://pump.fun/coin/6aktZWaJLQpe3sey13uCwAn7s977mhuKdbVHP8t7ttZX)       |
| **What the AI added**                       | `git diff day-0..main` (`day-0` is the untouched open-source game it started from)                                                                               |

Always check the contract address against this README and the HQ (bearproof.app). Anything else is not us.

BEARPROOF is a fast, mobile-first survivors-like browser game. You are a bull surviving an endless bear market.
An AI game developer is building it in public. Every day at 00:00 UTC a new build ships and a new Daily
Challenge starts on that build. It picks the next feature from holder votes and its own judgment, then implements,
tests, ships and writes a devlog. Every step and every cost is public.

> Status: live since 23 Sep, one build a night. From Build #3 on, the scheduled Build Agent writes each build at
> night with nobody in the session, streamed at [/live](https://bearproof.app/live); anything the operator added is
> listed in that build's devlog. The first daily prize went out on 25 Sep (78.82 $ANSEM to the verified #1), and the
> first Daily Pot on 28 Sep (73.79 $ANSEM to 3 players). Every build since Build #0, the untouched upstream, is still
> playable at `/b/<n>/`. See `devlog/` and `docs/DECISIONS.md`.

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
- **The Daily Pot in $ANSEM**, bought through Jupiter from a small prize wallet the treasury funds and sent by the
  Worker, with a kill switch: 40% of the day's creator fees (at most 1 SOL), 60% to the top of the Daily Challenge
  board and 40% shared by everyone who clears the AI's bounty. It was picked in the 26 Sep holder vote; from 25 Sep
  until then, 10% of the fees went to the verified #1.
- **Receipts.** Treasury balance and every SOL movement are read from chain into the public ledger.
- **A Telegram group the AI listens to.** BEARPROOF is in the group as a bot (it runs in the Worker): it posts every
  build, vote, prize and ledger row, answers mentions from live data, and at 20:30 UTC turns the day's chat into a
  short public digest (`/api/feedback`) that the Build Agent reads before it builds. Its instructions are in
  `worker/src/lib/persona.js`; it has no tools and no access to the game, the vote or the treasury.
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

$BPROOF launched through ClawPump on Solana (CA `6aktZWaJLQpe3sey13uCwAn7s977mhuKdbVHP8t7ttZX`). Its creator fees go
to the AI's public treasury, which funds the Daily Pot and pays back the AI's bills: Osman pays compute and hosting
first, and on 1 and 3 Oct he sent himself 1.27 SOL from the treasury for them, by hand. Every spend is on the public
ledger, including those and a paid promotion on 27 Sep. Holders get a vote on what gets built next (holder cosmetics
are planned). The coin is not needed to play or to win anything, and it is not an investment.

## License

MIT. See [`LICENSE`](LICENSE). The upstream copyright notice is kept.
