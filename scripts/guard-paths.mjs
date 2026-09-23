#!/usr/bin/env node
/**
 * Build Agent guardrail. Fails (exit 1) if the change set touches anything the agent may not change.
 *
 *   node scripts/guard-paths.mjs <base-ref>        # compares <base-ref>...HEAD plus the working tree
 *
 * The agent may change game code, game content and its devlog. It may never touch the treasury, payout,
 * API, CI or build tooling, and it may not weaken the gates that judge its own work (the smoke test,
 * the determinism core and its tests). Deleting any test file is also refused.
 */
import { execFileSync } from 'node:child_process';

const ALLOWED = [
    /^game\//,
    /^devlog\/build-\d+\.md$/,
    /^agent\/(plan|notes)\.md$/,
    /^agent\/proposals\/build-\d+\.json$/,
    /^content\/x\/build-\d+\.md$/
];
const PROTECTED = [
    /^game\/scripts\//, // smoke + determinism gates
    /^game\/test\/sim\.test\.js$/, // determinism tests
    /^game\/src\/sim\/(dmath|rng|runlog|input-codes)\.js$/, // determinism core
    /^game\/server\.js$/
];

export function checkPaths(changes) {
    const problems = [];
    for (const { status, path } of changes) {
        if (!ALLOWED.some((re) => re.test(path)))
            problems.push(`${path}: outside the agent's allowed paths`);
        else if (PROTECTED.some((re) => re.test(path)))
            problems.push(`${path}: protected (it judges the agent's work)`);
        if (status.startsWith('D') && /(^|\/)test\/.*\.test\.js$/.test(path))
            problems.push(`${path}: tests may not be deleted`);
    }
    return problems;
}

function changedFiles(base) {
    const out = new Map();
    const add = (text) => {
        for (const line of text.split('\n').filter(Boolean)) {
            const [status, ...rest] = line.split('\t');
            for (const p of rest) out.set(p, status);
        }
    };
    add(execFileSync('git', ['diff', '--name-status', `${base}...HEAD`]).toString());
    add(execFileSync('git', ['diff', '--name-status', 'HEAD']).toString());
    for (const p of execFileSync('git', ['ls-files', '--others', '--exclude-standard'])
        .toString()
        .split('\n')
        .filter(Boolean)) {
        out.set(p, 'A');
    }
    return [...out].map(([path, status]) => ({ path, status }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const base = process.argv[2] || 'origin/main';
    const changes = changedFiles(base);
    const problems = checkPaths(changes);
    console.log(`guard: ${changes.length} changed path(s) vs ${base}`);
    for (const c of changes) console.log(`  ${c.status}\t${c.path}`);
    if (problems.length) {
        console.error('GUARD FAILED:\n  ' + problems.join('\n  '));
        process.exit(1);
    }
    console.log('guard: ok');
}
