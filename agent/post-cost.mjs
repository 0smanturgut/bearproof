#!/usr/bin/env node
/**
 * Meter a Build Agent run: sum the measured cost of its Claude Code passes (their result JSON) and record it on
 * the site, shipped or not, so "Spent on compute" on the HQ is every agent run's real cost.
 *
 *   node agent/post-cost.mjs <result.json> [<result.json> ...]
 *
 * Env: SITE, INGEST_TOKEN, GITHUB_RUN_ID, AGENT_CONTEXT (for the build number). Missing results count as zero;
 * no results at all means nothing ran, and nothing is sent.
 */
import fs from 'node:fs';

let usd = 0;
const parts = [];
for (const p of process.argv.slice(2)) {
    if (!fs.existsSync(p)) continue;
    try {
        const r = JSON.parse(fs.readFileSync(p, 'utf8'));
        const c = Number(r.total_cost_usd);
        if (!Number.isFinite(c)) continue;
        usd += c;
        parts.push(`$${c.toFixed(2)} (${r.num_turns ?? '?'} turns)`);
    } catch {
        // an unreadable result counts as nothing
    }
}
if (!parts.length) {
    console.log('post-cost: no Claude Code results, nothing to record');
    process.exit(0);
}
let build = null;
try {
    build = JSON.parse(fs.readFileSync(process.env.AGENT_CONTEXT, 'utf8')).build ?? null;
} catch {
    build = null;
}
const body = {
    run: process.env.GITHUB_RUN_ID || 'local',
    build,
    usd: Math.round(usd * 10000) / 10000,
    detail: `Build Agent run, ${parts.join(' + ')}, Claude Code's own count`
};
const { SITE, INGEST_TOKEN } = process.env;
if (!SITE || !INGEST_TOKEN) {
    console.log('post-cost: SITE or INGEST_TOKEN missing; would record', JSON.stringify(body));
    process.exit(0);
}
const r = await fetch(`${SITE}/api/internal/agent/cost`, {
    method: 'POST',
    headers: { authorization: `Bearer ${INGEST_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(body)
}).catch((err) => ({ ok: false, status: err?.message || 'fetch failed' }));
console.log(
    `post-cost: $${body.usd} for build ${build} -> ${r.ok ? 'recorded' : `HTTP ${r.status}`}`
);
