#!/usr/bin/env node
// Render brand assets for the launch package: coin image, X avatar, X banner.
// Usage: node scripts/og/brand.mjs  → writes hq/assets/brand/{coin,avatar,banner}.png
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
const out = path.join(root, 'hq/assets/brand');
fs.mkdirSync(out, { recursive: true });

const browser = await launch('chromium');
for (const [name, w, h] of [
    ['coin', 1000, 1000],
    ['avatar', 400, 400],
    ['banner', 1500, 500]
]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto(`${base}/scripts/og/brand/${name}.html`);
    await page.evaluate(() => document.fonts.ready);
    if (name === 'banner') await page.waitForFunction(() => window.ready === true);
    await page.screenshot({ path: path.join(out, `${name}.png`) });
    console.log(`wrote hq/assets/brand/${name}.png`);
    await page.close();
}
await browser.close();
server.close();
