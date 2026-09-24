#!/usr/bin/env node
/**
 * Playtest: let the autopilot play many seeded runs headlessly and report what happened. The Build Agent runs it
 * before and after its change, so a balance claim in the devlog is a measurement, not a guess.
 *
 *   node game/scripts/playtest.mjs [--runs 40] [--minutes 10] [--twist none|<id>|daily] [--character <id>] [--json]
 *   node game/scripts/playtest.mjs --compare origin/main     same seeds on the ref's sim vs the working tree
 *
 * The autopilot is not a person (it plays a steady 'survive' style), so read changes, not absolutes: if the median
 * run gets 40 s longer with the same bot and seeds, the game got easier.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const RUNS = Number(opt('--runs', '40'));
const MINUTES = Number(opt('--minutes', '10'));
const TWIST = opt('--twist', 'none');
const CHARACTER = opt('--character', null); // a CHARACTERS id; an older sim without characters plays the bull
const COMPARE = opt('--compare', null);

async function loadSim(dir) {
    const sim = await import(pathToFileURL(path.join(dir, 'sim.js')).href);
    const bot = await import(pathToFileURL(path.join(dir, 'bot.js')).href);
    const content = await import(pathToFileURL(path.join(dir, 'content.js')).href);
    return { ...sim, ...bot, content };
}

function simDirAt(ref) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bearproof-playtest-'));
    const tar = execFileSync('git', ['archive', '--format=tar', ref, '--', 'game/src/sim'], {
        cwd: ROOT,
        maxBuffer: 64 * 1024 * 1024
    });
    execFileSync('tar', ['-x', '-C', tmp], { input: tar });
    fs.writeFileSync(path.join(tmp, 'game/src/sim/package.json'), '{"type":"module"}');
    return path.join(tmp, 'game/src/sim');
}

const median = (xs) => {
    const s = xs.slice().sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null;
};

function play(m, seed) {
    const twist =
        TWIST === 'daily' && m.content.dailyTwistForSeed
            ? m.content.dailyTwistForSeed(seed)
            : TWIST === 'none'
              ? null
              : TWIST;
    const sim = new m.Simulation({ seed, twist, character: CHARACTER });
    const bot = m.createBot({ style: 'survive', phase: seed % 997 });
    const maxTicks = Math.round((MINUTES * 60) / m.content.SIM.DT);
    while (!sim.over && sim.tick < maxTicks) {
        while (sim.choices) sim.choose(bot.pick(sim));
        sim.step(bot.move(sim));
        sim.events.length = 0;
    }
    const s = sim.summary();
    let diedTo = null;
    if (sim.over && !s.won) {
        let best = Infinity;
        for (const e of sim.enemies) {
            if (!e || e.dead) continue;
            const d = (e.x - sim.player.x) ** 2 + (e.y - sim.player.y) ** 2;
            if (d < best) [best, diedTo] = [d, e.id];
        }
    }
    return {
        seed,
        sec: s.timeMs / 1000,
        score: s.score,
        level: s.level,
        kills: s.kills,
        bossKills: s.bossKills,
        won: s.won,
        survived: !sim.over,
        diedTo,
        weapons: s.weapons.map((w) => w[0])
    };
}

function summarize(results) {
    const deaths = results.filter((r) => r.diedTo);
    const count = (xs) => xs.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map());
    const topDeath = [...count(deaths.map((r) => r.diedTo))]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
    return {
        runs: results.length,
        medianSec: median(results.map((r) => r.sec)),
        medianScore: median(results.map((r) => r.score)),
        medianLevel: median(results.map((r) => r.level)),
        reachedCap: results.filter((r) => r.survived || r.won).length,
        bossKills: results.reduce((a, r) => a + r.bossKills, 0),
        diedTo: topDeath.map(
            ([id, n]) => `${id} ${Math.round((n / Math.max(1, deaths.length)) * 100)}%`
        )
    };
}

const fmt = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
const line = (s) =>
    `${s.runs} runs · median ${fmt(s.medianSec)} · score ${Math.round(s.medianScore)} · level ${s.medianLevel} · ` +
    `${s.reachedCap} reached ${MINUTES}:00 · ${s.bossKills} boss kills · died to ${s.diedTo.join(', ') || 'nothing'}`;

async function run(dir) {
    const m = await loadSim(dir);
    const seeds = Array.from({ length: RUNS }, (_, i) => 1000 + i * 7919);
    return summarize(seeds.map((seed) => play(m, seed)));
}

const here = path.join(ROOT, 'game/src/sim');
const after = await run(here);
if (COMPARE) {
    const dir = simDirAt(COMPARE);
    const before = await run(dir);
    fs.rmSync(path.resolve(dir, '../../..'), { recursive: true, force: true });
    const d = (a, b, f = (x) => x) => `${f(b)} → ${f(a)}`;
    if (args.includes('--json')) console.log(JSON.stringify({ before, after }));
    console.log(`playtest before (${COMPARE}): ${line(before)}`);
    console.log(`playtest after (working tree): ${line(after)}`);
    console.log(
        `playtest: median run ${d(after.medianSec, before.medianSec, fmt)}, score ${d(after.medianScore, before.medianScore, Math.round)}, level ${d(after.medianLevel, before.medianLevel)} (same ${RUNS} seeds, same autopilot)`
    );
} else {
    if (args.includes('--json')) console.log(JSON.stringify(after));
    console.log(`playtest: ${line(after)}`);
}
