#!/usr/bin/env node
/**
 * Record a short gameplay loop of Build #0 (the untouched upstream game) for the HQ hero's "then vs now" view.
 * Needs a running server that serves /b/0/ (`npm run dev:worker`) and ffmpeg on PATH.
 *
 *   node scripts/clip-upstream.mjs --base http://localhost:8787 --out hq/assets/compare/build-0.mp4
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './lib/browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const BASE = opt('--base', 'http://localhost:8787');
const OUT = path.resolve(ROOT, opt('--out', 'hq/assets/compare/build-0.mp4'));
const SECONDS = Number(opt('--seconds', '12'));
const [VW, VH] = opt('--size', '960x600').split('x').map(Number);

const browser = await launch('chromium');
const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto(`${BASE}/b/0/`);
await page.waitForTimeout(1500);
await page.click('#howtoClose').catch(() => {});
await page.evaluate(() => document.getElementById('tutorialOffer')?.remove());
await page.click('#btnStart', { force: true });
// The original pauses on "Choose an upgrade": take the first option so the run keeps moving.
const pick = () => page.evaluate(() => document.querySelector('.upgrade-option')?.click());
// Walk around for a while first: the original spawns its first enemies after about ten seconds.
{
    const keys = ['KeyD', 'KeyS', 'KeyA', 'KeyW'];
    for (let i = 0; i < 20; i++) {
        await page.keyboard.down(keys[i % 4]);
        await page.waitForTimeout(800);
        await page.keyboard.up(keys[i % 4]);
        await pick();
    }
}

const cdp = await ctx.newCDPSession(page);
const frames = [];
cdp.on('Page.screencastFrame', async (f) => {
    frames.push({ data: f.data, ts: f.metadata.timestamp });
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 90,
    maxWidth: VW,
    maxHeight: VH
});
// Walk a lazy circle so the view keeps moving, the way a player would.
const keys = ['KeyD', 'KeyS', 'KeyA', 'KeyW'];
const t0 = Date.now();
for (let i = 0; Date.now() - t0 < SECONDS * 1000; i++) {
    await page.keyboard.down(keys[i % 4]);
    await page.waitForTimeout(350);
    await pick();
    await page.waitForTimeout(350);
    await page.keyboard.up(keys[i % 4]);
}
await cdp.send('Page.stopScreencast');
await browser.close();

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bearproof-up-'));
const list = [];
frames.forEach((f, i) => {
    const file = path.join(tmp, `f${String(i).padStart(5, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    const next = frames[i + 1] ? frames[i + 1].ts : f.ts + 1 / 30;
    list.push(`file '${file}'`, `duration ${Math.max(0.001, next - f.ts).toFixed(4)}`);
});
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
        `fps=30,scale=${VW}:${VH}`,
        '-c:v',
        'libx264',
        '-preset',
        'slow',
        '-crf',
        '28',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        '-an',
        OUT
    ],
    { stdio: 'inherit' }
);
// Poster: the first frame, for reduced motion and before the video loads.
execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-i',
    OUT,
    '-frames:v',
    '1',
    '-q:v',
    '4',
    OUT.replace(/\.mp4$/, '.jpg')
]);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(
    `upstream clip: ${frames.length} frames -> ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1e6).toFixed(2)} MB)`
);
