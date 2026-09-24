#!/usr/bin/env node
/**
 * Relay Claude Code's `--output-format stream-json` from stdin to the live page, and keep the final result for
 * the cost step. Each tool call becomes one short line ("Editing game/src/sim/content.js", "Running npm test"),
 * the agent's own sentences become 'say' lines, test summaries become 'test' lines. Batched every few seconds.
 *
 *   claude -p ... --output-format stream-json --verbose | node agent/relay.mjs <result.json> [phase]
 *
 * phase: 'build' (default) or 'review', which tags the lines of the second pass.
 */
import fs from 'node:fs';
import readline from 'node:readline';
import { scrub, send } from './live.mjs';

const [resultPath, phase = 'build'] = process.argv.slice(2);
const ROOT = process.cwd();
const rel = (p) =>
    typeof p === 'string' ? p.replace(ROOT + '/', '').replace(/^\/tmp\//, 'tmp/') : '';

export function describeTool(name, input = {}) {
    switch (name) {
        case 'Read':
            return /\.png$/i.test(input.file_path || '')
                ? `Looking at a screenshot: ${rel(input.file_path)}`
                : `Reading ${rel(input.file_path)}`;
        case 'Edit':
        case 'MultiEdit':
            return `Editing ${rel(input.file_path)}`;
        case 'Write':
            return `Writing ${rel(input.file_path)}`;
        case 'Glob':
            return `Looking for ${input.pattern}`;
        case 'Grep':
            return `Searching for "${String(input.pattern).slice(0, 60)}"`;
        case 'Bash':
            return `Running ${String(input.command || '').slice(0, 140)}`;
        case 'TodoWrite':
            return null;
        default:
            return `${name}`;
    }
}

/** Test summaries worth a line: node --test and the gate scripts. */
export function testLine(text) {
    const s = String(text || '');
    // node --test prints "ℹ pass 4" on a terminal and "# pass 4" (TAP) on CI.
    const pass = s.match(/(?:ℹ|#) pass (\d+)/);
    const fail = s.match(/(?:ℹ|#) fail (\d+)/);
    if (pass && fail) return `Tests: ${pass[1]} passed, ${fail[1]} failed`;
    if (/SMOKE OK/.test(s))
        return 'Smoke test: OK (phone and desktop, a seeded run, no console errors)';
    if (/SMOKE FAILED/.test(s)) return 'Smoke test: FAILED';
    if (/all engines match/.test(s))
        return 'Determinism: every engine replays the runs identically';
    const pt = s.match(/playtest: (.{0,200})/);
    if (pt) return `Playtest: ${pt[1]}`;
    return null;
}

let queue = [];
let turns = 0;
const flush = async () => {
    const batch = queue;
    queue = [];
    if (batch.length) await send(batch);
};
const timer = setInterval(flush, 4000);
const push = (type, text, data) => text && queue.push({ type, text, data, ts: Date.now() });

const rl = readline.createInterface({ input: process.stdin });
let result = null;
for await (const line of rl) {
    process.stdout.write(scrub(line) + '\n'); // the raw stream, secrets scrubbed, becomes a build artifact
    let msg;
    try {
        msg = JSON.parse(line);
    } catch {
        continue;
    }
    if (msg.type === 'assistant' && msg.message?.content) {
        turns++;
        for (const block of msg.message.content) {
            if (block.type === 'text' && block.text?.trim()) {
                // First sentence or two: what it is about to do, in its own words.
                push(
                    phase === 'review' ? 'review' : 'say',
                    block.text.trim().split(/\n\n/)[0].slice(0, 300)
                );
            } else if (block.type === 'tool_use') {
                push('tool', describeTool(block.name, block.input), { phase });
            }
        }
    } else if (msg.type === 'user' && Array.isArray(msg.message?.content)) {
        for (const block of msg.message.content) {
            if (block.type !== 'tool_result') continue;
            const text = Array.isArray(block.content)
                ? block.content.map((c) => c.text || '').join('\n')
                : block.content;
            push('test', testLine(text));
        }
    } else if (msg.type === 'result') {
        result = msg;
    }
}
clearInterval(timer);
if (result) {
    fs.writeFileSync(resultPath, JSON.stringify(result));
    push(
        phase === 'review' ? 'review' : 'say',
        `${phase === 'review' ? 'Review pass' : 'Build pass'} finished: ${result.num_turns ?? turns} turns, $${Number(result.total_cost_usd || 0).toFixed(2)} measured.`,
        { turns: result.num_turns ?? turns, costUsd: result.total_cost_usd ?? null, phase }
    );
}
await flush();
if (!result) {
    console.error('relay: no result message from Claude Code');
    process.exit(1);
}
