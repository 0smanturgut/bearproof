// Scenery for the trap map, drawn with the pixel-art engine (art/pixel.js). See art/props.js for the format.
//
// Bear Trap is the financial district the night after the crash: cracked asphalt, broken brick walls with
// graffiti, toppled stock-exchange columns, burning barrels, sodium street lamps, a fallen ticker board still
// flashing red, and real steel bear traps in the street. Big surfaces stay dusty and desaturated (brick, grey
// stone, rust) so the red enemies always read on top; the enemy red only shows up as small glowing accents.

import { PixelSprite, mat } from '../pixel.js';
import { M } from '../materials.js';

// ---------------------------------------------------------------- materials (six tones, cool shadows, warm lights)

const T = {
    brick: mat(['#1D1618', '#362628', '#503837', '#694C45', '#836358', '#9C7D6D'], {
        line: '#100B0D'
    }),
    // the dusty tops of broken walls: the same brick, lighter and greyer where the dust settles
    cap: mat(['#3B302F', '#594844', '#766259', '#8F7B6E', '#A69283', '#BBA897'], {
        line: '#100B0D'
    }),
    concrete: mat(['#1C1E24', '#2F3239', '#464950', '#5F6167', '#7C7C7C', '#9C998F'], {
        line: '#0D0E11'
    }),
    marble: mat(['#272932', '#43464F', '#636671', '#86878D', '#A7A49D', '#C4BFB2'], {
        line: '#121318'
    }),
    iron: mat(['#0B0E11', '#161B1F', '#232A2F', '#343D42', '#4E585B', '#737C7A'], {
        line: '#05070A'
    }),
    rust: mat(['#1C110E', '#382017', '#563020', '#78482C', '#986540', '#B7875E'], {
        line: '#0E0806'
    }),
    steel: mat(['#15191F', '#2A3039', '#454E59', '#6B7682', '#9DA6B0', '#D6DCE2'], {
        line: '#0A0C10'
    }),
    burnt: mat(['#0D0D10', '#18181C', '#252428', '#363234', '#4C4441', '#665B53'], {
        line: '#060608'
    }),
    rubber: mat(['#09090B', '#111216', '#1A1C21', '#25282E', '#33363D', '#464A51'], {
        line: '#050506'
    }),
    cardboard: mat(['#211710', '#3D2C1C', '#5C442C', '#7B5E3D', '#997A51', '#B6996C'], {
        line: '#120C07'
    }),
    bin: mat(['#0A1411', '#12221C', '#1B3329', '#264638', '#365C4B', '#4F7664'], {
        line: '#050A08'
    }),
    safety: mat(['#2A140A', '#52260F', '#7A3B17', '#9C5323', '#B86E36', '#D08C52'], {
        line: '#160A04'
    }),
    paint: mat(['#34363C', '#55575D', '#7A7B7E', '#9C9B98', '#BAB6AE', '#D4CEC2'], {
        line: '#18191D'
    }),
    ochre: mat(['#241B0A', '#433212', '#664D1F', '#8A6A2D', '#AA8841', '#C6A660'], {
        line: '#130E05'
    }),
    navy: mat(['#0C131E', '#152236', '#20334C', '#2E4666', '#425E80', '#617C9C'], {
        line: '#060A10'
    }),
    plank: mat(['#19130E', '#2F251B', '#483929', '#634E39', '#80684D', '#9C8464'], {
        line: '#0D0906'
    }),
    plastic: mat(['#0A0B0E', '#14161B', '#1E2127', '#2A2E35', '#3A3F47', '#525861'], {
        line: '#050607'
    }),
    drum: mat(['#101317', '#1B2128', '#28303A', '#38434E', '#4E5B66', '#6B7882'], {
        line: '#07090B'
    }),
    redGlass: mat(['#4A0A16', '#7A1024', '#B81E40', '#FF3B5C', '#FF8A96', '#FFD2D6'], {
        line: '#1A040C',
        glow: '#FF3B5C'
    }),
    sheet: mat(['#3E4047', '#5E6169', '#80838A', '#A3A4A6', '#BEBCB6', '#D6D2C8'], {
        line: '#1A1B20'
    }),
    // emissive: sodium glass, fire and the red LEDs
    sodium: mat(['#B85A1E', '#E0802E', '#FFA552', '#FFC27E', '#FFDDB0', '#FFF2DC'], {
        line: '#2A1406',
        glow: '#FFAA5A'
    }),
    flame: mat(['#7A2208', '#B8420E', '#F06A18', '#FF9A3A', '#FFC46E', '#FFEDBC'], {
        line: '#2A0E04',
        glow: '#FF8C3C'
    })
};

// Single colours for hand-placed details
const RED = '#FF3B5C';
const RED_HOT = '#FF8A96';
const SPRAY = { pink: '#C98393', cyan: '#5EB2BE', white: '#CFCABE' };

// ---------------------------------------------------------------- helpers

/** Deterministic hash of a few integers to [0, 1): the irregularity of every brick, crack and chip. */
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

/** The ramp tone for a brightness `t` (0..5), clamped. */
const tone = (m, t) => m.ramp[Math.max(0, Math.min(m.ramp.length - 1, Math.round(t)))];

/** One hand-placed pixel that outlines in `m`'s line colour (instead of ink). */
const dot = (s, x, y, hex, m, o = {}) => s.px(x, y, hex, { line: m.line, ...o });

// A tiny variable-width 3×5 font for spray paint, signs and LED boards ('v' is a filled down-arrow).
const FONT = {
    A: ['.X.', 'X.X', 'XXX', 'X.X', 'X.X'],
    B: ['XX.', 'X.X', 'XX.', 'X.X', 'XX.'],
    C: ['.XX', 'X..', 'X..', 'X..', '.XX'],
    D: ['XX.', 'X.X', 'X.X', 'X.X', 'XX.'],
    E: ['XXX', 'X..', 'XX.', 'X..', 'XXX'],
    G: ['.XX', 'X..', 'X.X', 'X.X', '.XX'],
    H: ['X.X', 'X.X', 'XXX', 'X.X', 'X.X'],
    I: ['XXX', '.X.', '.X.', '.X.', 'XXX'],
    K: ['X.X', 'X.X', 'XX.', 'X.X', 'X.X'],
    L: ['X..', 'X..', 'X..', 'X..', 'XXX'],
    M: ['X...X', 'XX.XX', 'X.X.X', 'X...X', 'X...X'],
    N: ['X..X', 'XX.X', 'X.XX', 'X..X', 'X..X'],
    O: ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'],
    P: ['XX.', 'X.X', 'XX.', 'X..', 'X..'],
    R: ['XX.', 'X.X', 'XX.', 'XX.', 'X.X'],
    S: ['.XX', 'X..', '.X.', '..X', 'XX.'],
    T: ['XXX', '.X.', '.X.', '.X.', '.X.'],
    U: ['X.X', 'X.X', 'X.X', 'X.X', 'XXX'],
    W: ['X...X', 'X...X', 'X.X.X', 'XX.XX', 'X...X'],
    0: ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'],
    1: ['.X', 'XX', '.X', '.X', '.X'],
    2: ['XX.', '..X', '.X.', 'X..', 'XXX'],
    3: ['XX.', '..X', '.X.', '..X', 'XX.'],
    4: ['X.X', 'X.X', 'XXX', '..X', '..X'],
    5: ['XXX', 'X..', 'XX.', '..X', 'XX.'],
    6: ['.XX', 'X..', 'XXX', 'X.X', 'XXX'],
    7: ['XXX', '..X', '.X.', '.X.', '.X.'],
    8: ['XXX', 'X.X', 'XXX', 'X.X', 'XXX'],
    9: ['XXX', 'X.X', 'XXX', '..X', 'XX.'],
    '-': ['...', '...', 'XXX', '...', '...'],
    '%': ['X.X', '..X', '.X.', 'X..', 'X.X'],
    '?': ['XX.', '..X', '.X.', '...', '.X.'],
    '!': ['X', 'X', 'X', '.', 'X'],
    '.': ['.', '.', '.', '.', 'X'],
    ' ': ['.', '.', '.', '.', '.'],
    v: ['.....', 'XXXXX', '.XXX.', '..X..', '.....']
};

/** Pixel width of `str` in the 3×5 font (1 px between glyphs). */
const textWidth = (str) => [...str].reduce((w, ch) => w + FONT[ch][0].length + 1, -1);

/**
 * Write `str` at (x, y) with the 3×5 font. `put(x, y, glyphIndex)` paints one lit pixel; `jitter` (a seed)
 * bobs each glyph up or down a pixel, like a hand with a spray can.
 */
function text(x, y, str, put, { jitter = null } = {}) {
    let cx = x;
    [...str].forEach((ch, i) => {
        const g = FONT[ch];
        const dy = jitter === null ? 0 : hash(jitter, i) < 0.3 ? -1 : hash(jitter, i) > 0.8 ? 1 : 0;
        g.forEach((row, ry) => {
            for (let rx = 0; rx < row.length; rx++)
                if (row[rx] === 'X') put(cx + rx, y + ry + dy, i);
        });
        cx += g[0].length + 1;
    });
    return cx - 1;
}

/** Smooth value noise in [0, 1) over a grid of `cell` px: rust blotches, soot, oil sheen. */
function noise(x, y, seed, cell = 4) {
    const gx = Math.floor(x / cell);
    const gy = Math.floor(y / cell);
    const fx = x / cell - gx;
    const fy = y / cell - gy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = hash(seed, gx, gy);
    const b = hash(seed, gx + 1, gy);
    const c = hash(seed, gx, gy + 1);
    const d = hash(seed, gx + 1, gy + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Switch the material of pixels already placed (keeping their light) where `pred(x, y)`: rust, soot. */
function repaint(s, m, pred) {
    for (let i = 0; i < s.mat.length; i++)
        if (s.mat[i] && !s.color[i] && pred(i % s.w, (i / s.w) | 0)) s.mat[i] = m;
}

/** A lit chunk of stone or brick: a small polygon shaded as one volume (its own auto group). */
let chunkId = 0;
function chunk(s, pts, m, { R = 1.4, grad = 0.35, bias = 0 } = {}) {
    const g = `chunk${chunkId++}`;
    s.poly(pts, m, { g, bias });
    s.auto(g, { R, grad });
}

/** A loose brick lying on the ground (w×2 front face under a 1-px top). */
function looseBrick(s, x, y, w = 4, m = T.brick) {
    for (let i = 0; i < w; i++) {
        dot(s, x + i, y, tone(m, i === 0 ? 5 : 4), m);
        dot(s, x + i, y + 1, tone(m, i === w - 1 ? 2 : 3), m);
        dot(s, x + i, y + 2, tone(m, i === w - 1 ? 1 : 2), m);
    }
}

// ---------------------------------------------------------------- brick walls (a tiny voxel renderer)
//
// The walls are heightmaps rendered in the game's ¾ view: a cell (x, y) of height z draws its top cap
// y - z rows up the screen, its south face below that, and every 6 px of height lean 1 px to the right, so
// a sliver of each wall's west face shows too. One renderer for the straight, side and corner pieces keeps
// their height, thickness and bricks identical. Bricks are 6 px long and 3 px a course (2 brick rows over a
// mortar row), staggered by half a brick per course.

const COURSE = 3;
const BRICK = 6;
const lean = (z) => Math.floor(z / 6);

/**
 * Ray-cast the heightmap `hAt(x, y)` into sprite `s` with its world origin at screen (ox, oy), and paint
 * every visible face with `paint(face, cell)` ('top' | 'south' | 'west'). Returns the face of each pixel.
 */
function voxels(s, { ox, oy, hAt, paint, zmax = 24, m = T.brick }) {
    const faces = new Array(s.w * s.h).fill(null);
    const memo = new Map();
    const H = (x, y) => {
        const k = x * 1000 + y;
        if (!memo.has(k)) memo.set(k, hAt(x, y));
        return memo.get(k);
    };
    for (let sy = 0; sy < s.h; sy++)
        for (let sx = 0; sx < s.w; sx++) {
            let p = null;
            for (let t = zmax; t >= 0; t -= 0.125) {
                const zi = Math.floor(t);
                const xi = Math.floor(sx + 0.5 - ox - lean(zi));
                const yi = Math.floor(sy + 0.5 - oy + t);
                const h = H(xi, yi);
                if (zi < h) {
                    let face = 'south';
                    if (!p || (p[2] !== zi && h <= p[2])) face = 'top';
                    else if (p[0] !== xi && H(p[0], yi) <= zi) face = 'west';
                    const c = paint(face, { x: xi, y: yi, z: zi, h, H });
                    if (c) {
                        dot(s, sx, sy, c, m);
                        faces[sy * s.w + sx] = face;
                    }
                    break;
                }
                p = [xi, yi, zi];
            }
        }
    return faces;
}

/**
 * The brick look shared by every wall. `axis` says which way the wall runs at a cell ('x' east-west, 'y'
 * north-south) so the cap's joints cross it; `seed` varies the bricks; `holes` is the chance a face brick
 * is missing. Rubble lying on a cap (above `struct`, the masonry height) gets a dusty concrete tone.
 */
function brickPainter({ seed, axis, struct, holes = 0.06 }) {
    return (face, { x, y, z, h, H }) => {
        const k = Math.floor(z / COURSE);
        const r = z % COURSE; // 0 = mortar row, 1 = lower brick row, 2 = upper brick row
        if (z >= struct(x, y)) {
            // loose rubble on the cap
            const c = hash(seed, x, y, 7) < 0.5 ? T.concrete : T.brick;
            return tone(c, face === 'top' ? 4.4 : face === 'west' ? 3.4 : 2);
        }
        if (face === 'top') {
            // the cap: two rows of bricks laid along the wall, cross joints staggered between them
            const ax = axis(x, y);
            const run = ax === 'x' ? x : y;
            const across = ax === 'x' ? y : x;
            const kk = Math.floor((h - 1) / COURSE);
            const wy = across >= 2 ? 1 : 0;
            const u = run + ((kk + wy) % 2) * 3 + seed;
            let t = 3 + (hash(seed, Math.floor(u / BRICK), kk, wy) < 0.2 ? -0.6 : 0);
            if (u % BRICK === 0) t = 2;
            if (H(x, y + 1) < h || H(x - 1, y) < h)
                t = 4; // the lit front and west edges
            else if (H(x, y - 1) < h || H(x + 1, y) < h) t = Math.min(t, 2);
            return tone(T.cap, t);
        }
        if (face === 'west') {
            const u = y + (Math.floor(z / 6) % 2) * 3 + seed;
            if (u % BRICK === 0) return tone(T.brick, 1.6);
            return tone(T.brick, 3.4 + (z >= 12 ? 0.3 : 0) - (z < 6 ? 0.5 : 0));
        }
        // south face
        if (r === 0) return tone(T.brick, z === 0 ? 0 : 1);
        const u = x + (k % 2) * 3 + seed;
        if (u % BRICK === 0) return tone(T.brick, 1);
        const b = Math.floor(u / BRICK);
        const top = Math.floor((h - 1) / COURSE);
        if (k > 0 && k < top && hash(seed, b, k, 99) < holes)
            return tone(T.brick, r === 2 ? 0 : 0.6);
        const v = hash(seed, b, k);
        let t = 2.15 + (v < 0.15 ? -0.8 : v > 0.85 ? 0.7 : 0) + (r === 2 ? 0.75 : 0);
        if (z < 3) t -= 0.45; // grime at the foot
        if (u % BRICK === BRICK - 1 && r === 1) t -= 0.6; // each brick's lower right corner in shade
        return tone(T.brick, t);
    };
}

/**
 * A ruined wall's height at a cell: `courses` full courses, then the next course only where its brick
 * survived (per wythe: the back and front halves of the wall crumble separately), plus rubble on the cap.
 * `run` is the coordinate along the wall and `across` the one through it (0..thickness-1).
 */
function ruinHeight(seed, courses, run, across, { keep = 0.36, rubble = 0.05, chip = 0.18 } = {}) {
    const n = courses;
    if (n <= 0) return { h: 0, struct: 0 };
    const wythe = across >= 2 ? 1 : 0;
    const brickAt = (k) => Math.floor((run + (k % 2) * 3 + seed) / BRICK);
    let c = n;
    if (hash(seed, brickAt(n), n, wythe, 3) < keep)
        c = n + 1; // a surviving brick of the broken course
    else if (wythe === 1 && n > 1 && hash(seed, brickAt(n - 1), n - 1, 5) < chip) c = n - 1; // front chipped
    const struct = c * COURSE;
    const bump = hash(seed, run, across, 11) < rubble ? 1 + (hash(seed, run, across, 13) < 0.3) : 0;
    return { h: struct + bump, struct };
}

/** Courses at position `p` from a list of [from, courses] steps. */
const steps = (list, p) => {
    let n = 0;
    for (const [from, c] of list) if (p >= from) n = c;
    return n;
};

/** Spray-paint a word on a wall's south face (only on face pixels), with a drip or two. */
function graffiti(s, faces, x, y, word, color, seed) {
    const on = (px, py) => faces[py * s.w + px] === 'south';
    text(
        x,
        y,
        word,
        (px, py) => {
            if (!on(px, py)) return;
            dot(s, px, py, color, T.brick);
        },
        { jitter: seed }
    );
    // one drip, running down from the bottom of a letter
    const dx = x + 1 + Math.floor(hash(seed, 1) * (textWidth(word) - 2));
    for (let dy = y + 4; dy < y + 9; dy++) {
        if (s.color[dy * s.w + dx] === color) continue;
        if (s.color[(dy - 1) * s.w + dx] !== color) break;
        if (on(dx, dy)) dot(s, dx, dy, color, T.brick);
        if (on(dx, dy + 1) && hash(seed, 2) < 0.6) dot(s, dx, dy + 1, color, T.brick);
        break;
    }
}

/** A crack in masonry: a dark zig-zag of pixels, only over face pixels. */
function crack(s, faces, pts, hex = '#1E1517') {
    for (const [x, y] of pts) if (faces[y * s.w + x]) dot(s, x, y, hex, T.brick);
}

/**
 * 56×28 broken brick wall, east-west: a jagged run of brick five courses high at its best, a deep break in
 * the middle with the bricks spilled in front of it, holes where bricks fell out, and REKT sprayed across it.
 */
function wallA() {
    const s = new PixelSprite(56, 28);
    const seed = 3;
    const prof = [
        [0, 2],
        [4, 4],
        [10, 5],
        [22, 3],
        [26, 1],
        [32, 3],
        [37, 5],
        [47, 3]
    ];
    const cell = (x, y) => {
        if (x < 0 || x > 52 || y < 0 || y > 4) return { h: 0, struct: 0 };
        return ruinHeight(seed, steps(prof, x), x, y);
    };
    const faces = voxels(s, {
        ox: 1,
        oy: 19,
        hAt: (x, y) => cell(x, y).h,
        paint: brickPainter({ seed, axis: () => 'x', struct: (x, y) => cell(x, y).struct })
    });
    graffiti(s, faces, 8, 13, 'REKT', SPRAY.pink, 21);
    crack(s, faces, [
        [41, 12],
        [42, 13],
        [42, 14],
        [43, 15],
        [43, 16],
        [44, 17]
    ]);
    // rubble spilled through the break and at the ends
    chunk(
        s,
        [
            [24, 22],
            [27, 19.5],
            [31, 20],
            [33, 23],
            [30, 25.5],
            [25, 25.5]
        ],
        T.concrete
    );
    looseBrick(s, 30, 22);
    looseBrick(s, 20, 23, 4);
    chunk(
        s,
        [
            [34, 23],
            [36.5, 21.5],
            [38.5, 23.5],
            [36, 25.5]
        ],
        T.brick
    );
    chunk(
        s,
        [
            [0, 22],
            [2.5, 20.5],
            [5, 22.5],
            [3, 25]
        ],
        T.concrete
    );
    looseBrick(s, 48, 23, 3);
    chunk(
        s,
        [
            [51, 23],
            [53.5, 21.5],
            [55.5, 24],
            [53, 25.5]
        ],
        T.brick
    );
    return s.render();
}

/** 40×20 crumbling wall stub, east-west: three or four courses with NGMI sprayed on it in cyan. */
function wallB() {
    const s = new PixelSprite(40, 20);
    const seed = 8;
    const prof = [
        [0, 1],
        [4, 3],
        [14, 4],
        [26, 2],
        [32, 1]
    ];
    const cell = (x, y) => {
        if (x < 0 || x > 35 || y < 0 || y > 4) return { h: 0, struct: 0 };
        const n = steps(prof, x);
        return ruinHeight(seed, n, x, y, { keep: n >= 4 ? 0 : 0.42 });
    };
    const faces = voxels(s, {
        ox: 1,
        oy: 12,
        hAt: (x, y) => cell(x, y).h,
        paint: brickPainter({ seed, axis: () => 'x', struct: (x, y) => cell(x, y).struct })
    });
    graffiti(s, faces, 9, 8, 'NGMI', SPRAY.cyan, 5);
    chunk(
        s,
        [
            [30, 15],
            [33, 13],
            [36.5, 14.5],
            [35, 17.5],
            [31, 17.5]
        ],
        T.concrete
    );
    looseBrick(s, 36, 16, 3);
    looseBrick(s, 1, 16, 3);
    return s.render();
}

/**
 * 14×44 broken brick wall running north-south (away from the camera): mostly its cap, littered with
 * broken bricks, a sliver of its sunlit west face, and its south end face at the bottom. The same wall as
 * trap_wall_a seen from the end, for the sides of ruined buildings.
 */
function wallSide() {
    const s = new PixelSprite(14, 44);
    const seed = 5;
    const prof = [
        [0, 2],
        [4, 5],
        [13, 3],
        [18, 5],
        [28, 4]
    ];
    const cell = (x, y) => {
        if (x < 0 || x > 4 || y < 0 || y > 30) return { h: 0, struct: 0 };
        return ruinHeight(seed, steps(prof, y), y, x, { keep: 0.22, rubble: 0.05, chip: 0 });
    };
    voxels(s, {
        ox: 3,
        oy: 10,
        hAt: (x, y) => cell(x, y).h,
        paint: brickPainter({ seed, axis: () => 'y', struct: (x, y) => cell(x, y).struct })
    });
    looseBrick(s, 9, 26, 3);
    chunk(
        s,
        [
            [0, 36],
            [2, 34.5],
            [4, 36.5],
            [2.5, 38.5]
        ],
        T.concrete
    );
    looseBrick(s, 8, 39, 4);
    chunk(
        s,
        [
            [10, 12],
            [12, 10.5],
            [13.5, 12.5],
            [11.5, 14]
        ],
        T.brick
    );
    return s.render();
}

/**
 * 44×36 broken corner of a building (its south-west corner): a front wall running east and a side wall
 * running north meet in a sturdy corner at full height, and both crumble away from it.
 */
function wallCorner() {
    const s = new PixelSprite(44, 36);
    const seed = 11;
    const front = [
        [0, 5],
        [19, 4],
        [26, 3],
        [32, 2],
        [36, 1]
    ];
    const cell = (x, y) => {
        if (y >= 11 && y <= 15 && x >= 0 && x <= 38)
            return ruinHeight(seed, steps(front, x), x, y - 11);
        if (y >= 0 && y < 11 && x >= 0 && x <= 4)
            return ruinHeight(seed, y < 2 ? 4 : 5, y, x, { keep: 0.25, chip: 0 });
        return { h: 0, struct: 0 };
    };
    const faces = voxels(s, {
        ox: 1,
        oy: 15,
        hAt: (x, y) => cell(x, y).h,
        paint: brickPainter({
            seed,
            axis: (x, y) => (y >= 11 ? 'x' : 'y'),
            struct: (x, y) => cell(x, y).struct
        })
    });
    graffiti(s, faces, 6, 20, 'HODL', SPRAY.white, 9);
    looseBrick(s, 24, 30, 4);
    chunk(
        s,
        [
            [29, 30],
            [32, 27.5],
            [36, 29],
            [34, 32],
            [30, 32.5]
        ],
        T.concrete
    );
    looseBrick(s, 39, 29, 3);
    chunk(
        s,
        [
            [10, 6],
            [12, 4.5],
            [14, 6.5],
            [12, 8]
        ],
        T.brick
    );
    looseBrick(s, 0, 31, 3);
    return s.render();
}

// ---------------------------------------------------------------- the exchange: columns

/** Flute a vertical column: darken a groove every 3 px (and light its right lip) between rows y0..y1. */
function flutes(s, x0, x1, y0, y1, k = 0) {
    s.tone(-0.2, (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1 && (x - x0 + k) % 3 === 1);
    s.tone(0.08, (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1 && (x - x0 + k) % 3 === 2);
}

/**
 * 18×44 broken stock-exchange column: a fluted marble shaft snapped off in a jagged break, standing on a
 * square plinth with a round moulding, a crack running down from the break and a fragment on the plinth.
 */
function pillar() {
    const s = new PixelSprite(18, 44);
    // plinth: lit top face, shaded front face, chipped corners
    s.poly(
        [
            [0.5, 35],
            [17.5, 35],
            [17.5, 38],
            [0.5, 38]
        ],
        T.marble,
        { left: 0.92, right: 0.7 }
    );
    s.poly(
        [
            [0.5, 38],
            [17.5, 38],
            [17.5, 43.5],
            [0.5, 43.5]
        ],
        T.marble,
        { left: 0.52, right: 0.3 }
    );
    s.cutBox(0, 43, 2, 1).cutBox(16, 35, 2, 1);
    for (let x = 1; x < 17; x++) dot(s, x, 38, tone(T.marble, x < 9 ? 5 : 4), T.marble);
    // the shaft: a lit cylinder, fluted, snapped off at the top
    s.capsule(9, 2, 9, 40, 6, 6, T.marble, { amb: 0.24 });
    const top = [9, 8, 6, 5, 6, 8, 9, 10, 12, 11, 13, 14];
    for (let i = 0; i < 12; i++) s.cutBox(3 + i, 0, 1, top[i] + 1);
    s.cutBox(0, 0, 3, 35).cutBox(15, 0, 3, 35);
    flutes(s, 3, 14, 0, 34);
    // the moulding at the foot of the shaft
    s.capsule(3, 34.5, 15, 34.5, 1.6, 1.6, T.marble, { amb: 0.3 });
    // the break: a rough, sunlit fracture surface on top of the shaft
    for (let i = 0; i < 12; i++) {
        const x = 3 + i;
        const y = top[i] + 1;
        dot(s, x, y, tone(T.marble, hash(4, x) < 0.25 ? 3 : i < 6 ? 5 : 4), T.marble);
        dot(s, x, y + 1, tone(T.marble, hash(5, x) < 0.3 ? 4 : 3), T.marble);
        dot(s, x, y + 2, tone(T.marble, 1), T.marble);
    }
    // a crack from the break down the lit side, and grime at the foot
    for (const [x, y] of [
        [6, 9],
        [6, 10],
        [7, 11],
        [7, 12],
        [6, 13],
        [6, 14],
        [7, 15],
        [8, 16],
        [8, 17]
    ])
        dot(s, x, y, tone(T.marble, 1), T.marble);
    s.tone(-0.12, (x, y) => y >= 30 && y < 34 && x > 2 && x < 15);
    chunk(
        s,
        [
            [12, 37],
            [14, 35.5],
            [16.5, 36.5],
            [15, 38]
        ],
        T.marble,
        { bias: 0.1 }
    );
    return s.render();
}

/**
 * 46×18 toppled column: a fluted marble drum lying on its side, its cut end towards the camera's left and
 * its broken end jagged, with the broken scroll capital that fell beside it and a few chips.
 */
function pillarFallen() {
    const s = new PixelSprite(46, 18);
    // the drum: a horizontal cylinder lit from above, fluted along its length
    s.capsule(4, 9, 30, 9, 6, 6, T.marble, { amb: 0.22 });
    s.cutBox(0, 0, 4, 18);
    const brk = [0, 2, 1, 3, 5, 4, 6, 7, 6, 8, 9, 10];
    for (let i = 0; i < 12; i++) s.cutBox(31 - (brk[i] % 4), 3 + i, 6, 1);
    s.tone(-0.2, (x, y) => x > 4 && x < 31 && (y - 3) % 3 === 1);
    s.tone(0.08, (x, y) => x > 4 && x < 31 && (y - 3) % 3 === 2);
    // the cut end: a flat disc seen almost edge-on
    s.ellipse(4.5, 9, 2.6, 6, T.marble, { shade: 'flat', lum: 0.78 });
    s.ellipse(4.5, 9, 1.4, 3.6, T.marble, { shade: 'flat', lum: 0.66 });
    s.px(4, 6, tone(T.marble, 5)).px(3, 8, tone(T.marble, 5));
    // fracture surface along the broken end
    for (let i = 0; i < 12; i++) {
        const x = 30 - (brk[i] % 4);
        dot(s, x, 3 + i, tone(T.marble, i < 5 ? 5 : 4), T.marble);
    }
    // the capital, upright where it fell: a square slab on a round cushion on a stub of fluted shaft
    s.capsule(38.5, 11, 38.5, 15, 4.4, 4.4, T.marble, { amb: 0.22 });
    s.cutBox(30, 15, 16, 4);
    for (const [x, y] of [
        [35, 15],
        [36, 15],
        [40, 15],
        [41, 15],
        [42, 14]
    ])
        s.cutBox(x, y, 1, 1);
    flutes(s, 34, 42, 11, 15, 1);
    s.ellipse(38.5, 9.5, 6.4, 2.2, T.marble, { amb: 0.25, bias: 0.05 });
    s.poly(
        [
            [31.5, 4],
            [45.5, 4],
            [45.5, 6.5],
            [31.5, 6.5]
        ],
        T.marble,
        { left: 0.95, right: 0.74 }
    );
    s.poly(
        [
            [31.5, 6.5],
            [45.5, 6.5],
            [45.5, 8.5],
            [31.5, 8.5]
        ],
        T.marble,
        { left: 0.48, right: 0.3 }
    );
    s.cutBox(44, 4, 2, 1);
    s.px(37, 6, tone(T.marble, 2)).px(38, 7, tone(T.marble, 1)).px(38, 8, tone(T.marble, 1));
    // chips in the dust
    chunk(
        s,
        [
            [24, 15],
            [26, 14],
            [28, 15.5],
            [26, 17]
        ],
        T.marble
    );
    s.px(1, 15, tone(T.marble, 3), { line: T.marble.line }).px(21, 16, tone(T.marble, 4), {
        line: T.marble.line
    });
    return s.render();
}

// ---------------------------------------------------------------- street lights

/** The lantern head of a street lamp, centred on (cx, cy), rotated by `a` radians. */
function lantern(s, cx, cy, a, { on = 1, broken = false } = {}) {
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const P = (x, y) => [cx + x * c - y * sn, cy + x * sn + y * c];
    const glass = on > 0.6 ? 0.62 : on > 0.2 ? 0.25 : 0;
    // roof, glass, collar
    s.poly([P(-1, -9), P(1, -9), P(6, -5), P(-6, -5)], T.iron, { g: 'roof' });
    s.auto('roof', { R: 1.2, grad: 0.4 });
    s.poly([P(-4.5, -5), P(4.5, -5), P(3.5, 4), P(-3.5, 4)], on ? T.sodium : T.plastic, {
        lum: on ? glass : 0.35,
        glow: on > 0.2 ? '#FFAA5A' : null
    });
    if (broken)
        s.poly([P(0.5, -5), P(4.5, -5), P(4, -1), P(2, 0.5)], T.plastic, { lum: on ? 0.15 : 0.1 });
    s.poly([P(-4, 4), P(4, 4), P(2.5, 6.5), P(-2.5, 6.5)], T.iron, { g: 'collar' });
    s.auto('collar', { R: 1, grad: 0.4 });
    // the frame: corner posts and a middle mullion
    s.line(...P(-4.5, -5), ...P(-3.5, 4), T.iron, { lum: 0.55 });
    s.line(...P(4.5, -5), ...P(3.5, 4), T.iron, { lum: 0.25 });
    s.line(...P(0, -5), ...P(0, 4), T.iron, { lum: 0.4 });
    // the bulb and the finial
    if (on > 0.2) {
        const [bx, by] = P(-1.5, -1);
        s.px(bx, by, on > 0.6 ? '#FFF2DC' : '#FFC27E', { glow: '#FFDDB0' });
        s.px(bx, by + 1, '#FFDDB0', { glow: '#FFAA5A' });
    }
    const [fx, fy] = P(0, -10);
    s.circle(fx, fy, 1.1, T.iron, { bias: 0.1 });
}

/** The cast-iron foot and pole of a street lamp, standing at x = cx, the pole up to row `top`. */
function lampPost(s, cx, top, base) {
    s.poly(
        [
            [cx - 5, base],
            [cx + 5, base],
            [cx + 4, base - 3],
            [cx + 2.5, base - 6],
            [cx + 1.5, base - 12],
            [cx - 1.5, base - 12],
            [cx - 2.5, base - 6],
            [cx - 4, base - 3]
        ],
        T.iron,
        { g: 'foot' }
    );
    s.auto('foot', { R: 2, grad: 0.4 });
    s.box(cx - 5.5, base - 1, 11, 2.5, T.iron, { r: 0.5, bevel: 1, lum: 0.4 });
    s.capsule(cx, base - 12, cx, top, 1.3, 1.1, T.iron, { amb: 0.2 });
    s.capsule(cx - 2, base - 23, cx + 2, base - 23, 0.9, 0.9, T.iron);
    s.px(cx - 1, base - 9, tone(T.iron, 5)).px(cx - 3, base - 3, tone(T.iron, 5));
}

/** 16×58 cast-iron street lamp with a lantern head of warm sodium glass. */
function lamp() {
    const s = new PixelSprite(16, 58);
    lampPost(s, 8, 16, 56);
    lantern(s, 8, 10, 0);
    return s.render();
}

/**
 * 22×54 street lamp knocked crooked: its pole bent half way up, the lantern hanging at an angle with one
 * pane smashed, the bulb flickering (on, off, dim, on).
 */
function lampBroken(f) {
    const s = new PixelSprite(22, 54);
    lampPost(s, 7, 30, 52);
    s.capsule(7, 30, 14, 15, 1.1, 1.1, T.iron, { amb: 0.2 });
    s.circle(7, 30, 1.4, T.iron);
    lantern(s, 15.5, 10, 0.42, { on: [1, 0, 0.4, 1][f % 4], broken: true });
    // a shard of glass on the ground and a flake of paint off the pole
    s.px(13, 51, tone(T.sodium, 3), { line: T.iron.line });
    s.px(8, 37, tone(T.rust, 4));
    return s.render();
}

// ---------------------------------------------------------------- fire

/**
 * Flames rising from (cx, y): tongues that sway and change height through 4 frames, a white-gold core,
 * and two embers drifting up.
 */
function flames(s, cx, y, f, w = 5) {
    const ph = (f % 4) * 1.57;
    const tongues = [
        [-w * 0.55, 5.5, 0],
        [w * 0.5, 6.5, 1.7],
        [-w * 0.1, 9, 3.1],
        [w * 0.15, 7, 4.4]
    ];
    for (const [dx, hgt, p] of tongues) {
        const hh = hgt + Math.sin(ph + p) * 1.6;
        const sway = Math.sin(ph * 1 + p * 2) * 1.2;
        s.capsule(cx + dx, y, cx + dx + sway, y - hh, 1.9, 0.4, T.flame, {
            shade: 'flat',
            lum: 0.42,
            bare: true
        });
    }
    for (const [dx, hgt, p] of tongues.slice(1, 3)) {
        const hh = (hgt + Math.sin(ph + p) * 1.6) * 0.6;
        s.capsule(
            cx + dx * 0.5,
            y,
            cx + dx * 0.5 + Math.sin(ph + p * 2),
            y - hh,
            1.3,
            0.3,
            T.flame,
            {
                shade: 'flat',
                lum: 0.75,
                bare: true
            }
        );
    }
    s.line(cx - 1, y, cx + 1, y, T.flame, { lum: 1, bare: true });
    // embers
    const e = [
        [cx - 2, y - 11 - (f % 4)],
        [cx + 2 + (f % 2), y - 8 - ((f + 2) % 4)]
    ];
    for (const [ex, ey] of e) s.px(ex, ey, '#FFC46E', { glow: '#FF8C3C', bare: true });
}

/**
 * 16×24 rusty oil drum with a fire burning in it: a dented steel barrel with two hoops, rust holes glowing
 * with the fire inside, flames licking over the rim (4 frames) and embers going up.
 */
function barrel(f) {
    const s = new PixelSprite(16, 24);
    // the drum: a cylinder lit from the left, cut to a flat top and an elliptical bottom
    s.capsule(8, 6, 8, 30, 6.4, 6.4, T.drum, { amb: 0.24 });
    repaint(s, T.rust, (x, y) => noise(x, y, 31, 3) > 0.6 || (y > 18 && noise(x, y, 32, 2) > 0.45));
    for (let x = 0; x < 16; x++) {
        const u = (x + 0.5 - 8) / 6.4;
        const b = 20 + Math.round(2 * Math.sqrt(Math.max(0, 1 - u * u)));
        s.cutBox(x, b + 1, 1, 10);
    }
    s.cutBox(0, 0, 16, 9);
    // hoops: rolled ridges following the curve of the drum
    for (const hy of [12, 17]) {
        for (let x = 2; x <= 13; x++) {
            const u = (x + 0.5 - 8) / 6.4;
            const y = hy + Math.round(1.6 * Math.sqrt(Math.max(0, 1 - u * u)));
            dot(s, x, y, tone(T.drum, x < 7 ? 5 : x < 11 ? 4 : 2), T.drum);
            dot(s, x, y + 1, tone(T.drum, x < 11 ? 1 : 0), T.drum);
        }
    }
    // rust holes letting the firelight out
    const lit = f % 2 ? '#FFC46E' : '#FF9A3A';
    s.px(5, 15, lit, { glow: '#FF8C3C' }).px(10, 20, '#FF9A3A', { glow: '#FF8C3C' });
    s.px(11, 14, lit, { glow: '#FF8C3C' }).px(4, 20, '#7A2208');
    // the rim: an ellipse seen from above, the back half lit orange by the fire
    s.ellipse(8, 9, 6.4, 2.4, T.drum, { shade: 'flat', lum: 0.75 });
    s.ellipse(8, 9, 5.2, 1.5, T.burnt, { shade: 'flat', lum: 0.1 });
    for (let x = 3; x <= 12; x++) dot(s, x, 7, x < 9 ? '#C7703A' : '#9E5530', T.rust);
    // coals glowing in the drum, then the flames over them
    s.ellipse(8, 9.2, 4, 0.9, T.flame, { shade: 'flat', lum: 0.2 });
    flames(s, 8, 9, f);
    // the front lip of the rim
    for (let x = 2; x <= 13; x++) {
        const u = (x + 0.5 - 8) / 6.4;
        const y = 9 + Math.round(1.8 * Math.sqrt(Math.max(0, 1 - u * u)));
        dot(s, x, y, x < 5 ? '#B98A6A' : tone(T.drum, x < 11 ? 4 : 3), T.drum);
    }
    return s.render();
}

// ---------------------------------------------------------------- screens and LEDs

const TAPE = 'v BEAR -42% v REKT -38% v NGMI -51% v COPE -88% ';

/**
 * 46×22 LED ticker board torn off a building: it lies on the street broken in two, the left half dropped
 * lower, still scrolling red prices and down-arrows (2 frames), with a dead patch of LEDs at the break.
 */
function ticker(f) {
    const s = new PixelSprite(46, 22);
    const halves = [
        { x0: 1, x1: 21, y: 8 },
        { x0: 23, x1: 44, y: 5 }
    ];
    // the strip of lit LEDs: TAPE rendered once, read through each half's window, scrolled by frame
    const lit = new Set();
    text(0, 0, TAPE + TAPE, (x, y) => lit.add(`${x},${y}`));
    const scroll = (f % 2) * 4;
    for (const [i, h] of halves.entries()) {
        // casing: a lit top edge and a dark frame around the panel
        s.box(h.x0, h.y, h.x1 - h.x0 + 1, 3, T.iron, {
            r: 0.5,
            bevel: 1,
            bias: 0.25,
            g: `top${i}`
        });
        s.box(h.x0, h.y + 2, h.x1 - h.x0 + 1, 11, T.iron, { r: 0.5, bevel: 1, bias: -0.1 });
        for (let y = 0; y < 9; y++)
            for (let x = h.x0 + 1; x < h.x1; x++) {
                const on = lit.has(`${x + scroll},${y - 2}`) && !(i === 0 && x > 17);
                if (on) s.px(x, h.y + 3 + y, y - 2 === 1 ? RED_HOT : RED, { glow: RED });
                else s.px(x, h.y + 3 + y, (x + y) % 2 ? '#1A0B10' : '#120809');
            }
    }
    // the break: jagged casing edges and a torn wire hanging out
    s.cutBox(21, 8, 1, 2).cutBox(20, 19, 2, 2).cutBox(23, 5, 1, 1);
    s.px(22, 12, '#6E5A38').px(22, 13, '#A08758').px(22, 15, '#6E5A38');
    // a mounting bracket still bolted on, bent up
    s.line(41, 5, 43, 1, T.steel, { lum: 0.5 });
    s.line(43, 1, 45, 1, T.steel, { lum: 0.6 });
    // a chunk of rubble propping the right half
    chunk(
        s,
        [
            [36, 19],
            [39, 17.5],
            [43, 18.5],
            [42, 21],
            [37, 21]
        ],
        T.concrete
    );
    return s.render();
}

/**
 * 18×16 smashed trading monitor still switched on: a red crash chart on a dark screen, shattered from a
 * hard punch in the corner.
 */
function monitor() {
    const s = new PixelSprite(18, 16);
    // stand
    s.ellipse(9, 14, 5, 1.6, T.plastic, { bias: 0.1 });
    s.box(7.5, 11, 3, 3, T.plastic, { bevel: 1, lum: 0.3 });
    // casing and screen
    s.box(0.5, 0.5, 17, 11.5, T.plastic, { r: 1, bevel: 1.5, bias: 0.15 });
    s.box(2, 2, 14, 8.5, T.navy, { shade: 'flat', lum: 0.05 });
    for (let x = 3; x < 16; x += 3) for (let y = 3; y < 10; y += 3) s.px(x, y, '#16233A');
    // the crash: a red line that goes up a little, then straight down
    const line = [
        [2, 5],
        [3, 4],
        [4, 4],
        [5, 3],
        [6, 4],
        [7, 3],
        [8, 5],
        [9, 6],
        [10, 6],
        [11, 8],
        [12, 8],
        [13, 9],
        [14, 9],
        [15, 10]
    ];
    for (const [x, y] of line) s.px(x, y, RED, { glow: RED });
    s.px(5, 3, RED_HOT, { glow: RED });
    // shattered glass from a punch at the top right
    s.px(12, 3, '#05070A').px(13, 3, '#05070A').px(12, 4, '#05070A');
    for (const [x, y] of [
        [14, 2],
        [15, 2],
        [11, 2],
        [10, 3],
        [9, 3],
        [11, 5],
        [10, 6],
        [13, 5],
        [14, 6],
        [14, 4],
        [15, 4],
        [8, 2]
    ])
        s.px(x, y, '#7F8EA3', { glow: '#2E4666' });
    // a glint on the bezel
    s.px(2, 1, tone(T.plastic, 5)).px(3, 1, tone(T.plastic, 5));
    return s.render();
}

// ---------------------------------------------------------------- street furniture

/** 10×13 traffic cone: dull safety orange, a reflective white band, a square rubber foot. */
function cone() {
    const s = new PixelSprite(10, 13);
    s.box(0, 10, 10, 2, T.rubber, { shade: 'flat', lum: 0.55 });
    s.box(0, 11.5, 10, 1.5, T.rubber, { shade: 'flat', lum: 0.25 });
    s.poly(
        [
            [4.2, 0],
            [5.8, 0],
            [8.6, 11],
            [1.4, 11]
        ],
        T.safety,
        { left: 0.95, right: 0.3 }
    );
    s.poly(
        [
            [3.3, 4],
            [6.7, 4],
            [7.3, 6.5],
            [2.7, 6.5]
        ],
        T.paint,
        { left: 0.95, right: 0.35 }
    );
    s.px(4, 0, tone(T.safety, 1)).px(5, 0, tone(T.safety, 0));
    s.px(3, 8, tone(T.safety, 5));
    return s.render();
}

/**
 * 34×16 sawhorse barrier: a plank in faded orange and white stripes on two splayed A-frames, the left foot
 * weighed down with a sandbag.
 */
function barrier() {
    const s = new PixelSprite(34, 16);
    // the A-frame legs at each end: a lit leg, a shaded leg, a cross brace, rubber feet
    for (const cx of [6, 27]) {
        s.line(cx, 7, cx - 3, 14.5, T.steel, { lum: 0.62 });
        s.line(cx + 1, 7, cx + 4, 14.5, T.steel, { lum: 0.32 });
        s.line(cx - 1.5, 11.5, cx + 2.5, 11.5, T.steel, { lum: 0.45 });
        s.px(cx - 4, 15, tone(T.rubber, 3)).px(cx - 3, 15, tone(T.rubber, 2));
        s.px(cx + 4, 15, tone(T.rubber, 2)).px(cx + 5, 15, tone(T.rubber, 1));
    }
    // the plank: diagonal stripes, a lit top edge, a shaded bottom edge
    for (let x = 1; x <= 32; x++)
        for (let y = 2; y <= 7; y++) {
            const white = Math.floor((x + y) / 4) % 2 === 0;
            let t = white ? 3.4 : 3.2;
            if (y === 2) t += 1.2;
            if (y === 7) t -= 1.6;
            if (x > 26) t -= 0.4;
            const m = white ? T.paint : T.safety;
            dot(s, x, y, tone(m, t), m);
        }
    // scuffs and a chipped corner
    s.cutBox(32, 2, 1, 1);
    s.px(12, 4, tone(T.safety, 1)).px(13, 5, tone(T.paint, 1)).px(22, 3, tone(T.safety, 2));
    // a sandbag on the left foot
    s.ellipse(4, 14, 3.6, 2, M.burlap, { bias: -0.05 });
    s.px(2, 13, M.burlap.ramp[4]);
    return s.render();
}

/**
 * 62×34 burned-out sedan seen ¾ from above: a scorched shell with rust blooming through, the windows
 * gone (the windscreen a web of cracked glass), flat tyres sagging on rusty rims.
 */
function car() {
    const s = new PixelSprite(62, 34);
    // wheel wells and tyres sit behind the body
    const wheels = [14, 48];
    // body side (south face), its top decks (bonnet, boot) and the cabin
    s.poly(
        [
            [2, 17],
            [58, 17],
            [61, 19.5],
            [61.5, 26],
            [60, 28.5],
            [1.5, 28.5],
            [0.5, 26],
            [0.5, 19.5]
        ],
        T.burnt,
        { top: 0.62, bot: 0.22 }
    );
    for (const wx of wheels) s.cutEllipse(wx, 28.5, 6.4, 6.2);
    for (const wx of wheels)
        s.ellipse(wx, 28.5, 6.2, 6, T.burnt, { shade: 'flat', lum: 0, under: true });
    // the decks
    s.poly(
        [
            [3, 7.5],
            [14, 7],
            [14, 17.5],
            [1, 17.5],
            [0.5, 12]
        ],
        T.burnt,
        { left: 0.85, right: 0.65 }
    );
    s.poly(
        [
            [46, 7],
            [57, 7.5],
            [61, 12],
            [61, 17.5],
            [46, 17.5]
        ],
        T.burnt,
        { left: 0.8, right: 0.55 }
    );
    // rear window, side windows, windscreen (all glassless or shattered) and the roof
    s.poly(
        [
            [19.5, 1],
            [19.5, 9.5],
            [13.5, 17],
            [13.5, 8]
        ],
        T.burnt,
        { lum: 0.08 }
    );
    s.poly(
        [
            [19.5, 9.5],
            [40.5, 9.5],
            [46.5, 17],
            [13.5, 17]
        ],
        T.burnt,
        { lum: 0.42 }
    );
    s.poly(
        [
            [40.5, 1],
            [46.5, 8],
            [46.5, 17],
            [40.5, 9.5]
        ],
        T.sheet,
        { left: 0.18, right: 0.05 }
    );
    s.poly(
        [
            [19.5, 1],
            [40.5, 1],
            [40.5, 9.5],
            [19.5, 9.5]
        ],
        T.burnt,
        { left: 0.95, right: 0.7 }
    );
    // window holes in the side, split by the door pillar; scorched seats inside
    s.poly(
        [
            [21, 10.5],
            [30, 10.5],
            [30, 16],
            [16, 16]
        ],
        T.burnt,
        { lum: 0 }
    );
    s.poly(
        [
            [32, 10.5],
            [40, 10.5],
            [44.5, 16],
            [32, 16]
        ],
        T.burnt,
        { lum: 0 }
    );
    for (const [x, y] of [
        [23, 13],
        [24, 12],
        [25, 13],
        [35, 13],
        [36, 12],
        [37, 13],
        [38, 14]
    ])
        s.px(x, y, tone(T.rust, 1));
    // rust blooming through the paint, ash on the flat tops
    repaint(s, T.rust, (x, y) => {
        const n = noise(x, y, 41, 5);
        return (
            (y >= 17 && n > 0.58) || (y < 17 && n > 0.7) || (y > 24 && noise(x, y, 43, 2) > 0.62)
        );
    });
    s.tone(-0.1, (x, y) => s.mat[y * s.w + x] === T.rust);
    for (let i = 0; i < 26; i++) {
        const x = Math.floor(hash(51, i) * 60) + 1;
        const y = Math.floor(hash(52, i) * 16) + 1;
        if (s.mat[y * s.w + x] && !(x > 40 && x < 47) && !(x > 13 && x < 20))
            s.px(x, y, hash(53, i) < 0.5 ? '#6E6A66' : '#8C8780', { line: T.burnt.line });
    }
    // the windscreen's cracks
    for (const [x, y] of [
        [42, 4],
        [43, 5],
        [43, 6],
        [44, 8],
        [42, 7],
        [41, 8],
        [45, 10],
        [44, 11],
        [45, 13],
        [46, 14]
    ])
        s.px(x, y, '#7F8592', { line: T.burnt.line });
    s.px(42, 3, '#C9CED6').px(41, 2, '#C9CED6');
    // panel lines: doors, sills, the lip of the decks
    for (let y = 18; y < 27; y++) s.px(31, y, tone(T.burnt, 0)).px(45, y, tone(T.burnt, 0));
    for (let x = 3; x < 59; x++)
        if (x < 7 || (x > 21 && x < 41) || x > 55) s.px(x, 17, tone(T.burnt, 4));
    s.px(28, 20, tone(T.steel, 3)).px(42, 20, tone(T.steel, 3));
    // lights: dead headlamp, a cracked tail light
    s.box(58.5, 19, 2.5, 2, T.steel, { shade: 'flat', lum: 0.35 });
    s.px(59, 19, '#D6DCE2');
    s.px(1, 19, '#5A1424').px(1, 20, '#3D0918').px(2, 19, '#7A1024');
    // flat tyres sagging on the rims
    for (const wx of wheels) {
        s.ellipse(wx, 28.4, 5, 4.4, T.rubber, { flat: 0.7 });
        s.ellipse(wx, 31.6, 5.6, 1.3, T.rubber, { shade: 'flat', lum: 0.3 });
        s.ellipse(wx - 0.2, 28, 2.4, 2.2, T.rust, { bias: 0.05 });
        s.px(wx - 1, 27, tone(T.rust, 5)).px(wx, 28, tone(T.rust, 0));
    }
    return s.render();
}

/**
 * 22×20 stack of cardboard boxes: two on the ground, one on top, taped flaps, and WEN scrawled on the big
 * one in marker.
 */
function boxes() {
    const s = new PixelSprite(22, 20);
    const box = (x, y, w, d, hgt, seed) => {
        // top face (d rows deep), front face (hgt rows), a tape strip down the flaps
        s.poly(
            [
                [x, y],
                [x + w, y],
                [x + w, y + d],
                [x, y + d]
            ],
            T.cardboard,
            { left: 0.82, right: 0.66 }
        );
        s.poly(
            [
                [x, y + d],
                [x + w, y + d],
                [x + w, y + d + hgt],
                [x, y + d + hgt]
            ],
            T.cardboard,
            { top: 0.52, bot: 0.3 }
        );
        const mid = Math.floor(x + w / 2);
        for (let yy = Math.ceil(y); yy < y + d; yy++) s.px(mid, yy, tone(T.cardboard, 5));
        s.px(mid, Math.ceil(y + d), tone(T.cardboard, 4)).px(
            mid,
            Math.ceil(y + d) + 1,
            tone(T.cardboard, 3)
        );
        for (let xx = Math.ceil(x); xx < x + w; xx++)
            s.px(xx, Math.ceil(y + d), tone(T.cardboard, 4));
        // a dent and a damp corner
        s.px(
            Math.floor(x + w * hash(seed, 1)),
            Math.floor(y + d + 2 + hgt * 0.5 * hash(seed, 2)),
            tone(T.cardboard, 1)
        );
    };
    box(13, 9, 8.5, 3, 7.5, 1);
    box(0.5, 6, 12.5, 4, 9.5, 2);
    box(3.5, 0.5, 9.5, 3, 5.5, 3);
    // WEN, in a shaky marker hand
    text(1, 12, 'WEN', (x, y) => s.px(x, y, '#1C140E', { line: T.cardboard.line }), { jitter: 4 });
    return s.render();
}

/**
 * 24×12 open steel bear trap set in the street: its two jaws laid flat in a ring with their teeth standing
 * up all the way round, the trigger pan in the middle, a leaf spring each side, a chain to its stake.
 */
function bearTrap() {
    const s = new PixelSprite(24, 12);
    const st = (x, y, t) => dot(s, x, y, tone(T.steel, t), T.steel);
    // leaf springs: flat U-loops out to each side, the top leaf lit
    for (const [x0, dir] of [
        [0, 1],
        [23, -1]
    ]) {
        for (let i = 1; i <= 4; i++) {
            st(x0 + dir * i, 6, dir > 0 ? 4.4 : 3.6);
            st(x0 + dir * i, 8, 1.6);
        }
        st(x0, 7, 2.6);
        st(x0 + dir * 5, 7, 2);
    }
    // the jaws: a flat ring lying on the ground
    s.ellipse(12, 7, 7.6, 3.6, T.steel, { flat: 0.55, amb: 0.3 });
    s.cutEllipse(12, 7, 6.2, 2.4);
    // the pan in the middle, the dog across to the jaw
    s.ellipse(12, 7.2, 1.9, 1, T.steel, { bias: 0.1 });
    st(14, 7, 2);
    st(15, 7, 2.4);
    // teeth standing up round the ring: the far jaw's against the street, the near jaw's over the pan
    for (let x = 6; x <= 18; x += 2) {
        const u = (x + 0.5 - 12) / 7.6;
        const yb = Math.round(7 - 3.6 * Math.sqrt(1 - u * u));
        st(x, yb - 1, 4);
        st(x, yb - 2, 5);
    }
    for (let x = 7; x <= 17; x += 2) {
        const u = (x + 0.5 - 12) / 7.6;
        const yf = Math.round(7 + 3.6 * Math.sqrt(1 - u * u)) - 1;
        st(x, yf - 1, 4.6);
    }
    // glints, rust
    s.px(7, 3, '#F2F5F8').px(3, 6, tone(T.rust, 4)).px(20, 8, tone(T.rust, 3));
    // the chain to its stake
    for (const [x, y, t] of [
        [17, 10, 4],
        [18, 11, 2],
        [19, 11, 4]
    ])
        st(x, y, t);
    s.circle(21.5, 10.6, 1.3, T.iron, { bias: 0.15 });
    return s.render();
}

/**
 * 36×26 dumpster: dark green steel, ribbed, one black lid shut and the other propped open by the trash
 * spilling out of it.
 */
function dumpster() {
    const s = new PixelSprite(36, 26);
    // casters
    for (const x of [6, 30]) s.circle(x, 23.5, 1.8, T.rubber, { bias: 0.1 });
    // body: a slightly flared box, ribbed
    s.poly(
        [
            [1.5, 8],
            [34.5, 8],
            [33.5, 23],
            [2.5, 23]
        ],
        T.bin,
        { top: 0.62, bot: 0.25 }
    );
    for (const rx of [9, 18, 27])
        for (let y = 10; y < 22; y++) {
            s.px(rx, y, tone(T.bin, 4), { line: T.bin.line });
            s.px(rx + 1, y, tone(T.bin, 1), { line: T.bin.line });
        }
    s.box(1, 7, 34, 2.5, T.bin, { r: 0.5, bevel: 1, bias: 0.2 });
    repaint(s, T.rust, (x, y) => y > 19 && noise(x, y, 61, 2) > 0.62);
    // a faded tag sprayed on the side
    text(4, 13, 'GG', (x, y) => s.px(x, y, '#3E6672', { line: T.bin.line }), { jitter: 2 });
    // the shut lid (left): its top seen from above
    s.poly(
        [
            [2, 2],
            [17.5, 2],
            [17.5, 7.5],
            [1.5, 7.5]
        ],
        T.plastic,
        { left: 0.8, right: 0.55 }
    );
    s.line(2, 6.5, 17, 6.5, T.plastic, { lum: 0.95 });
    // trash under the open lid: a bulging bag, a crumpled printout of a red chart
    s.ellipse(25, 6, 6, 3.4, T.plastic, { bias: 0.25 });
    s.px(23, 4, tone(T.plastic, 5)).px(24, 4, tone(T.plastic, 5));
    s.ellipse(31, 6, 3, 2.2, T.sheet, { bias: -0.05 });
    s.px(30, 6, '#B81E40').px(31, 6, '#B81E40').px(32, 7, '#B81E40');
    // the open lid, propped up at the front, seen from below its lip
    s.poly(
        [
            [18, 0.5],
            [34.5, 0.5],
            [34.5, 3],
            [18, 3]
        ],
        T.plastic,
        { left: 0.62, right: 0.42 }
    );
    s.line(18, 3, 34, 3, T.plastic, { lum: 0.15 });
    return s.render();
}

/**
 * 10×34 warning beacon on a pole: a red glass dome whose rotating mirror sweeps a bright band around it
 * (4 frames), a junction box half way down.
 */
function siren(f) {
    const s = new PixelSprite(10, 34);
    s.box(2, 31, 6, 2.5, T.iron, { r: 0.5, bevel: 1, bias: 0.1 });
    s.capsule(5, 31, 5, 9, 1, 1, T.steel, { amb: 0.2 });
    s.box(3, 18, 4.5, 5, T.steel, { r: 0.5, bevel: 1, bias: -0.05 });
    s.px(4, 19, '#FFC53D', { glow: '#FFC53D' });
    // collar and dome
    s.box(1.5, 8, 7, 2.5, T.iron, { r: 0.5, bevel: 1, bias: 0.15 });
    const sweep = [3, 4, 6, -1][f % 4];
    s.box(2, 3, 6, 5.5, T.redGlass, { r: 2, bevel: 2.2, bias: sweep < 0 ? -0.3 : -0.12, amb: 0.3 });
    if (sweep >= 0)
        for (let y = 4; y < 8; y++) s.px(sweep, y, y < 6 ? '#FFD2D6' : RED_HOT, { glow: RED_HOT });
    s.px(3, 4, '#FFFFFF', { glow: '#FFD2D6' });
    s.box(2.5, 1.5, 5, 2, T.iron, { r: 0.5, bevel: 1, bias: 0.15 });
    s.box(4, 0.5, 2, 1.5, T.iron, { shade: 'flat', lum: 0.5 });
    return s.render();
}

/** 10×14 fire hydrant in faded mustard paint, with side caps, a big pumper cap and a bolted flange. */
function hydrant() {
    const s = new PixelSprite(10, 14);
    s.box(0.5, 11, 9, 2.5, T.ochre, { r: 0.5, bevel: 1, bias: 0.05 });
    s.capsule(5, 5, 5, 11, 2.9, 2.9, T.ochre, { amb: 0.25 });
    s.ellipse(5, 4.5, 3.3, 2.4, T.ochre, { bias: 0.1 });
    s.box(4, 1, 2, 2, T.ochre, { shade: 'flat', lum: 0.6 });
    s.box(0, 6, 2.5, 2, T.ochre, { bevel: 1, bias: 0.1 });
    s.box(7.5, 6, 2.5, 2, T.ochre, { bevel: 1, bias: -0.1 });
    s.circle(5, 8, 1.6, T.ochre, { bias: 0.2 });
    s.px(5, 8, tone(T.ochre, 1));
    s.pxs(
        [
            [1, 12],
            [4, 12],
            [8, 12]
        ],
        tone(T.ochre, 5)
    );
    s.px(3, 9, tone(T.rust, 2)).px(6, 6, tone(T.rust, 3)).px(7, 10, tone(T.rust, 2));
    return s.render();
}

/**
 * 32×16 park bench: weathered wooden slats on a cast-iron frame, with a newspaper left on the seat, its
 * front page all red chart.
 */
function bench() {
    const s = new PixelSprite(32, 16);
    // back legs and the iron frame ends
    for (const x of [4, 27]) {
        s.line(x, 1, x, 15, T.iron, { lum: 0.45 });
        s.line(x - 2, 7, x + 1, 7, T.iron, { lum: 0.6 });
        s.px(x - 2, 6, tone(T.iron, 4)).px(x - 3, 7, tone(T.iron, 3));
    }
    // backrest slats
    for (const y of [1, 4]) {
        for (let x = 2; x <= 29; x++) {
            dot(s, x, y, tone(T.plank, x < 16 ? 4 : 3.6), T.plank);
            dot(s, x, y + 1, tone(T.plank, 2), T.plank);
        }
    }
    // seat slats, seen from above, and the front edge
    for (const y of [8, 10])
        for (let x = 2; x <= 29; x++) dot(s, x, y, tone(T.plank, x < 12 ? 4.6 : 4), T.plank);
    for (let x = 2; x <= 29; x++) {
        dot(s, x, 9, tone(T.plank, 1), T.plank);
        dot(s, x, 11, tone(T.plank, 3), T.plank);
        dot(s, x, 12, tone(T.plank, 1.6), T.plank);
    }
    // front legs
    for (const x of [3, 28]) {
        s.line(x, 12, x, 15, T.iron, { lum: 0.6 });
        s.px(x - 1, 15, tone(T.iron, 3)).px(x + 1, 15, tone(T.iron, 2));
    }
    // knots in the wood, a broken slat end
    s.px(9, 1, tone(T.plank, 2)).px(21, 4, tone(T.plank, 2)).px(24, 8, tone(T.plank, 2));
    s.cutBox(29, 4, 1, 2);
    // the newspaper: folded, front page a headline and a red chart going down
    s.poly(
        [
            [16, 7],
            [24, 6.5],
            [25, 10.5],
            [16.5, 11]
        ],
        T.sheet,
        { left: 0.78, right: 0.6 }
    );
    s.line(17.5, 7.5, 21.5, 7.5, T.sheet, { lum: 0.15 });
    s.line(17.5, 9.5, 19.5, 9.5, T.sheet, { lum: 0.35 });
    s.px(21, 8, '#B81E40').px(22, 9, '#B81E40').px(23, 9, '#B81E40').px(23, 10, '#B81E40');
    return s.render();
}

/**
 * 30×16 pile of rubble: slabs of broken concrete leaning on each other, loose bricks, and bent rebar
 * sticking out of the biggest slab.
 */
function rubble() {
    const s = new PixelSprite(30, 16);
    // rebar behind the slabs
    s.line(11, 8, 8.5, 1.5, T.rust, { lum: 0.55 });
    s.line(8.5, 1.5, 6.5, 2.5, T.rust, { lum: 0.7 });
    s.line(19, 9, 22, 2.5, T.rust, { lum: 0.4 });
    s.px(22, 2, tone(T.rust, 5));
    chunk(
        s,
        [
            [2, 9],
            [9, 4.5],
            [17, 6],
            [18, 13],
            [10, 15.5],
            [3, 14]
        ],
        T.concrete,
        { R: 2, grad: 0.35 }
    );
    chunk(
        s,
        [
            [15, 9],
            [21, 6.5],
            [27, 8.5],
            [28.5, 14],
            [22, 15.5],
            [15, 14.5]
        ],
        T.concrete,
        { R: 2, grad: 0.4, bias: -0.08 }
    );
    chunk(
        s,
        [
            [10, 12],
            [14, 10.5],
            [17, 13],
            [13, 15.5]
        ],
        T.concrete,
        { bias: 0.08 }
    );
    looseBrick(s, 1, 12, 4);
    looseBrick(s, 23, 12, 4);
    looseBrick(s, 18, 4, 3);
    // aggregate specks in the broken faces
    for (const [x, y] of [
        [6, 9],
        [12, 7],
        [20, 10],
        [24, 11],
        [8, 12]
    ])
        s.px(x, y, tone(T.concrete, 2), { line: T.concrete.line });
    return s.render();
}

/**
 * 14×20 newspaper vending box on a post: faded blue steel, a window onto today's front page (one huge
 * headline and a red chart pointing down), a coin slot and a pull handle.
 */
function newsbox() {
    const s = new PixelSprite(14, 20);
    s.box(3, 18, 8, 2, T.iron, { shade: 'flat', lum: 0.35 });
    s.box(6, 14, 2, 5, T.iron, { bevel: 1, lum: 0.4 });
    s.poly(
        [
            [0.5, 2.5],
            [13.5, 2.5],
            [13.5, 5],
            [0.5, 5]
        ],
        T.navy,
        { left: 0.95, right: 0.7 }
    );
    s.poly(
        [
            [0.5, 5],
            [13.5, 5],
            [13.5, 15.5],
            [0.5, 15.5]
        ],
        T.navy,
        { top: 0.58, bot: 0.3 }
    );
    // the window and the paper behind it
    s.box(2, 6, 10, 6.5, T.iron, { shade: 'flat', lum: 0.2 });
    s.box(3, 7, 8, 5, T.sheet, { shade: 'flat', lum: 0.62 });
    s.line(3.5, 7.5, 10.5, 7.5, T.sheet, { lum: 0.08 });
    s.line(3.5, 8.5, 8.5, 8.5, T.sheet, { lum: 0.08 });
    s.px(8, 10, '#B81E40').px(9, 10, '#B81E40').px(9, 11, '#B81E40').px(10, 11, '#B81E40');
    s.line(3.5, 10.5, 6.5, 10.5, T.sheet, { lum: 0.4 });
    s.px(3, 7, '#E6E2D8');
    // coin slot, handle, a rusty scrape
    s.box(9.5, 3, 3, 1.5, T.steel, { shade: 'flat', lum: 0.55 });
    s.px(10, 3, tone(T.steel, 0)).px(11, 3, tone(T.steel, 0));
    s.line(4.5, 13.5, 9.5, 13.5, T.steel, { lum: 0.6 });
    s.px(1, 14, tone(T.rust, 3)).px(12, 6, tone(T.rust, 2));
    return s.render();
}

// ---------------------------------------------------------------- decals (flat, baked into the asphalt)

// The night ground: asphalt and concrete, darkest first. Decals use these plus a few muted accents.
const G = {
    pit: '#121318',
    a0: '#16171C',
    a1: '#1E2026',
    a2: '#24262D',
    a3: '#2A2D35',
    a4: '#32353E',
    c0: '#3B3E46',
    c1: '#464A53',
    c2: '#52565F'
};

/** A flat decal sprite: `paint(s)` places pixels with `put(x, y, hex)`; no outline, no lighting. */
function flat(w, h, paint) {
    const s = new PixelSprite(w, h);
    paint((x, y, hex) => {
        if (x >= 0 && y >= 0 && x < w && y < h) s.px(x, y, hex);
    }, s);
    return s.render({ outline: false });
}

/** An organic blob mask: an ellipse whose edge wanders with noise (puddles, stains, patches). */
const blob = (x, y, cx, cy, rx, ry, seed, wobble = 0.35) => {
    const u = (x + 0.5 - cx) / rx;
    const v = (y + 0.5 - cy) / ry;
    return u * u + v * v < 1 - wobble * (noise(x, y, seed, 3) - 0.5) * 2;
};

/** A crack: a wandering dark line from `a` to `b` with a lit lip above it, and a short fork. */
function crackPath(put, pts, seed) {
    for (let i = 0; i < pts.length - 1; i++) {
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[i + 1];
        const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
        for (let k = 0; k <= n; k++) {
            const x = Math.round(x0 + ((x1 - x0) * k) / n);
            const y = Math.round(y0 + ((y1 - y0) * k) / n);
            put(x, y - 1, G.a4);
            put(x, y, hash(seed, x, y) < 0.7 ? G.pit : G.a0);
            if (hash(seed, x, y, 2) < 0.25) put(x, y + 1, G.a1);
        }
    }
}

const crackA = () =>
    flat(20, 12, (put) => {
        crackPath(
            put,
            [
                [0, 7],
                [4, 6],
                [7, 7],
                [10, 4],
                [14, 5],
                [19, 2]
            ],
            1
        );
        crackPath(
            put,
            [
                [10, 5],
                [12, 8],
                [15, 10]
            ],
            2
        );
    });

const crackB = () =>
    flat(20, 12, (put) => {
        crackPath(
            put,
            [
                [2, 1],
                [5, 4],
                [6, 7],
                [10, 8],
                [13, 11]
            ],
            3
        );
        crackPath(
            put,
            [
                [6, 7],
                [3, 10]
            ],
            4
        );
        crackPath(
            put,
            [
                [10, 8],
                [14, 6],
                [19, 6]
            ],
            5
        );
    });

/** A patch of newer, darker asphalt with a sealed seam round it. */
const patch = () =>
    flat(22, 12, (put) => {
        for (let y = 0; y < 12; y++)
            for (let x = 0; x < 22; x++) {
                const inner =
                    x > 1 && x < 20 && y > 1 && y < 10 && !(x < 4 && y < 3) && !(x > 18 && y > 8);
                const edge = x >= 1 && x <= 20 && y >= 1 && y <= 10;
                if (inner) put(x, y, hash(9, x, y) < 0.08 ? G.a3 : G.a1);
                else if (edge && hash(10, x, y) < 0.8) put(x, y, G.a0);
            }
    });

/** A round cast-iron manhole lid, cross-hatched, with a lit rim and two pick holes. */
const manhole = () =>
    flat(14, 9, (put) => {
        for (let y = 0; y < 9; y++)
            for (let x = 0; x < 14; x++) {
                const u = (x + 0.5 - 7) / 7;
                const v = (y + 0.5 - 4.5) / 4.5;
                const d = u * u + v * v;
                if (d > 1) continue;
                if (d > 0.68) put(x, y, u + v < -0.3 ? G.c0 : G.a0);
                else put(x, y, (x + y) % 3 === 0 || (x - y + 30) % 3 === 0 ? G.a2 : G.a4);
            }
        put(4, 4, G.pit);
        put(9, 4, G.pit);
    });

/** A storm drain grate in the gutter: a concrete frame round dark slots. */
const grate = () =>
    flat(12, 6, (put) => {
        for (let y = 0; y < 6; y++)
            for (let x = 0; x < 12; x++) {
                const frame = x === 0 || x === 11 || y === 0 || y === 5;
                if (frame) put(x, y, y === 0 || x === 0 ? G.c1 : G.c0);
                else put(x, y, x % 2 ? G.pit : G.a2);
            }
    });

/** Sell orders blown into the street: two sheets lying askew, a red SELL stamp on one. */
function papers(seed, sheets) {
    return () =>
        flat(12, 8, (put) => {
            for (const [cx, cy, a, tint] of sheets) {
                const c = Math.cos(a);
                const sn = Math.sin(a);
                for (let y = 0; y < 8; y++)
                    for (let x = 0; x < 12; x++) {
                        const dx = x + 0.5 - cx;
                        const dy = y + 0.5 - cy;
                        const u = dx * c + dy * sn;
                        const v = -dx * sn + dy * c;
                        if (Math.abs(u) > 3.2 || Math.abs(v) > 2.2) continue;
                        const row = Math.round(v + 2.2);
                        let col = tint;
                        if (row % 2 === 1 && u > -2.4 && u < 2 && hash(seed, x, y) < 0.8)
                            col = '#6C6A66';
                        if (u > 2.4 || v > 1.6) col = '#5E5C58'; // the curled, shaded edge
                        put(x, y, col);
                    }
            }
            const [sx, sy] = seed === 1 ? [6, 2] : [3, 4];
            put(sx, sy, '#7A2A36');
            put(sx + 1, sy, '#7A2A36');
        });
}

/** A scatter of grit: concrete crumbs and a brick crumb, each with its shadow. */
const rubbleBits = () =>
    flat(10, 6, (put) => {
        for (const [x, y, c] of [
            [1, 2, G.c2],
            [2, 2, G.c1],
            [5, 1, G.c1],
            [7, 3, '#5A3A34'],
            [8, 3, '#4A302C'],
            [3, 4, G.c0],
            [6, 4, G.c1]
        ]) {
            put(x, y, c);
            put(x, y + 1, G.a0);
        }
    });

/** Broken glass: grey slivers and a couple of bright glints. */
const glass = () =>
    flat(10, 6, (put) => {
        for (const [x, y] of [
            [1, 3],
            [2, 2],
            [4, 4],
            [5, 4],
            [6, 1],
            [8, 3],
            [7, 5],
            [3, 1]
        ])
            put(x, y, hash(71, x, y) < 0.5 ? G.c0 : G.c2);
        put(2, 3, '#C9D2DC');
        put(6, 2, '#9AA6B4');
    });

/** A torn length of caution tape lying in a loose curve, dull yellow and black, twisted once. */
const tape = () =>
    flat(24, 6, (put) => {
        for (let x = 0; x < 24; x++) {
            const y = Math.round(2 + Math.sin(x * 0.32) * 1.6);
            const twist = x === 13;
            for (let k = 0; k < (twist ? 1 : 2); k++) {
                const stripe = Math.floor((x + k) / 2) % 2 === 0;
                put(x, y + k, stripe ? (k ? '#6E6030' : '#8A7A3C') : G.a0);
            }
        }
    });

/** A dark oil stain soaked into the asphalt. */
const stain = () =>
    flat(16, 9, (put) => {
        for (let y = 0; y < 9; y++)
            for (let x = 0; x < 16; x++) {
                if (!blob(x, y, 8, 4.5, 7.5, 4.2, 81, 0.5)) continue;
                const core = blob(x, y, 7.5, 4.5, 4.5, 2.4, 82, 0.4);
                put(x, y, core ? G.a0 : G.a1);
            }
        put(13, 7, G.a1);
        put(2, 1, G.a1);
    });

// A 5×7 stencil-ish font for words sprayed on the street (seen from above).
const FONT5 = {
    R: ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X.X..', 'X..X.', 'X...X'],
    E: ['XXXXX', 'X....', 'X....', 'XXXX.', 'X....', 'X....', 'XXXXX'],
    K: ['X...X', 'X..X.', 'X.X..', 'XX...', 'X.X..', 'X..X.', 'X...X'],
    T: ['XXXXX', '..X..', '..X..', '..X..', '..X..', '..X..', '..X..'],
    N: ['X...X', 'XX..X', 'XX..X', 'X.X.X', 'X..XX', 'X..XX', 'X...X'],
    G: ['.XXX.', 'X...X', 'X....', 'X.XXX', 'X...X', 'X...X', '.XXX.'],
    M: ['X...X', 'XX.XX', 'X.X.X', 'X.X.X', 'X...X', 'X...X', 'X...X'],
    I: ['XXX', '.X.', '.X.', '.X.', '.X.', '.X.', 'XXX']
};

/** A word sprayed on the asphalt long ago: worn through in places, a little overspray. */
function streetWord(word, color, faded, seed) {
    return () =>
        flat(24, 9, (put) => {
            let cx = Math.floor(
                (24 - [...word].reduce((w, ch) => w + FONT5[ch][0].length + 1, -1)) / 2
            );
            [...word].forEach((ch, i) => {
                const g = FONT5[ch];
                const dy = 1 + (hash(seed, i) < 0.35 ? 1 : 0);
                g.forEach((row, ry) => {
                    for (let rx = 0; rx < row.length; rx++) {
                        if (row[rx] !== 'X') continue;
                        const x = cx + rx;
                        const y = ry + dy;
                        const w = noise(x, y, seed, 2);
                        if (w < 0.2) continue; // worn away
                        put(x, y, w < 0.45 ? faded : color);
                    }
                });
                cx += g[0].length + 1;
            });
            for (let i = 0; i < 6; i++)
                put(Math.floor(hash(seed, i, 5) * 24), hash(seed, i, 6) < 0.5 ? 0 : 8, faded);
        });
}

/**
 * A rain puddle: dark slate water inside a darker wet rim, a pale streak of reflected sky, and a thin
 * oily rainbow sheen.
 */
function puddle(w, h, seed) {
    return () =>
        flat(w, h, (put) => {
            const cx = w / 2;
            const cy = h / 2;
            const cell = Math.max(3, Math.round(w / 9));
            const lobe = (x, y) => {
                const u = (x + 0.5 - cx) / (w / 2 - 0.5);
                const v = (y + 0.5 - cy) / (h / 2 - 0.5);
                const u2 = (x + 0.5 - cx - w * 0.2) / (w * 0.26);
                const v2 = (y + 0.5 - cy + h * 0.1) / (h * 0.36);
                const n = (noise(x, y, seed, cell) - 0.5) * 0.5;
                return u * u + v * v < 1 - n || u2 * u2 + v2 * v2 < 1 - n;
            };
            // the mask, cleaned of single-pixel spurs and pinholes
            const m = [];
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m.push(lobe(x, y));
            const at = (x, y) => x >= 0 && y >= 0 && x < w && y < h && m[y * w + x];
            const nb = (x, y) => at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1);
            const clean = m.map((v, i) => {
                const n = nb(i % w, (i / w) | 0);
                return v ? n >= 2 : n >= 3;
            });
            const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && clean[y * w + x];
            for (let y = 0; y < h; y++)
                for (let x = 0; x < w; x++) {
                    if (!inside(x, y)) continue;
                    const rim =
                        !inside(x - 1, y) ||
                        !inside(x + 1, y) ||
                        !inside(x, y - 1) ||
                        !inside(x, y + 1);
                    if (rim) {
                        put(x, y, G.a0);
                        continue;
                    }
                    // deeper and darker towards the rim, a little sky caught in the far half
                    const deep =
                        inside(x - 2, y) &&
                        inside(x + 2, y) &&
                        inside(x, y - 2) &&
                        inside(x, y + 2);
                    const sky = y < cy - h * 0.1 && noise(x, y, seed + 7, 4) > 0.45;
                    put(x, y, !deep ? '#1B1F26' : sky ? '#262C36' : '#212630');
                }
            // a pale reflection streak, slanting gently
            const len = Math.max(3, Math.round(w * 0.3));
            const ry = Math.round(cy - h * 0.18);
            for (let i = 0; i < len; i++) {
                const x = Math.round(cx - w * 0.22 + i);
                const y = ry + Math.round(i * 0.15);
                if (inside(x, y) && inside(x, y + 1))
                    put(x, y, i > 0 && i < len - 1 ? '#5E6B7E' : '#46505F');
            }
            // the oil sheen: violet, teal and amber side by side in a short curve
            const sx = Math.round(cx + w * 0.05);
            const sy = Math.round(cy + h * 0.15);
            const n = Math.max(3, Math.round(w * 0.18));
            for (let i = 0; i < n; i++) {
                const x = sx + i;
                const y = sy + Math.round(Math.sin((i / n) * Math.PI) * -1);
                const c = ['#3E3150', '#2C4A4C', '#4C4630'][Math.floor((i / n) * 3)];
                if (inside(x, y)) put(x, y, c);
            }
        });
}

// ---------------------------------------------------------------- tables

export const PROPS = {
    trap_wall_a: { gen: wallA, foot: 6, shadow: 0.9 },
    trap_wall_b: { gen: wallB, foot: 5, shadow: 0.9 },
    trap_wall_side: { gen: wallSide, foot: 5, shadow: 0.6 },
    trap_wall_corner: { gen: wallCorner, foot: 7, shadow: 0.9 },
    trap_pillar: { gen: pillar, foot: 2, shadow: 1, tall: true },
    trap_pillar_fallen: { gen: pillarFallen, foot: 4, shadow: 0.85 },
    trap_lamp: {
        gen: lamp,
        foot: 2,
        shadow: 0.7,
        tall: true,
        light: { rgb: '255,170,90', r: 180, a: 0.8, x: 0, y: -19 }
    },
    trap_lamp_broken: {
        gen: lampBroken,
        frames: 4,
        fps: 6,
        foot: 2,
        shadow: 0.55,
        tall: true,
        light: { rgb: '255,170,90', r: 160, a: 0.7, x: 4, y: -17, flicker: 'blink' }
    },
    trap_barrel: {
        gen: barrel,
        frames: 4,
        fps: 10,
        foot: 3,
        shadow: 0.85,
        light: { rgb: '255,140,60', r: 170, a: 0.9, x: 0, y: -6, flicker: 'fire' }
    },
    trap_ticker: {
        gen: ticker,
        frames: 2,
        fps: 2,
        foot: 3,
        shadow: 0.9,
        light: { rgb: '255,59,92', r: 100, a: 0.5, x: 0, y: 1, flicker: 'pulse' }
    },
    trap_monitor: {
        gen: monitor,
        foot: 2,
        shadow: 0.8,
        light: { rgb: '255,80,100', r: 50, a: 0.35, x: 0, y: -2 }
    },
    trap_cone: { gen: cone, foot: 2, shadow: 0.7 },
    trap_barrier: { gen: barrier, foot: 2, shadow: 0.85 },
    trap_car: { gen: car, foot: 3, shadow: 0.95 },
    trap_boxes: { gen: boxes, foot: 2, shadow: 0.9 },
    trap_beartrap: { gen: bearTrap, foot: 4, shadow: 0.5 },
    trap_dumpster: { gen: dumpster, foot: 2, shadow: 0.9 },
    trap_siren: {
        gen: siren,
        frames: 4,
        fps: 8,
        foot: 2,
        shadow: 0.6,
        tall: true,
        light: { rgb: '255,40,60', r: 110, a: 0.6, x: 0, y: -11, flicker: 'siren' }
    },
    trap_hydrant: { gen: hydrant, foot: 2, shadow: 0.8 },
    trap_bench: { gen: bench, foot: 2, shadow: 0.9 },
    trap_rubble: { gen: rubble, foot: 3, shadow: 0.9 },
    trap_newsbox: { gen: newsbox, foot: 2, shadow: 0.7 }
};

export const DECALS = {
    trap_crack_a: { gen: crackA },
    trap_crack_b: { gen: crackB },
    trap_patch: { gen: patch },
    trap_manhole: { gen: manhole, steam: true },
    trap_grate: { gen: grate },
    trap_paper_a: {
        gen: papers(1, [
            [4.5, 4, 0.25, '#8E8C86'],
            [7.5, 3.5, -0.35, '#A39F96']
        ])
    },
    trap_paper_b: { gen: papers(2, [[6, 4, 0.5, '#9A978F']]) },
    trap_rubble_bits: { gen: rubbleBits },
    trap_glass: { gen: glass },
    trap_tape: { gen: tape },
    trap_stain: { gen: stain },
    trap_graffiti_rekt: { gen: streetWord('REKT', '#6A505C', '#4A3A44', 3) },
    trap_graffiti_ngmi: { gen: streetWord('NGMI', '#3E6470', '#304650', 7) },
    trap_puddle_s: { gen: puddle(20, 10, 91), water: true },
    trap_puddle_m: { gen: puddle(34, 16, 93), water: true },
    trap_puddle_l: { gen: puddle(56, 24, 95), water: true }
};
