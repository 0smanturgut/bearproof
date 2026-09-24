#!/usr/bin/env node
/**
 * Write the Build Agent's measured cost into its devlog. Reads Claude Code's result messages (the build pass
 * and the review pass; `total_cost_usd` is computed by Claude Code from real token usage), sums them and fills
 * `costUsd` / `costMeasured`.
 *
 *   node agent/record-cost.mjs <devlog/build-n.md> <result.json> [<result.json> ...]
 */
import fs from 'node:fs';

const [devlogPath, ...resultPaths] = process.argv.slice(2);
let cost = 0;
let turns = 0;
for (const p of resultPaths) {
    if (!fs.existsSync(p)) continue; // a pass that didn't run costs nothing
    const r = JSON.parse(fs.readFileSync(p, 'utf8'));
    const c = Number(r.total_cost_usd);
    if (!Number.isFinite(c) || c < 0) {
        console.error(`record-cost: no total_cost_usd in ${p}`);
        process.exit(1);
    }
    cost += c;
    turns += Number(r.num_turns) || 0;
}
if (!resultPaths.some((p) => fs.existsSync(p))) {
    console.error('record-cost: no Claude Code result to read');
    process.exit(1);
}
let md = fs.readFileSync(devlogPath, 'utf8');
const set = (key, value) => {
    const re = new RegExp(`^${key}:.*$`, 'm');
    md = re.test(md)
        ? md.replace(re, `${key}: ${value}`)
        : md.replace(/^---\n/, `---\n${key}: ${value}\n`);
};
set('costUsd', cost.toFixed(4));
set('costMeasured', 'true');
fs.writeFileSync(devlogPath, md);
console.log(`record-cost: $${cost.toFixed(4)} measured (${turns} turns) -> ${devlogPath}`);
