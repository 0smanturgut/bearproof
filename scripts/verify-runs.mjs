#!/usr/bin/env node
/**
 * Replay verifier. Pulls pending runs from the Worker, re-simulates each one with the exact simulation code of
 * the build it was played on (extracted from that build's git tag), and posts a verdict.
 *
 *   SITE=https://… INGEST_TOKEN=… node scripts/verify-runs.mjs [--limit 50] [--dry-run]
 *
 * A run is `verified` only when the replay is valid and reproduces the claimed score, time, kills and level
 * exactly. Any mismatch is `rejected` with the reason. Builds without a deterministic sim (Build #0) are
 * `unverifiable`. Runs in Node today (Workers Free has a 10 ms CPU cap); it can move into a Queue consumer later.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const SITE = process.env.SITE || opt('--site', '');
const TOKEN = process.env.INGEST_TOKEN || '';
const DRY = args.includes('--dry-run');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bearproof-verify-'));

const sims = new Map();

/** Load game/src/sim from the build's tag into a temp dir and import its runlog module. */
async function simFor(build) {
    if (sims.has(build)) return sims.get(build);
    let mod = null;
    try {
        const dir = path.join(TMP, `b${build}`);
        fs.mkdirSync(dir, { recursive: true });
        const tar = execFileSync(
            'git',
            ['archive', '--format=tar', `build-${build}`, '--', 'game/src/sim'],
            {
                cwd: ROOT,
                maxBuffer: 64 * 1024 * 1024
            }
        );
        execFileSync('tar', ['-x', '-C', dir], { input: tar });
        fs.writeFileSync(path.join(dir, 'game/src/sim/package.json'), '{"type":"module"}');
        mod = await import(pathToFileURL(path.join(dir, 'game/src/sim/runlog.js')).href);
    } catch {
        mod = null; // no tag, or the build predates the deterministic sim
    }
    sims.set(build, mod);
    return mod;
}

export async function judge(run) {
    const sim = await simFor(run.build);
    if (!sim)
        return {
            status: 'unverifiable',
            reason: `build ${run.build} has no deterministic simulation`
        };
    if (!run.log) return { status: 'rejected', reason: 'no input log' };
    const bytes = sim.fromBase64Url(run.log);
    const r = sim.replay(bytes);
    if (!r.ok) return { status: 'rejected', reason: `replay failed: ${r.error}` };
    if (r.seed !== run.seed >>> 0)
        return { status: 'rejected', reason: 'log seed differs from the submitted seed' };
    // Builds with daily twists: the log's twist must be the day's (daily) or none (free runs).
    if (r.twist !== undefined && sim.dailyTwistForSeed) {
        const want = run.mode === 'daily' ? sim.dailyTwistForSeed(run.seed >>> 0) : 'none';
        if (r.twist !== want)
            return { status: 'rejected', reason: `twist ${r.twist} in the log, ${want} expected` };
    }
    const s = r.summary;
    const c = run.claimed;
    const diffs = [];
    if (s.score !== c.score) diffs.push(`score ${c.score} claimed, ${s.score} replayed`);
    if (s.timeMs !== c.timeMs) diffs.push(`time ${c.timeMs} claimed, ${s.timeMs} replayed`);
    if (s.kills !== c.kills) diffs.push(`kills ${c.kills} claimed, ${s.kills} replayed`);
    if (s.level !== c.level) diffs.push(`level ${c.level} claimed, ${s.level} replayed`);
    if (run.stage && s.stage !== run.stage)
        diffs.push(`stage ${run.stage} claimed, ${s.stage} replayed`);
    if (diffs.length)
        return { status: 'rejected', reason: diffs.join('; '), verifiedScore: s.score };
    return { status: 'verified', verifiedScore: s.score };
}

async function main() {
    if (!SITE || !TOKEN) {
        console.error('verify: set SITE and INGEST_TOKEN');
        process.exit(2);
    }
    const headers = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };
    const res = await fetch(`${SITE}/api/internal/runs/pending?limit=${opt('--limit', 50)}`, {
        headers
    });
    if (!res.ok) throw new Error(`pending: HTTP ${res.status}`);
    const { runs } = await res.json();
    console.log(`verify: ${runs.length} pending run(s)`);
    const tally = { verified: 0, rejected: 0, unverifiable: 0 };
    for (const run of runs) {
        const t0 = performance.now();
        const v = await judge(run);
        tally[v.status]++;
        console.log(
            `  ${run.id} build ${run.build} ${run.mode} ${run.challengeDate || ''} claimed ${run.claimed.score} → ${v.status}` +
                `${v.reason ? ` (${v.reason})` : ''} in ${Math.round(performance.now() - t0)} ms`
        );
        if (DRY) continue;
        const post = await fetch(`${SITE}/api/internal/runs/${run.id}/verdict`, {
            method: 'POST',
            headers,
            body: JSON.stringify(v)
        });
        if (!post.ok) console.warn(`  verdict for ${run.id}: HTTP ${post.status}`);
    }
    console.log(`verify: ${JSON.stringify(tally)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main()
        .catch((err) => {
            console.error(err);
            process.exitCode = 1;
        })
        .finally(() => fs.rmSync(TMP, { recursive: true, force: true }));
}
