#!/usr/bin/env node
/**
 * Cut a build: create the annotated tag `build-<n>` for HEAD with its metadata as the last line of the tag
 * message (scripts/build.mjs reads it). Only cuts a build when game/ changed since the previous build.
 *
 *   node scripts/release.mjs [--now | --at <ISO>] [--title "…"] [--mode agent|bootstrap|human] [--push] [--force]
 *
 * Default activation is the next 00:00 UTC, the daily release ritual. `--now` activates immediately (bootstrap
 * builds before the ritual starts). Title, mode and cost default to the build's devlog (devlog/patch-<n>.md).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (...a) => execFileSync('git', a, { cwd: ROOT }).toString().trim();
const args = process.argv.slice(2);
const flag = (k) => args.includes(k);
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);

const tags = git('tag', '-l', 'build-*')
    .split('\n')
    .filter(Boolean)
    .map((t) => ({ tag: t, n: Number(t.slice(6)) }))
    .sort((a, b) => a.n - b.n);
const prev = tags.at(-1);
const baseRef = prev ? prev.tag : 'day-0';
const changed = git('diff', '--name-only', `${baseRef}..HEAD`, '--', 'game/')
    .split('\n')
    .filter(Boolean);
if (!changed.length && !flag('--force')) {
    console.log(`release: game/ unchanged since ${baseRef}; no build cut`);
    process.exit(0);
}

const n = (prev ? prev.n : 0) + 1;
const devlogPath = path.join(ROOT, 'devlog', `patch-${n}.md`);
const front = {};
if (fs.existsSync(devlogPath)) {
    const m = fs.readFileSync(devlogPath, 'utf8').match(/^---\n([\s\S]*?)\n---/);
    for (const line of (m ? m[1] : '').split('\n')) {
        const kv = line.match(/^(\w+):\s*(.*?)(\s+#.*)?$/);
        if (kv) front[kv[1]] = kv[2].replace(/^"(.*)"$/, '$1');
    }
}

const now = new Date();
const nextMidnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
);
const activatesAt =
    opt('--at') ||
    (flag('--now')
        ? now.toISOString().replace(/\.\d+Z$/, 'Z')
        : nextMidnight.toISOString().replace('.000Z', 'Z'));
const meta = {
    n,
    title: opt('--title') || front.title || git('log', '-1', '--format=%s'),
    mode: opt('--mode') || front.mode || 'agent',
    activatesAt,
    costUsd: front.costUsd && front.costUsd !== '' ? Number(front.costUsd) : null
};
if (!['agent', 'bootstrap', 'human'].includes(meta.mode)) throw new Error(`bad mode ${meta.mode}`);

const tag = `build-${n}`;
const message = `${tag}: ${meta.title}\n\n${changed.length} file(s) in game/ changed since ${baseRef}.\n\n${JSON.stringify(meta)}`;
execFileSync('git', ['tag', '-a', tag, '-m', message], { cwd: ROOT });
console.log(
    `release: ${tag} -> ${git('rev-parse', '--short', 'HEAD')} activates ${activatesAt} (${meta.mode})`
);
if (flag('--push')) execFileSync('git', ['push', 'origin', tag], { cwd: ROOT, stdio: 'inherit' });
