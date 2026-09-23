#!/usr/bin/env node
/**
 * Write the Build Agent's measured cost into its devlog. Reads Claude Code's `--output-format json` result
 * (`total_cost_usd` is computed by Claude Code from real token usage) and fills `costUsd` / `costMeasured`.
 *
 *   node agent/record-cost.mjs <claude-result.json> <devlog/build-n.md>
 */
import fs from 'node:fs';

const [resultPath, devlogPath] = process.argv.slice(2);
const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
const cost = Number(result.total_cost_usd);
if (!Number.isFinite(cost) || cost < 0) {
    console.error('record-cost: no total_cost_usd in the Claude Code result');
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
console.log(
    `record-cost: $${cost.toFixed(4)} measured (${result.num_turns ?? '?'} turns) -> ${devlogPath}`
);
