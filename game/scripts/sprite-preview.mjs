#!/usr/bin/env node
/**
 * Look at pixel art without a browser: renders sprites (every animation frame) or icons to one PNG, big.
 *
 *   node game/scripts/sprite-preview.mjs pepe bull            sprites by id
 *   node game/scripts/sprite-preview.mjs group:player         a whole SPRITE_GROUPS entry
 *   node game/scripts/sprite-preview.mjs icon:tongue          icons (ICONS) by id
 *   node game/scripts/sprite-preview.mjs prefix:chop_         every sprite whose id starts with chop_
 *   node game/scripts/sprite-preview.mjs decal:chop_grass_a   a ground decal (props.js); decals:chop_ for all
 *   [--scale 8] [--out /tmp/sprites.png] [--bg '#2B3F33']
 *
 * Then read the PNG. Each row is one sprite, its frames left to right, on the game's ink background (or --bg, e.g.
 * a map's ground colour) and on a light strip (so dark outlines show). Writes only to --out (default
 * /tmp/sprites.png).
 */
import fs from 'node:fs';
import { color, PAL } from '../src/art/palette.js';
import { ICONS, SPRITES, SPRITE_GROUPS } from '../src/art/sprites.js';
import { DECAL_DEFS, decal } from '../src/art/props.js';
import { Raster } from '../../worker/src/og/png.js';

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const scale = Math.max(1, Math.min(16, Number(opt('--scale', 8))));
const out = opt('--out', '/tmp/sprites.png');
const bg = opt('--bg', PAL.ink);
const names = args.filter(
    (a, i) => !a.startsWith('--') && !['--scale', '--out', '--bg'].includes(args[i - 1])
);
if (!names.length) {
    console.error(
        'usage: sprite-preview.mjs <id | group:<name> | icon:<id> | prefix:<p> | decal:<id> | decals:<p>> ... [--scale 8] [--out file.png] [--bg #hex]'
    );
    process.exit(2);
}

const list = [];
for (const n of names) {
    if (n.startsWith('group:')) {
        for (const id of SPRITE_GROUPS[n.slice(6)] || []) list.push([id, SPRITES[id]]);
    } else if (n.startsWith('icon:')) list.push([n, ICONS[n.slice(5)]]);
    else if (n.startsWith('prefix:')) {
        for (const id of Object.keys(SPRITES))
            if (id.startsWith(n.slice(7))) list.push([id, SPRITES[id]]);
    } else if (n.startsWith('decals:')) {
        for (const id of Object.keys(DECAL_DEFS))
            if (id.startsWith(n.slice(7))) list.push([`decal:${id}`, decal(id)]);
    } else if (n.startsWith('decal:')) list.push([n, decal(n.slice(6))]);
    else list.push([n, SPRITES[n]]);
}
if (!list.length) {
    console.error('nothing matched');
    process.exit(1);
}
const missing = list.filter(([, s]) => !s).map(([n]) => n);
if (missing.length) {
    console.error(`unknown: ${missing.join(', ')}`);
    process.exit(1);
}

const pad = 8;
const light = '#C9D2DC';
const rowH = (s) => s.h * scale * 2 + pad * 3;
const W = Math.max(...list.map(([, s]) => s.frames.length * (s.w * scale + pad))) + pad;
const H = list.reduce((h, [, s]) => h + rowH(s), 0);
const r = new Raster(W, H, bg);
let y = 0;
for (const [, s] of list) {
    r.rect(0, y + s.h * scale + pad * 2 - pad / 2, W, s.h * scale + pad, light);
    s.frames.forEach((frame, f) => {
        const x0 = pad + f * (s.w * scale + pad);
        for (const dy of [y + pad, y + s.h * scale + pad * 2]) {
            for (let sy = 0; sy < frame.length; sy++)
                for (let sx = 0; sx < frame[sy].length; sx++) {
                    const ch = frame[sy][sx];
                    if (ch === '.') continue;
                    r.rect(
                        x0 + sx * scale,
                        dy + sy * scale,
                        scale,
                        scale,
                        color(s.colors[ch] || ch)
                    );
                }
        }
    });
    y += rowH(s);
}
fs.writeFileSync(out, Buffer.from(await r.png()));
console.log(
    `sprite-preview: ${list.map(([n, s]) => `${n} (${s.w}x${s.h}, ${s.frames.length} frames)`).join(', ')} -> ${out}`
);
