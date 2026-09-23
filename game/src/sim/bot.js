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
                const orb = nearest(sim.xp, p, 420);
                if (orb && crowd < 3) {
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
            return encodeMove(fx / len, fy / len);
        },
        /** Card to pick: prefer evolutions, then new weapons, then weapon levels, then passives. */
        pick(sim) {
            const score = (c) =>
                c.evolves
                    ? 5
                    : c.kind === 'weapon'
                      ? c.isNew
                          ? 4
                          : 3
                      : c.kind === 'passive'
                        ? 2
                        : 0;
            let best = 0;
            sim.choices.forEach((c, i) => {
                if (score(c) > score(sim.choices[best])) best = i;
            });
            return best;
        }
    };
}

function nearest(list, p, maxD = Infinity) {
    let best = null;
    let bd = maxD * maxD;
    for (const it of list) {
        const d2 = (it.x - p.x) ** 2 + (it.y - p.y) ** 2;
        if (d2 < bd) {
            bd = d2;
            best = it;
        }
    }
    return best;
}
