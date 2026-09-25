/**
 * Share card for one run (1200×630 PNG): the BEARPROOF wordmark, the score, how long the bull survived, the
 * build that produced it and whether the server replay verified it. Pixel art in the game's own palette and
 * with the game's own bull sprite. Player names are never drawn (they are free text).
 */

import { PAL, color } from '../../../game/src/art/palette.js';
import { SPRITES } from '../../../game/src/art/sprites.js';
import { Raster } from './png.js';
import { measure, text } from './font.js';

export const CARD_W = 1200;
export const CARD_H = 630;

// Plain comma grouping (toLocaleString would spin up ICU on a cold isolate).
const fmtNum = (n) =>
    String(Math.max(0, Math.floor(Number(n) || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
function fmtTime(ms) {
    const s = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; // as in the game
}

/** Deterministic 0..1 values from the run id, so a run's chart is always the same. */
function noise(seed) {
    let h = 2166136261;
    for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return () => {
        h = Math.imul(h ^ (h >>> 15), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        h ^= h >>> 16;
        return (h >>> 0) / 4294967296;
    };
}

function sprite(r, s, x, y, scale) {
    const frame = s.frames[0];
    for (let sy = 0; sy < frame.length; sy++) {
        for (let sx = 0; sx < frame[sy].length; sx++) {
            const ch = frame[sy][sx];
            if (ch === '.') continue;
            r.rect(x + sx * scale, y + sy * scale, scale, scale, color(s.colors[ch] || ch));
        }
    }
}

export const STATUS_LINE = {
    verified: ['✓ VERIFIED BY SERVER REPLAY', PAL.gold],
    pending: ['REPLAY CHECK PENDING', PAL.muted],
    rejected: ['DID NOT REPLAY: NOT RANKED', PAL.bear],
    unverifiable: ['NOT VERIFIABLE', PAL.muted]
};

export function statusLine(run) {
    return STATUS_LINE[run.status] || STATUS_LINE.pending;
}

export function headline(run) {
    return run.won
        ? `ENDED THE BEAR MARKET IN ${fmtTime(run.timeMs)}`
        : `SURVIVED ${fmtTime(run.timeMs)} OF THE BEAR MARKET`;
}

export function drawCard(run) {
    const r = new Raster(CARD_W, CARD_H, PAL.ink);
    const rnd = noise(run.id || 'bearproof');

    r.grid(40, '#10151B');

    // a dim bear-market ticker strip above the footer, bouncing at the end
    let level = 500;
    for (let i = 0; i < 30; i++) {
        const up = i > 24 ? rnd() < 0.8 : rnd() < 0.3;
        const body = 6 + Math.floor(rnd() * 18);
        const top = up ? level - body : level;
        const x = 12 + i * 40;
        const hue = up ? PAL.bullDeep : PAL.bearDeep;
        r.rect(x + 7, top - 6, 2, body + 12, hue);
        r.rect(x, top, 16, body, hue);
        level = Math.min(534, Math.max(500, up ? level - body : level + body));
    }

    const X = 64;
    // wordmark with a drop shadow, like the banner
    text(r, 'BEARPROOF', X, 64 + 8, 8, PAL.bullDeep);
    text(r, 'BEARPROOF', X, 64, 8, PAL.bull);

    const where =
        run.mode === 'daily' && run.challengeDate
            ? `DAILY ${run.challengeDate} · BUILD #${run.build}`
            : `FREE RUN · BUILD #${run.build}`;
    text(r, run.day ? `${where} · DAY ${run.day}` : where, X, 148, 3, PAL.muted);

    text(r, 'SCORE', X, 218, 3, PAL.muted);
    const score = fmtNum(run.score);
    let scale = 13;
    while (scale > 6 && measure(score, scale) > 700) scale--;
    text(r, score, X, 248, scale, PAL.text);

    text(r, headline(run), X, 372, 4, PAL.bull);
    text(r, `${fmtNum(run.kills)} BEARS · LV ${fmtNum(run.level)}`, X, 420, 3, PAL.grey);
    const [line, hue] = statusLine(run);
    text(r, line, X, 462, 3, hue);

    // the run's character (the bull, or whoever they picked), big, on the right
    const hero = SPRITES[run.character] || SPRITES.bull;
    const bs = 8;
    sprite(r, hero, CARD_W - 40 - hero.w * bs, 130, bs);

    // footer watermark
    r.rect(0, CARD_H - 72, CARD_W, 72, PAL.panel);
    r.rect(0, CARD_H - 72, CARD_W, 2, PAL.grid);
    text(r, 'ARE YOU BEARPROOF?', X, CARD_H - 47, 3, PAL.bull);
    const right = `BUILD #${run.build} BY THE AI · BEARPROOF.APP`;
    text(r, right, CARD_W - 64 - measure(right, 3), CARD_H - 47, 3, PAL.text);
    return r;
}
