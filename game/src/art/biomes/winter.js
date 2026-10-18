// Scenery for the winter map, drawn with the pixel-art engine (art/pixel.js). See art/props.js for the format.
//
// Crypto Winter: a frozen tundra at night under an aurora, with an abandoned mining camp. Snow-laden pines,
// frozen ponds, ice crystals, frozen GPU rigs, a snowman shaped like a bear and an ATM frozen solid (its
// screen still red: withdrawals paused). The ground is light snow, so every standing prop carries a dark
// selective outline and a snow cap a touch brighter than the ground; big surfaces stay cool and quiet, and
// the enemy red only shows up as small glowing accents.

import { PixelSprite, mat } from '../pixel.js';

// ---- winter materials: six tones, dark -> light; shadows lean violet, highlights warm white ----------

const W = {
    // snow lying on things: a touch brighter than the snow ground ('#A4B8CF')
    snow: mat(['#56638C', '#7484AC', '#9BB0CE', '#C5D6E9', '#E6EFF8', '#FFFCF2'], {
        line: '#161C30'
    }),
    // pine needles under snow: deep, cold blue-green
    needle: mat(['#08141C', '#0F2630', '#183A40', '#245050', '#346860', '#4E8274'], {
        line: '#050C12'
    }),
    // frosted bark: cold grey-brown
    bark: mat(['#140E12', '#271B20', '#3A2A2C', '#523C38', '#6C5248', '#8A6E5C'], {
        line: '#0A0608'
    }),
    // dark granite
    rock: mat(['#141826', '#232A3A', '#363F52', '#4C566A', '#677286', '#8A94A6'], {
        line: '#0A0C14'
    }),
    // weathered camp timber: logs, the sled, the pallet
    wood: mat(['#1C110E', '#36231A', '#523626', '#6E4C36', '#8C674A', '#AE8C6A'], {
        line: '#0E0806'
    }),
    // sawn log ends: pale, warm
    grain: mat(['#3A2A1E', '#5E4632', '#82664A', '#A68A66', '#C6AC86', '#E2CCA8'], {
        line: '#1C130C'
    }),
    // clear blue ice
    ice: mat(['#0E2840', '#1A4A6A', '#2E6E92', '#4E98BA', '#86C4DE', '#D2F0FA'], {
        line: '#06121E'
    }),
    // ice crystals that glow from inside
    crystal: mat(['#0A2A44', '#145A86', '#2A8EC0', '#58C4EC', '#A8E8FF', '#EAFCFF'], {
        line: '#04121E'
    }),
    // frozen steel: the rig frame, GPU shrouds, the lamp post
    steel: mat(['#10141C', '#1E2430', '#303846', '#47525F', '#65737F', '#93A2AC'], {
        line: '#080A0F'
    }),
    // the ATM's frosted casing
    casing: mat(['#1A2232', '#2C3850', '#43526E', '#5E6E8C', '#8494AE', '#B4C2D6'], {
        line: '#0C111A'
    }),
    // a knitted scarf: muted brick red, nowhere near the enemy red
    wool: mat(['#2A0E14', '#4E1A22', '#74282E', '#96383A', '#B4544C', '#CC7A68'], {
        line: '#16070A'
    }),
    // coal and charcoal
    coal: mat(['#0C0D12', '#16181F', '#22252E', '#30343F', '#444A56', '#5E6572'], {
        line: '#06070A'
    }),
    // flag canvas: cold off-white
    canvas: mat(['#3A4256', '#5E6880', '#8A94AA', '#B4BDCE', '#D6DCE6', '#F0F2F6'], {
        line: '#141824'
    }),
    // fire, from embers to the white-hot core
    fire: mat(['#3A0A06', '#7A1E0C', '#C8401A', '#FF7A2A', '#FFB45C', '#FFE6A8'], {
        line: '#1A0503',
        glow: '#FF7A2A'
    })
};

// ---- helpers --------------------------------------------------------------------------------------------

/** A small deterministic hash in [0, 1): irregularity without Math.random. */
function hash(a, b = 0, c = 0) {
    let h =
        (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1440662683)) |
        0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Fill every pixel whose centre passes `inside(x, y)` in the box, as spans (light it with an `auto` group).
 * `o.biasAt(x, y)` gives each pixel its own brightness nudge (texture inside one lit volume).
 */
function fill(s, x0, y0, x1, y1, inside, m, o = {}) {
    const rows = [];
    for (let y = Math.floor(y0); y <= y1; y++) {
        let start = null;
        for (let x = Math.floor(x0); x <= x1 + 1; x++) {
            const on = x <= x1 && inside(x + 0.5, y + 0.5);
            if (on && o.biasAt) s.spans([[y, x, x]], m, { ...o, bias: o.biasAt(x, y) });
            else if (on && start === null) start = x;
            if (!on && start !== null) {
                rows.push([y, start, x - 1]);
                start = null;
            }
        }
    }
    return o.biasAt ? s : s.spans(rows, m, o);
}

/**
 * Let snow settle on everything drawn so far inside the box: on every upward-facing surface, `above` px of
 * snow on top of it and `depth` px down over it (a number, or a function of x and y), lit as one volume.
 * `on(m)` limits it to some materials. Glowing pixels never get snow.
 */
function snowfall(s, x0, y0, x1, y1, o = {}) {
    const {
        depth = 2,
        above = 1,
        g = 'fall',
        bias = 0.12,
        R = 1.4,
        grad = 0.35,
        on = () => true
    } = o;
    const occ = (x, y) => x >= 0 && y >= 0 && x < s.w && y < s.h && !!s.mat[y * s.w + x];
    const take = (x, y) => occ(x, y) && on(s.mat[y * s.w + x]) && !s.glow[y * s.w + x];
    const cells = new Map();
    for (let x = Math.max(0, x0); x <= Math.min(s.w - 1, x1); x++)
        for (let y = Math.max(0, y0); y <= Math.min(s.h - 1, y1); y++) {
            if (!take(x, y) || occ(x, y - 1)) continue; // only the tops of things
            const d = typeof depth === 'function' ? depth(x, y) : depth;
            for (let k = 1; k <= above && y - k >= 0 && !occ(x, y - k); k++)
                cells.set(`${x},${y - k}`, [x, y - k]);
            for (let k = 0; k < d && take(x, y + k); k++) cells.set(`${x},${y + k}`, [x, y + k]);
        }
    s.spans(
        [...cells.values()].map(([x, y]) => [y, x, x]),
        W.snow,
        { g, bias }
    );
    s.auto(g, { R, grad });
    return s;
}

/** A hanging icicle `len` px long from (x, y): pale at the root, a glint, blue at the tip. */
function icicle(s, x, y, len) {
    const o = { line: W.ice.line };
    for (let k = 0; k < len; k++)
        s.px(x, y + k, k === 0 ? '#E6F6FF' : k === len - 1 ? '#5E9CC4' : '#A2D6EE', o);
    return s;
}

/** Hang an icicle under whatever is drawn in column x: at the first underside found below y. */
function hang(s, x, y, len) {
    let yy = Math.max(0, y);
    while (yy < s.h && !s.mat[yy * s.w + x]) yy++;
    while (yy < s.h && s.mat[yy * s.w + x]) yy++;
    return yy < s.h ? icicle(s, x, yy, len) : s;
}

/**
 * A heap of snow standing on the ground line gy: the top of an ellipse, lit as one soft volume. No outline
 * of its own, so it melts into the snow ground and whatever stands in it looks sunk in.
 */
function mound(s, cx, gy, rx, ry, g = 'mound', bias = 0.04) {
    const inside = (x, y) => ((x - cx) / rx) ** 2 + ((y - gy - 0.5) / ry) ** 2 <= 1 && y < gy + 1;
    fill(s, cx - rx - 1, gy - ry - 1, cx + rx + 1, gy, inside, W.snow, { g, bias, bare: true });
    s.auto(g, { R: Math.max(1, ry * 0.7), grad: 0.4 });
    return s;
}

/** Mix two hex colours: k = 0 gives a, 1 gives b. */
function mix(a, b, k) {
    const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const A = p(a);
    const B = p(b);
    return `#${A.map((v, i) =>
        Math.round(v + (B[i] - v) * k)
            .toString(16)
            .padStart(2, '0')
    ).join('')}`.toUpperCase();
}

/**
 * A snowy conifer: `tiers` is a list of [top, bot, hw, dx?] from the bottom tier up. Each tier is a skirt of dark
 * needles (apex at (cx, top), base half-width `hw` at y = bot) that flares like an umbrella, droops at the
 * ends and hangs off its bottom edge in rounded clumps; a blanket of snow lies on its upper surface, from
 * the tier above's hanging clumps (which cast a contact shadow onto it) down, with drips over the clumps.
 * `lean` bends the crown sideways; `seed` varies the clumps and drips.
 */
function pine(s, cx, tiers, { snow = 4.2, lean = 0, seed = 0, clump = 5 } = {}) {
    const n = tiers.length;
    const mids = tiers.map((t, i) => cx + lean * (i / Math.max(1, n - 1)) + (t[3] || 0));
    const masks = tiers.map(([top, bot, hw], i) => {
        const H = bot - top;
        const mx = mids[i];
        return (x, y) => {
            const t = (y - top) / H;
            if (t < 0) return false;
            const d = Math.abs(x - mx);
            if (d > hw * Math.pow(Math.min(t, 1), 0.68)) return false;
            // rounded clumps hanging off the bottom edge; the outer ones droop lowest
            const k = (x - mx) / clump + (seed + i) * 0.37;
            const f = k - Math.round(k);
            const scallop = (1 - 4 * f * f) * 2.2;
            return y < bot - 3.2 + Math.pow(d / hw, 2) * 3 + scallop;
        };
    });
    const lowest = (m, x, y0, y1) => {
        for (let y = y1; y >= y0; y--) if (m(x, y + 0.5)) return y;
        return -Infinity;
    };
    const highest = (m, x, y0, y1) => {
        for (let y = y0; y <= y1; y++) if (m(x, y + 0.5)) return y;
        return Infinity;
    };
    tiers.forEach(([top, bot, hw], i) => {
        const inTier = masks[i];
        const up = masks[i + 1];
        const mx = mids[i];
        const x0 = mx - hw - 4;
        const x1 = mx + hw + 4;
        // needles: chevron strokes that slope down and out along the branches, a touch of texture
        const biasAt = (x, y) => {
            const v = (y - Math.abs(x + 0.5 - mx) * 0.55 + seed + i * 2) % 3;
            return (v < 0 ? v + 3 : v) < 1 ? 0.07 : hash(x, y, seed + 11) < 0.12 ? -0.08 : 0;
        };
        fill(s, x0, top, x1, bot + 3, inTier, W.needle, { g: `n${i}`, biasAt });
        s.auto(`n${i}`, { R: 2.6, grad: 0.5 });
        // the snow blanket starts where this tier shows: under the tier above, or at its own top edge
        const inSnow = (x, y) => {
            if (!inTier(x, y)) return false;
            const own = highest(inTier, Math.floor(x), top - 1, bot + 2);
            const above = up
                ? lowest(up, Math.floor(x), tiers[i + 1][0], tiers[i + 1][1] + 3)
                : -Infinity;
            const from = Math.max(own, above);
            const u = Math.abs(x - mx) / hw;
            const k = (x - mx) / clump + (seed + i) * 0.37;
            const f = k - Math.round(k);
            const drip = Math.max(0, 1 - 9 * f * f) * 1.8 * hash(Math.round(k), seed + i, 3);
            const lump = (hash(Math.floor(x), seed + i, 7) - 0.5) * 0.8;
            return y - from < Math.max(1.5, snow * (1 - 0.35 * u) + drip + lump);
        };
        fill(s, x0, top, x1, bot + 3, inSnow, W.snow, { g: `s${i}`, bias: 0.14 });
        s.auto(`s${i}`, { R: 1.6, grad: 0.45 });
    });
}

// ---- props ------------------------------------------------------------------------------------------------

/** 36×64 snow-laden pine: five drooping tiers, each under a blanket of snow, on a short dark trunk. */
function pineA() {
    const s = new PixelSprite(34, 62, { dither: 0.3 });
    s.capsule(17, 48, 17, 60, 2, 2.6, W.bark, { bias: -0.05 });
    pine(s, 17, [
        [31, 57, 16.5],
        [22, 46, 14.5],
        [14, 35, 12],
        [7, 25, 9],
        [1, 15, 6]
    ]);
    return mound(s, 17, 61, 6.5, 2.2).render();
}

/** 30×56 second pine: narrower and wind-bent, its tiers knocked off-centre, the crown leaning right. */
function pineB() {
    const s = new PixelSprite(28, 54, { dither: 0.3 });
    s.capsule(13, 42, 12.5, 52, 1.7, 2.3, W.bark, { bias: -0.05 });
    pine(
        s,
        13,
        [
            [27, 49, 13, -0.5],
            [19, 39, 11, 1],
            [12, 30, 8.5, -0.5],
            [6, 21, 6.5, 0.5],
            [0, 12, 4, 0.5]
        ],
        { lean: 2, seed: 3, snow: 4.6, clump: 4.5 }
    );
    return mound(s, 12.5, 53, 5.5, 2).render();
}

/** 22×38 young pine: four short tiers almost buried in snow. */
function pineSmall() {
    const s = new PixelSprite(20, 36, { dither: 0.25 });
    s.capsule(10, 28, 10, 34, 1.4, 1.8, W.bark, { bias: -0.05 });
    pine(
        s,
        10,
        [
            [16, 31, 9.5],
            [10, 24, 7.5],
            [4, 16, 5.5],
            [0, 9, 3.2]
        ],
        { seed: 7, snow: 3.8, clump: 4 }
    );
    return mound(s, 10, 35, 4.5, 1.8).render();
}

/**
 * 34×48 dead tree: a bare, crooked trunk with a few gnarled branches and a broken stub, snow lying along
 * every branch, icicles hanging off them, a drift round the roots.
 */
function deadTree() {
    const s = new PixelSprite(32, 46, { dither: 0.2 });
    const g = { g: 'tree' };
    const limb = (x0, y0, x1, y1, r0, r1) => s.capsule(x0, y0, x1, y1, r0, r1, W.bark, g);
    // roots and a crooked trunk
    limb(15, 43, 9.5, 45.5, 1.6, 0.6);
    limb(17, 43, 22.5, 45.5, 1.6, 0.6);
    limb(16, 45, 14.5, 30, 2.9, 2.1);
    limb(14.5, 30, 16.5, 18, 2.1, 1.5);
    limb(16.5, 18, 15, 8, 1.5, 0.9);
    limb(15, 8, 16, 1.5, 0.9, 0.5);
    // a big low branch to the left, drooping twigs
    limb(14.5, 31, 6, 25, 1.5, 0.9);
    limb(6, 25, 1.5, 23.5, 0.8, 0.5);
    limb(6, 25, 4.5, 19, 0.7, 0.5);
    limb(9.5, 27.5, 8.5, 31, 0.6, 0.5);
    // the right branch, reaching out and up
    limb(16, 22, 25, 17, 1.3, 0.8);
    limb(25, 17, 30, 15.5, 0.7, 0.5);
    limb(25, 17, 26.5, 11, 0.6, 0.5);
    limb(21, 19.5, 22, 15.5, 0.5, 0.5);
    // the crown
    limb(16, 15, 9, 10, 0.9, 0.6);
    limb(9, 10, 6.5, 5, 0.6, 0.5);
    limb(9, 10, 5.5, 11, 0.5, 0.5);
    limb(15.8, 11, 21, 5, 0.8, 0.5);
    limb(21, 5, 22.5, 2, 0.5, 0.5);
    // a broken stub
    limb(16, 36, 20.5, 34.5, 1.1, 1);
    s.auto('tree', { R: 1.3, grad: 0.3 });
    s.px(21, 34, '#8A6E5C').px(21, 35, '#6C5248'); // the break shows pale wood
    // a knot hole and bark grooves
    s.px(15, 33, '#140E12').px(15, 34, '#271B20');
    s.pxs(
        [
            [14, 39],
            [14, 40],
            [16, 25],
            [16, 26],
            [17, 41]
        ],
        '#271B20'
    );
    snowfall(s, 0, 0, 31, 45, { depth: 1, above: 1, R: 1, grad: 0.25 });
    mound(s, 16, 45, 7.5, 2.2, 'drift');
    for (const [x, l] of [
        [4, 2],
        [8, 3],
        [11, 2],
        [20, 2],
        [23, 3],
        [28, 2],
        [19, 2]
    ])
        hang(s, x, x === 19 ? 33 : 14, l);
    return s.render();
}

/** A boulder: lumps of granite, each lit as its own volume, under a thick snow cap, drifts at its foot. */
function boulder(w, h, lumps, { cap = 4, seed = 0, drifts = [] } = {}) {
    const s = new PixelSprite(w, h, { dither: 0.3 });
    lumps.forEach(([x, y, rx, ry], i) => {
        s.ellipse(x, y, rx, ry, W.rock, { g: `r${i}` });
        s.auto(`r${i}`, { R: Math.min(2.6, ry * 0.6), grad: 0.35 });
    });
    // cracks
    const occ = (x, y) => !!s.mat[y * w + x];
    for (let i = 0; i < Math.round(w / 6); i++) {
        const x = Math.floor(3 + hash(i, seed, 1) * (w - 6));
        const y = Math.floor(h * 0.5 + hash(i, seed, 2) * h * 0.35);
        if (occ(x, y) && occ(x + 1, y + 1)) s.px(x, y, '#232A3A').px(x + 1, y + 1, '#232A3A');
    }
    snowfall(s, 0, 0, w - 1, h - 1, {
        depth: (x) => cap + Math.round(Math.sin(x * 1.3 + seed) * 0.8 + hash(x, seed, 5) * 1.2),
        above: 1,
        R: 1.8,
        grad: 0.4
    });
    drifts.forEach(([x, rx, ry], i) => mound(s, x, h - 1, rx, ry, `d${i}`));
    return s;
}

/** 30×22 boulder: a heap of dark granite lumps under a thick, lumpy snow cap, banked with snow. */
function rock() {
    return boulder(
        28,
        20,
        [
            [14, 9.5, 8, 6.5],
            [7.5, 13, 6.5, 5.5],
            [20.5, 13, 7, 5.8],
            [13, 15.5, 5.5, 3.6]
        ],
        {
            cap: 3,
            seed: 2,
            drifts: [
                [3.5, 3.8, 2.6],
                [25, 3, 2],
                [14, 4, 1.4]
            ]
        }
    ).render();
}

/** 14×10 small rock with a snow cap. */
function rockSmall() {
    return boulder(
        12,
        8,
        [
            [6.5, 4.4, 5, 3.4],
            [3.8, 5.6, 3.2, 2.3]
        ],
        { cap: 2, seed: 4 }
    ).render();
}

/**
 * One ice crystal: a pointed prism from (x, base) up to its tip at (x + tilt, top), `w` wide; a lit left face,
 * a darker right face and a bright ridge between them. `glow` makes the lit face emissive.
 */
function prism(s, x, top, base, w, tilt, { glow = '#58C4EC', bright = 0 } = {}) {
    const tx = x + tilt;
    const sy = top + w * 0.9;
    const sl = x - w / 2 + tilt * 0.75;
    const sr = x + w / 2 + tilt * 0.75;
    const sc = x + tilt * 0.8;
    s.poly(
        [
            [tx, top],
            [sl, sy],
            [x - w / 2, base],
            [x, base],
            [sc, sy]
        ],
        W.crystal,
        { top: 0.95 + bright, bot: 0.6 + bright, glow }
    );
    s.poly(
        [
            [tx, top],
            [sc, sy],
            [x, base],
            [x + w / 2, base],
            [sr, sy]
        ],
        W.crystal,
        { top: 0.55 + bright, bot: 0.3 + bright }
    );
    s.line(sc, sy, x, base - 1, W.crystal, { lum: 0.85 + bright, glow });
}

/** 18×24 ice crystals: a cluster of tall cyan prisms growing out of a snow mound, glowing; 2 frames shimmer. */
function crystal(f) {
    const s = new PixelSprite(16, 22);
    const b = f % 2 ? 0.06 : 0;
    prism(s, 4.5, 7, 19, 4, -2, { bright: -0.05 });
    prism(s, 12, 4, 19, 4.5, 1.5, { bright: b });
    prism(s, 8, 0, 19, 5, 0.5, { bright: b });
    prism(s, 10.5, 11, 20, 3.5, 1, { bright: 0.05 });
    mound(s, 8, 21, 7.8, 2.4);
    // sparkles that hop between the tips
    const sp =
        f % 2
            ? [
                  [8, 1],
                  [12, 13]
              ]
            : [
                  [13, 5],
                  [3, 9]
              ];
    for (const [x, y] of sp) s.px(x, y, '#FFFFFF', { glow: '#EAFCFF' });
    s.px(f % 2 ? 6 : 10, f % 2 ? 9 : 7, '#EAFCFF', { glow: '#A8E8FF' });
    return s.render();
}

/**
 * 34×28 frozen GPU mining rig: an open steel frame on a wooden pallet, three graphics cards side by side,
 * two fans each with frost on the blades, icicles hanging off the rails, snow on top; one status LED
 * blinks green, then red.
 */
function rig(f) {
    const s = new PixelSprite(32, 26, { dither: 0.15 });
    // the pallet: deck boards on three blocks
    s.box(0, 19, 32, 3, W.wood, { r: 0.5, bevel: 1.2 });
    for (const x of [8, 16, 24]) s.line(x, 19.5, x, 21.5, W.wood, { lum: 0.25 });
    for (const x of [1, 14, 27]) s.box(x, 22, 4, 2.6, W.wood, { r: 0.4, bevel: 1, bias: -0.15 });
    s.box(0, 24, 32, 1.6, W.wood, { r: 0.4, bevel: 0.8, bias: -0.1 });
    // the frame
    s.box(2, 4, 2, 14, W.steel, { bevel: 1, bias: 0.1 });
    s.box(28, 4, 2, 14, W.steel, { bevel: 1, bias: -0.05 });
    s.box(1.5, 2.5, 29, 2, W.steel, { bevel: 1, bias: 0.15 });
    // three cards: steel shrouds, two fans each (a dark well, blades, a pale hub, frost on the rim)
    for (let i = 0; i < 3; i++) {
        const x = 4 + i * 8;
        s.box(x, 5, 7, 12, W.steel, { r: 0.6, bevel: 1.4, bias: 0.2 - i * 0.05 });
        for (const fy of [8, 13.5]) {
            const cx = x + 3.5;
            s.circle(cx, fy, 2.7, W.steel, { shade: 'flat', lum: 0.9 - i * 0.08 });
            s.circle(cx, fy, 1.9, W.coal, { shade: 'flat', lum: 0.1 });
            s.px(cx - 1, fy - 1, '#444A56')
                .px(cx + 1, fy, '#30343F')
                .px(cx - 0.5, fy + 0.5, '#30343F');
            s.px(cx, fy - 0.5, '#93A2AC');
            s.px(cx - 2, fy - 1.5, '#E6F6FF').px(cx - 1.5, fy - 2.5, '#D2F0FA'); // frost on the rim
        }
        s.line(x + 0.5, 16.5, x + 6.5, 16.5, W.steel, { lum: 0.15 });
    }
    // the bottom rail with the status LED: green, then red
    s.box(1.5, 17, 29, 2, W.steel, { bevel: 1, bias: 0.05 });
    const led = f % 2 ? '#FF3B5C' : '#5CFFA0';
    s.px(5, 17, led, { glow: led }).px(6, 17, f % 2 ? '#B81E40' : '#16B070', { glow: led });
    // snow on the top rail and the pallet ends, drifts against the front
    snowfall(s, 0, 0, 31, 3, { depth: 1, above: 1 });
    snowfall(s, 0, 17, 1, 20, { depth: 2, above: 1, g: 'deckL' });
    snowfall(s, 30, 17, 31, 20, { depth: 2, above: 1, g: 'deckR' });
    mound(s, 4, 25, 4.5, 2.6, 'driftL');
    mound(s, 28.5, 25, 3.5, 1.8, 'driftR');
    for (const [x, l] of [
        [11, 3],
        [19, 2],
        [27, 3],
        [8, 2],
        [17, 3],
        [24, 2]
    ])
        hang(s, x, x === 8 || x === 17 || x === 24 ? 17 : 2, l);
    return s.render();
}

/**
 * 24×32 snow bear: a snowman built like a bear, round body, round head and round ears, coal eyes and nose,
 * a knitted brick-red scarf with a striped tail, stick arms.
 */
function snowbear() {
    const s = new PixelSprite(22, 30, { dither: 0.3 });
    // stick arms, behind the body
    s.line(5, 20, 0.5, 14, W.bark, { w: 1.2, lum: 0.45 });
    s.line(1.5, 15.5, 0.5, 17.5, W.bark, { lum: 0.35 });
    s.line(17, 20, 21, 13.5, W.bark, { w: 1.2, lum: 0.35 });
    s.line(20, 15, 21.5, 16.5, W.bark, { lum: 0.3 });
    // body, head, ears: snow lit as round volumes
    s.ellipse(11, 22, 8, 7.2, W.snow, { g: 'body' });
    s.auto('body', { R: 3.5, grad: 0.4 });
    s.circle(5.5, 5.2, 2.6, W.snow, { g: 'head' });
    s.circle(16.5, 5.2, 2.6, W.snow, { g: 'head' });
    s.ellipse(11, 10.5, 6.6, 6, W.snow, { g: 'head' });
    s.auto('head', { R: 2.8, grad: 0.4 });
    s.px(5, 5, '#7484AC').px(16, 5, '#7484AC').px(17, 5, '#56638C');
    // snout, coal nose and eyes, a coal smile
    s.ellipse(11, 13.2, 3, 2.2, W.snow, { g: 'snout', bias: 0.12 });
    s.auto('snout', { R: 1.2, grad: 0.3 });
    s.patch(10, 12, ['XXX', '.X.'], { X: '#16181F' });
    s.px(10, 12, '#444A56');
    s.patch(7, 9, ['XX', 'XX'], { X: '#16181F' }).px(7, 9, '#5E6572');
    s.patch(13, 9, ['XX', 'XX'], { X: '#16181F' }).px(13, 9, '#5E6572');
    s.pxs(
        [
            [9, 15],
            [13, 15]
        ],
        '#22252E'
    );
    // the scarf: a band round the neck and a tail down the front, with stripes and a fringe
    s.box(4, 15.5, 14, 3, W.wool, { r: 1.2, bevel: 1.4 });
    s.box(13, 17, 3.2, 7, W.wool, { r: 0.6, bevel: 1, bias: -0.05 });
    for (const y of [19, 21]) s.line(13.2, y, 15.8, y, W.wool, { lum: 0.85 });
    s.pxs(
        [
            [13, 24],
            [15, 24]
        ],
        '#74282E'
    );
    for (let x = 5; x < 17; x += 2) s.px(x, 16, '#B4544C');
    // coal buttons
    s.px(9, 21, '#16181F').px(9, 24, '#16181F');
    // snow banked against the base
    mound(s, 3.5, 29, 3.6, 1.8, 'driftL');
    mound(s, 18.5, 29, 3, 1.5, 'driftR');
    return s.render();
}

/** 14×52 lamp post: a cast-iron post and lantern, snow on its roof, icicles hanging; cold blue-white light. */
function lamp() {
    const s = new PixelSprite(12, 50, { dither: 0.2 });
    // plinth, post and collars
    s.box(2, 46, 8, 3.5, W.steel, { r: 0.6, bevel: 1.2 });
    s.box(3, 42, 6, 5, W.steel, { r: 0.5, bevel: 1.2 });
    s.box(5, 15, 2, 28, W.steel, { bevel: 1 });
    s.box(4, 29, 4, 2, W.steel, { r: 0.5, bevel: 0.8 });
    s.box(3.5, 14, 5, 2, W.steel, { r: 0.5, bevel: 0.8 });
    // the lantern: glowing glass between two posts, a bottom plate, a pointed roof and a finial
    s.box(4, 7, 4, 6, W.ice, { shade: 'flat', lum: 1, glow: '#BFE4FF' });
    s.px(4, 7, '#FFFFFF', { glow: '#FFFFFF' }).px(4, 8, '#FFFFFF', { glow: '#FFFFFF' });
    s.px(6, 10, '#FFF8E8', { glow: '#FFFFFF' }); // the mantle
    s.box(3, 6.5, 1.2, 7, W.steel, { shade: 'flat', lum: 0.55 });
    s.box(7.8, 6.5, 1.2, 7, W.steel, { shade: 'flat', lum: 0.3 });
    s.box(2.5, 12.5, 7, 1.6, W.steel, { shade: 'flat', lum: 0.45 });
    s.poly(
        [
            [1.5, 6.6],
            [10.5, 6.6],
            [8, 3.5],
            [4, 3.5]
        ],
        W.steel,
        { left: 0.7, right: 0.3 }
    );
    s.line(6, 1, 6, 3.5, W.steel, { lum: 0.5 });
    snowfall(s, 0, 0, 11, 14, { depth: 1, above: 1 });
    snowfall(s, 0, 40, 11, 47, { depth: 1, above: 1, g: 'base' });
    for (const [x, l] of [
        [2, 2],
        [10, 3],
        [3, 2],
        [8, 3]
    ])
        hang(s, x, x === 2 || x === 10 ? 3 : 12, l);
    return s.render();
}

/**
 * 24×20 campfire: two crossed logs on a bed of ash inside a ring of snow-capped stones, flames licking up
 * through 4 frames with sparks rising; the only warm light on the map.
 */
function campfire(f) {
    const s = new PixelSprite(22, 18);
    const ring = (a) => [11 + Math.cos(a) * 8.6, 14 + Math.sin(a) * 3.2];
    const stones = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((k) => (k / 11) * Math.PI * 2 + 0.3);
    const stone = (a, i) => {
        const [x, y] = ring(a);
        const rx = 2.1 + hash(i, 9) * 0.6;
        s.ellipse(x, y, rx, 1.7, W.rock, { g: `st${i}` });
        s.auto(`st${i}`, { R: 1, grad: 0.3 });
        s.px(Math.round(x - 1), Math.round(y - 1.6), '#E6EFF8').px(
            Math.round(x),
            Math.round(y - 1.6),
            '#C5D6E9'
        );
    };
    // the back half of the ring, the ash bed and the logs
    stones.forEach((a, i) => Math.sin(a) < 0 && stone(a, i));
    s.ellipse(11, 14, 7, 2.6, W.coal, { shade: 'flat', lum: 0.2 });
    s.capsule(4.5, 15.2, 16.5, 11.6, 1.4, 1.3, W.wood, {});
    s.capsule(5.5, 11.6, 17.5, 15.2, 1.4, 1.3, W.wood, {});
    s.circle(4.5, 15.2, 1.3, W.grain, { shade: 'flat', lum: 0.6 });
    s.circle(17.5, 15.2, 1.3, W.grain, { shade: 'flat', lum: 0.45 });
    // embers glowing in the logs
    s.pxs(
        [
            [10, 13],
            [12, 14],
            [8, 14],
            [14, 13]
        ],
        '#FF9A3C',
        { glow: '#FF7A2A' }
    );
    // flames: three tongues, each an outer, a middle and a core, swaying through the frames; no outline,
    // so they read as light
    const sway = [0, 0.9, 0, -0.9][f % 4];
    const hts = [
        [8, 11.5, 7],
        [9, 9.5, 8.5],
        [7.5, 12, 7],
        [9, 10.5, 7.5]
    ][f % 4];
    const fl = { shade: 'flat', bare: true };
    [
        [8, 0],
        [11, 1],
        [14, 2]
    ].forEach(([x, i]) => {
        const h = hts[i];
        const top = 12.5 - h;
        const sx = sway * (i === 1 ? 1 : -0.6);
        s.capsule(x, 12, x + sx, top, 2.3, 0.4, W.fire, { ...fl, lum: 0.45 });
        s.capsule(x, 12, x + sx * 0.8, top + h * 0.3, 1.5, 0.3, W.fire, { ...fl, lum: 0.7 });
        s.capsule(x, 12.3, x + sx * 0.5, top + h * 0.6, 0.9, 0.3, W.fire, { ...fl, lum: 1 });
    });
    // sparks
    const sp = [
        [
            [6, 3],
            [15, 0]
        ],
        [
            [13, 2],
            [9, 0]
        ],
        [
            [7, 1],
            [16, 3]
        ],
        [
            [12, 0],
            [5, 4]
        ]
    ][f % 4];
    for (const [x, y] of sp) s.px(x, y, '#FFE6A8', { glow: '#FFB45C', bare: true });
    // the front half of the ring
    stones.forEach((a, i) => Math.sin(a) >= 0 && stone(a, i));
    return s.render();
}

/**
 * 46×28 igloo: a dome of packed-snow blocks laid in courses, with an entrance vestibule out front and a dark
 * doorway, a faint warm glow deep inside.
 */
function igloo() {
    const s = new PixelSprite(44, 26, { dither: 0.25 });
    // block courses: seams that bow down toward the viewer, joints staggered course by course
    const blocks = (cx, gy, rx, ry, course, seed) => (x, y) => {
        const h = (gy - y) / ry; // 0 at the ground, 1 at the top
        if (h < 0) return 0;
        const rr = Math.sqrt(Math.max(0, 1 - h * h)) * rx;
        const u = (x + 0.5 - cx) / Math.max(1, rr);
        const bow = Math.sqrt(Math.max(0, 1 - u * u)) * 1.6;
        const c = (gy - y + bow) / course;
        const row = Math.floor(c);
        if (c - row < 0.22) return -0.28; // the seam
        const ang = Math.asin(Math.max(-1, Math.min(1, u))) / (Math.PI / 2);
        const j = ang * (4.5 - row * 0.6) + (row % 2) * 0.5 + seed;
        if (Math.abs(j - Math.round(j)) < 0.06 + Math.abs(u) * 0.06) return -0.24; // a joint
        return c - row < 0.42 ? 0.06 : 0;
    };
    const dome = (x, y) => ((x - 17) / 17) ** 2 + ((y - 25) / 23.5) ** 2 <= 1 && y < 25.5;
    const bd = blocks(17, 25, 17, 23.5, 4.4, 0.2);
    fill(s, 0, 1, 34, 25, dome, W.snow, { g: 'dome', biasAt: (x, y) => bd(x, y) - 0.04 });
    s.auto('dome', { R: 6, grad: 0.45 });
    const hall = (x, y) => ((x - 33) / 10) ** 2 + ((y - 25) / 13) ** 2 <= 1 && y < 25.5;
    const bh = blocks(33, 25, 10, 13, 4.2, 0.5);
    fill(s, 22, 11, 43, 25, hall, W.snow, { g: 'hall', biasAt: (x, y) => bh(x, y) + 0.02 });
    s.auto('hall', { R: 3.5, grad: 0.4 });
    // the doorway
    const door = (x, y) => ((x - 33.5) / 4.6) ** 2 + ((y - 25) / 7.5) ** 2 <= 1 && y < 25.5;
    fill(s, 28, 16, 39, 25, door, W.coal, { lum: 0.05, bare: true });
    fill(s, 29, 17, 38, 25, (x, y) => door(x, y) && (x > 35.5 || y < 19.5), W.coal, {
        lum: 0.2,
        bare: true
    });
    s.pxs(
        [
            [32, 24],
            [33, 24],
            [34, 24],
            [33, 23]
        ],
        '#5A2E1C'
    );
    s.px(33, 24, '#8A4A26');
    // highlights on the brow of the doorway
    for (let x = 30; x <= 37; x++) {
        const y =
            Math.round(25 - 7.5 * Math.sqrt(Math.max(0, 1 - ((x + 0.5 - 33.5) / 4.6) ** 2))) - 1;
        if (y > 16) s.px(x, y, x < 34 ? '#E6EFF8' : '#C5D6E9');
    }
    return s.render();
}

/**
 * 22×34 frozen ATM: a cash machine encased in a block of clear ice, frost and snow on top; through the ice its
 * screen still glows red with a pause sign. Withdrawals paused.
 */
function atm() {
    const s = new PixelSprite(20, 32, { dither: 0.2 });
    // the ice block: its front face, then its top face catching the light
    s.box(0, 4, 20, 28, W.ice, { r: 1, bevel: 2.5, bias: 0.05 });
    s.box(0, 1.5, 20, 4, W.ice, { r: 1, bevel: 1.2, bias: 0.25 });
    // the machine inside: casing, a header with its sign, screen bezel, keypad, card slot, cash slot
    s.box(2, 7, 15, 24, W.casing, { r: 0.6, bevel: 2 });
    s.box(2, 7, 15, 5.5, W.casing, { r: 0.6, bevel: 1, bias: -0.3 });
    s.patch(3, 8, ['.X..XXX.X...X', 'X.X..X..XX.XX', 'XXX..X..X.X.X', 'X.X..X..X...X'], {
        X: '#C8D8EA'
    });
    s.box(3.5, 13.5, 12, 7, W.coal, { r: 0.4, shade: 'flat', lum: 0.25 });
    s.box(4, 22, 6, 4, W.casing, { r: 0.4, bevel: 1, bias: -0.2 });
    for (let y = 23; y <= 24; y++) for (let x = 5; x <= 9; x += 2) s.px(x, y, '#B4C2D6');
    s.line(11.5, 22.5, 14.5, 22.5, W.coal, { lum: 0.1 });
    s.box(4.5, 27, 10, 1.8, W.coal, { r: 0.4, shade: 'flat', lum: 0.1 });
    s.line(4.5, 29, 14.5, 29, W.casing, { lum: 0.85 });
    // the screen: red, a pause sign, scanlines
    for (let y = 14; y <= 19; y++)
        for (let x = 4; x <= 14; x++) {
            const c = y === 14 ? '#FF6B80' : y % 2 ? '#FF3B5C' : '#E0304E';
            s.px(x, y, c, { glow: '#FF3B5C' });
        }
    s.pxs(
        [
            [8, 15],
            [8, 16],
            [8, 17],
            [8, 18],
            [10, 15],
            [10, 16],
            [10, 17],
            [10, 18]
        ],
        '#FFE4EA',
        { glow: '#FFC9D2' }
    );
    // snow on the top face
    snowfall(s, 0, 0, 19, 4, { depth: 1, above: 1, on: (m) => m === W.ice });
    const r = s.render();
    // the glaze: the machine is seen through the ice
    for (let y = 6; y < 31; y++)
        for (let x = 1; x < 19; x++) {
            const i = (y + 1) * r.w + x + 1;
            const m = s.mat[y * s.w + x];
            if (!r.px[i] || !m || m === W.ice || m === W.snow) continue;
            r.px[i] = mix(r.px[i], r.glow[i] ? '#B8E4F6' : '#7EBEDF', r.glow[i] ? 0.1 : 0.3);
        }
    // reflections: diagonal streaks across the front face, and frost specks
    const streak = (x0, y0, len, k) => {
        for (let t = 0; t < len; t++) {
            const i = (y0 - t + 1) * r.w + x0 + t + 1;
            if (r.px[i] && !r.glow[i]) r.px[i] = mix(r.px[i], '#F2FCFF', k);
        }
    };
    streak(1, 27, 17, 0.45);
    streak(2, 27, 16, 0.25);
    streak(9, 30, 9, 0.35);
    for (const [x, y] of [
        [1, 9],
        [18, 12],
        [1, 20],
        [18, 26]
    ])
        r.px[(y + 1) * r.w + x + 1] = '#E8FAFF';
    return r;
}

/** 32×14 sled: a wooden sled on a curled steel runner, a crate lashed on with rope, its back end in a drift. */
function sled() {
    const s = new PixelSprite(30, 12);
    // stanchions, then the runner, its front (left) end sweeping up and curling back
    for (const x of [8, 15, 22]) s.box(x - 0.5, 7, 1.6, 3, W.wood, { shade: 'flat', lum: 0.2 });
    const run = { w: 1.4, lum: 0.85 };
    s.line(4.5, 10.3, 28, 10.3, W.steel, run);
    s.line(4.5, 10.3, 2, 9, W.steel, run);
    s.line(2, 9, 0.8, 6.5, W.steel, run);
    s.line(0.8, 6.5, 1.6, 4, W.steel, { ...run, lum: 1 });
    s.line(1.6, 4, 3.6, 3.4, W.steel, { ...run, lum: 1 });
    s.px(4, 4, '#47525F');
    // the deck: slats seen from slightly above, a darker front edge
    s.box(3.5, 4.5, 24, 2.6, W.wood, { r: 0.4, bevel: 0.8, bias: 0.12 });
    s.box(3.5, 7, 24, 1.4, W.wood, { shade: 'flat', lum: 0.22 });
    for (const x of [7, 11, 19, 23]) s.line(x, 4.6, x, 6.6, W.wood, { lum: 0.35 });
    // the crate: pale planks in a dark frame, two rope bands lashing it down
    s.box(10.5, 0, 9, 6.5, W.grain, { r: 0.3, bevel: 1, bias: 0.05 });
    s.line(11, 3.2, 19, 3.2, W.grain, { lum: 0.3 });
    s.box(10.5, 0, 1.4, 6.5, W.wood, { shade: 'flat', lum: 0.4 });
    s.box(18.1, 0, 1.4, 6.5, W.wood, { shade: 'flat', lum: 0.3 });
    const rope = (x0, y0, x1, y1) => s.line(x0, y0, x1, y1, W.grain, { lum: 0.95 });
    rope(13.5, 0, 13.5, 6.5);
    rope(16.5, 0, 16.5, 6.5);
    rope(13.5, 6.4, 7, 6.6);
    rope(16.5, 6.4, 23, 6.6);
    snowfall(s, 0, 0, 29, 11, { depth: 1, above: 1, on: (m) => m !== W.steel });
    // the back end sunk in a drift
    mound(s, 26.5, 11, 4.6, 4.4, 'drift');
    mound(s, 29, 11, 2, 3.2, 'drift2');
    return s.render();
}

/**
 * 52×28 cabin ruin: the stub of a log-cabin wall, its top logs broken off, an empty window frame with a
 * shutter hanging by one hinge; snow on every log, icicles off the corner, drifts banked against the foot.
 * Waist-high to the bull.
 */
function cabinRuin() {
    const s = new PixelSprite(50, 26);
    const log = (x0, x1, y, i) => {
        s.capsule(x0, y, x1, y, 2.2, 2.2, W.wood, { g: `log${i}`, bias: -0.04 * i });
        s.auto(`log${i}`, { R: 2, grad: 0.15 });
        // the sawn end on the left, rings and all
        s.circle(x0, y, 1.9, W.grain, { lum: 0.72 });
        s.px(Math.round(x0 - 0.5), Math.round(y - 0.5), '#82664A');
        s.px(Math.round(x0 + 0.5), Math.round(y - 1.5), '#E2CCA8');
    };
    // the window frame, behind the logs: two posts, the lintel snapped off at one end and sagging
    s.box(29, 2.5, 2.2, 13, W.wood, { bevel: 0.8, bias: 0.12 });
    s.box(38, 2.5, 2.2, 13, W.wood, { bevel: 0.8, bias: -0.08 });
    s.poly(
        [
            [29, 2],
            [35.5, 2],
            [35, 3.6],
            [29, 4]
        ],
        W.wood,
        { top: 0.7, bot: 0.4 }
    );
    s.line(36, 3, 37, 4.6, W.wood, { lum: 0.4 });
    log(2.5, 48, 21.6, 0);
    log(4.5, 46, 17.2, 1);
    log(2.5, 28.5, 12.8, 2);
    log(41, 45.5, 12.8, 3);
    log(4.5, 17, 8.4, 4);
    // the sill across the window gap
    s.box(28.5, 14, 12.5, 1.6, W.wood, { bevel: 0.6, bias: 0.15 });
    // splintered breaks
    s.pxs(
        [
            [18, 7],
            [19, 8],
            [46, 11],
            [47, 12],
            [48, 16]
        ],
        '#6E4C36'
    );
    // a shutter hanging off the right post by one hinge
    s.poly(
        [
            [40.5, 4],
            [43.5, 5.5],
            [42.5, 11],
            [39.5, 9.6]
        ],
        W.wood,
        { top: 0.6, bot: 0.35 }
    );
    s.line(40.5, 6.5, 43, 7.8, W.wood, { lum: 0.2 });
    snowfall(s, 0, 0, 49, 25, { depth: (x) => 1 + (hash(x, 3) > 0.55 ? 1 : 0), above: 1, R: 1.2 });
    for (const [x, l] of [
        [1, 2],
        [2, 3],
        [31, 2],
        [34, 3],
        [47, 2]
    ])
        hang(s, x, x === 31 || x === 34 ? 1 : 9, l);
    // drifts banked against the foot
    mound(s, 9, 25, 7.5, 2.6, 'd0');
    mound(s, 25, 25, 5, 1.6, 'd1');
    mound(s, 43, 25, 7, 3.2, 'd2');
    return s.render();
}

/**
 * 40×14 snowdrift: a long soft mound, gentle on the windward (left) side, where it melts into the ground with
 * no outline, rising to a rounded crest and a wind-carved cornice that drops into shadow on the right.
 */
function drift() {
    const s = new PixelSprite(38, 12, { dither: 0.3 });
    const ease = (t) => t * t * (3 - 2 * t);
    const height = (x) => {
        if (x < 26) return 9.6 * ease(Math.max(0, x / 26)) + 1.2 * Math.exp(-(((x - 9) / 4) ** 2));
        if (x < 29) return 9.6 + Math.sin(((x - 26) / 3) * Math.PI) * 0.6;
        return 9.6 * (1 - Math.min(1, (x - 29) / 8.5) ** 0.6);
    };
    const inside = (x, y) => y > 11.8 - height(x) && y < 12;
    // the scoop under the cornice lies in shadow; wind ripples streak the windward slope
    const biasAt = (x, y) => {
        if (x > 29 && y > 11.8 - height(x) + 1.5) return -0.18;
        return (x * 0.5 + y) % 5 < 0.8 && x > 4 && x < 24 ? -0.1 : 0;
    };
    fill(s, 0, 0, 19, 11, inside, W.snow, { g: 'drift', biasAt, bare: true });
    fill(s, 20, 0, 37, 11, inside, W.snow, { g: 'drift', biasAt });
    s.auto('drift', { R: 3, grad: 0.4 });
    // the crest and the cornice lip catching the light
    for (let x = 15; x <= 30; x++)
        for (let y = 0; y < 12; y++)
            if (inside(x + 0.5, y + 0.5)) {
                s.px(x, y, x < 28 ? '#FFFCF2' : '#E6EFF8', { bare: x < 20 });
                break;
            }
    return s.render();
}

/**
 * 16×36 flag: a steel pole planted in a snow mound, a swallowtail banner flapping in 4 frames, a red chart
 * printed on it going down, arrow and all.
 */
function flag(f) {
    const s = new PixelSprite(14, 34);
    const ph = (f / 4) * Math.PI * 2;
    s.box(2, 2, 2, 31, W.steel, { bevel: 1, bias: 0.22 });
    s.circle(3, 1.5, 1.3, W.steel, { bias: 0.25 });
    // the banner: each column of cloth shifted by the wave, the fly end cut into a swallowtail and frayed
    const wave = (x) => Math.sin(x * 0.8 - ph) * 1.3 * ((x - 4) / 9);
    const span = (x) => {
        const u = (x - 4) / 9;
        return [2.5 + u * 1.2 + wave(x), 11.5 - u * 0.6 + wave(x)];
    };
    for (let x = 4; x <= 13; x++) {
        const [top, bot] = span(x);
        const mid = (top + bot) / 2;
        const fold = Math.cos(x * 0.8 - ph);
        for (let y = Math.round(top); y <= Math.round(bot); y++) {
            if (x >= 11 && Math.abs(y + 0.5 - mid) < (x - 10) * 1.1) continue; // the swallowtail
            if (x >= 12 && hash(x, y, f) < 0.2) continue; // frayed
            s.box(x, y, 1, 1, W.canvas, {
                shade: 'flat',
                lum: 0.78 - fold * 0.16 - (y > mid + 2 ? 0.08 : 0)
            });
        }
    }
    // the chart: a red line stepping down to the right, with an arrowhead
    const pts = [1.2, 3.2, 2.4, 4.4, 3.6, 5.8];
    let prev = null;
    pts.forEach((v, k) => {
        const x = 5 + k;
        const y = Math.round(span(x)[0] + v);
        const from = prev === null ? y : prev;
        for (let yy = Math.min(from, y); yy <= Math.max(from, y); yy++) s.px(x, yy, '#D23A52');
        prev = y;
    });
    s.px(9, prev, '#D23A52').px(10, prev - 1, '#D23A52');
    // the mound it's planted in
    return mound(s, 3, 33, 3.4, 2.4).render();
}

export const PROPS = {
    winter_pine_a: { gen: pineA, foot: 2, shadow: 0.7, tall: true },
    winter_pine_b: { gen: pineB, foot: 2, shadow: 0.7, tall: true },
    winter_pine_small: { gen: pineSmall, foot: 2, shadow: 0.7, tall: true },
    winter_dead_tree: { gen: deadTree, foot: 2, shadow: 0.55, tall: true },
    winter_rock: { gen: rock, foot: 2, shadow: 0.85 },
    winter_rock_small: { gen: rockSmall, foot: 1, shadow: 0.85 },
    winter_crystal: {
        gen: crystal,
        frames: 2,
        fps: 2,
        foot: 2,
        shadow: 0.7,
        light: { rgb: '120,210,255', r: 90, a: 0.55, x: 0, y: -3, flicker: 'pulse' }
    },
    winter_rig: {
        gen: rig,
        frames: 2,
        fps: 2,
        foot: 1,
        shadow: 0.9,
        light: { rgb: '120,255,170', r: 50, a: 0.35, x: -10, y: 4, flicker: 'blink' }
    },
    winter_snowbear: { gen: snowbear, foot: 2, shadow: 0.75 },
    winter_lamp: {
        gen: lamp,
        foot: 2,
        shadow: 0.6,
        tall: true,
        light: { rgb: '190,225,255', r: 170, a: 0.75, x: 0, y: -16 }
    },
    winter_campfire: {
        gen: campfire,
        frames: 4,
        fps: 8,
        foot: 4,
        shadow: 0,
        light: { rgb: '255,160,70', r: 200, a: 0.95, x: 0, y: -2, flicker: 'fire' }
    },
    winter_igloo: { gen: igloo, foot: 2, shadow: 0.85 },
    winter_atm: {
        gen: atm,
        foot: 2,
        shadow: 0.85,
        tall: true,
        light: { rgb: '255,80,100', r: 60, a: 0.35, x: -1, y: 0, flicker: 'pulse' }
    },
    winter_sled: { gen: sled, foot: 2, shadow: 0.8 },
    winter_cabin_ruin: { gen: cabinRuin, foot: 2, shadow: 0.9 },
    winter_drift: { gen: drift, foot: 1, shadow: 0.6 },
    winter_flag: { gen: flag, frames: 4, fps: 6, foot: 2, shadow: 0.4, tall: true }
};

// ---- decals: flat marks baked into the snow -------------------------------------------------------------

// the snow ground's own ramp, and the ice of frozen puddles
const G = {
    d2: '#7F93AD',
    d1: '#91A6BF',
    l1: '#B8CADD',
    l2: '#CBDAEA',
    l3: '#DCE7F2',
    ice0: '#5E8FB0',
    ice1: '#78A9C8',
    ice2: '#A7D3EA'
};

/** Paint a tiny ASCII picture onto a decal, colours keyed by G. */
function paint(s, x, y, rows, map) {
    const colors = {};
    for (const [k, v] of Object.entries(map)) colors[k] = G[v] || v;
    return s.patch(x, y, rows, colors);
}

/**
 * A frozen puddle (w×h): an organic blob of steel-blue ice (a few overlapping lobes with a wavy shore), a
 * frosty white rim, lighter ice in the shallows, deeper ice in the middle of big ponds, pale crack lines
 * running across it and one or two reflection streaks.
 */
function pond(w, h, seed) {
    const s = new PixelSprite(w, h);
    const lobes = [[0.5, 0.5, 0.44, 0.4]];
    for (let k = 0; k < 3; k++)
        lobes.push([
            0.25 + hash(seed, k, 1) * 0.5,
            0.38 + hash(seed, k, 2) * 0.24,
            0.18 + hash(seed, k, 3) * 0.12,
            0.26 + hash(seed, k, 4) * 0.14
        ]);
    const inside = (x, y) =>
        lobes.some(([u, v, ru, rv]) => {
            const cx = u * w;
            const cy = v * h;
            const a = Math.atan2((y - cy) / h, (x - cx) / w);
            const wob = 1 + Math.sin(a * 3 + seed) * 0.08 + Math.sin(a * 5 + seed * 2) * 0.05;
            return ((x - cx) / (ru * w)) ** 2 + ((y - cy) / (rv * h)) ** 2 <= wob;
        });
    const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && inside(x + 0.5, y + 0.5);
    // distance to the shore, in steps
    const dist = (x, y) => {
        for (let r = 1; r < 9; r++)
            for (let dy = -r; dy <= r; dy++)
                for (let dx = -r; dx <= r; dx++)
                    if (Math.abs(dx) + Math.abs(dy) <= r && !on(x + dx, y + dy)) return r;
        return 9;
    };
    const deep = w > 50 ? 5 : w > 30 ? 4 : 99;
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            if (!on(x, y)) continue;
            const d = dist(x, y);
            let c = G.ice1;
            if (d === 1) c = y > h * 0.6 && x > w * 0.4 ? G.l1 : G.l2;
            else if (d === 2) c = G.ice2;
            else if (d >= deep) c = G.ice0;
            s.px(x, y, c);
        }
    // cracks: pale jagged lines wandering across the ice from a point
    const cracks = Math.max(1, Math.round(w / 16));
    for (let k = 0; k < cracks; k++) {
        let x = w * (0.3 + hash(seed, k, 5) * 0.4);
        let y = h * (0.4 + hash(seed, k, 6) * 0.2);
        const dx = k % 2 ? 1 : -1;
        for (let t = 0; t < w / 4; t++) {
            const ix = Math.round(x);
            const iy = Math.round(y);
            if (!on(ix, iy) || dist(ix, iy) < 3) break;
            s.px(ix, iy, G.ice2);
            x += dx;
            const r = hash(seed, k * 31 + t, 7);
            y += r < 0.25 ? -1 : r > 0.75 ? 1 : 0;
        }
    }
    // reflection streaks: short parallel diagonals toward the upper left
    const streaks = w > 30 ? 2 : 1;
    const len = Math.max(2, Math.round(w / 12));
    for (let k = 0; k < streaks; k++) {
        const x0 = Math.round(w * 0.32 + k * 3);
        const y0 = Math.round(h * 0.55);
        for (let t = 0; t < len - k; t++)
            if (on(x0 + t, y0 - t) && dist(x0 + t, y0 - t) > 2) s.px(x0 + t, y0 - t, G.l2);
    }
    return s.render({ outline: false });
}

/** A line of small animal prints (a fox trotting by): pairs of dents, shadowed top-left, lit bottom-right. */
function tracks() {
    const s = new PixelSprite(20, 6);
    for (let k = 0; k < 5; k++) {
        const x = 1 + k * 4;
        const y = k % 2 ? 3 : 1;
        paint(s, x, y, ['ab', '.c'], { a: 'd2', b: 'd1', c: 'l2' });
    }
    return s.render({ outline: false });
}

/** A few boot prints walking away: a sole and a heel pressed into the snow, shadowed top-left, lit below. */
function boots() {
    const s = new PixelSprite(16, 8);
    const print = ['.ab', 'abb', 'abb', '.c.', '.ab', '.bc'];
    for (const [x, y] of [
        [0, 2],
        [5, 0],
        [10, 2]
    ])
        paint(s, x, y, print, { a: 'd2', b: 'd1', c: 'l2' });
    return s.render({ outline: false });
}

/** Dead grass poking up through the snow: a few bent straw blades and their little hollow. */
function tuft() {
    const s = new PixelSprite(10, 6);
    paint(
        s,
        0,
        0,
        ['.a.....b..', '..a..a.b..', '..a.ab..b.', '...aab.b..', '..ccccccc.', '...cccc...'],
        {
            a: '#7A6E58',
            b: '#5C5444',
            c: 'd1'
        }
    );
    return s.render({ outline: false });
}

/** A few pebbles peeking out of the snow, each with a snow cap. */
function pebbles() {
    const s = new PixelSprite(8, 5);
    paint(s, 0, 0, ['.l...l..', 'aa..lab.', 'ab..aab.', '.....d..'], {
        a: '#4C566A',
        b: '#363F52',
        l: 'l2',
        d: 'd1'
    });
    return s.render({ outline: false });
}

/** A crack in a crust of ice: a dark branching line with a pale edge. */
function crack() {
    const s = new PixelSprite(16, 8);
    paint(
        s,
        0,
        0,
        [
            '..........a.....',
            '.........a......',
            'aa...aaaa.......',
            '..aaa....aa.....',
            '...l......aaa...',
            '...........l.aa.',
            '..............la',
            '................'
        ],
        {
            a: 'd2',
            l: 'l2'
        }
    );
    return s.render({ outline: false });
}

/** A soft bump in the snow: lit on its top-left, a faint shadow on the bottom-right. */
function bump() {
    const s = new PixelSprite(16, 6);
    paint(
        s,
        0,
        0,
        [
            '....llllll......',
            '..llmmmmmmlll...',
            '.lmmmmmmmmmmll..',
            '..lllllllllldd..',
            '....ddddddd.....'
        ],
        {
            l: 'l1',
            m: 'l2',
            d: 'd1'
        }
    );
    return s.render({ outline: false });
}

/** A fallen twig with one side shoot, half sunk in the snow. */
function twig() {
    const s = new PixelSprite(12, 5);
    paint(
        s,
        0,
        0,
        ['.......a....', '........a...', 'aab.....ab..', '..aabbaab.bb', '.....dd...dd'],
        {
            a: '#3A2A2C',
            b: '#523C38',
            d: 'd1'
        }
    );
    return s.render({ outline: false });
}

/** A frost flower: a six-armed crystal pattern grown on the snow crust, faint. */
function frost() {
    const s = new PixelSprite(10, 10);
    paint(
        s,
        0,
        0,
        [
            '.....a....',
            '..a..a..a.',
            '...a.a.a..',
            '....lal...',
            '.aaaalaaaa',
            '....lal...',
            '...a.a.a..',
            '..a..a..a.',
            '.....a....'
        ],
        {
            a: 'l1',
            l: 'l2'
        }
    );
    return s.render({ outline: false });
}

/** The corner of a graphics card sticking out of the snow: a shroud, half a fan, a bracket. Mined out. */
function buriedGpu() {
    const s = new PixelSprite(12, 7);
    paint(
        s,
        0,
        0,
        [
            '..bbbbbbb...',
            '.baaaccaab..',
            '.baacddcab..',
            '.bbacddcll..',
            'llbaccalll..',
            '.lllllll....'
        ],
        {
            a: '#303846',
            b: '#47525F',
            c: '#22252E',
            d: '#65737F',
            l: 'l2'
        }
    );
    return s.render({ outline: false });
}

export const DECALS = {
    winter_ice_s: { gen: () => pond(24, 12, 1), water: true, ice: true },
    winter_ice_m: { gen: () => pond(40, 18, 2), water: true, ice: true },
    winter_ice_l: { gen: () => pond(72, 30, 3), water: true, ice: true },
    winter_tracks: { gen: tracks },
    winter_boots: { gen: boots },
    winter_tuft: { gen: tuft },
    winter_pebbles: { gen: pebbles },
    winter_crack: { gen: crack },
    winter_bump: { gen: bump },
    winter_twig: { gen: twig },
    winter_frost: { gen: frost },
    winter_buried_gpu: { gen: buriedGpu }
};
