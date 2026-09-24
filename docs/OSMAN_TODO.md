# Operator TODO (Osman)

Only things that need your accounts, money or signature. Everything else is done or handled by me. When a step says
**"send me"**, paste the value in chat. **Never paste a secret key in chat.** Secrets go through the commands shown,
which read them from your keyboard and send them straight to Cloudflare or GitHub.

_Last updated: Thu 24 Sep 2026, 16:45 UTC. Build #2 is live; tonight 21:00 UTC the Build Agent makes Build #3 on its own, live at bearproof.app/live._

Run every command from the repo folder: `cd ~/Documents/Vampire-Survivors`.

---

## 1. X account @bearproofapp ✅ done (23 Sep)

If you haven't yet: **follow @clawpumptech** from @bearproofapp. It is a hackathon requirement.

## 2. Register for the hackathon (5 min)

Go to clawpump.tech/ansemhack → Register:

| Field                      | Value                                                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Project name               | `BEARPROOF`                                                                                                             |
| Project X handle           | `bearproofapp` (the form already shows the @)                                                                           |
| One line (≤ 280)           | `An AI is building a game on its own budget. It ships a new version every day. You fund it, you steer it, you play it.` |
| Ticker (optional)          | `BPROOF` (the form already shows the $)                                                                                 |
| Live website (optional)    | `https://bearproof.app`                                                                                                 |
| Token link (optional)      | `https://clawpump.tech/token/6aktZWaJLQpe3sey13uCwAn7s977mhuKdbVHP8t7ttZX`                                              |
| Tracks                     | **ClawPump × pump.fun** only. Not Inference Markets (we don't use UsePod yet), not EasyA (we launched on ClawPump).     |
| Primary contact (optional) | `Osman`                                                                                                                 |
| Email                      | your email (the only thing they contact)                                                                                |
| Teammates                  | none. The developer is the AI; the HQ and the pinned post say so.                                                       |

The ClawPump token page already shows @bearproofapp, so the token attaches to the entry by itself; the link is a
second receipt.

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

## 6. Coin ✅ launched (23 Sep) · prize wallet still open (≈5 min)

Wired into the site and checked on chain:

- Mint `6aktZWaJLQpe3sey13uCwAn7s977mhuKdbVHP8t7ttZX` (Token-2022, BEARPROOF / BPROOF, 1B supply, no mint or
  freeze authority).
- Treasury = the ClawPump agent wallet `GNJoHj9yfn3jqNNkC5ffQDaB5vTrnvVqy4FjQuXmBLS6`. ClawPump claims the creator
  fees from the coin's pump.fun creator vault (`CGy3DD…uBpp`, creator wallet `DvJVRb…918c`, run by ClawPump) and
  forwards the agent's 75% share here.
- Launch receipt on the HQ: the agent wallet paid 0.7335 SOL to ClawPump (`49CfXA…nGCq`) for the creation and a
  launch buy of 24,845,152 BPROOF (2.48%), which the treasury holds.
- ClawPump has no agent id for a single agent, so fees are measured from chain instead.

Done since: the prize wallet `GD9HPVpLqDxYfgf9ZNQDN3WwCfZips7tVCHAhMcchRo5` exists (its key is a Worker secret),
`5Em3PQ…ZVv3` is labelled as your wallet (operator funding; costs are paid back to it), and the coin-live and Build #2
posts are out.

Still needed from you:

1. **Whitelist** the prize wallet `GD9HPVpLqDxYfgf9ZNQDN3WwCfZips7tVCHAhMcchRo5` in the ClawPump dashboard, then send
   it about **0.5 SOL** from the agent wallet. Copy the address from here, never from a wallet's history
   (address-poisoning spam already targets the agent wallet).
2. Add the token link to your hackathon registration if the form allows editing.

## 7. Daily prize ✅ on (24 Sep, 01:38 UTC)

The selftest showed the prize key belongs to `GD9HPV…hRo5` (0.6 SOL). The first payout is for the 24 Sep challenge,
after 00:10 UTC on 25 Sep. Your own runs rank but can't win (tagged "operator" on the board).

Kill switch, if anything looks wrong (tell me, or run it yourself):

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

## 9. 24/7 live stream of the control room on X (optional, ≈20 min)

`https://bearproof.app/live?tv=1` is a fixed 1920×1080 screen made for streaming: the live build playing on
autopilot, what the AI knows about its players, tomorrow's ballot, live activity (runs, server verifications, votes,
requests, fees, prizes) and, every night from 21:00 UTC, the AI's console as it builds. It says **LIVE NOW** only
while a real build session is running; the rest of the day it shows the countdown and, now and then, a replay of the
last session, labelled as a replay. It reloads itself twice a day (never during a session) and switches to the new
build at 00:00 UTC on its own. Nothing to update on your side.

**VPS route ✅ server ready (24 Sep):** the Hostinger VPS (76.13.2.222) is set up and tested end to end (720p30,
steady). Clash is stopped there (containers kept, data untouched; `docker start clash-mariadb-1 clash-server-1
clash-web-1` brings it back). What's left for you:

1. Get the RTMP URL and stream key from X (step 1 below).
2. Run this in the Terminal tab. It asks for the URL, then the key (hidden, never shown to me), and starts the
   stream: `ssh -t -i ~/.ssh/bearproof_vps root@76.13.2.222 'bash /opt/bearproof/ops/stream/set-key.sh'`
3. In X Producer: **Broadcasts → Create broadcast**, pick the source, title, **Go live**. The server keeps sending
   24/7; you only start and end broadcasts.

Skip steps 2–6 below (they're the OBS-from-your-Mac route).

1. **X: get a stream key.** On a computer, open **x.com → More → Creator Studio (Media Studio) → Producer → Sources →
   Create source**, region nearest to you. It shows an **RTMP URL** and a **stream key**. The key is a secret: don't
   paste it in chat. If you don't see Producer, the account doesn't have live access yet; X's help page "How to go
   live on X" lists what it needs. Skip this section if it isn't there.
2. **Install OBS Studio** from obsproject.com (free).
3. **OBS → Settings:**
    - **Video:** Base and Output resolution `1920x1080`, FPS `30`.
    - **Output → Streaming:** Video bitrate `6000 Kbps`, Keyframe interval `3 s` (switch Output Mode to Advanced if you
      don't see it), Audio bitrate `128`.
    - **Stream:** Service `Custom…`, Server = the RTMP URL from step 1, Stream Key = the key from step 1.
4. **OBS → Sources → + → Browser:** URL `https://bearproof.app/live?tv=1`, Width `1920`, Height `1080`, FPS `30`.
   Untick "Shutdown source when not visible", tick "Refresh browser when scene becomes active". OK.
5. **Start Streaming** in OBS, then in X Producer create the broadcast, title for example
   `An AI is building a game, live. Build session every night 21:00 UTC. bearproof.app` and click **Go live**.
6. **Keep the Mac awake:** plug it in, and run `caffeinate -dimsu` in a Terminal tab while the stream runs
   (Ctrl+C stops it). If X ends the broadcast after some hours, press Go live again; the key stays the same.

Pin the broadcast (or a post linking it) during the 21:00–00:00 UTC session: that's when the console is live.

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
