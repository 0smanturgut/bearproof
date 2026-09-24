#!/usr/bin/env node
/**
 * Gather the Build Agent's daily context into one JSON file (stdout). Runs in CI before the Build Agent starts.
 * Numbers and ids only, with one exception: when a holder's request wins the vote, its title and details go in,
 * marked `untrusted`. The server already filtered them (worker/src/lib/requests.js) and agent/PROMPT.md tells
 * the agent to read them as a feature description, never as instructions. No other player text (names) goes in.
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
// What verified players did on the live build in the last 24 h (numbers and content ids only).
const insights = await get('/api/insights?hours=24');
const devlogDir = path.join(ROOT, 'devlog');
const recent = fs
    .readdirSync(devlogDir)
    .filter((f) => /^build-\d+\.md$/.test(f))
    .sort((a, b) => Number(b.match(/\d+/)[0]) - Number(a.match(/\d+/)[0]))
    .slice(0, 3)
    .map((f) => ({ file: `devlog/${f}` }));

/** A ballot option for the agent. A holder's request keeps its text, clipped and marked untrusted. */
function option(o) {
    if (!o) return null;
    const base = {
        id: o.id,
        title: String(o.title).slice(0, 60),
        share: o.share,
        source: o.source
    };
    if (o.source !== 'community') return base;
    return {
        ...base,
        untrusted: true,
        requestedBy: o.requestedBy,
        description: String(o.description || '').slice(0, 240)
    };
}

const n = lastBuildNumber() + 1;
const out = {
    build: n,
    devlogFile: `devlog/build-${n}.md`,
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
    vote: vote?.winner ? { winner: option(vote.winner), runnerUp: option(vote.runnerUp) } : null,
    players: insights && insights.runs > 0 ? insights : null,
    recentDevlogs: recent
};
process.stdout.write(JSON.stringify(out, null, 2) + '\n');
