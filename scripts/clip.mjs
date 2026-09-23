#!/usr/bin/env node
/**
 * Record a short trailer of the working-tree game: title screen, a run on autopilot, a level-up, a boss
 * entrance. Frames come from Chrome's screencast (JPEG, near-lossless) and are encoded to H.264 by ffmpeg,
 * so the pixel art stays crisp. For the HQ's "Today's build" card and the daily X post.
 *
 *   node scripts/clip.mjs --out hq/assets/builds/build-2.mp4 [--size 1280x720] [--scale 1.5]
 *
 * Needs ffmpeg on PATH. Nothing here touches the network: the API is mocked like the smoke test.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './lib/browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'game');
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const OUT = path.resolve(ROOT, opt('--out', 'clip.mp4'));
const [VW, VH] = opt('--size', '1280x720').split('x').map(Number);
const SCALE = Number(opt('--scale', '1.5'));
const SEED = Number(opt('--seed', '424242'));

const MIME = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.woff2': 'font/woff2'
};
const today = new Date().toISOString().slice(0, 10);
const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const json = (o) =>
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(o));
    if (url.pathname === '/build-info.json') return json({ n: Number(opt('--build', '2')) });
    if (url.pathname === '/api/daily')
        return json({
            date: today,
            build: Number(opt('--build', '2')),
            seed: SEED,
            endsAt: new Date(Date.now() + 36e5).toISOString()
        });
    if (url.pathname.startsWith('/api/'))
        return json({ ok: true, rows: [], id: 'clip00000000000000' });
    const file = path.join(DIR, url.pathname === '/' ? '/index.html' : url.pathname);
    if (!file.startsWith(DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory())
        return res.writeHead(404).end();
    res.writeHead(200, {
        'content-type': MIME[path.extname(file)] || 'application/octet-stream'
    }).end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await launch('chromium');
const ctx = await browser.newContext({
    viewport: { width: VW, height: VH },
    deviceScaleFactor: SCALE
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${base}/`);
await page.waitForFunction(
    () => window.__bearproof && !document.getElementById('screenTitle').hidden
);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(1500);

const cdp = await ctx.newCDPSession(page);
const frames = [];
cdp.on('Page.screencastFrame', async (f) => {
    frames.push({ data: f.data, ts: f.metadata.timestamp });
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 94,
    maxWidth: Math.round(VW * SCALE),
    maxHeight: Math.round(VH * SCALE),
    everyNthFrame: 1
});
const wait = (ms) => page.waitForTimeout(ms);
const g = (fn, a) => page.evaluate(fn, a);

// 1. title screen, the live build behind it
await wait(2400);
// 2. play: fast-forward into a busy mid-game, then let the autopilot drive
await page.click('#btnDaily');
await g(async () => {
    const { createBot } = await import('/src/sim/bot.js');
    const game = window.__bearproof.game;
    // Keep the autopilot's bull alive for the trailer: top its HP up every frame (the bar stays honest).
    const heal = () => {
        const p = window.__bearproof.game.sim.player;
        p.hp = p.maxHp;
        requestAnimationFrame(heal);
    };
    heal();
    const fwd = (s) => {
        for (let i = 0; i < s; i++) {
            game.sim.player.hp = game.sim.player.maxHp;
            window.__bearproof.advance(1, { style: 'survive' });
        }
    };
    window.__fwd = fwd;
    fwd(150);
    game.bot = createBot({ style: 'survive' });
    game.ui.moveHint(false);
    document.getElementById('toast').classList.remove('show');
});
await wait(4200);
// 3. a level-up
await g(() => {
    const game = window.__bearproof.game;
    game.bot = null;
    for (let i = 0; i < 90 && !game.sim.choices; i++) {
        game.sim.player.hp = game.sim.player.maxHp;
        window.__bearproof.advance(1, { style: 'survive', stopAtLevelUp: true });
    }
});
await wait(1800);
await page
    .locator('#cards .card')
    .first()
    .click({ force: true })
    .catch(() => {});
// 4. the boss: jump to just before the Rug Lord and watch him arrive
await g(async () => {
    const { createBot } = await import('/src/sim/bot.js');
    const game = window.__bearproof.game;
    const left = Math.max(0, 294 - game.sim.time);
    window.__fwd(Math.ceil(left));
    while (game.sim.choices) {
        game.rec.pick(game.sim.tick, 0);
        game.sim.choose(0);
    }
    game.bot = createBot({ style: 'survive' });
    game.state = 'playing';
    game.ui.hideAll();
});
await wait(9000);
await cdp.send('Page.stopScreencast');
await browser.close();
server.close();
if (errors.length) console.warn('page errors:', errors.slice(0, 3));

// encode: variable-timestamp JPEG frames -> constant 30 fps H.264
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bearproof-clip-'));
const list = [];
frames.forEach((f, i) => {
    const file = path.join(tmp, `f${String(i).padStart(5, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    const next = frames[i + 1] ? frames[i + 1].ts : f.ts + 1 / 30;
    list.push(`file '${file}'`, `duration ${Math.max(0.001, next - f.ts).toFixed(4)}`);
});
list.push(`file '${path.join(tmp, `f${String(frames.length - 1).padStart(5, '0')}.jpg`)}'`);
fs.writeFileSync(path.join(tmp, 'list.txt'), list.join('\n'));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
execFileSync(
    'ffmpeg',
    [
        '-y',
        '-loglevel',
        'error',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        path.join(tmp, 'list.txt'),
        '-vf',
        'fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=neighbor',
        '-c:v',
        'libx264',
        '-preset',
        'slow',
        '-crf',
        '20',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        OUT
    ],
    { stdio: 'inherit' }
);
fs.rmSync(tmp, { recursive: true, force: true });
const dur = (frames.at(-1).ts - frames[0].ts).toFixed(1);
console.log(
    `clip: ${frames.length} frames over ${dur}s -> ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1e6).toFixed(2)} MB)`
);
