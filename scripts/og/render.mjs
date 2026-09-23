#!/usr/bin/env node
// Render static images from the HTML templates / SVGs in this repo.
// Usage: node scripts/og/render.mjs
//   → hq/assets/og.png               1200×630 social card (from hq-card.html)
//   → hq/assets/apple-touch-icon.png 180×180 home-screen icon (Proof icon, pixel-scaled on ink)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch } from '../lib/browser.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const cards = [{ src: 'hq-card.html', out: 'hq/assets/og.png', width: 1200, height: 630 }];

const browser = await launch('chromium');

for (const job of cards) {
    const page = await browser.newPage({
        viewport: { width: job.width, height: job.height },
        deviceScaleFactor: 1
    });
    await page.goto(pathToFileURL(path.join(here, job.src)).href);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(root, job.out), type: 'png' });
    await page.close();
    console.log('wrote', job.out);
}

// Apple touch icon: the 16×16 Proof SVG scaled ×10 with nearest-neighbour onto the ink background.
// iOS rounds the corners itself, so the art keeps a 10 px safe margin on every side.
{
    const svg = fs.readFileSync(path.join(root, 'hq/assets/proof.svg'), 'utf8');
    const page = await browser.newPage({
        viewport: { width: 180, height: 180 },
        deviceScaleFactor: 1
    });
    await page.setContent(`<!doctype html><html><body style="margin:0;background:#07090C">
        <img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"
             width="160" height="160" style="display:block;margin:10px;image-rendering:pixelated">
        </body></html>`);
    await page.waitForFunction(() => document.images[0].complete);
    const out = 'hq/assets/apple-touch-icon.png';
    await page.screenshot({ path: path.join(root, out), type: 'png' });
    await page.close();
    console.log('wrote', out);
}

await browser.close();
