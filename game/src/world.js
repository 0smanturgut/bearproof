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

export const CHUNK = 256; // world units per chunk side
const APX = 2; // world units per art pixel
const CPX = CHUNK / APX; // art pixels per chunk side

// ------------------------------------------------------------------------------------------ hashing and noise

function hash3(x, y, s) {
    let h =
        Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b9);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1). */
function vnoise(x, y, s) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = hash3(xi, yi, s);
    const b = hash3(xi + 1, yi, s);
    const c = hash3(xi, yi + 1, s);
    const d = hash3(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Three octaves of value noise, roughly in [0, 1], mean 0.5. `scale` is the feature size in world units. */
function fbm(x, y, scale, s) {
    const f = 1 / scale;
    return (
        vnoise(x * f, y * f, s) * 0.57 +
        vnoise(x * f * 2.03, y * f * 2.03, s + 17) * 0.29 +
        vnoise(x * f * 4.11, y * f * 4.11, s + 31) * 0.14
    );
}

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
    }
};

// ----------------------------------------------------------------------------------------- the city grid

const BLOCK = 1024; // a street grid: roads every BLOCK units, both ways, crossing at the origin
const ROAD = 88; // half the asphalt's width
const WALK_TO = 132; // the sidewalk ends (the block begins) this far from a road's centre line

/** Distance from the nearest road centre line, along one axis. */
const roadDist = (u) => Math.abs(mod(u + BLOCK / 2, BLOCK) - BLOCK / 2);

/** What a city block is: 'ruin' (a gutted building), 'plaza' (the exchange's colonnade) or 'lot'. */
function blockKind(bx, by, seed) {
    if (bx === 0 && by === 0) return 'plaza';
    const h = hash3(bx, by, seed + 909);
    return h < 0.45 ? 'ruin' : h < 0.72 ? 'plaza' : 'lot';
}

// --------------------------------------------------------------------------------------------- the plan

// Props with words or a chart on them: mirrored, REKT would read backwards and a crash would read as a pump.
const NO_FLIP = new Set([
    'trap_wall_a',
    'trap_wall_b',
    'trap_wall_corner',
    'trap_boxes',
    'trap_ticker',
    'trap_monitor',
    'trap_newsbox',
    'winter_atm',
    'winter_flag',
    'chop_monolith',
    'trap_graffiti_rekt',
    'trap_graffiti_ngmi'
]);

/** One standing prop instance. */
function prop(id, x, y, flip = false) {
    flip = flip && !NO_FLIP.has(id);
    return { prop: true, id, x, y, flip, fade: 1, phase: hash3(x | 0, y | 0, 7) * 100 };
}

/**
 * The deterministic plan of one map for one seed. Everything is a pure function of world position, so any
 * chunk can be laid out alone and neighbours always agree.
 */
export class Layout {
    constructor(stageId, seed) {
        this.stage = BIOMES[stageId] ? stageId : 'chop';
        this.seed = (seed >>> 0) % 100000;
        this._big = new Map();
        this._sets = new Map();
    }

    has(id) {
        return !!PROP_DEFS[id];
    }

    // --- fields

    grove(x, y) {
        return fbm(x, y, 620, this.seed + 1);
    }
    /**
     * Distance in world units from the trail's centre line (Chop Zone's dirt path, Crypto Winter's frozen river):
     * where a slow noise field crosses 0.5, divided by its slope so the line keeps one width. Where the field
     * lies flat there's no line (a flat stretch near 0.5 would otherwise pool into a round blob).
     */
    trail(x, y) {
        const s = this.seed + 2;
        const f = fbm(x + 3000, y - 1700, 1150, s);
        const gx = fbm(x + 3008, y - 1700, 1150, s) - fbm(x + 2992, y - 1700, 1150, s);
        const gy = fbm(x + 3000, y - 1692, 1150, s) - fbm(x + 3000, y - 1708, 1150, s);
        const g = Math.hypot(gx, gy) / 16;
        if (g < 0.00022) return 1e9;
        return Math.abs(f - 0.5) / g;
    }
    wet(x, y) {
        return fbm(x - 800, y + 400, 430, this.seed + 3);
    }

    /** The spawn clearing: nothing tall within this many units of the origin. */
    nearSpawn(x, y, r) {
        return x * x + y * y < r * r;
    }

    // --- set pieces: a camp, a monolith, a mining camp... one per REGION at most, anchored by hash

    /** The set piece anchored in region (rx, ry), or null. Includes the spawn's own scene in region (0, 0). */
    setAt(rx, ry) {
        const key = `${rx},${ry}`;
        if (this._sets.has(key)) return this._sets.get(key);
        const R = 1536;
        let set = null;
        if (rx === 0 && ry === 0) set = { kind: 'spawn', x: 0, y: 0, r: 230 };
        else {
            const h = hash3(rx, ry, this.seed + 404);
            const x = rx * R + 300 + hash3(rx, ry, this.seed + 405) * (R - 600);
            const y = ry * R + 300 + hash3(rx, ry, this.seed + 406) * (R - 600);
            const st = this.stage;
            if (st === 'chop') {
                if (h < 0.55) set = { kind: 'camp', x, y, r: 230 };
                else if (h < 0.8) set = { kind: 'monolith', x, y, r: 150 };
            } else if (st === 'winter') {
                if (h < 0.55) set = { kind: 'mine', x, y, r: 250 };
                else if (h < 0.75) set = { kind: 'atm', x, y, r: 120 };
                else if (h < 0.9) set = { kind: 'crystals', x, y, r: 160 };
            }
            // the city's set pieces are its blocks
        }
        this._sets.set(key, set);
        return set;
    }

    /** The set pieces whose clearing could reach (x, y). */
    setsNear(x, y) {
        const R = 1536;
        const rx = Math.floor(x / R);
        const ry = Math.floor(y / R);
        const out = [];
        for (let j = -1; j <= 1; j++)
            for (let i = -1; i <= 1; i++) {
                const s = this.setAt(rx + i, ry + j);
                if (s) out.push(s);
            }
        return out;
    }

    inSet(x, y, pad = 0) {
        for (const s of this.setsNear(x, y)) {
            const r = s.r + pad;
            if ((x - s.x) * (x - s.x) + (y - s.y) * (y - s.y) < r * r) return true;
        }
        return false;
    }

    /** The props of a set piece, relative to its anchor (only the ones that exist in this build's art). */
    setProps(set) {
        const P = (id, dx, dy, flip = false) => [id, set.x + dx, set.y + dy, flip];
        let list = [];
        const st = this.stage;
        if (set.kind === 'spawn') {
            if (st === 'chop')
                list = [
                    P('chop_campfire', -150, 46),
                    P('chop_log_pile', -214, 4),
                    P('chop_stump_axe', -96, 104),
                    P('chop_lantern', -70, -96),
                    P('chop_signpost', 112, -70),
                    P('chop_tent', -246, 96),
                    P('chop_stump', 150, 96),
                    P('chop_fence', 210, -10)
                ];
            else if (st === 'bear_trap')
                list = [
                    P('trap_barrier', -40, -190),
                    P('trap_cone', -96, -176),
                    P('trap_cone', 30, -200),
                    P('trap_siren', -150, -160),
                    P('trap_barrel', 160, 150),
                    P('trap_boxes', 196, 120),
                    P('trap_beartrap', 64, 62)
                ];
            else
                list = [
                    P('winter_campfire', -140, 50),
                    P('winter_snowbear', 130, -80),
                    P('winter_lamp', -86, -104),
                    P('winter_sled', 160, 96),
                    P('winter_rock_small', -200, 10),
                    P('winter_flag', 220, -20)
                ];
        } else if (set.kind === 'camp') {
            list = [
                P('chop_campfire', 0, 0),
                P('chop_tent', -96, -56),
                P('chop_log_pile', 96, -46),
                P('chop_stump_axe', -70, 66, true),
                P('chop_lantern', 70, 54),
                P('chop_sawhorse', 140, 30),
                P('chop_stump', -150, 20),
                P('chop_stump', 30, 120),
                P('chop_fence', -40, -140)
            ];
        } else if (set.kind === 'monolith') {
            list = [
                P('chop_monolith', 0, 0),
                P('chop_rock', -60, 30),
                P('chop_mushrooms', 50, 36),
                P('chop_mushrooms', -36, -40)
            ];
        } else if (set.kind === 'mine') {
            list = [
                P('winter_rig', -70, -40),
                P('winter_rig', 0, -52),
                P('winter_rig', 70, -40),
                P('winter_lamp', -140, -60),
                P('winter_campfire', 10, 60),
                P('winter_igloo', 150, 40),
                P('winter_sled', -110, 70, true),
                P('winter_flag', 120, -90)
            ];
        } else if (set.kind === 'atm') {
            list = [
                P('winter_atm', 0, 0),
                P('winter_drift', 44, 26),
                P('winter_rock_small', -40, 20)
            ];
        } else if (set.kind === 'crystals') {
            list = [
                P('winter_crystal', 0, 0),
                P('winter_crystal', -50, 30, true),
                P('winter_crystal', 44, 38),
                P('winter_rock', 90, -10),
                P('winter_crystal', -10, -54, true)
            ];
        }
        return list.filter(([id]) => this.has(id));
    }

    // --- the big layer: one candidate per 128-unit cell (trees, walls, cars...)

    big(gx, gy) {
        const key = `${gx},${gy}`;
        if (this._big.has(key)) return this._big.get(key);
        const v = this._bigPick(gx, gy);
        this._big.set(key, v);
        return v;
    }

    _bigPick(gx, gy) {
        const G = 128;
        const s = this.seed;
        const x = gx * G + 64 + (hash3(gx, gy, s + 11) - 0.5) * 84;
        const y = gy * G + 64 + (hash3(gx, gy, s + 12) - 0.5) * 84;
        const r = hash3(gx, gy, s + 13);
        const q = hash3(gx, gy, s + 14);
        const flip = hash3(gx, gy, s + 15) < 0.5;
        const st = this.stage;
        if (st === 'bear_trap') return this._cityBig(x, y, r, q, flip);
        if (this.nearSpawn(x, y, 190) || this.inSet(x, y, 40)) return null;
        let id = null;
        if (st === 'chop') {
            if (this.trail(x, y) < 44) return null;
            const g = this.grove(x, y);
            if (g > 0.58 && r < 0.8)
                id =
                    q < 0.42
                        ? 'chop_pine_a'
                        : q < 0.74
                          ? 'chop_pine_b'
                          : q < 0.9
                            ? 'chop_oak'
                            : 'chop_pine_small';
            else if (g > 0.47 && r < 0.42)
                id = q < 0.5 ? 'chop_pine_b' : q < 0.8 ? 'chop_oak' : 'chop_dead_tree';
            else if (r < 0.1)
                id =
                    q < 0.3
                        ? 'chop_boulder'
                        : q < 0.55
                          ? 'chop_fallen_log'
                          : q < 0.75
                            ? 'chop_dead_tree'
                            : 'chop_oak';
        } else {
            if (this.trail(x, y) < 86) return null; // the frozen river
            const g = this.grove(x, y);
            if (g > 0.6 && r < 0.88)
                id = q < 0.45 ? 'winter_pine_a' : q < 0.8 ? 'winter_pine_b' : 'winter_pine_small';
            else if (g > 0.5 && r < 0.35) id = q < 0.6 ? 'winter_pine_b' : 'winter_dead_tree';
            else if (r < 0.12)
                id =
                    q < 0.3
                        ? 'winter_rock'
                        : q < 0.5
                          ? 'winter_drift'
                          : q < 0.68
                            ? 'winter_dead_tree'
                            : q < 0.8
                              ? 'winter_cabin_ruin'
                              : 'winter_pine_small';
        }
        return id && this.has(id) ? prop(id, x, y, flip) : null;
    }

    /** The city's big layer: walls around gutted buildings, colonnades on plazas, wrecks in lots and streets. */
    _cityBig(x, y, r, q, flip) {
        const dx = roadDist(x);
        const dy = roadDist(y);
        if (this.nearSpawn(x, y, 170)) return null;
        let id = null;
        if (dx < ROAD || dy < ROAD) {
            // on the road: the odd wreck or barrier, kept off the centre of crossings
            if (dx < ROAD && dy < ROAD) return null;
            if (r < 0.05) id = 'trap_car';
            else if (r < 0.09) id = 'trap_barrier';
        } else if (dx < WALK_TO || dy < WALK_TO) {
            // sidewalks: their furniture comes from the small layer
            return null;
        } else {
            const bx = Math.floor((x + BLOCK / 2) / BLOCK);
            const by = Math.floor((y + BLOCK / 2) / BLOCK);
            const kind = blockKind(bx, by, this.seed);
            if (kind === 'ruin') return null; // a ruin's walls are placed along its footprint (_cityRuin)
            if (kind === 'plaza') {
                if (r < 0.22) id = q < 0.55 ? 'trap_pillar' : 'trap_pillar_fallen';
                else if (r < 0.3) id = 'trap_lamp';
                else if (r < 0.36) id = 'trap_rubble';
            } else {
                if (r < 0.2) id = 'trap_car';
                else if (r < 0.3) id = 'trap_dumpster';
                else if (r < 0.36) id = 'trap_rubble';
            }
        }
        return id && this.has(id) ? prop(id, x, y, flip) : null;
    }

    /** True when a small prop at (x, y) would sit inside a big prop's footprint. */
    _crowded(x, y, pad) {
        const G = 128;
        const gx = Math.floor(x / G);
        const gy = Math.floor(y / G);
        for (let j = -1; j <= 1; j++)
            for (let i = -1; i <= 1; i++) {
                const b = this.big(gx + i, gy + j);
                if (!b) continue;
                const d = PROP_DEFS[b.id];
                const w = (SPRITES[b.id]?.w || 30) * (d?.tall ? 0.45 : 0.6);
                if (Math.abs(b.x - x) < w + pad && Math.abs(b.y - y) < 40 + pad) return true;
            }
        return false;
    }

    // --- the small layer: one candidate per 64-unit cell (rocks, bushes, cones, lamps...)

    _small(gx, gy) {
        const G = 64;
        const s = this.seed;
        const x = gx * G + 32 + (hash3(gx, gy, s + 21) - 0.5) * 44;
        const y = gy * G + 32 + (hash3(gx, gy, s + 22) - 0.5) * 44;
        const r = hash3(gx, gy, s + 23);
        const q = hash3(gx, gy, s + 24);
        const flip = hash3(gx, gy, s + 25) < 0.5;
        const st = this.stage;
        let id = null;
        if (st === 'bear_trap') return this._citySmall(gx, gy, x, y, r, q, flip);
        if (this.nearSpawn(x, y, 120) || this.inSet(x, y, 10)) return null;
        if (this._crowded(x, y, 6)) return null;
        if (st === 'chop') {
            const onTrail = this.trail(x, y) < 26;
            const g = this.grove(x, y);
            if (onTrail) {
                if (r < 0.04) id = 'chop_rock';
            } else if (g > 0.6) {
                if (r < 0.18)
                    id = q < 0.4 ? 'chop_pine_small' : q < 0.7 ? 'chop_fern' : 'chop_bush_a';
                else if (r < 0.24) id = 'chop_mushrooms';
            } else if (r < 0.16) {
                id =
                    q < 0.2
                        ? 'chop_bush_a'
                        : q < 0.36
                          ? 'chop_bush_b'
                          : q < 0.52
                            ? 'chop_fern'
                            : q < 0.68
                              ? 'chop_rock'
                              : q < 0.86
                                ? 'chop_stump'
                                : q < 0.95
                                  ? 'chop_stump_axe'
                                  : 'chop_lantern';
            }
        } else {
            const g = this.grove(x, y);
            if (this.trail(x, y) < 70) {
                if (r < 0.03) id = 'winter_rock_small';
            } else if (g > 0.62 && r < 0.12) id = q < 0.6 ? 'winter_pine_small' : 'winter_drift';
            else if (r < 0.1)
                id =
                    q < 0.35
                        ? 'winter_rock_small'
                        : q < 0.55
                          ? 'winter_drift'
                          : q < 0.72
                            ? 'winter_rock'
                            : q < 0.84
                              ? 'winter_crystal'
                              : q < 0.92
                                ? 'winter_snowbear'
                                : 'winter_lamp';
        }
        return id && this.has(id) ? prop(id, x, y, flip) : null;
    }

    _citySmall(gx, gy, x, y, r, q, flip) {
        let id = null;
        const dx = roadDist(x);
        const dy = roadDist(y);
        if (this.nearSpawn(x, y, 130)) return null;
        if (dx < ROAD || dy < ROAD) {
            if (dx < ROAD && dy < ROAD) return null;
            if (r < 0.025) id = 'trap_cone';
            else if (r < 0.035) id = 'trap_barrel';
        } else if (dx < WALK_TO || dy < WALK_TO) {
            // sidewalks (their lamps are placed on a rhythm by _cityLamps): hydrants, benches, boxes, newsboxes
            if (dx < WALK_TO && dy < WALK_TO) return null; // corners stay clear
            if (Math.abs(Math.min(dx, dy) - (ROAD + 18)) < 14) return null; // the lamps' line
            if (r < 0.12)
                id =
                    q < 0.25
                        ? 'trap_hydrant'
                        : q < 0.5
                          ? 'trap_bench'
                          : q < 0.75
                            ? 'trap_newsbox'
                            : 'trap_boxes';
            else if (r < 0.16) id = 'trap_cone';
            if (id) return this.has(id) ? prop(id, x, y, flip) : null;
        } else {
            const bx = Math.floor((x + BLOCK / 2) / BLOCK);
            const by = Math.floor((y + BLOCK / 2) / BLOCK);
            const kind = blockKind(bx, by, this.seed);
            if (this._crowded(x, y, 8)) return null;
            if (kind === 'ruin') {
                if (this._nearRuinWall(x, y, bx, by)) return null;
                if (r < 0.1)
                    id =
                        q < 0.3
                            ? 'trap_rubble'
                            : q < 0.5
                              ? 'trap_boxes'
                              : q < 0.7
                                ? 'trap_monitor'
                                : q < 0.85
                                  ? 'trap_barrel'
                                  : 'trap_ticker';
            } else if (kind === 'plaza') {
                if (r < 0.06)
                    id = q < 0.5 ? 'trap_bench' : q < 0.8 ? 'trap_monitor' : 'trap_beartrap';
            } else if (r < 0.1)
                id =
                    q < 0.35
                        ? 'trap_cone'
                        : q < 0.6
                          ? 'trap_barrel'
                          : q < 0.8
                            ? 'trap_boxes'
                            : 'trap_beartrap';
        }
        return id && this.has(id) ? prop(id, x, y, flip) : null;
    }

    /**
     * Street lamps along both curbs of every road, staggered, one every 256 units a side, none at the crossings;
     * a few are broken (flickering) and a few are gone.
     */
    _cityLamps(x0, y0) {
        const out = [];
        const s = this.seed;
        const off = ROAD + 18;
        const n0 = Math.round(x0 / BLOCK);
        const m0 = Math.round(y0 / BLOCK);
        for (let n = n0 - 1; n <= n0 + 1; n++)
            for (const side of [-1, 1])
                for (
                    let j = Math.floor(y0 / 256) - 1;
                    j <= Math.floor((y0 + CHUNK) / 256) + 1;
                    j++
                ) {
                    const y = j * 256 + (side > 0 ? 128 : 0);
                    if (roadDist(y) < WALK_TO + 30) continue;
                    out.push([n * BLOCK + side * off, y, side, n * 977 + j, side]);
                }
        for (let m = m0 - 1; m <= m0 + 1; m++)
            for (const side of [-1, 1])
                for (
                    let i = Math.floor(x0 / 256) - 1;
                    i <= Math.floor((x0 + CHUNK) / 256) + 1;
                    i++
                ) {
                    const x = i * 256 + (side > 0 ? 0 : 128);
                    if (roadDist(x) < WALK_TO + 30) continue;
                    out.push([x, m * BLOCK + side * off, side, m * 991 + i, side + 7]);
                }
        const lamps = [];
        for (const [x, y, side, a, b] of out) {
            if (this.nearSpawn(x, y, 120)) continue;
            const h = hash3(a, b, s + 31);
            if (h < 0.12) continue;
            const id = h < 0.3 && this.has('trap_lamp_broken') ? 'trap_lamp_broken' : 'trap_lamp';
            if (this.has(id)) lamps.push(prop(id, x, y, side < 0));
        }
        return lamps;
    }

    /** A gutted building's footprint in block (bx, by): its walls' rectangle, inset from the sidewalk. */
    _ruinRect(bx, by) {
        const inset = 60 + Math.floor(hash3(bx, by, this.seed + 71) * 3) * 32;
        const x0 = bx * BLOCK - BLOCK / 2 + WALK_TO + inset;
        const y0 = by * BLOCK - BLOCK / 2 + WALK_TO + inset;
        return {
            x0,
            y0,
            x1: x0 + BLOCK - 2 * (WALK_TO + inset),
            y1: y0 + BLOCK - 2 * (WALK_TO + inset)
        };
    }

    _nearRuinWall(x, y, bx, by) {
        const { x0, y0, x1, y1 } = this._ruinRect(bx, by);
        const near = (a, b) => Math.abs(a - b) < 40;
        return (
            ((near(y, y0) || near(y, y1)) && x > x0 - 40 && x < x1 + 40) ||
            ((near(x, x0) || near(x, x1)) && y > y0 - 40 && y < y1 + 40)
        );
    }

    /** The walls of the ruin in block (bx, by): segments along its footprint with gaps for doors. */
    _ruinWalls(bx, by) {
        const out = [];
        const { x0, y0, x1, y1 } = this._ruinRect(bx, by);
        const s = this.seed;
        const seg = 112;
        // top and bottom edges: front-facing segments
        const corners = this.has('trap_wall_corner');
        for (const [yy, edge] of [
            [y0, 0],
            [y1, 1]
        ]) {
            for (let x = x0 + seg / 2, i = 0; x < x1 - seg / 3; x += seg, i++) {
                // the front corners are their own L-shaped piece
                if (edge === 1 && corners && x - x0 < 100) continue;
                const h = hash3(bx * 64 + i, by * 64 + edge, s + 81);
                if (h < 0.22) continue; // a doorway, or the wall is gone
                const id = h < 0.5 ? 'trap_wall_b' : 'trap_wall_a';
                if (this.has(id)) out.push(prop(id, x, yy, hash3(i, edge, s + 82) < 0.5));
            }
        }
        // the sides: walls running away from the camera
        const sid = this.has('trap_wall_side') ? 'trap_wall_side' : null;
        if (sid)
            for (const [xx, edge] of [
                [x0, 2],
                [x1, 3]
            ]) {
                for (
                    let y = y0 + 60, i = 0;
                    y < y1 - (corners && edge === 2 ? 90 : 20);
                    y += 84, i++
                ) {
                    const h = hash3(bx * 64 + i, by * 64 + edge, s + 83);
                    if (h < 0.25) continue;
                    out.push(prop(sid, xx, y, edge === 3));
                }
            }
        // the south-west corner is an L (its side wall at the sprite's left edge, its front wall running right)
        if (corners) out.push(prop('trap_wall_corner', x0 + 40, y1, false));
        // inside: a pillar or two still standing
        if (this.has('trap_pillar') && hash3(bx, by, s + 85) < 0.7)
            out.push(
                prop(
                    'trap_pillar',
                    (x0 + x1) / 2 + (hash3(bx, by, s + 86) - 0.5) * 200,
                    (y0 + y1) / 2,
                    false
                )
            );
        return out;
    }

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
            ? { id, x, y, flip: !NO_FLIP.has(id) && hash3(gx, gy, s + 45) < 0.5 }
            : null;
    }

    _puddle(gx, gy) {
        const G = 128;
        const s = this.seed;
        const x = gx * G + 64 + (hash3(gx, gy, s + 51) - 0.5) * 80;
        const y = gy * G + 64 + (hash3(gx, gy, s + 52) - 0.5) * 80;
        const r = hash3(gx, gy, s + 53);
        const st = this.stage;
        if (this.nearSpawn(x, y, 90)) return null;
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
            st === 'chop' ? fbm(wx, wy, 70, this.seed + 63) : 0
        ];
    }

    ground(wx, wy, px, py, F = this.fields(wx, wy)) {
        const st = this.stage;
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
        const x0 = ci * CHUNK;
        const y0 = cj * CHUNK;
        const inChunk = (o) => o && o.x >= x0 && o.x < x0 + CHUNK && o.y >= y0 && o.y < y0 + CHUNK;
        const props = [];
        const decals = [];
        const waters = [];
        for (let gy = cj * 2; gy < cj * 2 + 2; gy++)
            for (let gx = ci * 2; gx < ci * 2 + 2; gx++) {
                const b = this.big(gx, gy);
                if (b) props.push(b);
                const pd = this._puddle(gx, gy);
                if (pd) decals.push(pd);
            }
        for (let gy = cj * 4; gy < cj * 4 + 4; gy++)
            for (let gx = ci * 4; gx < ci * 4 + 4; gx++) {
                const p = this._small(gx, gy);
                if (p) props.push(p);
            }
        for (let gy = cj * 8; gy < cj * 8 + 8; gy++)
            for (let gx = ci * 8; gx < ci * 8 + 8; gx++) {
                const d = this._decal(gx, gy);
                if (d) decals.push(d);
            }
        // set pieces anchored near this chunk
        const seen = new Set();
        for (const set of [...this.setsNear(x0, y0), ...this.setsNear(x0 + CHUNK, y0 + CHUNK)]) {
            if (seen.has(set)) continue;
            seen.add(set);
            for (const [id, x, y, flip] of this.setProps(set)) {
                const p = prop(id, x, y, flip);
                if (inChunk(p)) props.push(p);
            }
        }
        // the city's gutted buildings and its street lamps
        if (this.stage === 'bear_trap') {
            for (const p of this._cityLamps(x0, y0)) if (inChunk(p)) props.push(p);
            const bx0 = Math.floor((x0 + BLOCK / 2) / BLOCK);
            const by0 = Math.floor((y0 + BLOCK / 2) / BLOCK);
            for (let by = by0 - 1; by <= by0 + 1; by++)
                for (let bx = bx0 - 1; bx <= bx0 + 1; bx++) {
                    if (blockKind(bx, by, this.seed) !== 'ruin') continue;
                    for (const p of this._ruinWalls(bx, by)) if (inChunk(p)) props.push(p);
                }
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
        props.sort((a, b) => a.y - b.y);
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

    /** Follow the run: a new map or seed means a new world. */
    sync(stageId, seed) {
        const key = `${stageId}|${seed}`;
        if (key === this.key) return;
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

/** Build a decal's pixels ahead of need (the renderer warms a map's decals a few a frame). */
export function warmDecal(id) {
    decalPx(id, false);
    decalPx(id, true);
}
