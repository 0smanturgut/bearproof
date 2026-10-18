// Breakables and the pickups they drop, drawn with the pixel-art engine (art/pixel.js): the piggy bank you smash
// on every map, what falls out of it, and the treasure chest a boss leaves behind. Ground items, seen from the
// game's top-down 3/4 view. They lie on a dark night floor, so each one carries a few emissive pixels (`glow`)
// that bloom in-game and make it the most "pick me up" thing on screen.

import { PixelSprite, mat } from './pixel.js';
import { M } from './materials.js';

// ---------------------------------------------------------------- materials (six tones, cool shadows, warm lights)

const L = {
    // glazed ceramic: peach-pink, plum in the shadow, cream in the light (peach-leaning, never the bears' crimson)
    pig: mat(['#4A2030', '#8C4048', '#CC6A62', '#F59C82', '#FFC8AC', '#FFEDDF'], {
        line: '#240E16'
    }),
    // a paper cup, warm white, and its orange band
    cup: mat(['#5A4A44', '#8A7A70', '#B8AA9C', '#DCD0C2', '#F2EADE', '#FFFBF4'], {
        line: '#221A16'
    }),
    band: mat(['#4A1606', '#7E280C', '#B44012', '#E8641E', '#FF9040', '#FFC07A'], {
        line: '#220A04'
    }),
    foil: mat(['#3A3C44', '#62666E', '#8E929A', '#B8BCC2', '#DADDE2', '#F6F8FA'], {
        line: '#1A1B20'
    }),
    broth: mat(['#4A1E08', '#7A3410', '#B0561A', '#E07E2A', '#FFA848', '#FFD08A'], {
        line: '#2A0E04',
        glow: '#FF9A3A'
    }),
    // CLOUT: a richer, yellower gold than the candles
    clout: mat(['#3A1E00', '#8A4E00', '#D98E00', '#FFC93D', '#FFE77A', '#FFFCE0'], {
        line: '#1E1000'
    }),
    // the magnet's muted brick red (warm and orange-leaning, so it never reads as a bear)
    brick: mat(['#240C0A', '#4E1A14', '#7E2C20', '#A8432E', '#C8644A', '#E48E6C'], {
        line: '#140605'
    }),
    // tool steel, light enough to read on asphalt
    steel: mat(['#14181E', '#262D36', '#3E4854', '#5E6A78', '#8C98A6', '#C8D2DC'], {
        line: '#080A0D'
    }),
    // the chest: dark oak, redder than the scenery's logs
    oak: mat(['#1E0E08', '#3E1C10', '#64301A', '#8C4A26', '#B26A36', '#D69252'], {
        line: '#120804'
    }),
    frost: mat(['#2A5A80', '#4E86AE', '#7EB4D6', '#B4DEF2', '#DDF4FF', '#FFFFFF'], {
        line: '#0A2236'
    })
};

const GOLD_GLOW = '#FFC53D';

/** The ramp tone for a brightness `t` (0..5), clamped. */
const tone = (m, t) => m.ramp[Math.max(0, Math.min(m.ramp.length - 1, Math.round(t)))];

/** A four-point sparkle: a bright core and arms of length `r`, emissive and without an outline. */
function sparkle(s, x, y, r, core = '#FFFFFF', arm = '#FFF6D6', glow = '#FFE08A') {
    s.px(x, y, core, { glow: core, bare: true });
    for (let i = 1; i <= r; i++)
        for (const [dx, dy] of [
            [i, 0],
            [-i, 0],
            [0, i],
            [0, -i]
        ])
            s.px(x + dx, y + dy, arm, { glow, bare: true });
}

/**
 * A vertical cylinder (a cup, a can) from row `y0` to `y1`, radius `r0` → `r1`, lit from the left, its bottom
 * bowed down by `curve` px so it sits in the 3/4 view. `mAt(x, y)` may swap the material per pixel (a band).
 */
function cylinder(s, cx, y0, y1, r0, r1, m, { g, curve = 0, bias = 0, mAt = null } = {}) {
    for (let y = Math.floor(y0); y <= Math.ceil(y1 + curve); y++) {
        const t = Math.max(0, Math.min(1, (y + 0.5 - y0) / (y1 - y0)));
        const r = r0 + (r1 - r0) * t;
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
            const u = (x + 0.5 - cx) / r;
            if (Math.abs(u) > 1 || y + 0.5 < y0) continue;
            const nz = Math.sqrt(1 - u * u);
            if (y + 0.5 > y1 + curve * nz) continue;
            const d = Math.max(0, -0.53 * u + 0.48 * nz);
            s.spans([[y, x, x]], (mAt && mAt(x, y)) || m, { g, lum: 0.36 + 0.75 * d + bias });
        }
    }
}

// ---------------------------------------------------------------- the piggy bank

/**
 * 19×16 piggy bank, the breakable on every map: a fat peach-glazed ceramic pig with a gold coin stuck in its
 * glowing slot, a snout, ears, stubby trotters and a curly tail. A gloss streak sweeps over the glaze and the
 * coin twinkles, 4 frames.
 */
export function piggyBank(f) {
    const s = new PixelSprite(19, 16);
    const [cx, cy, rx, ry] = [9.6, 8.4, 7.1, 5.3];
    const onBody = (x, y) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 0.8;
    // the far trotters and the far ear, in the body's shadow
    for (const x of [7, 14]) {
        s.box(x, 11, 2, 3, L.pig, { bevel: 0.8, bias: -0.3 });
        s.px(x, 13, tone(L.pig, 0)).px(x + 1, 13, tone(L.pig, 0));
    }
    s.poly(
        [
            [11, 5],
            [11.6, 1.6],
            [13.8, 3.8]
        ],
        L.pig,
        { lum: 0.42 }
    );
    // the glazed body, and the snout pushed out of it
    s.ellipse(cx, cy, rx, ry, L.pig, { g: 'body', flat: 0.85, bias: 0.12, spec: 0.2 });
    s.ellipse(17.2, 8.6, 1.5, 1.9, L.pig, { flat: 0.7, bias: 0.12 });
    // the near trotters
    for (const x of [5, 12]) {
        s.box(x, 11.5, 2, 3.5, L.pig, { bevel: 0.8, bias: 0.08 });
        s.px(x, 14, tone(L.pig, 1)).px(x + 1, 14, tone(L.pig, 0));
    }
    // the near ear, with its pink inside
    s.poly(
        [
            [12.6, 4.9],
            [13.8, 1.2],
            [15.9, 4.4]
        ],
        L.pig,
        { lum: 0.86 }
    );
    s.px(14, 3, tone(L.pig, 2)).px(14, 4, tone(L.pig, 3));
    // the face: an eye, a blushing cheek, a snout with two nostrils
    s.px(13, 7, '#2A0E18').px(14, 9, '#FF9E8E');
    s.px(17, 8, tone(L.pig, 1)).px(17, 10, tone(L.pig, 1)).px(16, 7, tone(L.pig, 5));
    // a curly tail
    s.pxs(
        [
            [2, 7],
            [1, 7],
            [0, 6],
            [1, 5]
        ],
        tone(L.pig, 3),
        { line: L.pig.line }
    );
    // the glaze's fixed shine
    s.px(5, 5, '#FFFFFF');
    // the slot on the back, lit gold from inside, and a gold coin stuck in it
    for (const [x, c] of [
        [6, '#C8803A'],
        [7, '#FFD27A'],
        [10, '#FFD27A'],
        [11, '#C8803A']
    ])
        s.px(x, 4, c, { glow: GOLD_GLOW, line: '#3A1406' });
    s.patch(
        8,
        1,
        ['ab', 'bc', 'cd', 'dd'],
        { a: '#FFF6D6', b: '#FFE08A', c: '#FFC53D', d: '#C28100' },
        { glow: GOLD_GLOW, line: '#221400' }
    );
    // a gloss streak that sweeps over the glaze, then the coin twinkles
    if (f % 4 === 3) sparkle(s, 9, 1, 1);
    else {
        const k = [11, 15, 19][f % 4];
        for (let y = 5; y <= 11; y++)
            for (const x of [k - y, k - y + 1])
                if (onBody(x, y) && x !== 13)
                    s.spans([[y, x, x]], L.pig, { g: 'body', lum: x === k - y ? 1 : 0.8 });
    }
    return s.render();
}

// ---------------------------------------------------------------- pickups

/**
 * 13×13 cup of instant ramen (heals): a paper cup with an orange band, the foil lid peeled back, noodles, an egg
 * and chopsticks in the hot broth, and steam curling up (2 frames).
 */
export function ramen(f) {
    const s = new PixelSprite(13, 13);
    const cx = 6.5;
    // the foil lid, peeled back and leaning behind the cup: a flat sheet, its curled edge catching the light
    s.poly(
        [
            [1.2, 5.5],
            [0.5, 2.4],
            [1.4, 1],
            [3.8, 0.7],
            [5.2, 4.8]
        ],
        L.foil,
        { top: 0.95, bot: 0.45 }
    );
    s.px(1, 1, '#FFFFFF').px(2, 1, '#FFFFFF').px(3, 1, tone(L.foil, 5));
    s.px(2, 3, tone(L.band, 3)).px(3, 3, tone(L.band, 4));
    // the cup and its band
    cylinder(s, cx, 6.4, 11.3, 5.5, 4.5, L.cup, {
        g: 'cup',
        curve: 0.8,
        mAt: (x, y) => (y === 9 || y === 10 ? L.band : null)
    });
    for (const x of [3, 4, 6, 8]) s.px(x, x % 2 ? 9 : 10, tone(L.band, 5), { clip: true });
    // the rim and the hot broth, noodles, half an egg and a bit of green onion in it
    s.ellipse(cx, 6.4, 5.5, 1.9, L.cup, { shade: 'flat', lum: 1 });
    s.ellipse(cx, 6, 4.3, 1, L.broth, { shade: 'flat', lum: 0.5 });
    s.pxs(
        [
            [3, 6],
            [4, 5],
            [6, 6],
            [8, 5],
            [9, 6]
        ],
        '#FFE9A8',
        { glow: '#FFC46E' }
    );
    s.px(5, 5, '#FFFFFF').px(5, 6, '#FFD23A', { glow: '#FFC53D' });
    s.px(7, 6, '#6FD06A');
    for (let x = 3; x <= 10; x++) s.px(x, 7, x < 6 ? '#FFFFFF' : tone(L.cup, 4));
    // chopsticks standing in the bowl
    for (let i = 0; i < 6; i++) s.px(7 + i, 5 - i, '#EBC88E', { line: '#1E1208' });
    for (let i = 0; i < 5; i++) s.px(8 + i, 5 - i, '#B88550', { line: '#1E1208' });
    // steam curling up off the broth, swaying
    const wisp = f % 2 ? [5, 6, 6, 7, 6] : [7, 6, 6, 5, 6];
    const tint = ['#C8D4DC', '#E4ECF0', '#F4F8FA', '#FFFFFF', '#FFFFFF'];
    wisp.forEach((x, y) => s.px(x, y, tint[y], { bare: true, glow: y > 1 ? '#E4ECF0' : null }));
    s.px(5, 4, '#F4F8FA', { bare: true, glow: '#E4ECF0' });
    return s.render();
}

/** One rotated, faceted star: front and back pyramids over a five-point rim, drawn far to near. */
function starGem(s, cx, cy, R, r, H, ang, m, g) {
    const c = Math.cos(ang);
    const sn = Math.sin(ang);
    const P = (x, y, z) => [x * c + z * sn, y, -x * sn + z * c]; // spin about the vertical axis
    const rim = [];
    for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r : R;
        rim.push([Math.cos(a) * rr, Math.sin(a) * rr, 0]);
    }
    const L3 = [-0.53, -0.7, 0.48];
    const tris = [];
    for (const apex of [
        [0, 0, H],
        [0, 0, -H]
    ])
        for (let i = 0; i < 10; i++) {
            const A = P(...apex);
            const B = P(...rim[i]);
            const C = P(...rim[(i + 1) % 10]);
            const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
            const v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
            let n = [
                u[1] * v[2] - u[2] * v[1],
                u[2] * v[0] - u[0] * v[2],
                u[0] * v[1] - u[1] * v[0]
            ];
            const l = Math.hypot(...n) || 1;
            n = n.map((q) => q / l);
            if (n[2] < 0) n = n.map((q) => -q);
            const depth = (A[2] + B[2] + C[2]) / 3;
            const d = Math.max(0, n[0] * L3[0] + n[1] * L3[1] + n[2] * L3[2]);
            tris.push({ pts: [A, B, C], depth, lum: 0.36 + 0.72 * d + Math.pow(d, 8) * 0.3 });
        }
    tris.sort((a, b) => a.depth - b.depth);
    for (const t of tris)
        s.poly(
            t.pts.map(([x, y]) => [cx + x, cy + y]),
            m,
            { lum: t.lum, g, glow: '#FFC53D' }
        );
}

/**
 * 11×12 CLOUT, the play-only currency: a faceted gold star gem (not a coin) that spins through front, 3/4,
 * edge-on and 3/4 again, 4 frames, with a glint on its face.
 */
export function cloutGem(f) {
    const s = new PixelSprite(11, 12);
    const ang = [0, 0.85, Math.PI / 2 - 0.12, Math.PI - 0.85][f % 4];
    starGem(s, 5.5, 6.3, 5.5, 2.3, 1.8, ang, L.clout, 'star');
    if (f % 4 === 0) sparkle(s, 3, 4, 1);
    else if (f % 4 === 1) s.px(4, 5, '#FFFFFF', { glow: '#FFFFFF' });
    else if (f % 4 === 2) s.px(5, 2, '#FFFFFF', { glow: '#FFFFFF' });
    return s.render();
}

/**
 * 13×13 Liquidity Sweep: a brick-red horseshoe magnet with bright steel poles and sparks crackling between them
 * (2 frames).
 */
export function magnet(f) {
    const s = new PixelSprite(13, 13);
    const cx = 6.5;
    const cy = 5.6;
    const Ro = 5.7;
    const Ri = 2.6;
    const red = [];
    const tips = [];
    for (let y = 0; y < 13; y++)
        for (let x = 0; x < 13; x++) {
            const px = x + 0.5;
            const py = y + 0.5;
            const dx = Math.abs(px - cx);
            const d = py < cy ? Math.hypot(px - cx, py - cy) : dx;
            if (d > Ro || d < Ri || py > 10.8) continue;
            (py < 7.6 ? red : tips).push([y, x, x]);
        }
    s.spans(red, L.brick, { g: 'u', bias: 0.08 });
    s.spans(tips, L.steel, { g: 'tips', bias: 0.3 });
    s.auto('u', { R: 1.6, grad: 0.3 });
    s.auto('tips', { R: 1.2, grad: 0.25 });
    // highlights on the bend and the poles
    s.px(3, 2, tone(L.brick, 5)).px(4, 1, tone(L.brick, 5)).px(2, 3, tone(L.brick, 4));
    s.px(2, 8, '#FFFFFF', { glow: '#E8FAFF' }).px(9, 8, tone(L.steel, 5));
    // sparks arcing across the gap between the poles
    const arc = f % 2 ? [10, 11, 10, 11, 10] : [11, 10, 11, 10, 11];
    arc.forEach((y, i) =>
        s.px(4 + i, y, i % 2 ? '#E8FAFF' : '#9BE2FF', { glow: '#6FD8FF', bare: true })
    );
    s.px(f % 2 ? 3 : 9, 12, '#9BE2FF', { glow: '#6FD8FF', bare: true });
    return s.render();
}

/**
 * 13×13 Trading Halt: an icy-blue stopwatch with a big pause sign on its frosted face, rime on the case and a
 * frost glint that moves (2 frames). Glows cyan.
 */
export function halt(f) {
    const s = new PixelSprite(13, 13);
    // the crown and the side button, behind the case
    s.box(5, 0, 3, 1.8, M.ice, { r: 0.5, bevel: 0.8 });
    s.line(6.5, 1.5, 6.5, 2.5, M.ice, { lum: 0.5 });
    s.capsule(10.4, 2.6, 11.4, 1.6, 0.9, 0.9, M.ice, { bias: -0.05 });
    // the case and the frosted face
    s.circle(6.5, 7.3, 5.5, M.ice, { glow: '#46B8F0', bias: 0.05 });
    s.circle(6.5, 7.3, 4.1, L.frost, { flat: 0.35, bias: 0.25, glow: f % 2 ? '#9BE2FF' : null });
    // the pause sign and the 12 o'clock tick
    for (const x of [4, 5, 7, 8])
        for (let y = 5; y <= 9; y++) s.px(x, y, x === 4 || x === 7 ? '#0E3D66' : '#1C5A8C');
    s.px(6, 3, '#46B8F0');
    // rime on the case and a moving glint
    s.pxs(
        [
            [2, 4],
            [3, 3],
            [4, 2]
        ],
        '#E8FAFF'
    );
    if (f % 2) sparkle(s, 3, 3, 1, '#FFFFFF', '#E8FAFF', '#9BE2FF');
    else s.px(10, 10, '#FFFFFF', { glow: '#9BE2FF' });
    return s.render();
}

/**
 * 15×13 Short Squeeze: a steel C-clamp screwed down on a red candle, the candle squashed flat with its face
 * screwed up (>_<), bulging out of the jaws, glowing hot where it bulges, sparks spitting from the pressure
 * (2 frames).
 */
export function squeeze(f) {
    const s = new PixelSprite(15, 13);
    const b = f % 2;
    // the C frame: a rounded block with the throat cut out, and the boss the screw runs through
    s.box(0, 2, 12, 11, L.steel, { r: 2.6, g: 'c' });
    s.cutBox(3, 4, 12, 7);
    s.box(8, 1, 3, 3.6, L.steel, { r: 0.8, g: 'c' });
    s.auto('c', { R: 1.1, grad: 0.35 });
    // the red candle, squashed flat and bulging past the jaws, its face screwed up: >_<
    s.box(5 - b, 4.5, 9 + 2 * b, 5.5, M.bear, { r: 1.6, bevel: 1.6, bias: 0.12 });
    s.pxs(
        [
            [7, 5],
            [8, 6],
            [7, 7],
            [11, 5],
            [10, 6],
            [11, 7]
        ],
        '#1A040C'
    );
    s.px(9, 8, '#6E0F2A');
    // the bulges glow hot from the pressure
    s.px(5 - b, 7, '#FF9A3A', { glow: '#FF7A1A' }).px(13 + b, 6, '#FF9A3A', { glow: '#FF7A1A' });
    // the screw, its pressure pad and the anvil under the candle, then the T-handle on top
    for (let y = 0; y <= 4; y++) s.px(9, y, y % 2 ? tone(L.steel, 5) : tone(L.steel, 3));
    s.box(7, 4, 5, 1, L.steel, { shade: 'flat', lum: 0.8 });
    s.box(7, 10, 5, 1, L.steel, { shade: 'flat', lum: 0.75 });
    s.box(6, 0, 7, 1.2, L.steel, { r: 0.5, bevel: 0.6, bias: 0.1 });
    // sparks spitting out of the sides
    const sp = b
        ? [
              [14, 6],
              [13, 10],
              [4, 5]
          ]
        : [
              [14, 9],
              [13, 5],
              [4, 10]
          ];
    for (const [x, y] of sp) s.px(x, y, '#FFE2B8', { glow: '#FF7A1A', bare: true });
    return s.render();
}

// ---------------------------------------------------------------- the boss chest

/** Deterministic hash of a few integers to [0, 1): wood grain. */
function hash(...n) {
    let h = 2166136261;
    for (const v of n) {
        h = Math.imul(h ^ (v | 0), 16777619);
        h ^= h >>> 13;
    }
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
}

/**
 * 25×20 treasure chest (a boss drop): a domed oak chest with gold straps and corners, a gold lock plate bearing
 * a green candle, and golden light leaking from the lid seam. The light pulses, a glint runs over the lid and
 * sparkles twinkle round it, 4 frames.
 */
export function chest(f) {
    const s = new PixelSprite(25, 20);
    const pulse = [0, 1, 2, 1][f % 4];
    // oak, painted row by row: the lid a dome brightest at its crown, the front darker, lit from the left
    const wood = [
        // [y, x0, x1, lum]
        [1, 4, 20, 0.9],
        [2, 2, 22, 0.84],
        [3, 1, 23, 0.74],
        [4, 1, 23, 0.26],
        [5, 1, 23, 0.64],
        [6, 1, 23, 0.56],
        [7, 1, 23, 0.32],
        [9, 2, 22, 0.5],
        [10, 2, 22, 0.48],
        [11, 2, 22, 0.46],
        [12, 2, 22, 0.2],
        [13, 2, 22, 0.44],
        [14, 2, 22, 0.42],
        [15, 2, 22, 0.18],
        [16, 2, 22, 0.4],
        [17, 2, 22, 0.36],
        [18, 2, 22, 0.2]
    ];
    for (const [y, x0, x1, lum] of wood)
        for (let x = x0; x <= x1; x++) {
            const edge = x === x0 ? 0.12 : x === x1 ? -0.24 : x === x1 - 1 ? -0.1 : 0;
            const grain = lum > 0.3 && hash(x >> 1, y, 7) > 0.84 ? 0.18 : 0;
            s.spans([[y, x, x]], L.oak, { g: 'oak', lum: lum + edge + grain - (x - x0) * 0.004 });
        }
    // gold straps over the lid and down the front, with rivets
    for (const x0 of [6, 17]) {
        for (const [y, , , lum] of wood) {
            s.spans([[y, x0, x0]], M.gold, { g: 'gold', lum: Math.max(0.42, lum + 0.18) });
            s.spans([[y, x0 + 1, x0 + 1]], M.gold, { g: 'gold', lum: Math.max(0.3, lum) });
        }
        for (const y of [2, 10, 16]) s.px(x0, y, '#FFF6D6');
    }
    // gold corner caps
    const gold = { a: '#FFE08A', b: '#FFC53D', c: '#C28100', d: '#7A4B00' };
    s.patch(1, 6, ['b.', 'cc'], gold, { line: '#221400' });
    s.patch(22, 6, ['.c', 'dd'], gold, { line: '#221400' });
    s.patch(2, 9, ['bb', 'c.'], gold, { line: '#221400' });
    s.patch(21, 9, ['cd', '.d'], gold, { line: '#221400' });
    s.patch(2, 17, ['c.', 'cc'], gold, { line: '#221400' });
    s.patch(21, 17, ['.d', 'dd'], gold, { line: '#221400' });
    // the light leaking from the seam, warming the wood above and below it
    const core = ['#FFE08A', '#FFF2C0', '#FFFFFF'][pulse];
    for (let x = 1; x <= 23; x++)
        s.px(x, 8, x < 2 || x > 22 ? '#FFC53D' : core, { glow: pulse > 1 ? '#FFE08A' : GOLD_GLOW });
    if (pulse) {
        s.px(0, 8, '#FFE08A', { glow: GOLD_GLOW, bare: true }).px(24, 8, '#FFE08A', {
            glow: GOLD_GLOW,
            bare: true
        });
        for (let x = 2; x <= 22; x++) {
            if (x === 6 || x === 7 || x === 17 || x === 18) continue;
            s.px(x, 9, pulse > 1 ? '#E8A048' : '#C07A36');
            if (pulse > 1 || x % 2) s.px(x, 7, '#A8662E');
        }
    }
    // the lock: a hasp from the lid down to a gold plate, a green candle glowing in its recess
    s.box(11, 5, 3, 4, M.gold, { r: 0.5, bevel: 0.8, bias: 0.1 });
    s.box(9, 9, 7, 7, M.gold, { r: 1, bevel: 1.4, bias: 0.05 });
    s.box(10, 10, 5, 5, M.goldDeep, { shade: 'flat', lum: 0.12 });
    const green = { w: '#7BF5A6', h: '#D8FFD0', l: '#7BF5A6', g: '#16E08A', d: '#0E9A64' };
    s.patch(11, 10, ['.w.', 'hgd', 'lgd', 'lgd', '.w.'], green, { glow: '#16E08A' });
    // a glint that runs over the lid, and sparkles twinkling round the chest
    s.px(4 + (f % 4) * 5, 2, '#FFFFFF', { glow: '#FFF6D6' });
    if (f % 2) sparkle(s, f % 4 === 1 ? 1 : 23, 1, 1);
    return s.render();
}
