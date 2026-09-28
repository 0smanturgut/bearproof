// Stage openings (Build #7): the first two minutes on every stage, with and without the Flash Crash twist, played
// by the autopilot. Build #6's Daily (Bear Trap + Flash Crash) had doomposters as the top killer, so this keeps an
// eye on the openings and reports how much of the early damage each enemy dealt. (It started as the diagnostic
// game/test/zz-diag.test.js; the operator renamed it, since the Build Agent's sandbox can't rename files.)

import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/sim.js';
import { createBot } from '../src/sim/bot.js';
import { SIM } from '../src/sim/content.js';

const SEEDS = Array.from({ length: 8 }, (_, i) => 1000 + i * 7919);

/** Two minutes of autopilot; damage taken is pinned on the nearest enemy (the server's proxy for a killer). */
function opening(seed, stage, twist) {
    const sim = new Simulation({ seed, stage, twist });
    const bot = createBot({ style: 'survive', phase: seed % 997 });
    const by = {};
    while (!sim.over && sim.tick * SIM.DT < 120) {
        while (sim.choices) sim.choose(bot.pick(sim));
        const hp = sim.player.hp;
        sim.step(bot.move(sim));
        if (sim.player.hp < hp) {
            let best = Infinity;
            let id = null;
            for (const e of sim.enemies) {
                if (!e || e.dead) continue;
                const d = (e.x - sim.player.x) ** 2 + (e.y - sim.player.y) ** 2;
                if (d < best) [best, id] = [d, e.id];
            }
            by[id] = (by[id] || 0) + hp - sim.player.hp;
        }
        sim.events.length = 0;
    }
    return { over: sim.over, by };
}

for (const stage of ['chop', 'bear_trap', 'winter']) {
    for (const twist of [null, 'flash_crash']) {
        test(`openings: ${stage}${twist ? ` + ${twist}` : ''}, the autopilot survives 2:00`, (t) => {
            const runs = SEEDS.map((seed) => opening(seed, stage, twist));
            const dmg = {};
            for (const r of runs)
                for (const k in r.by) dmg[k] = (dmg[k] || 0) + r.by[k] / runs.length;
            const top = Object.entries(dmg)
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => `${k} ${Math.round(v)}`);
            t.diagnostic(`damage per run before 2:00: ${top.join(', ') || 'none'}`);
            assert.equal(runs.filter((r) => r.over).length, 0);
        });
    }
}
