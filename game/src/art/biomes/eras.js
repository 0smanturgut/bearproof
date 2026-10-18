// Scenery for the eras map, drawn with the pixel-art engine (art/pixel.js). See art/props.js for the format.
//
// Market Eras is crypto history on fast-forward: the run crosses Genesis 2009 (a black CRT terminal glowing
// green), DeFi Summer (warm dusk farmland), Altcoin Season (neon synthwave) and The Bear Market (dark
// red-grey). The ground changes colour by era but the props stay put all run, so every prop is an artifact
// of crypto history that has to read on all four grounds: mid-tone bodies, a dark selective outline, and one
// warm or green glowing accent each. The decals belong to one era each and stay faint.

import { PixelSprite, mat } from '../pixel.js';
import { M } from '../materials.js';

// ---- eras materials: six tones, dark -> light ------------------------------------------------------------

const E = {
    // yellowed 2009 beige plastic: the PC tower, the CRT, the keyboard
    beige: mat(['#2A2418', '#544A36', '#82765A', '#ACA182', '#CEC5A6', '#ECE6CC'], {
        line: '#14110A'
    }),
    // the dark recess round the screen, the keys
    bezel: mat(['#14130F', '#24221C', '#36332A', '#4A463A', '#605B4C', '#7A7562'], {
        line: '#0A0907'
    }),
    // the server rack: black powder-coated steel with a cold blue edge
    rack: mat(['#0A0C12', '#141822', '#1F2532', '#2C3444', '#3E485C', '#56647C'], {
        line: '#05060A'
    }),
    // the 1U units inside it: brushed dark aluminium
    unit: mat(['#16191F', '#242932', '#353C48', '#4A5361', '#636E7E', '#848FA0'], {
        line: '#0A0C10'
    }),
    // galvanized silo steel: a cool grey with a hint of teal
    galv: mat(['#151C20', '#27343A', '#3E5058', '#5C727A', '#88A0A6', '#C4D6D8'], {
        line: '#0A0F12'
    }),
    // poured concrete: the silo footing and the launch pad
    concrete: mat(['#1C1C20', '#2F2F34', '#46464B', '#605F62', '#7E7C7C', '#A09C98'], {
        line: '#0D0D10'
    }),
    // rocket red: an orange-leaning red, kept well away from the enemy pink-red
    rocket: mat(['#2A0A08', '#5E1610', '#9A2618', '#D04224', '#F07A44', '#FFB88E'], {
        line: '#160504'
    }),
    // tinted glass: the lambo's greenhouse, the rocket's porthole
    glass: mat(['#0A1018', '#142030', '#20344A', '#30506A', '#4E7A96', '#8EC0D6'], {
        line: '#05080C'
    }),
    // tyres
    rubber: mat(['#09090B', '#111216', '#1A1C21', '#25282E', '#33363D', '#464A51'], {
        line: '#050506'
    }),
    // the genesis block: dark basalt with a blue-violet sheen
    basalt: mat(['#08080E', '#11121C', '#1C1E2C', '#2A2D40', '#3E4258', '#5A6078'], {
        line: '#040408'
    }),
    // pizza box cardboard
    card: mat(['#211710', '#3D2C1C', '#5C442C', '#7B5E3D', '#A08055', '#C4A478'], {
        line: '#120C07'
    }),
    // melted cheese and baked crust
    cheese: mat(['#5A2A08', '#9A4E10', '#D4801E', '#F4AE3A', '#FFD470', '#FFF0B8'], {
        line: '#2A1404'
    }),
    // floppy disk plastic: navy and charcoal
    disk: mat(['#0A0E1C', '#141C36', '#202C52', '#2E3E70', '#44568E', '#6274AA'], {
        line: '#05070E'
    }),
    // vapour and smoke: soft warm greys
    vapour: mat(['#4A4648', '#6E6A6A', '#948E8C', '#B8B2AE', '#DAD4CE', '#F4F0EA'], {
        line: '#242022'
    }),
    // rocket exhaust, emissive
    flame: mat(['#7A2208', '#B8420E', '#F06A18', '#FF9A3A', '#FFC46E', '#FFEDBC'], {
        line: '#2A0E04',
        glow: '#FF8C3C'
    })
};

// Single colours for hand-placed details
const PHOS = { hi: '#B8FFC8', on: '#4CFF7E', mid: '#22B852', dim: '#126A30', bg: '#04140A' };
const AMBER = { hi: '#FFE6A8', on: '#FFB03A', mid: '#C8761E', dim: '#6A3A10' };

// ---- helpers --------------------------------------------------------------------------------------------

/** A small deterministic hash in [0, 1): irregularity without Math.random. */
function hash(a, b = 0, c = 0) {
    let h =
        (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1440662683)) |
        0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The ramp tone for a brightness `t` (0..5), clamped. */
const tone = (m, t) => m.ramp[Math.max(0, Math.min(m.ramp.length - 1, Math.round(t)))];

// the engine's light (top left, towards the viewer), for surfaces shaded by hand
const LIGHT = [-0.55, -0.72, 0.5].map((v) => v / Math.hypot(-0.55, -0.72, 0.5));
const shade = (nx, ny, nz) =>
    Math.max(
        0,
        Math.min(1, 0.17 + 0.76 * Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]))
    );

/**
 * A body of revolution standing upright (a silo, a rocket): row y spans cx ± r(y), each pixel lit like a
 * cylinder seen from the front. `bot(u)` (u = -1..1 across the row) cuts the bottom edge into the curve of
 * the base; `slope(y)` tilts the normal up where the profile narrows (a nose cone); `biasAt(x, y, u)`
 * paints bands and ribs into the light.
 */
function lathe(s, cx, y0, y1, r, m, o = {}) {
    const { g = 'lathe', bot = null, slope = () => 0, biasAt = () => 0 } = o;
    for (let y = Math.floor(y0); y <= y1; y++) {
        const rr = r(y + 0.5);
        if (rr <= 0) continue;
        for (let x = Math.floor(cx - rr - 1); x <= cx + rr + 1; x++) {
            const u = (x + 0.5 - cx) / rr;
            if (Math.abs(u) > 1) continue;
            if (bot && y + 0.5 > bot(u)) continue;
            const nz = Math.sqrt(Math.max(0, 1 - u * u));
            const lum = shade(u * 0.95, -slope(y + 0.5) * nz, nz) + biasAt(x, y, u);
            s.spans([[y, x, x]], m, { g, lum: Math.max(0, Math.min(1, lum)) });
        }
    }
    return s;
}

/**
 * Fill every pixel whose centre passes `inside(x, y)` in the box, as spans (light it with an `auto` group).
 * `o.biasAt(x, y)` gives each pixel its own brightness nudge.
 */
function fill(s, x0, y0, x1, y1, inside, m, o = {}) {
    for (let y = Math.floor(y0); y <= y1; y++)
        for (let x = Math.floor(x0); x <= x1; x++)
            if (inside(x + 0.5, y + 0.5))
                s.spans([[y, x, x]], m, {
                    ...o,
                    bias: (o.bias || 0) + (o.biasAt ? o.biasAt(x, y) : 0)
                });
    return s;
}

/** Paint a hex colour over the already lit pixel at (x, y), picking the tone of `m` that matches its light. */
function paint(s, x, y, m, k = 0) {
    const i = y * s.w + x;
    if (x < 0 || y < 0 || x >= s.w || y >= s.h || !s.mat[i]) return;
    s.px(x, y, tone(m, s.lum[i] * 5 + k), { line: m.line });
}

// A tiny 3×5 font for the hash engraved on the genesis block and the terminal's prompt
const HEX = {
    0: ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'],
    1: ['.X', 'XX', '.X', '.X', '.X'],
    6: ['XXX', 'X..', 'XXX', 'X.X', 'XXX'],
    8: ['XXX', 'X.X', 'XXX', 'X.X', 'XXX'],
    9: ['XXX', 'X.X', 'XXX', '..X', 'XXX'],
    D: ['XX.', 'X.X', 'X.X', 'X.X', 'XX.'],
    A: ['.X.', 'X.X', 'XXX', 'X.X', 'X.X'],
    E: ['XXX', 'X..', 'XX.', 'X..', 'XXX'],
    C: ['XXX', 'X..', 'X..', 'X..', 'XXX']
};

/** Write `str` at (x, y) with the 3×5 font, calling `put(x, y)` for each lit pixel. Returns the end x. */
function text(x, y, str, put) {
    let cx = x;
    for (const ch of str) {
        const g = HEX[ch];
        g.forEach((row, ry) => {
            for (let rx = 0; rx < row.length; rx++) if (row[rx] === 'X') put(cx + rx, y + ry);
        });
        cx += g[0].length + 1;
    }
    return cx - 1;
}

/** Draw an ASCII bitmap at (x, y), calling `put(x, y)` for every 'X'. */
function bitmap(x, y, rows, put) {
    rows.forEach((row, ry) => {
        for (let rx = 0; rx < row.length; rx++) if (row[rx] === 'X') put(x + rx, y + ry);
    });
}

// ---- props ------------------------------------------------------------------------------------------------

/**
 * 36×32 2009 CPU-mining rig: a yellowed beige tower beside a chunky CRT, a keyboard in front. The screen
 * scrolls green terminal text (somebody is mining block 1 on a laptop-class CPU); the cursor blinks.
 */
function rig(f) {
    const s = new PixelSprite(36, 32, { dither: 0.2 });
    // the tower: top face and front as one lit volume
    s.box(1, 4, 10, 4, E.beige, { g: 'tower', bias: 0.2 });
    s.box(1, 7, 10, 24, E.beige, { g: 'tower', bias: -0.04 });
    s.auto('tower', { R: 2, grad: 0.3 });
    s.line(1.5, 7.3, 10.5, 7.3, E.beige, { lum: 0.95 }); // the lit top edge
    // drive bays: a 5.25" with its tray, a 3.5" floppy slot, a blank
    s.box(2.5, 9.5, 7, 3, E.beige, { bevel: 0.8, bias: -0.05 });
    s.line(3, 11, 9, 11, E.bezel, { lum: 0.15 });
    s.box(2.5, 13.5, 7, 2.6, E.beige, { bevel: 0.8, bias: -0.05 });
    s.line(4, 14.6, 8, 14.6, E.bezel, { lum: 0.05 });
    s.px(8, 15, '#3A3A3A');
    s.box(2.5, 17, 7, 2.4, E.beige, { bevel: 0.8, bias: -0.08 });
    // power button, the HDD LED (busy, amber) and the power LED (green)
    s.circle(6, 22, 1.4, E.beige, { bias: 0.1 });
    s.px(3, 22, '#5CFF8A', { glow: '#5CFF8A' });
    s.px(3, 24, f % 2 ? AMBER.on : AMBER.dim, f % 2 ? { glow: AMBER.on } : {});
    // vent slots and a little sticker
    for (let y = 26; y <= 29; y++) s.line(3, y, 9, y, E.beige, { lum: y % 2 ? 0.3 : 0.6 });
    s.px(8, 22, '#2E5AA8').px(9, 22, '#C8C8D0').px(8, 23, '#2E5AA8').px(9, 23, '#2E5AA8');

    // the CRT: the deep tube housing behind, then the bezel, as one volume
    s.poly(
        [
            [14, 9],
            [33, 9],
            [31, 2],
            [16, 2]
        ],
        E.beige,
        { g: 'crt', bias: 0.12 }
    );
    s.box(11, 8, 24, 19, E.beige, { g: 'crt', r: 1, bias: 0 });
    s.auto('crt', { R: 2.6, grad: 0.35 });
    for (const x of [19, 21, 23, 25, 27]) s.line(x, 3.5, x, 6.5, E.beige, { lum: 0.4 }); // vents
    // the recess and the curved glass
    s.box(13, 10, 20, 14, E.bezel, { r: 1, bevel: 1.4, bias: -0.2 });
    s.box(14, 11, 18, 12, E.bezel, { r: 1.2, shade: 'flat', lum: 0 });
    for (let y = 11; y <= 22; y++)
        for (let x = 14; x <= 31; x++) {
            const i = y * s.w + x;
            if (!s.mat[i]) continue;
            const u = (x - 22.5) / 9;
            const v = (y - 16.5) / 6;
            if (u * u * 0.6 + v * v * 0.6 > 0.95) continue; // the rounded tube corners stay black
            s.px(x, y, u * u + v * v < 0.5 ? '#06200F' : PHOS.bg, { glow: '#06200F' });
        }
    // terminal text: lines of characters, the newest at the bottom; scrolls one line per frame
    const lines = [9, 14, 6, 12, 16, 8];
    for (let k = 0; k < 5; k++) {
        const y = 12 + k * 2;
        const n = lines[(k + f) % lines.length];
        const last = k === 4;
        for (let c = 0; c < (last ? 3 : n); c++) {
            if (hash(c, k + f, 5) < 0.18) continue; // spaces
            const x = 16 + c;
            s.px(x, y, last ? PHOS.on : c < 2 ? PHOS.on : PHOS.mid, { glow: PHOS.mid });
        }
        if (last) {
            s.px(16, y, PHOS.on, { glow: PHOS.on }).px(17, y, PHOS.on, { glow: PHOS.on });
            if (f % 2 === 0)
                s.px(19, y, PHOS.hi, { glow: PHOS.on }).px(20, y, PHOS.hi, { glow: PHOS.on });
        }
    }
    s.px(15, 12, '#D8FFE0', { glow: '#B8FFC8' }).px(16, 11, '#7AE89A', { glow: '#4CFF7E' }); // glare
    // the badge (no logo) and the front controls
    s.line(20, 25, 25, 25, E.bezel, { lum: 0.5 });
    for (const x of [28, 30]) s.px(x, 25, '#5A5440');
    s.px(32, 25, '#5CFF8A', { glow: '#5CFF8A' });
    // the swivel foot
    s.box(17, 26.5, 12, 2, E.beige, { r: 0.4, bevel: 0.8, bias: -0.15 });
    // the keyboard: a key deck seen from above, a darker front lip
    s.box(13, 27, 21, 3.5, E.beige, { r: 0.5, bevel: 0.8, bias: 0.1, g: 'kb' });
    s.box(13, 30, 21, 1.8, E.beige, { r: 0.4, bevel: 0.6, bias: -0.25, g: 'kb' });
    s.auto('kb', { R: 1, grad: 0.3 });
    for (let x = 14; x <= 32; x++) {
        if (x % 2) s.px(x, 28, '#82765A');
        if (x % 2 === 0 && x < 31) s.px(x, 29, '#82765A');
    }
    s.line(19, 29.5, 26, 29.5, E.beige, { lum: 0.5 }); // the space bar
    // the keyboard cable to the tower
    s.line(13, 28, 11.5, 29, E.bezel, { lum: 0.3 });
    return s.render();
}

/**
 * 22×46 server rack: a tall black cabinet, eight 1U units racked inside, each with its status LEDs blinking
 * through 4 frames in a chasing pattern (green and cyan, one amber), cable trays at the top, casters.
 */
function server(f) {
    const s = new PixelSprite(22, 46, { dither: 0.2 });
    s.box(1, 1, 20, 5, E.rack, { g: 'rack', bias: 0.22 });
    s.box(1, 5, 20, 38, E.rack, { g: 'rack' });
    s.auto('rack', { R: 2, grad: 0.4 });
    s.line(1.5, 5.3, 20.5, 5.3, E.rack, { lum: 0.85 });
    // vents on the roof
    for (const x of [5, 8, 11, 14, 17]) s.line(x, 2.5, x, 3.5, E.rack, { lum: 0.08 });
    // the open bay and its rails
    s.box(3, 7, 16, 34, E.rack, { shade: 'flat', lum: 0 });
    s.line(3.5, 7, 3.5, 40.5, E.unit, { lum: 0.5 });
    s.line(18.5, 7, 18.5, 40.5, E.unit, { lum: 0.25 });
    // the units: brushed fronts, LEDs left, drive bays or a vent grille right
    for (let i = 0; i < 8; i++) {
        const y = 8 + i * 4;
        s.box(4, y, 14, 3.4, E.unit, { bevel: 0.9, bias: 0.06 - i * 0.02 });
        for (let k = 0; k < 4; k++) {
            const on = hash(i, k, (f + i + k) % 4) > 0.45;
            const amber = i === 5 && k === 1;
            const hue = amber ? AMBER.on : (i + k) % 3 ? '#4CFF8A' : '#5CF0FF';
            const x = 5 + k;
            if (on) s.px(x, y + 1, hue, { glow: hue });
            else s.px(x, y + 1, '#1A2A24');
        }
        if (i % 3 === 1)
            for (let x = 11; x <= 16; x += 2)
                s.line(x, y + 0.8, x + 1, y + 0.8, E.unit, { lum: 0.15 });
        else for (let x = 11; x <= 16; x++) if (x % 2) s.px(x, y + 1, '#1E232C');
        s.line(4.2, y + 2.8, 17.8, y + 2.8, E.unit, { lum: 0.12 });
    }
    // a bundle of cables looping out of the top, the casters
    s.capsule(14, 1.5, 17, 0.6, 0.7, 0.7, M.cloth, { lum: 0.3, shade: 'flat' });
    s.capsule(15, 1.5, 19, 1.2, 0.7, 0.7, E.unit, { lum: 0.3, shade: 'flat' });
    for (const x of [3, 18]) s.box(x - 1, 43, 3, 2.4, E.rubber, { r: 0.8, bevel: 0.8 });
    return s.render();
}

/**
 * 30×54 DeFi yield-farm silo: a galvanized steel cylinder with riveted bands and fine ribs on a concrete
 * footing, a domed roof with a vent cap, a ladder up the shady side and a hatch; a big gold "%" painted
 * on the front (the APY, before it went to zero).
 */
function silo() {
    const s = new PixelSprite(30, 54, { dither: 0.25 });
    const cx = 15;
    const R = 11;
    // the concrete footing
    s.ellipse(cx, 50, 14, 3.4, E.concrete, { g: 'foot' });
    s.auto('foot', { R: 1.4, grad: 0.3 });
    // the cylinder: bands every 7 rows following the curve of the barrel, fine ribs between
    const curve = (u) => Math.sqrt(Math.max(0, 1 - u * u)) * 2.4;
    lathe(s, cx, 15, 52, () => R, E.galv, {
        g: 'body',
        bot: (u) => 49.5 + curve(u),
        biasAt: (x, y, u) => {
            const yb = y + 0.5 - curve(u);
            const b = (yb - 20) % 7;
            if (yb > 19 && b >= 0 && b < 1) return -0.18;
            if (yb > 19 && b >= 1 && b < 2) return 0.14;
            return x % 4 === 1 ? -0.03 : 0.06;
        }
    });
    // rivets along the bands
    for (let k = 0; k < 4; k++)
        for (let x = 6; x <= 24; x += 3) {
            const u = (x + 0.5 - cx) / R;
            paint(s, x, Math.round(20 + k * 7 + curve(u) + 1), E.galv, 1);
        }
    // the dome: an eave overhanging the barrel, lit as one round volume, with its rim in shadow
    const eave = (u) => 16.5 + Math.sqrt(Math.max(0, 1 - u * u)) * 2.6;
    const dome = (x, y) => {
        const u = (x - cx) / 12.2;
        return u * u + ((y - 17) / 9) ** 2 <= 1 && y <= eave(u);
    };
    fill(s, 2, 7, 28, 20, dome, E.galv, { g: 'dome', bias: 0.12 });
    s.auto('dome', { R: 5, grad: 0.5 });
    // the eave's rim in shadow under its lip
    for (let x = 3; x <= 26; x++)
        paint(s, x, Math.floor(eave((x + 0.5 - cx) / 12.2)), E.galv, -1.2);
    // the vent cap: a short stack under a little hat
    s.box(13.5, 5, 3, 3.5, E.galv, { bevel: 0.8, bias: -0.05 });
    s.ellipse(15, 5, 3, 1.4, E.galv, { bias: 0.15 });
    // the big gold %
    bitmap(
        10,
        25,
        [
            '.XXX....XX',
            'XX.XX..XX.',
            'XX.XX.XX..',
            '.XXX.XX...',
            '....XX....',
            '...XX.XXX.',
            '..XX.XX.XX',
            '.XX..XX.XX',
            'XX....XXX.'
        ],
        (x, y) => paint(s, x, y, M.gold, 0.6)
    );
    // the hatch at the foot of the barrel
    s.box(9, 40, 5, 8, E.galv, { r: 0.4, bevel: 1, bias: -0.15 });
    s.px(13, 44, '#C4D6D8');
    // a dark steel ladder up the shady side: two rails and rungs, standing off the barrel
    s.line(21, 17, 21, 51, E.rack, { lum: 0.6 });
    s.line(24, 17, 24, 50, E.rack, { lum: 0.35 });
    for (let y = 19; y <= 49; y += 3) s.line(22, y, 23, y, E.rack, { lum: 0.5 });
    s.line(20.5, 17, 24.5, 17, E.rack, { lum: 0.65 });
    return s.render();
}

/**
 * 26×50 "to the moon" rocket idling on a concrete launch pad: a white body with a red nose cone, a red band
 * and red fins, a round porthole; vapour and a small flame flicker at the nozzle through 4 frames.
 */
function rocket(f) {
    const s = new PixelSprite(26, 50, { dither: 0.2 });
    const cx = 13;
    // the pad: a round concrete plinth with hazard stripes round its rim
    s.ellipse(cx, 45.5, 12.4, 3.6, E.concrete, { shade: 'flat', lum: 0.18 });
    s.box(0.6, 42.5, 24.8, 3.2, E.concrete, { shade: 'flat', lum: 0.35 });
    for (let x = 1; x <= 24; x++)
        if (Math.floor((x + 1) / 2) % 2) s.px(x, 44, '#E0B030').px(x, 43, '#C89820');
    s.ellipse(cx, 42.5, 12.4, 3.4, E.concrete, { g: 'pad', bias: 0.1 });
    s.auto('pad', { R: 2, grad: 0.35 });
    s.ellipse(cx, 42.5, 5.5, 1.6, E.concrete, { shade: 'flat', lum: 0.1 }); // the flame pit
    // the side fins, behind the body
    s.poly(
        [
            [8.5, 27],
            [8.5, 37],
            [3, 40.5],
            [3, 34]
        ],
        E.rocket,
        { g: 'finL' }
    );
    s.auto('finL', { R: 1.5, grad: 0.3 });
    s.poly(
        [
            [17.5, 27],
            [17.5, 37],
            [23, 40.5],
            [23, 34]
        ],
        E.rocket,
        { g: 'finR', bias: -0.15 }
    );
    s.auto('finR', { R: 1.5, grad: 0.3 });
    // the body: an ogive nose, a straight barrel, a slight boat tail
    const r = (y) => {
        if (y < 14) return 5.6 * (1 - (1 - (y - 1) / 13) ** 2) + 0.4;
        if (y < 34) return 5.6;
        return 5.6 - (y - 34) * 0.35;
    };
    const slope = (y) => (y < 14 ? (1 - (y - 1) / 13) * 1.1 : 0);
    lathe(s, cx, 1, 37, r, M.paper, { g: 'body', slope, biasAt: () => -0.04 });
    lathe(s, cx, 1, 13, r, E.rocket, { g: 'nose', slope });
    lathe(s, cx, 25, 26.6, r, E.rocket, { g: 'band' });
    lathe(s, cx, 33.5, 34.6, r, E.rocket, { g: 'band2', biasAt: () => -0.1 });
    // the porthole: a steel ring, dark glass, a glint
    s.circle(12.3, 18.5, 2.8, M.metal, { bias: 0.05 });
    s.circle(12.3, 18.5, 1.9, E.glass, { bias: -0.1 });
    s.px(11, 17, '#C4F2FF').px(12, 17, '#8EC0D6');
    // the front fin, edge-on
    s.box(12, 30, 2, 10, E.rocket, { bevel: 0.8, bias: -0.05 });
    // the nozzle bell
    s.poly(
        [
            [10.5, 37],
            [15.5, 37],
            [16.6, 40.6],
            [9.4, 40.6]
        ],
        M.metal,
        { left: 0.55, right: 0.2 }
    );
    // idling: a short flame licking out of the bell and vapour rolling across the pad; no outline, so it
    // reads as light and steam
    const fl = [2.2, 3.2, 2.6, 3.6][f % 4];
    s.capsule(13, 40.6, 13 + (f % 2 ? 0.3 : -0.3), 40.6 + fl, 1.6, 0.4, E.flame, {
        shade: 'flat',
        lum: 0.55,
        bare: true
    });
    s.capsule(13, 40.6, 13, 40.6 + fl * 0.6, 0.9, 0.3, E.flame, {
        shade: 'flat',
        lum: 1,
        bare: true
    });
    const drift = [0, 0.8, 1.5, 2.2][f % 4];
    const puffs = [
        [8 - drift, 42.8, 2.6, 1.6, 0.75],
        [18 + drift, 42.8, 2.6, 1.6, 0.6],
        [4.5 - drift * 0.8, 43.6, 2, 1.3, 0.55],
        [21.5 + drift * 0.8, 43.6, 2, 1.3, 0.45]
    ];
    for (const [x, y, rx, ry, l] of puffs)
        s.ellipse(x, y, rx * (1 + drift * 0.08), ry, E.vapour, {
            shade: 'flat',
            lum: l,
            bare: true
        });
    for (const [x, y, rx, ry, l] of puffs.slice(0, 2))
        s.ellipse(x - 0.6, y - 0.5, rx * 0.5, ry * 0.5, E.vapour, {
            shade: 'flat',
            lum: l + 0.2,
            bare: true
        });
    return s.render();
}

/**
 * 60×22 wrecked supercar (wen lambo): a low gold wedge, nose down on a flat front tyre, a spiderweb crack
 * in the windscreen, a side intake, a rear wing, dents and scuffs. No badge: nobody ever made the payment.
 */
function lambo() {
    const s = new PixelSprite(60, 22, { dither: 0.08 });
    // the body: one wedge, its lower skirt in shade
    s.poly(
        [
            [0.5, 15.5],
            [3, 12.8],
            [21, 9.8],
            [30.5, 5],
            [42, 5.2],
            [55, 8.4],
            [59, 9.6],
            [59.4, 15],
            [56, 17],
            [3, 17.8],
            [0.5, 17]
        ],
        M.gold,
        { g: 'body' }
    );
    s.poly(
        [
            [1, 15],
            [59.2, 13],
            [59.2, 15.2],
            [56, 17.2],
            [3, 18],
            [0.6, 17]
        ],
        M.gold,
        { g: 'body', bias: -0.22 }
    );
    s.auto('body', { R: 2.6, grad: 0.4 });
    // the shoulder crease catching the light
    s.line(4, 12.6, 21, 10.2, M.gold, { lum: 0.95 });
    s.line(43, 10.6, 57, 10.3, M.gold, { lum: 0.85 });
    // wheel wells
    s.ellipse(14, 17, 5.6, 5, E.rubber, { shade: 'flat', lum: 0 });
    s.ellipse(46, 16.6, 5.8, 5.2, E.rubber, { shade: 'flat', lum: 0 });
    // the greenhouse: tinted glass, a pillar, a spiderweb crack in the windscreen
    s.poly(
        [
            [22.5, 10],
            [30.8, 5.8],
            [41.5, 6],
            [44, 9.4],
            [44, 10.2]
        ],
        E.glass,
        { top: 0.75, bot: 0.3 }
    );
    s.line(35, 6.2, 34, 10, M.gold, { lum: 0.45 });
    const crack = '#D8ECF4';
    s.pxs(
        [
            [27, 8],
            [26, 8],
            [25, 9],
            [28, 7],
            [29, 6],
            [27, 9],
            [28, 9],
            [26, 7],
            [30, 8],
            [24, 9]
        ],
        crack,
        { line: E.glass.line }
    );
    s.px(27, 8, '#FFFFFF');
    // the door seam and the side intake
    s.line(33, 10.8, 33, 14.6, M.gold, { lum: 0.4 });
    s.poly(
        [
            [36.5, 14],
            [43.8, 10.4],
            [43.8, 14]
        ],
        E.rubber,
        { lum: 0.1 }
    );
    // lights: a headlight slit, a dead taillight
    s.line(3, 13.6, 8, 13.1, M.paper, { lum: 0.8 });
    s.px(3, 13, '#FFFFFF');
    s.line(57, 10.6, 59, 10.6, E.rocket, { lum: 0.4 });
    // the rear wing on two struts
    s.line(50, 8.2, 50, 6.6, E.rubber, { lum: 0.3 });
    s.line(55, 8.7, 55, 6.2, E.rubber, { lum: 0.3 });
    s.box(48, 5, 11, 1.8, M.gold, { bevel: 0.7, bias: 0.05 });
    // a long scrape down the flank, bare metal showing
    s.pxs(
        [
            [21, 14],
            [22, 14],
            [23, 15],
            [24, 15],
            [25, 15]
        ],
        '#A3ACB8'
    );
    // wheels: the front tyre flat and bulging, the rear one still up
    s.ellipse(14, 18.2, 5, 3.6, E.rubber, { flat: 0.7 });
    s.ellipse(14, 20.4, 6, 1.2, E.rubber, { shade: 'flat', lum: 0.25 });
    s.ellipse(14, 18, 2.6, 2.2, M.metal, { bias: 0.05 });
    s.px(13, 17, '#E3E8EE').px(14, 18, '#2A3038');
    s.circle(46, 16.6, 4.6, E.rubber, { flat: 0.7 });
    s.circle(46, 16.6, 2.8, M.metal, { bias: 0.05 });
    s.pxs(
        [
            [46, 15],
            [44, 16],
            [48, 16],
            [45, 18],
            [47, 18]
        ],
        '#2A3038'
    );
    s.px(45, 15, '#E3E8EE');
    return s.render();
}

/**
 * 44×48 THE GENESIS BLOCK: a basalt cube on a low plinth, the top and front faces engraved with glowing
 * amber lines: the first eight digits of the hash across the top of the front face, a big "#0" in the
 * middle, more of the hash under it, and circuit traces on the top face. Placed at the spawn; never mirrored.
 */
function block() {
    const s = new PixelSprite(44, 48, { dither: 0.3 });
    // the plinth
    s.box(0, 38, 44, 4.5, E.basalt, { g: 'plinth', bias: 0.2 });
    s.box(0, 42, 44, 5, E.basalt, { g: 'plinth', bias: -0.1 });
    s.auto('plinth', { R: 1.6, grad: 0.3 });
    s.line(0.5, 42.2, 43.5, 42.2, E.basalt, { lum: 0.75 });
    // the cube: top face and front face, each lit as its own slab
    s.box(5, 5, 34, 9, E.basalt, { g: 'top', bias: 0.18 });
    s.auto('top', { R: 2, grad: 0.4 });
    s.box(5, 13, 34, 28, E.basalt, { g: 'front', bias: -0.02 });
    s.auto('front', { R: 2.4, grad: 0.4 });
    s.line(5.5, 13.2, 38.5, 13.2, E.basalt, { lum: 0.95 }); // the lit top edge
    // chips off the corners, a few hairline cracks
    s.cutBox(5, 5, 1, 1).cutBox(38, 5, 1, 1);
    s.pxs(
        [
            [36, 15],
            [37, 16],
            [37, 17],
            [8, 37],
            [9, 38],
            [30, 39]
        ],
        tone(E.basalt, 0)
    );
    // engraving: a carved groove (dark) with the glow sitting in it
    const etch = (x, y, hex, glow) => {
        s.px(x, y, hex, { glow, line: E.basalt.line });
        const below = (y + 1) * s.w + x;
        if (!s.color[below] && s.mat[below]) s.px(x, y + 1, tone(E.basalt, 0));
    };
    const dim = (x, y) => etch(x, y, AMBER.mid, AMBER.mid);
    // the top face: circuit traces running in from the edges to a pad in the middle
    for (let x = 9; x <= 35; x++) if (x < 18 || x > 26) s.px(x, 9, AMBER.dim, { glow: AMBER.dim });
    for (const [x, y0, y1] of [
        [12, 6, 9],
        [32, 9, 12],
        [18, 7, 11],
        [26, 7, 11]
    ])
        for (let y = y0; y <= y1; y++) s.px(x, y, AMBER.dim, { glow: AMBER.dim });
    for (let x = 19; x <= 25; x++)
        for (const y of [8, 10]) s.px(x, y, AMBER.mid, { glow: AMBER.mid });
    s.px(22, 9, AMBER.hi, { glow: AMBER.on });
    // the front: the hash, the block number, more hash
    text(7, 15, '00000000', dim);
    bitmap(
        12,
        22,
        [
            '.XX..XX.',
            '.XX..XX.',
            'XXXXXXXX',
            '.XX..XX.',
            '.XX..XX.',
            '.XX..XX.',
            'XXXXXXXX',
            '.XX..XX.',
            '.XX..XX.'
        ],
        (x, y) => etch(x, y, AMBER.on, AMBER.on)
    );
    bitmap(
        24,
        22,
        [
            '.XXXXX.',
            'XX...XX',
            'XX...XX',
            'XX..XXX',
            'XX.X.XX',
            'XXX..XX',
            'XX...XX',
            'XX...XX',
            '.XXXXX.'
        ],
        (x, y) => etch(x, y, AMBER.on, AMBER.on)
    );
    // highlights on the big glyphs
    for (const [x, y] of [
        [13, 22],
        [25, 22],
        [24, 23],
        [12, 24]
    ])
        s.px(x, y, AMBER.hi, { glow: AMBER.on });
    text(7, 34, '0019D668', dim);
    return s.render();
}

/** 18×14 pizza box, lid open: the greasy floor, two slices left of the 10,000 BTC pizza. */
function pizza() {
    const s = new PixelSprite(18, 14);
    // the lid standing open behind, its inside face towards us
    s.box(1, 0, 16, 4.5, E.card, { g: 'lid', bias: 0.12 });
    s.auto('lid', { R: 1.2, grad: 0.3 });
    s.line(1.5, 4, 16.5, 4, E.card, { lum: 0.3 });
    // the tray: the rim, the floor, the front wall
    s.box(0, 4, 18, 8.5, E.card, { g: 'tray', bias: 0.12 });
    s.auto('tray', { R: 1, grad: 0.3 });
    s.box(1.2, 4.8, 15.6, 6.8, E.card, { shade: 'flat', lum: 0.55 });
    s.box(0, 12, 18, 2, E.card, { shade: 'flat', lum: 0.3 });
    // grease rings where the rest of the pizza was
    for (const [x, y] of [
        [3, 6],
        [4, 5],
        [6, 5],
        [2, 8],
        [10, 5],
        [12, 5],
        [3, 10]
    ])
        s.px(x, y, tone(E.card, 2));
    s.px(5, 8, '#E6C27A').px(13, 6, '#E6C27A'); // crumbs
    // two slices: the front half of the pie's right side, flat-lit cheese, a crust rim, pepperoni,
    // the cut between them
    const cx = 8.5;
    const cy = 7.6;
    const pie = (x, y) => ((x - cx) / 7.4) ** 2 + ((y - cy) / 3.8) ** 2;
    for (let y = 5; y <= 11; y++)
        for (let x = 8; x <= 16; x++) {
            const d = pie(x + 0.5, y + 0.5);
            if (d > 1 || x + 0.5 < cx || y + 0.5 < cy - 0.6 * (x + 0.5 - cx) - 0.2) continue;
            s.px(
                x,
                y,
                d > 0.62 ? (y > cy + 1.5 ? '#9A4E10' : '#C87A26') : d < 0.2 ? '#FFE08A' : '#F4B23E'
            );
        }
    // the cut, straight down the middle of the pair
    for (const [x, y] of [
        [9, 8],
        [10, 9],
        [11, 10]
    ])
        s.px(x, y, '#A85A14');
    // pepperoni
    for (const [x, y] of [
        [10, 7],
        [13, 8],
        [12, 10]
    ])
        s.px(x, y, '#B8341E').px(x + 1, y, '#7E2214');
    return s.render();
}

/** 16×10 a couple of 3.5" floppies (wallet.dat, probably) and a hardware cold-wallet stick, scattered. */
function floppy() {
    const s = new PixelSprite(16, 10);
    const disk = (x, y, bias, label) => {
        s.box(x, y, 7, 7, E.disk, { r: 0.4, bevel: 1.2, bias });
        s.box(x + 2, y, 3, 2.5, M.metal, { bevel: 0.6, bias: 0.1 }); // the shutter
        s.px(x + 3, y + 1, '#2A3038');
        s.box(x + 1, y + 4, 5, 2.4, M.paper, { bevel: 0.6, bias: -0.05 }); // the label
        s.line(x + 1.5, y + 4.8, x + 4.5, y + 4.8, M.paper, { lum: 0.2 });
        s.px(x + 5, y + 5, label);
    };
    disk(6, 0, -0.12, '#C83A3A');
    disk(0, 3, 0.05, '#2E8A4A');
    // the cold-wallet stick: a dark slab with a tiny lit screen and a steel plug
    s.box(9, 7, 6, 2.6, M.cloth, { r: 0.5, bevel: 0.8, bias: 0.15 });
    s.box(14.6, 7.6, 1.4, 1.4, M.metal, { shade: 'flat', lum: 0.8 });
    s.px(10, 8, '#5CFF8A', { glow: '#4CFF7E' }).px(11, 8, '#2EB85A', { glow: '#2EB85A' });
    s.px(13, 8, '#6E7A88');
    return s.render();
}

export const PROPS = {
    eras_rig: {
        gen: rig,
        frames: 2,
        fps: 2,
        foot: 2,
        shadow: 0.9,
        light: { rgb: '80,255,130', r: 70, a: 0.5, x: 5, y: -1, flicker: 'pulse' }
    },
    eras_server: {
        gen: server,
        frames: 4,
        fps: 4,
        foot: 2,
        shadow: 0.85,
        tall: true,
        light: { rgb: '90,255,210', r: 60, a: 0.4, x: -3, y: 2, flicker: 'blink' }
    },
    eras_silo: { gen: silo, foot: 3, shadow: 0.85, tall: true },
    eras_rocket: {
        gen: rocket,
        frames: 4,
        fps: 8,
        foot: 3,
        shadow: 0.8,
        tall: true,
        light: { rgb: '255,150,70', r: 70, a: 0.45, x: 0, y: 17, flicker: 'fire' }
    },
    eras_lambo: { gen: lambo, foot: 2, shadow: 0.9 },
    eras_block: {
        gen: block,
        foot: 2,
        shadow: 0.9,
        tall: true,
        light: { rgb: '255,170,60', r: 90, a: 0.5, x: 0, y: 0, flicker: 'pulse' }
    },
    eras_pizza: { gen: pizza, foot: 2, shadow: 0.85 },
    eras_floppy: { gen: floppy, foot: 1, shadow: 0.7 }
};

// ---- decals: flat marks baked into the ground, one pair per era ----------------------------------------

/** A flat decal from an ASCII picture. */
function flat(rows, colors) {
    const s = new PixelSprite(rows[0].length, rows.length);
    s.patch(0, 0, rows, colors);
    return s.render({ outline: false });
}

/** Genesis: "0x" and a blinking-cursor block, burnt into the phosphor. */
function genesisA() {
    return flat(
        [
            '.aa.........',
            'a..a.b...b..',
            'a..a..b.b...',
            'a..a...b..cc',
            'a..a..b.b.cc',
            '.aa.b...b.cc'
        ],
        { a: '#1E8A44', b: '#16663A', c: '#2EB85A' }
    );
}

/** Genesis: a few columns of ones and zeros, fading out. */
function genesisB() {
    return flat(
        [
            'a..bb.a..bb.',
            'a.b..ba.b..b',
            'a.b..ba.b..b',
            'a..bb.a..bb.',
            '............',
            '.bb..a..bb.a',
            'b..b.a.b..ba',
            'b..b.a.b..ba',
            '.bb..a..bb.a'
        ],
        { a: '#1A7A3C', b: '#11542A' }
    );
}

/** DeFi Summer: a row of crop sprouts in a furrow. */
function defiA() {
    const sprout = ['.a.b', 'ab.b', '.bb.', '..c.'];
    const s = new PixelSprite(16, 6);
    for (const x of [0, 4, 8, 12])
        s.patch(x, x % 8 ? 0 : 1, sprout, { a: '#8CC85A', b: '#4E8A3A', c: '#3A5A26' });
    for (let x = 0; x < 16; x++) s.px(x, 5, x % 3 ? '#3A2A1A' : '#4A3622');
    return s.render({ outline: false });
}

/** DeFi Summer: a seed sack tipped over, gold grain spilling out. */
function defiB() {
    return flat(
        [
            '..aab.......',
            '.abbbb......',
            'abbbbbcd.d..',
            'abbbbcdd..d.',
            '.cccc.d.d...',
            '......d...d.'
        ],
        { a: '#C9964F', b: '#A37038', c: '#6E4A22', d: '#D8B048' }
    );
}

/** Altcoin Season: neon confetti. */
function altA() {
    return flat(
        [
            'a.....b.....',
            '....c.....a.',
            '.b........c.',
            '......a.....',
            'c..b......b.',
            '.......c.a..'
        ],
        { a: '#E040C8', b: '#40E0F0', c: '#F0E040' }
    );
}

/** Altcoin Season: a little spray-painted rocket tag, magenta with a cyan flame. */
function altB() {
    return flat(
        [
            '....a.....',
            '...aba....',
            '...a.a....',
            '...a.a....',
            '..aa.aa...',
            '..a.c.a...',
            '....c.....',
            '...c.c....'
        ],
        { a: '#D040B8', b: '#F080E0', c: '#40D0E8' }
    );
}

/** The Bear Market: a crack with a red glow seeping up from below. */
function bearA() {
    return flat(
        [
            '.........a....',
            '........ab....',
            'aa...aaab.....',
            '..aaab..aa....',
            '...b.....aaa..',
            '...........baa',
            '.............a'
        ],
        { a: '#140A0A', b: '#A02030' }
    );
}

/** The Bear Market: red candle wax, dripped and set. */
function bearB() {
    return flat(
        ['.aa.......', 'abba...a..', '.aa...aba.', '.....aab..', '..a...aa..', '.......a..'],
        {
            a: '#7A1420',
            b: '#B8283A'
        }
    );
}

export const DECALS = {
    eras_genesis_a: { gen: genesisA },
    eras_genesis_b: { gen: genesisB },
    eras_defi_a: { gen: defiA },
    eras_defi_b: { gen: defiB },
    eras_alt_a: { gen: altA },
    eras_alt_b: { gen: altB },
    eras_bear_a: { gen: bearA },
    eras_bear_b: { gen: bearB }
};
