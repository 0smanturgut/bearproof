# Pitch kit (for the AnsemHack stream)

Everything here must stay true on the day it is said. Before a stream, open https://bearproof.app and read the live
numbers from the page. **Never round up, never estimate out loud as if it were measured, never talk about price.**

The one-liner, word for word:

> An AI is building a game on its own budget. It ships a new version every day. You fund it, you steer it, you play it.

---

## 30-second pitch

BEARPROOF is a game that an AI builds in public. You're a bull surviving an endless bear market, and it plays in any
phone browser in one tap, no wallet. Every day at 00:00 UTC, the AI, Proof, ships a new build and a new Daily
Challenge starts on it. The coin, $BPROOF, is its budget: creator fees pay for its compute, its hosting and a daily
$ANSEM prize for the best verified player. Holders vote on what it builds next. Every commit, build, cost and payout
is public. You can watch it get better every day.

## 2-minute pitch

Most AI-agent tokens show you a wallet balance. We show you a product that changes every day.

**What it is.** BEARPROOF is a fast survivors-like: red candles, rug pullers, Ponzi pyramids that split into their
downline, and bosses like the Rug Lord and Liquidation. It's free, it's in the browser, and it's built for phones.

**Who builds it.** Proof, an AI developer. Every day it reads the holder vote, picks one feature, writes the code on a
branch, and has to pass the tests, a headless smoke test and a determinism check before anything merges. The
pipeline only lets it touch game code and its own devlog. It can't touch money, secrets or CI. If a day fails, the
devlog says so. Every commit is labelled `agent`, `bootstrap` or `human`, so nobody has to take our word for it.

**Why the leaderboard is real.** The simulation is deterministic across JavaScript engines, down to our own sin and
cos. Every run is a tiny input log, and the server replays it tick by tick against the exact build it was played
on. A score that doesn't replay doesn't count.

**The money loop.** Trades create creator fees. Fees fund the treasury. The treasury pays for the AI's compute and
hosting, and a capped daily prize in $ANSEM for the verified #1, bought on-chain through Jupiter and sent
automatically. You never need to hold anything to play or to win. Holding gives you a vote and cosmetics, nothing
else.

**Receipts.** Every SOL in and out of the treasury is on the site with a Solscan link. The fork point is tagged
`day-0`, so anyone can diff exactly what the AI added.

The daily ritual is the product: a new build, a new challenge, a new devlog, every day.

---

## The 4 judge questions

### 1. Founder and team

- **Osman** (operator): independent Solana, web and game developer. _[Osman: add one or two lines on past projects.]_
  He set up the accounts, funds hosting until the treasury can, launched the coin, posts the daily update, and
  holds the emergency revert and payout kill switches. He does not write the daily features; if he ever does, the
  commit is labelled `human`.
- **Proof** (the developer): the Build Agent, Claude running headless in GitHub Actions on a schedule, with a
  path guard and test gates around it. Before the schedule was switched on, the setup builds were made by Claude
  Code in sessions Osman started. Those are labelled `bootstrap`.

### 2. Product, demo and problem

- **Problem.** Agent tokens are mostly promises: a roadmap and a balance. People can't see or touch what the
  money does, so they can't believe it.
- **Product.** A product anyone can touch in five seconds, visibly getting better every day, with every step
  public: the build, the diff, the cost and the payout.
- **Demo:** see the stream script below.

### 3. Market, GTM and traction

- **Market.** Two habits that already work: daily-challenge games (one seed per day for everyone, a shareable
  result) and crypto Twitter watching agents do things in public. BEARPROOF is both at once, and the jokes are
  native to the audience.
- **GTM.** The daily ritual is the distribution. Every day there is a new build to post, a new challenge to share,
  and a winner to pay on-chain. Every share carries the build number. Holders who vote have a reason to come back
  and post the result.
- **Traction.** Read these live from the HQ strip, and only these: day number, builds shipped, players today,
  today's #1 score, treasury balance, spent on compute (measured). Before a number exists, say "not yet".

### 4. Token utility, roadmap and vision

- **Utility of $BPROOF.** It's the AI's budget (creator fees fund compute, hosting and prizes), a vote on the next
  feature (weight = √tokens, so a whale can't own the roadmap), and cosmetics. It is never needed to play or win.
- **Net-new $ANSEM use case.** A daily prize bought with treasury SOL through Jupiter and paid to the verified
  winner automatically, capped at min(10% of the previous 24 h of fees, 0.5 SOL). Every payout links to Solscan.
- **Roadmap.** Next: holders choose the daily feature, share cards for every run, a replay viewer for the daily #1,
  holder cosmetics, and moving the treasury top-ups from the operator to the agent.
- **Vision.** The pattern is bigger than one game: a community funds an AI, steers it, and uses what it ships, with
  receipts at every step. BEARPROOF is the first studio. The pipeline (guarded autonomous builds, verifiable scores,
  on-chain receipts) is open source for the next one.

---

## 15-minute stream script

Have open before going live: bearproof.app on a phone (screen share or camera), bearproof.app on desktop, the
GitHub repo, and the latest agent pull request.

| Time        | What to show                                                                                                                    | What to say                                                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–1:00   | The HQ above the fold                                                                                                           | The one-liner. "Today is day N. Proof has shipped N builds."                                                                                 |
| 1:00–2:00   | —                                                                                                                               | Question 1: Osman, Proof, and what each one does.                                                                                            |
| 2:00–5:00   | Phone: tap PLAY NOW and play today's Daily Challenge for a minute. End the run and share it.                                    | "No wallet, no signup. Same seed for everyone today. This is Build #N."                                                                      |
| 5:00–7:30   | HQ: today's build and the timeline, then GitHub: the agent's PR for today (plan, diff, green checks) and the `day-0` diff link. | "This is what Proof shipped overnight. It had to pass these gates. It can only touch these paths. Here's what it cost, measured."            |
| 7:30–9:00   | HQ: the Daily Challenge board with verified badges.                                                                             | "Every score is a replay. The server re-runs it tick by tick against this exact build. Only verified runs can win."                          |
| 9:00–11:00  | HQ: How it works, then Receipts (wallets, ledger, a prize payout on Solscan).                                                   | The money loop. The $ANSEM prize, the caps and the kill switch. "Every row links to the chain."                                              |
| 11:00–12:30 | HQ: Vote on tomorrow.                                                                                                           | "Holders pick tomorrow's feature by signing a message. There's no transaction. The weight is √tokens. Proof builds the winner at 13:00 UTC." |
| 12:30–15:00 | —                                                                                                                               | Question 4: roadmap and vision. Then take questions.                                                                                         |

**If something breaks live:** say so, and show the devlog of a failed day if there is one. Honest failure is part of
the story. The revert is one command, with no redeploy:
`npx wrangler kv key put --binding=CONFIG --remote build_override <n>` serves Build #n at /play at once, and
`npx wrangler kv key delete --binding=CONFIG --remote build_override` undoes it.

## Live metrics to have ready

| Metric                      | Where                                                           |
| --------------------------- | --------------------------------------------------------------- |
| Day N, builds shipped       | HQ strip, or `GET /api/stats` (`day`, `buildsShipped`)          |
| Players today, top score    | HQ strip (`playersToday`, `topScoreToday`)                      |
| Verified runs               | Daily board (`GET /api/leaderboard`)                            |
| Treasury balance            | HQ strip and Receipts (on-chain, refreshed every 15 min)        |
| Spent on compute (measured) | HQ strip (`computeSpentUsd.measured`)                           |
| Prizes paid                 | Receipts ledger, category "Daily prize", each with a Solscan tx |
| What the AI added           | `https://github.com/0smanturgut/bearproof/compare/day-0...main` |

## Never say

Price, market cap targets, gains, "early", "going to", 100x, investment, returns. Never "fully autonomous" for a
build labelled `bootstrap`. Never a player or volume number that isn't on the page.
