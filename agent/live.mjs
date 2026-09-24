#!/usr/bin/env node
/**
 * Post events about the Build Agent's run to the HQ's live page (/live). Used by agent.yml between steps and by
 * agent/relay.mjs while Claude Code works. Never fails the pipeline: a live page is nice, the build is the job.
 *
 *   node agent/live.mjs <type> "<text>" [json-data]
 *
 * Env: SITE, INGEST_TOKEN, GITHUB_RUN_ID, AGENT_CONTEXT (for the build number). Anything that looks like a secret
 * (the values of the secrets in this environment, or well-known key shapes) is dropped before it leaves.
 */
import fs from 'node:fs';
import { needles } from '../scripts/secret-scan.mjs';

const SECRETS = [
    'ANTHROPIC_API_KEY',
    'INGEST_TOKEN',
    'GH_TOKEN',
    'GITHUB_TOKEN',
    'CLOUDFLARE_API_TOKEN'
];
const SHAPES = [
    /sk-ant-[A-Za-z0-9_-]{8,}/,
    /gh[pousr]_[A-Za-z0-9]{20,}/,
    /-----BEGIN [A-Z ]*PRIVATE KEY/
];
const secretNeedles = SECRETS.flatMap((k) => needles(process.env[k]));

/** Replace any secret value in a raw line (kept as a build artifact) with [redacted]. */
export function scrub(line) {
    let out = String(line);
    for (const n of secretNeedles) if (out.includes(n)) out = out.split(n).join('[redacted]');
    return out;
}

/** Drop text that could carry a secret; trim the rest. */
export function clean(text) {
    const t = String(text ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 400);
    if (!t) return null;
    if (SHAPES.some((re) => re.test(t))) return null;
    if (secretNeedles.some((n) => t.includes(n))) return null;
    return t;
}

export function buildNumber() {
    try {
        return JSON.parse(fs.readFileSync(process.env.AGENT_CONTEXT, 'utf8')).build ?? null;
    } catch {
        return null;
    }
}

/** Send a batch of { type, text, data?, ts? }. Resolves quietly on any failure. */
export async function send(events) {
    const site = process.env.SITE;
    const token = process.env.INGEST_TOKEN;
    const run = process.env.GITHUB_RUN_ID || 'local';
    const out = [];
    for (const e of events) {
        const text = clean(e.text);
        if (!text) continue;
        let data = e.data ?? null;
        if (data && secretNeedles.some((n) => JSON.stringify(data).includes(n))) data = null;
        out.push({ ts: e.ts ?? Date.now(), type: e.type, text, data });
    }
    if (!out.length || !site || !token) return;
    try {
        const r = await fetch(`${site}/api/internal/agent/events`, {
            method: 'POST',
            headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
            body: JSON.stringify({ run, build: buildNumber(), events: out })
        });
        if (!r.ok) console.warn(`live: HTTP ${r.status}`);
    } catch (err) {
        console.warn('live:', err?.message || err);
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const [type, text, data] = process.argv.slice(2);
    let parsed = null;
    try {
        parsed = data ? JSON.parse(data) : null;
    } catch {
        parsed = null;
    }
    await send([{ type, text, data: parsed }]);
}
