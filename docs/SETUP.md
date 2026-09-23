# Setup

Everything is reproducible from this repo plus a handful of secrets. Nothing is configured by hand in a dashboard
except what is listed under "Accounts" (those steps belong to the operator and are tracked in `OSMAN_TODO.md`).

## Prerequisites

- Node 20+ (CI uses 22), npm
- `npx wrangler` (pinned in `devDependencies`). Log in once with `npx wrangler login`.
- Playwright browsers for smoke tests and card rendering: `npx playwright install chromium webkit`

## Layout

```
game/        the game (static, zero runtime deps). Dev server: npm run dev
hq/          the landing page / live dashboard (static)
worker/      the Cloudflare Worker: /play, /api/*, cron (later)
  migrations/  D1 schema (wrangler d1 migrations)
builds/      builds.json: the manifest of every shipped build
scripts/     build.mjs (assembles dist/), og/ (social cards), lib/
devlog/      daily devlog entries written by the Build Agent
docs/        audit, decisions, setup, operator TODO, assets, pitch
docs/upstream/  the original project's docs, kept for reference
```

## Local development

```bash
npm ci
npm run dev            # game only, http://localhost:3000 (from game/)
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev:worker     # full site (HQ + builds + API) on http://localhost:8787
npm test               # game + worker unit tests
npm run check          # lint + prettier + tests
```

`npm run build` writes `dist/`. Each build is extracted from its **git ref**, never from the working tree, and the ref
must resolve to the commit recorded in `builds/builds.json`. To preview the working-tree game next to the real builds,
run `node scripts/build.mjs --next` and open `/b/next/`.

## Cloudflare resources

| Resource    | Name                             | Binding                | Created with                                        |
| ----------- | -------------------------------- | ---------------------- | --------------------------------------------------- |
| Worker      | `bearproof`                      |                        | `npx wrangler deploy`                               |
| D1          | `bearproof-db` (`ae037dee-…`)    | `DB`                   | `npx wrangler d1 create bearproof-db`               |
| KV          | `bearproof-config` (`4f4fa4b9…`) | `CONFIG`               | `npx wrangler kv namespace create bearproof-config` |
| Rate limits | namespaces 7301 / 7302           | `RL_SUBMIT`, `RL_READ` | declared in `wrangler.jsonc`                        |

Live URL: **https://bearproof.app**

### Secrets (never in git, never in logs)

| Secret             | Used by                                   | How to set                                                               |
| ------------------ | ----------------------------------------- | ------------------------------------------------------------------------ |
| `DAILY_SEED_SALT`  | `/api/daily` HMAC seed                    | `openssl rand -hex 32 \| npx wrangler secret put DAILY_SEED_SALT` (done) |
| `TURNSTILE_SECRET` | run submission bot check                  | `npx wrangler secret put TURNSTILE_SECRET`                               |
| `HELIUS_API_KEY`   | treasury balance + ledger reads           | `npx wrangler secret put HELIUS_API_KEY`                                 |
| `INGEST_TOKEN`     | Build Agent → devlog/cost ingest          | `openssl rand -hex 32 \| npx wrangler secret put INGEST_TOKEN`           |
| `PRIZE_WALLET_KEY` | daily prize payouts (M3, hot wallet only) | `npx wrangler secret put PRIZE_WALLET_KEY`                               |

GitHub Actions secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `ANTHROPIC_API_KEY` (or a UsePod token),
`INGEST_TOKEN`.

## Deploy

```bash
npm run db:migrate:remote   # only when worker/migrations changed
npm run deploy              # build dist/ + wrangler deploy
```

## Operator switches (CONFIG KV)

```bash
# Emergency revert: serve build 3 at /play right now, no redeploy.
npx wrangler kv key put --binding=CONFIG --remote build_override 3
# Undo the revert.
npx wrangler kv key delete --binding=CONFIG --remote build_override
# Payout kill switch (M3).
npx wrangler kv key put --binding=CONFIG --remote payouts_enabled false
```
