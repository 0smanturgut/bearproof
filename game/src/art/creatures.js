// The bull and the bear market's rank and file, drawn with the pixel-art engine (art/pixel.js).
// Every generator takes a frame index and returns one rendered frame. Side-view sprites face RIGHT;
// the renderer mirrors them.

import { PixelSprite } from './pixel.js';
import { C, M } from './materials.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- the bull

/**
 * 36×26 charging bull (the Wall Street pose: head down, horns forward, hump high, tail whipping up).
 * The silhouette is hand-drawn as pixel spans and lit as one volume; the legs gallop procedurally.
 * Frames 0-3: a gallop cycle.
 */
const BULL_BODY = [
    [2, 18, 22],
    [3, 16, 24],
    [4, 5, 9],
    [4, 14, 25],
    [5, 4, 26],
    [6, 3, 26],
    [7, 3, 26],
    [8, 3, 26],
    [9, 3, 26],
    [10, 3, 26],
    [11, 3, 26],
    [12, 3, 26],
    [13, 3, 26],
    [14, 4, 25],
    [15, 5, 24],
    [16, 6, 11],
    [16, 16, 24],
    [17, 7, 11],
    [17, 18, 23]
];
const BULL_HEAD = [
    [7, 24, 28],
    [8, 24, 30],
    [9, 24, 31],
    [10, 24, 32],
    [11, 25, 33],
    [12, 26, 33],
    [13, 27, 33],
    [14, 28, 33],
    [15, 29, 33]
];
const BULL_MUZZLE = [
    [11, 32, 33],
    [12, 31, 34],
    [13, 30, 35],
    [14, 30, 35],
    [15, 30, 34],
    [16, 31, 33]
];
const BULL_HORN = [
    [6, 25, 26],
    [5, 25, 26],
    [4, 26, 27],
    [3, 27, 29],
    [2, 29, 32],
    [1, 32, 33],
    [0, 33, 33]
];
const BULL_HORN_FAR = [
    [7, 29, 30],
    [6, 30, 31],
    [5, 31, 33],
    [4, 33, 34],
    [3, 34, 34]
];
const BULL_TAIL = [
    [6, 2, 3],
    [5, 1, 2],
    [4, 1, 2],
    [3, 1, 2]
];
const BULL_TUFT = [
    [2, 0, 3],
    [1, 1, 3],
    [0, 1, 2]
];

export function bull(f) {
    const s = new PixelSprite(36, 26);
    const ph = (f / 4) * TAU;
    const b = [0, -1, -1, 0][f % 4]; // body bob
    const nod = [0, 0, 1, 1][f % 4];
    const tw = [0, -1, 0, 1][f % 4]; // tail sway
    const hb = b + nod;
    s.auto('body', { R: 3.4, grad: 0.34 });
    s.auto('head', { R: 2.4, grad: 0.26 });
    s.auto('legs', { R: 1.5, grad: 0.15 });
    s.auto('far', { R: 1.5, grad: 0.1 });
    const leg = (x0, y0, a, len, far) => {
        const kx = x0 + Math.sin(a) * len * 0.5;
        const ky = y0 + Math.cos(a) * len * 0.5;
        const hx = kx + Math.sin(a * 0.35) * len * 0.5;
        const hy = ky + Math.cos(a * 0.35) * len * 0.5;
        const m = far ? M.bullDeep : M.bull;
        const o = { g: far ? 'far' : 'legs', bias: far ? -0.05 : -0.04 };
        s.capsule(x0, y0, kx, ky, 2.4, 1.9, m, o);
        s.capsule(kx, ky, hx, hy - 0.8, 1.7, 1.3, m, o);
        s.box(hx - 1.6, hy - 1, 3.4, 2.2, M.hoof, { shade: 'flat', lum: far ? 0.3 : 0.6 });
    };
    // far side, behind everything
    leg(18.5, 15 + b, 0.6 * Math.sin(ph + 1.1), 8, true);
    leg(12, 15 + b, 0.6 * Math.sin(ph + Math.PI + 1.1), 8, true);
    BULL_HORN_FAR.forEach((r, i) =>
        s.spans([r], M.horn, { dy: hb, shade: 'flat', lum: 0.2 + i * 0.07 })
    );
    // tail with its tuft, swaying
    s.spans(BULL_TAIL, M.bull, { g: 'body', dy: b, dx: tw > 0 ? 0 : 0 });
    s.spans(BULL_TUFT, M.bullDeep, { g: 'tuft', dy: b, dx: tw });
    s.auto('tuft', { R: 1, grad: 0.2 });
    // near legs, tucked under the belly
    leg(21.5, 15.5 + b, 0.6 * Math.sin(ph), 8.5, false);
    leg(8.5, 15.5 + b, 0.6 * Math.sin(ph + Math.PI), 8.5, false);
    // the body: one hand-drawn mass
    s.spans(BULL_BODY, M.bull, { g: 'body', dy: b, bias: -0.05 });
    // head and muzzle (lower, nodding)
    s.spans(BULL_HEAD, M.bull, { g: 'head', dy: hb, bias: -0.02 });
    s.spans(BULL_MUZZLE, M.snout, { g: 'head', dy: hb, bias: -0.2 });
    // near horn
    // near horn: flat ivory, darker at the root, bright towards the tip
    BULL_HORN.forEach((r, i) =>
        s.spans([r], M.horn, { g: 'horn', dy: hb, shade: 'flat', lum: 0.45 + i * 0.09 })
    );
    s.px(27, 3 + hb, '#FFFBEA').px(29, 2 + hb, '#FFFBEA');
    s.px(33, 0 + hb, '#6E5A38');
    // shoulder muscle line and the up-candle mark
    for (const [x, y] of [
        [22, 9],
        [23, 10],
        [23, 11]
    ])
        s.px(x, y + b, '#12B874');
    s.px(19, 5 + b, '#7BF5A6')
        .px(19, 6 + b, '#D8FFD0')
        .px(19, 7 + b, '#D8FFD0')
        .px(19, 8 + b, '#7BF5A6');
    // face: eye under a hard brow, nostril, mouth, gold nose ring
    const y = hb;
    s.px(28, 9 + y, '#03140F')
        .px(29, 9 + y, '#03140F')
        .px(30, 9 + y, '#03140F')
        .px(31, 10 + y, '#03140F');
    s.px(29, 10 + y, C.eyeWhite).px(30, 10 + y, C.pupil);
    s.px(34, 13 + y, '#07322A').px(34, 14 + y, '#07322A');
    s.px(31, 15 + y, '#0A5C45').px(32, 15 + y, '#0A5C45');
    s.px(33, 16 + y, C.gold)
        .px(34, 17 + y, '#B07A00')
        .px(32, 17 + y, '#FFE9A8')
        .px(33, 18 + y, '#B07A00');
    return s.render();
}

// ---------------------------------------------------------------- enemies

/** 14×22 hopping red candle with an angry face. */
export function redCandle(f) {
    const s = new PixelSprite(14, 22);
    const sq = [0, 1, 0, -1][f % 4]; // squash (+) / stretch (-)
    const top = 4 + sq;
    const h = 13 - sq;
    const w = 8 + (sq > 0 ? 1 : 0);
    const x = 7 - w / 2;
    s.line(7, 0.5 + sq, 7, top, M.bearDark, { w: 1.2 });
    s.line(7, top + h, 7, 21, M.bearDark, { w: 1.2 });
    s.box(x, top, w, h, M.bear, { r: 1.2, bevel: 2.4 });
    // face
    const ey = top + 4;
    s.px(4, ey, C.eyeWhite).px(5, ey, C.red, { glow: C.red });
    s.px(9, ey, C.red, { glow: C.red }).px(10, ey, C.eyeWhite);
    s.px(4, ey - 1, '#1A040C')
        .px(5, ey - 1, '#1A040C')
        .px(9, ey - 1, '#1A040C')
        .px(10, ey - 1, '#1A040C');
    s.px(5, ey - 2, '#1A040C').px(9, ey - 2, '#1A040C');
    s.px(6, ey + 3, '#1A040C')
        .px(7, ey + 3, '#1A040C')
        .px(8, ey + 3, '#1A040C');
    s.px(5, ey + 4, '#1A040C').px(9, ey + 4, '#1A040C');
    return s.render();
}

// Shared face helpers ---------------------------------------------------------------

/** Angry glowing eyes: two pixels each (white + glowing iris), with a slanted brow. */
function angryEyes(s, x1, x2, y, { iris = C.red, brow = '#1A040C', white = true } = {}) {
    if (white) s.px(x1, y, C.eyeWhite).px(x2 + 1, y, C.eyeWhite);
    s.px(x1 + 1, y, iris, { glow: iris }).px(x2, y, iris, { glow: iris });
    s.px(x1, y - 1, brow)
        .px(x1 + 1, y - 1, brow)
        .px(x2, y - 1, brow)
        .px(x2 + 1, y - 1, brow);
    s.px(x1 + 1, y - 2, brow).px(x2, y - 2, brow);
}

/** 24×24 bag holder: a hunched guy dragging two heavy bags. */
export function bagHolder(f) {
    const s = new PixelSprite(24, 24);
    const b = [0, 1, 0, 1][f % 4];
    const st = [1, 0, -1, 0][f % 4];
    s.auto('body', { R: 2.4, grad: 0.25 });
    s.auto('bagL', { R: 2.6, grad: 0.3 });
    s.auto('bagR', { R: 2.6, grad: 0.3 });
    // legs
    s.capsule(10, 17, 9.5 + st, 21.5, 1.4, 1.2, M.cloth, { g: 'legs' });
    s.capsule(14, 17, 14.5 - st, 21.5, 1.4, 1.2, M.cloth, { g: 'legs' });
    s.box(8 + st, 21, 3, 1.6, M.hoof, { shade: 'flat', lum: 0.5 });
    s.box(13.5 - st, 21, 3, 1.6, M.hoof, { shade: 'flat', lum: 0.5 });
    // left bag (behind)
    s.ellipse(5, 15.5 + b, 4.4, 5, M.burlap, { g: 'bagL' });
    s.ellipse(5, 10.2 + b, 1.6, 1.2, M.burlap, { g: 'bagL' });
    // body (grey hoodie), hunched forward
    s.ellipse(12, 13.5 + b, 5.2, 5.6, M.metal, { g: 'body', bias: -0.08 });
    s.ellipse(12.5, 9.5 + b, 4.6, 3.4, M.metal, { g: 'body', bias: -0.05 });
    // head, drooping
    s.circle(13, 6.8 + b, 3.5, M.skin, { g: 'head' });
    s.auto('head', { R: 1.8, grad: 0.2 });
    s.ellipse(13, 4.4 + b, 3.6, 1.8, M.metal, { g: 'head', bias: -0.1 }); // beanie
    // sad face: droopy eyes, a tear, a frown
    const fy = Math.round(7 + b);
    s.px(11, fy, C.ink)
        .px(15, fy, C.ink)
        .px(10, fy - 1, '#3A1E12')
        .px(16, fy - 1, '#3A1E12');
    s.px(11, fy + 1, '#46B8F0')
        .px(12, fy + 3, '#3A1E12')
        .px(13, fy + 2, '#3A1E12')
        .px(14, fy + 3, '#3A1E12');
    // right bag (in front) with a red -% tag
    s.ellipse(19.5, 15.8 - b, 4.2, 4.9, M.burlap, { g: 'bagR' });
    s.ellipse(19.5, 10.6 - b, 1.5, 1.1, M.burlap, { g: 'bagR' });
    // arms reaching down to the bag necks
    s.capsule(9, 10 + b, 5.5, 11 + b, 1.2, 1, M.metal, { g: 'arms' });
    s.capsule(15.5, 10 + b, 19, 11 - b, 1.2, 1, M.metal, { g: 'arms' });
    const ty = Math.round(15 - b);
    s.patch(17, ty, ['R.R', '.R.', 'R.R'], { R: C.red }, { glow: '#FF3B5C' });
    s.px(21, ty + 1, C.red, { glow: C.red });
    return s.render();
}

/** 18×20 paper hands: a crumpled sheet in full panic, hands up. */
export function paperHands(f) {
    const s = new PixelSprite(18, 20);
    const b = [0, -1, 0, -1][f % 4];
    const wave = [0, -2, 0, 1][f % 4];
    s.auto('body', { R: 2.2, grad: 0.3 });
    // thin legs
    s.capsule(7, 15, 6 - (f % 2), 19, 0.8, 0.7, M.paper, { g: 'legs', bias: -0.15 });
    s.capsule(11, 15, 12 + (f % 2), 19, 0.8, 0.7, M.paper, { g: 'legs', bias: -0.15 });
    // arms flailing up
    s.capsule(4.5, 10 + b, 2, 5 + wave, 0.9, 0.8, M.paper, { g: 'armL' });
    s.capsule(13.5, 10 + b, 16, 5 - wave, 0.9, 0.8, M.paper, { g: 'armR' });
    s.circle(2, 4.2 + wave, 1.6, M.paper, { g: 'armL' });
    s.circle(16, 4.2 - wave, 1.6, M.paper, { g: 'armR' });
    // crumpled body: a lumpy sheet
    s.poly(
        [
            [4, 5 + b],
            [8, 3.5 + b],
            [11, 4.5 + b],
            [14, 4 + b],
            [14.5, 9 + b],
            [13.5, 13 + b],
            [14.5, 16 + b],
            [9, 16.5 + b],
            [4, 16 + b],
            [4.5, 11 + b],
            [3.5, 8 + b]
        ],
        M.paper,
        { g: 'body' }
    );
    // crumple folds
    for (const [x, y] of [
        [6, 7],
        [7, 8],
        [12, 6],
        [11, 13],
        [12, 14],
        [5, 13]
    ])
        s.px(x, y + b, '#AEB5C0');
    // panic face: wide eyes, open mouth, sweat drop
    const fy = Math.round(8 + b);
    s.px(6, fy, C.ink).px(7, fy, C.ink).px(10, fy, C.ink).px(11, fy, C.ink);
    s.px(6, fy - 1, '#7C8390').px(11, fy - 1, '#7C8390');
    s.patch(8, fy + 2, ['XX', 'XX'], { X: '#1F232B' });
    s.px(13, fy - 2, '#46B8F0', { glow: '#46B8F0' }).px(13, fy - 1, '#9BE2FF');
    return s.render();
}

/** 26×20 rug puller: a hooded thief sprinting right, yanking a rug that flaps out behind him. */
export function rugPuller(f) {
    const s = new PixelSprite(26, 20);
    const run = (f / 4) * TAU;
    const b = [0, -1, 0, -1][f % 4];
    s.auto('body', { R: 2.2, grad: 0.3 });
    s.auto('head', { R: 1.8, grad: 0.3 });
    // the rug: one flapping band from his hand back to the left edge, gold border and a diamond row
    const wave = (x) => Math.sin(x * 0.55 - run) * (1.6 * (1 - x / 16)) + (16 - x) * 0.12;
    for (let x = 0; x <= 14; x++) {
        const top = Math.round(9 + wave(x) + b * (x / 14));
        s.px(x, top, '#FFC53D');
        for (let k = 1; k <= 3; k++)
            s.px(x, top + k, k === 2 && x % 4 === 1 ? '#FFC53D' : k === 1 ? '#B81E40' : '#6E0F2A');
        s.px(x, top + 4, '#FFC53D');
        if (x === 0) for (let k = 0; k <= 4; k += 2) s.px(0, top + k, '#FFE08A');
    }
    // legs mid-stride
    s.capsule(17, 12.5 + b, 17 + Math.sin(run) * 3.4, 18.4, 1.3, 1.1, M.cloth, {
        g: 'legs',
        bias: -0.06
    });
    s.capsule(18.5, 12.5 + b, 18.5 - Math.sin(run) * 3.4, 18.4, 1.3, 1.1, M.cloth, { g: 'legsF' });
    s.auto('legs', { R: 1, grad: 0.1 });
    s.auto('legsF', { R: 1, grad: 0.1 });
    // body leaning into the sprint
    s.ellipse(18.4, 9.6 + b, 3.6, 4, M.hood, { g: 'body' });
    // head in a hood, face in shadow, eyes glowing
    s.circle(20.6, 4.8 + b, 3.4, M.hood, { g: 'head' });
    s.poly(
        [
            [17.5, 3.5 + b],
            [18.5, 1 + b],
            [21, 1.6 + b]
        ],
        M.hood,
        { g: 'head' }
    );
    s.ellipse(22, 5.4 + b, 1.8, 1.7, M.cloth, { shade: 'flat', lum: 0.04 });
    s.px(21.5, 5 + b, C.red, { glow: C.red }).px(23, 5 + b, C.red, { glow: C.red });
    s.px(22.5, 6.6 + b, '#FFC53D');
    // arm reaching back, fist on the rug's edge
    s.capsule(17, 8.4 + b, 14.5, Math.round(9 + wave(14) + b) + 1.5, 1.1, 1, M.hood, { g: 'arm' });
    s.auto('arm', { R: 0.9, grad: 0.2 });
    s.circle(14.4, Math.round(9 + wave(14) + b) + 1.8, 1.3, M.skin, { g: 'fist' });
    return s.render();
}

/** 36×32 grizzly: a big armoured bear, the tank of the bear market. */
export function grizzly(f) {
    const s = new PixelSprite(36, 32, { dither: 0.35 });
    const sway = [0, 1, 0, -1][f % 4];
    const st = [1, 0, -1, 0][f % 4];
    s.auto('body', { R: 4, grad: 0.3 });
    s.auto('head', { R: 3, grad: 0.26 });
    // legs
    s.capsule(12, 22, 11.5 + st, 29, 3, 2.6, M.fur, { g: 'legs', bias: -0.08 });
    s.capsule(23, 22, 23.5 - st, 29, 3, 2.6, M.fur, { g: 'legs', bias: -0.08 });
    // body + belly
    s.ellipse(17.5 + sway * 0.3, 18, 11, 10, M.fur, { g: 'body' });
    s.ellipse(17.5 + sway * 0.3, 20, 6.5, 6.5, M.belly, { g: 'belly' });
    s.auto('belly', { R: 2.5, grad: 0.2 });
    // steel chest plate
    s.box(11.5 + sway * 0.3, 12, 12, 7, M.metal, { r: 2, bevel: 2 });
    s.px(14 + sway, 14, '#E3E8EE').px(15 + sway, 14, '#E3E8EE');
    // arms with claws
    s.capsule(8, 13, 5 + sway, 22, 2.6, 2.2, M.fur, { g: 'armL' });
    s.capsule(27, 13, 30 + sway, 22, 2.6, 2.2, M.fur, { g: 'armR' });
    s.pxs(
        [
            [4 + sway, 24],
            [6 + sway, 24.5],
            [29 + sway, 24],
            [31 + sway, 24.5]
        ],
        '#EDE0BC'
    );
    // head: ears, face, snout
    const hx = 17.5 + sway * 0.5;
    s.circle(hx - 6, 3.8, 2.6, M.fur, { g: 'head' });
    s.circle(hx + 6, 3.8, 2.6, M.fur, { g: 'head' });
    s.ellipse(hx, 8, 7.5, 6.2, M.fur, { g: 'head' });
    s.ellipse(hx, 10.5, 3.6, 2.6, M.belly, { g: 'snout' });
    s.auto('snout', { R: 1.6, grad: 0.15 });
    s.px(hx - 6, 3.5, '#6E3A1E').px(hx + 6, 3.5, '#6E3A1E');
    s.patch(Math.round(hx) - 1, 9, ['XXX', '.X.'], { X: C.ink });
    angryEyes(s, Math.round(hx) - 5, Math.round(hx) + 3, 7);
    s.pxs(
        [
            [Math.round(hx) - 1, 12],
            [Math.round(hx) + 1, 12]
        ],
        '#FFFBEA'
    ); // fangs
    return s.render();
}

/** 24×18 FUD cloud: a storm cloud with a grudge, crackling with lightning. */
export function fudCloud(f) {
    const s = new PixelSprite(24, 18);
    const p = [0, 1, 0, -1][f % 4];
    s.auto('cloud', { R: 2.6, grad: 0.35 });
    for (const [x, y, r] of [
        [6, 9, 4.2],
        [11, 6.5, 5],
        [17, 8, 4.6],
        [9, 11, 4],
        [15, 11.5, 4.2],
        [20.5, 11, 3]
    ])
        s.circle(x + (r > 4.5 ? p * 0.3 : 0), y + p * 0.4, r + (x === 11 ? p * 0.3 : 0), M.fud, {
            g: 'cloud'
        });
    // lightning bolt underneath, flickers
    if (f % 2 === 0)
        s.patch(10, 14, ['.YY', 'YY.', '.YY', '..Y'], { Y: '#FFE08A' }, { glow: '#FFC53D' });
    angryEyes(s, 8, 14, 9, { brow: '#140E22' });
    s.patch(10, 12, ['X.X.X', '.X.X.'], { X: '#140E22' });
    return s.render();
}

/** 18×22 doomposter: hooded, lit from below by a phone full of bad news. */
export function doomposter(f) {
    const s = new PixelSprite(18, 22);
    const b = [0, -1, 0, 0][f % 4];
    const lit = f % 2 === 0;
    s.auto('cloak', { R: 2.6, grad: 0.3 });
    s.poly(
        [
            [9, 2 + b],
            [14, 6 + b],
            [15.5, 20],
            [2.5, 20],
            [4, 6 + b]
        ],
        M.hood,
        { g: 'cloak' }
    );
    s.circle(9, 6.5 + b, 4.4, M.hood, { g: 'cloak' });
    s.ellipse(9, 7.5 + b, 2.6, 2.4, M.cloth, { shade: 'flat', lum: lit ? 0.35 : 0.15 });
    // phone
    s.box(10, 11 + b, 4, 6, M.metal, { shade: 'flat', lum: 0.2 });
    s.box(10.8, 11.8 + b, 2.6, 4.2, M.diamond, {
        shade: 'flat',
        lum: lit ? 0.9 : 0.7,
        glow: '#46B8F0'
    });
    s.px(11, 13 + b, '#FF3B5C').px(12, 14 + b, '#FF3B5C'); // a red chart on the screen
    // hands on the phone
    s.circle(10, 15 + b, 1.2, M.hood, { g: 'hand' });
    // eyes
    s.px(7, 7 + b, C.red, { glow: C.red }).px(10, 7 + b, C.red, { glow: C.red });
    return s.render();
}

/** 26×22 ponzi: a golden pyramid with an all-seeing eye, on tiny legs. */
export function ponzi(f) {
    const s = new PixelSprite(26, 22);
    const b = [0, -1, 0, -1][f % 4];
    const look = [0, 1, 0, -1][f % 4];
    s.capsule(9, 17, 8 - (f % 2), 21, 1, 0.9, M.goldDark || M.gold, { bias: -0.25 });
    s.capsule(17, 17, 18 + (f % 2), 21, 1, 0.9, M.gold, { bias: -0.25 });
    // the pyramid: two faces, lit from the left
    s.poly(
        [
            [13, 1 + b],
            [13, 18 + b],
            [1.5, 18 + b]
        ],
        M.gold,
        { top: 0.95, bot: 0.65 }
    );
    s.poly(
        [
            [13, 1 + b],
            [24.5, 18 + b],
            [13, 18 + b]
        ],
        M.gold,
        { top: 0.55, bot: 0.3 }
    );
    // brick courses
    for (const y of [6, 10, 14])
        s.line(13 - y * 0.68, y + b, 13 + y * 0.68, y + b, M.gold, { lum: 0.2 });
    // the eye
    const ey = Math.round(9 + b);
    s.patch(10, ey - 1, ['.WWWWW.', 'WWWWWWW', '.WWWWW.'], { W: C.eyeWhite });
    s.px(13 + look, ey, C.red, { glow: C.red })
        .px(12 + look, ey, '#B81E40')
        .px(14 + look, ey, '#B81E40');
    s.px(13, ey - 3, '#FFF6D6').px(12, ey - 4, '#FFF6D6');
    return s.render();
}

/** 12×11 downline: a small pyramid that used to be part of a big one. */
export function downline(f) {
    const s = new PixelSprite(12, 11);
    const b = [0, -1, 0, -1][f % 4];
    s.poly(
        [
            [6, 1 + b],
            [6, 9 + b],
            [0.5, 9 + b]
        ],
        M.gold,
        { top: 0.95, bot: 0.65 }
    );
    s.poly(
        [
            [6, 1 + b],
            [11.5, 9 + b],
            [6, 9 + b]
        ],
        M.gold,
        { top: 0.55, bot: 0.3 }
    );
    s.px(5, 5 + b, C.ink).px(7, 5 + b, C.ink);
    s.px(4, 10, '#7A4B00').px(8, 10, '#7A4B00');
    return s.render();
}

/** 18×22 margin call: a furious red desk phone, ringing off the hook. */
export function marginCall(f) {
    const s = new PixelSprite(18, 22);
    const j = [0, -1, 0, -1][f % 4];
    const tilt = [0, 1, 0, -1][f % 4];
    s.auto('body', { R: 2.4, grad: 0.3 });
    // cord
    for (let i = 0; i < 5; i++) s.px(3 - (i % 2), 13 + i, '#6E0F2A');
    // body
    s.poly(
        [
            [3, 20],
            [15, 20],
            [13.5, 10],
            [4.5, 10]
        ],
        M.bear,
        { g: 'body' }
    );
    // rotary dial
    s.circle(9, 15, 3.4, M.paper, { g: 'dial' });
    s.auto('dial', { R: 1.4, grad: 0.2 });
    s.circle(9, 15, 1.1, M.bearDark, { shade: 'flat', lum: 0.4 });
    for (const [x, y] of [
        [7, 13],
        [11, 13],
        [7, 17],
        [11, 17],
        [6, 15],
        [12, 15]
    ])
        s.px(x, y, '#7C8390');
    // the handset jumping on the hook
    s.capsule(3 + tilt, 7.5 + j, 15 + tilt, 7.5 + j - tilt, 1.6, 1.6, M.bear, { g: 'hand' });
    s.circle(3 + tilt, 8.5 + j, 2, M.bear, { g: 'hand' });
    s.circle(15 + tilt, 8.5 + j - tilt, 2, M.bear, { g: 'hand' });
    s.auto('hand', { R: 1.4, grad: 0.25 });
    // ring marks
    if (f % 2 === 1) {
        s.pxs(
            [
                [0, 4],
                [1, 3],
                [17, 4],
                [16, 3]
            ],
            '#FFE08A',
            { glow: '#FFC53D' }
        );
    }
    angryEyes(s, 5, 11, 12, { brow: '#1A040C' });
    return s.render();
}

/** 18×20 sybil: one of many identical masked accounts. */
export function sybil(f) {
    const s = new PixelSprite(18, 20);
    const b = [0, -1, 0, 0][f % 4];
    s.auto('body', { R: 2.4, grad: 0.3 });
    s.capsule(7, 15, 6.5 + (f % 2), 19, 1.2, 1.1, M.cloth, { g: 'legs' });
    s.capsule(11, 15, 11.5 - (f % 2), 19, 1.2, 1.1, M.cloth, { g: 'legs' });
    s.ellipse(9, 12.5 + b, 5, 4.8, M.metal, { g: 'body', bias: -0.1 });
    s.circle(9, 6 + b, 4.6, M.metal, { g: 'body', bias: -0.12 });
    // the mask
    s.ellipse(9.3, 6.4 + b, 3.2, 3.6, M.paper, { g: 'mask' });
    s.auto('mask', { R: 1.6, grad: 0.3 });
    const fy = Math.round(5.5 + b);
    s.px(7, fy, C.ink).px(8, fy, C.ink).px(10, fy, C.ink).px(11, fy, C.ink);
    s.px(8, fy + 3, '#1F232B')
        .px(9, fy + 3, '#1F232B')
        .px(10, fy + 3, '#1F232B')
        .px(11, fy + 2, '#1F232B')
        .px(7, fy + 2, '#1F232B');
    s.px(8, fy - 2, '#7C8390').px(10, fy - 2, '#7C8390');
    return s.render();
}

// ---------------------------------------------------------------- brand

/**
 * The emblem: the bull's head, front on. `n` = inner size in art px (14 → a 16×16 favicon, 30 → a 32×32
 * mark for the coin and avatar). Shapes scale; details are re-placed at each size.
 */
export function emblem(n = 14) {
    const k = n / 14;
    const s = new PixelSprite(n, n, { dither: n > 20 ? 0.3 : 0 });
    const P = (v) => v * k;
    s.auto('head', { R: 2.2 * k, grad: 0.36 });
    s.auto('muzzle', { R: 1.4 * k, grad: 0.3 });
    s.auto('horns', { R: 0.9 * k, grad: 0.3 });
    s.auto('ears', { R: 0.8 * k, grad: 0.2 });
    // horns sweep out and up
    for (const sx of [1, -1]) {
        const X = (v) => (sx > 0 ? P(v) : n - P(v));
        s.capsule(X(3.4), P(5.6), X(1.2), P(3.4), P(1.15), P(0.95), M.horn, { g: 'horns' });
        s.capsule(X(1.2), P(3.4), X(1.7), P(0.6), P(0.95), P(0.5), M.horn, { g: 'horns' });
        s.ellipse(X(2.1), P(7.1), P(1.7), P(1.05), M.bullDeep, { g: 'ears' });
    }
    // head, darker toward the jaw, and a lighter muzzle
    s.ellipse(P(7), P(7.2), P(4.5), P(4.7), M.bull, { g: 'head', bias: -0.12 });
    s.ellipse(P(7), P(10.7), P(3.2), P(2.3), M.snout, { g: 'muzzle', bias: -0.1 });
    const px = (x, y, c) => {
        // a detail pixel, doubled up on the big emblem
        const r = Math.max(1, Math.round(k));
        for (let dy = 0; dy < r; dy++)
            for (let dx = 0; dx < r; dx++) s.px(Math.floor(P(x)) + dx, Math.floor(P(y)) + dy, c);
    };
    // angry slanted brows, eyes (white with the pupil toward the nose), nostrils, gold nose ring
    if (n > 20) {
        for (const [x, y] of [
            [7, 12],
            [8, 12],
            [9, 13],
            [10, 13],
            [11, 14]
        ])
            s.px(x, y, '#03140F').px(n - 1 - x, y, '#03140F');
        for (const [x, y] of [
            [9, 14],
            [10, 14],
            [9, 15],
            [10, 15]
        ])
            s.px(x, y, C.eyeWhite).px(n - 1 - x, y, C.eyeWhite);
        s.px(10, 15, C.pupil)
            .px(n - 11, 15, C.pupil)
            .px(10, 14, C.pupil)
            .px(n - 11, 14, C.pupil);
    } else {
        px(3.9, 6.1, '#03140F');
        px(5, 7, '#03140F');
        px(10, 6.1, '#03140F');
        px(8.9, 7, '#03140F');
        px(4.9, 8, C.eyeWhite);
        px(3.9, 8, C.pupil);
        px(8.9, 8, C.eyeWhite);
        px(9.9, 8, C.pupil);
    }
    px(5.9, 10.6, '#07322A');
    px(7.9, 10.6, '#07322A');
    px(6.9, 12.2, C.gold);
    px(5.9, 13, '#B07A00');
    px(7.9, 13, '#B07A00');
    px(6.9, 13, '#FFE9A8');
    if (n > 20) {
        // extra detail on the big mark: a highlight on each horn tip and the brow ridge
        s.px(Math.round(P(1.5)), Math.round(P(1)), '#FFFBEA').px(
            Math.round(n - P(1.5)),
            Math.round(P(1)),
            '#FFFBEA'
        );
    }
    return s.render();
}

export const emblemSmall = () => emblem(14);
export const emblemLarge = () => emblem(30);
