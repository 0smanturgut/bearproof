// Bosses, drawn with the pixel-art engine (art/pixel.js). Big sprites get light ordered dithering for
// texture. Frames: 0-3 idle/advance cycle.

import { PixelSprite } from './pixel.js';
import { C, M } from './materials.js';

const TAU = Math.PI * 2;

function glowEyes(s, pts, color = C.red) {
    for (const [x, y] of pts) s.px(x, y, color, { glow: color });
}

function carpet(s, x0, x1, y, wave, ph, { thick = 5 } = {}) {
    // a magic carpet: crimson field, gold border and diamonds, fringe at both ends
    for (let x = x0; x <= x1; x++) {
        const wy = Math.round(Math.sin(x * 0.28 + ph) * wave);
        for (let k = 0; k < thick; k++) {
            const edge = k === 0 || k === thick - 1;
            const diamond = !edge && (x - x0) % 8 === 4 && k === Math.floor(thick / 2);
            s.box(x, y + wy + k, 1, 1, edge || diamond ? M.gold : M.bearDark, {
                g: 'carpet',
                shade: 'flat',
                lum: edge ? (k === 0 ? 0.8 : 0.45) : diamond ? 0.9 : 0.35 + (k === 1 ? 0.25 : 0)
            });
        }
        if (x === x0 || x === x1)
            for (let k = 0; k < thick; k += 2) s.px(x + (x === x0 ? -1 : 1), y + wy + k, C.gold);
    }
}

/** 56×50 Rug Lord: a crowned bear in a royal robe, riding the rug he pulled from under everyone. */
export function rugLord(f) {
    const s = new PixelSprite(56, 50, { dither: 0.4 });
    const ph = (f / 4) * TAU;
    const b = Math.round(Math.sin(ph));
    s.auto('cape', { R: 4, grad: 0.35 });
    s.auto('robe', { R: 4, grad: 0.32 });
    s.auto('head', { R: 3.5, grad: 0.3 });
    // cape behind
    s.poly(
        [
            [16, 16 + b],
            [40, 16 + b],
            [48, 40],
            [8, 40]
        ],
        M.fud,
        { g: 'cape', bias: -0.12 }
    );
    // robe
    s.poly(
        [
            [20, 18 + b],
            [36, 18 + b],
            [42, 40],
            [14, 40]
        ],
        M.bear,
        { g: 'robe', bias: -0.18 }
    );
    // gold hem lines down the robe and a dark belt with a gold buckle
    s.line(22.5, 20 + b, 18, 39, M.gold, { lum: 0.55 });
    s.line(33.5, 20 + b, 38, 39, M.gold, { lum: 0.55 });
    s.box(21, 27 + b, 14, 2, M.cloth, { shade: 'flat', lum: 0.3 });
    s.box(26.5, 26.5 + b, 3, 3, M.gold, { shade: 'flat', lum: 0.85 });
    // arms with claws; the right one holds a down-arrow sceptre
    s.capsule(19, 20 + b, 13, 30 + b, 3, 2.6, M.furDark, { g: 'armL' });
    s.capsule(37, 20 + b, 44, 27 + b, 3, 2.6, M.furDark, { g: 'armR' });
    s.line(46, 10 + b, 46, 36 + b, M.gold, { w: 1.6, lum: 0.6 });
    s.patch(
        43,
        34 + b,
        ['RRRRRRR', '.RRRRR.', '..RRR..', '...R...'],
        { R: C.red },
        { glow: C.red }
    );
    s.circle(45.5, 27 + b, 2.4, M.furDark, { g: 'armR' });
    s.pxs(
        [
            [11, 31 + b],
            [13, 32 + b],
            [15, 31 + b]
        ],
        '#EDE0BC'
    );
    // bear head, ears, snout
    s.circle(21, 6 + b, 3, M.furDark, { g: 'head' });
    s.circle(35, 6 + b, 3, M.furDark, { g: 'head' });
    s.ellipse(28, 11.5 + b, 9, 7.5, M.furDark, { g: 'head' });
    s.ellipse(28, 14.5 + b, 4.2, 3, M.fur, { g: 'snout' });
    s.auto('snout', { R: 2, grad: 0.2 });
    s.patch(27, 13 + b, ['XXX', '.X.'], { X: C.ink });
    s.pxs(
        [
            [26, 17 + b],
            [30, 17 + b]
        ],
        '#FFFBEA'
    );
    // crown
    s.patch(
        21,
        0 + b,
        ['Y..Y..Y..Y..Y', 'YY.YY.Y.YY.YY', 'YYYYYYYYYYYYY', 'YRYYYYRYYYYRY'],
        { Y: C.gold, R: C.red },
        { glow: null }
    );
    s.px(22, 3 + b, C.red, { glow: C.red })
        .px(27, 3 + b, C.red, { glow: C.red })
        .px(32, 3 + b, C.red, { glow: C.red });
    glowEyes(s, [
        [24, 10 + b],
        [25, 10 + b],
        [31, 10 + b],
        [32, 10 + b]
    ]);
    s.pxs(
        [
            [23, 9 + b],
            [24, 8 + b],
            [25, 8 + b],
            [31, 8 + b],
            [32, 8 + b],
            [33, 9 + b]
        ],
        '#0A0304'
    );
    // the carpet he rides
    carpet(s, 3, 52, 40, 1.6, ph * 1.5, { thick: 6 });
    return s.render();
}

/** 28×64 Capitulation: the biggest red candle you have ever seen, cracked and burning. */
export function capitulation(f) {
    const s = new PixelSprite(30, 66, { dither: 0.3 });
    const fl = f % 4;
    const b = [0, 1, 0, -1][fl];
    // wicks
    s.line(15, 6 + b, 15, 14 + b, M.bearDark, { w: 2.2, lum: 0.4 });
    s.line(15, 56 + b, 15, 65, M.bearDark, { w: 2.2, lum: 0.4 });
    // the flame
    const flame = [
        ['..Y..', '.YY..', '.YYY.', 'YYOYY', 'YOOOY', '.OOO.'],
        ['...Y.', '..YY.', '.YYY.', 'YYOYY', 'YOOOY', '.OOO.'],
        ['..Y..', '..YY.', '.YYYY', 'YYOYY', 'YOOOY', '.OOO.'],
        ['.Y...', '.YY..', 'YYYY.', 'YYOYY', 'YOOOY', '.OOO.']
    ][fl];
    s.patch(13, b, flame, { Y: '#FFE08A', O: '#FF8C3C' }, { glow: '#FFC53D', bare: true });
    // body
    s.box(4, 14 + b, 22, 42, M.bear, { r: 2, bevel: 6 });
    // cracks
    s.patch(6, 22 + b, ['X...', '.X..', '.XX.', '...X', '..X.'], { X: '#6E0F2A' });
    s.patch(19, 40 + b, ['..X', '.X.', 'X..', 'X..', '.X.'], { X: '#6E0F2A' });
    // wax drips
    s.box(21, 14 + b, 3, 7, M.bear, { r: 1, bevel: 1.5, bias: 0.1 });
    s.box(7, 14 + b, 2, 4, M.bear, { r: 1, bevel: 1, bias: 0.1 });
    // face
    const ey = 26 + b;
    s.patch(7, ey - 3, ['XX.........XX', '.XXX.....XXX.', '...XX...XX...'], { X: '#1A040C' });
    s.patch(8, ey, ['WWRR.....RRWW', 'WWRR.....RRWW'], { W: C.eyeWhite, R: C.red }, {});
    glowEyes(s, [
        [10, ey],
        [11, ey],
        [17, ey],
        [18, ey],
        [10, ey + 1],
        [11, ey + 1],
        [17, ey + 1],
        [18, ey + 1]
    ]);
    s.patch(9, ey + 6, ['.XXXXXXXXX.', 'X.W.W.W.W.X', 'X.........X', '.XXXXXXXXX.'], {
        X: '#1A040C',
        W: '#FFC9BF'
    });
    return s.render();
}

/** 60×56 Liquidation: a reaper whose scythe blade is a chart crashing through the floor. */
export function liquidation(f) {
    const s = new PixelSprite(60, 56, { dither: 0.4 });
    const ph = (f / 4) * TAU;
    const b = Math.round(Math.sin(ph) * 1.5);
    s.auto('robe', { R: 4, grad: 0.35 });
    // scythe handle
    s.line(46, 4 + b, 38, 52 + b, M.wood, { w: 2, lum: 0.55 });
    // robe: a tattered cone
    const hem = [0, 1, 0, 2, 1, 0, 2].map((v, i) => [12 + i * 5, 50 + v + ((i + f) % 2)]);
    s.poly(
        [
            [22, 10 + b],
            [36, 10 + b],
            [44, 30 + b],
            [46, 48],
            ...hem.reverse(),
            [12, 48],
            [16, 30 + b]
        ],
        M.cloth,
        {
            g: 'robe'
        }
    );
    // hood
    s.ellipse(29, 12 + b, 9, 9.5, M.cloth, { g: 'robe', bias: 0.05 });
    s.ellipse(30, 14 + b, 5.6, 6, M.cloth, { shade: 'flat', lum: 0.02 });
    // skull
    s.ellipse(30.5, 14 + b, 4, 4.4, M.horn, { g: 'skull', bias: -0.1 });
    s.auto('skull', { R: 1.8, grad: 0.3 });
    glowEyes(s, [
        [28, 13 + b],
        [29, 13 + b],
        [32, 13 + b],
        [33, 13 + b],
        [28, 14 + b],
        [32, 14 + b]
    ]);
    s.patch(29, 17 + b, ['X.X.X', '.X.X.'], { X: '#1E170C' });
    // bony hands on the handle
    s.circle(42, 26 + b, 2.4, M.horn, { bias: -0.1 });
    s.circle(40.5, 36 + b, 2.2, M.horn, { bias: -0.15 });
    // the blade: a red chart line that crashes downward, glowing
    const blade = [
        [46, 4],
        [50, 3],
        [52, 6],
        [54, 5],
        [56, 10],
        [57, 16],
        [58, 24]
    ];
    for (let i = 0; i < blade.length - 1; i++) {
        const [x0, y0] = blade[i];
        const [x1, y1] = blade[i + 1];
        s.capsule(x0, y0 + b, x1, y1 + b, 1.4, 1.1, M.bear, { glow: '#FF3B5C', bias: 0.1 });
    }
    s.px(58, 25 + b, '#FFC9BF', { glow: '#FF3B5C' });
    return s.render();
}

/** 72×64 The Bear Market: the final boss. Crowned in red candles, scarred, roaring. */
export function bearMarket(f) {
    const s = new PixelSprite(72, 64, { dither: 0.45 });
    const ph = (f / 4) * TAU;
    const br = Math.sin(ph); // breathing
    const roar = f % 4 === 2 ? 1 : 0;
    s.auto('body', { R: 6, grad: 0.35 });
    s.auto('head', { R: 5, grad: 0.32 });
    s.auto('arms', { R: 3.5, grad: 0.3 });
    // legs
    s.capsule(24, 46, 22, 60, 6, 5.4, M.furDark, { g: 'legs' });
    s.capsule(48, 46, 50, 60, 6, 5.4, M.furDark, { g: 'legs' });
    s.auto('legs', { R: 3, grad: 0.25 });
    s.pxs(
        [
            [18, 62],
            [21, 62],
            [24, 62],
            [47, 62],
            [50, 62],
            [53, 62]
        ],
        '#EDE0BC'
    );
    // body
    s.ellipse(36, 38 + br * 0.5, 20 + br * 0.4, 18, M.furDark, { g: 'body' });
    // chest scar and the red down-arrow brand
    s.patch(
        30,
        31,
        [
            'RRRRRRRRRRRR',
            '.RRRRRRRRRR.',
            '..RRRRRRRR..',
            '...RRRRRR...',
            '....RRRR....',
            '.....RR.....'
        ],
        { R: C.red },
        { glow: '#FF3B5C' }
    );
    s.line(22, 30, 28, 44, M.furDark, { lum: 0.95, w: 1 });
    // arms raised, claws out
    s.capsule(18, 30, 6, 16 + br, 5, 4.2, M.furDark, { g: 'arms' });
    s.capsule(54, 30, 66, 16 + br, 5, 4.2, M.furDark, { g: 'arms' });
    s.circle(6, 14 + br, 4.4, M.furDark, { g: 'arms' });
    s.circle(66, 14 + br, 4.4, M.furDark, { g: 'arms' });
    for (const [x, y] of [
        [2, 9],
        [5, 8],
        [8, 9],
        [63, 9],
        [66, 8],
        [69, 9]
    ]) {
        s.px(x, y + br, '#FFFBEA').px(x, y - 1 + br, '#CDB787');
    }
    // head
    const hy = 17 + br * 0.5;
    s.circle(24, hy - 9, 4.6, M.furDark, { g: 'head' });
    s.circle(48, hy - 9, 4.6, M.furDark, { g: 'head' });
    s.ellipse(36, hy, 14, 11.5, M.furDark, { g: 'head' });
    s.ellipse(36, hy + 5, 7, 4.8 + roar, M.fur, { g: 'snout' });
    s.auto('snout', { R: 2.6, grad: 0.25 });
    s.px(24, hy - 9, '#2E0D12').px(48, hy - 9, '#2E0D12');
    // crown of red candles
    for (const [x, hgt] of [
        [27, 5],
        [31, 7],
        [36, 9],
        [41, 7],
        [45, 5]
    ]) {
        s.box(x - 1, hy - 11 - hgt, 3, hgt, M.bear, { r: 0.5, bevel: 1, glow: null });
        s.line(x + 0.5, hy - 13 - hgt, x + 0.5, hy - 11 - hgt, M.bearDark, { w: 1 });
    }
    // nose, mouth, fangs
    s.patch(34, Math.round(hy + 2), ['XXXXX', '.XXX.'], { X: C.ink });
    if (roar)
        s.patch(31, Math.round(hy + 6), ['XXXXXXXXXXX', 'XWXXXXXXXWX', '.XXXXXXXXX.'], {
            X: '#0A0304',
            W: '#FFFBEA'
        });
    else
        s.patch(32, Math.round(hy + 7), ['W.......W', 'XXXXXXXXX'], { X: '#0A0304', W: '#FFFBEA' });
    // eyes
    const ey = Math.round(hy - 2);
    s.patch(26, ey - 2, ['XXX..........XXX', '.XXXX......XXXX.', '...XX......XX...'], {
        X: '#0A0304'
    });
    glowEyes(s, [
        [28, ey + 1],
        [29, ey + 1],
        [30, ey + 1],
        [42, ey + 1],
        [43, ey + 1],
        [44, ey + 1],
        [29, ey + 2],
        [43, ey + 2]
    ]);
    // scar over the left eye
    s.pxs(
        [
            [27, ey - 3],
            [28, ey - 1],
            [29, ey + 3],
            [30, ey + 4]
        ],
        '#C9685A'
    );
    return s.render();
}

/** 66×60 The Long Winter: crypto winter with a face. Frost fur, icicles, cold blue eyes. */
export function longWinter(f) {
    const s = new PixelSprite(66, 60, { dither: 0.45 });
    const ph = (f / 4) * TAU;
    const br = Math.sin(ph);
    s.auto('body', { R: 6, grad: 0.35 });
    s.auto('head', { R: 5, grad: 0.3 });
    s.auto('arms', { R: 3.2, grad: 0.3 });
    s.capsule(22, 44, 21, 56, 5.5, 5, M.snow, { g: 'legs', bias: -0.1 });
    s.capsule(44, 44, 45, 56, 5.5, 5, M.snow, { g: 'legs', bias: -0.1 });
    s.auto('legs', { R: 3, grad: 0.25 });
    s.ellipse(33, 36 + br * 0.5, 19, 17, M.snow, { g: 'body' });
    s.ellipse(33, 39, 10, 10, M.snow, { g: 'belly', bias: 0.12 });
    s.auto('belly', { R: 4, grad: 0.3 });
    s.capsule(16, 28, 7, 42 + br, 5, 4.4, M.snow, { g: 'arms' });
    s.capsule(50, 28, 59, 42 + br, 5, 4.4, M.snow, { g: 'arms' });
    // icicles hanging from the arms and chin
    for (const [x, y, l] of [
        [6, 45, 5],
        [9, 46, 3],
        [57, 45, 5],
        [60, 46, 3],
        [29, 30, 3],
        [37, 30, 3]
    ])
        s.poly(
            [
                [x - 1, y + br],
                [x + 1, y + br],
                [x, y + l + br]
            ],
            M.ice,
            { lum: 0.8, glow: null }
        );
    const hy = 17 + br * 0.5;
    s.circle(21, hy - 9, 4, M.snow, { g: 'head' });
    s.circle(45, hy - 9, 4, M.snow, { g: 'head' });
    s.ellipse(33, hy, 13, 11, M.snow, { g: 'head' });
    s.ellipse(33, hy + 5, 6.5, 4.4, M.snow, { g: 'snout', bias: 0.1 });
    s.auto('snout', { R: 2.4, grad: 0.25 });
    // frost crown: ice shards
    for (const [x, hgt] of [
        [25, 5],
        [29, 8],
        [33, 10],
        [37, 8],
        [41, 5]
    ])
        s.poly(
            [
                [x - 2, hy - 9],
                [x + 2, hy - 9],
                [x, hy - 9 - hgt]
            ],
            M.ice,
            { top: 1, bot: 0.5 }
        );
    s.patch(31, Math.round(hy + 2), ['XXXXX', '.XXX.'], { X: '#18222F' });
    s.patch(29, Math.round(hy + 7), ['W.......W', 'XXXXXXXXX'], { X: '#18222F', W: '#FFFFFF' });
    const ey = Math.round(hy - 2);
    s.patch(23, ey - 2, ['XXX..........XXX', '.XXXX......XXXX.'], { X: '#18222F' });
    glowEyes(
        s,
        [
            [25, ey + 1],
            [26, ey + 1],
            [27, ey + 1],
            [39, ey + 1],
            [40, ey + 1],
            [41, ey + 1],
            [26, ey + 2],
            [40, ey + 2]
        ],
        '#9BE2FF'
    );
    // breath
    if (f % 2 === 0)
        s.pxs(
            [
                [36, Math.round(hy + 11)],
                [38, Math.round(hy + 12)],
                [40, Math.round(hy + 11)]
            ],
            '#E8FAFF',
            { glow: '#9BE2FF', bare: true }
        );
    return s.render();
}
