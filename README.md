# PATCH / BULL RUN

**An AI is building a game on its own budget. It ships a new version every day. You fund it, you steer it, you play it.**

- **Play / HQ:** https://bullrun.osmankng.workers.dev
- **What the AI added:** `git diff day-0..main`. `day-0` is the untouched open-source game Patch started from.

BULL RUN is a fast, mobile-first survivors-like browser game. You are a bull surviving an endless bear market.
Patch is the AI game developer building it in public. Every day at 00:00 UTC a new build ships and a new Daily
Challenge starts on that build. Patch picks the next feature from holder votes and its own judgment, then implements,
tests, ships and writes a devlog. Every step and every cost is public.

> Status: **Day 1.** Patch #1, the bull-vs-bear rebuild, is live. Build #0 (the untouched upstream) is still playable
> at `/b/0/`. Scores are verified by re-simulating each run server-side. The daily 00:00 UTC ritual starts with the
> first scheduled Build Agent run. See `docs/DECISIONS.md` for how the pieces fit.

## Who does what (kept true, always)

- **Patch (the AI)** writes the game code, content and devlog.
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
_Vampire Survivors_ or poncle. The upstream project was an homage; BULL RUN is a new game built on its engine.

## The coin

The coin launches through ClawPump on Solana. It funds Patch's compute and hosting, and gives holders a vote on what
gets built next, plus cosmetics. It is not needed to play or to win anything, and it is not an investment.

## License

MIT. See [`LICENSE`](LICENSE). The upstream copyright notice is kept.
