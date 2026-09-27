// Render a few frames of the trailer as PNGs, to check a scene without a full render.
//   node scripts/trailer/stills.mjs <work dir> <16x9|9x16> <seconds,comma,separated>
import fs from 'node:fs';
import path from 'node:path';
import { renderStills } from './render.mjs';

const [work, aspect, secs] = process.argv.slice(2);
const data = JSON.parse(fs.readFileSync(path.join(work, 'data.json'), 'utf8'));
const frames = secs.split(',').map((s) => Math.round(Number(s) * 60));
const files = await renderStills({ work, data, aspect, frames, outDir: path.join(work, 'stills') });
console.log(files.join('\n'));
