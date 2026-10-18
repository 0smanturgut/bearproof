// Scenery for the Chop Zone map, drawn with the pixel-art engine (art/pixel.js). See art/props.js for the
// format. The picture: a moonlit pine forest with a logging camp in it ("the chop" is literal: axes, stumps,
// log piles), and a few relics left behind by traders who came here to wait out a sideways market.
//
// Everything is lit from the top left at normal brightness; the game's night pass darkens it. Irregularity
// comes from a small seeded hash, never Math.random, so every sprite is the same on every machine.

import { PixelSprite, mat } from '../pixel.js';

// ---------------------------------------------------------------------------------------------------------
// Forest materials: six tones dark -> light, shadows cool, highlights warm (like art/materials.js).

const F = {
    pine: mat(['#08151A', '#0E2629', '#153B39', '#1F5448', '#326E55', '#538A60'], {
        line: '#050D10'
    }),
    oak: mat(['#0A1714', '#122C24', '#1C4434', '#2B5E42', '#447A4C', '#6E975A'], {
        line: '#060E0C'
    }),
    bark: mat(['#140C0B', '#271814', '#3D271E', '#563828', '#714C34', '#8E6847'], {
        line: '#0B0606'
    }),
    barkGrey: mat(['#12110F', '#24201C', '#372F28', '#4D4236', '#665846', '#82725A'], {
        line: '#0A0908'
    }),
    deadwood: mat(['#131318', '#24232A', '#38363C', '#514D4C', '#6E675F', '#918878'], {
        line: '#0A0A0D'
    }),
    endGrain: mat(['#2B1C12', '#4E3424', '#7A5638', '#A27A52', '#C49E6E', '#E2C290'], {
        line: '#160E09'
    }),
    plank: mat(['#1C130E', '#33231A', '#4D3626', '#684B34', '#846346', '#A07E5C'], {
        line: '#0F0907'
    }),
    moss: mat(['#0E1A12', '#18301E', '#244426', '#355C2E', '#4C7436', '#6A8E42'], {
        line: '#08100A'
    }),
    stone: mat(['#111418', '#1E2328', '#30373E', '#475058', '#626C75', '#86909A'], {
        line: '#0A0C0F'
    }),
    iron: mat(['#0D0F12', '#1B1F24', '#2C3239', '#424A54', '#5E6873', '#8A949E'], {
        line: '#07080A'
    }),
    canvas: mat(['#1A1810', '#322E1E', '#4C472E', '#686140', '#857D55', '#A39A6E'], {
        line: '#0E0D08'
    }),
    rope: mat(['#2A2014', '#4A3A24', '#6E5836', '#927A4E', '#B39B68', '#D2BC88'], {
        line: '#150F08'
    }),
    bush: mat(['#0A1815', '#112A23', '#1A3F31', '#27573D', '#3B7046', '#5B8C50'], {
        line: '#060E0C'
    }),
    fern: mat(['#0C1E14', '#15321C', '#1F4826', '#2E6030', '#45793C', '#64944A'], {
        line: '#07110B'
    }),
    paintGreen: mat(['#0B1F17', '#14382A', '#1E523A', '#2C6C4A', '#3F865B', '#5EA070'], {
        line: '#06120D'
    }),
    paintRed: mat(['#1E0A08', '#3C1610', '#5C2418', '#7C3422', '#984A32', '#B4684C'], {
        line: '#120605'
    }),
    ochre: mat(['#2A1A08', '#4E3210', '#7A5018', '#A87224', '#C99540', '#E2B866'], {
        line: '#150C04'
    }),
    stem: mat(['#2A3533', '#475752', '#6E8079', '#97AAA0', '#C2D2C6', '#E6F2E8'], {
        line: '#141A19'
    }),
    // emissive
    fire: mat(['#5A1806', '#A8360A', '#E8661A', '#FFA23E', '#FFD27A', '#FFF4CC'], {
        line: '#2A0A02'
    }),
    shroom: mat(['#0B3236', '#11585A', '#1C8A84', '#38BFA8', '#7AE8CC', '#CCFFF0'], {
        line: '#05191B'
    }),
    glass: mat(['#1E3A2A', '#3A6A48', '#6AA878', '#A8E0AE', '#D8FFD0', '#F4FFE8'], {
        line: '#0C1A12'
    })
};

// Hand-placed detail colours
const K = {
    glint: '#E3E8EE',
    berry: '#5E4A86',
    berryLit: '#9A88C4',
    cream: '#D9D0AA',
    mint: '#7CEBCF',
    mintHot: '#C8FFF0',
    flame: '#FFF4CC',
    ember: '#FFA23E'
};

/** Deterministic hash -> [0, 1). */
function hash(a, b = 0, c = 0) {
    let h =
        Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------------------------------------------
// Shared motifs

/** Fill pixels `[x, y, lum]` with material `m`, unlit by the engine (one spans call per brightness). */
function fill(s, pts, m, o = {}) {
    const buckets = new Map();
    for (const [x, y, l] of pts) {
        const k = Math.round(Math.max(0, Math.min(1, l)) * 40) / 40;
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push([y, x, x]);
    }
    for (const [lum, rows] of buckets) s.spans(rows, m, { ...o, lum });
}

/**
 * One drooping tier of a conifer: a skirt of needles, pointed at the top and widest at the bottom, its outer
 * tips hanging down and its lower edge scalloped into needle clumps. Seen from above, the skirt shows the
 * upper face of the branches: lit on the left of the cone, in shade on the right. Each branch clump is
 * bright on its left with a dark crease on its right; the creases slant up toward the trunk the way the
 * branches droop, and the curled-under tips are dark along the bottom edge.
 */
function pineTier(s, m, { cx, top, bot, hw, g, seed = 0 }) {
    // each side gets its own reach, so no tree is a perfect triangle
    const hwL = hw + (hash(seed, 91) - 0.5) * 2.4;
    const hwR = hw + (hash(seed, 92) - 0.5) * 2.4;
    // clumps along the lower edge: [x0, x1], 3-5 px wide
    const clumps = [];
    for (let x = Math.floor(cx - hwL), k = 0; x <= Math.ceil(cx + hwR); k++) {
        const cw = 3 + Math.floor(hash(seed, k) * 3);
        clumps.push([x, x + cw - 1]);
        x += cw;
    }
    const clumpAt = (x) => clumps.find(([a, b]) => x >= a && x <= b) || clumps[0];
    const pts = [];
    for (let x = Math.floor(cx - hwL); x <= Math.ceil(cx + hwR); x++) {
        const side = (x + 0.5 - cx) / (x + 0.5 < cx ? hwL : hwR);
        const t = Math.abs(side);
        if (t > 1) continue;
        const [c0, c1] = clumpAt(x);
        const bump =
            1.6 *
            Math.sqrt(Math.max(0, 1 - ((x + 0.5 - (c0 + c1 + 1) / 2) / ((c1 - c0 + 1) / 2)) ** 2));
        const y0 = Math.round(top + (bot - top - 3) * Math.pow(t, 0.8));
        const y1 = Math.round(bot - 2 + 2.6 * t * t + bump);
        // tones 0..5 of the ramp: three clean bands across the cone, light on the left
        const base = side < -0.3 ? 4 : side < 0.3 ? 3 : 2;
        for (let y = y0; y <= y1; y++) {
            const d = y1 - y;
            // the clump pattern, slanted: higher up a branch lies closer to the trunk
            const xp = x + Math.sign(side) * (d >> 1);
            const [p0, p1] = clumpAt(xp);
            const u = (xp + 0.5 - (p0 + p1 + 1) / 2) / ((p1 - p0 + 1) / 2);
            let tone = base;
            if (d === 0) tone -= 2;
            else if (d <= 2 && u < -0.2) tone += 1;
            else if (d <= 3 && u > 0.45) tone -= 1;
            else if (d >= 7) tone -= 1;
            if (y === y0 && side < -0.15) tone = 5; // moonlit rim on the top-left edge
            pts.push([x, y, Math.max(0, Math.min(5, tone)) / 5]);
        }
    }
    fill(s, pts, m, { g });
}

/** A short conifer trunk with a little root flare, dark under the needles. */
function pineTrunk(s, cx, y0, y1, w = 4) {
    const pts = [];
    for (let y = y0; y < y1; y++) {
        const flare = y >= y1 - 2 ? y - (y1 - 3) : 0;
        for (let x = Math.round(cx - w / 2 - flare); x < Math.round(cx + w / 2 + flare); x++) {
            const side = (x + 0.5 - cx) / (w / 2 + flare);
            let l = 0.55 - 0.35 * side - (y < y0 + 3 ? 0.3 : 0);
            if ((x + y * 3) % 5 === 0) l -= 0.12; // bark furrows
            pts.push([x, y, l]);
        }
    }
    fill(s, pts, F.bark, { g: 'trunk' });
}

/** A conifer from a list of tiers [top, bot, hw, dx] (top tier last), on a trunk. */
function conifer(w, h, tiers, { trunk = 4, seed = 0 } = {}) {
    const s = new PixelSprite(w, h);
    const cx = w / 2;
    const lowest = Math.max(...tiers.map((t) => t[1]));
    pineTrunk(s, cx, lowest - 3, h - 1, trunk);
    tiers.forEach(([top, bot, hw, dx], i) =>
        pineTier(s, F.pine, {
            cx: cx + dx,
            top,
            bot,
            hw,
            g: `tier${i}`,
            seed: seed + i * 7
        })
    );
    return s;
}

// ---------------------------------------------------------------------------------------------------------
// Trees

/** 36×64 pine: five drooping tiers of blue-green needles stacked on a short trunk. */
function pineA() {
    const s = conifer(
        34,
        62,
        [
            [30, 55, 16.5, 0],
            [21, 46, 14.5, -0.5],
            [13, 36, 12, 0.5],
            [6, 26, 9.5, 0],
            [0, 16, 6.5, 0.5]
        ],
        { seed: 1 }
    );
    return s.render({ ao: 0.3 });
}

/** 30×56 pine: a narrower, lopsided spruce whose tiers lean to one side. */
function pineB() {
    const s = conifer(
        28,
        54,
        [
            [30, 48, 13.5, 0.5],
            [23, 40, 12, -1],
            [16, 32, 10, 0.5],
            [10, 25, 8, -0.5],
            [4, 18, 6, 0.5],
            [0, 10, 3.5, 0]
        ],
        { seed: 5 }
    );
    return s.render({ ao: 0.3 });
}

/** 22×38 young pine: three tiers on a thin stem. */
function pineSmall() {
    const s = conifer(
        20,
        36,
        [
            [14, 31, 9.5, 0],
            [7, 23, 7.5, 0],
            [0, 14, 5, 0]
        ],
        { trunk: 3, seed: 2 }
    );
    return s.render({ ao: 0.3 });
}

/**
 * A leafy crown: many small sphere-lit clumps of leaves on the surface of one big ellipsoid. Each clump gets
 * the big form's light (bright top-left, dark underside) as a bias, so the crown reads as one volume and every
 * clump still has its own highlight and contact shadow. The clumps are drawn back to front.
 */
function leafCrown(
    s,
    m,
    { cx, cy, rx, ry, step = 5, r = 3.6, seed = 0, lift = 0, hollow = null, extra = [] }
) {
    const L = [-0.55, -0.72, 0.5];
    const ll = Math.hypot(...L);
    const clumps = [];
    for (let j = 0, gy = cy - ry; gy <= cy + ry; j++, gy += step * 0.75)
        for (let k = 0, gx = cx - rx; gx <= cx + rx; k++, gx += step) {
            // a staggered grid, jittered a little
            const x = gx + (j % 2 ? step / 2 : 0) + (hash(seed, j, k) - 0.5) * 2;
            const y = gy + (hash(seed + 1, j, k) - 0.5) * 2;
            const u = (x - cx) / rx;
            const v = (y - cy) / ry;
            if (u * u + v * v > 0.92) continue;
            if (hollow && hollow(u, v)) continue;
            clumps.push([x, y, u, v, r * (0.85 + hash(seed + 2, j, k) * 0.35)]);
        }
    for (const [x, y, rr] of extra) clumps.push([x, y, (x - cx) / rx, (y - cy) / ry, rr]);
    clumps.sort((a, b) => a[1] - b[1]);
    for (const [x, y, u, v, rr] of clumps) {
        // the big form's normal at the clump (clumps outside the ellipse face straight out)
        const n = Math.max(1, Math.hypot(u, v));
        const nz = Math.sqrt(Math.max(0, 1 - (u * u + v * v) / (n * n)));
        const d = ((u / n) * L[0] + (v / n) * L[1] + nz * L[2]) / ll;
        s.circle(x, y, rr, m, { bias: -0.2 + 0.42 * d + lift, dif: 0.55, amb: 0.2 });
    }
}

/** A polyline branch of capsules tapering from r0 to r1. */
function limb(s, pts, r0, r1, m, o) {
    const n = pts.length - 1;
    for (let i = 0; i < n; i++) {
        const a = r0 + ((r1 - r0) * i) / n;
        const b = r0 + ((r1 - r0) * (i + 1)) / n;
        s.capsule(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], a, b, m, o);
    }
}

/**
 * 50×58 oak: a round, lumpy crown of leaf clumps (dark underneath, catching the moon on its top-left) over a
 * thick trunk that flares into roots along the ground.
 */
function oak() {
    const s = new PixelSprite(48, 56);
    // trunk and roots, lit as one piece of bark
    s.poly(
        [
            [19.5, 28],
            [28.5, 28],
            [29, 46],
            [31.5, 52],
            [16.5, 52],
            [19, 46]
        ],
        F.barkGrey,
        { g: 'trunk' }
    );
    limb(
        s,
        [
            [19, 49],
            [14, 52],
            [11, 53.5]
        ],
        2.4,
        0.9,
        F.barkGrey,
        { g: 'trunk' }
    );
    limb(
        s,
        [
            [29, 49],
            [34, 51.5],
            [37, 53]
        ],
        2.4,
        0.9,
        F.barkGrey,
        { g: 'trunk' }
    );
    limb(
        s,
        [
            [23, 51],
            [22, 54.5]
        ],
        2,
        1,
        F.barkGrey,
        { g: 'trunk' }
    );
    limb(
        s,
        [
            [26.5, 51],
            [28, 54.5]
        ],
        1.8,
        1,
        F.barkGrey,
        { g: 'trunk' }
    );
    s.auto('trunk', { R: 2.6, grad: 0.4 });
    // the crown's shadow on the top of the trunk, and bark furrows
    s.box(15, 28, 18, 9, F.barkGrey, { g: 'trunk', bias: -0.3, clip: true });
    for (const [x0, y0, x1, y1] of [
        [21, 37, 20.5, 48],
        [24.5, 39, 25, 51],
        [27.5, 38, 28, 47]
    ])
        s.line(x0, y0, x1, y1, F.barkGrey, { lum: 0.1 });
    // a dark hollow inside the crown, then the clumps, with a few lobes breaking the outline
    s.ellipse(24, 22, 20, 15, F.oak, { shade: 'flat', lum: 0.05 });
    leafCrown(s, F.oak, {
        cx: 24,
        cy: 20,
        rx: 19,
        ry: 15,
        step: 5.6,
        r: 4.4,
        seed: 3,
        hollow: (u, v) => v > 0.6 && Math.abs(u) < 0.3,
        extra: [
            [16, 4.5, 4.4],
            [29, 4, 4.6],
            [22.5, 4, 3.6],
            [4.6, 16, 4],
            [43.2, 20, 4],
            [6, 26, 4.2],
            [41.5, 28, 4],
            [11, 34, 4.2],
            [37, 34.5, 4]
        ]
    });
    return s.render({ ao: 0.3 });
}

/**
 * 34×50 dead tree: a bare, twisted trunk of bleached grey wood with crooked branches clawing at the sky, one
 * of them snapped off, and a knot hole halfway up.
 */
function deadTree() {
    const s = new PixelSprite(32, 48);
    const W = F.deadwood;
    const g = { g: 'wood', bias: 0.06 };
    // roots, then the trunk, leaning a little
    limb(
        s,
        [
            [15, 44.5],
            [10, 46.5],
            [6, 47.5]
        ],
        1.8,
        0.5,
        W,
        g
    );
    limb(
        s,
        [
            [17, 44.5],
            [22, 46.5],
            [26, 47.5]
        ],
        1.8,
        0.5,
        W,
        g
    );
    limb(
        s,
        [
            [15.5, 47],
            [15, 40],
            [17, 33],
            [15.5, 25],
            [17, 18],
            [15.5, 10],
            [17, 2]
        ],
        3.4,
        0.5,
        W,
        g
    );
    // the big claw on the left, with a fork
    limb(
        s,
        [
            [15.5, 28],
            [10, 25],
            [7, 19],
            [5, 13],
            [5.5, 7]
        ],
        1.5,
        0.45,
        W,
        g
    );
    limb(
        s,
        [
            [7, 19],
            [3, 18],
            [1, 14.5]
        ],
        0.8,
        0.45,
        W,
        g
    );
    // the right branch, forking at the end
    limb(
        s,
        [
            [16.5, 20],
            [21, 16.5],
            [24, 11],
            [27.5, 7.5],
            [29, 2]
        ],
        1.3,
        0.45,
        W,
        g
    );
    limb(
        s,
        [
            [24, 11],
            [27.5, 12.5],
            [30.5, 11]
        ],
        0.7,
        0.45,
        W,
        g
    );
    // the snapped one, its splintered end pale
    limb(
        s,
        [
            [16.5, 34.5],
            [21, 32],
            [24, 31.5]
        ],
        1.5,
        1.2,
        W,
        g
    );
    s.auto('wood', { R: 1.3, grad: 0.15 });
    s.pxs(
        [
            [25, 30],
            [25, 31],
            [24, 32]
        ],
        W.ramp[5]
    );
    // the knot hole and the cracks in the bark
    s.ellipse(15.5, 37, 1.2, 1.8, W, { shade: 'flat', lum: 0 });
    s.px(14, 36, W.ramp[4]);
    for (const [x0, y0, x1, y1] of [
        [16.5, 42, 17, 39],
        [16, 31, 15, 27],
        [17, 22, 16, 17]
    ])
        s.line(x0, y0, x1, y1, W, { lum: 0.18 });
    return s.render({ ao: 0.2 });
}

// ---------------------------------------------------------------------------------------------------------
// The logging camp: stumps, logs, tools

/**
 * The cut face of a log or stump: a pale disc of end grain with growth rings around a dark heart, a radial
 * check (crack) and a rim of bark, brighter toward the top left. `g` keeps it one piece.
 */
function endGrain(s, cx, cy, rx, ry, { seed = 0, g, lift = 0, rim = 0.78 } = {}) {
    const wood = [];
    const bark = [];
    const a = hash(seed, 7) * Math.PI * 2;
    const [ca, sa] = [Math.cos(a), Math.sin(a)];
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
            const u = (x + 0.5 - cx) / rx;
            const v = (y + 0.5 - cy) / ry;
            const d = Math.hypot(u, v);
            if (d > 1) continue;
            const lit = -(u * 0.6 + v * 0.8) * 0.16 + lift;
            if (d > rim) {
                bark.push([x, y, 0.5 + lit * 2.5]);
                continue;
            }
            const ring = d / rim;
            let l = 0.74 + lit;
            if (Math.abs(ring - 0.64) < 0.1 || Math.abs(ring - 0.32) < 0.08) l -= 0.24;
            if (ring < 0.14) l -= 0.34;
            // the check runs from the heart out toward the bark
            const along = u * rx * ca + v * ry * sa;
            const off = Math.abs(-u * rx * sa + v * ry * ca);
            if (ring > 0.25 && along > 0 && off < 0.55) l -= 0.32;
            wood.push([x, y, l]);
        }
    fill(s, bark, F.bark, { g });
    fill(s, wood, F.endGrain, { g });
}

/**
 * A cut stump: a short cylinder of bark (lit on the left, furrowed, rounded at the bottom), roots gripping
 * the ground, and its pale end-grain top.
 */
function stump(s, cx, top, rx, ry, hgt, { seed = 0, g = 'stump' } = {}) {
    // roots first, so the trunk sits on them
    limb(
        s,
        [
            [cx - rx + 1.5, top + hgt],
            [cx - rx - 1.2, top + hgt + ry * 0.55],
            [cx - rx - 2.6, top + hgt + ry * 0.75]
        ],
        1.7,
        0.7,
        F.bark,
        { g: `${g}r`, bias: 0.06 }
    );
    limb(
        s,
        [
            [cx + rx - 1.5, top + hgt],
            [cx + rx + 1, top + hgt + ry * 0.5],
            [cx + rx + 2.2, top + hgt + ry * 0.62]
        ],
        1.6,
        0.7,
        F.bark,
        { g: `${g}r`, bias: -0.1 }
    );
    limb(
        s,
        [
            [cx - 1.5, top + hgt + ry * 0.6],
            [cx - 2.2, top + hgt + ry + 0.6]
        ],
        1.4,
        0.8,
        F.bark,
        { g: `${g}r` }
    );
    s.auto(`${g}r`, { R: 1, grad: 0.3 });
    const pts = [];
    for (let x = Math.floor(cx - rx); x < Math.ceil(cx + rx); x++) {
        const u = (x + 0.5 - cx) / rx;
        if (Math.abs(u) > 1) continue;
        const arc = ry * Math.sqrt(1 - u * u);
        const furrow = hash(seed, x) < 0.3;
        const y1 = Math.round(top + hgt + arc - 0.3);
        for (let y = Math.round(top + arc * 0.6); y <= y1; y++) {
            let tone = u < -0.55 ? 4 : u < -0.05 ? 3 : u < 0.5 ? 2 : 1;
            if (furrow && y > top + arc + 0.5) tone -= 1;
            if (y === y1) tone -= 1;
            pts.push([x, y, Math.max(0, tone) / 5]);
        }
    }
    fill(s, pts, F.bark, { g });
    endGrain(s, cx, top, rx, ry, { seed, g: `${g}top` });
}

/** A woodcutter's axe sunk into wood at (x, y): the head buried to the cheek, the haft rising up-right. */
function axe(s, x, y, len) {
    // the cut the blade went into
    s.line(x - 4.5, y + 0.5, x + 3, y + 0.5, F.endGrain, { lum: 0.08, g: 'cut' });
    limb(
        s,
        [
            [x + 1.5, y - 1],
            [x + 1.5 + len * 0.72, y - 1 - len * 0.7]
        ],
        0.95,
        0.85,
        F.endGrain,
        { g: 'haft', bias: -0.1 }
    );
    s.auto('haft', { R: 0.9, grad: 0.25 });
    s.px(x + 1.5 + len * 0.72, y - 1.5 - len * 0.7, F.endGrain.ramp[5]);
    // the head: a narrow poll at the haft, the cheek flaring down into the wood
    s.poly(
        [
            [x + 2.6, y - 2.4],
            [x - 0.5, y - 2],
            [x - 2.6, y - 1.2],
            [x - 3, y + 0.6],
            [x + 2.6, y + 0.6]
        ],
        F.iron,
        { g: 'head' }
    );
    s.auto('head', { R: 1, grad: 0.35 });
    s.line(x - 2, y - 1.2, x + 2, y - 1.9, F.iron, { lum: 0.95, g: 'edge' });
    s.px(x - 2, y - 1, K.glint);
    s.px(x + 2, y - 1, F.iron.ramp[0]); // the eye, where the haft goes through
}

/** 24×18 stump with a woodcutter's axe buried in its top. */
function stumpAxe() {
    const s = new PixelSprite(22, 16);
    stump(s, 10.5, 6.8, 7.8, 3.4, 4.2, { seed: 3 });
    axe(s, 13.5, 6.4, 7);
    return s.render({ ao: 0.25 });
}

/** 18×13 small stump, its rings showing, a bit of moss on the shady side. */
function smallStump() {
    const s = new PixelSprite(16, 11);
    stump(s, 8, 3.2, 5.4, 2.3, 3.4, { seed: 8 });
    s.ellipse(12.4, 7, 1.6, 2, F.moss, { g: 'moss', clip: true });
    s.ellipse(11, 8.6, 1.8, 1, F.moss, { g: 'moss', clip: true });
    s.auto('moss', { R: 1, grad: 0.3 });
    return s.render({ ao: 0.25 });
}

/** 38×24 log pile: split firewood stacked four, three, two, the cut ends facing out, bark showing on top. */
function logPile() {
    const s = new PixelSprite(36, 22);
    const rx = 4.2;
    const ry = 3.5;
    const rows = [
        [5.6, [13.2, 21.8]],
        [11.7, [8.9, 17.5, 26.1]],
        [17.8, [4.6, 13.2, 21.8, 30.4]]
    ];
    // the logs' bodies, receding behind the pile
    for (const [y, xs] of rows)
        for (const x of xs) s.capsule(x, y, x + 0.8, y - 2.2, ry, ry, F.bark, { g: 'backs' });
    s.auto('backs', { R: 2, grad: 0.3 });
    s.tone(-0.05);
    // the cut ends, top row first so the lower logs sit in front
    rows.forEach(([y, xs], r) =>
        xs.forEach((x, i) =>
            endGrain(s, x + (hash(r, i) - 0.5) * 0.6, y, rx, ry, {
                seed: r * 5 + i,
                g: `end${r}${i}`,
                lift: -0.03 * (2 - r)
            })
        )
    );
    return s.render({ ao: 0.3 });
}

/**
 * 46×15 fallen log: an old trunk lying on its side, moss growing over its back, a cut end on the left, a
 * splintered break on the right, a branch stub and two little shelf fungi.
 */
function fallenLog() {
    const s = new PixelSprite(44, 13);
    s.capsule(5, 7, 39.5, 7.6, 4.6, 4.1, F.bark, { g: 'log' });
    limb(
        s,
        [
            [29, 5],
            [31.5, 1.2]
        ],
        1.3,
        0.8,
        F.bark,
        { g: 'log' }
    );
    s.auto('log', { R: 2.4, grad: 0.3 });
    // the splintered break: bite out a jagged notch, pale splinters at the tips
    for (const [x, y0, y1] of [
        [44, 3, 12],
        [43, 3, 6],
        [43, 9, 12],
        [42, 4, 5],
        [42, 10, 11]
    ])
        s.cutBox(x, y0, 1, y1 - y0 + 1);
    s.pxs(
        [
            [42, 6],
            [43, 7],
            [41, 9],
            [42, 8]
        ],
        F.endGrain.ramp[4]
    );
    s.pxs(
        [
            [41, 7],
            [41, 8]
        ],
        F.endGrain.ramp[2]
    );
    // bark furrows along the trunk
    for (const [x0, x1, y] of [
        [10, 17, 9],
        [21, 30, 9.5],
        [14, 22, 6.5],
        [27, 36, 7],
        [33, 39, 9.5]
    ])
        s.line(x0, y, x1, y + 0.4, F.bark, { lum: 0.15, g: 'furrow' });
    // moss over the back
    for (const [x, y, rx, ry] of [
        [13, 3.4, 7, 2.2],
        [22, 3.2, 4.5, 1.9],
        [34, 3.8, 3.4, 1.6]
    ])
        s.ellipse(x, y, rx, ry, F.moss, { g: 'moss', clip: true });
    s.auto('moss', { R: 1.2, grad: 0.35 });
    s.pxs(
        [
            [8, 5],
            [16, 5],
            [19, 5],
            [21, 5],
            [34, 5]
        ],
        F.moss.ramp[2]
    );
    s.pxs(
        [
            [9, 3],
            [12, 2],
            [23, 2]
        ],
        F.moss.ramp[5]
    );
    // shelf fungi on the side
    s.ellipse(18.5, 9.4, 1.7, 0.8, F.endGrain, { bias: -0.08 });
    s.ellipse(21.2, 10.4, 1.2, 0.7, F.endGrain, { bias: -0.12 });
    // the cut end
    endGrain(s, 4.4, 7, 2.4, 4.4, { seed: 4, g: 'end', rim: 0.7 });
    return s.render({ ao: 0.25 });
}

// ---------------------------------------------------------------------------------------------------------
// Rocks and plants

/** 30×22 boulder: a big lumpy rock with a cap of moss and a crack down its face. */
function boulder() {
    const s = new PixelSprite(28, 20, { dither: 0.3 });
    const g = { g: 'rock' };
    s.ellipse(14, 13, 13, 6.6, F.stone, g);
    s.ellipse(11, 9, 8.5, 6.8, F.stone, g);
    s.ellipse(19.5, 10.5, 7, 6.6, F.stone, g);
    s.ellipse(5.5, 14.5, 5.3, 4.6, F.stone, g);
    s.auto('rock', { R: 3.6, grad: 0.45 });
    // a crack, and a facet edge catching the light
    s.line(16, 7, 14.5, 11, F.stone, { lum: 0.05, g: 'crack' });
    s.line(14.5, 11, 15.5, 14.5, F.stone, { lum: 0.05, g: 'crack' });
    s.pxs(
        [
            [15, 7],
            [14, 10]
        ],
        F.stone.ramp[5]
    );
    // the moss cap, with a few strands hanging over the edge
    s.ellipse(10.5, 4.6, 7.6, 3, F.moss, { g: 'moss', clip: true });
    s.ellipse(18.5, 5.6, 4.6, 2.2, F.moss, { g: 'moss', clip: true });
    s.ellipse(4, 11.5, 2.2, 1.6, F.moss, { g: 'moss', clip: true });
    s.auto('moss', { R: 1.6, grad: 0.35 });
    s.pxs(
        [
            [5, 7],
            [8, 7],
            [9, 8],
            [13, 7],
            [17, 8],
            [21, 7]
        ],
        F.moss.ramp[2]
    );
    s.pxs(
        [
            [7, 3],
            [8, 2],
            [12, 2]
        ],
        F.moss.ramp[5]
    );
    return s.render({ ao: 0.25 });
}

/** 14×10 small rock with a fleck of moss. */
function rock() {
    const s = new PixelSprite(12, 8);
    s.ellipse(6.5, 5, 5.4, 3, F.stone, { g: 'rock' });
    s.ellipse(5, 3.6, 3.4, 2.6, F.stone, { g: 'rock' });
    s.auto('rock', { R: 2, grad: 0.45 });
    s.ellipse(4.6, 1.8, 2, 1, F.moss, { g: 'moss', clip: true });
    s.auto('moss', { R: 0.8, grad: 0.3 });
    s.px(3, 3, F.stone.ramp[5]);
    return s.render({ ao: 0.25 });
}

/** 26×18 bush: a round mound of leaf clumps with a few dusky berries. */
function bushA() {
    const s = new PixelSprite(24, 16);
    s.ellipse(12, 10, 9, 4.5, F.bush, { shade: 'flat', lum: 0.05 });
    leafCrown(s, F.bush, {
        cx: 12,
        cy: 8.4,
        rx: 8.2,
        ry: 4.6,
        step: 4.2,
        r: 3,
        seed: 11,
        extra: [
            [8, 3.4, 3],
            [15.5, 3.8, 2.8],
            [3, 10, 2.6],
            [21, 10.5, 2.4]
        ]
    });
    for (const [x, y] of [
        [6, 6],
        [14, 4],
        [17, 9],
        [9, 10],
        [19, 5]
    ]) {
        s.px(x, y, K.berry)
            .px(x + 1, y, K.berry)
            .px(x, y + 1, K.berry);
        s.px(x, y, K.berryLit);
    }
    return s.render({ ao: 0.3 });
}

/** 22×14 low, wide bush. */
function bushB() {
    const s = new PixelSprite(20, 12);
    s.ellipse(10, 8, 7.5, 3, F.bush, { shade: 'flat', lum: 0.05 });
    leafCrown(s, F.bush, {
        cx: 10,
        cy: 6.6,
        rx: 6.6,
        ry: 3,
        step: 3.8,
        r: 2.7,
        seed: 23,
        lift: -0.04,
        extra: [
            [6.5, 2.8, 2.6],
            [2.6, 8.2, 2.3],
            [17.3, 8.4, 2.2]
        ]
    });
    return s.render({ ao: 0.3 });
}

/**
 * A fern frond, drawn the herringbone way: a 1 px stem arching from the crown to the drooping tip, with
 * leaflets ticking off both sides toward the tip, longest near the crown. The lit side is a tone brighter.
 */
function frond(s, [x0, y0], [cx, cy], [x1, y1], lum, g) {
    const pts = new Map();
    const put = (x, y, l) =>
        pts.set(`${Math.floor(x)},${Math.floor(y)}`, [Math.floor(x), Math.floor(y), l]);
    const N = 24;
    let acc = 0;
    let px = x0;
    let py = y0;
    for (let i = 0; i <= N; i++) {
        const t = i / N;
        const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1;
        const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1;
        const tx = 2 * (1 - t) * (cx - x0) + 2 * t * (x1 - cx);
        const ty = 2 * (1 - t) * (cy - y0) + 2 * t * (y1 - cy);
        const tl = Math.hypot(tx, ty) || 1;
        const [ux, uy] = [tx / tl, ty / tl];
        put(x, y, lum + 0.06);
        acc += Math.hypot(x - px, y - py);
        px = x;
        py = y;
        if (t < 0.18 || acc < 1.9) continue;
        acc = 0;
        const len = t < 0.4 ? 2 : 1;
        for (let k = 1; k <= len; k++)
            for (const sd of [1, -1]) {
                const lx = x - uy * sd * k + ux * k * 0.7;
                const ly = y + ux * sd * k + uy * k * 0.7;
                const lit = -uy * sd * -0.55 + ux * sd * -0.72 > 0;
                put(lx, ly, lum + (lit ? 0.12 : -0.08));
            }
    }
    fill(s, [...pts.values()], F.fern, { g });
}

/** 20×15 fern: seven arching fronds whose tips droop, the back ones in shade, the left ones catching the light. */
function fern() {
    const s = new PixelSprite(18, 13);
    const base = [9, 10.5];
    const fronds = [
        [[5.5, 0.5], [2, 3.5], 0.42],
        [[12.5, 0.5], [16, 3.5], 0.3],
        [[9, 1], [10, 0.4], 0.48],
        [[2.5, 6], [0.4, 12], 0.72],
        [[15.5, 6], [17.6, 12], 0.4],
        [[6.5, 10], [4, 12.6], 0.6],
        [[11.5, 10], [14, 12.6], 0.46]
    ];
    fronds.forEach(([c, tip, l], i) => frond(s, base, c, tip, l, `fr${i}`));
    return s.render({ ao: 0.25 });
}

/** A mushroom: a thin pale stem under a domed, glowing cap with a dark gill line. */
function mushroom(s, x, capY, rx, ry, bottom, { glow, lift = 0, spots = [] }) {
    const gy = Math.floor(capY + 0.5);
    s.ellipse(x, capY, rx, ry, F.shroom, { glow, bias: lift, g: `cap${x}` });
    s.cutBox(x - rx - 1, gy, rx * 2 + 2, ry + 1);
    const sw = rx > 2.5 ? 1 : 0.7;
    s.capsule(x, gy + 1, x + 0.2, bottom, sw * 0.8, sw, F.stem, { g: `stem${x}`, bias: -0.05 });
    s.auto(`stem${x}`, { R: 0.8, grad: 0.3 });
    s.line(x - rx + 1, gy + 0.5, x + rx - 1, gy + 0.5, F.shroom, { lum: 0.12, g: `cap${x}` });
    for (const [dx, dy] of spots) s.px(x + dx, capY + dy, K.mintHot, { glow: K.mintHot });
}

/** 14×12 glowing mushrooms: three on a tuft of moss, caps lit mint from inside. Two frames: a slow pulse. */
function mushrooms(f) {
    const s = new PixelSprite(12, 10);
    const hot = f % 2 === 1;
    const glow = hot ? '#7CEBCF' : '#3CC4AE';
    const lift = hot ? 0.1 : 0;
    mushroom(s, 6, 2.6, 3.2, 2.3, 9.2, {
        glow,
        lift,
        spots: [
            [-1.5, -1],
            [1, -1.6]
        ]
    });
    mushroom(s, 2.6, 5.6, 2.1, 1.6, 9.4, { glow, lift, spots: [[-0.6, -0.8]] });
    mushroom(s, 9.4, 6.4, 1.7, 1.3, 9.4, { glow, lift });
    s.pxs(
        [
            [0, 9],
            [1, 8],
            [11, 9],
            [5, 9]
        ],
        F.moss.ramp[3]
    );
    if (hot) s.px(3, 1, K.mint, { glow: K.mint });
    else s.px(10, 3, K.mint, { glow: K.mint });
    return s.render({ ao: 0.2 });
}

// ---------------------------------------------------------------------------------------------------------
// Camp furniture

/**
 * 16×42 lantern post: a wooden post with a crossarm and a braced hanging iron lantern. The flame inside is a
 * little green candle (the XP candle); its light flickers between two frames.
 */
function lantern(f) {
    const s = new PixelSprite(14, 40);
    const hot = f % 2 === 0;
    // post, crossarm and brace
    s.box(2, 2, 3.5, 37.5, F.plank, { g: 'post', bevel: 1.2 });
    s.box(1.5, 1, 4.5, 2, F.plank, { g: 'post', bias: 0.1 });
    s.auto('post', { R: 1.2, grad: 0.3 });
    s.box(4, 4, 8.5, 2.2, F.plank, { bevel: 0.9 });
    s.line(5, 11, 9, 6, F.plank, { lum: 0.4, w: 1.2 });
    for (let y = 9; y < 37; y += 7) s.px(3, y, F.plank.ramp[1]);
    // chain
    s.pxs(
        [
            [10, 6],
            [10, 8]
        ],
        F.iron.ramp[3]
    ).px(10, 7, F.iron.ramp[1]);
    // the lantern: cap, glass, frame, base
    s.poly(
        [
            [10.5, 8.5],
            [13, 11],
            [8, 11]
        ],
        F.iron,
        { top: 0.75, bot: 0.4 }
    );
    s.box(8, 11, 5, 6, F.glass, {
        shade: 'flat',
        lum: hot ? 0.85 : 0.72,
        glow: hot ? '#B8FFC8' : '#8AE8A0'
    });
    s.box(8, 16.5, 5, 1.6, F.iron, { shade: 'flat', lum: 0.45 });
    s.line(8, 11, 8, 17, F.iron, { lum: 0.55, w: 0.8 });
    s.line(12.5, 11, 12.5, 17, F.iron, { lum: 0.3, w: 0.8 });
    // the green candle and its flame
    s.box(9.6, 14, 1.8, 2.6, F.glass, { shade: 'flat', lum: 0.2 });
    s.pxs(
        [
            [10, 14],
            [10, 15],
            [11, 14],
            [11, 15]
        ],
        '#16E08A',
        { glow: '#16E08A' }
    );
    s.px(10, 14, '#7BF5A6', { glow: '#7BF5A6' });
    s.px(10, hot ? 12 : 13, K.flame, { glow: '#E6FFB0' });
    s.px(10, 13, '#E6FFB0', { glow: '#E6FFB0' });
    if (hot) s.px(11, 12, '#E6FFB0', { glow: '#B8FFC8' });
    // a few stones at the foot of the post
    s.ellipse(1.5, 38.5, 1.6, 1.2, F.stone, {});
    s.ellipse(6, 38.8, 1.4, 1, F.stone, {});
    return s.render({ ao: 0.25 });
}

/**
 * 26×32 signpost: two boards nailed to a post, pointing opposite ways: a green one with an up arrow to the
 * left, a brick-red one with a down arrow to the right. The market only chops sideways.
 */
function signpost() {
    const s = new PixelSprite(24, 30);
    s.box(10.5, 2, 3.2, 27.5, F.plank, { g: 'post', bevel: 1.2 });
    s.poly(
        [
            [10.2, 2.4],
            [12.1, 0.4],
            [14, 2.4]
        ],
        F.plank,
        { g: 'post' }
    );
    s.auto('post', { R: 1.2, grad: 0.3 });
    // green board, pointing left
    s.poly(
        [
            [0.5, 8],
            [4, 4.5],
            [15.5, 4.5],
            [15.5, 11],
            [4, 11]
        ],
        F.paintGreen,
        { g: 'green' }
    );
    s.auto('green', { R: 1.4, grad: 0.35 });
    s.line(4, 10.5, 15, 10.5, F.paintGreen, { lum: 0.15 });
    s.patch(6, 5.5, ['..X..', '.XXX.', 'X.X.X', '..X..', '..X..'], { X: K.cream });
    // brick-red board, pointing right, hanging a little crooked
    s.poly(
        [
            [8.5, 13.5],
            [20, 14.2],
            [23.5, 17.8],
            [19.8, 21.2],
            [8.5, 20.2]
        ],
        F.paintRed,
        { g: 'red' }
    );
    s.auto('red', { R: 1.4, grad: 0.35 });
    s.patch(15, 15, ['..X..', '..X..', 'X.X.X', '.XXX.', '..X..'], { X: K.cream });
    // weathering: bare wood where the paint flaked off, and the nails
    s.pxs(
        [
            [14, 5],
            [5, 10],
            [9, 19],
            [21, 16]
        ],
        F.plank.ramp[3]
    );
    s.pxs(
        [
            [12, 7],
            [12, 9],
            [11, 15],
            [11, 18]
        ],
        K.glint
    );
    // grass at the foot of the post
    s.pxs(
        [
            [9, 28],
            [10, 27],
            [14, 28],
            [15, 27]
        ],
        F.moss.ramp[3]
    );
    return s.render({ ao: 0.25 });
}

/** A tongue of flame from (x, base) up to a tip `h` px above, leaning `lean` px; brightest at the root. */
function flame(s, x, base, h, w, lean, { core = false } = {}) {
    s.poly(
        [
            [x - w, base],
            [x - w * 1.1, base - h * 0.3],
            [x - w * 0.55 + lean * 0.4, base - h * 0.62],
            [x + lean, base - h],
            [x + w * 0.4 + lean * 0.5, base - h * 0.55],
            [x + w * 1.1, base - h * 0.28],
            [x + w, base]
        ],
        F.fire,
        {
            top: core ? 0.8 : 0.42,
            bot: core ? 1 : 0.78,
            glow: core ? '#FFE9A8' : '#FF9A3C',
            bare: true,
            g: 'fire'
        }
    );
}

/**
 * 22×18 campfire: a ring of stones around a bed of embers, two crossed logs, and a fire of three tongues
 * that dances through 4 frames, throwing sparks.
 */
function campfire(f) {
    const s = new PixelSprite(20, 16);
    const cx = 10;
    const cy = 11.6;
    const stones = [];
    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.2;
        stones.push([cx + Math.cos(a) * 8, cy + Math.sin(a) * 3.3, 1.5 + hash(i, 3) * 0.5, i]);
    }
    const stone = ([x, y, r, i]) => {
        s.ellipse(x, y, r, r * 0.8, F.stone, { g: `st${i}` });
        s.auto(`st${i}`, { R: 1, grad: 0.3 });
    };
    stones.filter((st) => st[1] < cy).forEach(stone);
    // the bed of embers
    s.ellipse(cx, cy, 6.4, 2.6, F.stone, { shade: 'flat', lum: 0.05, g: 'bed' });
    for (let i = 0; i < 5; i++)
        s.px(
            cx - 5 + ((i * 7 + f * 3) % 11),
            cy - 0.5 + ((i * 5 + f) % 2),
            i % 2 ? '#E8661A' : '#A8360A',
            {
                glow: '#FF9A3C'
            }
        );
    // crossed logs, charred where they meet the fire, their cut ends showing
    limb(
        s,
        [
            [3.5, 13.6],
            [14, 8.6]
        ],
        1.5,
        1.2,
        F.bark,
        { g: 'logA' }
    );
    limb(
        s,
        [
            [16.5, 13.6],
            [6, 8.6]
        ],
        1.5,
        1.2,
        F.bark,
        { g: 'logB' }
    );
    s.auto('logA', { R: 1, grad: 0.3 });
    s.auto('logB', { R: 1, grad: 0.3 });
    s.pxs(
        [
            [3, 13],
            [16, 13]
        ],
        F.endGrain.ramp[3]
    );
    // the fire: two side tongues, the main one, and its white-hot core
    const sway = [0, 1, 0, -1][f % 4];
    const hgt = [11, 9.5, 11.5, 10][f % 4];
    flame(s, cx - 2.8, 11.5, [6, 7, 5, 6.5][f % 4], 1.4, -1.2 - sway * 0.4);
    flame(s, cx + 2.8, 11.5, [5.5, 5, 6.5, 7][f % 4], 1.4, 1.2 - sway * 0.4);
    flame(s, cx, 12, hgt, 2.6, sway);
    flame(s, cx, 12, hgt * 0.5, 1.4, sway * 0.5, { core: true });
    // sparks rising, no outline
    s.px(cx + 2 - sway, [2, 1, 3, 0][f % 4], K.flame, { glow: '#FFE9A8', bare: true });
    s.px(cx - 3 + (f % 2), [4, 2, 3, 1][f % 4], K.ember, { glow: '#FF9A3C', bare: true });
    stones.filter((st) => st[1] >= cy).forEach(stone);
    // firelight on the faces of the stones that look at the fire
    for (const [x, y] of stones) {
        if (Math.abs(x - cx) > 6) continue;
        s.px(Math.round(x), Math.round(y < cy ? y + 0.6 : y - 1), '#B86A3E', { clip: true });
    }
    return s.render({ ao: 0.25 });
}

/**
 * 40×28 abandoned tent: a sagging A-frame of khaki canvas, a patch on the roof, guy ropes pegged into the
 * ground, the door flap tied back. Deep inside, a laptop someone left on still shows a red chart.
 */
function tent() {
    const s = new PixelSprite(38, 26);
    // guy ropes behind the tent
    s.line(28.5, 1.5, 36.5, 20, F.rope, { lum: 0.45, bare: true });
    // the side of the roof, receding to the back right, and the front gable
    s.poly(
        [
            [12.5, 3],
            [21, 3.4],
            [29, 1.5],
            [36, 20.5],
            [24.5, 23.5]
        ],
        F.canvas,
        { top: 0.62, bot: 0.36, g: 'roof' }
    );
    s.poly(
        [
            [12.5, 3],
            [24.5, 23.5],
            [1.5, 23.5]
        ],
        F.canvas,
        { left: 0.82, right: 0.6, g: 'gable' }
    );
    // seams down the roof, and a patch
    s.line(21, 3.6, 30.5, 22, F.canvas, { lum: 0.3, g: 'roof' });
    s.box(24, 8, 4, 4, F.canvas, { shade: 'flat', lum: 0.58, g: 'roof' });
    s.pxs(
        [
            [24, 8],
            [26, 8],
            [27, 9],
            [27, 11],
            [24, 10],
            [25, 11]
        ],
        F.canvas.ramp[1]
    );
    // the dark doorway, the flap tied back to the left with a rope
    s.poly(
        [
            [12.5, 8],
            [18, 23.5],
            [8, 23.5]
        ],
        F.canvas,
        { lum: 0, g: 'door' }
    );
    s.poly(
        [
            [12.5, 8],
            [8, 23.5],
            [4.5, 23.5],
            [8.5, 15]
        ],
        F.canvas,
        { top: 0.95, bot: 0.7, g: 'flap' }
    );
    s.pxs(
        [
            [7, 16],
            [8, 16],
            [9, 16]
        ],
        F.rope.ramp[4]
    );
    // the laptop, still on
    s.box(10.5, 19, 4, 2.6, F.iron, { shade: 'flat', lum: 0.3, g: 'door' });
    s.pxs(
        [
            [11, 20],
            [12, 20],
            [13, 20]
        ],
        '#3A5A78',
        { glow: '#2A4A68' }
    );
    s.pxs(
        [
            [11, 19],
            [12, 20],
            [13, 21]
        ],
        '#B8404A',
        { glow: '#B8404A' }
    );
    s.line(10, 22, 15, 22, F.iron, { lum: 0.5, g: 'door' });
    // ridge pole ends, rim light on the gable edge, hem along the ground
    s.pxs(
        [
            [12, 1],
            [12, 2]
        ],
        F.plank.ramp[4]
    ).px(29, 0, F.plank.ramp[3]);
    for (let y = 4; y < 23; y += 1)
        s.px(Math.round(12.5 - (y - 3) * 0.54), y, F.canvas.ramp[5], { clip: true });
    // guy rope in front, stakes
    s.line(12.5, 3.5, 0.5, 24.5, F.rope, { lum: 0.6, bare: true });
    s.pxs(
        [
            [0, 24],
            [0, 25]
        ],
        F.plank.ramp[3]
    ).pxs(
        [
            [36, 20],
            [37, 21]
        ],
        F.plank.ramp[2]
    );
    return s.render({ ao: 0.25 });
}

/** A fence post from (x, bottom) up to its top, leaning `lean` px, with a lit top face. */
function post(s, x, top, bottom, lean, g) {
    s.poly(
        [
            [x, bottom],
            [x + lean, top],
            [x + lean + 3.2, top],
            [x + 3.2, bottom]
        ],
        F.plank,
        { g }
    );
    s.auto(g, { R: 1, grad: 0.4 });
    s.line(x + lean + 0.5, top + 0.5, x + lean + 2.7, top + 0.5, F.plank, {
        lum: 0.95,
        g: `${g}t`
    });
}

/** A fence rail from (x0, y0) to (x1, y1), 2 px thick. */
function rail(s, x0, y0, x1, y1, g) {
    s.capsule(x0, y0, x1, y1, 1.15, 1.15, F.plank, { g });
    s.auto(g, { R: 1, grad: 0.3 });
}

/** 42×18 broken fence: three posts, two rails on the left, a snapped rail hanging to the ground on the right. */
function fence() {
    const s = new PixelSprite(40, 16);
    post(s, 1.5, 2, 15.5, 0, 'p0');
    post(s, 18, 1, 15.5, 0, 'p1');
    post(s, 34, 4, 15.5, 1.6, 'p2');
    rail(s, 0.5, 5.5, 21, 5, 'r0');
    rail(s, 0.5, 10.5, 21, 10.5, 'r1');
    rail(s, 19, 10.5, 37, 10.5, 'r2');
    // the snapped top rail: one end still nailed, the other on the ground
    rail(s, 19.5, 5, 29.5, 13.8, 'r3');
    s.pxs(
        [
            [29, 13],
            [30, 14]
        ],
        F.endGrain.ramp[3]
    );
    s.pxs(
        [
            [36, 6],
            [37, 7]
        ],
        F.endGrain.ramp[3]
    );
    // nails
    s.pxs(
        [
            [3, 5],
            [3, 10],
            [19, 5],
            [20, 10],
            [35, 10]
        ],
        K.glint
    );
    // grass at the feet
    s.pxs(
        [
            [0, 15],
            [5, 14],
            [17, 15],
            [22, 14],
            [33, 15],
            [38, 14]
        ],
        F.moss.ramp[3]
    );
    return s.render({ ao: 0.25 });
}

/**
 * 20×38 monolith: an old standing stone, mossy at the foot, carved with the sign of the bull and a rising
 * candlestick chart that glow faintly mint. Two frames: the glyphs shimmer, one candle at a time.
 */
function monolith(f) {
    const s = new PixelSprite(18, 36, { dither: 0.25 });
    const rows = [];
    for (let y = 1; y < 36; y++) {
        const t = (y - 1) / 34;
        const top = Math.min(1, (y - 0.5) / 4.5);
        const hw = (5 + 2.4 * t) * Math.sqrt(top);
        const lean = (1 - t) * 1.2;
        const x0 = Math.round(9 - hw + lean);
        const x1 = Math.round(9 + hw + lean - (y === 3 || y === 4 ? 1 : 0));
        rows.push([y, x0, x1]);
    }
    s.spans(rows, F.stone, { g: 'stone' });
    s.auto('stone', { R: 3.2, grad: 0.4 });
    // moss on the foot and the shady shoulder
    s.ellipse(3.6, 35, 3.2, 1.8, F.moss, { g: 'moss', clip: true });
    s.ellipse(14.6, 35.4, 2.2, 1.1, F.moss, { g: 'moss', clip: true });
    s.ellipse(2.2, 31.5, 1.2, 2.2, F.moss, { g: 'moss', clip: true });
    s.ellipse(14.2, 5.6, 1.6, 1.3, F.moss, { g: 'moss', clip: true });
    s.auto('moss', { R: 1.2, grad: 0.35 });
    s.pxs(
        [
            [2, 33],
            [5, 34],
            [7, 35],
            [13, 35]
        ],
        F.moss.ramp[2]
    );
    // weathering: a crack and a chipped edge catching the light
    s.line(14, 22, 15.5, 27, F.stone, { lum: 0.05, g: 'crack' });
    s.line(15.5, 27, 14.5, 30, F.stone, { lum: 0.05, g: 'crack' });
    s.pxs(
        [
            [4, 9],
            [4, 10],
            [5, 3]
        ],
        F.stone.ramp[5]
    );
    // the carvings: the sign of the bull (a circle with horns), a line of notches, and the chart
    const on = (i) => (f % 2 ? i % 2 === 0 : i % 2 === 1);
    const glyph = (x, y, i) =>
        s.px(x, y, on(i) ? K.mintHot : K.mint, { glow: on(i) ? K.mintHot : K.mint });
    ['X...X', '.XXX.', 'X...X', 'X...X', '.XXX.'].forEach((row, dy) =>
        [...row].forEach((ch, dx) => ch === 'X' && glyph(8 + dx, 4 + dy, 0))
    );
    for (let x = 5; x <= 13; x += 2) s.px(x, 11, F.stone.ramp[0]);
    const candles = [
        [5, 22, 24, 27, 28],
        [7, 19, 21, 25, 26],
        [9, 21, 22, 24, 25],
        [11, 16, 17, 21, 23],
        [13, 13, 14, 18, 19]
    ];
    candles.forEach(([x, wt, bt, bb, wb], i) => {
        for (let y = wt; y <= wb; y++) {
            const body = y >= bt && y <= bb;
            s.px(x, y, body ? K.mint : '#2E7A6A', { glow: body ? K.mint : null });
            if (body) glyph(x, y, i);
            if (body) s.px(x + 1, y, F.stone.ramp[0]);
        }
    });
    return s.render({ ao: 0.25 });
}

/**
 * 30×21 sawhorse: a log laid in the V of two X-trestles, a bow saw (an ochre steel arch over the blade)
 * standing in a half-finished cut, a little mound of sawdust on the ground below.
 */
function sawhorse() {
    const s = new PixelSprite(28, 19);
    const ly = 7.5;
    // the trestles: two crossed legs at each end, the log resting in the upper V
    for (const [x, g] of [
        [6, 'tA'],
        [21.5, 'tB']
    ]) {
        limb(
            s,
            [
                [x - 3.4, 18.2],
                [x + 3.2, 3.2]
            ],
            0.85,
            0.7,
            F.plank,
            { g, bias: -0.08 }
        );
        limb(
            s,
            [
                [x + 3.4, 18.2],
                [x - 3.2, 3.2]
            ],
            0.85,
            0.7,
            F.plank,
            { g: `${g}2` }
        );
        s.auto(g, { R: 0.8, grad: 0.3 });
        s.auto(`${g}2`, { R: 0.8, grad: 0.3 });
    }
    // sawdust sprinkled under the cut
    s.ellipse(16.5, 17.6, 3.6, 1.4, F.endGrain, { shade: 'flat', lum: 0.6, g: 'dust', bare: true });
    s.pxs(
        [
            [15, 17],
            [17, 16],
            [18, 17]
        ],
        F.endGrain.ramp[4],
        { bare: true }
    );
    s.pxs(
        [
            [12, 18],
            [21, 18]
        ],
        F.endGrain.ramp[2],
        { bare: true }
    );
    // the log
    s.capsule(3, ly, 25.5, ly, 2.6, 2.6, F.bark, { g: 'log' });
    s.auto('log', { R: 1.6, grad: 0.3 });
    s.line(7, ly + 1, 12, ly + 1, F.bark, { lum: 0.15, g: 'lf' });
    s.line(20, ly - 0.6, 24, ly - 0.6, F.bark, { lum: 0.15, g: 'lf' });
    endGrain(s, 2.4, ly, 1.5, 2.6, { seed: 9, g: 'end', rim: 0.7 });
    // the cut, and the bow saw standing in it: a steel arch over the blade, a wooden grip at one end
    s.line(17.5, ly - 2.4, 17.5, ly + 0.5, F.bark, { lum: 0, g: 'cut' });
    const arch = [];
    for (let i = 0; i <= 8; i++) {
        const a = Math.PI * (i / 8);
        arch.push([17.5 - Math.cos(a) * 5.4, ly - 2.6 - Math.sin(a) * 4.2]);
    }
    limb(s, arch, 0.6, 0.6, F.ochre, { g: 'bow', bare: true });
    s.auto('bow', { R: 0.6, grad: 0.3 });
    limb(
        s,
        [
            [22.9, ly - 2.6],
            [24.6, ly - 4.6]
        ],
        0.9,
        0.9,
        F.plank,
        { g: 'grip', bias: 0.1 }
    );
    s.auto('grip', { R: 0.8, grad: 0.3 });
    s.line(12, ly - 2.4, 23, ly - 2.4, F.iron, { lum: 0.8, g: 'blade', bare: true });
    s.px(13, ly - 3, K.glint);
    return s.render({ ao: 0.25 });
}

// ---------------------------------------------------------------------------------------------------------
// Decals: flat marks baked into the forest floor, seen from straight above. Low contrast, a few colours
// each, no outline: they are scattered by the thousand and must read as texture, not objects.

const G = {
    deep: '#1C2A24',
    dark: '#22332B',
    light: '#30483A',
    lighter: '#3A5543',
    tip: '#44614C',
    mud0: '#1D1916',
    mud1: '#211C18',
    mud2: '#2A241F',
    moss0: '#26392C',
    moss1: '#2C4434',
    moss2: '#33503C',
    root0: '#2E251E',
    root1: '#3A2E24',
    root2: '#4A3A2C'
};

/** A flat decal: draw with `px`/`pxs`, rendered without outline or contact shadows. */
function flat(w, h, draw) {
    const s = new PixelSprite(w, h);
    draw(s);
    return s.render({ outline: false, ao: 0 });
}

/** A grass blade rising `h` px from its root at (x, y), bending `lean` px by the tip. */
function blade(s, x, y, h, lean, base, tip) {
    for (let i = 0; i < h; i++) {
        const t = i / Math.max(1, h - 1);
        s.px(Math.round(x + lean * t * t), y - i, i === h - 1 ? tip : base);
    }
}

/** A tuft: blades [x, h, lean, back?] on a shaded root row at y. */
function tuft(s, y, blades) {
    const tallest = Math.max(...blades.map((b) => b[1]));
    for (const [x, h, lean, back] of blades)
        blade(
            s,
            x,
            y,
            h,
            lean,
            back ? G.deep : G.light,
            back ? G.light : h === tallest ? G.tip : G.lighter
        );
    for (const [x] of blades) s.px(x, y, G.deep);
}

function grassA() {
    return flat(5, 4, (s) =>
        tuft(s, 3, [
            [1, 3, -1, true],
            [2, 4, 0],
            [3, 3, 1]
        ])
    );
}

function grassB() {
    return flat(8, 5, (s) =>
        tuft(s, 4, [
            [1, 3, -1.2, true],
            [2, 4, -1],
            [3, 5, 0],
            [4, 3, 0.5, true],
            [5, 4, 1],
            [6, 3, 1.4]
        ])
    );
}

function grassC() {
    return flat(11, 7, (s) => {
        tuft(s, 6, [
            [1, 3, -1, true],
            [2, 5, -1.4],
            [3, 6, -0.4],
            [4, 4, 0.6, true],
            [5, 5, 1]
        ]);
        tuft(s, 5, [
            [7, 3, -0.6, true],
            [8, 4, 0.4],
            [9, 3, 1.2]
        ]);
    });
}

/** Wildflowers: thin stems with a leaf or two, and small heads of petals around a centre. */
function flowers(petal, centre, lit) {
    return flat(8, 6, (s) => {
        // stems and leaves
        s.pxs(
            [
                [1, 3],
                [1, 4],
                [4, 2],
                [4, 3],
                [4, 4],
                [6, 4]
            ],
            G.light
        );
        s.pxs(
            [
                [0, 4],
                [2, 3],
                [5, 4],
                [3, 5]
            ],
            G.lighter
        );
        // heads: two open, one bud
        for (const [x, y] of [
            [1, 1],
            [4, 0]
        ]) {
            s.pxs(
                [
                    [x - 1, y + 1],
                    [x + 1, y + 1],
                    [x, y],
                    [x, y + 2]
                ],
                petal
            );
            s.px(x, y + 1, centre);
        }
        s.px(1, 1, lit).px(4, 0, lit);
        s.px(6, 3, petal);
    });
}

/** Clover: one big three-leaf clover (two heart-shaped leaflets above, one below), a small one beside it. */
function clover() {
    return flat(9, 6, (s) => {
        s.patch(0, 1, ['LL.LL', 'LMDML', '.LML.', '..L..'], {
            L: G.lighter,
            M: G.light,
            D: G.dark
        });
        s.px(0, 1, G.tip).px(3, 1, G.tip);
        s.patch(6, 0, ['L.L', '.D.', 'LML'], { L: G.lighter, M: G.light, D: G.dark });
    });
}

function fallenLeaves() {
    return flat(13, 9, (s) => {
        const ochre = '#5E5434';
        const olive = '#4A4A2E';
        const rust = '#5C4630';
        for (const [x, y, c, shape] of [
            [1, 1, ochre, 0],
            [6, 0, olive, 1],
            [10, 2, rust, 0],
            [3, 5, rust, 1],
            [8, 6, ochre, 1],
            [11, 7, olive, 0]
        ]) {
            if (shape)
                s.pxs(
                    [
                        [x, y],
                        [x + 1, y],
                        [x + 1, y + 1],
                        [x + 2, y + 1]
                    ],
                    c
                );
            else
                s.pxs(
                    [
                        [x, y],
                        [x + 1, y],
                        [x, y + 1],
                        [x + 1, y + 1]
                    ],
                    c
                );
            s.px(x + 1, y + 2, G.deep);
        }
    });
}

function pebbles() {
    return flat(7, 4, (s) => {
        s.pxs(
            [
                [1, 1],
                [2, 1]
            ],
            '#4C5450'
        )
            .px(1, 2, '#3A423E')
            .px(2, 2, '#3A423E');
        s.pxs(
            [
                [1, 3],
                [2, 3]
            ],
            G.deep
        );
        s.px(4, 0, '#4C5450')
            .px(5, 0, '#3A423E')
            .pxs(
                [
                    [4, 1],
                    [5, 1]
                ],
                G.deep
            );
        s.px(5, 2, '#3A423E').px(5, 3, G.deep);
    });
}

function twigs() {
    return flat(11, 5, (s) => {
        for (let x = 0; x <= 10; x++) {
            const y = Math.round(3 - x * 0.22);
            s.px(x, y, x % 3 === 0 ? G.root2 : G.root1);
            s.px(x, y + 1, G.deep);
        }
        s.pxs(
            [
                [6, 1],
                [7, 0]
            ],
            G.root1
        ).px(6, 2, G.deep);
        s.pxs(
            [
                [2, 4],
                [1, 4]
            ],
            G.root0
        );
    });
}

function sawdust() {
    return flat(13, 7, (s) => {
        const chips = ['#5A4A36', '#6E5A40', '#806A4C'];
        for (let y = 0; y < 7; y++)
            for (let x = 0; x < 13; x++) {
                const d = Math.hypot((x + 0.5 - 6.5) / 6.5, (y + 0.5 - 3.5) / 3.5);
                if (d > 1) continue;
                const r = hash(x, y, 61);
                if (r > 0.75 - d * 0.55) continue;
                s.px(x, y, chips[Math.floor(hash(x, y, 62) * 3)]);
            }
    });
}

/** Organic blob test: is (x, y) inside a wobbly ellipse? Returns the normalised distance (<= 1 inside). */
function blob(x, y, cx, cy, rx, ry, seed) {
    const u = (x + 0.5 - cx) / rx;
    const v = (y + 0.5 - cy) / ry;
    const th = Math.atan2(v, u);
    const R =
        0.88 +
        0.07 * Math.sin(2 * th + hash(seed, 1) * 6.28) +
        0.05 * Math.sin(3 * th + hash(seed, 2) * 6.28) +
        0.03 * Math.sin(5 * th + hash(seed, 3) * 6.28);
    return Math.hypot(u, v) / R;
}

/** Wet mud: a dark patch, wetter in the middle, with a bull's hoof prints pressed into it. */
function mud() {
    return flat(17, 9, (s) => {
        for (let y = 0; y < 9; y++)
            for (let x = 0; x < 17; x++) {
                const d = blob(x, y, 8.5, 4.5, 8.4, 4.4, 71);
                if (d > 1) continue;
                s.px(x, y, d > 0.85 ? G.mud2 : d > 0.5 ? G.mud1 : G.mud0);
            }
        // a track of cloven hoof prints walking through
        for (const [x, y] of [
            [5, 5],
            [11, 2]
        ]) {
            s.pxs(
                [
                    [x, y],
                    [x, y + 1],
                    [x + 2, y],
                    [x + 2, y + 1]
                ],
                '#141210'
            );
            s.px(x + 1, y + 2, '#141210');
        }
    });
}

function moss() {
    return flat(15, 8, (s) => {
        for (let y = 0; y < 8; y++)
            for (let x = 0; x < 15; x++) {
                const d = blob(x, y, 7.5, 4, 7.4, 3.9, 81);
                if (d > 1) continue;
                if (d > 0.8 && hash(x, y, 82) < 0.45) continue;
                const r = hash(x, y, 83);
                s.px(x, y, d > 0.8 ? G.moss0 : r < 0.18 ? G.moss2 : G.moss1);
            }
    });
}

/** Exposed roots: a main root snaking across, thick at the left, diving under the soil once, and a fork. */
function roots() {
    return flat(19, 7, (s) => {
        const y = (x) => 3.2 - Math.sin(x * 0.3) * 1.4;
        for (let x = 0; x <= 18; x++) {
            if (x === 13) continue; // under the soil
            const yy = Math.round(y(x));
            s.px(x, yy, x < 7 ? G.root2 : G.root1);
            if (x < 8) s.px(x, yy + 1, G.root0);
            s.px(x, yy + (x < 8 ? 2 : 1), G.deep);
        }
        for (let x = 8; x <= 14; x++) {
            const yy = Math.round(y(7) + 1 + (x - 7) * 0.4);
            if (yy > 5) break;
            s.px(x, yy, G.root1).px(x, yy + 1, G.deep);
        }
    });
}

/**
 * A rain puddle seen from above: an organic pool of dark slate water inside a rim of wet mud, a little
 * paler near the far bank, with one or two pale streaks of moonlight on it.
 */
function puddle(w, h, seed, streaks) {
    return flat(w, h, (s) => {
        const cx = w / 2;
        const cy = h / 2;
        const rx = w / 2 - 0.2;
        const ry = h / 2 - 0.2;
        const at = (x, y) => blob(x, y, cx, cy, rx, ry, seed);
        for (let y = 0; y < h; y++)
            for (let x = 0; x < w; x++) {
                const d = at(x, y);
                if (d > 1) continue;
                const edge = [
                    [1, 0],
                    [-1, 0],
                    [0, 1],
                    [0, -1]
                ].some(([dx, dy]) => at(x + dx, y + dy) > 1);
                const v = (y + 0.5 - cy) / ry;
                let c;
                if (edge) c = v > 0.2 ? G.mud0 : G.mud1;
                else if (d > 0.82) c = v < -0.2 ? '#26364A' : '#1E2B38';
                else c = v < -0.35 ? '#22303F' : '#1A2633';
                s.px(x, y, c);
            }
        for (const [x, y, len] of streaks) {
            for (let i = 0; i < len; i++)
                s.px(x + i, y, i === 0 || i === len - 1 ? '#4A5E72' : '#6A7E92');
        }
    });
}

// ---------------------------------------------------------------------------------------------------------

export const PROPS = {
    chop_pine_a: { gen: pineA, foot: 2, shadow: 0.7, tall: true },
    chop_pine_b: { gen: pineB, foot: 2, shadow: 0.7, tall: true },
    chop_pine_small: { gen: pineSmall, foot: 2, shadow: 0.7, tall: true },
    chop_oak: { gen: oak, foot: 3, shadow: 0.75, tall: true },
    chop_dead_tree: { gen: deadTree, foot: 2, shadow: 0.5, tall: true },
    chop_stump_axe: { gen: stumpAxe, foot: 2, shadow: 0.85 },
    chop_stump: { gen: smallStump, foot: 2, shadow: 0.85 },
    chop_log_pile: { gen: logPile, foot: 2, shadow: 0.9 },
    chop_fallen_log: { gen: fallenLog, foot: 2, shadow: 0.9 },
    chop_boulder: { gen: boulder, foot: 2, shadow: 0.9 },
    chop_rock: { gen: rock, foot: 2, shadow: 0.6 },
    chop_bush_a: { gen: bushA, foot: 2, shadow: 0.85 },
    chop_bush_b: { gen: bushB, foot: 2, shadow: 0.85 },
    chop_fern: { gen: fern, foot: 2, shadow: 0.6 },
    chop_mushrooms: {
        gen: mushrooms,
        frames: 2,
        fps: 1.5,
        foot: 2,
        shadow: 0.5,
        light: { rgb: '120,255,200', r: 70, a: 0.5, x: 0, y: -1, flicker: 'pulse' }
    },
    chop_lantern: {
        gen: lantern,
        frames: 2,
        fps: 6,
        foot: 2,
        shadow: 0.4,
        tall: true,
        light: { rgb: '170,255,190', r: 150, a: 0.75, x: 3.5, y: -6, flicker: 'fire' }
    },
    chop_signpost: { gen: signpost, foot: 2, shadow: 0.35, tall: true },
    chop_campfire: {
        gen: campfire,
        frames: 4,
        fps: 9,
        foot: 3,
        shadow: 0,
        light: { rgb: '255,160,70', r: 190, a: 0.9, x: 0, y: -2, flicker: 'fire' }
    },
    chop_tent: { gen: tent, foot: 3, shadow: 0.85 },
    chop_fence: { gen: fence, foot: 2, shadow: 0.8 },
    chop_monolith: {
        gen: monolith,
        frames: 2,
        fps: 1.2,
        foot: 3,
        shadow: 0.7,
        tall: true,
        light: { rgb: '120,255,200', r: 90, a: 0.45, x: 0, y: -2, flicker: 'pulse' }
    },
    chop_sawhorse: { gen: sawhorse, foot: 2, shadow: 0.85 }
};

export const DECALS = {
    chop_grass_a: { gen: grassA },
    chop_grass_b: { gen: grassB },
    chop_grass_c: { gen: grassC },
    chop_flowers_white: { gen: () => flowers('#AAB6B2', '#D2BC6A', '#D4DCD8') },
    chop_flowers_gold: { gen: () => flowers('#B8923A', '#7E5E22', '#D8B456') },
    chop_flowers_violet: { gen: () => flowers('#76629E', '#C2AE66', '#9C88C4') },
    chop_clover: { gen: clover },
    chop_leaves: { gen: fallenLeaves },
    chop_pebbles: { gen: pebbles },
    chop_twigs: { gen: twigs },
    chop_sawdust: { gen: sawdust },
    chop_mud: { gen: mud },
    chop_moss: { gen: moss },
    chop_roots: { gen: roots },
    chop_puddle_s: { gen: () => puddle(18, 8, 91, [[6, 2, 4]]), water: true },
    chop_puddle_m: {
        gen: () =>
            puddle(32, 14, 92, [
                [10, 4, 7],
                [15, 6, 3]
            ]),
        water: true
    },
    chop_puddle_l: {
        gen: () =>
            puddle(54, 22, 93, [
                [17, 6, 11],
                [24, 8, 5],
                [33, 12, 3]
            ]),
        water: true
    }
};
