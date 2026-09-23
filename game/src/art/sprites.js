// BEARPROOF sprite registry. All art is procedural, drawn by the pixel-art engine (art/pixel.js) from the
// generators in creatures.js, bosses.js, items.js and icons.js, and turned into the grid format below.
//
// Format: SPRITES[id] = { w, h, frames: string[][], colors: { char: hex }, fps?, glowFrames? }
// Each frame is `h` strings of length `w`, one char per pixel, '.' = transparent. `glowFrames` marks the
// emissive pixels (eyes, candles, lasers) that the renderer blooms.
//
// Side-view sprites face RIGHT. The renderer flips them for leftward movement.
// Definitions are built lazily on first access. No DOM at import time: Node tests and the Worker (share
// cards) import this module too.

import { toDef } from './pixel.js';
import * as creatures from './creatures.js';
import * as bosses from './bosses.js';
import * as items from './items.js';
import * as icons from './icons.js';

const make =
    (gen, n = 1, extra = {}) =>
    () =>
        toDef(
            Array.from({ length: n }, (_, f) => gen(f)),
            n > 1 ? { fps: 8, ...extra } : extra
        );

const SPRITE_GENS = {
    // player and brand
    bull: make(creatures.bull, 4, { fps: 11 }),
    emblem: make(creatures.emblemSmall),
    emblem_large: make(creatures.emblemLarge),
    // enemies
    red_candle: make(creatures.redCandle, 4, { fps: 8 }),
    bag_holder: make(creatures.bagHolder, 4, { fps: 6 }),
    paper_hands: make(creatures.paperHands, 4, { fps: 9 }),
    rug_puller: make(creatures.rugPuller, 4, { fps: 11 }),
    grizzly: make(creatures.grizzly, 4, { fps: 5 }),
    fud_cloud: make(creatures.fudCloud, 4, { fps: 6 }),
    doomposter: make(creatures.doomposter, 4, { fps: 5 }),
    ponzi: make(creatures.ponzi, 4, { fps: 6 }),
    downline: make(creatures.downline, 4, { fps: 9 }),
    margin_call: make(creatures.marginCall, 4, { fps: 12 }),
    sybil: make(creatures.sybil, 4, { fps: 6 }),
    // bosses
    rug_lord: make(bosses.rugLord, 4, { fps: 5 }),
    capitulation: make(bosses.capitulation, 4, { fps: 8 }),
    liquidation: make(bosses.liquidation, 4, { fps: 4 }),
    bear_market: make(bosses.bearMarket, 4, { fps: 4 }),
    long_winter: make(bosses.longWinter, 4, { fps: 4 }),
    // pickups and projectiles
    xp_candle: make(items.xpCandle, 2, { fps: 3 }),
    xp_candle_big: make(items.xpCandleBig, 2, { fps: 3 }),
    green_candle: make(items.greenCandleShot),
    laser: make(items.laser),
    diamond: make(items.diamond, 2, { fps: 5 }),
    airdrop: make(items.airdrop),
    limit_order: make(items.limitOrder, 2, { fps: 4 }),
    dead_cat: make(items.deadCat),
    fud_bolt: make(items.fudBolt, 2, { fps: 12 }),
    heart: make(items.heart)
};

const ICON_GENS = {
    horns: make(icons.horns),
    green_candle: make(icons.greenCandle),
    laser_eyes: make(icons.laserEyes),
    diamond_hands: make(icons.diamondHands),
    airdrop: make(icons.airdropIcon),
    limit_order: make(icons.limitOrderIcon),
    hopium: make(icons.hopium),
    circuit_breaker: make(icons.circuitBreaker),
    buyback: make(icons.buyback),
    dead_cat_bounce: make(icons.deadCatBounce),
    thick_skin: make(icons.thickSkin),
    dca: make(icons.dca),
    cold_wallet: make(icons.coldWallet),
    momentum: make(icons.momentum),
    conviction: make(icons.conviction),
    liquidity: make(icons.liquidity),
    high_frequency: make(icons.highFrequency),
    whale_gravity: make(icons.whaleGravity),
    compounding: make(icons.compounding),
    alpha: make(icons.alpha),
    slippage: make(icons.slippage),
    hedge: make(icons.hedge),
    leverage: make(icons.leverage)
};

function lazyTable(gens) {
    const table = {};
    for (const [id, gen] of Object.entries(gens)) {
        let def = null;
        Object.defineProperty(table, id, {
            enumerable: true,
            get: () => (def ||= gen())
        });
    }
    return table;
}

export const SPRITES = lazyTable(SPRITE_GENS);
export const ICONS = lazyTable(ICON_GENS);

export const SPRITE_GROUPS = {
    player: ['bull'],
    brand: ['emblem', 'emblem_large'],
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

const T = '.';
const cache = new Map();

function makeCanvas(w, h) {
    const doc = globalThis.document;
    if (doc && typeof doc.createElement === 'function') {
        const c = doc.createElement('canvas');
        c.width = w;
        c.height = h;
        return c;
    }
    const Offscreen = globalThis.OffscreenCanvas;
    return typeof Offscreen === 'function' ? new Offscreen(w, h) : null;
}

function paintGrid(ctx, rows, def, s, flip, tint) {
    for (let y = 0; y < def.h; y++) {
        const row = rows[y];
        let x = 0;
        while (x < def.w) {
            const ch = row[x];
            if (ch === T) {
                x++;
                continue;
            }
            let run = 1;
            while (x + run < def.w && row[x + run] === ch) run++;
            let fill = def.colors[ch] || ch;
            if (tint && ch !== 'o') fill = tint;
            ctx.fillStyle = fill;
            const px = flip ? def.w - x - run : x;
            ctx.fillRect(px * s, y * s, run * s, s);
            x += run;
        }
    }
}

function bakeDef(def, key, scale, flip, tint) {
    if (!def) return null;
    const s = Math.max(1, Math.round(scale) || 1);
    const k = `${key}|${s}|${flip}|${tint}`;
    const hit = cache.get(k);
    if (hit) return hit;
    const frames = [];
    for (const rows of def.frames) {
        const c = makeCanvas(def.w * s, def.h * s);
        const ctx = c && c.getContext('2d');
        if (!ctx) return null; // Node, or a DOM without a 2D canvas (jsdom).
        ctx.imageSmoothingEnabled = false;
        paintGrid(ctx, rows, def, s, flip, tint);
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
 *        tint = hex colour that replaces every pixel but the ink (white hit flash, pale clones)
 * @returns {Array<HTMLCanvasElement|OffscreenCanvas>|null}  null without a canvas API or for unknown ids
 */
export function bakeSprite(id, scale = 1, { flip = false, tint = null } = {}) {
    return SPRITE_GENS[id] ? bakeDef(SPRITES[id], id, scale, !!flip, tint || null) : null;
}

/** Same as bakeSprite, for ICONS (level-up cards, HUD). */
export function bakeIcon(id, scale = 1, { flip = false, tint = null } = {}) {
    return ICON_GENS[id] ? bakeDef(ICONS[id], `icon:${id}`, scale, !!flip, tint || null) : null;
}

/**
 * The sprite's emissive pixels, blurred into a soft bloom, one canvas per frame. The canvas is larger
 * than the sprite by `pad` device px on each side; draw it centred with 'lighter' compositing.
 * Returns null when the sprite has nothing that glows.
 */
export function bakeGlow(id, scale = 1, { flip = false } = {}) {
    const def = SPRITE_GENS[id] && SPRITES[id];
    if (!def || !def.glowFrames) return null;
    const s = Math.max(1, Math.round(scale) || 1);
    const k = `glow:${id}|${s}|${flip}`;
    if (cache.has(k)) return cache.get(k);
    const pad = Math.max(6, s * 5);
    const frames = [];
    for (const rows of def.glowFrames) {
        const W = def.w * s + pad * 2;
        const H = def.h * s + pad * 2;
        const src = makeCanvas(W, H);
        const sctx = src && src.getContext('2d');
        if (!sctx) return null;
        sctx.translate(pad, pad);
        paintGrid(sctx, rows, { ...def, colors: def.colors }, s, flip, null);
        // cheap, portable blur: shrink with smoothing, then scale back up twice
        const small = makeCanvas(Math.max(1, Math.ceil(W / 4)), Math.max(1, Math.ceil(H / 4)));
        const mctx = small.getContext('2d');
        mctx.imageSmoothingEnabled = true;
        mctx.drawImage(src, 0, 0, small.width, small.height);
        const out = makeCanvas(W, H);
        const octx = out.getContext('2d');
        octx.imageSmoothingEnabled = true;
        octx.globalAlpha = 1;
        octx.drawImage(small, 0, 0, W, H);
        octx.globalAlpha = 0.9;
        octx.drawImage(small, 0, 0, W, H);
        frames.push(out);
    }
    frames.pad = pad;
    cache.set(k, frames);
    return frames;
}

/** Drop every baked canvas (e.g. after a DPR change). */
export function clearSpriteCache() {
    cache.clear();
}
