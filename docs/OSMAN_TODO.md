# Operator TODO (Osman)

Only things that need your accounts, money or signature. Everything else is handled. Steps are exact; when a step
says **"send me"**, paste the value in chat. **Never paste secret keys in chat.** Those go through the commands shown.

_Last updated: Wed 23 Sep 2026, M0._

---

## Batch 1: today or tomorrow morning (≈30 min total)

### 1. Pick the X handle (5 min) — blocks: registration, entry post, token

Check availability on x.com in this order and take the first free one:
`@PatchShips` → `@PatchBuilds` → `@patch_ai_dev`.
If none is free, try the backups: `@NightlyBuilds` (brand NIGHTLY) or `@BuildoorAI` (brand BUILDOOR).

- Create the account. Display name: **Patch**. Bio:
  `An AI building a game on its own budget. New build every day at 00:00 UTC. You fund it, you steer it, you play it.`
- Leave avatar and banner empty for now. I will render both tomorrow.
- From that account, **follow @clawpumptech**. This is a hackathon requirement.
- **Send me:** the handle you got.

### 2. Create the GitHub repo and push (3 min) — blocks: Build Agent, CI

In Terminal:

```bash
cd ~/Documents/Vampire-Survivors
gh repo create bull-run --public --source=. --remote=origin --description "BULL RUN: a game an AI builds in public, one build a day, on its own budget."
git push -u origin main
git push origin day-0
```

After this, pushing commits to this repo is part of my normal work.

Then protect `main`. Go to github.com → the repo → **Settings → Rules → Rulesets → New branch ruleset**:

- Name: `main`. Enforcement: **Active**. Target branches: **Default branch**.
- Bypass list: add **Repository admin**. That's you; it lets the bootstrap commits land. The Build Agent is _not_
  an admin.
- Enable these rules:
    - **Restrict deletions**
    - **Block force pushes**
    - **Require a pull request before merging** (0 approvals; tick _Require review from Code Owners_)
    - **Require status checks to pass**, adding the check `Lint, format, tests, build`. It appears after the first CI run.
- Save.

### 3. Cloudflare API token for GitHub Actions (5 min) — blocks: automatic deploys

1. dash.cloudflare.com → top-right profile → **My Profile → API Tokens → Create Token**.
2. Template **Edit Cloudflare Workers** → **Use template**.
3. **Add more → Account → D1 → Edit**.
4. Set Account Resources to _Include → Osmankng@icloud.com's Account_ and Zone Resources to _All zones_.
5. **Continue → Create Token** and copy it.
6. Go to github.com → the repo → **Settings → Secrets and variables → Actions → New repository secret**:
    - `CLOUDFLARE_API_TOKEN` = the token
    - `CLOUDFLARE_ACCOUNT_ID` = `8a4c7b65a2640a68401d2bb4f046ed6f`

### 4. Turnstile widget (3 min) — blocks: score submission

1. dash.cloudflare.com → **Turnstile → Add widget**.
2. Name `bullrun`. Hostnames: `bullrun.osmankng.workers.dev` and `localhost`. Mode: **Managed**. Click **Create**.
3. **Send me:** the **Site Key** (it is public).
4. For the **Secret Key**, run this in the repo folder and paste the key when prompted:
    ```bash
    npx wrangler secret put TURNSTILE_SECRET
    ```

### 5. Helius API key (3 min) — blocks: treasury panel, ledger, holder voting

1. Go to dashboard.helius.dev, sign up and copy the default API key.
2. In the repo folder, run this and paste the key when prompted:
    ```bash
    npx wrangler secret put HELIUS_API_KEY
    ```

### 6. Register for the hackathon (5 min) — after step 1

Go to clawpump.tech/ansemhack and register:

| Field              | Value                                                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Project name       | `PATCH`                                                                                                                 |
| Project X handle   | the handle from step 1                                                                                                  |
| One line           | `An AI is building a game on its own budget. It ships a new version every day. You fund it, you steer it, you play it.` |
| Email              | yours                                                                                                                   |
| Ticker (optional)  | `PATCH`                                                                                                                 |
| Website (optional) | `https://bullrun.osmankng.workers.dev`                                                                                  |

Don't post the entry tweet yet. I'll send the final text when Build #1 (the bull-vs-bear rebuild) is live.
That should be Thursday. A first post that shows the actual game converts far better.

---

## Batch 2: Thursday/Friday (I'll ping you with the exact package)

- **Anthropic API key for the Build Agent.** Go to console.anthropic.com → API Keys → create `patch-build-agent`,
  and set a monthly spend limit (suggest $100). Add it as the GitHub secret `ANTHROPIC_API_KEY`.
  I may switch this to a UsePod token funded from the treasury (it makes "the AI pays for its own compute" literally
  true on-chain). I'll confirm before you do anything.
- **Workers Paid plan ($5/month).** Go to dash.cloudflare.com → Workers & Pages → Plans. It is needed by Saturday
  for Queues and for the CPU time that server-side replay verification uses.
- **Treasury wallets + token launch on ClawPump.** ⚠️ **Do not launch the token before I send the wallet plan.**
  ClawPump's fee payout wallet is fixed forever once the token exists. I'll send the wallet setup, the launch fields
  (name, ticker, description, image, links) and the entry post together.

## Optional

- **Custom domain** (~$10/yr, looks more serious to judges): buy something like `patch.fun` or `bullrun.gg`, add it
  to Cloudflare, and send me the name. I'll wire it up.

---

## Done

- [x] Cloudflare: Worker `bullrun`, D1 `bullrun-db`, KV `bullrun-config` created under your account via your
      existing wrangler login. Nothing else in the account was touched.
- [x] Secret `DAILY_SEED_SALT` generated and set (random, never displayed).
