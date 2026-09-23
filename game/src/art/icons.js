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
