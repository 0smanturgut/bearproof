/**
 * @module sim/bot
 * @description A small autopilot that plays the game from simulation state. Used by the HQ attract mode
 * (the live preview) and by tests that need long, realistic runs. It returns move codes like a real
 * player's input. It is NOT part of the simulation: its output is recorded, so its own determinism
 * doesn't matter for replays.
 */

import { encodeMove } from './input-codes.js';

export function createBot({ style = 'survive', phase = 0 } = {}) {
    let t = phase;
    let turn = phase & 1 ? 1 : -1; // which way it goes round things
    let last = null; // where the bull was half a second ago
    let detour = 0;
    return {
        /** Move code for this tick. */
        move(sim) {
            t++;
            const p = sim.player;
            let fx = 0;
            let fy = 0;
            if (style === 'reckless') {
                const e = nearest(sim.enemies, p);
                if (e) {
                    fx = e.x - p.x;
                    fy = e.y - p.y;
                }
            } else if (p.rocketTimer > 0 && nearest(sim.enemies, p, 400, (e) => canRam(sim, e))) {
                // On a Moon Rocket: untouchable, so ram the nearest bear it hasn't hit yet.
                const e = nearest(sim.enemies, p, 400, (e) => canRam(sim, e));
                fx = e.x - p.x;
                fy = e.y - p.y;
            } else {
                // Kite: close in on the nearest bear, back off from anything inside ~90 units, dodge shots,
                // and hoover up XP when the coast is clear.
                const target = nearest(sim.enemies, p);
                let crowd = 0;
                for (const e of sim.enemies) {
                    const dx = p.x - e.x;
                    const dy = p.y - e.y;
                    const d2 = dx * dx + dy * dy;
                    const keep = (e.boss ? 150 : 48) + e.size;
                    if (d2 > keep * keep) continue;
                    const w = (e.boss ? 3 : 1) / (d2 + 40);
                    fx += dx * w;
                    fy += dy * w;
                    crowd++;
                }
                for (const b of sim.enemyProjectiles) {
                    const dx = p.x - b.x;
                    const dy = p.y - b.y;
                    const d2 = dx * dx + dy * dy;
                    if (d2 < 110 * 110) {
                        fx += (dx * 1.5) / (d2 + 30);
                        fy += (dy * 1.5) / (d2 + 30);
                    }
                }
                // Loot on the floor (a boss chest, a pickup) and piggy banks to smash, when it's quiet enough.
                const loot = nearest(sim.pickups || [], p, 520);
                const pig = nearest(sim.breakables || [], p, 360, (b) => b.hp > 0);
                if (loot && crowd < 2) {
                    const d = Math.hypot(loot.x - p.x, loot.y - p.y) || 1;
                    fx += ((loot.x - p.x) / d) * 0.025;
                    fy += ((loot.y - p.y) / d) * 0.025;
                } else if (pig && crowd < 1) {
                    const d = Math.hypot(pig.x - p.x, pig.y - p.y) || 1;
                    fx += ((pig.x - p.x) / d) * 0.012;
                    fy += ((pig.y - p.y) / d) * 0.012;
                }
                // Airdrop crates beat candles: head for the nearest one unless it's a mob scene.
                const crate = nearest(sim.crates || [], p, 520);
                const orb = nearest(sim.xp, p, 420, (o) => !o.frozen);
                if (crate && crowd < 2) {
                    const dx = crate.x - p.x;
                    const dy = crate.y - p.y;
                    const d = Math.hypot(dx, dy) || 1;
                    fx += (dx / d) * 0.02;
                    fy += (dy / d) * 0.02;
                } else if (orb && crowd < 3) {
                    const dx = orb.x - p.x;
                    const dy = orb.y - p.y;
                    const d = Math.hypot(dx, dy) || 1;
                    fx += (dx / d) * 0.012;
                    fy += (dy / d) * 0.012;
                } else if (target && crowd === 0) {
                    const dx = target.x - p.x;
                    const dy = target.y - p.y;
                    const d = Math.hypot(dx, dy) || 1;
                    if (d > 70) {
                        fx += (dx / d) * 0.01;
                        fy += (dy / d) * 0.01;
                    }
                }
                // A little sideways drift so it circles instead of standing in one spot.
                fx += Math.cos(t / 200) * 0.0015;
                fy += Math.sin(t / 200) * 0.0015;
            }
            const len = Math.hypot(fx, fy);
            if (len < 1e-6) return 0;
            let ux = fx / len;
            let uy = fy / len;
            // Walls, trees and wrecks: steer round what's ahead; if a solid prop still holds it up for half a
            // second (pinned in a corner), take a detour the other way for a while
            if (t % 30 === 0) {
                const p0 = last;
                last = [p.x, p.y];
                const pinned =
                    p0 &&
                    Math.hypot(p.x - p0[0], p.y - p0[1]) < 20 &&
                    sim.terrain?.blocked(
                        p.x + ux * 30,
                        p.y + p.size * 0.9 + uy * 30,
                        p.size * 0.72
                    );
                if (pinned) {
                    detour = 40;
                    turn = -turn;
                }
            }
            if (detour > 0) {
                detour--;
                const a = Math.atan2(uy, ux) + turn * 1.2;
                ux = Math.cos(a);
                uy = Math.sin(a);
            }
            [ux, uy] = steer(sim, ux, uy, () => turn);
            return encodeMove(ux, uy);
        },
        /** Card to pick: prefer evolutions, then new weapons, then weapon levels, then catalysts, then passives. */
        pick(sim) {
            const score = (c) =>
                c.evolves || c.evolvesWeapon
                    ? 5
                    : c.kind === 'weapon'
                      ? c.isNew
                          ? 4
                          : 3
                      : c.kind === 'passive'
                        ? c.catalystFor
                            ? 2.5
                            : 2
                        : 0;
            let best = 0;
            sim.choices.forEach((c, i) => {
                if (score(c) > score(sim.choices[best])) best = i;
            });
            return best;
        }
    };
}

/**
 * Steer round solid scenery: if the way ahead is blocked, try turning further and further, the usual way first.
 * The bull on a rocket flies, so it never steers.
 */
function steer(sim, ux, uy, side) {
    const t = sim.terrain;
    const p = sim.player;
    if (!t || p.rocketTimer > 0) return [ux, uy];
    const feet = p.y + p.size * 0.9;
    const r = p.size * 0.72;
    const free = (x, y) => !t.blocked(p.x + x * 30, feet + y * 30, r);
    if (free(ux, uy)) return [ux, uy];
    const a0 = Math.atan2(uy, ux);
    for (const k of [0.5, 1, 1.5, 2, 2.5]) {
        for (const s of [side(), -side()]) {
            const a = a0 + s * k;
            const x = Math.cos(a);
            const y = Math.sin(a);
            if (free(x, y)) return [x, y];
        }
    }
    return [ux, uy];
}

const canRam = (sim, e) => !e.boss && e.hp > 0 && !sim.rocketHit?.has(e.uid);

function nearest(list, p, maxD = Infinity, ok = null) {
    let best = null;
    let bd = maxD * maxD;
    for (const it of list) {
        if (ok && !ok(it)) continue;
        const d2 = (it.x - p.x) ** 2 + (it.y - p.y) ** 2;
        if (d2 < bd) {
            bd = d2;
            best = it;
        }
    }
    return best;
}
