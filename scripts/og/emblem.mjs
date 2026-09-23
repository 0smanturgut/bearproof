#!/usr/bin/env node
// Export the bull emblem (game/src/art) as the site's icons: an SVG favicon (pixel rects) for the HQ and
// the game, and PNG touch icons. Usage: node scripts/og/emblem.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPRITES } from '../../game/src/art/sprites.js';
import { Raster } from '../../worker/src/og/png.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function svg(def) {
    const rows = def.frames[0];
    let rects = '';
    for (let y = 0; y < def.h; y++) {
        let x = 0;
        while (x < def.w) {
            const ch = rows[y][x];
            if (ch === '.') {
                x++;
                continue;
            }
            let run = 1;
            while (x + run < def.w && rows[y][x + run] === ch) run++;
            rects += `<rect x="${x}" y="${y}" width="${run}" height="1" fill="${def.colors[ch]}"/>`;
            x += run;
        }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${def.w} ${def.h}" shape-rendering="crispEdges">${rects}</svg>\n`;
}

async function png(def, size, bg, pad) {
    const r = new Raster(size, size, bg);
    const scale = Math.floor((size - pad * 2) / Math.max(def.w, def.h));
    const ox = Math.floor((size - def.w * scale) / 2);
    const oy = Math.floor((size - def.h * scale) / 2);
    const rows = def.frames[0];
    for (let y = 0; y < def.h; y++)
        for (let x = 0; x < def.w; x++) {
            const ch = rows[y][x];
            if (ch !== '.') r.rect(ox + x * scale, oy + y * scale, scale, scale, def.colors[ch]);
        }
    return r.png();
}

const small = SPRITES.emblem;
const large = SPRITES.emblem_large;
for (const dir of ['hq/assets', 'game/assets']) {
    fs.writeFileSync(path.join(root, dir, 'bull.svg'), svg(small));
    fs.writeFileSync(path.join(root, dir, 'bull-mark.svg'), svg(large));
}
fs.writeFileSync(
    path.join(root, 'hq/assets/apple-touch-icon.png'),
    await png(large, 180, '#06080B', 14)
);
fs.writeFileSync(path.join(root, 'game/assets/icon-512.png'), await png(large, 512, '#06080B', 40));
console.log('emblem: wrote bull.svg, bull-mark.svg, apple-touch-icon.png, icon-512.png');
