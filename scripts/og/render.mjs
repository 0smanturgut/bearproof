#!/usr/bin/env node
// Render static social cards (1200×630 PNG) from the HTML templates in this folder.
// Usage: node scripts/og/render.mjs   → writes hq/assets/og.png
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch } from '../lib/browser.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const jobs = [{ src: 'hq-card.html', out: 'hq/assets/og.png' }];

const browser = await launch('chromium');
const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1
});
for (const job of jobs) {
    await page.goto(pathToFileURL(path.join(here, job.src)).href);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(root, job.out), type: 'png' });
    console.log('wrote', job.out);
}
await browser.close();
