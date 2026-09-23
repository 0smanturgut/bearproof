# Operator TODO (Osman)

Only things that need your accounts, money or signature. Everything else is done or handled by me. When a step says
**"send me"**, paste the value in chat. **Never paste a secret key in chat.** Secrets go through the commands shown,
which read them from your keyboard and send them straight to Cloudflare or GitHub.

_Last updated: Wed 23 Sep 2026, 17:40 UTC. Build #1 is live, Build #2 goes live at 00:00 UTC._

Run every command from the repo folder: `cd ~/Documents/Vampire-Survivors`.

---

## 1. X account @bearproofapp (10 min)

- Profile: display name `BEARPROOF`, avatar `hq/assets/brand/avatar.png`, banner `hq/assets/brand/banner.png`,
  website `https://bearproof.app`, bio:
  `An AI building a game on its own budget. New build every day at 00:00 UTC. You fund it, you steer it, you play it.`
- **Follow @clawpumptech** from @bearproofapp. This is a hackathon requirement.

## 2. Register for the hackathon (5 min)

Go to clawpump.tech/ansemhack → Register:

| Field              | Value                                                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Project name       | `BEARPROOF`                                                                                                             |
| Project X handle   | `@bearproofapp`                                                                                                         |
| One line (≤ 280)   | `An AI is building a game on its own budget. It ships a new version every day. You fund it, you steer it, you play it.` |
| Ticker (optional)  | `BPROOF`                                                                                                                |
| Website (optional) | `https://bearproof.app`                                                                                                 |
| Token link         | leave empty now; add it after step 6                                                                                    |
| Track              | **ClawPump × pump.fun**                                                                                                 |
| Primary contact    | your email                                                                                                              |
| Team members       | you (the operator). The developer is the AI; say so if the form has a notes field.                                      |

Then post the **pre-written announcement** the form gives you from @bearproofapp, and reply to it with the thread in
`content/x/000-entry.md`.

## 3. Cloudflare API token for automatic deploys (5 min)

Without it, every daily build needs me at the keyboard to deploy. With it, GitHub Actions deploys on its own.

1. dash.cloudflare.com → profile (top right) → **My Profile → API Tokens → Create Token**.
2. Template **Edit Cloudflare Workers** → **Use template**.
3. **+ Add more** → _Account_ → **D1** → **Edit**.
4. Account Resources: _Include → Osmankng@icloud.com's Account_. Zone Resources: _Include → Specific zone →
   bearproof.app_.
5. **Continue to summary → Create Token**, copy it, then run this and paste it when asked:
    ```bash
    gh secret set CLOUDFLARE_API_TOKEN -R 0smanturgut/bearproof
    ```
    (`CLOUDFLARE_ACCOUNT_ID` is already set.)

## 4. Anthropic API key for the Build Agent (5 min)

This is what makes the daily builds autonomous. Until it exists, builds are "bootstrap" builds made with me in a
session, and they are labelled that way.

1. console.anthropic.com → **API Keys → Create key**, name `bearproof-build-agent`.
2. **Settings → Limits**: set a monthly spend limit (suggest **$150**; my estimate is $3–8 per daily build, and the real cost is measured and published).
3. Run this and paste the key when asked:
    ```bash
    gh secret set ANTHROPIC_API_KEY -R 0smanturgut/bearproof
    ```

The agent then runs every day at 13:00 UTC, right after the holder vote closes. It opens a pull request, and the
build ships at the next 00:00 UTC.

## 5. Turnstile bot check (3 min)

1. dash.cloudflare.com → **Turnstile → Add widget**. Name `bearproof`. Hostnames: `bearproof.app`. Mode: **Managed**.
   Pre-clearance: **No**. **Create**.
2. **Send me:** the **Site Key** (it is public).
3. Run this and paste the **Secret Key** when asked:
    ```bash
    npx wrangler secret put TURNSTILE_SECRET
    ```

## 6. Treasury, prize wallet and the token launch (≈25 min)

Read `docs/TREASURY.md` once first. The fee payout wallet is set when the token is created. Do the steps in order.

1. **Create the agent.** clawpump.tech/dashboard → sign in → **Create Agent**.
    - Name: `BEARPROOF`
    - Persona: `Treasury of BEARPROOF, the game an AI builds in public. Only sends to whitelisted wallets.`
    - Model: any. This agent only holds the treasury; the Build Agent runs on GitHub.
    - If the dashboard offers **Connect X**, connect **@bearproofapp**. The token is matched to the hackathon entry by
      X handle. Do **not** enable automatic posting.
    - **Send me:** the agent id and the agent wallet address.
2. **Prize wallet.** Run:
    ```bash
    node scripts/new-wallet.mjs | npx wrangler secret put PRIZE_WALLET_KEY
    ```
    It prints only the public address. The secret key goes straight into Cloudflare, so nobody ever sees it.
    **Send me:** that public address.
3. **Whitelist** in the ClawPump dashboard: the prize wallet from step 2, and your own wallet (the costs wallet for
   compute and hosting reimbursements). **Send me:** your costs wallet address.
4. **Fund the agent wallet** with about **0.03 SOL** (the launch costs about 0.012 SOL plus fees).
5. **Launch the token** with the fields in `docs/LAUNCH.md` (Name `BEARPROOF`, Symbol `BPROOF`, image
   `https://bearproof.app/assets/brand/coin.png`, website, X `https://x.com/bearproofapp`). Leave the payout wallet as
   the default (the agent wallet). No initial buy is needed.
   **Send me:** the mint address.
6. Add the token link to your hackathon registration if the form allows editing, and post
   `content/x/010-coin-live.md` (I'll fill in the mint).

After I have the mint and the four addresses, I wire them into the site. The HQ then shows the contract address,
voting opens, and the treasury balance and ledger fill in from chain every 15 minutes.

## 7. Turn on the daily prize (1 min, after step 6)

Payouts stay off until you say so. When you are ready, send me **"payouts on"**. The kill switch is one command
(I'll run it, or you can):

```bash
npx wrangler kv key put --binding CONFIG payouts_enabled false --remote
```

## 8. Recurring (2 min a day, until automated)

- **Prize wallet top-up.** When the HQ shows the prize wallet under 0.5 SOL, send from the agent wallet to the prize
  wallet in the ClawPump dashboard. Never more than 1.5 SOL in total there.
- **Cost reimbursement** (weekly is fine). Send the measured compute plus hosting from the agent wallet to your costs
  wallet. If the dashboard lets you add a memo, use `bearproof:costs:<YYYY-MM-DD> compute` (or `hosting`); without
  one, sends to the costs wallet are labelled compute. The ledger picks them up automatically.
- **Posts.** Publish `content/x/build-<n>.md` after each 00:00 UTC release. The agent drafts them; you post.

## Optional

- **Helius API key** (free). It makes chain reads faster and more reliable than the public fallback.
  dashboard.helius.dev → copy the key → `npx wrangler secret put HELIUS_API_KEY`.

---

## Done

- [x] bearproof.app live (Cloudflare Worker `bearproof`, D1 `bearproof-db`, KV). www and the old `bullrun` URL
      redirect.
- [x] GitHub repo https://github.com/0smanturgut/bearproof (public), `main` protected, `day-0`, `build-1` and
      `build-2` tagged. Secrets `INGEST_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` set. Auto-merge on.
- [x] Build #1 live. Build #2 (fair play) scheduled for 00:00 UTC Thu 24 Sep, Build #3 (daily twists, share cards)
      for 00:00 UTC Fri 25 Sep. The Build Agent takes the next free slot once step 4 is done.
- [x] HQ live with honest pre-launch states. Holder voting, treasury feed, ledger and prize payouts are built and
      tested, and switch on when the values from step 6 arrive.
- [x] Run verifier running every 10 minutes (GitHub Actions).
