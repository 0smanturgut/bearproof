// Scenery for the pool map, drawn with the pixel-art engine (art/pixel.js). See art/props.js for the format.
//
// The Liquidity Pool: a crypto trading floor that flooded and turned into a swimming pool. Aqua tiles under
// shallow water, a deep end, lifeguard towers beside drowned trading desks, monitors still glowing red. The
// ground is mid teal water, so every prop gets a dark selective outline and a lit top, and most of them stand
// IN the water: `submerge` re-tones everything under the waterline into the pool's teal and draws a bright
// ripple band where the prop breaks the surface. The decals stay faint.

import { PixelSprite, mat } from '../pixel.js';
import { M } from '../materials.js';

// ---- pool materials: six tones, dark -> light ------------------------------------------------------------

const P = {
    // white-blue marble: the columns
    marble: mat(['#283444', '#4C5E72', '#7A8EA2', '#A8BCCC', '#D2E0EA', '#F6FBFF'], {
        line: '#121822'
    }),
    // pool chrome: the ladder, the chair's gas lift
    chrome: mat(['#10161E', '#28323E', '#48586A', '#7A8E9E', '#BACAD6', '#F4FBFF'], {
        line: '#080B10'
    }),
    // lifeguard red: a warm tomato, kept off the enemy pink-red
    guard: mat(['#2A0806', '#5E140C', '#982414', '#D2401E', '#F27A4A', '#FFC09A'], {
        line: '#160403'
    }),
    // gloss white paint: the lifeguard chair's frame, the cooler
    white: mat(['#3A4656', '#66768A', '#97A6B8', '#C4D0DC', '#E6EDF4', '#FFFFFF'], {
        line: '#18202A'
    }),
    // office laminate: the trading desk, beige-grey
    desk: mat(['#1C1A18', '#38332C', '#5A5246', '#82786A', '#AAA08C', '#D4CAB2'], {
        line: '#0E0C0A'
    }),
    // black office plastic: monitor bezels, keyboards, the chair
    plas: mat(['#0A0C10', '#14181E', '#20262E', '#2E3640', '#434E5A', '#62707E'], {
        line: '#050608'
    }),
    // the LED board's housing
    housing: mat(['#0C0A0E', '#18141C', '#26202C', '#38303E', '#4E4456', '#6A5E72'], {
        line: '#060508'
    }),
    // the safe: dark green-grey enamelled steel
    safe: mat(['#0E1416', '#1C262A', '#2E3C42', '#46565C', '#66787C', '#94A4A6'], {
        line: '#070A0B'
    }),
    // the cooler's blue water jug
    jug: mat(['#06203A', '#0C3C66', '#16609A', '#2A8ACA', '#68BCEC', '#D0F0FF'], {
        line: '#03101E'
    }),
    // office plant leaves, and the ones that gave up
    leaf: mat(['#0A1A0E', '#163418', '#245222', '#38722E', '#56943E', '#8EBC5E'], {
        line: '#050D07'
    }),
    dead: mat(['#1E160A', '#3E2E14', '#6A5020', '#94742E', '#B89A48', '#D8C27A'], {
        line: '#0F0B05'
    }),
    // terracotta pot
    pot: mat(['#24100A', '#4A2214', '#723820', '#9A5230', '#BE7448', '#DE9E70'], {
        line: '#120805'
    }),
    // rubber duck yellow, and its beak
    duck: mat(['#3A2600', '#7A5400', '#C08A00', '#F2BE1A', '#FFDC5A', '#FFF4B4'], {
        line: '#1E1300'
    }),
    beak: mat(['#3A1200', '#7A2800', '#C04A08', '#F2741A', '#FFA04A', '#FFD09A'], {
        line: '#1E0900'
    })
};

// Under-water tones (dark -> light), the ripple foam and the dying screens' red
const UNDER = ['#061A20', '#0C3038', '#144A54', '#1E6470', '#2E808A', '#48A0A8'];
const FOAM = '#A8ECEE';
const RIPPLE = '#5EC4CC';
const RED = { hi: '#FFC0C8', on: '#FF3B5C', mid: '#B81E40', dim: '#3A0A14', bg: '#12060A' };

// ---- helpers --------------------------------------------------------------------------------------------

/** A small deterministic hash in [0, 1): irregularity without Math.random. */
function hash(a, b = 0, c = 0) {
    let h =
        (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1440662683)) |
        0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// the engine's light (top left, towards the viewer), for surfaces shaded by hand
const LIGHT = [-0.55, -0.72, 0.5].map((v) => v / Math.hypot(-0.55, -0.72, 0.5));
const shade = (nx, ny, nz) =>
    Math.max(
        0,
        Math.min(1, 0.17 + 0.76 * Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]))
    );

/** An upright cylinder (a column): row y spans cx ± r(y), lit like a cylinder; `biasAt` paints flutes. */
function lathe(s, cx, y0, y1, r, m, o = {}) {
    const { g = 'lathe', biasAt = () => 0 } = o;
    for (let y = Math.floor(y0); y <= y1; y++) {
        const rr = r(y + 0.5);
        for (let x = Math.floor(cx - rr - 1); x <= cx + rr + 1; x++) {
            const u = (x + 0.5 - cx) / rr;
            if (Math.abs(u) > 1) continue;
            const nz = Math.sqrt(Math.max(0, 1 - u * u));
            const lum = shade(u * 0.95, 0, nz) + biasAt(x, y, u);
            s.spans([[y, x, x]], m, { g, lum: Math.max(0, Math.min(1, lum)) });
        }
    }
    return s;
}

/** A flat-lying ring (a life ring) seen at an angle, lit like a torus; `matAt(angle)` picks the stripe. */
function torus(s, cx, cy, rx, ry, k, matAt) {
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++)
        for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
            const u = (x + 0.5 - cx) / rx;
            const v = (y + 0.5 - cy) / ry;
            const d = Math.hypot(u, v);
            if (d > 1 || d < k) continue;
            const t = (d - (1 + k) / 2) / ((1 - k) / 2);
            const nz = Math.sqrt(Math.max(0, 1 - t * t));
            const lum = shade((u / d) * t * 0.9, (v / d) * t * 0.9, nz);
            s.spans([[y, x, x]], matAt(Math.atan2(v, u)), { lum });
        }
    return s;
}

const lumOf = (hex) => {
    const v = parseInt(hex.slice(1), 16);
    return (0.2126 * (v >> 16) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255)) / 255;
};

/**
 * Sink a rendered sprite to the waterline at art row `wy`: every pixel below it takes the matching tone of the
 * pool's teal (outlines stay dark), glows go out, and a ripple band crosses the prop where it breaks the
 * surface, spilling `pad` px past it on both sides (dashed, shifting with `f`).
 */
function submerge(out, wy, f = 0, pad = 2) {
    const { w, h, px, glow } = out;
    const row = wy + 1; // render() pads by one pixel
    let x0 = w;
    let x1 = -1;
    for (let y = row; y < h; y++)
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if (!px[i]) continue;
            if (y === row) {
                x0 = Math.min(x0, x);
                x1 = Math.max(x1, x);
            }
            const l = lumOf(px[i]);
            px[i] = l < 0.1 ? UNDER[0] : UNDER[Math.min(5, 1 + Math.floor(l * 5))];
            glow[i] = null;
        }
    if (x1 < 0) return out;
    for (let x = Math.max(1, x0 - pad); x <= Math.min(w - 2, x1 + pad); x++) {
        const on = x >= x0 && x <= x1;
        if (on) px[row * w + x] = (x + f) % 4 === 0 ? RIPPLE : FOAM;
        else if ((x + f) % 2 === 0) px[row * w + x] = RIPPLE;
        if (!on && row + 1 < h - 1 && (x + f) % 3 === 1) px[(row + 1) * w + x] = UNDER[4];
    }
    return out;
}

/** Draw an ASCII bitmap at (x, y), calling `put(x, y)` for every 'X'. */
function bitmap(x, y, rows, put) {
    rows.forEach((row, ry) => {
        for (let rx = 0; rx < row.length; rx++) if (row[rx] === 'X') put(x + rx, y + ry);
    });
}

// ---- props ------------------------------------------------------------------------------------------------

/** One screen's chart: candles stepping down from the top left, one green dead-cat bounce, all glowing. */
function chart(s, sx, sy, n, seed) {
    for (let k = 0; k < n; k++) {
        const x = sx + 1 + k * 2;
        const green = k === 2;
        const top = sy + 1 + k + (green ? 1 : 0) + (hash(seed, k) < 0.3 ? 1 : 0);
        const len = 2 + (hash(seed, k, 1) < 0.5 ? 1 : 0);
        const c = green ? '#3CFF8A' : RED.on;
        s.px(x, top - 1, green ? '#1E8A4A' : RED.mid, { glow: c });
        for (let j = 0; j < len; j++)
            s.px(x, top + j, j ? c : green ? '#B8FFD0' : RED.hi, { glow: c });
    }
}

/**
 * 46×32 half-drowned trading desk: a beige laminate desk, its lower half under water, two monitors still on,
 * both showing a red candle chart sliding off the screen; a keyboard and a cold coffee.
 */
function desk() {
    const s = new PixelSprite(46, 32, { dither: 0.15 });
    // the desk: its top and front as one lit volume
    s.box(2, 15, 42, 4, P.desk, { g: 'desk', bias: 0.22 });
    s.box(3, 18, 40, 13, P.desk, { g: 'desk', bias: -0.08 });
    s.auto('desk', { R: 2, grad: 0.3 });
    s.line(2.5, 18.2, 43.5, 18.2, P.desk, { lum: 0.95 });
    // drawers and their handles
    s.line(30, 19, 30, 30, P.desk, { lum: 0.2 });
    for (const y of [22, 26]) {
        s.line(31, y, 42, y, P.desk, { lum: 0.25 });
        s.line(35, y - 1.6, 38, y - 1.6, P.plas, { lum: 0.6 });
    }
    // two monitors on short stands
    for (const [mx, seed] of [
        [5, 1],
        [24, 2]
    ]) {
        s.box(mx + 6, 12.5, 4, 3, P.plas, { bevel: 0.8, bias: -0.1 });
        s.box(mx, 2, 16, 12, P.plas, { r: 1, bevel: 1.2, bias: 0.05 });
        s.box(mx + 1.5, 3.5, 13, 9, P.plas, { shade: 'flat', lum: 0 });
        for (let y = 4; y <= 11; y++)
            for (let x = mx + 2; x <= mx + 14; x++) s.px(x, y, (x + y) % 5 ? RED.bg : RED.dim);
        chart(s, mx + 1, 3, 6, seed);
        s.px(mx + 14, 13, '#5CFF8A', { glow: '#5CFF8A' }); // power LED
    }
    // the keyboard, a mug
    s.box(17, 15.6, 12, 2.2, P.plas, { r: 0.4, bevel: 0.6, bias: 0.1 });
    for (let x = 18; x <= 27; x += 2) s.px(x, 16, '#434E5A');
    s.box(36, 13, 3.6, 3.6, P.white, { r: 0.6, bevel: 1, bias: 0.05 });
    s.px(39, 14, '#97A6B8').px(37, 13, '#3A2416');
    return submerge(s.render(), 24, 0, 2);
}

/**
 * 20×54 marble column: a fluted shaft, a chipped capital, a brown high-water stain where the flood peaked and
 * a bit of algae below it; the base is under water.
 */
function pillar() {
    const s = new PixelSprite(20, 54, { dither: 0.2 });
    // the shaft: flutes, a cracked tide mark
    lathe(s, 10, 7, 50, () => 6.2, P.marble, {
        g: 'shaft',
        biasAt: (x, y) => {
            if (y === 33 || y === 34) return -0.32;
            const f = (x - 4) % 3 === 0 ? -0.12 : 0.04;
            return y > 34 ? f - 0.12 : f;
        }
    });
    // algae under the stain, a crack in the stone
    for (let y = 35; y < 46; y++)
        for (let x = 5; x <= 15; x++)
            if (hash(x, y, 7) < 0.12) s.px(x, y, hash(x, y) < 0.5 ? '#4E7A58' : '#3A6248');
    for (const [x, y] of [
        [8, 14],
        [9, 15],
        [9, 16],
        [8, 17],
        [8, 18],
        [9, 19]
    ])
        s.px(x, y, '#4C5E72');
    // the capital: an echinus and an abacus slab, one corner knocked off
    s.box(3, 6, 14, 2.6, P.marble, { g: 'cap', bevel: 1, bias: 0.05 });
    s.box(1, 1, 18, 5.4, P.marble, { g: 'cap', r: 0.5, bias: 0.15 });
    s.auto('cap', { R: 1.6, grad: 0.35 });
    s.cutBox(15, 1, 4, 2);
    s.cutBox(17, 3, 2, 1);
    s.px(15, 3, '#7A8EA2').px(16, 3, '#A8BCCC').px(14, 1, '#7A8EA2');
    // the plinth
    s.box(2, 46, 16, 5, P.marble, { r: 0.5, bevel: 1, bias: -0.1 });
    return submerge(s.render(), 44, 0, 2);
}

/**
 * 30×58 lifeguard tower: white A-frame legs with ladder rungs, a red seat back with "LP" on it, armrests, a
 * life ring hung on the front leg; the feet stand in the water.
 */
function lifeguard() {
    const s = new PixelSprite(30, 58, { dither: 0.15 });
    // the far legs, darker
    s.line(10, 20, 9, 52, P.white, { w: 1.8, lum: 0.35 });
    s.line(20, 20, 21, 52, P.white, { w: 1.8, lum: 0.25 });
    // the near legs splayed out, rungs across them
    const lx = (y) => 6 - ((y - 20) / 32) * 3;
    const rx = (y) => 24 + ((y - 20) / 32) * 3;
    for (const y of [28, 35, 42])
        s.line(lx(y) + 1, y, rx(y) - 1, y, P.white, { w: 1.4, lum: y === 28 ? 0.75 : 0.55 });
    s.line(lx(46), 46, rx(36), 36, P.white, { w: 1, lum: 0.4 }); // a cross brace
    s.capsule(6, 20, 3, 52, 1.2, 1.2, P.white, { bias: 0.05 });
    s.capsule(24, 20, 27, 52, 1.2, 1.2, P.white, { bias: -0.08 });
    // the seat and the armrests
    s.box(4, 18, 22, 3.4, P.white, { r: 0.6, bevel: 1, bias: 0.12 });
    s.line(4.5, 12.5, 4.5, 18, P.white, { w: 1.4, lum: 0.7 });
    s.line(25.5, 12.5, 25.5, 18, P.white, { w: 1.4, lum: 0.45 });
    s.line(4, 12.4, 8, 12.4, P.white, { w: 1.4, lum: 0.8 });
    s.line(22, 12.4, 26, 12.4, P.white, { w: 1.4, lum: 0.6 });
    // the red seat back with "LP" painted on in white
    s.box(7, 2, 16, 16.5, P.guard, { r: 1.4, bevel: 2.2, bias: 0.04 });
    bitmap(10, 6, ['X....XXX.', 'X....X..X', 'X....XXX.', 'X....X...', 'XXXX.X...'], (x, y) =>
        s.px(x, y, '#FFF2E8')
    );
    s.line(8.5, 14.5, 21.5, 14.5, P.guard, { lum: 0.3 });
    // a life ring hung on the right front leg
    torus(s, 25.5, 32, 3.6, 3.6, 0.45, (a) =>
        Math.floor(((a + Math.PI) / (Math.PI * 2)) * 8 + 0.5) % 2 ? P.guard : P.white
    );
    return submerge(s.render(), 49, 0, 2);
}

// The LED board's scrolling message: a down arrow and a minus, 12 columns, repeating
const TICKER = ['XXXXXXX.....', '.XXXXX......', '..XXX..XXXX.', '...X........', '............'];

/**
 * 58×26 fallen LED ticker board: a long black housing that came off its poles and fell flat into the water,
 * the dot-matrix still scrolling red down arrows. Frames 0-3: the message moves 3 columns a frame.
 */
function ticker(f) {
    const s = new PixelSprite(58, 26, { dither: 0.15 });
    // the snapped mounting poles still bolted to the top
    s.line(8, 1, 11, 6, P.chrome, { w: 1.6, lum: 0.6 });
    s.line(47, 2, 45, 6, P.chrome, { w: 1.6, lum: 0.4 });
    s.px(8, 1, '#BACAD6');
    // the housing
    s.box(3, 5, 52, 16, P.housing, { g: 'box', r: 1 });
    s.auto('box', { R: 1.6, grad: 0.35 });
    s.line(3.5, 5.4, 54.5, 5.4, P.housing, { lum: 0.9 });
    // the dot matrix: dim dots everywhere, the message lit
    for (let x = 5; x <= 52; x++)
        for (let r = 0; r < 7; r++) {
            const y = 7 + r;
            const col = (x - 5 + f * 3) % 12;
            const lit = r >= 1 && r <= 5 && TICKER[r - 1][col] === 'X';
            if (lit) s.px(x, y, r === 1 ? RED.hi : RED.on, { glow: RED.on });
            else s.px(x, y, (x + r) % 2 ? RED.bg : RED.dim);
        }
    return submerge(s.render(), 15, f, 2);
}

/** 16×42 office water cooler: a blue jug upside down on a white cabinet, hot and cold taps; feet in the water. */
function cooler() {
    const s = new PixelSprite(16, 42, { dither: 0.15 });
    // the cabinet
    s.box(2.5, 16, 11, 3.2, P.white, { g: 'cab', r: 0.8, bias: 0.15 });
    s.box(3, 18, 10, 21, P.white, { g: 'cab', r: 0.6, bias: -0.04 });
    s.auto('cab', { R: 1.6, grad: 0.35 });
    // the tap recess, the taps, the drip tray
    s.box(4.5, 21, 7, 6, P.plas, { r: 0.6, bevel: 0.8, bias: 0.1 });
    s.px(6, 22, '#2A8ACA').px(6, 23, '#16609A');
    s.px(10, 22, '#D2401E').px(10, 23, '#982414');
    s.line(5, 26, 11, 26, P.chrome, { lum: 0.6 });
    for (const y of [30, 32, 34]) s.line(5, y, 11, y, P.white, { lum: 0.4 });
    // the jug: a neck into the cabinet, a ribbed body, a bubble or two
    s.box(6.5, 13, 3, 4, P.jug, { bevel: 0.8, bias: -0.05 });
    s.box(3, 1.5, 10, 12.5, P.jug, { g: 'jug', r: 3 });
    s.auto('jug', { R: 2.4, grad: 0.35 });
    s.line(3.6, 6, 12.4, 6, P.jug, { lum: 0.35 });
    s.line(3.6, 9.5, 12.4, 9.5, P.jug, { lum: 0.35 });
    s.px(5, 3, '#F0FAFF').px(5, 4, '#D0F0FF').px(9, 8, '#68BCEC').px(8, 11, '#68BCEC');
    return submerge(s.render(), 35, 0, 2);
}

/** 20×38 office plant: a terracotta pot standing in the water, a fan of leaves, the lower ones gone brown. */
function plant() {
    const s = new PixelSprite(20, 38, { dither: 0.15 });
    // leaves: [tip x, tip y, width, dead?], drawn back to front from the soil
    const leaves = [
        [3, 21, 1.4, true],
        [17, 22, 1.4, true],
        [2, 10, 1.6, false],
        [18, 9, 1.6, false],
        [6, 3, 1.7, false],
        [15, 2, 1.7, false],
        [10, 1, 1.8, false],
        [5, 15, 1.6, false],
        [16, 15, 1.6, true]
    ];
    leaves.forEach(([tx, ty, w, dead], i) => {
        const m = dead ? P.dead : P.leaf;
        const bx = 10 + (i % 2 ? 0.6 : -0.6);
        const mx = (bx + tx) / 2 + (dead ? 0 : (tx - bx) * 0.15);
        const my = dead ? Math.min(ty, 23) - 3 : (23 + ty) / 2;
        const g = `leaf${i}`;
        s.capsule(bx, 23, mx, my, 0.5, w, m, { g, bias: dead ? -0.05 : 0 });
        s.capsule(mx, my, tx, ty, w, 0.4, m, { g });
        s.auto(g, { R: 1, grad: 0.25 });
    });
    // the pot: a tapered body under a rolled rim, dark soil
    s.poly(
        [
            [4.5, 25],
            [15.5, 25],
            [14, 36],
            [6, 36]
        ],
        P.pot,
        { g: 'pot' }
    );
    s.box(3.5, 23, 13, 3, P.pot, { g: 'pot', r: 0.8, bias: 0.15 });
    s.auto('pot', { R: 1.8, grad: 0.35 });
    s.line(5, 23.4, 15, 23.4, P.plas, { lum: 0.15 });
    return submerge(s.render(), 31, 0, 2);
}

/** 32×30 sunken bank safe: a squat steel box, its door swung open on the right, the dial still on it, empty. */
function vault() {
    const s = new PixelSprite(32, 30, { dither: 0.2 });
    s.box(3, 2, 21, 5, P.safe, { g: 'body', r: 0.8, bias: 0.25 });
    s.box(3, 5, 21, 23, P.safe, { g: 'body', r: 0.8 });
    s.auto('body', { R: 2, grad: 0.35 });
    s.line(3.5, 5.3, 23.5, 5.3, P.safe, { lum: 0.95 });
    // the empty inside: a dark recess and one bare shelf
    s.box(5.5, 8, 16, 17, P.safe, { r: 0.4, bevel: 1, bias: -0.25 });
    s.box(6.5, 9, 14, 15, P.plas, { shade: 'flat', lum: 0 });
    s.line(7, 16, 20, 16, P.safe, { lum: 0.45 });
    s.px(19, 15, '#94A4A6'); // one paper clip, nothing else
    // the door, swung out towards the viewer on its right hinge
    s.poly(
        [
            [23, 7],
            [30, 5],
            [30, 28],
            [23, 26]
        ],
        P.safe,
        { left: 0.75, right: 0.35 }
    );
    s.line(30, 5, 30, 28, P.safe, { lum: 0.2 });
    for (const y of [9, 22]) s.px(23, y, '#94A4A6').px(22, y, '#66787C');
    // the combination dial and the spoked handle
    s.ellipse(26.6, 13, 2, 2.8, M.metal, { flat: 0.8 });
    s.px(26, 12, '#E3E8EE').px(27, 13, '#14181E');
    s.line(25.6, 19, 27.6, 19, M.metal, { lum: 0.7 });
    s.line(26.6, 17.6, 26.6, 20.4, M.metal, { lum: 0.5 });
    return submerge(s.render(), 22, 0, 2);
}

/** 20×16 life ring floating, red and white quarters, a rope loop. Frames 0-3: a gentle bob. */
function buoy(f) {
    const s = new PixelSprite(20, 16, { dither: 0 });
    const b = [0, -1, -1, 0][f % 4];
    torus(s, 10, 7.5 + b, 8.4, 5, 0.42, (a) =>
        Math.floor(((a + Math.PI) / (Math.PI * 2)) * 8 + 0.5) % 2 ? P.guard : P.white
    );
    return submerge(s.render(), 10, f, 2);
}

/** 14×14 rubber duck floating. Frames 0-3: it bobs and rocks. */
function duck(f) {
    const s = new PixelSprite(14, 14, { dither: 0 });
    const b = [0, -1, 0, 0][f % 4];
    const tip = [0, 0, 1, 0][f % 4];
    s.circle(2.6, 6.4 + b + tip, 1.6, P.duck, { g: 'duck' }); // the tail
    s.ellipse(6.4, 8.2 + b, 5, 3.4, P.duck, { g: 'duck' });
    s.circle(9, 4.2 + b - tip * 0.5, 2.7, P.duck, { g: 'duck' });
    s.auto('duck', { R: 1.8, grad: 0.3 });
    s.ellipse(11.8, 5.3 + b, 1.7, 0.9, P.beak, { bias: 0.1 });
    s.line(4.5, 8, 7.5, 9, P.duck, { lum: 0.4 }); // the wing
    s.px(9, 3 + b, '#07090C').px(8, 3 + b, '#FFF4B4');
    return submerge(s.render(), 10, f, 1);
}

/** 20×20 office chair tipped on its back, floating: the cushion, the back, the gas lift and wheels in the air. */
function chair() {
    const s = new PixelSprite(20, 20, { dither: 0.1 });
    // the backrest lying in the water, the seat cushion
    s.box(1.5, 7, 6, 8, P.plas, { g: 'back', r: 2, bias: 0.25 });
    s.auto('back', { R: 1.6, grad: 0.3 });
    s.ellipse(10, 11, 6, 3, P.plas, { g: 'seat', bias: 0.3 });
    s.auto('seat', { R: 1.6, grad: 0.3 });
    s.line(6, 9, 3.5, 10, P.chrome, { w: 1.2, lum: 0.5 });
    // the gas lift up into the air, the star base, the casters
    s.line(11, 10, 14, 4, P.chrome, { w: 1.6, lum: 0.75 });
    for (const [x, y] of [
        [18, 2],
        [17, 7],
        [10, 3]
    ]) {
        s.line(14, 4, x, y, P.plas, { w: 1.3, lum: 0.45 });
        s.circle(x, y, 1.2, P.plas, { bias: -0.05 });
    }
    s.px(14, 4, '#BACAD6');
    return submerge(s.render(), 12, 0, 2);
}

/** 18×28 pool ladder: two chrome handrails rising out of the water and curving back to the deck, steps below. */
function ladder() {
    const s = new PixelSprite(18, 28, { dither: 0 });
    // the steps under the water
    for (const y of [19, 23]) s.box(4, y, 9, 1.6, P.chrome, { bevel: 0.6, bias: -0.1 });
    for (const [x, back] of [
        [11, true],
        [4, false]
    ]) {
        const o = { spec: 0.8, bias: back ? 0.05 : 0.25 };
        // rear leg back down to the deck plate, the arc over the top, the front rail into the water
        s.capsule(x + 3, 9, x + 3, 5.5, 0.9, 0.9, P.chrome, o);
        s.box(x + 1.6, 9, 3, 1.4, P.chrome, { bevel: 0.5, bias: -0.1 });
        s.capsule(x + 3, 5.5, x + 2.4, 3.2, 0.9, 0.9, P.chrome, o);
        s.capsule(x + 2.4, 3.2, x + 1, 2.4, 0.9, 0.9, P.chrome, o);
        s.capsule(x + 1, 2.4, x, 4, 0.9, 0.9, P.chrome, o);
        s.capsule(x, 4, x, 25, 0.9, 0.9, P.chrome, o);
        s.px(x, 7, '#FFFFFF');
    }
    return submerge(s.render(), 16, 0, 2);
}

export const PROPS = {
    pool_desk: {
        gen: desk,
        foot: 6,
        shadow: 0.85,
        light: { rgb: '255,70,90', r: 60, a: 0.35, x: 0, y: -8, flicker: 'pulse' }
    },
    pool_pillar: { gen: pillar, foot: 8, shadow: 0.8, tall: true },
    pool_lifeguard: { gen: lifeguard, foot: 7, shadow: 0.8, tall: true },
    pool_ticker: {
        gen: ticker,
        frames: 4,
        fps: 6,
        foot: 8,
        shadow: 0.85,
        light: { rgb: '255,60,80', r: 70, a: 0.4, x: 0, y: 0, flicker: 'pulse' }
    },
    pool_cooler: { gen: cooler, foot: 6, shadow: 0.8 },
    pool_plant: { gen: plant, foot: 6, shadow: 0.8 },
    pool_vault: { gen: vault, foot: 7, shadow: 0.85 },
    pool_buoy: { gen: buoy, frames: 4, fps: 4, foot: 5, shadow: 0.5 },
    pool_duck: { gen: duck, frames: 4, fps: 4, foot: 3, shadow: 0.4 },
    pool_chair: { gen: chair, foot: 7, shadow: 0.6 },
    pool_ladder: { gen: ladder, foot: 11, shadow: 0 }
};

// ---- decals: flat, faint marks on the pool floor and the surface ------------------------------------------

/** A flat decal from an ASCII picture. */
function flat(rows, colors) {
    const s = new PixelSprite(rows[0].length, rows.length);
    s.patch(0, 0, rows, colors);
    return s.render({ outline: false });
}

/** A lily pad with its notch. */
function lilyA() {
    return flat(
        [
            '...aaaaa...',
            '.aabbbbbaa.',
            'abbbcbbbbba',
            'abbbbc.....',
            'abbbbbbbbba',
            '.aabbbbbaa.',
            '...aaaaa...'
        ],
        { a: '#1E5A34', b: '#2A6E3C', c: '#3E8A4C' }
    );
}

/** Two small lily pads, one with a pale pink bud. */
function lilyB() {
    return flat(
        [
            '..aaa.........',
            '.abbba........',
            'abbcb.....aaa.',
            'abbbba...abdba',
            '.abba....abbba',
            '..aa......aaa.'
        ],
        { a: '#1E5A34', b: '#2A6E3C', c: '#3E8A4C', d: '#C890A8' }
    );
}

/** A soggy trade slip, the ink run. */
function slip() {
    return flat(['.aaaaaa.', 'abbbbbba', 'abccbbba', 'abbbbcba', 'abdbbbba', '.aaaaaa.'], {
        a: '#3E6A70',
        b: '#5A868A',
        c: '#3A5E64',
        d: '#7A4450'
    });
}

/** A square drain grate in the pool floor. */
function grate() {
    return flat(
        [
            'aaaaaaaaaa',
            'abbbbbbbba',
            'abcbcbcbba',
            'abcbcbcbba',
            'abcbcbcbba',
            'abcbcbcbba',
            'abcbcbcbba',
            'abcbcbcbba',
            'abbbbbbbba',
            'aaaaaaaaaa'
        ],
        { a: '#0C3038', b: '#2A6A72', c: '#061A20' }
    );
}

/** A patch of algae on the tiles. */
function algae() {
    return flat(
        [
            '...a....b.....',
            '.aaba..abb....',
            'abbcba.bcbb.a.',
            '.abbbaabbba.ab',
            '..aba..aab..a.',
            '....a....a....'
        ],
        { a: '#1E4A36', b: '#2A5E3E', c: '#3A7048' }
    );
}

/** A cracked tile line. */
function crack() {
    return flat(
        [
            '......a.........',
            'aa...a.ab.......',
            '.baaa...aaa...b.',
            '..b.......aaaa.a',
            '...............b'
        ],
        { a: '#08262E', b: '#2A7880' }
    );
}

export const DECALS = {
    pool_lily_a: { gen: lilyA },
    pool_lily_b: { gen: lilyB },
    pool_slip: { gen: slip },
    pool_grate: { gen: grate },
    pool_algae: { gen: algae },
    pool_crack: { gen: crack }
};
