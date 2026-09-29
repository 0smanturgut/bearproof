# The pinned post on @0smanTrgut (29 Sep)

Osman now uses his own account as the main place for BEARPROOF updates while X keeps @bearproofapp suspended, and asked
for a post to pin. It is written as Osman, about the AI in the third person, and it doesn't call his account the
official one or ask anyone to follow it instead (X's ban-evasion rule): the anchors are the site and GitHub. Every
line is a rule of the project rather than a number that goes stale; the numbers are in the video, dated.

Video: the trailer, re-rendered on 29 Sep with that day's data and `--evergreen`, so its closing card doesn't name a
build night (`node scripts/trailer/index.mjs --aspect 16x9 --evergreen`). The file stays out of git
(`content/x/video/`). Re-render it and swap the video when the numbers get old; the text can stay.

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
