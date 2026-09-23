// Pickups and projectiles, drawn with the pixel-art engine (art/pixel.js).

import { PixelSprite } from './pixel.js';
import { C, M } from './materials.js';

/** 7×12 XP candle: a small green candle that glows. */
export function xpCandle(f) {
    const s = new PixelSprite(7, 12);
    const b = f % 2;
    s.line(3.5, 0.5, 3.5, 3, M.bullDeep, { w: 1, lum: 0.8 });
    s.line(3.5, 9, 3.5, 11.5, M.bullDeep, { w: 1, lum: 0.8 });
    s.box(1, 2.5, 5, 7, M.bull, { r: 0.8, bevel: 1.5, glow: '#16E08A' });
    s.px(2, 3 + b, '#D8FFD0', { glow: '#D8FFD0' });
    return s.render();
}

/** 9×16 big XP candle: a gold "god candle". */
export function xpCandleBig(f) {
    const s = new PixelSprite(9, 16);
    s.line(4.5, 0.5, 4.5, 4, M.gold, { w: 1, lum: 0.4 });
    s.line(4.5, 12, 4.5, 15.5, M.gold, { w: 1, lum: 0.4 });
    s.box(1.5, 3.5, 6, 9, M.gold, { r: 1, bevel: 2, glow: '#FFC53D' });
    s.px(2.5, 4.5 + (f % 2), '#FFFFFF', { glow: '#FFFFFF' });
    s.px(3, 6, '#FFF6D6');
    return s.render();
}

/** 8×14 green candle projectile (points up; the renderer rotates it). */
export function greenCandleShot() {
    const s = new PixelSprite(8, 14);
    s.line(4, 0.5, 4, 3, M.bull, { w: 1, lum: 0.9, glow: '#16E08A' });
    s.box(1.5, 2.5, 5, 9, M.bull, { r: 1, bevel: 1.6, glow: '#16E08A', bias: 0.1 });
    s.line(4, 11, 4, 13.5, M.bull, { w: 1, lum: 0.6 });
    s.px(2.5, 3.5, '#FFFFFF', { glow: '#FFFFFF' });
    return s.render();
}

/** 12×3 laser segment (the renderer draws real beams; kept for the sprite sheet). */
export function laser() {
    const s = new PixelSprite(12, 3);
    s.line(0.5, 1.5, 11.5, 1.5, M.bear, { w: 3, lum: 0.6, glow: '#FF3B5C' });
    s.line(0.5, 1.5, 11.5, 1.5, M.bear, { w: 1, lum: 1, glow: '#FFFFFF' });
    return s.render({ outline: false });
}

/** 10×10 diamond: a cut gem with facets, and a sparkle on odd frames. */
export function diamond(f) {
    const s = new PixelSprite(10, 10);
    s.poly(
        [
            [5, 0.5],
            [9.5, 3.5],
            [5, 9.5]
        ],
        M.diamond,
        { lum: 0.55, glow: '#46B8F0' }
    );
    s.poly(
        [
            [5, 0.5],
            [0.5, 3.5],
            [5, 9.5]
        ],
        M.diamond,
        { lum: 0.85, glow: '#46B8F0' }
    );
    s.poly(
        [
            [2, 2],
            [8, 2],
            [9.5, 3.5],
            [0.5, 3.5]
        ],
        M.diamond,
        { lum: 1 }
    );
    s.line(5, 2, 5, 9, M.diamond, { lum: 0.4 });
    if (f % 2) s.px(3, 1, '#FFFFFF', { glow: '#FFFFFF' }).px(2, 2, '#FFFFFF', { glow: '#FFFFFF' });
    return s.render();
}

/** 16×20 airdrop: a crate under a little parachute. */
export function airdrop() {
    const s = new PixelSprite(16, 20);
    s.ellipse(8, 5, 7.5, 5, M.paper, { g: 'chute' });
    s.auto('chute', { R: 2, grad: 0.3 });
    s.cutBox(0, 5, 16, 6);
    for (const x of [2, 5, 8, 11, 14]) s.px(x, 5, '#D5DAE1');
    s.line(1, 5, 4, 11, M.paper, { lum: 0.5 });
    s.line(15, 5, 12, 11, M.paper, { lum: 0.5 });
    s.line(8, 5, 8, 11, M.paper, { lum: 0.5 });
    s.box(3, 11, 10, 8, M.wood, { r: 0.5, bevel: 2 });
    s.box(3, 14, 10, 2, M.gold, { shade: 'flat', lum: 0.75 });
    s.px(8, 14, '#FFF6D6', { glow: '#FFC53D' }).px(8, 15, '#FFF6D6', { glow: '#FFC53D' });
    // red panels on the canopy
    for (const x of [1, 2, 7, 8, 13, 14])
        for (let y = 1; y < 5; y++)
            if (y > 1 || (x > 2 && x < 13)) s.px(x, y, y === 1 ? '#FF7E86' : C.red);
    return s.render();
}

/** 14×12 limit order: a gold order ticket. */
export function limitOrder(f) {
    const s = new PixelSprite(14, 12);
    s.poly(
        [
            [3, 1],
            [13, 1],
            [13, 11],
            [3, 11],
            [0.5, 6]
        ],
        M.gold,
        { left: 0.95, right: 0.55, glow: f % 2 ? '#FFC53D' : null }
    );
    s.circle(3.5, 6, 1, M.cloth, { shade: 'flat', lum: 0.1 });
    s.patch(6, 2, ['..X..', '.XXX.', 'X.X..', '.XXX.', '..X.X', '.XXX.', '..X..'], {
        X: '#3A2200'
    });
    return s.render();
}

/** 12×10 dead cat: grey, curled up, X-eyes. Spins in flight. */
export function deadCat() {
    const s = new PixelSprite(12, 10);
    s.auto('cat', { R: 2, grad: 0.3 });
    s.ellipse(6.5, 6, 5, 3.4, M.metal, { g: 'cat' });
    s.circle(3, 4, 2.8, M.metal, { g: 'cat' });
    s.poly(
        [
            [1, 2],
            [1.5, -0.5],
            [3, 1.5]
        ],
        M.metal,
        { lum: 0.6 }
    );
    s.poly(
        [
            [3.5, 1.5],
            [5, -0.5],
            [5.5, 2]
        ],
        M.metal,
        { lum: 0.5 }
    );
    s.capsule(11, 6, 11.5, 2, 0.8, 0.6, M.metal, { g: 'cat' });
    s.pxs(
        [
            [2, 3],
            [3, 4],
            [2, 4],
            [3, 3]
        ],
        '#14181E'
    );
    s.px(4.5, 5.5, '#FF7E86');
    return s.render();
}

/** 8×8 FUD bolt: a crackling purple-red orb. */
export function fudBolt(f) {
    const s = new PixelSprite(8, 8);
    s.circle(4, 4, 3.5, M.fud, { glow: '#8D7BA8', bias: 0.1 });
    s.circle(4, 4, 1.6, M.bear, { shade: 'flat', lum: 0.9, glow: '#FF3B5C' });
    if (f % 2)
        s.pxs(
            [
                [0, 2],
                [7, 5],
                [2, 7]
            ],
            '#CBBFE6',
            { glow: '#CBBFE6' }
        );
    else
        s.pxs(
            [
                [7, 1],
                [0, 6],
                [5, 0]
            ],
            '#CBBFE6',
            { glow: '#CBBFE6' }
        );
    return s.render();
}

/** 9×8 heart (healing). */
export function heart() {
    const s = new PixelSprite(9, 8);
    s.auto('h', { R: 2, grad: 0.35 });
    s.circle(2.5, 2.8, 2.3, M.bear, { g: 'h' });
    s.circle(6.5, 2.8, 2.3, M.bear, { g: 'h' });
    s.poly(
        [
            [0.3, 3.3],
            [8.7, 3.3],
            [4.5, 7.8]
        ],
        M.bear,
        { g: 'h' }
    );
    s.px(2, 2, '#FFFFFF');
    return s.render();
}
