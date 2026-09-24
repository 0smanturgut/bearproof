#!/usr/bin/env node
// Render the static brand images from the HTML templates in scripts/og/, drawn with the game's own sprites.
// Usage: node scripts/og/render.mjs
//   → hq/assets/og.png                       1200×630 social card (hq-card.html)
//   → hq/assets/brand/{coin,avatar,banner}.png  launch package (brand/*.html)
//   → hq/assets/brand/article-cover.png      1500×600 X Article cover (brand/article.html)
//   → content/x/img/*.png                    1600×900 images for X posts (x/*.html)
// Pass names to render only some: node scripts/og/render.mjs article-cover
// Icons (favicon, touch icons) come from scripts/og/emblem.mjs.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../lib/browser.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const MIME = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.svg': 'image/svg+xml',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.css': 'text/css',
    '.woff2': 'font/woff2'
};
const server = http.createServer((req, res) => {
    const file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(root) || !fs.existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, {
        'content-type': MIME[path.extname(file)] || 'application/octet-stream'
    }).end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
fs.mkdirSync(path.join(root, 'hq/assets/brand'), { recursive: true });

const jobs = [
    ['scripts/og/hq-card.html', 'hq/assets/og.png', 1200, 630],
    ['scripts/og/brand/coin.html', 'hq/assets/brand/coin.png', 1000, 1000],
    ['scripts/og/brand/avatar.html', 'hq/assets/brand/avatar.png', 400, 400],
    ['scripts/og/brand/banner.html', 'hq/assets/brand/banner.png', 1500, 500],
    ['scripts/og/brand/article.html', 'hq/assets/brand/article-cover.png', 1500, 600],
    // Images for X posts (content/x/), 16:9.
    ['scripts/og/x/compare.html', 'content/x/img/01-day0-vs-day2.png', 1600, 900],
    ['scripts/og/x/roster.html', 'content/x/img/02-meet-the-bear-market.png', 1600, 900],
    ['scripts/og/x/bosses.html', 'content/x/img/03-pick-your-nightmare.png', 1600, 900],
    ['scripts/og/x/gates.html', 'content/x/img/04-tonight-i-code-alone.png', 1600, 900],
    ['scripts/og/x/ballot.html', 'content/x/img/07-tonights-ballot.png', 1600, 900],
    [
        'scripts/og/x/pipeline.html?state=running',
        'content/x/img/10-build3-in-progress.png',
        1600,
        900
    ],
    ['scripts/og/x/pipeline.html?state=green', 'content/x/img/11-build3-all-green.png', 1600, 900],
    ['scripts/og/x/pipeline.html?state=red', 'content/x/img/11-build3-gate-red.png', 1600, 900],
    ['scripts/og/x/green.html', 'content/x/img/14-green-candles.png', 1600, 900],
    ['scripts/og/x/flying.html', 'content/x/img/15-bproof-is-flying.png', 1600, 900],
    ['scripts/og/x/live.html', 'content/x/img/16-watch-the-ai-build.png', 1600, 900],
    ['scripts/og/x/player2.html', 'content/x/img/17-player-2-incoming.png', 1600, 900],
    ['scripts/og/x/board.html', 'content/x/img/18-166051-fell.png', 1600, 900],
    ['scripts/og/x/insights.html', 'content/x/img/19-what-your-runs-told-me.png', 1600, 900],
    ['scripts/og/x/tonight.html', 'content/x/img/20-tonight-on-bearproof.png', 1600, 900],
    ['scripts/og/x/receipt3.html', 'content/x/img/30-build3-receipt.png', 1600, 900],
    ['scripts/og/x/disclosure3.html', 'content/x/img/31-build3-who-did-what.png', 1600, 900],
    ['scripts/og/x/ballot4.html', 'content/x/img/32-build4-ballot.png', 1600, 900],
    ['scripts/og/x/notes.html', 'content/x/img/33-a-note-i-left-myself.png', 1600, 900],
    ['scripts/og/x/stack.html', 'content/x/img/34-what-i-run-on.png', 1600, 900],
    [
        'scripts/og/x/pipeline.html?state=running&n=4&date=25%20SEP',
        'content/x/img/35-build4-in-progress.png',
        1600,
        900
    ],
    [
        'scripts/og/x/pipeline.html?state=green&n=4&date=25%20SEP',
        'content/x/img/36-build4-all-green.png',
        1600,
        900
    ],
    [
        'scripts/og/x/pipeline.html?state=red&n=4&date=25%20SEP',
        'content/x/img/36-build4-gate-red.png',
        1600,
        900
    ],
    // Frames for videos assembled with ffmpeg (content/x/video/).
    ['scripts/og/x/video-end.html', 'content/x/video/src/daily-end.png', 1920, 1080],
    ['scripts/og/x/video-split.html', 'content/x/video/src/split-frame.png', 1920, 1080]
].filter(
    ([, out]) => !process.argv[2] || process.argv.slice(2).includes(path.basename(out, '.png'))
);
const browser = await launch('chromium');
for (const [src, out, w, h] of jobs) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${base}/${src}`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => window.ready === true, null, { timeout: 10000 });
    await page.screenshot({ path: path.join(root, out) });
    if (errors.length) throw new Error(`${src}: ${errors.join('; ')}`);
    console.log('wrote', out);
    await page.close();
}
await browser.close();
server.close();
