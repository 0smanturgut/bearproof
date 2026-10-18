/**
 * @module world
 * @description The place a run happens in: the ground, the scenery, puddles, light and ambient life of each map,
 * laid out from a seeded plan that depends only on the map and the run's seed (so a Daily looks the same for
 * everyone). Render-only, like fx.js: it reads the simulation, never writes it, and nothing in the simulation
 * knows the scenery is there (creatures walk through it; it never blocks a shot).
 *
 * The world is endless, so it is built in chunks of CHUNK world units as the camera nears them:
 * - a layout (cheap, pure): the standing props, the decals, the puddles and the lights whose anchor is in it;
 * - a ground canvas at one canvas pixel per art pixel: the terrain colour field, roads and trails, with every
 *   decal stamped in. It is drawn scaled to the screen, so the floor costs one drawImage per chunk.
 * Standing props are sprites (art/props.js) the renderer sorts in with the creatures by their foot.
 */

import { DECAL_DEFS, PROP_DEFS, decal } from './art/props.js';
import { SPRITES, bakeSprite, watchCanvas } from './art/sprites.js';
import { Lighting } from './lighting.js';
import {
    BLOCK,
    CHUNK,
    ROAD,
    Terrain,
    WALK_TO,
    blockKind,
    fbm,
    hash3,
    roadDist
} from './sim/terrain.js';

export { CHUNK };
const APX = 2; // world units per art pixel
const CPX = CHUNK / APX; // art pixels per chunk side

// ------------------------------------------------------------------------------------------ hashing and noise

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

const hexRgb = (hex) => {
    const v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
const ramp = (list) => list.map(hexRgb);

/** Pick a tone from a ramp: `t` in [0, 1], ordered-dithered between neighbours at (px, py). */
function tone(r, t, px, py, dither = 0.9) {
    const n = r.length;
    let i = t * (n - 1) + (BAYER[(py & 3) * 4 + (px & 3)] - 0.5) * dither;
    i = i < 0 ? 0 : i > n - 1 ? n - 1 : Math.round(i);
    return r[i];
}

const mod = (a, n) => ((a % n) + n) % n;

// ------------------------------------------------------------------------------------------------ biomes

/**
 * Each map's world: its ground, its light and its plan. `ground(wx, wy, px, py)` returns [r, g, b] for one art
 * pixel. `plan` places props and decals: see Layout. Ambient is the night light outside every lamp (a multiply).
 */
// darkest (deep grove) to lightest (open clearing)
const GRASS = ramp([
    '#16211D',
    '#1A2722',
    '#1E2D27',
    '#22332B',
    '#273A30',
    '#2D4236',
    '#334B3C',
    '#3A5543'
]);
const DIRT = ramp(['#29231E', '#312A23', '#3A3129', '#443A30', '#4E4336']);
const MOSS = ramp(['#24382D', '#2B4334', '#33503C']);

const ASPHALT = ramp(['#1C1E24', '#212329', '#25282F', '#2A2D35', '#30333C']);
const WALK = ramp(['#33363E', '#393C45', '#40434C', '#474B54']);
const CURB = ramp(['#4C505A', '#585C66', '#646973']);
const TILE_A = ramp(['#3A3740', '#423F49', '#4A4752']);
const TILE_B = ramp(['#2C2A31', '#33313A', '#3A3741']);
const SLAB = ramp(['#30333A', '#363940', '#3C3F47', '#43464E']);
const LINE_Y = ramp(['#6E6438', '#857845']);
const LINE_W = ramp(['#6A6E78', '#7C818B']);

const SNOW = ramp([
    '#6F83A0',
    '#788CA8',
    '#8296B0',
    '#8B9FB8',
    '#95A9C1',
    '#A0B4CB',
    '#ABBFD5',
    '#B7C9DE'
]);
const ICE = ramp(['#4F7C9E', '#5A89AB', '#6696B8', '#73A4C4', '#82B2D0']);

// Market Eras: one floor per era, laid on the same 64-unit blocks. [base, block lines, the chain (its trail)]
const ERA_GROUND = {
    // 2009: a black terminal, a dim phosphor grid, scanlines
    genesis: [
        ramp(['#050E08', '#07120A', '#09160D', '#0C1B10', '#0F2013']),
        ramp(['#113320', '#17462A']),
        ramp(['#0E2716', '#12301B', '#163A21', '#1A4426', '#1F4F2C'])
    ],
    // DeFi Summer: warm soil in crop rows, a dusty farm road
    defi: [
        ramp(['#1A120B', '#21170E', '#281C12', '#2F2215', '#37281A']),
        ramp(['#26341A', '#2E3F1F']),
        ramp(['#3A2B1B', '#433221', '#4C3A27', '#56422C', '#604A31'])
    ],
    // Altcoin Season: deep violet, a magenta grid, a cyan lane
    altseason: [
        ramp(['#0C0513', '#100718', '#14091E', '#190C25', '#1E0F2C']),
        ramp(['#4A1650', '#6C1F70']),
        ramp(['#0B2731', '#0F323D', '#143D49', '#194955', '#1E5561'])
    ],
    // The Bear Market: cracked dark stone, a red seam down the chain
    bear: [
        ramp(['#120A0B', '#170D0E', '#1D1112', '#231516', '#29191A']),
        ramp(['#0A0505', '#0E0707']),
        ramp(['#260C10', '#2F1015', '#38141A', '#41181F', '#4A1C24'])
    ]
};
const ERA_IDS = ['genesis', 'defi', 'altseason', 'bear'];
// each era's night light (a multiply), and the flat colour under a chunk not baked yet
const ERA_AMBIENT = {
    genesis: [112, 152, 128],
    defi: [176, 146, 116],
    altseason: [150, 112, 176],
    bear: [166, 108, 112]
};
const ERA_BASE = { genesis: '#0A170E', defi: '#2A1E13', altseason: '#160A20', bear: '#1D1112' };

export const BIOMES = {
    chop: {
        ambient: [128, 146, 186],
        ambientLow: [205, 214, 232],
        cloud: 0.14,
        base: '#22332B'
    },
    bear_trap: {
        ambient: [138, 124, 150],
        ambientLow: [214, 206, 222],
        cloud: 0.1,
        base: '#25282F'
    },
    winter: {
        ambient: [140, 156, 196],
        ambientLow: [212, 220, 238],
        cloud: 0.12,
        base: '#8FA3BC'
    },
    // the Genesis Era's; World.setEra swaps in each later era's light and base
    eras: {
        ambient: ERA_AMBIENT.genesis,
        ambientLow: [206, 226, 212],
        cloud: 0.08,
        base: ERA_BASE.genesis
    }
};

/**
 * A map's layout as the renderer needs it: the simulation's Terrain (where every prop stands) plus what is only
 * looked at: the ground's colours, the decals and puddles baked into it.
 */
export class Layout extends Terrain {
    /** Market Eras: which era's floor and decals to paint (an ERA_IDS id). */
    era = 'genesis';

    // --- decals: one candidate per 32-unit cell, plus puddles on a 128-unit grid

    _decal(gx, gy) {
        const G = 32;
        const s = this.seed;
        const x = gx * G + 16 + (hash3(gx, gy, s + 41) - 0.5) * 26;
        const y = gy * G + 16 + (hash3(gx, gy, s + 42) - 0.5) * 26;
        const r = hash3(gx, gy, s + 43);
        const q = hash3(gx, gy, s + 44);
        const st = this.stage;
        let id = null;
        if (st === 'chop') {
            const onTrail = this.trail(x, y) < 22;
            const g = this.grove(x, y);
            if (onTrail)
                id =
                    r < 0.12
                        ? q < 0.5
                            ? 'chop_pebbles'
                            : 'chop_twigs'
                        : r < 0.16
                          ? 'chop_mud'
                          : null;
            else if (g > 0.58)
                id =
                    r < 0.3
                        ? q < 0.45
                            ? 'chop_leaves'
                            : q < 0.7
                              ? 'chop_moss'
                              : q < 0.85
                                ? 'chop_twigs'
                                : 'chop_roots'
                        : r < 0.42
                          ? 'chop_grass_c'
                          : null;
            else if (r < 0.42)
                id =
                    q < 0.3
                        ? 'chop_grass_a'
                        : q < 0.55
                          ? 'chop_grass_b'
                          : q < 0.65
                            ? 'chop_grass_c'
                            : q < 0.75
                              ? 'chop_clover'
                              : q < 0.84
                                ? 'chop_pebbles'
                                : 'chop_moss';
            else if (r < 0.52 && g < 0.42)
                id =
                    q < 0.4
                        ? 'chop_flowers_white'
                        : q < 0.7
                          ? 'chop_flowers_gold'
                          : 'chop_flowers_violet';
        } else if (st === 'bear_trap') {
            const dx = roadDist(x);
            const dy = roadDist(y);
            const road = dx < ROAD || dy < ROAD;
            if (road) {
                if (r < 0.1)
                    id = q < 0.45 ? 'trap_crack_a' : q < 0.8 ? 'trap_crack_b' : 'trap_patch';
                else if (r < 0.13) id = q < 0.25 ? 'trap_paper_a' : 'trap_stain';
                else if (r < 0.14) id = 'trap_manhole';
                else if (r < 0.145) id = q < 0.5 ? 'trap_graffiti_rekt' : 'trap_graffiti_ngmi';
            } else if (r < 0.16)
                id =
                    q < 0.08
                        ? 'trap_paper_a'
                        : q < 0.14
                          ? 'trap_paper_b'
                          : q < 0.42
                            ? 'trap_rubble_bits'
                            : q < 0.56
                              ? 'trap_glass'
                              : q < 0.76
                                ? 'trap_crack_b'
                                : q < 0.9
                                  ? 'trap_stain'
                                  : 'trap_tape';
            else if (r < 0.17 && dx > WALK_TO && dy > WALK_TO) id = 'trap_grate';
        } else if (st === 'eras') {
            // the era's own marks: glyphs, sprouts, confetti, cracks
            const tag = this.era === 'altseason' ? 'alt' : this.era; // the art calls it eras_alt_*
            if (r < 0.11) id = `eras_${tag}_${q < 0.55 ? 'a' : 'b'}`;
        } else {
            if (this.trail(x, y) < 56) id = r < 0.12 ? 'winter_crack' : null;
            else if (r < 0.2)
                id =
                    q < 0.25
                        ? 'winter_tuft'
                        : q < 0.42
                          ? 'winter_bump'
                          : q < 0.55
                            ? 'winter_pebbles'
                            : q < 0.65
                              ? 'winter_twig'
                              : q < 0.75
                                ? 'winter_tracks'
                                : q < 0.85
                                  ? 'winter_frost'
                                  : q < 0.95
                                    ? 'winter_boots'
                                    : 'winter_buried_gpu';
        }
        return id && DECAL_DEFS[id]
            ? { id, x, y, flip: !id.startsWith('trap_graffiti') && hash3(gx, gy, s + 45) < 0.5 }
            : null;
    }

    _puddle(gx, gy) {
        const G = 128;
        const s = this.seed;
        const x = gx * G + 64 + (hash3(gx, gy, s + 51) - 0.5) * 80;
        const y = gy * G + 64 + (hash3(gx, gy, s + 52) - 0.5) * 80;
        const r = hash3(gx, gy, s + 53);
        const st = this.stage;
        if (this.nearSpawn(x, y, 90) || st === 'eras') return null;
        let id = null;
        if (st === 'chop') {
            const w = this.wet(x, y);
            if (w > 0.66 && r < 0.75) id = w > 0.72 ? 'chop_puddle_l' : 'chop_puddle_m';
            else if (this.trail(x, y) < 16 && r < 0.3) id = 'chop_puddle_s';
            else if (r < 0.04) id = 'chop_puddle_s';
        } else if (st === 'bear_trap') {
            const dx = roadDist(x);
            const dy = roadDist(y);
            const nearCurb = Math.abs(dx - ROAD) < 30 || Math.abs(dy - ROAD) < 30;
            if (nearCurb && r < 0.3) id = r < 0.1 ? 'trap_puddle_m' : 'trap_puddle_s';
            else if (this.wet(x, y) > 0.68 && r < 0.5)
                id = r < 0.2 ? 'trap_puddle_l' : 'trap_puddle_m';
        } else {
            const w = this.wet(x, y);
            if (w > 0.66 && r < 0.7) id = w > 0.72 ? 'winter_ice_l' : 'winter_ice_m';
            else if (r < 0.05) id = 'winter_ice_s';
        }
        if (!id || !DECAL_DEFS[id] || this.inSet(x, y, 20)) return null;
        return { id, x, y, flip: hash3(gx, gy, s + 54) < 0.5 };
    }

    // --- the ground colour of one art pixel

    /**
     * The smooth fields the ground is painted from, at one point: grove density, distance from the trail (or the
     * river), and the terrain's tone noise. _bake samples them on a coarse grid and interpolates.
     */
    fields(wx, wy) {
        const st = this.stage;
        if (st === 'bear_trap') return [0, 0, fbm(wx, wy, 120, this.seed + 61), 0];
        return [
            this.grove(wx, wy),
            this.trail(wx, wy),
            fbm(wx, wy, st === 'chop' ? 150 : 170, this.seed + 61),
            st === 'chop' || st === 'eras' ? fbm(wx, wy, 70, this.seed + 63) : 0
        ];
    }

    /** Market Eras: the current era's floor on 64-unit blocks, with the chain (the trail) running through it. */
    _erasGround(wx, wy, px, py, F) {
        const [g, t, n, m] = F;
        const era = this.era;
        const [BASE, LINE, CHAIN] = ERA_GROUND[era] || ERA_GROUND.genesis;
        const grain = hash3(wx >> 1, wy >> 1, this.seed + 62);
        const lx = mod(wx, 64);
        const ly = mod(wy, 64);
        const block = hash3(Math.floor(wx / 64), Math.floor(wy / 64), this.seed + 66);
        const T = 34 + (grain - 0.5) * 4;
        if (t < T) {
            // the chain: a lane of linked blocks, lighter down its middle
            const k = 1 - t / T;
            const link = mod(wx + wy, 48) < 3 && era !== 'defi';
            if (era === 'bear' && Math.abs(k - 0.9) < 0.06 && grain > 0.2) return LINE[0];
            if (link) return tone(CHAIN, 0.15 + (n - 0.5) * 0.4, px, py);
            return tone(CHAIN, 0.3 + k * 0.5 + (n - 0.5) * 0.5, px, py);
        }
        if (t < T + 4) return tone(LINE, 0.2 + grain * 0.3, px, py, 1.2);
        if (era === 'genesis') {
            // a phosphor grid on black, and every other pixel row a shade darker, like a CRT
            if ((lx < 1.5 || ly < 1.5) && grain > 0.15) return tone(LINE, n, px, py);
            const scan = py & 1 ? -0.12 : 0;
            return tone(BASE, 0.45 + (n - 0.5) * 0.9 + scan + (block - 0.5) * 0.25, px, py);
        }
        if (era === 'defi') {
            // crop rows across the fields, field borders every block
            if (lx < 2 || ly < 2) return tone(BASE, 0.05, px, py);
            const row = mod(wy, 12) < 5;
            if (row && m > 0.38)
                return tone(LINE, 0.3 + (m - 0.5) * 2 + (grain - 0.5) * 0.4, px, py);
            return tone(BASE, 0.5 + (n - 0.5) * 0.9 + (block - 0.5) * 0.3, px, py);
        }
        if (era === 'altseason') {
            // a neon grid, brighter where the blocks meet
            const cross = lx < 3 && ly < 3;
            if (cross) return LINE[1];
            if (lx < 1.2 || ly < 1.2) return tone(LINE, 0.3 + n * 0.4, px, py);
            return tone(BASE, 0.45 + (n - 0.5) * 1.0 + (block - 0.5) * 0.2, px, py);
        }
        // the Bear Market: dark slabs, cracked where the noise runs thin
        if (lx < 1.5 || ly < 1.5) return LINE[0];
        if (Math.abs(fbm(wx, wy, 50, this.seed + 64) - 0.5) < 0.01) return tone(CHAIN, 0.6, px, py);
        return tone(
            BASE,
            0.5 + (n - 0.5) * 1.0 + (block - 0.5) * 0.4 - Math.max(0, g - 0.6),
            px,
            py
        );
    }

    ground(wx, wy, px, py, F = this.fields(wx, wy)) {
        const st = this.stage;
        if (st === 'eras') return this._erasGround(wx, wy, px, py, F);
        if (st === 'chop') {
            const [g, t, n, m0] = F;
            const grain = hash3(wx >> 1, wy >> 1, this.seed + 62);
            const T = 23 + (grain - 0.5) * 4;
            if (t < T) {
                // the trail: packed dirt, lighter down its middle, two darker ruts
                const k = 1 - t / T;
                const rut = Math.abs(k - 0.45) < 0.08 ? -0.25 : 0;
                return tone(DIRT, 0.3 + k * 0.4 + rut + (n - 0.5) * 0.5, px, py);
            }
            if (t < T + 5) return tone(DIRT, 0.05 + (n - 0.5) * 0.3, px, py, 1.4);
            // grass blades: short vertical strokes a tone lighter, and dark gaps between tufts
            const blade = hash3(px, py >> 1, this.seed + 65);
            const lift = blade > 0.9 ? 0.22 : blade < 0.06 ? -0.2 : 0;
            if (g > 0.6) {
                const m = m0;
                if (m > 0.7) return tone(MOSS, (m - 0.7) * 3 + lift, px, py);
            }
            // open grass is lighter, the groves darker, with a dithered shift between them
            return tone(GRASS, 0.62 + (n - 0.5) * 0.9 + lift - Math.max(0, g - 0.42) * 2.2, px, py);
        }
        if (st === 'winter') {
            const [g, t, n] = F;
            const grain = hash3(wx >> 1, wy >> 1, this.seed + 62);
            if (t < 54) {
                // the frozen river: blue ice with long cracks and frost streaks
                const crack = Math.abs(fbm(wx, wy, 60, this.seed + 64) - 0.5) < 0.012;
                if (crack) return ICE[0];
                const streak = Math.sin((wx * 0.7 + wy * 0.3) / 7 + n * 9) > 0.93;
                return tone(
                    ICE,
                    0.45 + (n - 0.5) * 1.2 + (streak ? 0.45 : 0) + (1 - t / 54) * 0.15,
                    px,
                    py
                );
            }
            if (t < 62) return tone(SNOW, 0.95, px, py); // a bank of fresh snow along the ice
            // sastrugi: wind ripples in the snow
            const rip = Math.sin((wx * 0.8 + wy * 0.6) / 10 + n * 7) * 0.06;
            return tone(
                SNOW,
                0.62 + (n - 0.5) * 1.1 + rip + (grain - 0.5) * 0.1 - Math.max(0, g - 0.5) * 1.6,
                px,
                py
            );
        }
        return this._cityGround(wx, wy, px, py, F[2]);
    }

    _cityGround(wx, wy, px, py, n) {
        const dx = roadDist(wx);
        const dy = roadDist(wy);
        const grain = hash3(wx >> 1, wy >> 1, this.seed + 62);
        const asphalt = (bias = 0) =>
            tone(ASPHALT, 0.45 + (n - 0.5) * 1.3 + (grain - 0.5) * 0.3 + bias, px, py);
        if (dx < ROAD || dy < ROAD) {
            const both = dx < ROAD && dy < ROAD;
            const lx = mod(wx + BLOCK / 2, BLOCK) - BLOCK / 2;
            const ly = mod(wy + BLOCK / 2, BLOCK) - BLOCK / 2;
            if (both) {
                // crossings: zebra stripes across each arm's mouth
                const zx =
                    Math.abs(ly) > ROAD - 34 &&
                    Math.abs(ly) < ROAD - 8 &&
                    mod(wx, 24) < 12 &&
                    Math.abs(lx) < ROAD - 10;
                const zy =
                    Math.abs(lx) > ROAD - 34 &&
                    Math.abs(lx) < ROAD - 8 &&
                    mod(wy, 24) < 12 &&
                    Math.abs(ly) < ROAD - 10;
                if ((zx || zy) && grain > 0.05) return tone(LINE_W, n, px, py);
                return asphalt();
            }
            // lane markings: a dashed double line on the centre, worn
            const along = dx < ROAD ? wy : wx;
            const across = dx < ROAD ? lx : ly;
            const centre = Math.abs(across) < 4 && Math.abs(across) > 0.8 && mod(along, 72) < 40;
            if (centre && grain > 0.08) return tone(LINE_Y, n, px, py);
            const edge = Math.abs(Math.abs(across) - (ROAD - 10)) < 1.6 && grain > 0.3;
            if (edge) return tone(LINE_W, n * 0.6, px, py);
            return asphalt(Math.abs(across) > ROAD - 14 ? -0.1 : 0);
        }
        if (dx < ROAD + 6 || dy < ROAD + 6) return tone(CURB, 0.5 + (n - 0.5), px, py);
        if (dx < WALK_TO || dy < WALK_TO) {
            // sidewalk slabs, 32 units square, a joint between them
            const jx = mod(wx, 32) < 2;
            const jy = mod(wy, 32) < 2;
            if (jx || jy) return WALK[0];
            const slab = hash3(Math.floor(wx / 32), Math.floor(wy / 32), this.seed + 66);
            return tone(WALK, 0.35 + slab * 0.5 + (grain - 0.5) * 0.25, px, py);
        }
        const bx = Math.floor((wx + BLOCK / 2) / BLOCK);
        const by = Math.floor((wy + BLOCK / 2) / BLOCK);
        const kind = blockKind(bx, by, this.seed);
        if (kind === 'ruin') {
            const { x0, y0, x1, y1 } = this._ruinRect(bx, by);
            if (wx > x0 && wx < x1 && wy > y0 && wy < y1) {
                // the gutted floor: a chequer of dark marble, cracked and missing tiles
                const tx = Math.floor((wx - x0) / 24);
                const ty = Math.floor((wy - y0) / 24);
                // tiles torn out in patches, not at random
                const gone = hash3(tx, ty, this.seed + 67) < Math.max(0, n - 0.55) * 1.6;
                if (gone) return asphalt(-0.15);
                if (mod(wx - x0, 24) < 1.5 || mod(wy - y0, 24) < 1.5) return TILE_B[0];
                return (tx + ty) & 1 ? tone(TILE_A, n, px, py) : tone(TILE_B, n, px, py);
            }
            return asphalt(-0.05);
        }
        if (kind === 'plaza') {
            // big stone slabs, 64 units
            if (mod(wx, 64) < 2 || mod(wy, 64) < 2) return SLAB[0];
            const slab = hash3(Math.floor(wx / 64), Math.floor(wy / 64), this.seed + 68);
            return tone(SLAB, 0.3 + slab * 0.6 + (grain - 0.5) * 0.25, px, py);
        }
        // a parking lot: asphalt with painted bays
        const bay = mod(wx, 96) < 2 && mod(wy, 256) < 120;
        if (bay && grain > 0.25) return tone(LINE_W, 0.2, px, py);
        return asphalt(0.05);
    }

    // --- one chunk's contents

    chunk(ci, cj) {
        const props = this.chunkProps(ci, cj);
        const decals = [];
        const waters = [];
        for (let gy = cj * 2; gy < cj * 2 + 2; gy++)
            for (let gx = ci * 2; gx < ci * 2 + 2; gx++) {
                const pd = this._puddle(gx, gy);
                if (pd) decals.push(pd);
            }
        for (let gy = cj * 8; gy < cj * 8 + 8; gy++)
            for (let gx = ci * 8; gx < ci * 8 + 8; gx++) {
                const d = this._decal(gx, gy);
                if (d) decals.push(d);
            }
        for (const d of decals) {
            const def = DECAL_DEFS[d.id];
            const dd = decal(d.id);
            if (def?.water && dd)
                waters.push({
                    ...d,
                    rx: (dd.w - 4) * 0.5 * APX * 0.5,
                    ry: (dd.h - 3) * 0.5 * APX * 0.5,
                    ice: !!def.ice
                });
        }
        const steam = decals.filter((d) => DECAL_DEFS[d.id]?.steam);
        const lights = [];
        for (const p of props) {
            const l = PROP_DEFS[p.id]?.light;
            if (l) lights.push({ p, l });
        }
        return { ci, cj, props, decals, waters, steam, lights, canvas: null };
    }
}

// ------------------------------------------------------------------------------------------ ground baking

const decalPixels = new Map();

/** A decal as a flat list of [dx, dy, r, g, b] (its transparent pixels left out), cached. */
function decalPx(id, flip) {
    const key = `${id}|${flip}`;
    if (decalPixels.has(key)) return decalPixels.get(key);
    const d = decal(id);
    const out = [];
    if (d) {
        const rows = d.frames[0];
        const rgb = {};
        for (const [ch, hex] of Object.entries(d.colors)) rgb[ch] = hexRgb(hex);
        for (let y = 0; y < d.h; y++)
            for (let x = 0; x < d.w; x++) {
                const ch = rows[y][x];
                if (ch === '.') continue;
                const c = rgb[ch];
                out.push([flip ? d.w - 1 - x : x, y, c[0], c[1], c[2]]);
            }
    }
    const v = { w: d?.w || 0, h: d?.h || 0, px: out };
    decalPixels.set(key, v);
    return v;
}

function makeCanvas(w, h) {
    const doc = globalThis.document;
    if (!doc) return null;
    const c = doc.createElement('canvas');
    c.width = w;
    c.height = h;
    return watchCanvas(c);
}

// --------------------------------------------------------------------------------------------------- World

export class World {
    constructor() {
        this.layout = null;
        this.key = '';
        this.chunks = new Map();
        this.lightCanvas = null;
        this.blobs = {};
        this.life = [];
        this.prints = [];
        this.stains = [];
        this.ripples = [];
        this.steamPuffs = [];
        this.rain = [];
        this.lastPrint = 0;
        this.printSide = 1;
        this.quality = 'high';
    }

    /** Follow the run: a new map or seed means a new world; on Market Eras, a new era means a new floor. */
    sync(stageId, seed, era = null) {
        const key = `${stageId}|${seed}`;
        if (key !== this.key) {
            this.key = key;
            this.stageId = BIOMES[stageId] ? stageId : 'chop';
            this.biome = BIOMES[this.stageId];
            this.layout = new Layout(this.stageId, seed);
            this.chunks.clear();
            this.life.length = 0;
            this.prints.length = 0;
            this.stains.length = 0;
            this.ripples.length = 0;
            this.steamPuffs.length = 0;
        }
        if (this.stageId === 'eras') this.setEra(era || 'genesis');
    }

    /** Market Eras: paint the floor, decals and night of era `id`. The props stay where they are. */
    setEra(id) {
        if (!ERA_GROUND[id] || this.layout.era === id) return;
        this.layout.era = id;
        this.biome = { ...BIOMES.eras, ambient: ERA_AMBIENT[id], base: ERA_BASE[id] };
        this.chunks.clear();
        this.stains.length = 0;
    }

    /** After a lost canvas context every baked ground canvas may be blank: bake them again. */
    dropCaches() {
        for (const c of this.chunks.values()) c.canvas = null;
        this.lightCanvas = null;
        this.blobs = {};
    }

    _chunk(ci, cj) {
        const key = ci * 65536 + cj;
        let c = this.chunks.get(key);
        if (!c) {
            c = this.layout.chunk(ci, cj);
            this.chunks.set(key, c);
        }
        return c;
    }

    _bake(c) {
        const cv = makeCanvas(CPX, CPX);
        if (!cv) return;
        const g = cv.getContext('2d');
        const img = g.createImageData(CPX, CPX);
        const d = img.data;
        const x0 = c.ci * CHUNK;
        const y0 = c.cj * CHUNK;
        const L = this.layout;
        // the smooth fields on a grid every FS art px, bilinearly interpolated in between (16x fewer noise calls)
        const FS = 4;
        const FN = CPX / FS + 1;
        const grid = new Float32Array(FN * FN * 4);
        for (let j = 0; j < FN; j++)
            for (let i = 0; i < FN; i++) {
                const f = L.fields(x0 + i * FS * APX + 1, y0 + j * FS * APX + 1);
                grid.set(f, (j * FN + i) * 4);
            }
        const F = [0, 0, 0, 0];
        for (let py = 0; py < CPX; py++)
            for (let px = 0; px < CPX; px++) {
                const gi = (px / FS) | 0;
                const gj = (py / FS) | 0;
                const u = (px % FS) / FS;
                const v = (py % FS) / FS;
                const a = (gj * FN + gi) * 4;
                const b2 = a + 4;
                const c2 = a + FN * 4;
                const d2 = c2 + 4;
                for (let q = 0; q < 4; q++) {
                    const top = grid[a + q] + (grid[b2 + q] - grid[a + q]) * u;
                    const bot = grid[c2 + q] + (grid[d2 + q] - grid[c2 + q]) * u;
                    F[q] = top + (bot - top) * v;
                }
                const [r, gg, b] = L.ground(
                    x0 + px * APX + 1,
                    y0 + py * APX + 1,
                    px + c.ci * CPX,
                    py + c.cj * CPX,
                    F
                );
                const i = (py * CPX + px) * 4;
                d[i] = r;
                d[i + 1] = gg;
                d[i + 2] = b;
                d[i + 3] = 255;
            }
        // every decal that reaches into this chunk, from it and its neighbours
        const stamp = (dc) => {
            const dp = decalPx(dc.id, dc.flip);
            const ox = Math.round((dc.x - x0) / APX - dp.w / 2);
            const oy = Math.round((dc.y - y0) / APX - dp.h / 2);
            if (ox > CPX || oy > CPX || ox + dp.w < 0 || oy + dp.h < 0) return;
            for (const [dx, dy, r, gg, b] of dp.px) {
                const x = ox + dx;
                const y = oy + dy;
                if (x < 0 || y < 0 || x >= CPX || y >= CPX) continue;
                const i = (y * CPX + x) * 4;
                d[i] = r;
                d[i + 1] = gg;
                d[i + 2] = b;
            }
        };
        const order = [];
        for (let j = -1; j <= 1; j++)
            for (let i = -1; i <= 1; i++)
                for (const dc of this._chunk(c.ci + i, c.cj + j).decals) order.push(dc);
        // puddles first (they're big), then the small marks over them; in a fixed order so seams agree
        order.sort(
            (a, b) =>
                (DECAL_DEFS[b.id]?.water ? 1 : 0) - (DECAL_DEFS[a.id]?.water ? 1 : 0) ||
                a.y - b.y ||
                a.x - b.x
        );
        for (const dc of order) stamp(dc);
        g.putImageData(img, 0, 0);
        c.canvas = cv;
    }

    /** Chunk index range covering a world rectangle. */
    _range(x0, y0, x1, y1) {
        return [
            Math.floor(x0 / CHUNK),
            Math.floor(y0 / CHUNK),
            Math.floor(x1 / CHUNK),
            Math.floor(y1 / CHUNK)
        ];
    }

    /**
     * Bake what's on screen (and a ring around it, a few per frame), forget what's far away. Call once a frame
     * before drawing. `halfW`/`halfH`: the view's half extents in world units.
     */
    prepare(cx, cy, halfW, halfH) {
        const [a0, b0, a1, b1] = this._range(
            cx - halfW - 40,
            cy - halfH - 40,
            cx + halfW + 40,
            cy + halfH + 40
        );
        for (let j = b0; j <= b1; j++)
            for (let i = a0; i <= a1; i++) {
                const c = this._chunk(i, j);
                if (!c.canvas) this._bake(c);
            }
        // the next ring, on a time budget (at least one a frame), so walking never waits on a bake
        const t0 = globalThis.performance?.now() ?? 0;
        let done = false;
        for (let j = b0 - 1; j <= b1 + 1 && !done; j++)
            for (let i = a0 - 1; i <= a1 + 1 && !done; i++) {
                const c = this._chunk(i, j);
                if (c.canvas) continue;
                this._bake(c);
                done = (globalThis.performance?.now() ?? 0) - t0 > 3;
            }
        if (this.chunks.size > 140) {
            for (const [key, c] of this.chunks) {
                if (c.ci < a0 - 4 || c.ci > a1 + 4 || c.cj < b0 - 4 || c.cj > b1 + 4)
                    this.chunks.delete(key);
            }
        }
    }

    /** The ground: one scaled drawImage per chunk, edges rounded to whole device pixels so chunks meet exactly. */
    drawGround(ctx, X, Y, cx, cy, halfW, halfH) {
        const [a0, b0, a1, b1] = this._range(cx - halfW, cy - halfH, cx + halfW, cy + halfH);
        ctx.imageSmoothingEnabled = false;
        for (let j = b0; j <= b1; j++) {
            const ya = Math.round(Y(j * CHUNK));
            const yb = Math.round(Y((j + 1) * CHUNK));
            for (let i = a0; i <= a1; i++) {
                const c = this._chunk(i, j);
                const xa = Math.round(X(i * CHUNK));
                const xb = Math.round(X((i + 1) * CHUNK));
                if (c.canvas) ctx.drawImage(c.canvas, xa, ya, xb - xa, yb - ya);
                else {
                    ctx.fillStyle = this.biome.base;
                    ctx.fillRect(xa, ya, xb - xa, yb - ya);
                }
            }
        }
    }

    /** Every chunk whose props could show in the view (props reach up to ~140 units above their foot). */
    *visibleChunks(cx, cy, halfW, halfH) {
        const [a0, b0, a1, b1] = this._range(
            cx - halfW - 70,
            cy - halfH - 30,
            cx + halfW + 70,
            cy + halfH + 150
        );
        for (let j = b0; j <= b1; j++) for (let i = a0; i <= a1; i++) yield this._chunk(i, j);
    }
}

// ------------------------------------------------------------------------------------------ map previews

/**
 * Paint a still of a map at night into a 2D context (the Free Run picker's cards): its ground and scenery around
 * world point `at`, plus `extra` creatures ({ id, x, y, flip } in world units) sorted in with the props, then the
 * night and its lights. `scale`: canvas px per art px (2 keeps one canvas px per world unit).
 */
export function paintScene(ctx, W, H, { stage, seed = 7, at = [0, 0], scale = 2, extra = [] }) {
    const world = new World();
    world.sync(stage, seed);
    const per = scale / APX; // canvas px per world unit
    const hw = W / per / 2;
    const hh = H / per / 2;
    const [cx, cy] = at;
    world.prepare(cx, cy, hw, hh);
    const X = (wx) => (wx - cx) * per + W / 2;
    const Y = (wy) => (wy - cy) * per + H / 2;
    world.drawGround(ctx, X, Y, cx, cy, hw, hh);
    const items = [];
    for (const c of world.visibleChunks(cx, cy, hw, hh)) for (const p of c.props) items.push(p);
    for (const e of extra) items.push({ ...e, creature: true });
    items.sort((a, b) => a.y - b.y);
    const lights = [];
    for (const it of items) {
        const sd = SPRITES[it.id];
        const sc = it.scale || scale;
        const img = sd && bakeSprite(it.id, sc, { flip: it.flip })?.[it.frame || 0];
        if (!img) continue;
        const meta = it.creature ? null : PROP_DEFS[it.id];
        const foot = meta ? (meta.foot ?? 2) : 2;
        const sx = X(it.x);
        const sy = Y(it.y) - (sd.h / 2 - foot) * sc;
        if (sx < -img.width || sx > W + img.width || sy < -img.height || sy > H + img.height)
            continue;
        // a soft contact shadow
        const sh = meta ? (meta.shadow ?? 0.8) : 0.8;
        if (sh > 0) {
            const g = ctx.createRadialGradient(sx, Y(it.y), 0, sx, Y(it.y), (sd.w * sc * sh) / 2);
            g.addColorStop(0, 'rgba(0,0,0,0.5)');
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.save();
            ctx.translate(sx, Y(it.y));
            ctx.scale(1, 0.34);
            ctx.translate(-sx, -Y(it.y));
            ctx.fillRect(sx - sd.w * sc, Y(it.y) - sd.w * sc, sd.w * sc * 2, sd.w * sc * 2);
            ctx.restore();
        }
        ctx.drawImage(img, Math.round(sx - img.width / 2), Math.round(sy - img.height / 2));
        const l = meta?.light;
        if (l)
            lights.push([
                sx + (it.flip ? -(l.x || 0) : l.x || 0) * sc,
                sy + (l.y || 0) * sc,
                l.r * per,
                l.rgb,
                l.a
            ]);
        if (it.id === 'bull' || it.light) lights.push([sx, sy, 300 * per, '255,238,214', 0.55]);
    }
    if (typeof document === 'undefined') return;
    const L = new Lighting();
    L.begin();
    for (const [x, y, r, rgb, a] of lights) L.add(x, y, r, rgb, a);
    L.apply(ctx, W, H, {
        ambient: BIOMES[world.stageId].ambient,
        cloud: 0,
        cam: { x: cx, y: cy },
        s: per,
        t: 0
    });
    // the glow of the lights themselves, over the night
    ctx.globalCompositeOperation = 'lighter';
    for (const [x, y, r, rgb, a] of lights) {
        if (r > 250 * per) continue;
        const rr = Math.min(90 * per, r * 0.32);
        ctx.globalAlpha = Math.min(1, a * 0.5);
        ctx.drawImage(L.blob(rgb), x - rr, y - rr, rr * 2, rr * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
}

export { ERA_IDS };

/** Build a decal's pixels ahead of need (the renderer warms a map's decals a few a frame). */
export function warmDecal(id) {
    decalPx(id, false);
    decalPx(id, true);
}
