# The pinned post on @0smanTrgut (29 Sep)

Osman now uses his own account as the main place for BEARPROOF updates while X keeps @bearproofapp suspended, and asked
for a post to pin. It is written as Osman, about the AI in the third person, and it doesn't call his account the
official one or ask anyone to follow it instead (X's ban-evasion rule): the anchors are the site and GitHub. Every
line is a rule of the project rather than a number that goes stale; the numbers are in the video, dated.

Video (Osman asked for something new, not the trailer again): `video/72-one-night-vertical.mp4`, 32 s, 9:16 for
phones, with its own soundtrack. It tells one real night, Build #7 (28 Sep):

1. Rug Lord pulls the rug: "An AI built this boss fight." (Build #7, autopilot, seed 34 at 5:04, phone view).
2. The real `/live` page in its phone layout, replaying the session's public log at 60×: 21:00 UTC, it reads your
   runs, writes the code, runs 227 tests.
3. "Last night, runs ended at 1:06": Build #6 on the same seed at 0:35, where the doomposters' shots come in from off
   the phone's screen.
4. "So now they type before they shoot": Build #7 at 0:36, the first 3 s at 0.4× speed, labelled "slow motion".
5. The live site's receipts on a phone, scrolling from the wallets to the 28 Sep Daily Pot payouts.
6. 7 days, 7 builds, $17.76 of AI compute (builds #3–#7), 0 lines written by hand since the fork; then the end card.

Every clip is labelled on screen (autopilot, phone view, replay, live site). The game clips use the renderer's own
scale × 1.15, about what a phone shows across. The music is synthesised in WebAudio (D minor, 100 BPM, the cuts on
its bars) with typing clicks for the doomposters. The recording and assembly scripts live in the session scratchpad,
not in the repo. The 29 Sep trailer render (`--evergreen`) is kept as `video/trailer-pinned/` as a spare.

---

An AI is building a game in public. Every night it writes a new version, tests it, and ships it at 00:00 UTC.

That's BEARPROOF, and I'm Osman, the human who runs it. I don't write the code.

How it works:
• 21:00 UTC: holders vote on the AI's three ideas, and anyone can drop one in the ideas box. The AI reads the vote and the player data, writes the build, runs the tests, and a second AI session reviews it. You can watch the whole session live.
• 00:00 UTC: the build ships and a new Daily Challenge starts on it. Same seed for everyone, and every run is replayed on the server before it counts.
• After 00:10 UTC: the Daily Pot pays out. 40% of the day's creator fees, split between the best runs and the players who clear the AI's bounty. Free to play: you never need the coin to win.

Everything is public: the code, every build since Day 0 (all still playable), and every fee and payout on the ledger, each with a Solscan link.

The coin is $BPROOF, launched on ClawPump for AnsemHack. It funds the Daily Pot and gives holders the vote. It isn't an investment.
CA: 6aktZWaJLQpe3sey13uCwAn7s977mhuKdbVHP8t7ttZX

X suspended @bearproofapp on 27 Sep. Only trust the CA shown on the site and on GitHub.

Play free in your browser: bearproof.app
Code: github.com/0smanturgut/bearproof
