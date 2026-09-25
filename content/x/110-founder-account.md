# Posting from the operator's own account: @0smanTrgut (from 26 Sep)

X limited @bearproofapp on 25 Sep: other accounts see its posts as "not found", and a case with X support is open. A
second brand account is not an option (X treats it as evading its enforcement), and ClawPump's DMs are closed. So from
26 Sep Osman posts BEARPROOF updates from his own account, **@0smanTrgut** (Osman Turgut, on X since January 2025).

- **A person, not the brand.** Osman posts as himself, about what the AI did ("the AI shipped…"). Never as the AI,
  never as BEARPROOF's account, never a copy of an @bearproofapp text. Drafts come from a bootstrap session, like
  everything in this folder; Osman reviews and posts them.
- **@bearproofapp stays the official account**: the hackathon registration, the coin's X link, the 24/7 stream. It
  isn't deleted or renamed, and it stays quiet while the case runs. The Build Agent's `build-<n>.md` drafts wait.
- **Volume: Osman's call, 10–15 posts a day** (reach matters during judging). It ramps: 6–8 on the first day, about
  10 on the second, 10–15 after that, with roughly half of them replies in real conversations. What got
  @bearproofapp limited was the pattern, not the count, so the rest of `README.md` holds: one or two links a day, only
  inside a post with context; mentions only for people who engaged first; no promo replies; no repeated lines; the CA
  only in the pinned post or when someone asks; at least 30 minutes between posts.
- **Never about price.** Builds, players, receipts.

## Checked before writing (26 Sep review)

Every claim below was checked against the repo and the live API. What that changed:

- **The vote.** Say "picked in the holder vote". Give a share only together with the number of wallets that voted
  (`/api/vote/result?date=<poll date>`).
- **Bills.** Osman pays compute and hosting for now. Don't say the treasury pays them back until the ledger shows a
  reimbursement to the costs wallet.
- **Code.** "I don't write the code" holds: every commit since `day-0` is by Claude Code (bootstrap) or the Build
  Agent. Don't say every commit carries a `Build-Mode` label: most do, not all.
- **Authorship.** Don't say "in my own words": the drafts come from an AI session.
- **Review.** The second check is a fresh Claude Code session ("a second AI session"), not a different model.

## Trust chain

- bearproof.app (operator card, FAQ, footer) and the README link @0smanTrgut.
- @bearproofapp's bio names @0smanTrgut as operator; its profile is visible even while its posts aren't.
- The pinned post on @0smanTrgut says who he is and why he posts there.
- ClawPump hears it in their own thread: a reply to their last note, since their DMs are closed.

## Setup (Osman), in this order

1. Change @bearproofapp's bio first (step 5): only its owner can, so it proves the link at once. The site's footer
   ("Operator @0smanTrgut") follows with the 00:25 UTC push.
2. The profile first, before Premium. A name, photo or handle change after subscribing takes the checkmark away until
   X reviews the account again, and blocks further changes meanwhile.
    - Name: `Osman Turgut`
    - Bio (152 characters): Human operator of @bearproofapp, a game an AI builds on its own budget, with a new build every night. I keep the lights on and hold the emergency brake.
    - Website: `https://bearproof.app`
    - Photo: a real photo of you. Header: `hq/assets/brand/banner.png`.
3. Subscribe to **Premium** (not Basic: Basic has no checkmark and a smaller reply boost). Long posts work at once;
   the checkmark comes after X's review.
4. Follow @bearproofapp and @clawpumptech. No mass-follows, no reposts of @bearproofapp.
5. @bearproofapp bio (134 characters):

An AI building a game on its own budget. New build every night. Operator: @0smanTrgut
CA: 6aktZWaJLQpe3sey13uCwAn7s977mhuKdbVHP8t7ttZX

## First posts (from 25 Sep, 22:30 UTC)

| When (UTC)       | Post                                               | Media                           |
| ---------------- | -------------------------------------------------- | ------------------------------- |
| now              | Pinned post, then pin it                           | `video/22-build3-timelapse.mp4` |
| right after      | Reply under ClawPump's last reply to @bearproofapp | none                            |
| after 00:30      | Build #4, once the check below is done             | `video/38-build4-crates.mp4`    |
| 26 Sep, from day | The founder video (Osman on camera), then pin it   | filmed by Osman                 |

### Pinned post (Premium)

The bullets are dated by the night each build was written (UTC); builds go live at the next 00:00 UTC.

I'm Osman, the human behind BEARPROOF.

BEARPROOF is a game an AI builds on its own budget. Every night at 21:00 UTC, when the holder vote closes, the AI gets to work: it reads the vote and the day's player data, writes the next version, tests it, and a second AI session reviews it. If every check passes, the new build ships at 00:00 UTC. You can watch the whole session live.

My part: I set up the accounts and servers, pay the bills for now, and hold the emergency brake. I don't write the code. Anything I ask the nightly AI for is published with that build.

Why I'm posting from here: X's spam filters limited @bearproofapp after we posted too much, too fast, and right now its posts don't show up for most people. I have a case open with X support. Until it's fixed, updates come from my account.

So far:
• 24 Sep: Build #3, the first one the AI wrote with no human in the session. A holder asked for a second character, so it drew one from scratch: Pepe. 29 minutes, $4.36 of compute.
• 25 Sep: the first daily $ANSEM prize, paid on-chain to the best verified run.
• 25 Sep: Build #4, airdrop crates, picked in the holder vote. 16 minutes, $4.20.

Play it free in your browser, no wallet needed: bearproof.app. The live sessions, the code, every devlog and a ledger of every SOL are all there too.

CA: 6aktZWaJLQpe3sey13uCwAn7s977mhuKdbVHP8t7ttZX

### Reply to ClawPump

Under ClawPump's most recent reply to @bearproofapp (the note that suggests "Trade the coin. Fees fund the game…"). No
link.

Osman here, the human behind BEARPROOF. X is hiding @bearproofapp's posts for now (support case open), so this thread looks one-sided. Sorry about that.

Your note made our "How it works" plainer, and the site credits you. Thanks! Until X fixes it, updates come from my account.

### Build #4 (Premium)

From `devlog/build-4.md`: merged 21:16:17 UTC, measured $4.2034, 170 tests; rug pullers 23.6%, doomposters 11.3%.
Post it after 00:00 UTC, once https://bearproof.app/play opens Build #4.

Build #4 of BEARPROOF is live: airdrop crates. The AI wrote it in 16 minutes, from the 21:00 UTC vote close to the merge, for $4.20 of compute. All 170 tests green.

40 seconds into a run, and then every minute, a crate parachutes down near you. Walk into it and it breaks open: a magnet that pulls in every candle on the map, 8 seconds of shield, or the Money Printer, double fire rate for 10 seconds.

The part I like most is why it made the shield block everything: on Build #3, rug pullers ended 23.6% of runs, more than twice anything else. It read the player data first, then built.

The next build starts at 21:00 UTC.

## After that

- One post a day about last night's build, as Osman, from its devlog: what shipped, minutes from 21:00 UTC to the
  merge commit, the measured cost, the tests, one "why" from the data section, tonight's proposals.
- Replies only to people who reply to him or mention him.
