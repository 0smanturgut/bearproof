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
judges look for). The pinned post is `content/x/000-pinned.md` (with the CA): post it, pin it, and reply to the
announcement with its link.

## 3. Cloudflare API token ✅ done (23 Sep)

`CLOUDFLARE_API_TOKEN` is set in GitHub. A test deploy through GitHub Actions uploaded the Worker, kept both custom
domains and passed the live check. Daily builds now deploy without anyone at the keyboard.

## 4. Anthropic API key for the Build Agent ✅ done (23 Sep)

`ANTHROPIC_API_KEY` is set in GitHub. The agent runs every day at 21:00 UTC, right when the holder vote closes. It
opens a pull request, and the build ships at the next 00:00 UTC. Keep a monthly spend limit on the key
(console.anthropic.com → Settings → Limits; suggested **$150**).

## 5. Turnstile bot check ✅ done (23 Sep)

Site key and `TURNSTILE_SECRET` are set; `/api/health` reports `turnstile: true`. Only runs with a passed check can
win the daily prize.

## 6. Coin ✅ launched (23 Sep) · prize wallet and IDs still open (≈10 min)

The coin is live and wired into the site: mint `6aktZWaJLQpe3sey13uCwAn7s977mhuKdbVHP8t7ttZX` (checked on chain:
Token-2022, BEARPROOF / BPROOF, 1B supply, no mint or freeze authority). The treasury on the HQ is the coin's
creator wallet `DvJVRbuB7yf6yswfZgZK2TRyQEjwjzap5Sb3TwJ918c`, where pump.fun creator fees accrue. Voting and
holder requests open with the next ballot at 00:00 UTC.

On chain I also see: the creator wallet was funded with 0.7335 SOL from `49CfXAr5…`, bought 24,845,152 BPROOF
(2.48% of supply) at launch and moved them to `GNJoHj9y…`. The public ledger shows this as launch receipts.

Still needed from you (**send me** the values; none of them is a secret):

1. **Confirm** that `DvJVRbuB…918c` is the ClawPump agent wallet, and send the **ClawPump agent id** (the fee
   snapshot, and so the prize amount, needs it).
2. **Tell me** what `49CfXAr5…` (funded the launch) and `GNJoHj9y…` (holds the launch buy) are, so the ledger
   can label them (for example "operator wallet"). If the launch buy is yours, say whether it is locked or not;
   the HQ will state it either way.
3. **Prize wallet.** Run this and send me the public address it prints (the secret goes straight to Cloudflare):
    ```bash
    node scripts/new-wallet.mjs | npx wrangler secret put PRIZE_WALLET_KEY
    ```
4. **Whitelist** the prize wallet and your costs wallet in the ClawPump dashboard, and **send me** the costs
   wallet address.
5. Add the token link to your hackathon registration if the form allows editing, and post
   `content/x/000-pinned.md` and pin it (it carries the CA). `010-coin-live.md` is optional.

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

## Helius API key ✅ done (23 Sep)

`HELIUS_API_KEY` is set. The treasury balance, the unclaimed creator fees and the ledger read from chain every 15
minutes, and vote and request balance checks go through Helius first.

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
