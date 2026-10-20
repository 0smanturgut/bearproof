# Build #29 plan: Play as The Miner

## The update

**The Miner, a fourth playable character.** Chosen in the vote (14 of 16 votes). An original mole in a hard hat
with a headlamp. He opens a run with the **Pickaxe**, which he throws at the nearest bear. It spins out, comes
back to him, hits every bear once on the way out and once on the way back, and cracks a grizzly's shield in one
hit. His trait is **Block Reward**: kills fill a hash meter, and every full block sets off a quake around him that
hits every bear in reach and cracks every shield. Then the difficulty adjusts: each block needs 15% more kills
than the last. 110 HP, a little slower than the bull. He's unlocked in the Market for CLOUT.

## Why today

He won the vote, and Road to 1.0 #9 (more characters) lists him by name. Grizzlies cause 29.2% of verified deaths
on the live build (14 of 48), the top killer, and 54% of autopilot deaths. Their shield halves damage until it has
soaked 60, so a character built around cracking shields answers the game's biggest killer.

## Parts

1. **Sim** (`content.js`, `weapons.js`, `entities.js`, `sim.js`): `CHARACTER_IDS` gets 'miner' (index 3). PICKAXE
   weapon (`type: 'pickaxe'`, `character: 'miner'`, evolves at level 5 into Diamond Pickaxe: two picks fanned out).
   A `ThrownPick` entity (out to range, back to the player, a hit set per leg). Block Reward: `blockKills`,
   `blockGrowth`, `blockRadius`, `blockDamage` on the character. Kills are counted at the kill site. A block
   waiting to go off resolves after `_cullDead`, like the Whale's sweep. Stats: `pickHits`, `blocks`. Bump
   SIM_VERSION to 26 (or one above whatever it is now).
2. **Art**: `miner_hero` (4-frame walk, a mole with a hard hat and a glowing headlamp, the pickaxe on his back),
   the `pickaxe` icon (also drawn spinning in flight), the `block_reward` icon. Materials for mole fur and the hat.
3. **Render/juice**: the spinning pick in flight, the hash meter arc under the Miner (like the sweep meter), the
   quake ring with debris, a "BLOCK MINED" toast, shield-crack bursts, screen shake (respects reduced motion).
4. **Sound**: a pick "whoosh-clink" on the throw, a deep thud plus a coin chime for a block.
5. **Product**: Market item `char_miner` (CLOUT), the `miner_default` skin, four Miner missions plus a Missions
   tab, and the HQ autopilot picks him up through CHARACTER_IDS.
6. **Tests**: `game/test/the-miner.test.js`: the pick goes out and comes back, it hits once per leg, it cracks
   shields, evolution throws two, blocks fire at the right kill counts with growing difficulty, the quake cracks
   shields, other characters' runs stay the same, the run log round-trips the miner. Plus the
   profile/missions/art tests.
7. **Balance**: `playtest --character miner --compare origin/main` against the bull (4:09 baseline). Aim for the
   bull to the Whale's band, not far above it.

## Order (so a cut still leaves a complete character)

Sim plus tests, then art (an agent works in parallel), then render/sound, then Market/missions, then balance,
gates, smoke shots, devlog.

## Files

game/src/sim/{content,weapons,entities,sim}.js, game/src/art/{creatures,icons,materials,sprites}.js,
game/src/{render,game,audio,profile,missions}.js, game/test/the-miner.test.js plus small test updates,
devlog/build-29.md, agent/proposals/build-29.json, content/x/build-29.md, agent/notes.md.
