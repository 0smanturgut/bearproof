#!/usr/bin/env node
/**
 * The BEARPROOF trailer, rendered from code and live data.
 *
 *   node scripts/trailer/index.mjs [--aspect 16x9,9x16] [--out content/x/video/trailer] [--work <dir>]
 *                                  [--skip-capture] [--reuse-data] [--evergreen]
 *
 * --evergreen: the closing "BUILD #n SHIPS AT 00:00 UTC" becomes "EVERY NIGHT / A NEW BUILD AT 00:00 UTC", for a
 * video that stays up for days (a pinned post).
 *
 * 1. snapshot the live API and git (data.mjs): every number on screen comes from here
 * 2. film every shipped build on a virtual clock (capture.mjs, shots.mjs), 60 fps, frame-exact
 * 3. compose the picture (composer/: scenes on a 120 BPM timeline) and synthesise the soundtrack from the same
 *    timeline (composer/music.js), then encode and mux with ffmpeg
 *
 * Needs ffmpeg on PATH and a built dist/ (npm run build). Nothing is written to production: the builds run
 * against a local mock of the API, and the data snapshot is read-only.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshot } from './data.mjs';
import { capture } from './capture.mjs';
import { renderAudio, renderVideo } from './render.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const flag = (k) => args.includes(k);

const aspects = opt('--aspect', '16x9,9x16').split(',');
const work = path.resolve(opt('--work', path.join(os.tmpdir(), 'bearproof-trailer')));
const out = path.resolve(ROOT, opt('--out', 'content/x/video/trailer'));
fs.mkdirSync(work, { recursive: true });
fs.mkdirSync(out, { recursive: true });
const t0 = Date.now();
const log = (s) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s] ${s}`);

// 1. data
const dataFile = path.join(work, 'data.json');
let data;
if (flag('--reuse-data') && fs.existsSync(dataFile)) {
    data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    log(`data: reusing the snapshot from ${data.fetchedAt}`);
} else {
    data = await snapshot(ROOT);
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
    log(
        `data: day ${data.day}, build #${data.liveBuild.n}, ${data.ledger.feeClaims} fee claims, ${data.ledger.prizes.length} prizes`
    );
}
data.evergreen = flag('--evergreen');
if (!fs.existsSync(path.join(ROOT, 'dist/b', String(data.liveBuild.n)))) {
    log('dist/ is missing the live build: npm run build');
    execFileSync('node', ['scripts/build.mjs'], { cwd: ROOT, stdio: 'inherit' });
}

// 2. footage
if (!flag('--skip-capture')) {
    log(`capture: ${aspects.join(', ')}`);
    await capture({ work, data, aspects, log });
}

// 3. sound (one soundtrack for every aspect), loudness-normalised for social: -14 LUFS, -1.5 dBTP
log('music: synthesising');
const tag = aspects.join('_');
const raw = await renderAudio({ work, data, out: path.join(work, `music-${tag}.wav`) });
const probe = JSON.parse(
    /\{[\s\S]*\}/.exec(
        execFileSync(
            'sh',
            [
                '-c',
                `ffmpeg -hide_banner -nostats -i "${raw}" -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null - 2>&1`
            ],
            { encoding: 'utf8' }
        )
    )[0]
);
const music = path.join(work, `music-${tag}-norm.wav`);
execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-i',
    raw,
    '-af',
    `loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${probe.input_i}:measured_TP=${probe.input_tp}:measured_LRA=${probe.input_lra}:measured_thresh=${probe.input_thresh}:offset=${probe.target_offset}:linear=true`,
    '-ar',
    '48000',
    music
]);
log(`music: ${probe.input_i} LUFS → -14 LUFS`);

// 4. picture, then mux
for (const aspect of aspects) {
    log(`video: ${aspect}`);
    const silent = path.join(work, `video-${aspect}.mp4`);
    await renderVideo({ work, data, aspect, out: silent, log });
    const final = path.join(out, `bearproof-trailer-${aspect}.mp4`);
    execFileSync('ffmpeg', [
        '-y',
        '-loglevel',
        'error',
        '-i',
        silent,
        '-i',
        music,
        '-map',
        '0:v',
        '-map',
        '1:a',
        '-c:v',
        'copy',
        '-c:a',
        'aac',
        '-b:a',
        '256k',
        '-shortest',
        '-movflags',
        '+faststart',
        final
    ]);
    // a poster frame from the end card
    execFileSync('ffmpeg', [
        '-y',
        '-loglevel',
        'error',
        '-ss',
        '61.5',
        '-i',
        final,
        '-frames:v',
        '1',
        '-q:v',
        '2',
        final.replace(/\.mp4$/, '.jpg')
    ]);
    log(`done: ${path.relative(ROOT, final)} (${(fs.statSync(final).size / 1e6).toFixed(1)} MB)`);
}
