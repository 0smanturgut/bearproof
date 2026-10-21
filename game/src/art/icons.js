// Weapon and passive icons (16×16 with the padding), drawn with the pixel-art engine (art/pixel.js).
// Each one says what the upgrade does at a glance.

import { PixelSprite } from './pixel.js';
import { C, M } from './materials.js';

const S = () => new PixelSprite(14, 14);

// ---------------------------------------------------------------- weapons

export function horns() {
    const s = S();
    s.auto('h', { R: 1.4, grad: 0.3 });
    s.capsule(4, 12, 2.5, 7, 1.6, 1.3, M.horn, { g: 'h' });
    s.capsule(2.5, 7, 3.5, 2, 1.3, 0.6, M.horn, { g: 'h' });
    s.capsule(10, 12, 11.5, 7, 1.6, 1.3, M.horn, { g: 'h' });
    s.capsule(11.5, 7, 10.5, 2, 1.3, 0.6, M.horn, { g: 'h' });
    s.box(3, 11, 8, 3, M.bull, { r: 1, bevel: 1 });
    return s.render();
}

/** Tongue Lash: a frog's mouth corner, a pink tongue shooting up-right through two red candles. */
export function tongue() {
    const s = S();
    s.auto('m', { R: 1.6, grad: 0.3 });
    s.ellipse(3.2, 11, 3.4, 2.8, M.frog, { g: 'm' });
    s.circle(2.6, 8, 1.8, M.frog, { g: 'm' });
    s.px(2, 8, C.eyeWhite).px(3, 8, C.pupil);
    s.line(1, 12, 5.5, 10.8, M.lip, { lum: 0.4, w: 1 });
    s.line(6.8, 5.5, 6.8, 10.5, M.bearDark, { w: 0.8 });
    s.box(5.8, 6.3, 2.2, 3.6, M.bear, { r: 0.5, bevel: 0.8 });
    s.line(9.8, 2.5, 9.8, 7.5, M.bearDark, { w: 0.8 });
    s.box(8.8, 3.2, 2.2, 3.6, M.bear, { r: 0.5, bevel: 0.8 });
    s.capsule(5, 10.5, 11.5, 3.5, 0.55, 0.65, M.tongue, { shade: 'flat', lum: 0.6 });
    s.circle(12, 3, 1.6, M.tongue, { bias: 0.1 });
    s.px(11, 2, '#FFD8E4');
    return s.render();
}

/** Honey Trap: a jar of honey with a cloth lid, standing in the puddle it spilled. */
export function honeyTrap() {
    const s = S();
    s.ellipse(7, 12, 6.6, 1.8, M.gold, { shade: 'flat', lum: 0.6 });
    s.px(2, 12, '#FFE08A').px(11, 11, '#FFE08A');
    s.box(4.5, 2.5, 5, 2.5, M.gold, { r: 0.5, lum: 0.55 });
    s.ellipse(7, 8, 4.8, 4, M.gold);
    s.box(2.5, 7.5, 9, 2, M.horn, { shade: 'flat', lum: 0.75 });
    s.box(3.5, 0.5, 7, 2.4, M.burlap, { r: 0.8, bevel: 1 });
    s.line(4, 2.6, 10, 2.6, M.wood, { shade: 'flat', lum: 0.2, w: 0.8 });
    s.line(8.5, 3, 8.5, 5, M.gold, { shade: 'flat', lum: 0.9, w: 1 });
    s.px(3, 5, '#FFFFFF');
    return s.render();
}

/** Bear Spray: an orange can with a black cap, a pepper cloud puffing out of the nozzle up and to the right. */
export function bearSpray() {
    const s = S();
    // the cloud first, so the can sits on top of its root
    s.auto('p', { R: 1.2, grad: 0.25 });
    s.circle(8.6, 4.2, 1.4, M.pepper, { g: 'p' });
    s.circle(10.8, 2.8, 2.1, M.pepper, { g: 'p' });
    s.circle(11.2, 6.4, 1.9, M.pepper, { g: 'p' });
    s.circle(12.6, 4.5, 1.4, M.pepper, { g: 'p' });
    s.px(13, 1, '#FFB05C').px(13, 9, '#FFB05C').px(9, 8, '#FFB05C');
    s.px(10, 2, '#FFE2B8');
    s.auto('c', { R: 1.4, grad: 0.3 });
    s.box(1.5, 5.5, 5, 8, M.pepper, { g: 'c', r: 1, bevel: 1 });
    s.box(1.5, 8, 5, 2.5, M.cloth, { shade: 'flat', lum: 0.15 });
    s.px(3, 9, '#FFE2B8').px(4, 9, '#FFE2B8');
    s.box(2.5, 3, 3, 2.5, M.cloth, { r: 0.5, bevel: 1 });
    s.box(5, 3.5, 2, 1.2, M.metal, { shade: 'flat', lum: 0.7 });
    s.px(2, 6, '#FFFFFF');
    return s.render();
}

export function greenCandle() {
    const s = S();
    s.line(7, 0.5, 7, 3, M.bull, { lum: 0.7, w: 1.2 });
    s.line(7, 11, 7, 13.5, M.bull, { lum: 0.7, w: 1.2 });
    s.box(4, 2.5, 6, 9, M.bull, { r: 1, bevel: 2 });
    s.px(5, 3.5, '#FFFFFF');
    s.patch(9, 1, ['Y.', 'YY'], { Y: '#D8FFD0' });
    return s.render();
}

export function laserEyes() {
    const s = S();
    // two beams first, so the eyes sit on top
    s.poly(
        [
            [4, 4],
            [13.5, 0.5],
            [13.5, 5]
        ],
        M.bear,
        { lum: 0.75, glow: C.red, bare: true }
    );
    s.poly(
        [
            [4, 9],
            [13.5, 8.5],
            [13.5, 13]
        ],
        M.bear,
        { lum: 0.75, glow: C.red, bare: true }
    );
    s.line(4, 4, 13.5, 2.5, M.bear, { lum: 1, glow: '#FFFFFF' });
    s.line(4, 9, 13.5, 11, M.bear, { lum: 1, glow: '#FFFFFF' });
    for (const y of [4, 9]) {
        s.circle(3.5, y, 2.6, M.cloth, { shade: 'flat', lum: 0.2 });
        s.circle(3.5, y, 1.5, M.bear, { shade: 'flat', lum: 0.95, glow: C.red });
        s.px(3, y - 1, '#FFFFFF');
    }
    return s.render();
}

export function diamondHands() {
    const s = S();
    s.poly(
        [
            [7, 1],
            [12.5, 5],
            [7, 11]
        ],
        M.diamond,
        { lum: 0.55 }
    );
    s.poly(
        [
            [7, 1],
            [1.5, 5],
            [7, 11]
        ],
        M.diamond,
        { lum: 0.85 }
    );
    s.poly(
        [
            [3.5, 3],
            [10.5, 3],
            [12.5, 5],
            [1.5, 5]
        ],
        M.diamond,
        { lum: 1 }
    );
    s.box(1, 10, 4, 3.5, M.skin, { r: 1, bevel: 1 });
    s.box(9, 10, 4, 3.5, M.skin, { r: 1, bevel: 1 });
    s.px(4, 2, '#FFFFFF');
    return s.render();
}

export function airdropIcon() {
    const s = S();
    s.ellipse(7, 4, 6.5, 4, M.paper, { g: 'c' });
    s.auto('c', { R: 1.6, grad: 0.3 });
    s.cutBox(0, 4, 14, 5);
    s.pxs(
        [
            [2, 1],
            [3, 1],
            [10, 1],
            [11, 1]
        ],
        C.red
    );
    s.line(1, 4, 4, 8, M.paper, { lum: 0.5 });
    s.line(13, 4, 10, 8, M.paper, { lum: 0.5 });
    s.box(3.5, 8, 7, 5.5, M.wood, { r: 0.5, bevel: 1.5 });
    s.box(3.5, 10, 7, 1.4, M.gold, { shade: 'flat', lum: 0.75 });
    return s.render();
}

export function limitOrderIcon() {
    const s = S();
    s.poly(
        [
            [3.5, 2],
            [13, 2],
            [13, 12],
            [3.5, 12],
            [0.5, 7]
        ],
        M.gold,
        { left: 0.95, right: 0.55 }
    );
    s.circle(3.5, 7, 1, M.cloth, { shade: 'flat', lum: 0.1 });
    s.patch(6, 3, ['..X..', '.XXX.', 'X.X..', '.XXX.', '..X.X', '.XXX.', '..X..'], {
        X: '#3A2200'
    });
    return s.render();
}

export function hopium() {
    const s = S();
    s.auto('g', { R: 2, grad: 0.35 });
    for (const [x, y, r] of [
        [5, 8, 3.6],
        [9, 7, 3.8],
        [7, 10, 3.4],
        [7, 5, 3]
    ])
        s.circle(x, y, r, M.bull, { g: 'g', bias: 0.05 });
    s.pxs(
        [
            [2, 2],
            [11, 1],
            [12, 12]
        ],
        '#D8FFD0',
        { glow: '#16E08A' }
    );
    s.px(6, 7, '#06261F').px(9, 7, '#06261F').patch(6, 9, ['X..X', '.XX.'], { X: '#06261F' });
    return s.render();
}

export function circuitBreaker() {
    const s = S();
    s.circle(7, 7, 6.4, M.ice, { g: 'r' });
    s.auto('r', { R: 2, grad: 0.3 });
    s.circle(7, 7, 4.4, M.cloth, { shade: 'flat', lum: 0.1 });
    s.patch(
        5,
        2,
        ['..YY', '.YY.', 'YYYY', '..YY', '.YY.', 'YY..', 'Y...'],
        { Y: '#E8FAFF' },
        { glow: '#46B8F0' }
    );
    return s.render();
}

/** Buy Wall: a ring of green bid bars rolling out from a deep-blue centre, the order book as a wave. */
export function buyWall() {
    const s = S();
    s.auto('c', { R: 1.4, grad: 0.3 });
    s.circle(7, 7, 2.6, M.whale, { g: 'c', bias: 0.1 });
    for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + 0.3;
        const x = 7 + Math.cos(a) * 5.4;
        const y = 7 + Math.sin(a) * 5.4;
        const tall = i % 2 ? 1.6 : 2.4;
        s.box(x - 0.8, y - tall / 2, 1.6, tall, M.bull, { shade: 'flat', lum: i % 2 ? 0.6 : 0.85 });
    }
    s.pxs(
        [
            [7, 1],
            [7, 12]
        ],
        '#D8FFD0',
        { glow: '#16E08A' }
    );
    s.px(7, 7, '#A6D2FF');
    return s.render();
}

/** A pickaxe on the diagonal: handle from the bottom left, the curved head across the top right. */
function drawPick(s, head, edge, glow) {
    s.capsule(1.5, 13, 9.5, 5, 1, 0.9, M.pickHandle);
    s.pxs(
        [
            [2, 11],
            [3, 10]
        ],
        '#2A160A'
    );
    s.auto('h', { R: 1.2, grad: 0.3 });
    // both arms curve down towards the handle, mirrored across it (the line x + y = 14.5)
    s.capsule(9.5, 5, 6.5, 2, 1.5, 1.1, head, { g: 'h' });
    s.capsule(6.5, 2, 3.5, 2.2, 1.1, 0.5, head, { g: 'h' });
    s.capsule(9.5, 5, 12.5, 8, 1.5, 1.1, head, { g: 'h', bias: -0.08 });
    s.capsule(12.5, 8, 12.3, 11, 1.1, 0.5, head, { g: 'h', bias: -0.08 });
    const o = glow ? { glow } : undefined;
    s.pxs(
        [
            [3, 2],
            [6, 1],
            [7, 1]
        ],
        edge,
        o
    );
    s.px(12, 11, edge, o);
    s.px(9, 4, head.ramp[5]);
}

/** Pickaxe: the Miner's swing, an iron head with bright tips on an ash handle. */
export function pickaxe() {
    const s = S();
    drawPick(s, M.pickIron, '#FFFFFF');
    return s.render();
}

/** Diamond Pickaxe (evolved): the same pick with a cyan diamond head that sparkles. */
export function diamondPickaxe() {
    const s = S();
    drawPick(s, M.diamond, '#FFFFFF', '#6FD8FF');
    s.patch(11, 0, ['.W.', 'WWW', '.W.'], { W: '#E8FAFF' }, { glow: '#6FD8FF' });
    s.px(1, 6, '#C4F2FF', { glow: '#6FD8FF' });
    return s.render();
}

/** Block Reward: a gold block, its shaded face stamped with a glowing hash, a sparkle off the corner. */
export function blockReward() {
    const s = S();
    s.poly(
        [
            [7, 1.5],
            [12.5, 4.5],
            [7, 7.5],
            [1.5, 4.5]
        ],
        M.gold,
        { lum: 0.8 }
    );
    s.poly(
        [
            [1.5, 4.5],
            [7, 7.5],
            [7, 13.5],
            [1.5, 10.5]
        ],
        M.gold,
        { lum: 0.45 }
    );
    s.poly(
        [
            [7, 7.5],
            [12.5, 4.5],
            [12.5, 10.5],
            [7, 13.5]
        ],
        M.pepper,
        { lum: 0.55 }
    );
    for (let y = 8; y <= 12; y++) s.px(7, y, '#FFE08A');
    s.patch(
        2,
        7,
        ['.X.X.', 'XXXXX', '.X.X.', 'XXXXX', '.X.X.'],
        { X: '#FFF6D6' },
        { glow: '#FFC53D' }
    );
    s.patch(11, 0, ['.W.', 'WWW', '.W.'], { W: '#FFFFFF' }, { glow: '#FFC53D' });
    return s.render();
}

export function buyback() {
    const s = S();
    s.auto('a', { R: 1.2, grad: 0.2 });
    for (let a = 0.3; a < 5.4; a += 0.18)
        s.circle(7 + Math.cos(a) * 5, 7 + Math.sin(a) * 5, 1.3, M.bull, { g: 'a' });
    s.poly(
        [
            [11, 1],
            [13.5, 4.5],
            [9, 4.5]
        ],
        M.bull,
        { lum: 0.8 }
    );
    s.patch(5, 4, ['.XX.', 'X...', '.XX.', '...X', 'XXX.', '.X..'], { X: '#FFC53D' });
    return s.render();
}

export function deadCatBounce() {
    const s = S();
    for (let i = 0; i < 7; i++)
        s.px(0.5 + i * 2.1, 13 - Math.round(Math.sin((i / 6) * Math.PI) * 4), '#A3ACB8');
    s.auto('c', { R: 1.6, grad: 0.3 });
    s.circle(7, 6.5, 4.2, M.metal, { g: 'c', bias: 0.25 });
    s.poly(
        [
            [3, 4.5],
            [3.5, 0.5],
            [6, 3]
        ],
        M.metal,
        { lum: 0.85 }
    );
    s.poly(
        [
            [8, 3],
            [10.5, 0.5],
            [11, 4.5]
        ],
        M.metal,
        { lum: 0.7 }
    );
    s.patch(4, 5, ['X.X...X.X', '.X.....X.', 'X.X...X.X'], { X: '#14181E' });
    s.px(7, 8, '#FF7E86');
    return s.render();
}

// ---------------------------------------------------------------- evolutions
// Each evolved weapon keeps its base icon's subject, made bigger, doubled or fanned out, with a gold or cyan
// "evolved" accent that blooms (glow).

const GOLD_GLOW = '#FFC53D';
const CYAN_GLOW = '#6FD8FF';

/** Stampede: four horns swept round in a full circle about a glowing gold hub, a motion ring outside. */
export function evoHorns() {
    const s = S();
    // the motion ring: dashes between the horns
    for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 1.2;
        s.px(7 + Math.cos(a) * 6.2 - 0.5, 7 + Math.sin(a) * 6.2 - 0.5, '#FFE08A', {
            glow: GOLD_GLOW
        });
    }
    s.auto('h', { R: 1.3, grad: 0.3 });
    for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 - 0.3;
        const at = (da, r) => [7 + Math.cos(a + da) * r, 7 + Math.sin(a + da) * r];
        const [x0, y0] = at(0, 2.2);
        const [x1, y1] = at(0.45, 4.6);
        const [x2, y2] = at(1.05, 6);
        s.capsule(x0, y0, x1, y1, 1.5, 1.2, M.horn, { g: 'h' });
        s.capsule(x1, y1, x2, y2, 1.2, 0.5, M.horn, { g: 'h' });
    }
    s.circle(7, 7, 2.4, M.bull, { bias: 0.1 });
    s.patch(6, 6, ['.Y.', 'YYY', '.Y.'], { Y: '#FFE08A' }, { glow: GOLD_GLOW });
    s.px(7, 7, '#FFFFFF', { glow: GOLD_GLOW });
    return s.render();
}

/** God Candle: one huge glowing green candle, a gold crown of light on its wick, two small candles beside it. */
export function evoGreenCandle() {
    const s = S();
    for (const x of [1.5, 12.5]) {
        s.line(x, 5, x, 13, M.bull, { lum: 0.5, w: 1 });
        s.box(x - 1.3, 6.5, 2.6, 5, M.bull, { r: 0.5, bevel: 1, bias: -0.08 });
    }
    s.line(7, 0, 7, 2.5, M.bull, { lum: 0.95, w: 1.2, glow: C.green });
    s.line(7, 12, 7, 14, M.bull, { lum: 0.7, w: 1.2 });
    s.box(3.8, 2, 6.4, 10.5, M.bull, { r: 1, bevel: 2, bias: 0.08 });
    s.line(5.3, 3.5, 5.3, 10.5, M.bull, { lum: 1, w: 1, glow: C.green });
    s.px(5, 3, '#FFFFFF', { glow: C.green });
    s.pxs(
        [
            [5, 0],
            [8, 0]
        ],
        '#FFE08A',
        { glow: GOLD_GLOW }
    );
    s.px(1, 3, '#D8FFD0', { glow: C.green }).px(12, 2, '#FFE08A', { glow: GOLD_GLOW });
    return s.render();
}

/** Full Send: one blazing eye firing a fan of five beams, red on the outside, gold through the middle. */
export function evoLaserEyes() {
    const s = S();
    const beams = [
        [0.5, M.bear, C.red],
        [3.5, M.gold, GOLD_GLOW],
        [7, M.gold, '#FFFFFF'],
        [10.5, M.gold, GOLD_GLOW],
        [13.5, M.bear, C.red]
    ];
    for (const [y, m, glow] of beams)
        s.line(4.5, 7, 13.5, y, m, { lum: 0.9, w: 1.3, glow, bare: true });
    s.line(4.5, 7, 13.5, 7, M.gold, { lum: 1, w: 0.8, glow: '#FFFFFF' });
    s.circle(3.5, 7, 3.4, M.cloth, { shade: 'flat', lum: 0.2 });
    s.circle(3.5, 7, 2.2, M.bear, { shade: 'flat', lum: 0.95, glow: C.red });
    s.circle(3.5, 7, 1, M.gold, { shade: 'flat', lum: 0.95, glow: GOLD_GLOW });
    s.px(2, 5, '#FFFFFF');
    return s.render();
}

/** One cut diamond centred on (cx, cy), `r` px from centre to each point. */
function smallDiamond(s, cx, cy, r, glow) {
    const o = glow ? { glow } : {};
    s.poly(
        [
            [cx, cy - r],
            [cx + r, cy - r * 0.2],
            [cx, cy + r]
        ],
        M.diamond,
        { lum: 0.6 }
    );
    s.poly(
        [
            [cx, cy - r],
            [cx - r, cy - r * 0.2],
            [cx, cy + r]
        ],
        M.diamond,
        { lum: 0.9 }
    );
    s.px(cx - 1, cy - r * 0.5, '#FFFFFF', o);
}

/** Unbreakable: four bright diamonds orbiting a glowing core on a cyan ring. */
export function evoDiamondHands() {
    const s = S();
    for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + 0.26;
        s.px(7 + Math.cos(a) * 4.6 - 0.5, 7 + Math.sin(a) * 4.6 - 0.5, '#27A6E8', {
            glow: CYAN_GLOW
        });
    }
    for (const [x, y] of [
        [7, 2.6],
        [11.4, 7],
        [7, 11.4],
        [2.6, 7]
    ])
        smallDiamond(s, x, y, 2.6, CYAN_GLOW);
    s.patch(6, 6, ['.W.', 'WWW', '.W.'], { W: '#E8FAFF' }, { glow: CYAN_GLOW });
    s.px(7, 7, '#FFFFFF', { glow: CYAN_GLOW });
    s.patch(11, 0, ['.Y.', 'YYY', '.Y.'], { Y: '#FFE08A' }, { glow: GOLD_GLOW });
    return s.render();
}

/** Carpet Drop: three crates under three parachutes, falling in a row; the middle one leads, banded in gold. */
export function evoAirdrop() {
    const s = S();
    for (const [cx, top, lead] of [
        [2.3, 3, false],
        [11.7, 3, false],
        [7, 0, true]
    ]) {
        s.ellipse(cx, top + 2, 2.4, 2, M.paper, { bias: lead ? 0.1 : -0.05 });
        s.cutBox(Math.floor(cx - 3), top + 2, 6, 3);
        s.px(cx - 0.5, top + 0.5, lead ? '#FFE08A' : C.red, lead ? { glow: GOLD_GLOW } : {});
        s.line(cx - 2, top + 2, cx - 1, top + 5, M.paper, { lum: 0.45 });
        s.line(cx + 2, top + 2, cx + 1, top + 5, M.paper, { lum: 0.45 });
        s.box(cx - 1.75, top + 5, 3.5, 3.5, M.wood, { r: 0.4, bevel: 1, bias: lead ? 0.1 : 0 });
        s.box(cx - 1.75, top + 6.2, 3.5, 1, M.gold, {
            shade: 'flat',
            lum: lead ? 0.95 : 0.7,
            ...(lead ? { glow: GOLD_GLOW } : {})
        });
    }
    s.pxs(
        [
            [2, 12],
            [12, 13],
            [7, 11]
        ],
        '#C4F2FF',
        { glow: CYAN_GLOW }
    );
    return s.render();
}

/** Iceberg Order: a gold price tag sitting on the small tip of a pale-blue iceberg, most of it under the waterline. */
export function evoLimitOrder() {
    const s = S();
    s.poly(
        [
            [2.5, 9.5],
            [12, 9.5],
            [13.5, 11.5],
            [9.5, 14],
            [4.5, 14],
            [0.5, 11.5]
        ],
        M.ice,
        { top: 0.75, bot: 0.35 }
    );
    s.poly(
        [
            [3.5, 9.5],
            [6.5, 5.5],
            [8.5, 6.5],
            [11, 9.5]
        ],
        M.snow,
        { left: 1, right: 0.65 }
    );
    for (let x = 0; x < 14; x += 2) s.px(x, 9, '#E8FAFF', { glow: C.ice });
    s.poly(
        [
            [4, 0.5],
            [13, 0.5],
            [13, 6],
            [4, 6],
            [1.5, 3.25]
        ],
        M.gold,
        { left: 0.95, right: 0.6 }
    );
    s.px(3, 3, '#221400');
    s.pxs(
        [
            [6, 2],
            [7, 2],
            [8, 2],
            [9, 2],
            [10, 2],
            [6, 4],
            [7, 4],
            [8, 4]
        ],
        '#3A2200'
    );
    s.px(12, 1, '#FFFFFF', { glow: GOLD_GLOW });
    return s.render();
}

/** Copium: the hopium cloud gone cold and cyan, a flat mouth, slow drips falling off it. */
export function evoHopium() {
    const s = S();
    s.auto('g', { R: 2, grad: 0.35 });
    for (const [x, y, r] of [
        [4.5, 5.5, 3.2],
        [9.5, 5, 3.4],
        [7, 7.2, 3],
        [7, 3.2, 2.8]
    ])
        s.circle(x, y, r, M.ice, { g: 'g', bias: 0.05 });
    // slow drips
    s.line(3.5, 8, 3.5, 11, M.ice, { lum: 0.7, w: 1 });
    s.circle(3.5, 12.2, 1.2, M.ice, { shade: 'flat', lum: 0.85, glow: C.ice });
    s.line(10.5, 8.5, 10.5, 10, M.ice, { lum: 0.7, w: 1 });
    s.circle(10.5, 11.2, 1.1, M.ice, { shade: 'flat', lum: 0.85, glow: C.ice });
    s.px(7, 13, '#E8FAFF', { glow: C.ice });
    s.px(5, 5, '#061A2E').px(9, 5, '#061A2E');
    s.patch(5, 7, ['XXXXX'], { X: '#061A2E' });
    s.pxs(
        [
            [1, 1],
            [12, 1]
        ],
        '#E8FAFF',
        { glow: CYAN_GLOW }
    );
    return s.render();
}

/** Market Halt: the breaker's bolt, now gold, inside two concentric cyan shockwave rings. */
export function evoCircuitBreaker() {
    const s = S();
    s.circle(7, 7, 7, M.ice, { shade: 'flat', lum: 0.8, glow: C.ice });
    s.cutEllipse(7, 7, 6, 6);
    s.circle(7, 7, 4.9, M.ice, { g: 'r' });
    s.auto('r', { R: 1.5, grad: 0.3 });
    s.circle(7, 7, 3.6, M.cloth, { shade: 'flat', lum: 0.1 });
    s.patch(
        5,
        4,
        ['..YY', '.YY.', 'YYYY', '.YY.', 'YY..', 'Y...'],
        { Y: '#FFE08A' },
        { glow: GOLD_GLOW }
    );
    return s.render();
}

/** Treasury Buyback: two green drain beams pouring into a glowing gold heart, the vault being refilled. */
export function evoBuyback() {
    const s = S();
    s.auto('a', { R: 1, grad: 0.2 });
    for (let t = 0; t <= 1.001; t += 0.1) {
        const y = 0.8 + t * 6;
        const dx = 5.6 - Math.sin(t * Math.PI * 0.5) * 2.6;
        s.circle(7 - dx, y, 1.1, M.bull, { g: 'a' });
        s.circle(7 + dx, y, 1.1, M.bull, { g: 'a' });
    }
    s.pxs(
        [
            [1, 1],
            [12, 1],
            [2, 4],
            [11, 4]
        ],
        '#D8FFD0',
        { glow: C.green }
    );
    s.auto('v', { R: 1.6, grad: 0.3 });
    s.circle(5, 7.6, 2.6, M.gold, { g: 'v' });
    s.circle(9, 7.6, 2.6, M.gold, { g: 'v' });
    s.poly(
        [
            [2.4, 8.4],
            [11.6, 8.4],
            [7, 13.5]
        ],
        M.gold,
        { g: 'v' }
    );
    s.patch(5, 7, ['.XX.', 'XXXX', '.XX.', '.XX.'], { X: '#7A4B00' });
    s.px(4, 6, '#FFFFFF', { glow: GOLD_GLOW }).px(7, 12, '#FFE08A', { glow: GOLD_GLOW });
    return s.render();
}

/** Double Bounce: the dead cat at the top of its second bounce, the gold trail of both hops beneath it. */
export function evoDeadCatBounce() {
    const s = S();
    for (let i = 0; i <= 12; i++) {
        const x = 0.5 + i;
        const hop =
            i <= 6 ? Math.sin((i / 6) * Math.PI) * 2.5 : Math.sin(((i - 6) / 6) * Math.PI) * 4;
        s.px(x, 13 - Math.round(hop), i % 2 ? '#FFC53D' : '#FFE08A', { glow: GOLD_GLOW });
    }
    s.auto('c', { R: 1.5, grad: 0.3 });
    s.circle(8.5, 5, 3.6, M.metal, { g: 'c', bias: 0.25 });
    s.poly(
        [
            [5.2, 3.5],
            [5.5, 0],
            [7.6, 2]
        ],
        M.metal,
        { lum: 0.85 }
    );
    s.poly(
        [
            [9.4, 2],
            [11.5, 0],
            [11.8, 3.5]
        ],
        M.metal,
        { lum: 0.7 }
    );
    s.patch(6, 4, ['X.XX.X', '.X..X.', 'X.XX.X'], { X: '#14181E' });
    s.px(8, 7, '#FF7E86');
    // the first, smaller cat ghost at the top of the first hop
    s.circle(2.6, 8.4, 1.6, M.metal, { shade: 'flat', lum: 0.35 });
    s.pxs(
        [
            [1, 6],
            [3, 6]
        ],
        '#6E7A88'
    );
    return s.render();
}

/** Liquidity Grab: the frog lashes three pink tongues at once, fanned out, each tip glinting gold. */
export function evoTongue() {
    const s = S();
    s.auto('m', { R: 1.6, grad: 0.3 });
    s.ellipse(3, 11.2, 3.2, 2.6, M.frog, { g: 'm' });
    s.circle(2.4, 8.4, 1.7, M.frog, { g: 'm' });
    s.px(2, 8, C.eyeWhite).px(3, 8, C.pupil);
    s.line(1, 12, 5.5, 11, M.lip, { lum: 0.4, w: 1 });
    const tips = [
        [6.5, 1.5],
        [12, 2.5],
        [12.5, 8.5]
    ];
    for (const [x, y] of tips) {
        s.capsule(5, 10.5, x, y, 0.5, 0.6, M.tongue, { shade: 'flat', lum: 0.6 });
        s.circle(x, y, 1.4, M.tongue, { bias: 0.1 });
    }
    for (const [x, y] of tips) s.px(x - 0.5, y - 1, '#FFE08A', { glow: GOLD_GLOW });
    return s.render();
}

/** Max Pain: the spray can blasting a wide red-and-orange cone of pepper, glowing hot. */
export function evoBearSpray() {
    const s = S();
    s.poly(
        [
            [5.5, 4],
            [13.5, -0.5],
            [14, 13]
        ],
        M.bear,
        { left: 0.4, right: 0.75, glow: C.red, bare: true }
    );
    s.auto('p', { R: 1.2, grad: 0.25 });
    for (const [x, y, r] of [
        [9.5, 3.2, 1.5],
        [12, 1.6, 1.6],
        [12.2, 6, 1.8],
        [10, 9.4, 1.5],
        [12.6, 11.2, 1.6]
    ])
        s.circle(x, y, r, M.pepper, { g: 'p' });
    s.pxs(
        [
            [12, 1],
            [12, 6],
            [12, 11]
        ],
        '#FFE2B8',
        { glow: '#FF7A1A' }
    );
    s.pxs(
        [
            [8, 6],
            [13, 8]
        ],
        '#FFE08A',
        { glow: GOLD_GLOW }
    );
    s.auto('c', { R: 1.4, grad: 0.3 });
    s.box(0.5, 5.5, 5, 8, M.pepper, { g: 'c', r: 1, bevel: 1 });
    s.box(0.5, 8, 5, 2.5, M.cloth, { shade: 'flat', lum: 0.15 });
    s.px(2, 9, '#FFE08A', { glow: GOLD_GLOW }).px(3, 9, '#FFE08A', { glow: GOLD_GLOW });
    s.box(1.5, 3, 3, 2.5, M.cloth, { r: 0.5, bevel: 1 });
    s.box(4, 3.5, 2, 1.2, M.metal, { shade: 'flat', lum: 0.7 });
    s.px(1, 6, '#FFFFFF');
    return s.render();
}

/** Honeypot: a clay pot brimming over with honey, drips down its sides into a hot glowing puddle. */
export function evoHoneyTrap() {
    const s = S();
    s.ellipse(7, 12.4, 7, 1.6, M.gold, { shade: 'flat', lum: 0.75, glow: '#FF9A1A' });
    s.auto('p', { R: 1.8, grad: 0.3 });
    s.ellipse(7, 8, 4.6, 4.2, M.wood, { g: 'p' });
    s.box(2.5, 3, 9, 2, M.wood, { g: 'p', r: 0.5 });
    s.ellipse(7, 3, 4.8, 1.7, M.gold, { lum: 0.9, bias: 0.15 });
    s.circle(7, 1.6, 1.6, M.gold, { bias: 0.2 });
    // drips over the rim
    s.line(2.5, 3.5, 2.3, 8.5, M.gold, { lum: 0.75, w: 1.3 });
    s.circle(2.3, 9, 0.9, M.gold, { shade: 'flat', lum: 0.8 });
    s.line(11.5, 3.5, 11.8, 11, M.gold, { lum: 0.7, w: 1.3 });
    s.line(6, 4, 6, 7.5, M.gold, { lum: 0.85, w: 1.2 });
    s.circle(6, 8, 0.8, M.gold, { shade: 'flat', lum: 0.85 });
    s.pxs(
        [
            [1, 12],
            [6, 13],
            [12, 12]
        ],
        '#FFF6D6',
        { glow: '#FF9A1A' }
    );
    s.px(6, 1, '#FFFFFF', { glow: GOLD_GLOW });
    return s.render();
}

/** Tsunami Bid: two rows of green bid bars rising into a wave, cresting with glowing cyan foam. */
export function evoBuyWall() {
    const s = S();
    // the back wall: five 2-px bars rising into a wave, foam glowing on each crest
    const back = [5, 7, 10, 13, 11];
    back.forEach((h, i) => {
        const x = i * 3;
        s.box(x, 14 - h, 2, h, M.bull, { shade: 'flat', lum: 0.4 + i * 0.06 });
        s.pxs(
            [
                [x, 14 - h],
                [x + 1, 14 - h]
            ],
            '#C4F2FF',
            { glow: CYAN_GLOW }
        );
    });
    // the front wall: brighter, shorter bars in the gaps
    [3, 5, 8, 7].forEach((h, i) => {
        const x = 2 + i * 3;
        s.box(x, 14 - h, 1, h, M.bull, {
            shade: 'flat',
            lum: 0.9,
            ...(i === 2 ? { glow: C.green } : {})
        });
    });
    // the curl of the breaking wave
    s.patch(11, 0, ['WW.', '..W'], { W: '#E8FAFF' }, { glow: CYAN_GLOW });
    return s.render();
}

/** Diamond Pickaxe (evolution icon): two cyan diamond picks crossed, bound in gold where the handles cross. */
export function evoPickaxe() {
    const s = S();
    const pick = (mirror) => {
        const X = (x) => (mirror ? 14 - x : x);
        s.capsule(X(1.5), 13, X(10), 4, 0.9, 0.8, M.pickHandle, { bias: mirror ? -0.1 : 0 });
    };
    pick(false);
    pick(true);
    const head = (mirror) => {
        const X = (x) => (mirror ? 14 - x : x);
        const g = mirror ? 'hb' : 'ha';
        s.auto(g, { R: 1.1, grad: 0.3 });
        // a short inner spike (so the two heads don't merge at the top) and a long curved outer blade
        s.capsule(X(10.2), 3.8, X(8.6), 1.3, 1.3, 0.6, M.diamond, { g });
        s.capsule(X(10.2), 3.8, X(12.6), 6, 1.3, 1, M.diamond, { g, bias: -0.08 });
        s.capsule(X(12.6), 6, X(12.4), 8.5, 1, 0.5, M.diamond, { g, bias: -0.08 });
        const P = (x) => (mirror ? 13 - x : x);
        s.px(P(8), 1, '#FFFFFF', { glow: CYAN_GLOW });
        s.px(P(12), 8, '#FFFFFF', { glow: CYAN_GLOW });
        s.px(P(10), 3, '#C4F2FF');
    };
    head(false);
    head(true);
    s.box(5, 7, 4, 2.5, M.gold, { r: 0.5, bevel: 1 });
    s.pxs(
        [
            [6, 7],
            [7, 7]
        ],
        '#FFF6D6',
        { glow: GOLD_GLOW }
    );
    return s.render();
}

// ---------------------------------------------------------------- passives

export function thickSkin() {
    const s = S();
    s.poly(
        [
            [1.5, 1.5],
            [12.5, 1.5],
            [12.5, 7],
            [7, 13],
            [1.5, 7]
        ],
        M.bull,
        { g: 'sh' }
    );
    s.auto('sh', { R: 2.2, grad: 0.35 });
    s.patch(5, 4, ['..X..', '..X..', 'XXXXX', '..X..', '..X..'], { X: '#D8FFD0' });
    return s.render();
}

export function dca() {
    const s = S();
    s.box(1, 2, 12, 11, M.paper, { r: 1, bevel: 1.5 });
    s.box(1, 2, 12, 3, M.bear, { shade: 'flat', lum: 0.6 });
    s.pxs(
        [
            [4, 1],
            [10, 1]
        ],
        '#1F232B'
    );
    for (const [x, h] of [
        [3, 2],
        [6, 4],
        [9, 6]
    ])
        s.box(x, 12 - h, 2, h, M.bull, { shade: 'flat', lum: 0.7 });
    return s.render();
}

export function coldWallet() {
    const s = S();
    s.box(1, 3, 12, 10, M.ice, { r: 1.5, bevel: 2 });
    s.box(9, 6, 4, 4, M.metal, { r: 1, bevel: 1 });
    s.px(10, 7, '#E3E8EE');
    s.patch(
        2,
        5,
        ['.X.X.', 'XXXXX', '.XXX.', 'XXXXX', '.X.X.'],
        { X: '#FFFFFF' },
        { glow: '#9BE2FF' }
    );
    return s.render();
}

export function momentum() {
    const s = S();
    for (const x of [0.5, 4.5, 8.5])
        s.poly(
            [
                [x, 2],
                [x + 3, 2],
                [x + 5.5, 7],
                [x + 3, 12],
                [x, 12],
                [x + 2.5, 7]
            ],
            M.bull,
            {
                left: 0.5 + x * 0.05,
                right: 0.9
            }
        );
    return s.render();
}

export function conviction() {
    const s = S();
    s.line(3, 1, 3, 13.5, M.metal, { lum: 0.7, w: 1.4 });
    s.poly(
        [
            [4, 1.5],
            [13, 3],
            [9.5, 5],
            [13, 7.5],
            [4, 8]
        ],
        M.bull,
        { top: 0.9, bot: 0.55 }
    );
    s.box(1, 12, 5, 2, M.metal, { shade: 'flat', lum: 0.4 });
    return s.render();
}

export function liquidity() {
    const s = S();
    s.ellipse(7, 12, 6.4, 1.8, M.diamond, { shade: 'flat', lum: 0.35 });
    s.circle(7, 8, 3.8, M.diamond, { g: 'd' });
    s.poly(
        [
            [3.6, 7],
            [10.4, 7],
            [7, 0.5]
        ],
        M.diamond,
        { g: 'd' }
    );
    s.auto('d', { R: 2, grad: 0.35 });
    s.px(5, 7, '#FFFFFF');
    return s.render();
}

export function highFrequency() {
    const s = S();
    s.patch(
        3,
        0,
        [
            '....YYY',
            '...YYY.',
            '..YYY..',
            '.YYYYYY',
            'YYYYYY.',
            '...YY..',
            '..YY...',
            '.YY....',
            'YY.....',
            'Y......'
        ],
        { Y: '#FFE08A' },
        { glow: '#FFC53D' }
    );
    s.pxs(
        [
            [1, 3],
            [12, 9],
            [11, 2]
        ],
        '#FFC53D'
    );
    return s.render();
}

export function whaleGravity() {
    const s = S();
    s.auto('w', { R: 2, grad: 0.35 });
    s.ellipse(6.5, 8, 5.5, 3.8, M.diamond, { g: 'w', bias: -0.1 });
    s.poly(
        [
            [11, 7],
            [13.5, 4],
            [13.5, 11]
        ],
        M.diamond,
        { g: 'w', bias: -0.1 }
    );
    s.ellipse(6, 10, 4, 1.6, M.paper, { shade: 'flat', lum: 0.9 });
    s.px(3, 7, C.ink);
    s.pxs(
        [
            [4, 2],
            [5, 1],
            [3, 1],
            [5, 3]
        ],
        '#9BE2FF'
    );
    return s.render();
}

export function compounding() {
    const s = S();
    for (const [x, y] of [
        [3, 10],
        [3, 8],
        [7, 10],
        [7, 8],
        [7, 6],
        [11, 10],
        [11, 8],
        [11, 6],
        [11, 4]
    ])
        s.ellipse(x, y + 1, 2.2, 1.2, M.gold, { shade: 'flat', lum: y % 4 === 0 ? 0.9 : 0.65 });
    s.patch(10, 0, ['.Y.', 'YYY', '.Y.'], { Y: '#16E08A' });
    return s.render();
}

export function alpha() {
    const s = S();
    s.patch(
        1,
        2,
        [
            '..YYY...YY',
            '.YY.YY.YY.',
            'YY...YYY..',
            'YY...YY...',
            'YY...YYY..',
            '.YY.YY.YY.',
            '..YYY...YY'
        ],
        { Y: '#FFC53D' },
        { glow: '#FFC53D' }
    );
    s.pxs(
        [
            [12, 11],
            [13, 12],
            [11, 12]
        ],
        '#FFE9A8'
    );
    return s.render();
}

export function slippage() {
    const s = S();
    s.ellipse(7, 12.4, 6.4, 1.3, M.cloth, { shade: 'flat', lum: 0.3 });
    // a banana peel: three flaps flopped out from the stem
    s.capsule(7, 9, 1.5, 11.5, 1.6, 1.1, M.gold, { g: 'p', bias: -0.05 });
    s.capsule(7, 9, 12.5, 11.5, 1.6, 1.1, M.gold, { g: 'p', bias: -0.12 });
    s.capsule(7, 9, 7.5, 12, 1.5, 1.2, M.gold, { g: 'p', bias: 0.05 });
    s.capsule(7, 9, 7, 3.5, 1.9, 1.4, M.gold, { g: 'p' });
    s.auto('p', { R: 1.2, grad: 0.25 });
    s.line(7, 3.5, 7, 1, M.wood, { lum: 0.4, w: 1 });
    s.pxs(
        [
            [2, 11],
            [12, 11]
        ],
        '#7A4B00'
    );
    return s.render();
}

export function hedge() {
    const s = S();
    s.ellipse(7, 6, 6.5, 5, M.ice, { g: 'u' });
    s.auto('u', { R: 2, grad: 0.35 });
    s.cutBox(0, 6, 14, 8);
    for (const x of [1, 4, 7, 10, 13]) s.px(x, 6, '#1C6FA8');
    s.line(7, 6, 7, 12, M.metal, { lum: 0.7 });
    s.pxs(
        [
            [6, 13],
            [5, 12]
        ],
        '#A3ACB8'
    );
    return s.render();
}

export function leverage() {
    const s = S();
    s.box(1, 10, 12, 3.5, M.metal, { r: 1, bevel: 1 });
    s.line(4, 10, 10, 2.5, M.metal, { lum: 0.75, w: 1.6 });
    s.circle(10.5, 2.5, 2.2, M.bear, { g: 'k' });
    s.auto('k', { R: 1.2, grad: 0.3 });
    s.patch(2, 1, ['X.X', '.X.', 'X.X'], { X: '#FFC53D' });
    return s.render();
}
