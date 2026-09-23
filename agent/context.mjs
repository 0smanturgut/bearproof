#!/usr/bin/env node
/**
 * Gather the Build Agent's daily context into one JSON file (stdout). Runs in CI before Patch starts.
 * Only numbers and ids go in: no player-supplied free text (names), so nothing here can inject instructions.
 *
 *   node agent/context.mjs [--site https://…] > "$RUNNER_TEMP/context.json"
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const site = args.includes('--site') ? args[args.indexOf('--site') + 1] : process.env.SITE || '';

async function get(p) {
    if (!site) return null;
    try {
        const r = await fetch(site + p, { headers: { accept: 'application/json' } });
        return r.ok ? await r.json() : null;
    } catch {
        return null;
    }
}

function lastBuildNumber() {
    const tags = execFileSync('git', ['tag', '-l', 'build-*'], { cwd: ROOT })
        .toString()
        .split('\n')
        .filter(Boolean)
        .map((t) => Number(t.slice(6)))
        .filter(Number.isInteger);
    return tags.length ? Math.max(...tags) : 0;
}

const stats = await get('/api/stats');
const vote = await get('/api/vote/result');
const devlogDir = path.join(ROOT, 'devlog');
const recent = fs
    .readdirSync(devlogDir)
    .filter((f) => /^patch-\d+\.md$/.test(f))
    .sort((a, b) => Number(b.match(/\d+/)[0]) - Number(a.match(/\d+/)[0]))
    .slice(0, 3)
    .map((f) => ({ file: `devlog/${f}` }));

const n = lastBuildNumber() + 1;
const out = {
    build: n,
    devlogFile: `devlog/patch-${n}.md`,
    date: new Date(
        Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + 1)
    )
        .toISOString()
        .slice(0, 10),
    day: stats?.day ?? null,
    stats: stats
        ? {
              buildsShipped: stats.buildsShipped,
              playersToday: stats.playersToday,
              topScoreToday: stats.topScoreToday?.score ?? null
          }
        : null,
    vote: vote?.winner
        ? { winner: { id: vote.winner.id, title: vote.winner.title, share: vote.winner.share } }
        : null,
    recentDevlogs: recent
};
process.stdout.write(JSON.stringify(out, null, 2) + '\n');
