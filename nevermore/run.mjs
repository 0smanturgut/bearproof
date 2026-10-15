#!/usr/bin/env node
/**
 * Nevermore runner: every test the crowd's bug reports left behind, replayed on the CURRENT build of the game.
 *
 *   node nevermore/run.mjs [--dir nevermore/tests] [--game game] [--json] [--browser] [--no-generalise]
 *
 * For each `*.json` spec: replay its scenario headless with the game's own `src/sim/sim.js` (recorded picks are
 * applied in order, even if the build now offers different cards), check its invariant at its cadence, then the
 * generalisation pass (N more seeds driven by the game's own bot). Prints a PASS/FAIL table; exits 1 on any
 * failure, invalid spec or error. `--browser` replays every scenario again inside Chromium (all non-local requests
 * blocked) and fails if the browser disagrees with Node.
 *
 * Muninn-only (not part of the copy in a product repository):
 *   node tools/nevermore/run.mjs --encrypted <dir> --key-env HIDDEN_SET_KEY --game <dir>
 * decrypts the hidden set in memory and prints ONLY the aggregate `passed/total`.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSpec } from './core.mjs';
import { loadGame, loadSpecDir } from './load.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export function parseArgs(argv) {
    const o = {
        dir: 'nevermore/tests',
        game: 'game',
        json: false,
        browser: false,
        generalise: true,
        encrypted: null,
        keyEnv: 'HIDDEN_SET_KEY',
        seedOffset: 0
    };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        const val = () => {
            const v = argv[++i];
            if (v === undefined) throw new Error(`${a} needs a value`);
            return v;
        };
        if (a === '--dir') o.dir = val();
        else if (a === '--game') o.game = val();
        else if (a === '--json') o.json = true;
        else if (a === '--browser') o.browser = true;
        else if (a === '--no-generalise') o.generalise = false;
        else if (a === '--encrypted') o.encrypted = val();
        else if (a === '--key-env') o.keyEnv = val();
        else if (a === '--seed-offset') o.seedOffset = Number(val());
        else if (a === '--help' || a === '-h') o.help = true;
        else throw new Error(`unknown argument ${a}`);
    }
    return o;
}

/**
 * Run a list of `{ file, spec?, error? }` entries against a loaded game. Returns the full result object.
 * @param {Awaited<ReturnType<typeof loadGame>>} mods
 */
export function runAll(mods, entries, { generalise = true, seedOffset = 0 } = {}) {
    const results = entries.map((e) =>
        e.error
            ? {
                  id: e.file,
                  name: '(invalid spec)',
                  status: 'error',
                  error: e.error,
                  scenario: null,
                  generalise: null,
                  ms: 0
              }
            : runSpec(mods, e.spec, { generalise, seedOffset })
    );
    const passed = results.filter((r) => r.status === 'pass').length;
    return {
        ok: passed === results.length,
        total: results.length,
        passed,
        failed: results.filter((r) => r.status === 'fail').length,
        errors: results.filter((r) => r.status === 'error').length,
        simVersion: mods.SIM_VERSION,
        results
    };
}

/** Replay every valid scenario inside Chromium against a closed local server; compare with Node. */
export async function browserCheck(gameDir, entries, nodeResults) {
    const { serveStatic, launchChromium, closedContext } = await import('./browser.mjs');
    const srv = await serveStatic(
        { '/game/': path.resolve(gameDir), '/nevermore/': HERE },
        { pages: { '/': '<!doctype html><meta charset="utf-8"><title>nevermore</title>' } }
    );
    const browser = await launchChromium();
    const out = [];
    try {
        const { context, blocked } = await closedContext(browser, srv.origin);
        const page = await context.newPage();
        await page.goto(srv.origin + '/');
        for (const e of entries) {
            if (!e.spec) continue;
            const b = await page.evaluate(async (spec) => {
                const core = await import('/nevermore/core.mjs');
                const sim = await import('/game/src/sim/sim.js');
                let content = null;
                try {
                    content = await import('/game/src/sim/content.js');
                } catch {
                    /* older build */
                }
                const r = core.runScenario({ Simulation: sim.Simulation, content }, spec);
                return { status: r.status, tick: r.tick, ticks: r.ticks, hash: r.hash };
            }, e.spec);
            const n = nodeResults.find((r) => r.id === e.spec.id)?.scenario;
            const same =
                !!n &&
                n.status === b.status &&
                n.tick === b.tick &&
                n.ticks === b.ticks &&
                n.hash === b.hash;
            out.push({ id: e.spec.id, browser: b, same });
        }
        await context.close();
        return { results: out, blocked };
    } finally {
        await browser.close();
        await srv.close();
    }
}

function table(summary) {
    const rows = summary.results.map((r) => {
        const sc = r.scenario
            ? r.scenario.status === 'fail'
                ? `FAIL @${r.scenario.tick}`
                : `ok ${r.scenario.ticks}t${r.scenario.applicable ? '' : ' (n/a)'}`
            : '-';
        const ge = r.generalise
            ? r.generalise.status === 'skipped'
                ? 'skipped'
                : `${r.generalise.seeds - r.generalise.failures.length}/${r.generalise.seeds} seeds`
            : '-';
        return [r.status.toUpperCase(), r.id, sc, ge, (r.name || '').slice(0, 60)];
    });
    const head = ['RESULT', 'TEST', 'SCENARIO', 'GENERALISE', 'NAME'];
    const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
    const line = (r) =>
        r
            .map((c, i) => String(c).padEnd(w[i]))
            .join('  ')
            .trimEnd();
    const lines = [line(head), line(w.map((n) => '-'.repeat(n))), ...rows.map(line)];
    for (const r of summary.results) {
        if (r.error) lines.push(`  ${r.id}: error: ${r.error}`);
        if (r.scenario?.status === 'fail')
            lines.push(`  ${r.id}: scenario tick ${r.scenario.tick}: ${r.scenario.message}`);
        for (const f of r.generalise?.failures || [])
            lines.push(`  ${r.id}: seed ${f.seed} tick ${f.tick}: ${f.message}`);
    }
    lines.push(
        `${summary.passed}/${summary.total} passed (sim version ${summary.simVersion ?? '?'})`
    );
    return lines.join('\n');
}

async function main() {
    const o = parseArgs(process.argv.slice(2));
    if (o.help) {
        console.log(
            'node nevermore/run.mjs [--dir nevermore/tests] [--game game] [--json] [--browser] [--no-generalise]'
        );
        return 0;
    }
    const mods = await loadGame(o.game);

    if (o.encrypted) {
        // Hidden-set mode lives in a Muninn-only module: product copies of this runner don't have it.
        let hidden;
        try {
            hidden = await import('./hidden.mjs');
        } catch {
            console.error('hidden-set mode is not available in this copy of the runner');
            return 2;
        }
        const r = await hidden.runHidden(mods, o.encrypted, process.env[o.keyEnv], {
            seedOffset: o.seedOffset
        });
        if (o.json) console.log(JSON.stringify(r));
        else
            console.log(
                `hidden set: ${r.passed}/${r.total} passed${r.errors ? ` (${r.errors} errored)` : ''}`
            );
        return r.passed === r.total ? 0 : 1;
    }

    const entries = loadSpecDir(o.dir);
    const summary = runAll(mods, entries, { generalise: o.generalise });
    if (o.browser) {
        const b = await browserCheck(o.game, entries, summary.results);
        summary.browser = b;
        for (const r of b.results) if (!r.same) summary.ok = false;
    }
    if (o.json) console.log(JSON.stringify(summary, null, 2));
    else {
        console.log(table(summary));
        if (summary.browser) {
            const same = summary.browser.results.filter((r) => r.same).length;
            console.log(
                `browser: ${same}/${summary.browser.results.length} scenarios identical in Chromium; ${summary.browser.blocked.length} outside requests blocked`
            );
        }
        if (!entries.length) console.log(`no specs in ${o.dir}`);
    }
    return summary.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().then(
        (code) => process.exit(code),
        (e) => {
            console.error(`nevermore: ${e.message}`);
            process.exit(2);
        }
    );
}
