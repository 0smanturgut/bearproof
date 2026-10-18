// Bosses, drawn with the pixel-art engine (art/pixel.js). Big sprites get light ordered dithering for
// texture. Frames: 0-3 idle/advance cycle.

import { PixelSprite, mat } from './pixel.js';
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

/**
 * 48×44 Withdrawal Freeze: a bear carved out of ice, hugging a frosted vault shut with a gold padlock.
 * Crypto Winter's mini-boss: withdrawals are paused.
 */
export function withdrawalFreeze(f) {
    const s = new PixelSprite(48, 44, { dither: 0.4 });
    const ph = (f / 4) * TAU;
    const b = Math.round(Math.sin(ph));
    const step = Math.round(Math.cos(ph) * 1.5);
    s.auto('body', { R: 4.5, grad: 0.34 });
    s.auto('head', { R: 3.8, grad: 0.3 });
    s.auto('arms', { R: 2.6, grad: 0.3 });
    s.auto('legs', { R: 2.4, grad: 0.25 });
    // legs, stepping in turn
    s.capsule(16, 33, 15, 40 - Math.max(0, step), 4.2, 4, M.ice, { g: 'legs', bias: -0.15 });
    s.capsule(32, 33, 33, 40 - Math.max(0, -step), 4.2, 4, M.ice, { g: 'legs', bias: -0.15 });
    // body
    s.ellipse(24, 27 + b * 0.5, 14, 12, M.ice, { g: 'body' });
    // ears and head
    const hy = 12 + b * 0.5;
    s.circle(14, hy - 6, 3.4, M.ice, { g: 'head' });
    s.circle(34, hy - 6, 3.4, M.ice, { g: 'head' });
    s.ellipse(24, hy, 10.5, 8.5, M.ice, { g: 'head' });
    s.ellipse(24, hy + 4, 5, 3.4, M.snow, { g: 'snout', bias: 0.1 });
    s.auto('snout', { R: 2, grad: 0.25 });
    // the vault, held against the belly: steel door, frost on top, a dial and a gold padlock
    const vy = 22 + b;
    s.box(15, vy, 18, 14, M.metal, { g: 'vault', bias: 0.05 });
    s.auto('vault', { R: 1.6, grad: 0.3 });
    s.box(17, vy + 2, 14, 10, M.metal, { shade: 'flat', lum: 0.38 });
    s.circle(21, vy + 7, 2.6, M.metal, { lum: 0.75 });
    s.px(21, vy + 7, '#14181E');
    s.px(21, vy + 5, '#E3E8EE');
    // padlock on the right of the door
    s.box(26, vy + 6, 5, 4, M.gold, { shade: 'flat', lum: 0.7 });
    s.patch(26, vy + 3, ['.XXX.', 'X...X', 'X...X'], { X: '#C28100' });
    s.px(28, vy + 7, '#3A2200');
    s.px(28, vy + 8, '#3A2200');
    // frost crust along the top of the vault, with icicles
    for (let x = 15; x < 33; x++) s.px(x, vy, x % 3 ? '#E8FAFF' : '#9BE2FF');
    for (const [x, l] of [
        [17, 2],
        [22, 3],
        [30, 2]
    ])
        s.poly(
            [
                [x - 1, vy + 1],
                [x + 1, vy + 1],
                [x, vy + 1 + l]
            ],
            M.ice,
            { lum: 0.85 }
        );
    // arms wrapped round the vault
    s.capsule(11, 20 + b, 15, 31 + b, 3.6, 3.2, M.ice, { g: 'arms' });
    s.capsule(37, 20 + b, 33, 31 + b, 3.6, 3.2, M.ice, { g: 'arms' });
    // face: dark nose, angry brow, dark sockets with cold glowing eyes
    s.patch(22, Math.round(hy + 2), ['XXXXX', '.XXX.'], { X: '#030E1A' });
    const ey = Math.round(hy - 2);
    s.patch(16, ey - 1, ['XXX..........XXX', '.XXXX......XXXX.', '..XXX......XXX..'], {
        X: '#030E1A'
    });
    glowEyes(s, [
        [18, ey + 1],
        [19, ey + 1],
        [28, ey + 1],
        [29, ey + 1]
    ]);
    // frosty breath on alternate frames
    if (f % 2 === 1)
        s.pxs(
            [
                [28, Math.round(hy + 7)],
                [30, Math.round(hy + 8)]
            ],
            '#E8FAFF',
            { glow: '#9BE2FF', bare: true }
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

// ---------------------------------------------------------------- Market Eras

// 2009 office hardware, a farmer's straw and denim, and the neon of an altcoin season
const BEIGE = mat(['#221C12', '#463A26', '#74664A', '#A69878', '#D2C7A4', '#F2ECD2'], {
    line: '#120E08'
});
const STRAW = mat(['#3A2A08', '#6E5214', '#A8822A', '#D8B04A', '#F2D47C', '#FFF0BE'], {
    line: '#1E1504'
});
const DENIM = mat(['#10182E', '#1E2C52', '#2E4680', '#4566AE', '#6E90D2', '#B0C8F0'], {
    line: '#080C18'
});
const NEON_PINK = mat(['#2A0626', '#5E0E58', '#A0168E', '#FF2BD6', '#FF8AEC', '#FFE0FA'], {
    line: '#16020F'
});
const NEON_CYAN = mat(['#062A2E', '#0A5A66', '#0E9AAE', '#22E6FF', '#9AF6FF', '#E8FEFF'], {
    line: '#021416'
});
const CRT = '#3CFF7A';
const PINK = '#FF2BD6';
const CYAN = '#22E6FF';

/**
 * 56×50 Hacked Exchange: the Genesis era's boss. A 2009 exchange's beige server-vault turned bear, its door
 * hanging open, the padlock cracked, withdrawal slips and keys spilling out. Not your keys.
 * Frames 0-3: the door swings on its hinge, the slips flutter, the body bobs.
 */
export function hackedExchange(f) {
    const s = new PixelSprite(56, 50, { dither: 0.4 });
    const ph = (f / 4) * TAU;
    const b = Math.round(Math.sin(ph));
    const swing = [0, 1, 2, 1][f % 4];
    s.auto('body', { R: 3.5, grad: 0.34 });
    s.auto('head', { R: 3.5, grad: 0.3 });
    s.auto('legs', { R: 2.4, grad: 0.25 });
    s.auto('arms', { R: 2.4, grad: 0.3 });
    // stubby bear legs with pale claws
    s.capsule(21, 40, 20, 46, 4, 3.6, M.furDark, { g: 'legs', bias: -0.1 });
    s.capsule(36, 40, 37, 46, 4, 3.6, M.furDark, { g: 'legs', bias: -0.1 });
    s.pxs(
        [
            [17, 49],
            [20, 49],
            [23, 49],
            [34, 49],
            [37, 49],
            [40, 49]
        ],
        '#EDE0BC'
    );
    // the right arm, out of the side of the cabinet, clutching the last key
    s.capsule(42, 24 + b, 49, 33 + b, 3.2, 2.8, M.furDark, { g: 'arms' });
    s.circle(49.5, 34 + b, 2.8, M.furDark, { g: 'arms' });
    s.patch(47, 37 + b, ['.YY.', 'Y..Y', '.YY.', '..Y.', '..YY', '..Y.', '..YY'], { Y: C.gold });
    // the cabinet: a beige 2009 server-vault, rivets at the corners
    s.box(12, 15 + b, 32, 28, BEIGE, { g: 'body', r: 2 });
    for (const [x, y] of [
        [14, 17],
        [41, 17],
        [14, 40],
        [41, 40]
    ])
        s.px(x, y + b, '#F2ECD2').px(x + 1, y + 1 + b, '#463A26');
    // the CRT on the right: green text, a blinking cursor
    s.box(29, 18 + b, 13, 10, M.cloth, { shade: 'flat', lum: 0.45 });
    s.box(30, 19 + b, 11, 8, M.cloth, { shade: 'flat', lum: 0 });
    for (const [y, len] of [
        [20, 7],
        [22, 5],
        [24, 8]
    ])
        for (let k = 0; k < len; k++)
            if ((k + y) % 4 !== 3) s.px(31 + k, y + b, k ? CRT : '#B8FFD0', { glow: CRT });
    if (f % 2 === 0) s.px(37, 24 + b, '#B8FFD0', { glow: CRT }).px(38, 24 + b, CRT, { glow: CRT });
    // status lights and vents under the screen
    for (const [i, x] of [31, 33, 35].entries()) {
        const on = (i + f) % 3 !== 0;
        const c = i === 2 ? (on ? C.red : '#5E1F16') : on ? CRT : '#1A5A2E';
        s.px(x, 30 + b, c, on ? { glow: c } : {});
    }
    for (let y = 33; y <= 39; y += 2) s.line(30, y + b, 41, y + b, BEIGE, { lum: 0.12 });
    // the open doorway: dark inside, a bare shelf, slips still sliding out
    s.box(15, 19 + b, 12, 20, M.cloth, { shade: 'flat', lum: 0.02 });
    s.line(16, 28 + b, 25, 28 + b, M.metal, { lum: 0.3 });
    s.px(24, 27 + b, C.gold).px(23, 27 + b, '#C28100'); // one coin left
    for (const [x, y] of [
        [19, 31 + ((f + 1) % 4)],
        [23, 33 + (f % 4)],
        [17, 35 + ((f + 2) % 3)]
    ])
        s.px(x, y + b, '#EEF1F5').px(x + 1, y + b, '#AEB5C0');
    // the door, swung out on its hinge (left edge), with a dial and bolts
    const dw = 10 - swing * 2;
    const hx = 15;
    s.poly(
        [
            [hx, 19 + b],
            [hx, 39 + b],
            [hx - dw, 41 + b],
            [hx - dw, 17 + b]
        ],
        M.metal,
        { left: 0.75, right: 0.4 }
    );
    s.line(hx - dw, 17 + b, hx - dw, 41 + b, M.metal, { lum: 0.9 });
    s.ellipse(hx - dw / 2, 28 + b, Math.max(1.2, dw * 0.22), 3.4, M.metal, { lum: 0.6, flat: 0.8 });
    s.px(Math.round(hx - dw / 2), 28 + b, '#14181E');
    for (const y of [21, 36]) s.px(hx - 1, y + b, '#E3E8EE').px(hx - 2, y + b, '#E3E8EE');
    // the padlock hanging off the door's edge, its shackle snapped and a crack through the body
    const lx = hx - dw - 2;
    const ly = 31 + b + (swing % 2);
    s.patch(lx, ly, ['.XX..', 'X....', 'X...X'], { X: '#C28100' });
    s.box(lx - 1, ly + 3, 7, 5, M.gold, { r: 1, bevel: 1.5 });
    s.px(lx + 2, ly + 5, '#3A2200');
    s.pxs(
        [
            [lx + 3, ly + 3],
            [lx + 4, ly + 4],
            [lx + 3, ly + 5],
            [lx + 4, ly + 6],
            [lx + 5, ly + 7]
        ],
        '#221400'
    );
    // withdrawal slips and keys spilling out round its feet, fluttering
    const slips = [
        [9, 44],
        [13, 46],
        [5, 47],
        [26, 46],
        [3, 41],
        [45, 45]
    ];
    slips.forEach(([x, y], i) => {
        const up = (i + f) % 2;
        const dx = i < 4 ? 0 : [0, -1, 0, 1][(f + i) % 4];
        s.box(x + dx, y - up, 3, 2, M.paper, { shade: 'flat', lum: up ? 0.95 : 0.75 });
        s.px(x + dx + 1, y - up, '#7C8390');
    });
    s.patch(16, 46, ['.Y....', 'Y.YYYY', '.Y.Y.Y'], { Y: C.gold });
    s.patch(29, 44, ['Y.Y', '.Y.', '.Y.', 'YY.'], { Y: '#FFE08A' });
    // the bear head on top: dark fur, round ears, snout, red glowing eyes under a hard brow
    const hy = 10 + b;
    s.circle(19.5, hy - 5, 3.2, M.furDark, { g: 'head' });
    s.circle(36.5, hy - 5, 3.2, M.furDark, { g: 'head' });
    s.ellipse(28, hy, 9.5, 7.5, M.furDark, { g: 'head' });
    s.ellipse(28, hy + 3.5, 4.2, 3, M.fur, { g: 'snout' });
    s.auto('snout', { R: 2, grad: 0.2 });
    s.px(19.5, hy - 5, '#2E0D12').px(36.5, hy - 5, '#2E0D12');
    s.patch(27, hy + 2, ['XXX', '.X.'], { X: C.ink });
    s.pxs(
        [
            [26, hy + 6],
            [30, hy + 6]
        ],
        '#FFFBEA'
    );
    s.patch(21, hy - 3, ['XX..........XX', '.XXX......XXX.', '...XX....XX...'], { X: '#0A0304' });
    glowEyes(s, [
        [23, hy - 1],
        [24, hy - 1],
        [25, hy - 1],
        [30, hy - 1],
        [31, hy - 1],
        [32, hy - 1],
        [24, hy],
        [31, hy]
    ]);
    return s.render();
}

/**
 * 54×56 Yield Farm: DeFi Summer's boss. A bloated, smug farmer bear in a straw hat and dungarees, a gold "%" on
 * the bib, sprouts on its shoulders, a huge pitchfork, and a green coin of its own token to pay you with.
 * Frames 0-3: a slow bob, the pitchfork swaying.
 */
export function yieldFarm(f) {
    const s = new PixelSprite(54, 56, { dither: 0.4 });
    const ph = (f / 4) * TAU;
    const b = Math.round(Math.sin(ph));
    const sway = [0, 1, 0, -1][f % 4];
    s.auto('body', { R: 5, grad: 0.34 });
    s.auto('head', { R: 4, grad: 0.3 });
    s.auto('arms', { R: 2.8, grad: 0.3 });
    s.auto('legs', { R: 2.6, grad: 0.25 });
    s.auto('overalls', { R: 3.5, grad: 0.32 });
    // the pitchfork, behind the right arm: a long wooden handle, three steel prongs
    const tx = 46 + sway * 1.5;
    const ty = 11 + b;
    s.line(tx, ty, 43, 55, M.wood, { w: 2, lum: 0.6 });
    s.line(tx - 4, ty, tx + 4, ty, M.metal, { w: 1.6, lum: 0.55 });
    for (const dx of [-4, 0, 4]) {
        s.line(tx + dx, ty, tx + dx + sway * 0.5, ty - 8, M.metal, { w: 1.3, lum: 0.75 });
        s.px(tx + dx + sway * 0.5, ty - 9, '#E3E8EE');
    }
    // legs in denim, muddy boots
    s.capsule(19, 44, 18, 50, 4.4, 4, DENIM, { g: 'legs', bias: -0.1 });
    s.capsule(35, 44, 36, 50, 4.4, 4, DENIM, { g: 'legs', bias: -0.1 });
    s.box(12, 49, 10, 6, M.wood, { r: 2, bevel: 2 });
    s.box(32, 49, 10, 6, M.wood, { r: 2, bevel: 2 });
    // the bloated body
    s.ellipse(27, 34 + b * 0.5, 18, 15, M.fur, { g: 'body' });
    // dungarees: the seat round the belly, the bib, two straps, gold buttons
    s.ellipse(27, 40 + b * 0.5, 16.5, 9.5, DENIM, { g: 'overalls' });
    s.box(18, 26 + b, 18, 14, DENIM, { g: 'overalls', r: 1 });
    s.line(19, 27 + b, 15, 21 + b, DENIM, { w: 2.4, lum: 0.55 });
    s.line(35, 27 + b, 39, 21 + b, DENIM, { w: 2.4, lum: 0.45 });
    s.px(19, 27 + b, C.gold).px(35, 27 + b, C.gold);
    // stitching along the bib
    for (let x = 20; x < 35; x += 2) s.px(x, 38 + b, '#6E90D2');
    // the gold % on the bib
    s.patch(
        23,
        29 + b,
        ['YY...Y', 'YY..Y.', '...Y..', '..Y...', '.Y..YY', 'Y...YY'],
        { Y: '#FFE08A' },
        { glow: C.gold }
    );
    // arms: the left one offers a coin of its own token, the right grips the pitchfork
    s.capsule(11, 26 + b, 7, 37 + b, 3.6, 3.2, M.fur, { g: 'arms' });
    s.capsule(43, 26 + b, 44, 35 + b, 3.6, 3.2, M.fur, { g: 'arms' });
    s.circle(7, 38 + b, 3, M.fur, { g: 'arms' });
    s.circle(44, 36 + b, 3, M.fur, { g: 'arms' });
    s.circle(7.5, 41.5 + b, 3, M.frog, { g: 'token' });
    s.auto('token', { R: 1.4, grad: 0.3 });
    s.patch(6, 40 + b, ['.L.', 'LL.', '.L.'], { L: '#CFF39A' }, { glow: C.green });
    // sprouts growing out of its shoulders, taller every other frame
    for (const [x, y] of [
        [12, 22],
        [41, 22]
    ]) {
        const h = 3 + (f % 2);
        s.line(x, y + b, x, y + b - h, M.frog, { lum: 0.55 });
        s.px(x - 1, y + b - h, '#86D25E').px(x - 2, y + b - h - 1, '#CFF39A');
        s.px(x + 1, y + b - h + 1, '#4FAA3E').px(x + 2, y + b - h, '#86D25E');
    }
    // the head and its round ears, poking out above the hat brim
    const hy = 17 + b;
    s.circle(17, hy - 8, 3.2, M.fur, { g: 'head' });
    s.circle(37, hy - 8, 3.2, M.fur, { g: 'head' });
    s.ellipse(27, hy, 11, 8.5, M.fur, { g: 'head' });
    s.ellipse(27, hy + 4, 5, 3.4, M.belly, { g: 'snout' });
    s.auto('snout', { R: 2, grad: 0.22 });
    // straw hat: a wide brim, a crown, a red band
    const by = hy - 8;
    s.ellipse(27, by, 16, 2.8, STRAW, { g: 'hat', flat: 0.7 });
    s.box(20, by - 7, 14, 7, STRAW, { g: 'hat', r: 2 });
    s.auto('hat', { R: 2, grad: 0.3 });
    s.box(20, by - 3, 14, 2, M.bear, { shade: 'flat', lum: 0.5 });
    for (let x = 13; x <= 41; x += 3) s.px(x, by + (x % 2), '#A8822A');
    // smug face: half-lidded glowing eyes, a smirk, a stalk of wheat in the corner of the mouth
    const ey = hy - 2;
    s.patch(20, ey - 1, ['.XXXX......XXXX.', 'X....X....X....X'], { X: '#43200F' });
    glowEyes(s, [
        [21, ey],
        [22, ey],
        [23, ey],
        [31, ey],
        [32, ey],
        [33, ey]
    ]);
    s.patch(26, hy + 2, ['XXX', '.X.'], { X: C.ink });
    s.pxs(
        [
            [24, hy + 5],
            [25, hy + 6],
            [26, hy + 6],
            [27, hy + 6],
            [28, hy + 6],
            [29, hy + 5],
            [30, hy + 4]
        ],
        '#1E0D0A'
    );
    s.line(30, hy + 5, 36, hy + 2 - sway * 0.5, STRAW, { lum: 0.8 });
    s.px(37, hy + 1 - sway * 0.5, '#FFF0BE');
    return s.render();
}

/**
 * 62×62 Peak Euphoria: Altcoin Season's boss. A huge bear at the top of the cycle, arms up: party hat, neon
 * shades, gold chains with a number-go-up medallion, rocket boots, a manic grin. This time it's different.
 * Frames 0-3: the boot flames flicker, the confetti falls, the body bobs.
 */
export function peakEuphoria(f) {
    const s = new PixelSprite(62, 62, { dither: 0.4 });
    const ph = (f / 4) * TAU;
    const b = Math.round(Math.sin(ph));
    s.auto('body', { R: 6, grad: 0.35 });
    s.auto('head', { R: 5, grad: 0.3 });
    s.auto('arms', { R: 3.2, grad: 0.3 });
    s.auto('legs', { R: 3, grad: 0.25 });
    // the rocket flames under the boots: neon pink round a white-hot core
    const flame = [
        ['.PYWYP.', '.PYWYP.', '..PYP..', '..PYP..', '...P...'],
        ['PPYWYPP', '.PYWYP.', '.PYYYP.', '..PYP..', '..P.P..'],
        ['.PYWYP.', '.PYWYP.', '.PYWYP.', '..PYP..', '..PP...'],
        ['PPYWYPP', '.PYWYP.', '..PYP..', '...P...', '...P...']
    ][f % 4];
    for (const x of [20, 38])
        s.patch(x, 57, flame, { W: '#FFFFFF', Y: '#FFE08A', P: PINK }, { glow: PINK, bare: true });
    // legs and rocket boots: steel, a pink stripe, a dark nozzle
    s.capsule(24, 46 + b, 23, 51, 5, 4.6, M.fur, { g: 'legs', bias: -0.1 });
    s.capsule(38, 46 + b, 39, 51, 5, 4.6, M.fur, { g: 'legs', bias: -0.1 });
    for (const x of [17, 35]) {
        s.box(x, 50, 11, 6, M.metal, { r: 2, bevel: 2 });
        s.box(x, 52, 11, 1, NEON_PINK, { shade: 'flat', lum: 0.6, glow: PINK });
        s.box(x + 2, 55, 7, 2, M.metal, { shade: 'flat', lum: 0.15 });
    }
    // arms thrown up: to the moon
    s.capsule(16, 30 + b, 7, 13 + b, 5, 4.2, M.fur, { g: 'arms' });
    s.capsule(46, 30 + b, 55, 13 + b, 5, 4.2, M.fur, { g: 'arms' });
    s.circle(6.5, 11 + b, 4, M.fur, { g: 'arms' });
    s.circle(55.5, 11 + b, 4, M.fur, { g: 'arms' });
    for (const [x, y] of [
        [3, 7],
        [6, 6],
        [9, 7],
        [53, 7],
        [56, 6],
        [59, 7]
    ])
        s.px(x, y + b, '#FFFBEA');
    // the body and its pale belly
    s.ellipse(31, 38 + b, 19, 13.5, M.fur, { g: 'body' });
    s.ellipse(31, 40 + b, 10.5, 9, M.belly, { g: 'belly' });
    s.auto('belly', { R: 4, grad: 0.3 });
    // gold chains, two of them, the long one with a number-go-up medallion
    for (const [depth, w, y0] of [
        [6, 11, 27],
        [11, 13, 26]
    ])
        for (let x = 31 - w; x <= 31 + w; x++) {
            const u = (x - 31) / w;
            const y = Math.round(y0 + depth * (1 - u * u) + b);
            s.px(x, y, x % 2 ? '#FFE08A' : '#C28100');
        }
    s.circle(31, 40 + b, 3.4, M.gold, { g: 'medal' });
    s.auto('medal', { R: 1.6, grad: 0.3 });
    s.patch(29, 38 + b, ['..G..', '.GGG.', 'GGGGG', '..G..'], { G: C.green }, { glow: C.green });
    // the head
    const hy = 21 + b;
    s.circle(20, hy - 8, 4, M.fur, { g: 'head' });
    s.circle(41, hy - 8, 4, M.fur, { g: 'head' });
    s.ellipse(30.5, hy, 13, 10.5, M.fur, { g: 'head' });
    s.ellipse(30.5, hy + 5, 7, 4.6, M.belly, { g: 'snout' });
    s.auto('snout', { R: 2.4, grad: 0.25 });
    s.px(20, hy - 8, '#43200F').px(41, hy - 8, '#43200F');
    // party hat, tipped at a jaunty angle, striped cyan, a gold pompom
    const hb = hy - 8;
    s.poly(
        [
            [24, hb + 1],
            [37, hb - 1],
            [35, hb - 17]
        ],
        NEON_PINK,
        { left: 0.85, right: 0.45 }
    );
    for (const k of [4, 9])
        s.line(26 + k * 0.25, hb - k + 1, 36.5 - k * 0.1, hb - k - 0.6, NEON_CYAN, {
            lum: 0.8,
            glow: CYAN
        });
    s.circle(35, hb - 18, 2, M.gold, { g: 'pom' });
    s.auto('pom', { R: 1, grad: 0.3 });
    // neon shades: pink frames, glowing cyan lenses with a white glint
    s.patch(
        21,
        hy - 4,
        [
            'PPPPPPPPPPPPPPPPPPPP',
            'PCCCWCCP....PCCCWCCP',
            'PCCCCCCP....PCCCCCCP',
            '.PCCCCP......PCCCCP.',
            '..PPPP........PPPP..'
        ],
        { P: PINK, C: CYAN, W: '#E8FEFF' },
        { glow: CYAN }
    );
    // nose and a manic open grin, all teeth
    s.patch(29, hy + 2, ['XXXX', '.XX.'], { X: C.ink });
    s.patch(
        24,
        hy + 5,
        ['X............X', 'XXXXXXXXXXXXXX', 'XWWWWWWWWWWWWX', '.XRRRRRRRRRRX.', '..XXXXXXXXXX..'],
        { X: '#1E0D0A', W: '#FFFBEA', R: '#C83A6A' }
    );
    // confetti, drifting down past it
    const conf = [
        [3, 22, PINK],
        [12, 3, CYAN],
        [50, 24, C.gold],
        [58, 30, PINK],
        [2, 40, CYAN],
        [46, 2, C.gold],
        [57, 46, CYAN],
        [5, 52, C.gold]
    ];
    conf.forEach(([x, y, c], i) => {
        const yy = (y + f * 2) % 58;
        s.px(x + ((i + f) % 2), yy + 1, c, { glow: c, bare: true });
    });
    return s.render();
}
