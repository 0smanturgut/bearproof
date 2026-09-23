#!/usr/bin/env node
/**
 * Cross-engine determinism check. Records bot runs in Node (V8), then replays the exact run logs inside
 * real browsers (Chromium = V8, WebKit = JavaScriptCore, the Safari engine) and compares the final state
 * hash and summary. If this passes, a run played on an iPhone re-simulates identically on a Worker.
 *
 *   node game/scripts/determinism.mjs [--seeds 5] [--engines chromium,webkit]
 */
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Simulation } from '../src/sim/sim.js';
import { createBot } from '../src/sim/bot.js';
import { RunRecorder, toBase64Url } from '../src/sim/runlog.js';
import { launch } from '../../scripts/lib/browser.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(here, '..');
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const nSeeds = Number(opt('--seeds', 4));
const engines = opt('--engines', 'chromium,webkit,jsc').split(',');
const JSC = '/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc';

/** Replay inside the system JavaScriptCore shell (the Safari engine) without a browser. */
function replayInJsc(runs) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bearproof-jsc-'));
    const driver = path.join(dir, 'driver.mjs');
    fs.writeFileSync(
        driver,
        `import { replay, fromBase64Url } from '${path.join(GAME, 'src/sim/runlog.js')}';\n` +
            `const runs = ${JSON.stringify(runs.map((r) => ({ seed: r.seed, log: r.log })))};\n` +
            `print(JSON.stringify(runs.map((r) => { const o = replay(fromBase64Url(r.log)); ` +
            `return { seed: r.seed, ok: o.ok, error: o.error, hash: o.hash, summary: o.summary }; })));\n`
    );
    try {
        return JSON.parse(execFileSync(JSC, ['-m', driver], { encoding: 'utf8' }));
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

function record(seed) {
    const sim = new Simulation({ seed });
    const rec = new RunRecorder(seed);
    const bot = createBot();
    const reckless = createBot({ style: 'reckless' });
    while (!sim.over) {
        if (sim.choices) {
            const i = bot.pick(sim);
            rec.pick(sim.tick, i);
            sim.choose(i);
            continue;
        }
        const code = (sim.tick < 60 * 60 * 4 ? bot : reckless).move(sim);
        rec.tick(code);
        sim.step(code);
        sim.drainEvents();
    }
    return { seed, log: toBase64Url(rec.toBytes()), hash: sim.stateHash(), summary: sim.summary() };
}

const server = http.createServer((req, res) => {
    const file = path.join(GAME, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(GAME) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404).end();
        return;
    }
    const type = file.endsWith('.js') ? 'text/javascript' : 'text/html';
    res.writeHead(200, { 'content-type': type }).end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

let failed = 0;
const runs = [];
for (let i = 0; i < nSeeds; i++) runs.push(record(0x9e3779b1 * (i + 1)));
console.log(`recorded ${runs.length} runs in Node ${process.version}`);

function report(engine, results, ua) {
    for (const r of results) {
        const want = runs.find((x) => x.seed === r.seed);
        const same =
            r.ok &&
            r.hash === want.hash &&
            JSON.stringify(r.summary) === JSON.stringify(want.summary);
        if (!same) failed++;
        console.log(
            `${engine.padEnd(8)} seed ${String(r.seed).padStart(10)}  ${same ? 'MATCH' : 'MISMATCH'}  hash ${r.hash} ` +
                `score ${r.summary?.score} ${(want.summary.timeMs / 60000).toFixed(1)}min${r.error ? ' ' + r.error : ''}`
        );
    }
    console.log(`${engine}: ${ua}`);
}

for (const engine of engines) {
    if (engine === 'jsc') {
        if (!fs.existsSync(JSC)) {
            console.log('jsc: SKIPPED (no system JavaScriptCore shell)');
            continue;
        }
        report('jsc', replayInJsc(runs), `system JavaScriptCore (${JSC})`);
        continue;
    }
    let browser;
    try {
        browser = engine === 'webkit' ? await launch('webkit') : await launch('chromium');
    } catch (err) {
        console.log(`${engine}: SKIPPED (${err.message.split('\n')[0]})`);
        continue;
    }
    const page = await browser.newPage();
    await page.goto(`${base}/src/sim/content.js`);
    const results = await page.evaluate(
        async ({ runs, base }) => {
            const { replay, fromBase64Url } = await import(`${base}/src/sim/runlog.js`);
            return runs.map((r) => {
                const out = replay(fromBase64Url(r.log));
                return {
                    seed: r.seed,
                    ok: out.ok,
                    error: out.error,
                    hash: out.hash,
                    summary: out.summary
                };
            });
        },
        { runs, base }
    );
    report(engine, results, await page.evaluate(() => navigator.userAgent));
    await browser.close();
}
server.close();
if (failed) {
    console.error(`FAILED: ${failed} mismatches`);
    process.exit(1);
}
console.log('all engines match');
