# Operator TODO (Osman)

Only things that need your accounts, money or signature. Everything else is done or handled by me. When a step says
**"send me"**, paste the value in chat. **Never paste a secret key in chat.** Secrets go through the commands shown,
which read them from your keyboard and send them straight to Cloudflare or GitHub.

_Last updated: Wed 23 Sep 2026, 21:20 UTC. Build #1 is live, Build #2 goes live at 00:00 UTC Thu 24 Sep._

Run every command from the repo folder: `cd ~/Documents/Vampire-Survivors`.

---

## 1. X account @bearproofapp ✅ done (23 Sep)

If you haven't yet: **follow @clawpumptech** from @bearproofapp. It is a hackathon requirement.

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

Then post the **pre-written announcement** the form gives you from @bearproofapp, exactly as given (it is the receipt
judges look for). The pinned intro post is `content/x/000-entry.md`: post it after 00:00 UTC on 24 Sep, pin it, and
reply to the announcement with its link.

## 3. Cloudflare API token ✅ done (23 Sep)

`CLOUDFLARE_API_TOKEN` is set in GitHub. A test deploy through GitHub Actions uploaded the Worker, kept both custom
domains and passed the live check. Daily builds now deploy without anyone at the keyboard.

## 4. Anthropic API key for the Build Agent ✅ done (23 Sep)

`ANTHROPIC_API_KEY` is set in GitHub. The agent runs every day at 13:00 UTC, right after the holder vote closes. It
opens a pull request, and the build ships at the next 00:00 UTC. Keep a monthly spend limit on the key
(console.anthropic.com → Settings → Limits; suggested **$150**).

## 5. Turnstile bot check ✅ done (23 Sep)

Site key and `TURNSTILE_SECRET` are set; `/api/health` reports `turnstile: true`. Only runs with a passed check can
win the daily prize.

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
      `build-2` tagged. Secrets `INGEST_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and `ANTHROPIC_API_KEY` set. Auto-merge on.
- [x] Build #1 live. Build #2 (new look, daily twists, share cards, fair play) goes live at 00:00 UTC Thu 24 Sep.
      The Build Agent takes the next free slot (Fri 25 Sep).
- [x] X account @bearproofapp set up. Turnstile live (site key + secret). CI deploys with its own Cloudflare token.
- [x] HQ live with honest pre-launch states. Holder voting, treasury feed, ledger and prize payouts are built and
      tested, and switch on when the values from step 6 arrive.
- [x] Run verifier running every 10 minutes (GitHub Actions).
- [x] Runs go on the board the moment they end; the prize address is asked on the game-over screen (no wallet
      connection); desktop SHARE opens a share screen (card, Post on X, Copy, Save image).
- [x] Ballot: the AI's three proposals plus holders' own requests (≥ 100,000 $BPROOF, one a day). Switches on with
      the coin, like voting. Abusive requests can be hidden with one command (docs/API.md, operator endpoint).
