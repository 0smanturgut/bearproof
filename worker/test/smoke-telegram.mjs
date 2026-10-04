#!/usr/bin/env node
/**
 * End-to-end smoke test of the Telegram bot against a local Worker, with a mock Bot API and a mock Claude API in
 * this process. Nothing leaves the machine, and no real bot, chat or key is involved: it runs `wrangler dev` on a
 * throwaway database, triggers the cron, posts updates to the webhook the way Telegram would, and checks what
 * the Worker sent back.
 *
 *   npm run build && node worker/test/smoke-telegram.mjs      (DUMP=1 also prints every message the bot sent)
 *
 * The unit tests (worker/test/telegram.test.js) cover the logic. This covers what they can't: the bundle running
 * in workerd (the Anthropic SDK included), the lazy imports, the real facts, the routes and the cron wiring.
 */
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { webhookSecret } from '../src/lib/telegram.js';

const WORKER = 8793;
const MOCK = 8794;
const BASE = `http://127.0.0.1:${WORKER}`;
const TOKEN = 'local-test-token';
const CHAT = -1009990001;
const BOT = { id: 4242, is_bot: true, username: 'bearproof_local_bot', first_name: 'BEARPROOF' };
const state = fs.mkdtempSync(path.join(os.tmpdir(), 'bearproof-tg-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
    if (ok) pass++;
    else fail++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : `\n     ${detail}`}`);
}

// --- Mock Bot API + mock Claude API ---------------------------------------------------
const telegram = [];
const claude = [];
let nextMessage = 9000;
const mock = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => (raw += d));
    req.on('end', () => {
        let body = {};
        try {
            body = JSON.parse(raw || '{}');
        } catch {
            body = {};
        }
        res.setHeader('content-type', 'application/json');
        if (req.url.startsWith('/v1/messages')) {
            claude.push({ beta: req.headers['anthropic-beta'] || '', body });
            res.end(
                JSON.stringify({
                    id: 'msg_local',
                    type: 'message',
                    role: 'assistant',
                    model: 'claude-opus-5-5',
                    content: [
                        { type: 'thinking', thinking: '', signature: 'x' },
                        {
                            type: 'text',
                            // The self-check asks for JSON once; everything else gets a chat answer.
                            text: body.output_config?.format
                                ? '{"ok":true}'
                                : 'Mock answer: the crates are in **Build #12**.'
                        }
                    ],
                    stop_reason: 'end_turn',
                    usage: { input_tokens: 1500, output_tokens: 50 }
                })
            );
            return;
        }
        const method = req.url.split('/').pop();
        telegram.push({ method, params: body });
        const result =
            method === 'getMe'
                ? BOT
                : method === 'sendMessage'
                  ? { message_id: nextMessage++ }
                  : method === 'getChatAdministrators'
                    ? [{ user: { id: 1 } }, { user: BOT }]
                    : true;
        res.end(JSON.stringify({ ok: true, result }));
    });
});
await new Promise((r) => mock.listen(MOCK, '127.0.0.1', r));

// --- The Worker -------------------------------------------------------------------------
execFileSync(
    'npx',
    ['wrangler', 'd1', 'migrations', 'apply', 'bearproof-db', '--local', '--persist-to', state],
    { stdio: 'ignore', env: { ...process.env, CI: '1' } }
);
// The group is named the way the operator does it: the CONFIG key, not a deploy (wrangler.jsonc leaves it empty).
execFileSync(
    'npx',
    [
        'wrangler',
        'kv',
        'key',
        'put',
        '--binding=CONFIG',
        '--local',
        '--persist-to',
        state,
        'tg:config',
        JSON.stringify({ chat: '@bearproof_local', url: 'https://t.me/bearproof_local' })
    ],
    { stdio: 'ignore', env: { ...process.env, CI: '1' } }
);
const vars = {
    TELEGRAM_BOT_TOKEN: TOKEN,
    TELEGRAM_API: `http://127.0.0.1:${MOCK}`,
    SITE_URL: BASE,
    ANTHROPIC_API_KEY: 'local-test-key',
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK}`
};
const worker = spawn(
    'npx',
    [
        'wrangler',
        'dev',
        '--local',
        '--port',
        String(WORKER),
        '--persist-to',
        state,
        '--test-scheduled',
        ...Object.entries(vars).flatMap(([k, v]) => ['--var', `${k}:${v}`])
    ],
    { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CI: '1' } }
);
let log = '';
worker.stdout.on('data', (d) => (log += d));
worker.stderr.on('data', (d) => (log += d));

async function finish(code) {
    worker.kill('SIGTERM');
    mock.close();
    await sleep(500);
    fs.rmSync(state, { recursive: true, force: true });
    if (code) console.log(`--- wrangler log (tail)\n${log.slice(-3000)}`);
    console.log(`\nsmoke-telegram: ${pass} passed, ${fail} failed`);
    process.exit(code);
}

let up = false;
for (let i = 0; i < 90 && !up; i++) {
    await sleep(1000);
    up = await fetch(`${BASE}/api/health`)
        .then((r) => r.ok)
        .catch(() => false);
}
if (!up) {
    console.log('the Worker did not start');
    await finish(1);
}

const secret = await webhookSecret(TOKEN);
let seq = 1;
async function update(message, { headers = { 'x-telegram-bot-api-secret-token': secret } } = {}) {
    const res = await fetch(`${BASE}/api/telegram/webhook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({
            update_id: seq,
            message: {
                message_id: seq++,
                date: Math.floor(Date.now() / 1000),
                chat: { id: CHAT, type: 'supergroup', username: 'bearproof_local' },
                from: { id: 77, is_bot: false, first_name: 'Tester', username: 'tester' },
                ...message
            }
        })
    });
    return res.status;
}
/** Wait until the mock has seen a call that matches, or give up after 15 s. */
async function seen(list, match) {
    for (let i = 0; i < 60; i++) {
        const hit = list.find(match);
        if (hit) return hit;
        await sleep(250);
    }
    return null;
}
const sentText = (re) => (c) => c.method === 'sendMessage' && re.test(c.params.text || '');

try {
    // 1. The cron sets the bot up and says hello.
    await fetch(`${BASE}/cdn-cgi/handler/scheduled?cron=*%2F15+*+*+*+*`).catch(() => null);
    check(
        'cron: asks Telegram who the bot is',
        !!(await seen(telegram, (c) => c.method === 'getMe'))
    );
    check(
        'cron: publishes the command list',
        !!(await seen(telegram, (c) => c.method === 'setMyCommands'))
    );
    check(
        'cron: a local site never registers a webhook',
        !telegram.some((c) => c.method === 'setWebhook')
    );
    check(
        'cron: the self-check asks Claude both ways (text, then JSON by schema)',
        !!(await seen(claude, (c) => c.body.output_config?.format?.type === 'json_schema')) &&
            claude.some((c) => !c.body.output_config?.format)
    );
    const intro = await seen(telegram, sentText(/^<b>I’m BEARPROOF\.<\/b>/));
    check('cron: the bot introduces itself in the group', !!intro);
    check(
        'cron: announcements go to the configured group',
        intro?.params.chat_id === '@bearproof_local',
        JSON.stringify(intro?.params.chat_id)
    );
    const day = await seen(telegram, sentText(/^<b>(Build #\d+ is live|No new build today)/));
    check('cron: the day’s build post, from the real manifest and devlog', !!day, log.slice(-600));
    check(
        'cron: the day post is pinned',
        !!(await seen(telegram, (c) => c.method === 'pinChatMessage'))
    );

    // 2. The webhook is closed without the secret.
    check(
        'webhook: 401 without the secret',
        (await update({ text: 'hi' }, { headers: {} })) === 401
    );
    check(
        'webhook: 401 with a wrong secret',
        (await update({ text: 'hi' }, { headers: { 'x-telegram-bot-api-secret-token': 'x' } })) ===
            401
    );

    // 3. House rules, commands, the conversation.
    check(
        'webhook: 200 for a real update',
        (await update({ text: 'the crates vanish sometimes' })) === 200
    );
    await update({ text: 'Validate your wallet at fix-wallet.xyz to get support' });
    check(
        'rules: a scam link is deleted',
        !!(await seen(telegram, (c) => c.method === 'deleteMessage'))
    );
    check(
        'rules: and the group is told why, once',
        !!(await seen(telegram, sentText(/^Removed a message from Tester/)))
    );

    await update({ text: '/play' });
    const play = await seen(telegram, sentText(/is live\. Free, one tap, no wallet\./));
    check('/play answers from the live build', !!play, log.slice(-600));
    check(
        '/play carries a Play button to this site',
        play?.params.reply_markup?.inline_keyboard?.[0]?.[0]?.url === `${BASE}/play`
    );
    await update({ text: '/vote' });
    check(
        '/vote answers',
        !!(await seen(telegram, sentText(/Vote for Build #|no ballot right now|is closed/)))
    );
    await update({ text: '/receipts' });
    check('/receipts answers', !!(await seen(telegram, sentText(/^<b>Receipts<\/b>/))));
    await update({ text: '/idea a boss that shorts the chart and makes candles fall' });
    check('/idea is taken', !!(await seen(telegram, sentText(/^On the board\./))));
    await update({ text: '/bug the game froze when I opened a crate on Build #12, phone' });
    check('/bug is logged', !!(await seen(telegram, sentText(/^Logged\. Tonight/))));

    const name = `@${BOT.username}`;
    await update({
        text: `${name} where are the crates?`,
        entities: [{ type: 'mention', offset: 0, length: name.length }]
    });
    const asked = await seen(claude, (c) => Array.isArray(c.body.system));
    check('chat: a mention reaches Claude', !!asked, log.slice(-800));
    check(
        'chat: on Opus 5.5, low effort, with the fallback beta',
        asked?.body.model === 'claude-opus-5-5' &&
            asked?.body.output_config?.effort === 'low' &&
            asked?.body.fallbacks === 'default' &&
            /server-side-fallback/.test(asked?.beta)
    );
    check(
        'chat: the persona is the cached prefix',
        asked?.body.system?.[0]?.cache_control?.type === 'ephemeral'
    );
    check(
        'chat: the facts name the live build',
        /Live build: #\d+ "/.test(asked?.body.system?.[1]?.text || '')
    );
    check(
        'chat: the member’s words arrive as data',
        /<message from="Tester">\nwhere are the crates\?/.test(
            asked?.body.messages?.[0]?.content || ''
        )
    );
    const answer = await seen(telegram, sentText(/^Mock answer: the crates are in Build #12\.$/));
    check(
        'chat: the answer is posted as plain text',
        !!answer && answer.params.parse_mode === undefined
    );

    // 4. What the site shows.
    const feedback = await fetch(`${BASE}/api/feedback`).then((r) => r.json());
    check(
        '/api/feedback lists the bug report',
        feedback.bugs?.[0]?.text === 'the game froze when I opened a crate on Build #12, phone',
        JSON.stringify(feedback).slice(0, 300)
    );
    check(
        '/api/feedback counts today’s chat',
        feedback.today?.messages >= 3 && feedback.today?.people === 1
    );
    const ideas = await fetch(`${BASE}/api/ideas`).then((r) => r.json());
    check(
        '/api/ideas shows the idea, marked as from Telegram',
        ideas.ideas?.[0]?.via === 'telegram'
    );
    const stats = await fetch(`${BASE}/api/stats?x=${Date.now()}`).then((r) => r.json());
    check(
        '/api/stats links the group',
        stats.community?.telegram === 'https://t.me/bearproof_local'
    );
    check(
        '/api/stats counts the chat’s measured cost apart from agent runs',
        stats.computeSpentUsd?.chat > 0 && stats.computeSpentUsd?.meteredRuns === 0,
        JSON.stringify(stats.computeSpentUsd)
    );
} catch (err) {
    check(`crashed: ${err?.message || err}`, false);
}
// DUMP=1 prints what the bot said and what the chat model was shown, to read the copy with real data.
if (process.env.DUMP) {
    for (const c of telegram.filter((x) => x.method === 'sendMessage'))
        console.log(`\n--- sendMessage\n${c.params.text}`);
    const chat = claude.find((c) => Array.isArray(c.body.system));
    console.log(`\n--- FACTS\n${chat?.body.system?.[1]?.text}`);
    console.log(`\n--- user turn\n${chat?.body.messages?.[0]?.content}`);
}
await finish(fail ? 1 : 0);
