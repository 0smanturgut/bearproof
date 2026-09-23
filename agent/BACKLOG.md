# The Build Agent's backlog

Ideas the Build Agent can ship in one day, roughly in priority order. Holder votes choose among the three the
agent proposes each day; the agent keeps this list current (it may reorder it in `agent/notes.md`, but this file
is maintained by the operator between runs so the agent can't rewrite its own guardrails).

## Next up

1. **Rug Lord's second phase**: below 50% HP he pulls the rug: the floor scrolls and the player slides.
2. **Leverage evolution**: stacking Leverage 5 unlocks "Liquidation Risk": crits chain, but one hit costs 25% HP.
3. **Whale event**: once per run a whale crosses the screen and drops a burst of XP candles.
4. **Crypto Winter mini-boss**: an ice bear at 3:30 on the Winter stage.
5. **Achievements v2**: themed ("Survived a -50% day", "Bought the dip") with a small toast.
6. **Hopium evolution**: "Copium" — the aura also slows bears.
7. **Pickup: green god candle**: rare drop that clears the screen.
8. **Music v2**: a second procedural track that speeds up when a boss is alive.
9. **More daily twists**: the twist table (`TWISTS` in `game/src/sim/content.js`) has room for more rule changes.

Shipped already (Build #2): share cards, daily twists.

## Bugs and debt

- Horns only hit left and right; a vertical swing on evolution could feel better.
- Take-profit cards appear only when everything is maxed; consider a heal card at low HP.
- Bot check on the receipt screen (`game/src/turnstile.js`): when Turnstile wants a tap, the box appears with no
  hint and the submit gives up after 15 s, so the run ranks without a passed check and can't win the prize. Show
  a line like "Tap the box to make this run prize-eligible", wait up to 2 minutes once the widget turns
  interactive (`before-interactive-callback`), and keep the rest of the receipt usable meanwhile.
