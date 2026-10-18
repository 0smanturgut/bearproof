/**
 * @module sim/terrain
 * @description The ground a run is played on: where every tree, wall, lamp and wreck of a map stands, which of
 * them are solid, and the piggy banks scattered between them. A pure function of the map and the run's seed, so
 * the server re-simulates a run on exactly the map it was played on, and a Daily's map is the same for everyone.
 *
 * The world is endless, so it's laid out in CHUNK-unit squares on demand. Props come from a few layers, each a
 * function of grid position: a big layer (one candidate per 128 units: trees, walls, wrecks), a small layer (per
 * 64: rocks, bushes, cones), set pieces (a camp, a mining camp, the spawn's own scene) and, downtown, the street
 * grid's lamps and the walls of gutted buildings. Bosses and things that fly ignore the scenery.
 *
 * Integer hashing, + - * / and sqrt only (no Math.sin or Math.hypot), so every engine lays out the same map. The
 * renderer (world.js) draws these props by id and adds what is only looked at: ground, decals, puddles, light.
 */

export const CHUNK = 256; // world units per chunk side
const CELL = 64; // collision grid
const PAD = 40; // a collider is filed in every cell it reaches, plus this margin (the widest body that asks)
const BREAK_CELL = 360; // at most one piggy bank per square this size (about two on a screen)
const TERRAINS = new Set(['chop', 'bear_trap', 'winter']);

/**
 * Every prop a map places. `w`: its sprite's width in art px (spacing between props); `tall`: tall enough to hide
 * what's behind it (it also keeps small props further off); `solid`: its footprint on the ground, relative to its
 * foot point, in world units: [x, y, r] is a circle, { box: [x0, y0, x1, y1] } a rectangle, or a list of them.
 * No `solid`: you walk over it (grass, bushes, small rocks, cones, snowdrifts).
 */
export const PROPS = {
    // Chop Zone: what you bump is the trunk, not the canopy
    chop_pine_a: { w: 36, tall: true, solid: [0, -4, 9] },
    chop_pine_b: { w: 30, tall: true, solid: [0, -4, 8] },
    chop_pine_small: { w: 22, tall: true, solid: [0, -3, 6] },
    chop_oak: { w: 50, tall: true, solid: [0, -6, 13] },
    chop_dead_tree: { w: 34, tall: true, solid: [0, -4, 8] },
    chop_stump_axe: { w: 24, solid: [0, -8, 14] },
    chop_stump: { w: 18 },
    chop_log_pile: { w: 38, solid: { box: [-34, -22, 34, 2] } },
    chop_fallen_log: { w: 46, solid: { box: [-42, -12, 42, 2] } },
    chop_boulder: { w: 30, solid: [0, -10, 22] },
    chop_rock: { w: 14 },
    chop_bush_a: { w: 26 },
    chop_bush_b: { w: 22 },
    chop_fern: { w: 20 },
    chop_mushrooms: { w: 14 },
    chop_lantern: { w: 16, tall: true, solid: [0, -2, 5] },
    chop_signpost: { w: 26, tall: true, solid: [0, -2, 5] },
    chop_campfire: { w: 22, solid: [0, -8, 15] },
    chop_tent: { w: 40, solid: { box: [-36, -26, 36, 0] } },
    chop_fence: { w: 42, solid: { box: [-40, -10, 40, 2] } },
    chop_monolith: { w: 20, tall: true, solid: [0, -8, 15] },
    chop_sawhorse: { w: 30, solid: { box: [-26, -12, 26, 2] } },
    // Bear Trap: walls, wrecks and street furniture
    trap_wall_a: { w: 58, solid: { box: [-54, -16, 54, 4] } },
    trap_wall_b: { w: 42, solid: { box: [-38, -14, 38, 4] } },
    trap_wall_side: { w: 16, solid: { box: [-10, -82, 10, 4] } },
    trap_wall_corner: { w: 46, solid: [{ box: [-44, -14, 44, 4] }, { box: [-44, -64, -26, 4] }] },
    trap_pillar: { w: 20, tall: true, solid: [0, -8, 15] },
    trap_pillar_fallen: { w: 48, solid: { box: [-44, -16, 44, 2] } },
    trap_lamp: { w: 18, tall: true, solid: [0, -2, 6] },
    trap_lamp_broken: { w: 24, tall: true, solid: [0, -2, 6] },
    trap_barrel: { w: 18, solid: [0, -6, 12] },
    trap_ticker: { w: 48, solid: { box: [-44, -16, 44, 2] } },
    trap_monitor: { w: 20 },
    trap_cone: { w: 12 },
    trap_barrier: { w: 36, solid: { box: [-34, -8, 34, 2] } },
    trap_car: { w: 64, solid: { box: [-60, -32, 60, 2] } },
    trap_boxes: { w: 24, solid: { box: [-20, -18, 20, 2] } },
    trap_beartrap: { w: 26 },
    trap_dumpster: { w: 38, solid: { box: [-36, -26, 36, 2] } },
    trap_siren: { w: 12, tall: true, solid: [0, -2, 5] },
    trap_hydrant: { w: 12 },
    trap_bench: { w: 34, solid: { box: [-30, -10, 30, 2] } },
    trap_rubble: { w: 32 },
    trap_newsbox: { w: 16, solid: [0, -6, 10] },
    // Crypto Winter
    winter_pine_a: { w: 36, tall: true, solid: [0, -4, 9] },
    winter_pine_b: { w: 30, tall: true, solid: [0, -4, 8] },
    winter_pine_small: { w: 22, tall: true, solid: [0, -3, 6] },
    winter_dead_tree: { w: 34, tall: true, solid: [0, -4, 8] },
    winter_rock: { w: 30, solid: [0, -10, 22] },
    winter_rock_small: { w: 14 },
    winter_crystal: { w: 18, solid: [0, -8, 13] },
    winter_rig: { w: 34, solid: { box: [-32, -22, 32, 2] } },
    winter_snowbear: { w: 24, solid: [0, -8, 14] },
    winter_lamp: { w: 14, tall: true, solid: [0, -2, 5] },
    winter_campfire: { w: 24, solid: [0, -8, 16] },
    winter_igloo: { w: 46, solid: { box: [-42, -32, 42, 2] } },
    winter_atm: { w: 22, tall: true, solid: { box: [-20, -16, 20, 2] } },
    winter_sled: { w: 32, solid: { box: [-30, -12, 30, 2] } },
    winter_cabin_ruin: { w: 52, solid: { box: [-50, -22, 50, 2] } },
    winter_drift: { w: 40 },
    winter_flag: { w: 16, tall: true, solid: [0, -2, 4] }
};

/** Each prop's footprint as a list of shapes: circles { x, y, r } and boxes { x0, y0, x1, y1 }, from its foot. */
const SHAPES = {};
for (const [id, def] of Object.entries(PROPS)) {
    const s = def.solid;
    const list = !s ? [] : Array.isArray(s) && typeof s[0] === 'number' ? [s] : [].concat(s);
    SHAPES[id] = list.map((c) =>
        Array.isArray(c)
            ? { x: c[0], y: c[1], r: c[2] }
            : { x0: c.box[0], y0: c.box[1], x1: c.box[2], y1: c.box[3] }
    );
}

/** True when the prop has a footprint you bump into. */
export const isSolid = (id) => !!SHAPES[id]?.length;

// ------------------------------------------------------------------------------------------ hashing and noise

export function hash3(x, y, s) {
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
export function fbm(x, y, scale, s) {
    const f = 1 / scale;
    return (
        vnoise(x * f, y * f, s) * 0.57 +
        vnoise(x * f * 2.03, y * f * 2.03, s + 17) * 0.29 +
        vnoise(x * f * 4.11, y * f * 4.11, s + 31) * 0.14
    );
}

const mod = (a, n) => ((a % n) + n) % n;

// ----------------------------------------------------------------------------------------- the city grid

export const BLOCK = 1024; // a street grid: roads every BLOCK units, both ways, crossing at the origin
export const ROAD = 88; // half the asphalt's width
export const WALK_TO = 132; // the sidewalk ends (the block begins) this far from a road's centre line

/** Distance from the nearest road centre line, along one axis. */
export const roadDist = (u) => Math.abs(mod(u + BLOCK / 2, BLOCK) - BLOCK / 2);

/** What a city block is: 'ruin' (a gutted building), 'plaza' (the exchange's colonnade) or 'lot'. */
export function blockKind(bx, by, seed) {
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

export class Terrain {
    constructor(stageId, seed) {
        this.stage = TERRAINS.has(stageId) ? stageId : 'chop';
        this.seed = (seed >>> 0) % 100000;
        this._big = new Map();
        this._sets = new Map();
    }

    has(id) {
        return !!PROPS[id];
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
        const g = Math.sqrt(gx * gx + gy * gy) / 16; // sqrt keeps it identical on every engine
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
                const d = PROPS[b.id];
                const w = (d?.w || 30) * (d?.tall ? 0.45 : 0.6);
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

    // --- one chunk's props

    /** Every prop whose foot stands in chunk (ci, cj), sorted back to front. */
    chunkProps(ci, cj) {
        const x0 = ci * CHUNK;
        const y0 = cj * CHUNK;
        const inChunk = (o) => o && o.x >= x0 && o.x < x0 + CHUNK && o.y >= y0 && o.y < y0 + CHUNK;
        const props = [];
        for (let gy = cj * 2; gy < cj * 2 + 2; gy++)
            for (let gx = ci * 2; gx < ci * 2 + 2; gx++) {
                const b = this.big(gx, gy);
                if (b) props.push(b);
            }
        for (let gy = cj * 4; gy < cj * 4 + 4; gy++)
            for (let gx = ci * 4; gx < ci * 4 + 4; gx++) {
                const p = this._small(gx, gy);
                if (p) props.push(p);
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
        props.sort((a, b) => a.y - b.y || a.x - b.x);
        return props;
    }

    // --- collisions

    /** File the solid props of chunk (ci, cj) into the collision grid (each in every cell it reaches). */
    _lay(ci, cj) {
        const key = ci * 65536 + cj;
        if (this._laid.has(key)) return;
        this._laid.add(key);
        const touched = new Set();
        for (const p of this.chunkProps(ci, cj)) {
            for (const sh of SHAPES[p.id] || []) {
                const fx = p.flip ? -1 : 1;
                const c =
                    sh.r !== undefined
                        ? { x: p.x + sh.x * fx, y: p.y + sh.y, r: sh.r }
                        : {
                              x0: p.x + (fx > 0 ? sh.x0 : -sh.x1),
                              x1: p.x + (fx > 0 ? sh.x1 : -sh.x0),
                              y0: p.y + sh.y0,
                              y1: p.y + sh.y1
                          };
                const bx0 = c.r !== undefined ? c.x - c.r : c.x0;
                const bx1 = c.r !== undefined ? c.x + c.r : c.x1;
                const by0 = c.r !== undefined ? c.y - c.r : c.y0;
                const by1 = c.r !== undefined ? c.y + c.r : c.y1;
                for (
                    let gy = Math.floor((by0 - PAD) / CELL);
                    gy <= Math.floor((by1 + PAD) / CELL);
                    gy++
                )
                    for (
                        let gx = Math.floor((bx0 - PAD) / CELL);
                        gx <= Math.floor((bx1 + PAD) / CELL);
                        gx++
                    ) {
                        const k = (gx + 0x8000) * 0x10000 + (gy + 0x8000);
                        let cell = this._cells.get(k);
                        if (!cell) this._cells.set(k, (cell = []));
                        cell.push(c);
                        touched.add(cell);
                    }
            }
        }
        // a cell's colliders in a fixed order, however its chunks were laid out
        const at = (c) =>
            (c.r !== undefined ? c.y : c.y0) * 100000 + (c.r !== undefined ? c.x : c.x0);
        for (const cell of touched) cell.sort((a, b) => at(a) - at(b));
    }

    /** The colliders that can touch a body at (x, y): its cell's, after laying out the chunks around it. */
    _near(x, y) {
        if (!this._cells) {
            this._cells = new Map();
            this._laid = new Set();
        }
        const ci = Math.floor(x / CHUNK);
        const cj = Math.floor(y / CHUNK);
        if (this._laid.size > 400) this.forget();
        for (let j = cj - 1; j <= cj + 1; j++)
            for (let i = ci - 1; i <= ci + 1; i++)
                if (!this._laid.has(i * 65536 + j)) this._lay(i, j);
        return (
            this._cells.get(
                (Math.floor(x / CELL) + 0x8000) * 0x10000 + (Math.floor(y / CELL) + 0x8000)
            ) || NONE
        );
    }

    /** Drop every cache (the layout comes back the same when asked again). */
    forget() {
        this._cells = new Map();
        this._laid = new Set();
        this._big = new Map();
        this._sets = new Map();
        this._bk = new Map();
    }

    /**
     * Push a body (a circle of radius `r` at (x, y)) out of every solid prop it overlaps. Returns null when it
     * touched nothing, else { dx, dy, nx, ny }: how far it moved, and the normal of the last surface it met.
     */
    push(x, y, r) {
        const list = this._near(x, y);
        if (!list.length) return null;
        let ox = x;
        let oy = y;
        let nx = 0;
        let ny = 0;
        let hit = false;
        for (let pass = 0; pass < 2; pass++) {
            let moved = false;
            for (const c of list) {
                let px;
                let py;
                let reach;
                if (c.r !== undefined) {
                    px = c.x;
                    py = c.y;
                    reach = r + c.r;
                } else {
                    px = ox < c.x0 ? c.x0 : ox > c.x1 ? c.x1 : ox;
                    py = oy < c.y0 ? c.y0 : oy > c.y1 ? c.y1 : oy;
                    reach = r;
                }
                const dx = ox - px;
                const dy = oy - py;
                const d2 = dx * dx + dy * dy;
                if (d2 >= reach * reach) continue;
                if (d2 > 1e-9) {
                    const d = Math.sqrt(d2);
                    nx = dx / d;
                    ny = dy / d;
                    ox += nx * (reach - d);
                    oy += ny * (reach - d);
                } else if (c.r !== undefined) {
                    nx = 0;
                    ny = 1;
                    oy += reach;
                } else {
                    // the centre is inside a box: out the nearest side
                    const l = ox - c.x0;
                    const rr = c.x1 - ox;
                    const t = oy - c.y0;
                    const b = c.y1 - oy;
                    const m = Math.min(l, rr, t, b);
                    if (m === l) [nx, ny, ox] = [-1, 0, c.x0 - r];
                    else if (m === rr) [nx, ny, ox] = [1, 0, c.x1 + r];
                    else if (m === t) [nx, ny, oy] = [0, -1, c.y0 - r];
                    else [nx, ny, oy] = [0, 1, c.y1 + r];
                }
                hit = true;
                moved = true;
            }
            if (!moved) break;
        }
        return hit ? { dx: ox - x, dy: oy - y, nx, ny } : null;
    }

    /** True when a body of radius `r` at (x, y) would overlap a solid prop. */
    blocked(x, y, r) {
        for (const c of this._near(x, y)) {
            if (c.r !== undefined) {
                const dx = x - c.x;
                const dy = y - c.y;
                if (dx * dx + dy * dy < (r + c.r) * (r + c.r)) return true;
            } else if (x > c.x0 - r && x < c.x1 + r && y > c.y0 - r && y < c.y1 + r) return true;
        }
        return false;
    }

    /** The nearest free spot to (x, y) for a body of radius `r`: tried on rings around it, else (x, y) itself. */
    free(x, y, r) {
        if (!this.blocked(x, y, r)) return [x, y];
        for (let ring = 1; ring <= 6; ring++)
            for (let k = 0; k < 8; k++) {
                const a = RING[k];
                const fx = x + a[0] * ring * 24;
                const fy = y + a[1] * ring * 24;
                if (!this.blocked(fx, fy, r)) return [fx, fy];
            }
        return [x, y];
    }

    // --- piggy banks

    /**
     * The piggy bank in BREAK_CELL square (gx, gy), or null: { key, x, y }. Two squares in five have one, never
     * inside a solid prop; the square at the origin always has one in sight of the spawn, so every run meets one.
     */
    breakableAt(gx, gy) {
        if (!this._bk) this._bk = new Map();
        const key = gx * 100003 + gy;
        if (this._bk.has(key)) return this._bk.get(key);
        const s = this.seed;
        let v = null;
        let x = -30;
        let y = 120;
        if (gx !== 0 || gy !== 0) {
            x = gx * BREAK_CELL + 40 + hash3(gx, gy, s + 502) * (BREAK_CELL - 80);
            y = gy * BREAK_CELL + 40 + hash3(gx, gy, s + 503) * (BREAK_CELL - 80);
        }
        const here =
            (gx === 0 && gy === 0) || (hash3(gx, gy, s + 501) < 0.4 && !this.nearSpawn(x, y, 230));
        if (here && !this.blocked(x, y, 20)) v = { key, x, y };
        this._bk.set(key, v);
        return v;
    }

    /** Every piggy bank within `R` of (x, y). */
    breakablesNear(x, y, R) {
        const out = [];
        for (
            let gy = Math.floor((y - R) / BREAK_CELL);
            gy <= Math.floor((y + R) / BREAK_CELL);
            gy++
        )
            for (
                let gx = Math.floor((x - R) / BREAK_CELL);
                gx <= Math.floor((x + R) / BREAK_CELL);
                gx++
            ) {
                const b = this.breakableAt(gx, gy);
                if (b) out.push(b);
            }
        return out;
    }
}

const NONE = [];
const D = Math.SQRT1_2;
const RING = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [D, D],
    [-D, D],
    [D, -D],
    [-D, -D]
];
