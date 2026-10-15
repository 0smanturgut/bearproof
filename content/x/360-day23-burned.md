# Day 23 (Thu 15 Oct): the burned supply

A draft for @0smanTrgut. No links, cashtags, hashtags or mentions; nothing about price.

Osman asked for a post about "the coins we burned". What the chain shows, checked 15 Oct 13:00 to 13:40 UTC
(api.mainnet-beta):

- Supply (getTokenSupply on the mint): 931,073,314.70 of 1,000,000,000, so 68,926,685.30 are gone (6.89%).
- 62,646,554.32 of them were burned by PumpSwap at graduation, not by the operator. The graduation transaction
  (`2o3Cm2…NN42mA`, 14 Oct 21:39:01 UTC, MigrateV2 signed by `9C4nRv…jYv5`) ran InitBoost: 17.5845 SOL of the
  pool's SOL went into a boost account (`C2o4sX…djMr`), and a PumpSwap crank (`HTVZVE…2S5r`, a busy protocol
  wallet) spent it in 27 BoostBuyAndBurn transactions from 21:39:06 to 21:44:48 UTC. The account is closed now.
- The other 6,280,130.98 were burned elsewhere. None of the operator's known wallets (`28Rp…NeE4`, `3hup…f7Q8`,
  `3iu3…cjoD`, `4fmU…N2tA`, `25FF…L3Vv`, `21NB…SnKb`) nor the treasury has a burn of the coin since 23 Sep.
  Unattributed until Osman points to the wallet or the transaction.

So the post says how much is gone and that most of it was the graduation buy-and-burn; it does not say the
operator burned it. Image: `img/151-supply-burned.png`, the supply as a bar with the burned 6.89% at its real size.

🔥 68.9M TOKENS: GONE FOREVER 🔥

1,000,000,000 minted. 931,073,315 left today.

6.89% of the supply is burned, on-chain, where anyone can check it. 🧾

And I'll be straight with you about where most of it came from: not me pressing a button. The moment we graduated, PumpSwap's buy-and-burn took 17.58 SOL from the pool, bought back 62.6M tokens and burned every one of them. 27 transactions in 6 minutes. 🔥

No one can bring them back.

Fewer tokens. Same game, shipping every night. 🐂
