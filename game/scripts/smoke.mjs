#!/usr/bin/env node
/**
 * Smoke test for a game build: the Build Agent's deploy gate.
 *
 * Serves game/ (or --dir) with a stub API, then in real Chromium at a phone and a desktop viewport:
 *   1. the title screen renders with no console errors,
 *   2. PLAY starts a run, the sim advances and the HUD updates,
 *   3. a level-up shows three cards and a pick resumes play,
 *   4. death shows the game-over screen, and the run log the game recorded re-simulates to the same score,
 *   5. attract mode (?attract=1) runs on its own.
 * Screenshots go to --out (default: a temp dir). Exits non-zero on any failure.
 *
 *   node game/scripts/smoke.mjs [--dir game] [--out /tmp/shots]
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../../scripts/lib/browser.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const DIR = path.resolve(opt('--dir', path.join(here, '..')));
const OUT = path.resolve(opt('--out', fs.mkdtempSync(path.join(os.tmpdir(), 'bearproof-smoke-'))));
fs.mkdirSync(OUT, { recursive: true });

const MIME = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.woff2': 'font/woff2',
    '.txt': 'text/plain'
};
const today = new Date().toISOString().slice(0, 10);
const submitted = [];

const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const json = (obj, status = 200) =>
        res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(obj));
    if (url.pathname === '/build-info.json') return json({ n: 'smoke', commit: 'smoke' });
    if (url.pathname === '/api/daily')
        return json({
            date: today,
            build: 'smoke',
            seed: 424242,
            stage: 'chop',
            endsAt: new Date(Date.now() + 3600e3).toISOString()
        });
    if (url.pathname === '/api/leaderboard')
        return json({ date: today, build: 'smoke', total: 0, rows: [] });
    if (['/api/session', '/api/player', '/api/payout-address'].includes(url.pathname))
        return json({ ok: true });
    // The run's share card (the Worker draws it in production; any PNG will do here).
    if (/^\/og\/run\/[0-9a-z]+\.png$/.test(url.pathname))
        return res
            .writeHead(200, { 'content-type': 'image/png' })
            .end(fs.readFileSync(path.join(DIR, 'assets', 'icon-512.png')));
    if (url.pathname === '/api/runs') {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
            submitted.push(JSON.parse(body));
            json({ ok: true, id: 'smoke0000000000000', status: 'pending', rank: 1 });
        });
        return;
    }
    const file = path.join(
        DIR,
        decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)
    );
    if (!file.startsWith(DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory())
        return res.writeHead(404).end();
    res.writeHead(200, {
        'content-type': MIME[path.extname(file)] || 'application/octet-stream'
    }).end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const failures = [];
const check = (ok, msg) => {
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${msg}`);
    if (!ok) failures.push(msg);
};

const browser = await launch('chromium');
for (const vp of [
    {
        name: 'phone',
        width: 390,
        height: 844,
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3
    },
    { name: 'desktop', width: 1280, height: 800, deviceScaleFactor: 1 }
]) {
    console.log(`[${vp.name} ${vp.width}x${vp.height}]`);
    const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        isMobile: !!vp.isMobile,
        hasTouch: !!vp.hasTouch,
        deviceScaleFactor: vp.deviceScaleFactor
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${base}/`, { waitUntil: 'load' });
    await page.waitForFunction(
        () => window.__bearproof && !document.getElementById('screenTitle').hidden,
        null,
        { timeout: 8000 }
    );
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, `${vp.name}-1-title.png`) });
    const scroll = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
    );
    check(scroll <= 0, 'no horizontal scroll on the title screen');

    await page.click('#btnDaily');
    await page.waitForTimeout(300);
    check(
        (await page.evaluate(() => window.__bearproof.state())) === 'playing',
        'PLAY starts a run'
    );
    await page.evaluate(() => window.__bearproof.advance(45, { style: 'survive' }));
    await page.waitForTimeout(600);
    const s1 = await page.evaluate(() => window.__bearproof.summary());
    check(s1.ticks >= 45 * 60, `sim advanced (${s1.ticks} ticks)`);
    await page.screenshot({ path: path.join(OUT, `${vp.name}-2-play.png`) });

    const why = await page.evaluate(() =>
        window.__bearproof.advance(240, { style: 'survive', stopAtLevelUp: true })
    );
    check(why === 'levelup', `a level-up happens naturally (${why})`);
    await page.waitForFunction(() => window.__bearproof.state() === 'levelup', null, {
        timeout: 3000
    });
    await page.waitForTimeout(450);
    const cards = await page.locator('#cards .card').count();
    check(cards === 3, `level-up shows 3 cards (${cards})`);
    await page.screenshot({ path: path.join(OUT, `${vp.name}-3-levelup.png`) });
    await page.locator('#cards .card').first().click();
    await page.waitForTimeout(200);
    check(
        (await page.evaluate(() => window.__bearproof.state())) === 'playing',
        'picking a card resumes play'
    );

    await page.evaluate(() => window.__bearproof.advance(60 * 20, { style: 'reckless' }));
    await page.waitForFunction(() => !document.getElementById('screenOver').hidden, null, {
        timeout: 5000
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, `${vp.name}-4-over.png`) });
    const over = await page.evaluate(() => window.__bearproof.summary());
    check(over.reason === 'liquidated', `run ended (${over.reason}, score ${over.score})`);

    // The recorded log must re-simulate to the exact same result.
    const replayed = await page.evaluate(async () => {
        const { replay } = await import('./src/sim/runlog.js');
        const r = replay(window.__bearproof.game.lastRun.bytes);
        return { ok: r.ok, error: r.error, score: r.summary?.score, ticks: r.summary?.ticks };
    });
    check(
        replayed.ok && replayed.score === over.score && replayed.ticks === over.ticks,
        `recorded run replays identically (${JSON.stringify(replayed)})`
    );

    const form = await page.locator('#nameForm').isVisible();
    if (form) {
        await page.fill('#nameInput', 'smoke');
        await page.click('#nameForm button[type=submit]');
    }
    await page.waitForTimeout(500);
    check(
        submitted.length > 0 && typeof submitted.at(-1).log === 'string',
        'run was submitted with a log'
    );
    check(
        errors.length === 0,
        `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`
    );
    await ctx.close();
}

{
    const ctx = await browser.newContext({ viewport: { width: 480, height: 600 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${base}/?attract=1`);
    await page.waitForTimeout(2500);
    const s = await page.evaluate(() => window.__bearproof.summary());
    await page.screenshot({ path: path.join(OUT, 'attract.png') });
    console.log('[attract]');
    check(s.ticks > 60, `attract mode plays by itself (${s.ticks} ticks)`);
    check(errors.length === 0, 'attract mode has no page errors');
    await ctx.close();
}

await browser.close();
server.close();
console.log(`screenshots: ${OUT}`);
if (failures.length) {
    console.error(`SMOKE FAILED (${failures.length})`);
    process.exit(1);
}
console.log('SMOKE OK');
