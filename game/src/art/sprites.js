// BEARPROOF procedural pixel art. 100% original, drawn as ASCII grids in code.
//
// Format: SPRITES[id] = { w, h, frames: string[][], colors: { char: paletteKeyOrHex } }
// Each frame is `h` strings of length `w`, one char per pixel, '.' = transparent.
// 'o' is always the ink outline. Sprites are authored WITHOUT their outer outline
// and `def()` adds a 1-px ink border at import time, so every sprite pops on the
// dark chart grid and the authored grids stay easy to edit.
//
// Side-view sprites face RIGHT. The renderer flips them for leftward movement.
// No DOM access at import time: this module is also imported by Node tests.

import { PAL, color } from './palette.js';

const T = '.';

// ---------------------------------------------------------------- helpers

/**
 * Pad `rows` by one pixel and ink-outline every filled pixel. The default 4-neighbour
 * outline rounds corners (creatures); `square` uses 8 neighbours for crisp boxes/candles.
 */
function outline(rows, bare = '', square = false) {
    const h = rows.length;
    const w = rows[0].length;
    const solid = (x, y) =>
        x >= 0 && y >= 0 && x < w && y < h && rows[y][x] !== T && !bare.includes(rows[y][x]);
    const out = [];
    for (let y = -1; y <= h; y++) {
        let line = '';
        for (let x = -1; x <= w; x++) {
            const c = x >= 0 && y >= 0 && x < w && y < h ? rows[y][x] : T;
            if (c !== T) line += c;
            else if (
                solid(x - 1, y) ||
                solid(x + 1, y) ||
                solid(x, y - 1) ||
                solid(x, y + 1) ||
                (square &&
                    (solid(x - 1, y - 1) ||
                        solid(x + 1, y - 1) ||
                        solid(x - 1, y + 1) ||
                        solid(x + 1, y + 1)))
            )
                line += 'o';
            else line += T;
        }
        out.push(line);
    }
    return out;
}

/** Mirror a left half into a symmetric row set. */
function mirror(half) {
    return half.map((r) => r + r.split('').reverse().join(''));
}

/** Overlay `patch` onto `rows` at (x, y). Spaces in the patch keep the base pixel. */
function stamp(rows, x, y, patch) {
    const out = rows.map((r) => r.split(''));
    patch.forEach((line, dy) => {
        for (let dx = 0; dx < line.length; dx++) {
            const ch = line[dx];
            const ty = y + dy;
            const tx = x + dx;
            if (ch === ' ' || ty < 0 || ty >= out.length || tx < 0 || tx >= out[0].length) continue;
            out[ty][tx] = ch;
        }
    });
    return out.map((r) => r.join(''));
}

/** Replace chars by a map, e.g. recolor(rows, { R: 'L' }). */
function recolor(rows, map) {
    return rows.map((r) =>
        r
            .split('')
            .map((c) => map[c] || c)
            .join('')
    );
}

/** Shift rows down by dy (positive) or up (negative), keeping the height. */
function shiftY(rows, dy) {
    const w = rows[0].length;
    const blank = T.repeat(w);
    if (dy > 0) return [...Array(dy).fill(blank), ...rows.slice(0, rows.length - dy)];
    return [...rows.slice(-dy), ...Array(-dy).fill(blank)];
}

/** Shift rows right by dx (positive) or left (negative), keeping the width. */
function shiftX(rows, dx) {
    return rows.map((r) =>
        dx > 0 ? T.repeat(dx) + r.slice(0, r.length - dx) : r.slice(-dx) + T.repeat(-dx)
    );
}

/**
 * Build a sprite definition. `opts.outline === false` keeps the grid as authored.
 * `opts.bare` lists chars that are drawn but do not get an outline (sparkles, strings).
 * `opts.square` gives the outline square corners (candles, crates).
 */
function def(colors, frames, opts = {}) {
    const done =
        opts.outline === false
            ? frames
            : frames.map((f) => outline(f, opts.bare || '', !!opts.square));
    const out = {
        w: done[0][0].length,
        h: done[0].length,
        frames: done,
        colors: { o: 'ink', ...colors }
    };
    if (opts.fps) out.fps = opts.fps;
    return out;
}

// Shared colour legends.
const BULL = {
    G: 'bull',
    D: 'bullDark',
    d: 'bullDeep',
    L: 'bullLight',
    W: 'horn',
    w: 'hornDark',
    Y: 'gold',
    y: 'goldDark'
};
const BEAR = { R: 'bear', D: 'bearDark', d: 'bearDeep', L: 'bearLight', W: 'white', k: 'bearDeep' };
const FUR = {
    B: 'brown',
    b: 'brownDark',
    d: 'brownDeep',
    l: 'brownLight',
    m: 'tan',
    R: 'bear',
    r: 'bearLight',
    W: 'horn'
};

// ---------------------------------------------------------------- player

const BULL_TOP = [
    '.......W.........W',
    '.......WW.......WW',
    '........Ww.....wW.',
    '....LLLL.wLLLLLw..',
    '..LLGGGGDLGGGGGGD.',
    '.DLGGGGGGLoGGGoG..',
    'D.GGGGGGGLGGGGGG..',
    'D.GGGGGGGGLLLLLG..',
    '.DGGGGGGGGLDLDLG..',
    '..DGGGGGGDLLLLLD..',
    '...DDDDDD..Y.Y....',
    '..GD.GD..GD.Y.GD..'
];
const bull = def(
    BULL,
    [
        [...BULL_TOP, '..GD.GD..GD...GD..', '..dd.dd..dd...dd..'],
        [...BULL_TOP, '..dd.GD..dd...GD..', '.....dd.......dd..']
    ],
    { fps: 8 }
);

// ---------------------------------------------------------------- enemies

const CANDLE_A = [
    '...D...',
    '...D...',
    'LLLLLLR',
    'LoRRRoR',
    'LWoRoWD',
    'LRRRRRD',
    'LRoooRD',
    'LoRRRoD',
    'LRRRRRD',
    'DDDDDDD',
    '...D...',
    '...D...'
];
const red_candle = def(BEAR, [CANDLE_A, shiftY(CANDLE_A, 1)], { fps: 4, square: true });

const BAG_TOP = [
    '.....qqqq.....',
    '....qPPPPPp...',
    '....PpoPpoP...',
    '....PPIPPPp...',
    '....pPPoopp...',
    '..oopPPPPpoo..',
    '.lBb.pPPp.lBb.',
    'lBBBbpPPplBBBb',
    'BBYBbpPPpBBYBb',
    'BBBBbpPPpBBBBb',
    '.bbb.p..p.bbb.'
];
const bag_holder = def(
    {
        B: 'brown',
        b: 'brownDark',
        l: 'brownLight',
        Y: 'gold',
        P: 'grey',
        p: 'greyDark',
        q: 'greyLight',
        I: 'info'
    },
    [
        [...BAG_TOP, '....pp..pp....'],
        [...stamp(BAG_TOP, 4, 3, ['PPPPPPp', 'pPIoopp']), '.....pp.pp....']
    ],
    { fps: 3 }
);

const PAPER_A = [
    '...W.W....',
    '.W.W.W.W.I',
    '.W.W.W.W.I',
    '.WWWWWWW..',
    '.WoWWoWW.W',
    '.WWWWWWWWW',
    '.WWoowWWw.',
    '..WWWWWw..',
    '..wWWWww..',
    '...wwww...'
];
const paper_hands = def({ W: 'paper', w: 'paperDark', I: 'info' }, [PAPER_A, shiftX(PAPER_A, -1)], {
    fps: 10
});

const rug_puller = def(
    { R: 'bear', D: 'bearDark', Y: 'gold', W: 'horn' },
    [
        [
            '.RRRRRRRRRRRR.',
            'WRYYYYYYYYYYRW',
            '.RYRDDRRDDRYR.',
            'WRYRWoRRWoRYRW',
            '.RYRRRRRRRoYR.',
            'WRYRRRooooRYRW',
            '.RYYYYYYYYYYR.',
            'WDDDDDDDDDDDDW'
        ],
        [
            '.RRRRRRRRRRRR.',
            '.RYYYYYYYYYYR.',
            'WRYRDDRRDDRYRW',
            '.RYRoWRRoWRYR.',
            'WRYRRRRRRRoYRW',
            '.RYRRRooooRYR.',
            'WRYYYYYYYYYYRW',
            '.DDDDDDDDDDDD.'
        ]
    ],
    { fps: 6 }
);

const GRIZ_TOP = [
    '.........bb.....bb',
    '....llll.bmlllllmb',
    '..llBBBBlbBBBBBBBb',
    '.lBBBBBBBlBdBBBdBb',
    'lBBBBBBBBlBRdBdRBb',
    'lBBBBBBBBlBBmmmBBb',
    'lBBBBBBBBlBmooomBb',
    'lBBBBBBBBBBmmommBb',
    'bBBBBBBBBBBoWkWobb',
    'bBBBBBBBBBBbmmmbb.',
    '.bBBBBBBBBBBbbbb..',
    '.bbBBBBbbbbBBBBb..'
];
const grizzly = def(
    { ...FUR, k: 'bearDeep' },
    [
        [
            ...GRIZ_TOP,
            '..bBBb....bBBb....',
            '..bBBb....bBBb....',
            '..bBBb....bBBb....',
            '..dddW....dddW....'
        ],
        [
            ...GRIZ_TOP,
            '.bBBb......bBBb...',
            '.bBBb......bBBb...',
            'bBBb........bBBb..',
            'dddW........dddW..'
        ]
    ],
    { fps: 4 }
);

const FUD_A = [
    '.....LLLL.....',
    '..LLLLPPPLLL..',
    '.LPPPPPPPPPPL.',
    'LPPoPPPPPPoPPp',
    'LPPWooPPooWPPp',
    'LPPPPPPPPPPPPp',
    '.pPPPPooooPPpp',
    '..ppppppppppp.',
    '.......YY.....',
    '......YY......'
];
const fud_cloud = def(
    { P: 'fud', p: 'fudDark', L: 'fudLight', W: 'white', Y: 'gold' },
    [
        FUD_A,
        stamp(FUD_A, 0, 0, ['...LLLL..LL...', '..LLPPPLLPPL..']).map((r, i) =>
            i === 8 ? '......YY......' : i === 9 ? '.......Y......' : r
        )
    ],
    { fps: 3 }
);

const DOOM_A = [
    '...MMM....',
    '..MHHHM...',
    '.MHHHHHM..',
    '.MHHoooor.',
    'MHHHoRoRo.',
    'MHHHooooo.',
    'HHHHHHHHr.',
    'HHHHHHMsSs',
    'hHHHHHMSSs',
    'hHHHHHhhhh',
    'hHHHHHHHh.',
    '.hhh..hhh.'
];
const doomposter = def(
    {
        H: 'shadow',
        h: 'shadowDark',
        M: 'shadowLight',
        R: 'bear',
        r: 'bearDark',
        S: 'bearLight',
        s: 'bear',
        L: 'bearLight'
    },
    [DOOM_A, recolor(DOOM_A, { S: 's', s: 'S', R: 'L' })],
    { fps: 3 }
);

const ponzi = def({ Y: 'gold', y: 'goldDark', L: 'goldLight', W: 'white' }, [
    [
        '......LL......',
        '.....LYYy.....',
        '.....yyyy.....',
        '...LLLLLLLy...',
        '...LYWWooWy...',
        '...yyyyyyyy...',
        '.LLLLLLLLLLLy.',
        '.LYYYYYYYYoYy.',
        '.yyyoWWWWoyyy.',
        'LLLLLLLLLLLLLy',
        'LYYYYYYYYYYYYy',
        'yyyyyyyyyyyyyy'
    ]
]);

const downline = def({ Y: 'gold', y: 'goldDark', L: 'goldLight', W: 'white' }, [
    ['..LY..', '.LWoy.', '.yyyy.', 'LYYYYy', 'yyyyyy']
]);

const margin_call = def(
    { ...BEAR, Y: 'gold' },
    [
        [
            '..........',
            '.LLLLLLLL.',
            'LRRRRRRRRD',
            'RRD....RRD',
            '.DD....DD.',
            '..LLLLLL..',
            '.LoRRRRoD.',
            '.RWoRRoWD.',
            '.RRRRRRRD.',
            '.RRRWWRRD.',
            '.RRWooWRD.',
            '.DDDWWDDD.'
        ],
        [
            '.WWWWWWWW.',
            'WLLLLLLLLR',
            'LLR....LLR',
            '.RR....RR.',
            'Y........Y',
            '..WWWWWW..',
            'YWoLLLLoRY',
            '.LWoLLoWR.',
            'YLLLLLLLRY',
            '.LLLWWLLR.',
            'YLLWooWLRY',
            '.RRRWWRRR.'
        ]
    ],
    { fps: 8, bare: 'Y' }
);

const sybil = def({ G: 'grey', g: 'greyDark', l: 'greyLight' }, [
    [
        '...llll...',
        '.llllGGGg.',
        '.lGGGGGGGg',
        'lGooGGooGg',
        'lGooGGooGg',
        'lGGGGGGGGg',
        'lGoGGGGoGg',
        '.lGooooGg.',
        '..gGGGGgg.',
        '...gggg...'
    ]
]);

// ---------------------------------------------------------------- bosses

const capitulation = def(
    BEAR,
    [
        [
            '......DD......',
            '......RD......',
            '......RD......',
            '......RD......',
            '......RD......',
            '......LD......',
            '......RD......',
            '......RD......',
            'LLLLLLLLLLLLLR',
            'LRRRRRRRRRRRRD',
            'LRRRRRRRRRRRRD',
            'LRooRRRRRRooRD',
            'LRRooRRRRooRRD',
            'LRWWooRRooWWRD',
            'LRWWWoRRoWWWRD',
            'LRRWWRRRRWWRRD',
            'LRRRRRRRRRRRRD',
            'LRRRRRRRRRRRRD',
            'LRRooooooooRRD',
            'LRoWWoWWoWWoRD',
            'LRokkkkkkkkoRD',
            'LRokkkkkkkkoRD',
            'LRoWWoWWoWWoRD',
            'LRRooooooooRRD',
            'LRRRRRRRRRRRRD',
            'LRRkRRRRRRRRRD',
            'LRRRkRRRRRRkRD',
            'LRRkRRRRRRkRRD',
            'LRkRRRRRRRRkRD',
            'LRRkRRRRRRkRRD',
            'LRRRkRRRRkRRRD',
            'LRRRRkRRRRRRRD',
            'DDDDDkDDDDDDDD',
            '......RD......',
            '......RD......',
            '......RD......',
            '......RD......',
            '......DD......'
        ]
    ],
    { square: true }
);

const LIQ_HALF = [
    '..bbb............',
    '.bllBb...........',
    '.blmBb...........',
    '.bBmBb..llllllll.',
    '..bBBllBBBBBBBBBB',
    '...lBBBBBBBBBBBBB',
    '..lBBBBBBBBBBBBBB',
    '.lBBBBBBBBBBBBBBB',
    '.lBBBBBBBBBBBBBBB',
    'lBBBBBoooBBBBBBBB',
    'lBBBBBBBooBBBBBBB',
    'lBBBBrRRRooBBBBBB',
    'lBBBBRRWRRoBBBBBB',
    'lBBBBBRRRBBBBBBBB',
    'lBBBBBBBBBBBmmmmm',
    'bBBBBBBBBBBmmmooo',
    'bBBBBBBBBBmmmmooo',
    'bBBBBBBBBmmmmmmmo',
    'bBBBBBBBmmooooooo',
    'bBBBBBBmmoWWoWWkk',
    'bbBBBBBmmokkkkkkk',
    '.bBBBBBmmokkkkkkk',
    '.bbBBBBBmoWWokkkk',
    '..bbBBBBmmooooooo',
    '...bbBBBBmmmmmmmm',
    '....bbbBBBBBBBBBB',
    '......bbbbbbbbbbb',
    '.................',
    '.................',
    '.................'
];
// Chain collar with a gold padlock, stamped across the jaw.
const CHAIN_A = '.hh..'.repeat(7).slice(0, 34);
const CHAIN_B = 'h..gg'.repeat(7).slice(0, 34);
const CHAIN_C = '.gg..'.repeat(7).slice(0, 34);
const liquidation = def(
    {
        ...FUR,
        G: 'grey',
        g: 'greyDark',
        h: 'greyLight',
        k: 'bearDeep',
        W: 'white',
        Y: 'gold',
        y: 'goldDark',
        L: 'goldLight'
    },
    [
        stamp(stamp(mirror(LIQ_HALF), 0, 24, [CHAIN_A, CHAIN_B, CHAIN_C]), 12, 23, [
            '  .hhhh.',
            '  h....h',
            ' LYYYYYYy',
            ' YYYooYYy',
            ' YYYooYYy',
            ' yyyyyyyy'
        ])
    ]
);

const BM_HALF = [
    '.............l..l.l',
    '.............Y..Y.Y',
    '.....uuu.....YY.YYY',
    '....unnnu....YYYYYY',
    '....unCnueeeeYRYYRY',
    'W.W.unCneUUUUyyyyyy',
    'W.W.WuueUUUUUUUUUUU',
    'nWnWnoeUUUUUUUUUUUU',
    'nnnnnoeUUUUUUUUUUUU',
    'nUUUuoeUUUUUuuuUUUU',
    'nUUUuoUUUUUUUuuUUUU',
    'nUUUuoUUUUUUrRRuUUU',
    '.nUUuoUUUUUURRRRUUU',
    '.nUUuoUUUUUUUUUUnnn',
    '.nUUUuoUUUUUUUUnnoo',
    '..nUUuoUUUUUUUnnnoo',
    '..nUUUuoUUUUUnnoooo',
    '...nUUuoUUUUUnoWWoW',
    '...nUUUuoUUUUnokkkk',
    '...nUUUUuUUUUnoWokk',
    '...nUUUUUuUUUUnoooo',
    '...nUUUUUUuUUUUnnnn',
    '...nUUUUUUUuUUUUUUU',
    '...nUUUUUUUCCCCCCCC',
    '...nUUUUUUCCCCCCCCC',
    '...nUUUUUUCCcCCCcCC',
    '...uUUUUUUCCCCCCCCC',
    '....uUUUUUCCCcCCCCC',
    '....uUUUUUUCCCCCCCC',
    '.....uUUUUUUCCCCCCC',
    '.....uUUUUUUUUUUUUU',
    '......uUUUUUUuuuuuu',
    '......nUUUUUu......',
    '.....WoWoWuu.......'
];
const BM_COLORS = {
    U: 'umber',
    u: 'umberDark',
    n: 'umberLight',
    C: 'crimson',
    c: 'crimsonDark',
    R: 'bear',
    r: 'bearLight',
    Y: 'gold',
    y: 'goldDark',
    L: 'goldLight',
    l: 'goldLight',
    W: 'horn',
    k: 'crimsonDark',
    e: 'bearDark'
};
const BM_FRAME = mirror(BM_HALF);
const bear_market = def(BM_COLORS, [BM_FRAME]);

// The Long Winter: a palette-swapped Bear Market with a frost crown and icicles.
const long_winter = def(
    {
        ...BM_COLORS,
        U: 'iceDark',
        u: 'iceDeep',
        n: 'ice',
        C: 'iceLight',
        c: 'ice',
        Y: 'iceLight',
        y: 'ice',
        L: 'white',
        l: 'white',
        W: 'white',
        k: 'iceDeep',
        e: 'iceLight'
    },
    [BM_FRAME]
);

const RUG_LORD = [
    '..................Y..Y..Y.........',
    '..................YYYYYYY.........',
    '..................yRyGyRy.....l...',
    '.................SSSSSSSSS...lRr..',
    '................SSSSSSSSSSS..RRr..',
    '................SSSYYSYYSSS...Y...',
    '................SSSSSSSSSSS...Y...',
    '................SSWWWWWWWSS...Y...',
    '.................SSoWoWoSS....Y...',
    '..........CCCCCPPPPPPPPPPPPw..Y...',
    '.......CCCCCCCCPPPPPYPPPPPPPwwYw..',
    '.....CCCCCcCCCCPPPPPYPPPPPPp..Y...',
    '...CCCCCCcCCCCPPPPPPYPPPPPp...Y...',
    '..CCCCCCcCCcCPPPPPPPYPPPPPp...Y...',
    '.CCCCCCcCCcCCPPPPPPPYPPPPPp...Y...',
    'CCCCCCcCCcCCPPPPPPPPYPPPPPPp..Y...',
    'CCCCCcCCcCCPPPPPPPPPYPPPPPPp..Y...',
    'c.CCcCCcCCCPPPPPPPPPYPPPPPPp..Y...',
    '.......cCCCPPPPPPPPPPPPPPPPp..Y...',
    '........CCPPPPPPPPPPPPPPPPPp.YY...',
    '.....RRRRRRRRRRRRRRRRRRRRRRRRRRRR.',
    'WWW.R' + 'Y'.repeat(28) + 'R',
    '....RY' + 'RRYR'.repeat(6) + 'RRYR',
    '.WWWRY' + 'RYRY'.repeat(6) + 'RYYR',
    '....RY' + 'RRYR'.repeat(6) + 'RRYR',
    '.WWWR' + 'Y'.repeat(28) + 'R',
    '.....' + 'D'.repeat(28) + '.',
    '......' + 'W.'.repeat(13) + '..'
];
const rug_lord = def(
    {
        Y: 'gold',
        y: 'goldDark',
        R: 'bear',
        D: 'bearDark',
        G: 'bull',
        S: 'shadow',
        P: 'robe',
        p: 'robeDark',
        w: 'robeLight',
        C: 'bear',
        c: 'bearDark',
        W: 'horn',
        l: 'goldLight',
        r: 'bearDark'
    },
    [
        RUG_LORD,
        stamp(RUG_LORD, 0, 17, [
            'CCCCcCCcC',
            '..c....cC',
            '',
            '',
            '.WWW',
            '....',
            'WWW.',
            '....',
            'WWW.',
            '',
            '.......W.W.W.W.W.W.W.W.W.W.W.W.W..'
        ])
    ],
    { fps: 4 }
);

// ---------------------------------------------------------------- projectiles / pickups / fx

const xp_candle = def(
    { G: 'bull', D: 'bullDark', L: 'bullLight' },
    [['.D.', 'LGG', 'LGG', 'LGD', 'GDD', '.D.']],
    { square: true }
);

const xp_candle_big = def(
    { G: 'bull', D: 'bullDark', L: 'bullLight', Y: 'gold', y: 'goldDark', l: 'goldLight' },
    [['..Y..', '..Y..', 'lLLGG', 'lLGGD', 'LGGGD', 'LGGGD', 'GDDDD', '..y..', '..y..']],
    { square: true }
);

const green_candle = def(
    { G: 'bull', D: 'bullDark', L: 'bullLight', Y: 'gold', W: 'white' },
    [['.LG.', 'LLGG', 'LGGD', 'LGGD', 'LGGD', 'GDDD', '.WY.', '..Y.']],
    { square: true }
);

const laser = def(
    { G: 'bull', L: 'bullLight', W: 'white' },
    [['GGLGGGGGLGGG', 'WWWWWWWWWWWW', 'GGGGLGGGGGLG']],
    { outline: false }
);

const diamond = def({ W: 'white', L: 'infoLight', I: 'info', i: 'infoDark' }, [
    ['..WL..', '.WLII.', 'WLLIIi', 'LIIIii', '.Iiii.', '..ii..']
]);

const airdrop = def(
    { G: 'bull', D: 'bullDark', W: 'white', s: 'greyLight', B: 'brown', b: 'brownDark', Y: 'gold' },
    [
        [
            '..GWWG..',
            '.GGWWGG.',
            'GGGWWGGG',
            's.D..D.s',
            '.s....s.',
            '..BYYB..',
            '..BYYB..',
            '..bbbb..'
        ]
    ],
    { bare: 's' }
);

const limit_order = def({ G: 'bull', D: 'bullDark', k: 'panel', Y: 'gold' }, [
    ['..GGGG..', '.GDkkDG.', 'GDkkkkDG', 'YYYYYYYY', 'GDkkkkDG', '.GDkkDG.', '..GGGG..']
]);

const dead_cat = def({ C: 'tan', c: 'brownLight', p: 'bearLight' }, [
    ['C....C', 'CC..CC', 'CCCCCC', 'CoCCoC', 'CCppCC', '.cccc.']
]);

const fud_bolt = def({ W: 'white', R: 'bear', P: 'fud', p: 'fudDark' }, [
    ['.RP.', 'RWRP', 'PRPp', '.Pp.']
]);

const heart = def({ G: 'bull', D: 'bullDark', L: 'bullLight' }, [
    ['LG.GG', 'GGGGD', '.GGD.', '..D..']
]);

// ---------------------------------------------------------------- icons (12x12 with outline)

const ICON_COLORS = {
    G: 'bull',
    D: 'bullDark',
    L: 'bullLight',
    R: 'bear',
    r: 'bearDark',
    Y: 'gold',
    y: 'goldDark',
    l: 'goldLight',
    I: 'info',
    i: 'infoDark',
    j: 'infoLight',
    W: 'white',
    w: 'hornDark',
    H: 'horn',
    S: 'shadow',
    s: 'greyLight',
    g: 'grey',
    k: 'greyDark',
    B: 'brown',
    b: 'brownDark',
    C: 'tan',
    P: 'paper',
    p: 'paperDark',
    F: 'white',
    f: 'bullLight'
};
// 'F'/'f' (sparkles, flares) and 's' (strings) are drawn without an outline.
const icon = (rows, square = false) => def(ICON_COLORS, [rows], { bare: 'Ffs', square });

export const ICONS = {
    horns: icon([
        'H........H',
        'H........H',
        'HH......HH',
        'wHH....HHw',
        '.wHHGGHHw.',
        '..wGGGGw..',
        '..GGGGGG..',
        '..GoGGoG..',
        '...GLLG...',
        '....YY....'
    ]),
    green_candle: icon(
        [
            '....DD....',
            '....DD....',
            '..LLLGGG..',
            '..LGGGGD..',
            '..LGGGGD..',
            '..LGGGGD..',
            '..LGGGGD..',
            '..GDDDDD..',
            '....DD....',
            '....DD....'
        ],
        true
    ),
    laser_eyes: icon([
        'H........H',
        'wH......Hw',
        '.wHSSSSHw.',
        '..SSSSSS..',
        'fffWffWfff',
        '..SLSSLS..',
        '..SSSSSS..',
        '..SkkkkS..',
        '...SkkS...',
        '..........'
    ]),
    diamond_hands: icon([
        '..j.j.j...',
        '..I.I.I.j.',
        '.jI.I.I.I.',
        '.II.I.I.I.',
        '.IIjIjIjI.',
        'jjIIIIIII.',
        'IIIjIIIIi.',
        '.IIIIIIIi.',
        '..iIIIii..',
        '...iiii...'
    ]),
    airdrop: icon([
        '..GGWWGG..',
        '.GGGWWGGG.',
        'GGGGWWGGGG',
        'D.D.DD.D.D',
        's.......s.',
        '.s.....s..',
        '..BBBBBB..',
        '..BYBBYB..',
        '..BBYYBB..',
        '..bbbbbb..'
    ]),
    limit_order: icon([
        '...GGGG...',
        '..GDDDDG..',
        '.GDSSSSDG.',
        '.GDSSSSDG.',
        'YYYYYYYYYY',
        '.GDSSSSDG.',
        '.GDSSSSDG.',
        '..GDDDDG..',
        '...GGGG...',
        '..........'
    ]),
    hopium: icon([
        'F.......F.',
        '...LLL....',
        '..LGGGL...',
        '.LGGGGGLL.',
        'LLGGGGLGGL',
        'LGGGGGGGGG',
        'LGGGGGGGGD',
        '.DGGGGGGD.',
        '..DDDDDD..',
        '.F.....F..'
    ]),
    circuit_breaker: icon([
        '...jjjj...',
        '..jIIIIi..',
        '.jIIIIIIi.',
        'jIIWWIWWIi',
        'jIIWWIWWIi',
        'jIIWWIWWIi',
        'jIIWWIWWIi',
        '.jIIIIIIi.',
        '..iIIIIi..',
        '...iiii...'
    ]),
    buyback: icon([
        '...GGGGL..',
        '..GDDDDGG.',
        '.GD...GGGG',
        'GD..YY..G.',
        'GD.YlYy...',
        'GD.YYyy.DG',
        'GD..yy..DG',
        '.GD....DG.',
        '..GDDDDG..',
        '...GGGG...'
    ]),
    dead_cat_bounce: icon([
        '........G.',
        '.......GGG',
        'C.....C.G.',
        'CC...CC.G.',
        'CCCCCCC.G.',
        'CoCCCoC.G.',
        'CCCRCCC...',
        'CCCCCCC...',
        '.bbbbb....',
        '..........'
    ]),
    thick_skin: icon([
        '.GG...GG..',
        'GLGG.GGGD.',
        'GGGGGGGGD.',
        'GsssssssD.',
        'GsgWggWgD.',
        '.sgggggg..',
        '..kgggk...',
        '...kgk....',
        '....k.....',
        '..........'
    ]),
    dca: icon(
        [
            '.R.R..R.R.',
            'RRRRRRRRRR',
            'PPPPPPPPPP',
            'PkPkPkPkPp',
            'PPPPPPPPPp',
            'PkPkGGPkPp',
            'pppppppppp',
            '.....YY...',
            '....YlYy..',
            '.....yy...'
        ],
        true
    ),
    cold_wallet: icon(
        [
            '.F.....F..',
            'jjjjjjjjjj',
            'jIIIIIIIIi',
            'jIsssssIIi',
            'jIsgkgsIWi',
            'jIskWksIWi',
            'jIsgkgsIIi',
            'jIsssssIIi',
            'iiiiiiiiii',
            '.i......i.'
        ],
        true
    ),
    momentum: icon([
        '.....G....',
        '.....GG...',
        'LL...GGG..',
        '.....GGGG.',
        'LLLLLGGGGG',
        '.....GGGGD',
        'LL...GGGD.',
        '.....GGD..',
        '.....GD...',
        '.....D....'
    ]),
    conviction: icon([
        '..........',
        '.GLGLGLG..',
        '.GGGGGGGD.',
        '.GoGoGoGD.',
        '.GGGGGGGD.',
        '.LLLLGGGD.',
        '.GGGGGGD..',
        '..GGGGD...',
        '..GGGGD...',
        '..DDDDD...'
    ]),
    liquidity: icon([
        '....j.....',
        '....jI....',
        '...jIIi...',
        '...jIIi...',
        '..jWIIIi..',
        '.jWIIIIIi.',
        '.jIIIIIIi.',
        '.jIIIIIIi.',
        '..iIIIii..',
        '...iiii...'
    ]),
    high_frequency: icon([
        '...PPPP...',
        '.PPPkPPPp.',
        '.PPPPPYPp.',
        'PPPPPYYPPp',
        'PkPPYYPPkp',
        'PPPYYYYPPp',
        'PPPPYYPPPp',
        '.PPPYPPPp.',
        '.ppPkPPpp.',
        '...pppp...'
    ]),
    whale_gravity: icon([
        '......j.j.',
        '.......j..',
        '..jjjjjI..',
        '.jIIIIIIi.',
        'jIIoIIIIIi',
        'jIIIIIIIIi',
        'jWWWWWWIi.',
        '.WWWWWii.i',
        '..iiii..ii',
        '.........i'
    ]),
    compounding: icon(
        [
            '.......GG.',
            '.......LG.',
            '.......LG.',
            '.......LG.',
            '.......LG.',
            '....GG.LG.',
            '....LG.LG.',
            '.GG.LG.LG.',
            '.LG.LG.LG.',
            'DDDDDDDDDD'
        ],
        true
    ),
    alpha: icon([
        '..........',
        '..YYYY..Y.',
        '.YYllYYYY.',
        'YYl...YY..',
        'YY....YY..',
        'YY....YY..',
        'YY....YY..',
        '.YY..YYYY.',
        '..yyyy..yy',
        '..........'
    ]),
    slippage: icon([
        '....ll....',
        '....lY....',
        '...lYYy...',
        '...lYYy...',
        '..lYYYYy..',
        '.lYyYYyYy.',
        'lYy.YY.yYy',
        'Yy..YY..yY',
        'y...yy...y',
        '..........'
    ]),
    hedge: icon([
        'LGGGGRRRRr',
        'LGGGGRRRRr',
        'LGGGGRRRRr',
        'LGGGGRRRRr',
        'LGGGGRRRRr',
        '.GGGGRRRr.',
        '.DGGGRRRr.',
        '..DGGRRr..',
        '...DGRr...',
        '....Dr....'
    ]),
    leverage: icon([
        'Y.......G.',
        'YY.....GGG',
        '.YY...YYG.',
        '..YY.YY.G.',
        '...YYY....',
        '...YYY....',
        '..YY.YY.R.',
        '.YY...YYR.',
        'YY.....RRR',
        'Y.......R.'
    ])
};

// ---------------------------------------------------------------- registry

export const SPRITES = {
    // player
    bull,
    // enemies
    red_candle,
    bag_holder,
    paper_hands,
    rug_puller,
    grizzly,
    fud_cloud,
    doomposter,
    ponzi,
    downline,
    margin_call,
    sybil,
    // bosses
    rug_lord,
    capitulation,
    liquidation,
    bear_market,
    long_winter,
    // projectiles / pickups / fx
    xp_candle,
    xp_candle_big,
    green_candle,
    laser,
    diamond,
    airdrop,
    limit_order,
    dead_cat,
    fud_bolt,
    heart
};

/** Group ids for tooling (preview page, docs). */
export const SPRITE_GROUPS = {
    player: ['bull'],
    enemies: [
        'red_candle',
        'bag_holder',
        'paper_hands',
        'rug_puller',
        'grizzly',
        'fud_cloud',
        'doomposter',
        'ponzi',
        'downline',
        'margin_call',
        'sybil'
    ],
    bosses: ['rug_lord', 'capitulation', 'liquidation', 'bear_market', 'long_winter'],
    pickups: [
        'xp_candle',
        'xp_candle_big',
        'green_candle',
        'laser',
        'diamond',
        'airdrop',
        'limit_order',
        'dead_cat',
        'fud_bolt',
        'heart'
    ]
};

/** Icon ids by level-up card type. */
export const ICON_GROUPS = {
    weapons: [
        'horns',
        'green_candle',
        'laser_eyes',
        'diamond_hands',
        'airdrop',
        'limit_order',
        'hopium',
        'circuit_breaker',
        'buyback',
        'dead_cat_bounce'
    ],
    passives: [
        'thick_skin',
        'dca',
        'cold_wallet',
        'momentum',
        'conviction',
        'liquidity',
        'high_frequency',
        'whale_gravity',
        'compounding',
        'alpha',
        'slippage',
        'hedge',
        'leverage'
    ]
};

// ---------------------------------------------------------------- baking

const cache = new Map();

function makeCanvas(w, h) {
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        return c;
    }
    const Offscreen = globalThis.OffscreenCanvas;
    return typeof Offscreen === 'function' ? new Offscreen(w, h) : null;
}

function bakeDef(spriteDef, key, scale, flip, tint) {
    if (!spriteDef) return null;
    const s = Math.max(1, Math.round(scale) || 1);
    const k = `${key}|${s}|${flip}|${tint}`;
    const hit = cache.get(k);
    if (hit) return hit;

    const ink = PAL.ink.toLowerCase();
    const frames = [];
    for (const rows of spriteDef.frames) {
        const c = makeCanvas(spriteDef.w * s, spriteDef.h * s);
        const ctx = c && c.getContext('2d');
        if (!ctx) return null; // Node, or a DOM without a 2D canvas (jsdom).
        ctx.imageSmoothingEnabled = false;
        for (let y = 0; y < spriteDef.h; y++) {
            const row = rows[y];
            // Batch horizontal runs of the same colour into one fillRect.
            let x = 0;
            while (x < spriteDef.w) {
                const ch = row[x];
                if (ch === T) {
                    x++;
                    continue;
                }
                let run = 1;
                while (x + run < spriteDef.w && row[x + run] === ch) run++;
                let fill = color(spriteDef.colors[ch] || ch);
                if (tint && fill.toLowerCase() !== ink) fill = tint;
                ctx.fillStyle = fill;
                const px = flip ? spriteDef.w - x - run : x;
                ctx.fillRect(px * s, y * s, run * s, s);
                x += run;
            }
        }
        frames.push(c);
    }
    cache.set(k, frames);
    return frames;
}

/**
 * Pre-render a sprite to one canvas per frame at an integer scale. Results are cached
 * by `${id}|${scale}|${flip}|${tint}`, so call it freely from the render loop.
 * @param {string} id      key of SPRITES
 * @param {number} scale   integer pixel scale (rounded, min 1)
 * @param {{flip?: boolean, tint?: string|null}} opts  flip = mirror horizontally (face left);
 *        tint = hex colour that replaces every non-ink pixel (white hit flash, pale clones)
 * @returns {Array<HTMLCanvasElement|OffscreenCanvas>|null}  null without a canvas API or for unknown ids
 */
export function bakeSprite(id, scale = 1, { flip = false, tint = null } = {}) {
    return bakeDef(SPRITES[id], id, scale, !!flip, tint || null);
}

/** Same as bakeSprite, for ICONS (level-up cards, HUD). */
export function bakeIcon(id, scale = 1, { flip = false, tint = null } = {}) {
    return bakeDef(ICONS[id], `icon:${id}`, scale, !!flip, tint || null);
}

/** Drop every baked canvas (e.g. after a DPR change). */
export function clearSpriteCache() {
    cache.clear();
}
