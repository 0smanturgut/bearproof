/**
 * @module render
 * @description Canvas renderer. Full-viewport, DPR-aware, pixel-perfect sprites (baked once per integer
 * scale by art/sprites.js). Each map is a place at night (world.js): a forest logging camp, the ruined
 * financial district, a frozen mining camp, with scenery sorted in with the creatures, moonlight and cloud
 * shadows, lamps and fires that light the ground (lighting.js), soft contact shadows under everything, and neon
 * bloom on whatever glows (eyes, candles, lasers). Reads simulation state; never mutates it.
 */

import {
    SPRITES,
    bakeGlow,
    bakeSprite,
    clearSpriteCache,
    spriteCacheGeneration,
    watchCanvas
} from './art/sprites.js';
import { DECAL_DEFS, PROP_DEFS } from './art/props.js';
import { themeFor } from './art/stages.js';
import { Life } from './life.js';
import { Lighting } from './lighting.js';
import { PICKUPS, SIM } from './sim/content.js';
import { World, warmDecal } from './world.js';

const ART_UNIT = 2; // world units per art pixel
// Visible world area: ~1100×720 units on a desktop, zooming in to ~520×1100 on a phone so sprites stay
// big enough to read. Interpolated by screen area (CSS px²).
const AREA_PHONE = 500 * 1040;
const AREA_DESKTOP = 960 * 620;
const MIN_SHORT_SIDE = 440; // never show less than this many world units across the short side
const TAU = Math.PI * 2;
const CANDLE_DROP = 0.35; // s: how long a jackpot candle is seen falling before it lands
const CANDLE_DROP_HEIGHT = 170; // world units it falls from

export const KILL_COLORS = {
    red_candle: '#FF3B5C',
    bag_holder: '#A37038',
    paper_hands: '#EEF1F5',
    rug_puller: '#FF3B5C',
    grizzly: '#C98A55',
    fud_cloud: '#9A86C8',
    doomposter: '#6B55A0',
    ponzi: '#FFC53D',
    downline: '#FFC53D',
    margin_call: '#FF3B5C',
    sybil: '#A3ACB8',
    pump_dump: '#FF7E86',
    exit_scam: '#A37038'
};

// Things that hover: their shadow sits lower and smaller.
const FLOATERS = new Set(['fud_cloud', 'liquidation', 'capitulation']);

// The glow of each pickup on the floor (and of its light on the ground around it).
const PICKUP_GLOW = {
    ramen: '255,214,150',
    clout: '255,197,61',
    magnet: '170,225,255',
    halt: '120,220,255',
    squeeze: '255,150,70',
    chest: '255,200,90'
};

// What a footstep kicks up on each map: forest dirt, street grit, snow.
const DUST = {
    chop: 'rgba(118,104,84,',
    bear_trap: 'rgba(140,142,152,',
    winter: 'rgba(232,240,252,'
};

// How a prop's light moves (art/props.js `light.flicker`), 0..1 of its strength.
const FLICKER = {
    fire: (t, ph) => 0.84 + 0.09 * Math.sin(t * 9.3 + ph) + 0.07 * Math.sin(t * 23.7 + ph * 2.1),
    pulse: (t, ph) => 0.78 + 0.22 * Math.sin(t * 2.1 + ph),
    blink: (t, ph) => (hash1(Math.floor(t * 7 + ph)) < 0.3 ? 0.12 : 1),
    siren: (t, ph) => 0.3 + 0.7 * Math.pow(Math.max(0, Math.sin(t * 5.5 + ph)), 2)
};

/**
 * The night moves on through a run: dusk at the opening bell, deep night by the middle game, and the first light
 * of dawn over the last two minutes before the market closes at 20:00. Multiplies into the map's moonlight.
 */
function nightAmbient(base, time) {
    const dusk = Math.max(0, 1 - time / 90) * 0.3;
    const deep = Math.min(1, Math.max(0, (time - 90) / 510)) * 0.08;
    const dawn = Math.min(1, Math.max(0, (time - 1080) / 120)) * 0.4;
    const DUSK = [214, 196, 206];
    const DAWN = [255, 206, 176];
    return base.map((v, i) => {
        let c = v * (1 - deep);
        c += (DUSK[i] - c) * dusk;
        c += (DAWN[i] - c) * dawn;
        return Math.round(c);
    });
}

function hash1(i) {
    let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return watchCanvas(c);
}

export class Renderer {
    constructor(canvas, prefs = null) {
        this.canvas = canvas;
        this.prefs = prefs;
        this.world = new World();
        this.lighting = new Lighting();
        this.life = new Life();
        this.frameEma = 1 / 60; // smoothed frame time, for the 'auto' graphics setting
        this.slowFor = 0;
        this.autoLow = false;
        this.ctx = canvas.getContext('2d', { alpha: false });
        this.cssW = 1;
        this.cssH = 1;
        this.dpr = 1;
        this.s = 1; // device px per world unit
        this.k = 3; // device px per art pixel
        this.seen = new Map(); // enemy uid -> first time drawn (spawn-in animation)
        this.lastT = 0;
        this.dustAt = 0;
        this.snow = [];
        this._cache = {};
        this.resize();
    }

    resize() {
        const r = this.canvas.getBoundingClientRect();
        this.cssW = Math.max(1, r.width || window.innerWidth);
        this.cssH = Math.max(1, r.height || window.innerHeight);
        this.dpr = Math.min(2, window.devicePixelRatio || 1);
        this.canvas.width = Math.round(this.cssW * this.dpr);
        this.canvas.height = Math.round(this.cssH * this.dpr);
        const area = this.cssW * this.cssH;
        const k = Math.min(1, Math.max(0, (area - 330000) / (1300000 - 330000)));
        const target = AREA_PHONE + (AREA_DESKTOP - AREA_PHONE) * k;
        const css = Math.min(
            Math.sqrt(area / target),
            Math.min(this.cssW, this.cssH) / MIN_SHORT_SIDE
        );
        this.s = css * this.dpr;
        this.k = Math.max(1, Math.round(ART_UNIT * this.s));
        this.ctx.imageSmoothingEnabled = false;
        this._cache = {};
    }

    /**
     * After a lost 2D context (Chrome on Android) every baked canvas may be blank: drop them all, the sprite
     * cache too, so the next frame paints them again from the sprite data. Called on the main canvas's
     * `contextrestored` and when the page is shown again; `draw` also follows any sprite cache drop.
     */
    recover() {
        clearSpriteCache();
        this.ctx.imageSmoothingEnabled = false; // a restored context comes back with default state
        this._dropCaches();
    }

    _dropCaches() {
        this._cache = {};
        this._gen = spriteCacheGeneration();
        this.world?.dropCaches();
        this.lighting?.drop();
    }

    /**
     * Make the map's scenery sprites and decals ahead of need, one a frame, so walking into a new kind of prop never stalls
     * a frame on drawing it the first time (a sprite is generated once, then baked per pixel scale).
     */
    _warm(stage) {
        const key = `${stage}|${this.k}|${this._gen}`;
        if (this._warmKey !== key) {
            this._warmKey = key;
            const prefix =
                { chop: 'chop_', bear_trap: 'trap_', winter: 'winter_', eras: 'eras_' }[stage] ||
                'chop_';
            this._warmList = Object.keys(PROP_DEFS).filter((id) => id.startsWith(prefix));
            this._warmList.push('crow', 'pigeon', 'rat', 'hare');
            for (const id of Object.keys(DECAL_DEFS))
                if (id.startsWith(prefix)) this._warmList.push(`decal:${id}`);
        }
        // one a frame: some sprites take tens of ms to generate on a slow phone
        const id = this._warmList.shift();
        if (!id) return;
        if (id.startsWith('decal:')) return warmDecal(id.slice(6));
        this.sprite(id);
        this.sprite(id, { flip: true });
        bakeGlow(id, this.k);
    }

    /**
     * 'high' draws the night lighting and the full ambient life; 'low' skips the light buffer. On 'auto' a device
     * that can't hold ~40 fps for a few seconds drops to low for the rest of the session.
     */
    quality(dt) {
        const want = this.prefs?.graphics || 'auto';
        if (want !== 'auto') return want;
        if (dt > 0 && dt < 0.25) {
            this.frameEma += (dt - this.frameEma) * 0.05;
            this.slowFor = this.frameEma > 0.025 ? this.slowFor + dt : 0;
            if (this.slowFor > 4) this.autoLow = true;
        }
        return this.autoLow ? 'low' : 'high';
    }

    /** Visible world half-extents (for culling and the attract bot). */
    get halfW() {
        return this.canvas.width / this.s / 2;
    }
    get halfH() {
        return this.canvas.height / this.s / 2;
    }

    sprite(id, opts) {
        if (!SPRITES[id]) return null;
        return bakeSprite(id, this.k, opts);
    }

    // ---------------------------------------------------------------- cached helpers

    /** Soft elliptical contact shadow, 128×40, drawn scaled. */
    _shadowTex() {
        if (this._cache.shadow) return this._cache.shadow;
        const c = makeCanvas(128, 40);
        const x = c.getContext('2d');
        const g = x.createRadialGradient(64, 20, 2, 64, 20, 64);
        g.addColorStop(0, 'rgba(0,0,0,0.62)');
        g.addColorStop(0.55, 'rgba(0,0,0,0.32)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        x.setTransform(1, 0, 0, 40 / 128, 0, 0);
        x.fillStyle = g;
        x.fillRect(0, 0, 128, 128);
        this._cache.shadow = c;
        return c;
    }

    /** Radial light blob (additive), 64×64, tinted. */
    _blob(color) {
        const key = `blob:${color}`;
        if (this._cache[key]) return this._cache[key];
        const c = makeCanvas(64, 64);
        const x = c.getContext('2d');
        const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, `rgba(${color},0.9)`);
        g.addColorStop(0.3, `rgba(${color},0.35)`);
        g.addColorStop(1, `rgba(${color},0)`);
        x.fillStyle = g;
        x.fillRect(0, 0, 64, 64);
        this._cache[key] = c;
        return c;
    }

    _vignette(W, H, color) {
        const key = `vig:${W}x${H}:${color}`;
        if (this._cache[key]) return this._cache[key];
        const c = makeCanvas(W, H);
        const x = c.getContext('2d');
        const g = x.createRadialGradient(
            W / 2,
            H / 2,
            Math.min(W, H) * 0.3,
            W / 2,
            H / 2,
            Math.hypot(W, H) * 0.56
        );
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, color);
        x.fillStyle = g;
        x.fillRect(0, 0, W, H);
        this._cache[key] = c;
        return c;
    }

    _blit(
        id,
        x,
        y,
        { frame = 0, flip = false, tint = null, alpha = 1, rot = 0, sx = 1, sy = 1 } = {}
    ) {
        const frames = this.sprite(id, { flip, tint });
        if (!frames || !frames.length) return null;
        const n = frames.length;
        const img = frames[(((frame | 0) % n) + n) % n];
        const ctx = this.ctx;
        const w = img.width * sx;
        const h = img.height * sy;
        if (alpha !== 1) ctx.globalAlpha = alpha;
        if (rot) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(rot);
            ctx.drawImage(img, Math.round(-w / 2), Math.round(-h / 2), w, h);
            ctx.restore();
        } else {
            ctx.drawImage(
                img,
                Math.round(x - w / 2),
                Math.round(y - h / 2),
                Math.round(w),
                Math.round(h)
            );
        }
        if (alpha !== 1) ctx.globalAlpha = 1;
        return img;
    }

    _shadow(x, y, w, alpha = 1) {
        const ctx = this.ctx;
        const tex = this._shadowTex();
        const h = w * 0.34;
        if (alpha !== 1) ctx.globalAlpha = alpha;
        ctx.drawImage(tex, x - w / 2, y - h / 2, w, h);
        if (alpha !== 1) ctx.globalAlpha = 1;
    }

    // ---------------------------------------------------------------- frame

    /**
     * @param {import('./sim/sim.js').Simulation} sim
     * @param {import('./fx.js').Fx} fx
     * @param {{x:number,y:number}} cam  world point at screen centre
     * @param {number} t  render clock in seconds (animation only)
     */
    draw(sim, fx, cam, t) {
        if (this._gen !== spriteCacheGeneration()) this._dropCaches();
        const ctx = this.ctx;
        const W = this.canvas.width;
        const H = this.canvas.height;
        const s = this.s;
        const k = this.k;
        const theme = themeFor(sim.stageId, sim.era);
        const dt = Math.min(0.05, Math.max(0, t - this.lastT));
        this.lastT = t;
        const [shx, shy] = fx.shakeOffset();
        const cx = cam.x + shx;
        const cy = cam.y + shy;
        const X = (wx) => (wx - cx) * s + W / 2;
        const Y = (wy) => (wy - cy) * s + H / 2;
        const margin = 140;
        const visible = (x, y, pad = margin) =>
            Math.abs(x - cx) < this.halfW + pad && Math.abs(y - cy) < this.halfH + pad;
        this.X = X;
        this.Y = Y;
        const quality = this.quality(dt);
        this._halted = sim.time < (sim.haltUntil || 0);
        this._pickGlows = []; // the pickups' glowing pixels, drawn in the bloom pass with the rest

        // --- the map: its ground, with every decal baked in
        const world = this.world;
        world.sync(sim.stageId, sim.seed, sim.era?.id);
        this._warm(world.stageId);
        world.prepare(cx, cy, this.halfW, this.halfH);
        world.drawGround(ctx, X, Y, cx, cy, this.halfW, this.halfH);
        const view = { cx, cy, hw: this.halfW, hh: this.halfH };
        this.life.update(dt, t, sim, world, fx, view, quality !== 'low', fx.calm);
        this.life.drawGround(this, X, Y, t);

        const p = sim.player;

        // --- ground layer: aura, mines
        const aura = p.weapons.find((w) => w.def.type === 'aura');
        if (aura) this._drawAura(X(p.x), Y(p.y), aura.getRange(p) * s, t, aura.isEvolved());
        for (const m of sim.mines) {
            if (!visible(m.x, m.y)) continue;
            this._drawMine(m, X(m.x), Y(m.y), t);
        }
        for (const h of sim.honey || []) {
            if (!h.landed || !visible(h.x, h.y, h.radius)) continue;
            this._drawHoney(h, X(h.x), Y(h.y), t, fx.calm);
        }
        for (const w of sim.walls || []) this._drawBuyWall(w, X(w.x), Y(w.y));
        if (sim.sweepIn != null) this._drawSweepMeter(sim, X(p.x), Y(p.y), t, fx.calm);

        // --- XP candles (with a soft light under each)
        ctx.globalCompositeOperation = 'lighter';
        for (const o of sim.xp) {
            if (o.fall > 0 || o.frozen || !visible(o.x, o.y, 40)) continue;
            const big = o.value >= 50;
            const r = (big ? 30 : 18) * s;
            ctx.globalAlpha = 0.35 + 0.15 * Math.sin(t * 6 + o.x);
            ctx.drawImage(
                this._blob(big ? '255,197,61' : '22,224,138'),
                X(o.x) - r,
                Y(o.y) - r,
                r * 2,
                r * 2
            );
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        // Options Expiry: candles live a few seconds, so each one wears its own countdown ring
        const lifetime = sim.twist?.xpLifetime ?? SIM.XP_LIFETIME;
        const expiry = lifetime < SIM.XP_LIFETIME ? lifetime : 0;
        for (const o of sim.xp) {
            if (!visible(o.x, o.y, 40)) continue;
            if (o.fall > 0) {
                this._drawFallingCandle(o, X(o.x), Y(o.y), s);
                continue;
            }
            if (o.frozen) {
                // Withdrawal Freeze: iced in place, no bob, no blink
                this._blit('xp_candle_frozen', X(o.x), Y(o.y), {
                    frame: Math.floor(t * 2 + o.x) % 2
                });
                continue;
            }
            const bob = Math.sin(t * 5 + o.x * 0.1) * 2 * s;
            const alpha = o.life < 3 ? (Math.floor(t * 8) % 2 ? 0.35 : 1) : 1;
            this._blit(o.value >= 50 ? 'xp_candle_big' : 'xp_candle', X(o.x), Y(o.y) + bob, {
                alpha,
                frame: Math.floor(t * 3 + o.x) % 2
            });
            if (expiry && !o.vacuum) {
                const frac = Math.min(1, o.life / expiry);
                ctx.strokeStyle = o.life < 2 ? 'rgba(255,59,92,0.9)' : 'rgba(123,245,166,0.75)';
                ctx.lineWidth = Math.max(1.5, s * 2);
                ctx.beginPath();
                ctx.arc(X(o.x), Y(o.y) + bob, 13 * s, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
                ctx.stroke();
            }
        }

        // --- airdrop crates on the ground: landing markers and landed crates (falling ones fly above the crowd)
        for (const c of sim.crates) {
            if (!visible(c.x, c.y, 60)) continue;
            this._drawCrateGround(c, X(c.x), Y(c.y), t);
        }
        // --- what piggy banks and bosses dropped: pickups, and the boss's treasure chest
        for (const pk of sim.pickups || []) {
            if (!visible(pk.x, pk.y, 80)) continue;
            this._drawPickup(pk, X(pk.x), Y(pk.y), t, fx.calm);
        }

        // --- Rug Lord's second phase: a red glow under him, and the rug under the bull while he pulls it
        for (const e of sim.enemies) if (e.enraged && e.hp > 0) this._drawRug(e, p, X, Y, t, fx);
        // --- Withdrawal Freeze: the frost ring where candles freeze
        for (const e of sim.enemies) {
            if (e.def.freezeRadius && e.hp > 0) this._drawFreezeZone(e, X(e.x), Y(e.y), t, fx.calm);
        }
        // --- Liquidation Warning: a charge boss's landing spot, while it crouches
        for (const e of sim.enemies) {
            if (e.leapWarn > 0 && e.hp > 0)
                this._drawLeapWarn(e, X(e.leapX), Y(e.leapY), t, fx.calm);
            if (e.blinkWarn > 0 && e.hp > 0) this._drawBlinkWarn(e, p, X, Y, t, fx.calm);
        }

        // --- creatures: shadows first, then back-to-front by y (the bull sorts in with the bears)
        const list = [];
        for (const e of sim.enemies) if (e.hp > 0 && visible(e.x, e.y, e.size + 80)) list.push(e);
        for (const e of list) {
            const def = SPRITES[e.def.sprite || e.id];
            if (!def) continue;
            const w = def.w * k;
            const float = FLOATERS.has(e.id);
            this._shadow(
                X(e.x),
                Y(e.y) + (def.h * k) / 2 - (float ? -4 * k : 3 * k),
                w * (float ? 0.6 : 0.85),
                float ? 0.6 : 1
            );
        }
        const bullDef = SPRITES[this._playerSprite(sim)];
        this._shadow(X(p.x), Y(p.y) + (bullDef.h * k) / 2 - 3 * k, bullDef.w * k * 0.8);
        // the map's standing props: trees, walls, lamps... sorted in with the creatures by their foot
        const props = [];
        for (const c of world.visibleChunks(cx, cy, this.halfW, this.halfH))
            for (const pr of c.props) {
                const sd = SPRITES[pr.id];
                if (!sd) continue;
                const hw = sd.w + 8; // art px ≈ half the width in world units
                if (Math.abs(pr.x - cx) > this.halfW + hw) continue;
                if (pr.y < cy - this.halfH - 10 || pr.y - sd.h * 2 > cy + this.halfH + 10) continue;
                props.push(pr);
                const sh = PROP_DEFS[pr.id]?.shadow ?? 0.8;
                if (sh > 0) this._shadow(X(pr.x), Y(pr.y) - k, sd.w * k * sh, 0.9);
            }

        // what a tall prop must never hide: the bull, a crate, a chest
        this._focus = [[p.x, p.y]];
        for (const c of sim.crates) if (c.landed) this._focus.push([c.x, c.y]);
        for (const pk of sim.pickups || []) if (pk.kind === 'chest') this._focus.push([pk.x, pk.y]);
        const drawList = list.slice();
        drawList.push(p);
        for (const pr of props) drawList.push(pr);
        // piggy banks stand on the floor like props
        const pig = SPRITES.piggy_bank;
        for (const b of sim.breakables || []) {
            if (b.hp <= 0 || !visible(b.x, b.y, 40)) continue;
            drawList.push(b);
            this._shadow(X(b.x), Y(b.y) - k, pig.w * k * 0.8, 0.9);
        }
        drawList.sort((a, b) => a.y - b.y);
        const glows = this._pickGlows;
        for (const e of drawList) {
            if (e === p) this._drawBull(p, X(p.x), Y(p.y), t, dt, fx, glows, sim);
            else if (e.prop) this._drawProp(e, X, Y, t, dt, p, glows);
            else if (e.breakable) this._drawPiggy(e, X(e.x), Y(e.y), t, glows);
            else this._drawEnemy(e, X(e.x), Y(e.y), t, glows);
        }
        // doomposters typing: bubbles over the crowd, so nothing hides the tell
        for (const e of list) {
            if (e.windup > 0 && e.def.windup) this._drawTyping(e, X(e.x), Y(e.y), t, fx.calm);
            if (e.bagCount > 0) this._drawBag(e, X(e.x), Y(e.y), t, fx.calm);
        }
        // Whale Alert: the whale swims over the crowd
        if (sim.whale && visible(sim.whale.x, sim.whale.y, 120)) {
            this._drawWhale(sim.whale, X(sim.whale.x), Y(sim.whale.y), t, fx.calm, glows);
        }
        // --- the night: everything above is lit by the moon and the lights; what follows glows on its own
        if (quality !== 'low') this._light(sim, fx, world, props, X, Y, W, H, cx, cy, t);
        // forget enemies we no longer see
        if (this.seen.size > list.length * 2 + 200) {
            const alive = new Set(list.map((e) => e.uid));
            for (const uid of this.seen.keys()) if (!alive.has(uid)) this.seen.delete(uid);
        }

        // --- weapons on top of the crowd
        for (const w of p.weapons) {
            if (!w.shards) continue;
            for (const sh of w.shards) this._drawShard(sh, p, X, Y, t, glows);
        }
        for (const pr of sim.projectiles) {
            if (!visible(pr.x, pr.y, 60)) continue;
            this._drawProjectile(pr, X(pr.x), Y(pr.y), t, glows);
        }
        for (const h of sim.honey || []) {
            if (h.landed || !visible(h.x, h.y, 120)) continue;
            this._drawHoneyJar(h, X, Y, t, glows);
        }
        for (const b of sim.enemyProjectiles) {
            if (!visible(b.x, b.y, 30)) continue;
            this._blit('fud_bolt', X(b.x), Y(b.y), { frame: Math.floor(t * 12) });
            glows.push(['fud_bolt', X(b.x), Y(b.y), Math.floor(t * 12), false, 1]);
        }
        for (const c of sim.crates) {
            if (c.landed || !visible(c.x, c.y, 300)) continue;
            this._drawCrateFalling(c, X(c.x), Y(c.y), t, fx.calm, glows);
        }
        this._drawLoot(p, X(p.x), Y(p.y), t);
        if (sim.dipUntil > sim.time)
            this._drawDip(sim.dipUntil - sim.time, X(p.x), Y(p.y), t, fx.calm);

        // --- bloom pass: everything that glows, in one additive batch
        ctx.globalCompositeOperation = 'lighter';
        this._drawHalos(props, X, Y, t);
        for (const [id, x, y, frame, flip, a] of glows) {
            const g = bakeGlow(id, k, { flip });
            if (!g) continue;
            const img = g[(((frame | 0) % g.length) + g.length) % g.length];
            ctx.globalAlpha = a;
            ctx.drawImage(img, Math.round(x - img.width / 2), Math.round(y - img.height / 2));
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';

        this.life.drawAir(this, X, Y, W, H, t, quality !== 'low', fx.calm);
        this._drawFx(fx, X, Y, t);
        this._drawWeather(theme, W, H, t, dt);

        // --- lighting: vignette + stage tint
        ctx.drawImage(this._vignette(W, H, theme.vignette), 0, 0);
        this._drawScreenFx(fx, W, H, p, theme, t);
        this._drawWhaleAlert(sim, Y, W, H, t);
        this._drawScamArrows(sim, X, Y, W, H, t, fx.calm);
        this._drawOffscreen(sim, X, Y, W, H, t, fx.calm);
    }

    // ---------------------------------------------------------------- off screen

    /**
     * What matters but is off screen gets an arrow on the screen's edge with its picture: a boss (red) and a
     * landed airdrop crate (gold), so a run never loses a crate or a boss in the scenery.
     */
    _drawOffscreen(sim, X, Y, W, H, t, calm) {
        const marks = [];
        for (const e of sim.enemies)
            if (e.boss && e.hp > 0 && !e.fleeing)
                marks.push([e.x, e.y, '#FF3B5C', e.def.sprite || e.id]);
        for (const c of sim.crates) if (c.landed) marks.push([c.x, c.y, '#FFC53D', 'supply_crate']);
        for (const pk of sim.pickups || [])
            if (pk.kind === 'chest') marks.push([pk.x, pk.y, '#FFC53D', 'chest']);
        if (!marks.length) return;
        const ctx = this.ctx;
        const k = this.k;
        const pad = 30 * this.dpr;
        const top = 70 * this.dpr; // keep clear of the HUD
        for (const [wx, wy, color, icon] of marks) {
            const sx = X(wx);
            const sy = Y(wy);
            if (sx > 0 && sx < W && sy > 0 && sy < H) continue;
            const a = Math.atan2(sy - H / 2, sx - W / 2);
            const c = Math.cos(a);
            const s = Math.sin(a);
            const f = Math.min(
                Math.abs((W / 2 - pad) / (c || 1e-6)),
                Math.abs((H / 2 - (s < 0 ? top : pad)) / (s || 1e-6))
            );
            const ax = W / 2 + c * f;
            const ay = H / 2 + s * f;
            const pulse = calm ? 1 : 0.8 + 0.2 * Math.sin(t * 8);
            const r = 6 * k * pulse;
            ctx.fillStyle = color;
            ctx.strokeStyle = '#07090C';
            ctx.lineWidth = Math.max(2, k);
            ctx.beginPath();
            ctx.moveTo(ax + c * r, ay + s * r);
            ctx.lineTo(ax - c * r * 0.6 - s * r * 0.8, ay - s * r * 0.6 + c * r * 0.8);
            ctx.lineTo(ax - c * r * 0.6 + s * r * 0.8, ay - s * r * 0.6 - c * r * 0.8);
            ctx.closePath();
            ctx.stroke();
            ctx.fill();
            // its picture, small, just inside the arrow
            const sd = SPRITES[icon];
            if (!sd) continue;
            const want = (k * 15) / Math.max(sd.w, sd.h); // device px per art px for a ~15-art-px icon
            const img = bakeSprite(icon, Math.max(1, Math.floor(want)))?.[0];
            if (!img) continue;
            const f2 = want < 1 ? want : 1; // a big boss is drawn smaller than one px per art px
            const w = img.width * f2;
            const h = img.height * f2;
            const ix = ax - c * (r + w * 0.6);
            const iy = ay - s * (r + h * 0.6);
            ctx.imageSmoothingEnabled = f2 < 1;
            ctx.drawImage(
                img,
                Math.round(ix - w / 2),
                Math.round(iy - h / 2),
                Math.round(w),
                Math.round(h)
            );
            ctx.imageSmoothingEnabled = false;
        }
    }

    // ---------------------------------------------------------------- Exit Scam

    /** Over a scammer with loot: a green candle and how many it holds; gold and bouncing once it runs. */
    _drawBag(e, sx, sy, t, calm) {
        const ctx = this.ctx;
        const sd = SPRITES[e.def.sprite || e.id];
        const u = Math.max(2, Math.round(this.k));
        const hop = e.fleeing && !calm ? Math.round(Math.abs(Math.sin(t * 12)) * -2 * u) : 0;
        const y = Math.round(sy - ((sd ? sd.h : 24) * this.k) / 2 - 5 * u + hop);
        const label = `${e.bagCount}`;
        ctx.font = `${Math.round(9 * u)}px "Jersey 10", monospace`;
        const tw = Math.ceil(ctx.measureText(label).width);
        const w = 4 * u + tw;
        const x = Math.round(sx - w / 2);
        const col = e.fleeing ? '#FFC53D' : '#16E08A';
        ctx.fillStyle = 'rgba(7,9,12,0.85)';
        ctx.fillRect(x - u, y - 4 * u, w + 2 * u, 8 * u);
        // a little candle
        ctx.fillStyle = col;
        ctx.fillRect(x, y - 2 * u, 2 * u, 4 * u);
        ctx.fillRect(x + u / 2, y - 3 * u, u, 6 * u);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x + 3 * u, y + u / 2);
    }

    /** A running scammer off screen: a gold arrow on the screen edge, pointing at it. */
    _drawScamArrows(sim, X, Y, W, H, t, calm) {
        const ctx = this.ctx;
        const k = this.k;
        const pad = 22 * this.dpr;
        for (const e of sim.enemies) {
            if (!e.fleeing || e.hp <= 0 || e.despawned) continue;
            const sx = X(e.x);
            const sy = Y(e.y);
            if (sx > 0 && sx < W && sy > 0 && sy < H) continue;
            const a = Math.atan2(sy - H / 2, sx - W / 2);
            const c = Math.cos(a);
            const s = Math.sin(a);
            // where the ray from the centre meets the padded screen edge
            const f = Math.min(
                Math.abs((W / 2 - pad) / (c || 1e-6)),
                Math.abs((H / 2 - pad) / (s || 1e-6))
            );
            const ax = W / 2 + c * f;
            const ay = H / 2 + s * f;
            const pulse = calm ? 1 : 0.7 + 0.3 * Math.sin(t * 10);
            const r = 7 * k * pulse;
            ctx.fillStyle = '#FFC53D';
            ctx.strokeStyle = '#07090C';
            ctx.lineWidth = Math.max(2, k);
            ctx.beginPath();
            ctx.moveTo(ax + c * r, ay + s * r);
            ctx.lineTo(ax - c * r * 0.6 - s * r * 0.8, ay - s * r * 0.6 + c * r * 0.8);
            ctx.lineTo(ax - c * r * 0.6 + s * r * 0.8, ay - s * r * 0.6 - c * r * 0.8);
            ctx.closePath();
            ctx.stroke();
            ctx.fill();
            if (e.bagCount > 0) {
                ctx.font = `${Math.round(8 * k)}px "Jersey 10", monospace`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(`${e.bagCount}`, ax - c * r * 1.9, ay - s * r * 1.9);
            }
        }
    }

    // ---------------------------------------------------------------- The Whale

    /**
     * Buy Wall: a green ring at the wall's front with bid bars standing on it (an order book seen from above),
     * fading as it nears its range. Tsunami Bid's second wall is pale blue. Drawn from the sim's state, so a
     * replay shows exactly where it hit.
     */
    _drawBuyWall(w, sx, sy) {
        const ctx = this.ctx;
        const s = this.s;
        const k = Math.min(1, w.r / w.range);
        const r = w.r * s;
        if (r < 2) return;
        const a = 0.85 * (1 - k * k * 0.75);
        const rgb = w.second ? '166,210,255' : '22,224,138';
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(${rgb},${a * 0.35})`;
        ctx.lineWidth = Math.max(4, 10 * s);
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, TAU);
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = `rgba(${rgb},${a})`;
        ctx.lineWidth = Math.max(1.5, 2.5 * s);
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, TAU);
        ctx.stroke();
        // the bids: short bars standing on the ring, every ~11 px of circumference, alternating heights
        const n = Math.max(12, Math.min(64, Math.round((w.r * TAU) / 22)));
        ctx.fillStyle = w.second ? `rgba(232,250,255,${a})` : `rgba(184,255,217,${a})`;
        const bw = Math.max(2, 2.5 * s);
        for (let i = 0; i < n; i++) {
            const ang = (i / n) * TAU;
            const h = (i % 3 === 0 ? 9 : i % 3 === 1 ? 6 : 4) * s;
            ctx.fillRect(
                Math.round(sx + Math.cos(ang) * r - bw / 2),
                Math.round(sy + Math.sin(ang) * r - h),
                bw,
                h
            );
        }
    }

    /**
     * Sweep the Book: a thin arc under the Whale fills over the minute; in the last 3 s it turns gold and pulses,
     * so the player knows to swim away from the candles and let them come.
     */
    _drawSweepMeter(sim, sx, sy, t, calm) {
        const every = sim.character.sweepEvery;
        const left = sim.sweepIn;
        const frac = 1 - left / every;
        const ctx = this.ctx;
        const k = this.k;
        const soon = left <= 3;
        const rx = 20 * k;
        const ry = 7 * k;
        const y = sy + 15 * k;
        ctx.lineWidth = Math.max(2, 1.6 * k);
        ctx.strokeStyle = 'rgba(7,9,12,0.55)';
        ctx.beginPath();
        ctx.ellipse(sx, y, rx, ry, 0, 0, TAU);
        ctx.stroke();
        const pulse = soon && !calm ? 0.65 + 0.35 * Math.sin(t * 14) : 1;
        ctx.strokeStyle = soon ? `rgba(255,197,61,${pulse})` : 'rgba(22,224,138,0.8)';
        ctx.beginPath();
        ctx.ellipse(sx, y, rx, ry, 0, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
        ctx.stroke();
    }

    // ---------------------------------------------------------------- Whale Alert

    /** The whale, gliding a little above the chart with its shadow on the floor. Faces the way it swims. */
    _drawWhale(w, sx, sy, t, calm, glows) {
        const k = this.k;
        const def = SPRITES.whale;
        const lift = calm ? 0 : Math.sin(t * 2.2) * 2 * k;
        this._shadow(sx, sy + (def.h * k) / 2 + 2 * k, def.w * k * 0.8, 0.7);
        const frame = Math.floor(t * (def.fps || 5));
        const y = sy - 4 * k + lift;
        this._blit('whale', sx, y, { frame, flip: w.dir < 0 });
        glows.push(['whale', sx, y, frame, w.dir < 0, 0.9]);
    }

    /** During the alert: a blinking whale and an arrow on the screen edge it will swim in from, at its lane. */
    _drawWhaleAlert(sim, Y, W, H, t) {
        const plan = sim.whalePlan;
        if (!plan || plan.spawned || Math.floor(t * 5) % 2) return;
        const ctx = this.ctx;
        const k = this.k;
        const def = SPRITES.whale;
        const scale = 0.7;
        const pad = 10 * this.dpr;
        const hw = (def.w * k * scale) / 2;
        const from = -plan.dir; // -1: the left edge
        const x = from < 0 ? pad + hw + 8 * k : W - pad - hw - 8 * k;
        const y = Math.max(pad + 40 * k, Math.min(H - pad - 40 * k, Y(sim.player.y + plan.lane)));
        this._blit('whale', x, y, { flip: plan.dir < 0, sx: scale, sy: scale });
        // arrow, pointing the way it will swim
        const ax = from < 0 ? x + hw + 4 * k : x - hw - 4 * k;
        const d = plan.dir;
        ctx.fillStyle = '#9BE2FF';
        ctx.beginPath();
        ctx.moveTo(ax + d * 5 * k, y);
        ctx.lineTo(ax - d * 1 * k, y - 5 * k);
        ctx.lineTo(ax - d * 1 * k, y + 5 * k);
        ctx.closePath();
        ctx.fill();
    }

    // ---------------------------------------------------------------- creatures

    /** The sprite of the character this run plays (the bull unless the run says otherwise). */
    _playerSprite(sim) {
        // a Market skin, if the player wears one for this character (cosmetic: game.js sets `this.look`)
        const skin = this.look?.skins?.[sim.characterId];
        if (skin && SPRITES[skin]) return skin;
        const id = sim.character?.sprite;
        return id && SPRITES[id] ? id : 'bull';
    }

    _drawBull(p, sx, sy, t, dt, fx, glows, sim) {
        const id = this._playerSprite(sim);
        const def = SPRITES[id];
        const n = def.frames.length;
        const frame = p.moving ? Math.floor(t * (def.fps || 10)) % n : 0;
        const hurt = p.invincible && p.invincibleTimer > 0.42;
        const blink = p.invincible && !hurt && Math.floor(t * 18) % 2 === 0;
        // idle breathing
        const breathe = p.moving ? 1 : 1 + Math.sin(t * 3) * 0.02;
        const riding = p.rocketTimer > 0;
        if (riding) {
            // Moon Rocket: the bull stands on it, lifted a little; it blinks in the last second, sparks trail
            const k = this.k;
            const bob = fx.calm ? 0 : Math.sin(t * 22) * 1.2 * k;
            const ry = sy + 17 * k + bob;
            const fr = Math.floor(t * 14);
            const fade = p.rocketTimer < 1 && Math.floor(t * 10) % 2;
            this._blit('moon_rocket', sx, ry, {
                frame: fr,
                flip: p.facing < 0,
                alpha: fade ? 0.45 : 1,
                sx: 1.3,
                sy: 1.3
            });
            glows.push(['moon_rocket', sx, ry, fr, p.facing < 0, 0.9]);
            sy += bob - 6 * k;
            if (!fx.calm && t - (this.rocketSparkAt || 0) > 0.05) {
                this.rocketSparkAt = t;
                fx.burst(p.x - p.facing * 30, p.y + 14, '#FFB05C', 2, 90, 2.5, 'spark');
            }
        }
        this._blit(id, sx, sy, {
            frame,
            flip: p.facing < 0,
            tint: hurt ? '#FFFFFF' : null,
            alpha: blink ? 0.5 : 1,
            sx: 1 / breathe,
            sy: breathe
        });
        // footstep dust
        if (p.moving && !riding && t - this.dustAt > 0.09) {
            this.dustAt = t;
            fx.dust(p.x - p.facing * 12, p.y + 22, p.facing, DUST[sim.stageId]);
        }
        // a Market trail: a few particles left behind while moving (none with reduced motion)
        const trail = this.look?.trail;
        if (trail && p.moving && !fx.calm && t - (this.trailAt || 0) > 0.06) {
            this.trailAt = t;
            fx.burst(
                p.x - p.facing * 16,
                p.y + 10,
                trail.color,
                trail.n,
                40,
                trail.size,
                trail.kind
            );
        }
        if (def.glowFrames) glows.push([id, sx, sy, frame, p.facing < 0, 0.8]);
        void dt;
    }

    _drawEnemy(e, sx, sy, t, glows) {
        const ctx = this.ctx;
        const def = e.def;
        const id = def.sprite || e.id;
        const sd = SPRITES[id];
        if (!sd) {
            ctx.fillStyle = KILL_COLORS[e.id] || '#FF3B5C';
            ctx.beginPath();
            ctx.arc(sx, sy, e.size * this.s, 0, TAU);
            ctx.fill();
            return;
        }
        // spawn-in: rise out of the chart
        let first = this.seen.get(e.uid);
        if (first === undefined) {
            first = t;
            this.seen.set(e.uid, t);
        }
        const age = t - first;
        const k0 = Math.min(1, age / 0.28);
        const pop = k0 < 1 ? 0.55 + 0.45 * (1 - (1 - k0) * (1 - k0)) : 1;

        let tint = null;
        let sxs = pop;
        let sys = pop;
        const fps = (sd.fps || 8) * (e.dashActive > 0 || e.fleeing ? 2 : 1);
        let frame = Math.floor(t * fps + e.uid * 0.37) % sd.frames.length;
        if (e.flashTimer > 0) {
            tint = '#FFFFFF';
            sxs *= 1.12;
            sys *= 0.9;
        } else if (this._halted && !e.boss) {
            // Trading Halt: iced over, mid-stride
            tint = '#BDEFFF';
            frame = 0;
        } else if (e.honeyTimer > 0) {
            // Honey Trap: no tint (gold on a gold puddle hides the bear); a grizzly that sat down to eat bobs
            if (e.honeyPct >= 1) {
                frame = 0;
                sys *= 1 - 0.05 * Math.abs(Math.sin(t * 9 + e.uid));
            }
        } else if (e.slowTimer > 0 || e.auraSlowTimer > 0) tint = '#9FE6FF';
        if (def.bomber && e.fuseArmed) {
            frame = (t * 20) % 2 < 1 ? 1 : 3;
            if (Math.floor(t * 12) % 2 === 0) tint = '#FFFFFF';
            sxs *= 1 + Math.sin(t * 40) * 0.06;
        }
        if (def.pumper) {
            // the frames are swell stages; between them it breathes in, and fully pumped it throbs and flashes
            frame = Math.min(3, Math.floor(e.pump * 4));
            const full = e.pump >= 1;
            const beat = Math.sin(t * (full ? 26 : 7) + e.uid);
            sxs *= 1 + beat * (full ? 0.07 : 0.03);
            sys *= 1 - beat * (full ? 0.05 : 0.02);
            if (full && !tint && Math.floor(t * 10) % 2 === 0) tint = '#FFFFFF';
        }
        if (e.leapWarn > 0) {
            // crouched to jump: squashed low and wide, and it flashes red in the last third
            const k = 1 - e.leapWarn / (def.chargeWarn || 1);
            sxs *= 1 + 0.1 * k;
            sys *= 1 - 0.14 * k;
            if (k > 0.66 && !tint && Math.floor(t * 14) % 2 === 0) tint = '#FF3B5C';
        }
        const flip = e.facing > 0 ? false : true;
        // Side-view art faces right; enemies walk toward the bull, so mirror when they head left.
        const alpha = (e.isClone ? 0.55 : 1) * Math.min(1, k0 * 1.4);
        if (e.boss) {
            // a red floor light under bosses
            ctx.globalCompositeOperation = 'lighter';
            const r = sd.w * this.k * 0.9;
            ctx.globalAlpha = 0.35 + 0.1 * Math.sin(t * 3);
            ctx.drawImage(
                this._blob(
                    id === 'long_winter' || id === 'withdrawal_freeze' ? '70,184,240' : '255,59,92'
                ),
                sx - r,
                sy - r * 0.6,
                r * 2,
                r * 1.6
            );
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
        }
        this._blit(id, sx, sy, { frame, flip, tint, alpha, sx: sxs, sy: sys });
        if (!tint && sd.glowFrames) glows.push([id, sx, sy, frame, flip, e.boss ? 1 : 0.75]);

        if (e.shielded && e.shieldHp > 0) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = `rgba(70,200,255,${0.45 + 0.2 * Math.sin(t * 6)})`;
            ctx.lineWidth = Math.max(1, this.s * 2);
            ctx.beginPath();
            ctx.arc(sx, sy, (e.size + 8) * this.s, 0, TAU);
            ctx.stroke();
            ctx.globalCompositeOperation = 'source-over';
        }
        if (!e.boss && e.hp < e.maxHp) {
            const w = Math.max(18, e.size * 1.6) * this.s;
            const h = Math.max(2, 2 * this.dpr);
            const y = sy + (sd.h * this.k) / 2 + 2 * this.dpr;
            ctx.fillStyle = 'rgba(7,9,12,0.85)';
            ctx.fillRect(sx - w / 2 - 1, y - 1, w + 2, h + 2);
            ctx.fillStyle = '#FF3B5C';
            ctx.fillRect(sx - w / 2, y, w * Math.max(0, e.hp / e.maxHp), h);
        }
    }

    /**
     * A chat bubble over a doomposter winding up a shot: the dots fill in over the wind-up (one, two, three),
     * and the bubble turns red for the last beat before the post goes out.
     */
    _drawTyping(e, sx, sy, t, calm) {
        const ctx = this.ctx;
        const sd = SPRITES[e.def.sprite || e.id];
        const u = Math.max(2, Math.round(this.k)); // one bubble pixel, in device px
        const prog = 1 - e.windup / e.def.windup;
        const dots = Math.min(3, 1 + Math.floor(prog * 3));
        const late = prog > 0.72;
        const w = 13 * u;
        const h = 7 * u;
        const bob = calm ? 0 : Math.round(Math.sin(t * 18) * 0.5 * u);
        const x = Math.round(sx - w / 2);
        const y = Math.round(sy - ((sd ? sd.h : 22) * this.k) / 2 - h - 4 * u + bob);
        ctx.fillStyle = '#07090C';
        ctx.fillRect(x - u, y, w + 2 * u, h);
        ctx.fillRect(x, y - u, w, h + 2 * u);
        ctx.fillStyle = late ? '#FF3B5C' : '#EEF1F5';
        ctx.fillRect(x, y, w, h);
        // tail, pointing down at the poster
        ctx.fillRect(x + 3 * u, y + h, 2 * u, u);
        ctx.fillRect(x + 3 * u, y + h + u, u, u);
        ctx.fillStyle = late ? '#FFFFFF' : '#6B55A0';
        for (let i = 0; i < dots; i++)
            ctx.fillRect(x + (2 + i * 4) * u, y + 3 * u, u + u / 2, u + u / 2);
    }

    // ---------------------------------------------------------------- airdrop crates

    /** Boss Jackpot: a gold candle dropping out of the sky for its last CANDLE_DROP s, then it lands (sim). */
    _drawFallingCandle(o, sx, sy, s) {
        const drop = Math.min(o.fallMax, CANDLE_DROP);
        if (o.fall > drop) return; // still queued up behind the candles before it
        const f = o.fall / drop; // 1 at the top of the drop, 0 on the ground
        const h = CANDLE_DROP_HEIGHT * s * f * f;
        const ctx = this.ctx;
        this._shadow(sx, sy + 8 * s, 18 * s * (1 - f * 0.6), 0.5 * (1 - f));
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = 'rgba(255,197,61,0.5)';
        const w = Math.max(2, Math.round(4 * s));
        ctx.fillRect(
            Math.round(sx - w / 2),
            Math.round(sy - h - 60 * s * f),
            w,
            Math.round(60 * s * f)
        );
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        this._blit('xp_candle_big', sx, sy - h);
    }

    /** A falling crate's landing ring, or a landed crate with a green beacon (blinking when it's about to go). */
    /** A piggy bank on the floor, its foot at (sx, sy): it glints, and its slot glows a little. */
    _drawPiggy(b, sx, sy, t, glows) {
        const def = SPRITES.piggy_bank;
        const k = this.k;
        const y = sy - (def.h / 2 - 2) * k;
        const frame = Math.floor(t * (def.fps || 6) + b.key * 0.13);
        this._blit('piggy_bank', sx, y, { frame });
        if (def.glowFrames) glows.push(['piggy_bank', sx, y, frame, false, 0.8]);
    }

    /**
     * A pickup on the floor (PICKUPS): it pops up when dropped, bobs, glows its colour and blinks in its last 5 s.
     * The boss's chest sits heavier, under a gold beam.
     */
    _drawPickup(pk, sx, sy, t, calm) {
        const id = PICKUPS[pk.kind]?.sprite;
        const def = id && SPRITES[id];
        if (!def) return;
        if (pk.life < 5 && Math.floor(t * 8) % 2) return;
        const ctx = this.ctx;
        const s = this.s;
        const chest = pk.kind === 'chest';
        const age = pk.maxLife - pk.life;
        const pop = calm ? 1 : Math.min(1, age / 0.3);
        const hop = calm ? 0 : (1 - pop) * 26 * s * Math.sin(pop * Math.PI);
        const bob = chest || calm ? 0 : Math.sin(t * 4 + pk.x) * 2 * s;
        const rgb = PICKUP_GLOW[pk.kind] || '255,214,150';
        const pulse = 0.5 + 0.5 * Math.sin(t * 4 + pk.y);
        ctx.globalCompositeOperation = 'lighter';
        if (chest) {
            const beam = ctx.createLinearGradient(0, sy - 190 * s, 0, sy);
            beam.addColorStop(0, `rgba(${rgb},0)`);
            beam.addColorStop(1, `rgba(${rgb},${0.28 + 0.14 * pulse})`);
            ctx.fillStyle = beam;
            ctx.fillRect(sx - 10 * s, sy - 190 * s, 20 * s, 190 * s);
        }
        const r = (chest ? 52 : 26) * s;
        ctx.globalAlpha = 0.4 + 0.2 * pulse;
        ctx.drawImage(this._blob(rgb), sx - r, sy - r * 0.6 - 6 * s, r * 2, r * 1.2);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        this._shadow(sx, sy + 2 * s, def.w * this.k * 0.8 * pop);
        const frame = Math.floor(t * (def.fps || 6));
        const y = sy - (def.h * this.k) / 2 + 2 * this.k + bob - hop;
        this._blit(id, sx, y, { frame, sx: pop, sy: pop });
        if (def.glowFrames && pop >= 1) this._pickGlows.push([id, sx, y, frame, false, 0.9]);
    }

    _drawCrateGround(c, sx, sy, t) {
        const ctx = this.ctx;
        const s = this.s;
        if (!c.landed) {
            const k = 1 - c.fall / SIM.CRATE_FALL;
            ctx.strokeStyle = `rgba(22,224,138,${0.35 + 0.35 * k})`;
            ctx.lineWidth = Math.max(1, s * 2);
            ctx.setLineDash([5 * this.dpr, 6 * this.dpr]);
            ctx.lineDashOffset = -t * 30;
            ctx.beginPath();
            ctx.ellipse(sx, sy, 30 * s, 12 * s, 0, 0, TAU);
            ctx.stroke();
            ctx.setLineDash([]);
            this._shadow(sx, sy + 8 * s, 44 * s * (0.3 + 0.7 * k), 0.3 + 0.7 * k);
            return;
        }
        if (c.life < 5 && Math.floor(t * 8) % 2) return;
        const pulse = 0.5 + 0.5 * Math.sin(t * 4);
        ctx.globalCompositeOperation = 'lighter';
        const beam = ctx.createLinearGradient(0, sy - 150 * s, 0, sy);
        beam.addColorStop(0, 'rgba(22,224,138,0)');
        beam.addColorStop(1, `rgba(22,224,138,${0.22 + 0.12 * pulse})`);
        ctx.fillStyle = beam;
        ctx.fillRect(sx - 7 * s, sy - 150 * s, 14 * s, 150 * s);
        const r = 44 * s;
        ctx.globalAlpha = 0.45 + 0.2 * pulse;
        ctx.drawImage(this._blob('22,224,138'), sx - r, sy - r * 0.5, r * 2, r);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        this._shadow(sx, sy + 8 * s, 44 * s);
        this._blit('supply_crate', sx, sy - 6 * s, { frame: Math.floor(t * 4) });
    }

    /** A crate on its way down under a swaying green parachute. */
    _drawCrateFalling(c, sx, sy, t, calm, glows) {
        const s = this.s;
        const k = c.fall / SIM.CRATE_FALL; // 1 = just dropped, 0 = touching down
        const y = sy - 6 * s - k * k * 260 * s;
        const sway = calm ? 0 : Math.sin(t * 2.4 + c.x * 0.01) * 0.14 * k;
        const x = sx + sway * 40 * s;
        const crate = SPRITES.supply_crate;
        const chute = SPRITES.supply_chute;
        const drop = (crate.h / 2 + chute.h / 2 - 2) * this.k;
        this._blit('supply_chute', x + Math.sin(sway) * drop, y - Math.cos(sway) * drop, {
            frame: Math.floor(t * 3),
            rot: sway
        });
        this._blit('supply_crate', x, y, { frame: Math.floor(t * 4), rot: sway });
        glows.push(['supply_crate', x, y, Math.floor(t * 4), false, 0.8]);
    }

    /** Withdrawal Freeze: a faint icy disc and a dashed frost ring at the freeze radius; the dashes creep round. */
    _drawFreezeZone(boss, sx, sy, t, calm) {
        const ctx = this.ctx;
        const r = boss.def.freezeRadius * this.s;
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(70,184,240,0.06)';
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.lineWidth = Math.max(1, this.s * 2);
        ctx.strokeStyle = 'rgba(155,226,255,0.55)';
        const dash = 10 * this.s;
        ctx.setLineDash([dash, dash * 0.8]);
        ctx.lineDashOffset = calm ? 0 : -t * 20 * this.s;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
    }

    /** Liquidation Warning: a red target on the landing spot. The outer ring is the hit zone (inside it, the
     * landing hits you); an inner ring closes in on it as the crouch runs out, and the fill blinks faster. */
    _drawLeapWarn(boss, sx, sy, t, calm) {
        const ctx = this.ctx;
        const s = this.s;
        const r = boss.leapR * s;
        const warn = boss.def.chargeWarn || 1;
        const k = 1 - boss.leapWarn / warn; // 0 = just marked, 1 = landing now
        const blink = calm ? 1 : Math.floor(t * (6 + 14 * k)) % 2 ? 0.55 : 1;
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(255,59,92,${(0.1 + 0.22 * k) * blink})`;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.lineWidth = Math.max(2, s * 3);
        ctx.strokeStyle = `rgba(255,59,92,${0.6 + 0.4 * blink * k})`;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, TAU);
        ctx.stroke();
        // the closing ring: from twice the size down to the edge
        ctx.lineWidth = Math.max(1, s * 2);
        ctx.strokeStyle = `rgba(255,140,160,${0.35 + 0.5 * k})`;
        ctx.beginPath();
        ctx.arc(sx, sy, r * (2 - k), 0, TAU);
        ctx.stroke();
        // crosshair ticks on the edge, and a dot in the middle
        ctx.fillStyle = 'rgba(255,59,92,0.95)';
        const w = Math.max(2, 3 * s);
        const l = 9 * s;
        for (let i = 0; i < 4; i++) {
            const a = (i * TAU) / 4;
            const cx = sx + Math.cos(a) * (r - l / 2);
            const cy = sy + Math.sin(a) * (r - l / 2);
            const horiz = i % 2 === 0;
            ctx.fillRect(
                Math.round(cx - (horiz ? l : w) / 2),
                Math.round(cy - (horiz ? w : l) / 2),
                horiz ? l : w,
                horiz ? w : l
            );
        }
        ctx.fillRect(Math.round(sx - w / 2), Math.round(sy - w / 2), w, w);
    }

    /** Flash Loan: a violet ring where it will be (the hit zone), a ring closing in on it, and a dotted line back to
     * the bear, so you see where it comes from and where it lands. */
    _drawBlinkWarn(e, p, X, Y, t, calm) {
        const ctx = this.ctx;
        const s = this.s;
        const sx = X(e.blinkX);
        const sy = Y(e.blinkY);
        const r = (e.size + p.size) * s;
        const k = 1 - e.blinkWarn / (e.def.blinkWarn || 0.6);
        const blink = calm ? 1 : Math.floor(t * (8 + 16 * k)) % 2 ? 0.6 : 1;
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(150,90,255,${(0.1 + 0.2 * k) * blink})`;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.lineWidth = Math.max(2, s * 2.5);
        ctx.strokeStyle = `rgba(185,140,255,${0.6 + 0.4 * blink * k})`;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, TAU);
        ctx.stroke();
        ctx.lineWidth = Math.max(1, s * 1.5);
        ctx.strokeStyle = `rgba(127,240,255,${0.3 + 0.5 * k})`;
        ctx.beginPath();
        ctx.arc(sx, sy, r * (2 - k), 0, TAU);
        ctx.stroke();
        ctx.setLineDash([4 * s, 5 * s]);
        ctx.strokeStyle = 'rgba(185,140,255,0.45)';
        ctx.beginPath();
        ctx.moveTo(X(e.x), Y(e.y));
        ctx.lineTo(sx, sy);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    /** Enraged Rug Lord: a pulsing red glow under him; during a warning the rug blinks under the bull, during a
     * pull it scrolls toward him and kicks up dust. */
    _drawRug(lord, p, X, Y, t, fx) {
        const ctx = this.ctx;
        const s = this.s;
        const k = this.k;
        const r = (lord.size * 2.4 + Math.sin(t * 8) * 6) * s;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.45;
        ctx.drawImage(this._blob('255,59,92'), X(lord.x) - r, Y(lord.y) - r, r * 2, r * 2);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        if (lord.rugWarn <= 0 && lord.rugPull <= 0) return;
        const pulling = lord.rugPull > 0;
        const x = X(p.x);
        const y = Y(p.y) + 12 * k;
        this._blit('rug', x, y, {
            frame: pulling && !fx.calm ? Math.floor(t * 16) : 0,
            alpha: pulling ? 1 : Math.floor(t * 12) % 2 ? 0.4 : 0.9,
            rot: lord.rugAngle,
            sx: 1.5,
            sy: 1.5
        });
        if (pulling && t - (this.rugDustAt || 0) > 0.06) {
            this.rugDustAt = t;
            fx.dust(p.x, p.y + 22, Math.cos(lord.rugAngle) >= 0 ? 1 : -1);
        }
    }

    /** Crate loot on the bull: a shield bubble, or the money printer's spinning gold ring. */
    _drawLoot(p, sx, sy, t) {
        const ctx = this.ctx;
        const s = this.s;
        if (p.shieldTimer > 0 && !(p.shieldTimer < 1.5 && Math.floor(t * 10) % 2)) {
            const r = (p.size + 16 + Math.sin(t * 5) * 1.5) * s;
            ctx.globalCompositeOperation = 'lighter';
            const g = ctx.createRadialGradient(sx, sy, r * 0.55, sx, sy, r);
            g.addColorStop(0, 'rgba(70,184,240,0)');
            g.addColorStop(1, 'rgba(70,184,240,0.3)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(sx, sy, r, 0, TAU);
            ctx.fill();
            ctx.strokeStyle = 'rgba(155,226,255,0.8)';
            ctx.lineWidth = Math.max(1, s * 2);
            ctx.stroke();
            ctx.fillStyle = 'rgba(232,250,255,0.85)';
            const hx = sx - r * 0.45;
            const hy = sy - r * 0.55;
            ctx.fillRect(Math.round(hx), Math.round(hy), Math.max(2, 3 * s), Math.max(2, 3 * s));
            ctx.globalCompositeOperation = 'source-over';
        }
        if (p.printerTimer > 0 && !(p.printerTimer < 1.5 && Math.floor(t * 10) % 2)) {
            const r = (p.size + 22) * s;
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = 'rgba(255,197,61,0.75)';
            ctx.lineWidth = Math.max(1, s * 2.5);
            ctx.setLineDash([3 * this.dpr, 7 * this.dpr]);
            ctx.lineDashOffset = -t * 90;
            ctx.beginPath();
            ctx.arc(sx, sy, r, 0, TAU);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalCompositeOperation = 'source-over';
        }
    }

    /** Buy the Dip: a green glow on the bull, a ring that runs down with the window, and green pluses rising off
     * him (still under reduced motion). `left`: seconds of the window left. */
    _drawDip(left, sx, sy, t, calm) {
        const ctx = this.ctx;
        const s = this.s;
        const frac = Math.min(1, left / SIM.DIP_TIME);
        const pulse = calm ? 0 : Math.sin(t * 9);
        const r = (SIM.PLAYER_SIZE + 26) * s;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.4 + 0.12 * pulse;
        const g = (r + 10 * s) * 1.2;
        ctx.drawImage(this._blob('22,224,138'), sx - g, sy - g, g * 2, g * 2);
        ctx.globalAlpha = 1;
        // the countdown: a full ring at the start, gone when the window closes
        ctx.strokeStyle = 'rgba(123,245,166,0.9)';
        ctx.lineWidth = Math.max(2, s * 3);
        ctx.beginPath();
        ctx.arc(sx, sy, r, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
        ctx.stroke();
        if (!calm) {
            ctx.fillStyle = 'rgba(190,255,214,0.9)';
            const u = Math.max(1, Math.round(2 * s));
            for (let i = 0; i < 4; i++) {
                const ph = (t * 0.9 + i / 4) % 1;
                const px = sx + Math.cos(i * 2.1 + 0.6) * r * 0.75;
                const py = sy + r * 0.4 - ph * r * 1.6;
                ctx.globalAlpha = 1 - ph;
                ctx.fillRect(Math.round(px - u * 1.5), Math.round(py - u / 2), u * 3, u);
                ctx.fillRect(Math.round(px - u / 2), Math.round(py - u * 1.5), u, u * 3);
            }
            ctx.globalAlpha = 1;
        }
        ctx.globalCompositeOperation = 'source-over';
    }

    // ---------------------------------------------------------------- weapons

    /** Hopium's cloud. Evolved (Copium) it turns the cold cyan of the bears it slows, and its bubbles sink. */
    _drawAura(x, y, r, t, evolved = false) {
        const ctx = this.ctx;
        const rgb = evolved ? '64,214,230' : '22,224,138';
        const hi = evolved ? '159,230,255' : '123,245,166';
        const key = `aura:${evolved ? 'c' : 'h'}:${Math.round(r / 4)}`;
        let tex = this._cache[key];
        if (!tex) {
            tex = makeCanvas(r * 2 + 4, r * 2 + 4);
            const g = tex.getContext('2d');
            const gr = g.createRadialGradient(r + 2, r + 2, r * 0.15, r + 2, r + 2, r);
            gr.addColorStop(0, `rgba(${rgb},${evolved ? 0.05 : 0.02})`);
            gr.addColorStop(0.75, `rgba(${rgb},${evolved ? 0.14 : 0.1})`);
            gr.addColorStop(1, `rgba(${rgb},${evolved ? 0.3 : 0.22})`);
            g.fillStyle = gr;
            g.beginPath();
            g.arc(r + 2, r + 2, r, 0, TAU);
            g.fill();
            this._cache[key] = tex;
        }
        const pulse = 0.85 + 0.15 * Math.sin(t * 4);
        ctx.globalAlpha = pulse;
        ctx.drawImage(tex, x - tex.width / 2, y - tex.height / 2);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = `rgba(${hi},${0.3 + 0.2 * Math.sin(t * 4)})`;
        ctx.lineWidth = Math.max(1, this.s * (evolved ? 2 : 1.5));
        ctx.setLineDash([4 * this.dpr, 10 * this.dpr]);
        // Copium's ring crawls the other way.
        ctx.lineDashOffset = evolved ? t * 14 : -t * 40;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        // rising hopium bubbles; copium sinks
        ctx.fillStyle = `rgba(${hi},0.55)`;
        const rise = evolved ? -14 : 30;
        for (let i = 0; i < (evolved ? 14 : 10); i++) {
            const a = hash1(i) * TAU + t * 0.2;
            const rr = r * (0.3 + 0.65 * hash1(i * 7));
            const life = (t * 0.6 + hash1(i * 13)) % 1;
            const bx = x + Math.cos(a) * rr;
            const by = y + Math.sin(a) * rr * 0.9 - life * rise * this.s;
            const sz = Math.max(1, (1 - life) * 3 * this.dpr);
            ctx.globalAlpha = 1 - life;
            ctx.fillRect(Math.round(bx), Math.round(by), sz, sz);
        }
        ctx.globalAlpha = 1;
    }

    /** Honey Trap: a puddle of honey, lumpy at the edge (the lumps are fixed per puddle), fading out at the end. */
    _drawHoney(h, x, y, t, calm) {
        const ctx = this.ctx;
        const s = this.s;
        const r = h.radius * s;
        const fade = Math.min(1, h.life / 0.8);
        const grow = Math.min(1, (h.maxLife - h.life) / 0.15 + 0.4);
        const seed = Math.abs(Math.round(h.x * 7 + h.y * 13));
        const blobs = [[0, 0, 1]];
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * TAU + (seed % 7);
            blobs.push([Math.cos(a) * 0.55, Math.sin(a) * 0.45, 0.5 + ((seed >> i) % 3) * 0.08]);
        }
        const fill = (rgba, k) => {
            ctx.fillStyle = rgba;
            ctx.beginPath();
            for (const [bx, by, br] of blobs) {
                const cx = x + bx * r * grow;
                const cy = y + by * r * grow * 0.7;
                ctx.moveTo(cx + br * r * k * grow, cy);
                ctx.ellipse(cx, cy, br * r * k * grow, br * r * k * grow * 0.7, 0, 0, TAU);
            }
            ctx.fill();
        };
        ctx.globalAlpha = 0.85 * fade;
        fill(h.burn ? 'rgba(160,70,0,0.9)' : 'rgba(122,75,0,0.9)', 1.06);
        fill(h.burn ? 'rgba(255,140,40,0.75)' : 'rgba(255,197,61,0.7)', 0.96);
        fill('rgba(255,224,138,0.45)', 0.6);
        // glints that drift slowly across the surface
        ctx.fillStyle = 'rgba(255,246,214,0.9)';
        const u = Math.max(2, Math.round(s * 2));
        for (let i = 0; i < 3; i++) {
            const a = (calm ? 0 : t * 0.6) + i * 2.1 + seed;
            ctx.fillRect(
                Math.round(x + Math.cos(a) * r * 0.45),
                Math.round(y + Math.sin(a) * r * 0.3),
                u,
                u
            );
        }
        ctx.globalAlpha = 1;
    }

    /** A honey jar in flight: arcs up and over, spinning, its shadow on the floor where it will land. */
    _drawHoneyJar(h, X, Y, t, glows) {
        const k = 1 - h.flight / h.def.flight;
        const wx = h.x0 + (h.x - h.x0) * k;
        const wy = h.y0 + (h.y - h.y0) * k;
        const lift = Math.sin(Math.PI * k) * 50;
        this._shadow(X(wx), Y(wy) + 6 * this.k, 14 * this.k, 0.6);
        const sx = X(wx);
        const sy = Y(wy - lift);
        const f = Math.floor(t * 4) % 2;
        this._blit('honey_jar', sx, sy, { frame: f, rot: k * TAU });
        glows.push(['honey_jar', sx, sy, f, false, 0.7]);
    }

    _drawMine(m, x, y, t) {
        const ctx = this.ctx;
        const prog = 1 - m.fuse / m.maxFuse;
        ctx.strokeStyle = `rgba(255,197,61,${0.2 + prog * 0.5})`;
        ctx.lineWidth = Math.max(1, this.s * 1.2);
        ctx.setLineDash([3 * this.dpr, 5 * this.dpr]);
        ctx.beginPath();
        ctx.arc(x, y, m.radius * this.s, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = `rgba(255,197,61,${0.5 + prog * 0.5})`;
        ctx.lineWidth = Math.max(2, this.s * 2.5);
        ctx.beginPath();
        ctx.arc(x, y, 14 * this.s, -Math.PI / 2, -Math.PI / 2 + prog * TAU);
        ctx.stroke();
        const hot = prog > 0.7 && (t * 10) % 2 < 1;
        this._blit('limit_order', x, y, {
            frame: Math.floor(t * 4) % 2,
            tint: hot ? '#FFFFFF' : null
        });
    }

    _drawShard(sh, p, X, Y, t, glows) {
        const ctx = this.ctx;
        // a faint arc of afterimages behind each diamond
        const dx = sh.x - p.x;
        const dy = sh.y - p.y;
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 1; i <= 3; i++) {
            const a = -0.16 * i;
            const tx = p.x + dx * Math.cos(a) - dy * Math.sin(a);
            const ty = p.y + dx * Math.sin(a) + dy * Math.cos(a);
            this._blit('diamond', X(tx), Y(ty), { alpha: 0.28 / i });
        }
        ctx.globalCompositeOperation = 'source-over';
        const f = Math.floor(t * 5 + sh.index) % 2;
        this._blit('diamond', X(sh.x), Y(sh.y), { frame: f });
        glows.push(['diamond', X(sh.x), Y(sh.y), f, false, 0.9]);
    }

    _drawProjectile(pr, sx, sy, t, glows) {
        const ctx = this.ctx;
        const s = this.s;
        if (pr.id === 'laser_eyes') {
            const len = 34 * s;
            const ax = Math.cos(pr.angle);
            const ay = Math.sin(pr.angle);
            ctx.globalCompositeOperation = 'lighter';
            ctx.lineCap = 'round';
            ctx.strokeStyle = 'rgba(255,59,92,0.35)';
            ctx.lineWidth = 11 * this.dpr;
            ctx.beginPath();
            ctx.moveTo(sx - ax * len, sy - ay * len);
            ctx.lineTo(sx, sy);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(255,126,134,0.8)';
            ctx.lineWidth = 5 * this.dpr;
            ctx.stroke();
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2 * this.dpr;
            ctx.stroke();
            ctx.lineCap = 'butt';
            const r = 12 * s;
            ctx.drawImage(this._blob('255,59,92'), sx - r, sy - r, r * 2, r * 2);
            ctx.globalCompositeOperation = 'source-over';
            return;
        }
        if (pr.id === 'dead_cat_bounce') {
            this._blit('dead_cat', sx, sy, { rot: t * 14 });
            return;
        }
        const id = pr.def.sprite || 'green_candle';
        const rot = pr.angle + Math.PI / 2;
        // motion trail
        ctx.globalCompositeOperation = 'lighter';
        const sp = Math.hypot(pr.vx || 0, pr.vy || 0) || 1;
        for (let i = 1; i <= 3; i++) {
            const back = i * 7 * s;
            this._blit(id, sx - (pr.vx / sp) * back, sy - (pr.vy / sp) * back, {
                rot,
                alpha: 0.3 / i
            });
        }
        ctx.globalCompositeOperation = 'source-over';
        this._blit(id, sx, sy, { rot });
        glows.push([id, sx, sy, 0, false, 0.9]);
    }

    // ---------------------------------------------------------------- the map

    /**
     * A standing prop (world.js / art/props.js), its foot on the ground at (pr.x, pr.y). A tall one fades while the
     * bull stands behind it, so it never hides the player.
     */
    _drawProp(pr, X, Y, t, dt, p, glows) {
        const def = SPRITES[pr.id];
        const meta = PROP_DEFS[pr.id];
        if (!def || !meta) return;
        const k = this.k;
        const foot = meta.foot ?? 2;
        const sx = X(pr.x);
        const sy = Y(pr.y) - (def.h / 2 - foot) * k;
        let target = 1;
        if (meta.tall) {
            const hw = def.w * k * 0.42;
            for (const [fx, fy] of this._focus || [[p.x, p.y]]) {
                const px = X(fx);
                const py = Y(fy);
                if (
                    Math.abs(px - sx) < hw &&
                    py < Y(pr.y) - 2 * k &&
                    py > sy - (def.h * k) / 2 - 8 * k
                ) {
                    target = 0.36;
                    break;
                }
            }
        }
        pr.fade += (target - pr.fade) * Math.min(1, dt * 9);
        const n = def.frames.length;
        const frame = n > 1 ? Math.floor(t * (def.fps || 8) + pr.phase) % n : 0;
        this._blit(pr.id, sx, sy, { frame, flip: pr.flip, alpha: pr.fade > 0.99 ? 1 : pr.fade });
        if (def.glowFrames) glows.push([pr.id, sx, sy, frame, pr.flip, 0.85 * pr.fade]);
    }

    /** Where a prop's light sits on screen, and how bright it is right now (flicker). */
    _propLight(pr, l, X, Y, t) {
        const def = SPRITES[pr.id];
        const k = this.k;
        const foot = PROP_DEFS[pr.id].foot ?? 2;
        const sx = X(pr.x) + (pr.flip ? -(l.x || 0) : l.x || 0) * k;
        const sy = Y(pr.y) - (def.h / 2 - foot) * k + (l.y || 0) * k;
        const f = FLICKER[l.flicker]?.(t, pr.phase) ?? 1;
        return [sx, sy, f];
    }

    /** Light every source on screen and multiply the night over the world (lighting.js). */
    _light(sim, fx, world, props, X, Y, W, H, cx, cy, t) {
        const L = this.lighting;
        const s = this.s;
        const p = sim.player;
        L.begin();
        // the bull carries a soft light of its own
        L.add(X(p.x), Y(p.y) - 10 * s, 380 * s, '255,238,214', 0.6);
        L.add(X(p.x), Y(p.y) - 6 * s, 150 * s, '255,246,232', 0.35);
        for (const pr of props) {
            const l = PROP_DEFS[pr.id]?.light;
            if (!l) continue;
            const [lx, ly, f] = this._propLight(pr, l, X, Y, t);
            L.add(lx, ly, l.r * s * (0.94 + 0.06 * f), l.rgb, l.a * f);
        }
        // lamps just off screen still spill light onto it
        for (const c of world.visibleChunks(cx, cy, this.halfW + 120, this.halfH + 120))
            for (const { p: pr, l } of c.lights) {
                if (props.includes(pr)) continue;
                const [lx, ly, f] = this._propLight(pr, l, X, Y, t);
                if (lx < -l.r * s || lx > W + l.r * s || ly < -l.r * s || ly > H + l.r * s)
                    continue;
                L.add(lx, ly, l.r * s, l.rgb, l.a * f);
            }
        // XP candles and airdrops glow on the ground around them
        let n = 0;
        for (const o of sim.xp) {
            if (o.fall > 0 || n > 90) continue;
            const x = X(o.x);
            const y = Y(o.y);
            if (x < -60 || y < -60 || x > W + 60 || y > H + 60) continue;
            n++;
            if (o.value >= 50) L.add(x, y, 90 * s, '255,197,61', 0.5);
            else L.add(x, y, 52 * s, '60,230,150', 0.32);
        }
        for (const c of sim.crates)
            if (c.landed) L.add(X(c.x), Y(c.y), 120 * s, '255,214,120', 0.55);
        for (const b of sim.breakables || [])
            if (b.hp > 0) L.add(X(b.x), Y(b.y) - 10 * s, 70 * s, '255,200,140', 0.38);
        for (const pk of sim.pickups || []) {
            const chest = pk.kind === 'chest';
            const rgb = PICKUP_GLOW[pk.kind] || '255,214,150';
            L.add(X(pk.x), Y(pk.y) - 8 * s, (chest ? 170 : 80) * s, rgb, chest ? 0.75 : 0.45);
        }
        for (const h of sim.honey || [])
            if (h.landed) L.add(X(h.x), Y(h.y), h.radius * 1.4 * s, '255,197,61', 0.3);
        // bosses bring a red glow with them
        for (const e of sim.enemies)
            if (e.boss && e.hp > 0) L.add(X(e.x), Y(e.y), (e.size * 4 + 60) * s, '255,70,90', 0.32);
        // explosions, level-ups, crits: every ring lights the floor for a moment
        for (const r of fx.rings) {
            const k = r.t / r.dur;
            const rad = (r.r0 + (r.r1 - r.r0) * (1 - (1 - k) * (1 - k))) * s;
            L.add(X(r.x), Y(r.y), rad * 1.5 + 40 * s, r.color, 0.7 * (1 - k));
        }
        for (const g of fx.slams) L.add(X(g.x), Y(g.y), 300 * s, '22,224,138', 0.8);
        L.apply(this.ctx, W, H, {
            ambient: nightAmbient(world.biome.ambient, sim.time),
            cloud: fx.calm ? 0 : world.biome.cloud,
            cam: { x: cx, y: cy },
            s,
            t,
            lift: fx.flash.a * 1.5 + this.life.lightning(t) * 0.55
        });
    }

    /** Light sources glow in the air too: a soft additive halo around each lit prop (inside the bloom pass). */
    _drawHalos(props, X, Y, t) {
        const ctx = this.ctx;
        const s = this.s;
        for (const pr of props) {
            const l = PROP_DEFS[pr.id]?.light;
            if (!l) continue;
            const [lx, ly, f] = this._propLight(pr, l, X, Y, t);
            const r = Math.min(90, l.r * 0.32) * s;
            ctx.globalAlpha = Math.min(1, l.a * 0.5 * f) * pr.fade;
            ctx.drawImage(this.lighting.blob(l.rgb), lx - r, ly - r, r * 2, r * 2);
        }
        ctx.globalAlpha = 1;
    }

    _drawWeather(th, W, H, t, dt) {
        const ctx = this.ctx;
        if (th.weather === 'snow') {
            const want = Math.round((W * H) / (26000 * this.dpr * this.dpr));
            while (this.snow.length < want)
                this.snow.push({
                    x: Math.random() * W,
                    y: Math.random() * H,
                    v: 20 + Math.random() * 50,
                    s: Math.random()
                });
            ctx.fillStyle = 'rgba(232,250,255,0.55)';
            for (const f of this.snow) {
                f.y += f.v * dt * this.dpr;
                f.x += Math.sin(t * 0.8 + f.s * 10) * 12 * dt * this.dpr;
                if (f.y > H) {
                    f.y = -4;
                    f.x = Math.random() * W;
                }
                const sz = Math.max(1, Math.round((1 + f.s * 1.6) * this.dpr));
                ctx.fillRect(Math.round(f.x), Math.round(f.y), sz, sz);
            }
        } else if (th.weather === 'alarm') {
            const a = Math.max(0, Math.sin(t * 2.2)) * 0.07;
            if (a > 0.005) {
                ctx.fillStyle = `rgba(255,59,92,${a})`;
                ctx.fillRect(0, 0, W, 6 * this.dpr);
                ctx.fillRect(0, H - 6 * this.dpr, W, 6 * this.dpr);
            }
        }
    }

    // ---------------------------------------------------------------- effects

    _drawFx(fx, X, Y, t) {
        const ctx = this.ctx;
        const s = this.s;
        // sprite shatter: chunks of the real sprite flying apart
        for (const c of fx.corpses) {
            const frames = this.sprite(c.sprite, { flip: c.flip });
            if (!frames) continue;
            const img = frames[0];
            const a = Math.max(0, 1 - c.t / c.dur);
            ctx.globalAlpha = Math.min(1, a * 1.8);
            for (const pc of c.pieces) {
                const sw = Math.ceil(img.width * pc.w);
                const shh = Math.ceil(img.height * pc.h);
                const px = X(c.x) + (pc.u + pc.w / 2 - 0.5) * img.width + pc.ox * s;
                const py = Y(c.y) + (pc.v + pc.h / 2 - 0.5) * img.height + pc.oy * s;
                ctx.save();
                ctx.translate(Math.round(px), Math.round(py));
                ctx.rotate(pc.rot);
                const sc = 0.6 + 0.4 * a;
                ctx.drawImage(
                    img,
                    img.width * pc.u,
                    img.height * pc.v,
                    sw,
                    shh,
                    (-sw / 2) * sc,
                    (-shh / 2) * sc,
                    sw * sc,
                    shh * sc
                );
                ctx.restore();
            }
        }
        ctx.globalAlpha = 1;

        // horn swipes: bright crescents
        ctx.globalCompositeOperation = 'lighter';
        for (const sw of fx.swipes) {
            const k = sw.t / sw.dur;
            const r = sw.r * (0.55 + 0.45 * k) * s;
            const sx = X(sw.x);
            const sy = Y(sw.y);
            const arcs = sw.evolved
                ? [[0, TAU]]
                : [
                      [-0.7, 0.7],
                      [Math.PI - 0.7, Math.PI + 0.7]
                  ];
            for (const [a0, a1] of arcs) {
                for (let i = 0; i < 3; i++) {
                    ctx.strokeStyle =
                        i === 2
                            ? `rgba(255,255,255,${0.9 * (1 - k)})`
                            : `rgba(123,245,166,${(0.5 - i * 0.15) * (1 - k)})`;
                    ctx.lineWidth = Math.max(1, (14 - i * 5) * s * (1 - k * 0.6));
                    ctx.beginPath();
                    ctx.arc(sx, sy, r - i * 2 * s, a0 + k * 0.4 * sw.dir, a1 + k * 0.4 * sw.dir);
                    ctx.stroke();
                }
            }
        }
        // shockwaves and rings
        for (const r of fx.rings) {
            const k = r.t / r.dur;
            const e = 1 - (1 - k) * (1 - k);
            const rad = (r.r0 + (r.r1 - r.r0) * e) * s;
            ctx.strokeStyle = `rgba(${r.color},${0.9 * (1 - k)})`;
            ctx.lineWidth = Math.max(1, r.width * s * (1 - k * 0.6));
            ctx.beginPath();
            ctx.arc(X(r.x), Y(r.y), rad, 0, TAU);
            ctx.stroke();
            if (r.fill) {
                ctx.fillStyle = `rgba(${r.color},${0.15 * (1 - k)})`;
                ctx.fill();
            }
        }
        // beams and lightning: a wide glow pass and a hot core
        for (const l of fx.lines) {
            const k = l.t / l.dur;
            const pts = [[X(l.x1), Y(l.y1)]];
            if (l.jagged) {
                const n = 6;
                for (let i = 1; i < n; i++) {
                    const f = i / n;
                    const j = (Math.sin(l.seed + i * 12.9) * 14 + Math.sin(t * 50 + i) * 5) * s;
                    pts.push([X(l.x1 + (l.x2 - l.x1) * f) + j, Y(l.y1 + (l.y2 - l.y1) * f) - j]);
                }
            }
            pts.push([X(l.x2), Y(l.y2)]);
            for (const [wm, col] of [
                [3.2, `rgba(${l.color},${0.3 * (1 - k)})`],
                [1, `rgba(255,255,255,${0.9 * (1 - k)})`]
            ]) {
                ctx.strokeStyle = col;
                ctx.lineWidth = Math.max(1, l.width * s * wm);
                ctx.beginPath();
                ctx.moveTo(pts[0][0], pts[0][1]);
                for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
                ctx.stroke();
            }
        }
        // pickup pings
        for (const pg of fx.pings) {
            const k = pg.t / pg.dur;
            const r = (4 + 16 * k) * s;
            ctx.strokeStyle = `rgba(${pg.color},${1 - k})`;
            ctx.lineWidth = Math.max(1, 2 * s * (1 - k));
            ctx.beginPath();
            ctx.arc(X(pg.x), Y(pg.y), r, 0, TAU);
            ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';

        // airdrops falling
        for (const d of fx.drops) {
            const k = Math.min(1, d.t / d.dur);
            const y = d.y - (1 - k) * 260;
            this._shadow(X(d.x), Y(d.y), 40 * s * (0.4 + 0.6 * k), 0.4 + 0.6 * k);
            this._blit('airdrop', X(d.x), Y(y), { frame: 0 });
        }

        // God Candle: it falls out of the sky onto the bull, stands for a moment, and fades
        for (const g of fx.slams) {
            const k = Math.min(1, g.t / g.dur);
            const fade = g.t > g.dur ? 1 - (g.t - g.dur) / g.hold : 1;
            const img = SPRITES.god_candle;
            const half = (img.h * this.k) / s; // half its drawn height (scale 2), in world units
            const y = g.y - half * 0.85 - (1 - k * k) * 420;
            this._shadow(X(g.x), Y(g.y), 60 * s * (0.3 + 0.7 * k), (0.3 + 0.7 * k) * fade);
            this._blit('god_candle', X(g.x), Y(y), {
                frame: Math.floor(t * 8),
                alpha: Math.max(0, fade),
                sx: 2,
                sy: 2
            });
        }

        // particles
        for (const p of fx.particles) {
            const a = Math.max(0, p.life / p.max);
            if (p.kind === 'spark' || p.kind === 'ember') {
                ctx.globalCompositeOperation = 'lighter';
                ctx.strokeStyle = p.color;
                ctx.globalAlpha = Math.min(1, a * 1.5);
                ctx.lineWidth = Math.max(1, p.size * s * 0.6);
                ctx.beginPath();
                ctx.moveTo(X(p.x), Y(p.y));
                ctx.lineTo(X(p.x - p.vx * 0.03), Y(p.y - p.vy * 0.03));
                ctx.stroke();
                ctx.globalCompositeOperation = 'source-over';
            } else if (p.kind === 'dust' || p.kind === 'smoke') {
                const grow = 1 + (1 - a) * (p.kind === 'smoke' ? 2.5 : 1.6);
                const sz = p.size * s * grow;
                ctx.fillStyle = p.color.endsWith(',')
                    ? `${p.color}${(a * (p.kind === 'smoke' ? 0.35 : 0.3)).toFixed(3)})`
                    : p.color;
                ctx.fillRect(
                    Math.round(X(p.x) - sz / 2),
                    Math.round(Y(p.y) - sz / 2),
                    Math.round(sz),
                    Math.round(sz)
                );
            } else {
                ctx.globalAlpha = Math.min(1, a * 1.6);
                ctx.fillStyle = p.color;
                const sz = Math.max(this.dpr, Math.round(p.size * s));
                ctx.fillRect(Math.round(X(p.x) - sz / 2), Math.round(Y(p.y) - sz / 2), sz, sz);
            }
        }
        ctx.globalAlpha = 1;

        // damage numbers: pop in, drift up, fade
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const n of fx.numbers) {
            const age = n.max - n.life;
            const a = Math.min(1, (n.life / n.max) * 2.2);
            const jackpot = n.kind === 'jackpot' || n.kind === 'jackpotLabel';
            const base =
                n.kind === 'jackpot'
                    ? 54
                    : n.kind === 'jackpotLabel'
                      ? 30
                      : n.kind === 'crit'
                        ? 32
                        : n.kind === 'info'
                          ? 26
                          : n.kind === 'hurt'
                            ? 26
                            : 20;
            const pop = jackpot
                ? 1 + Math.max(0, 0.25 - age) * 2.4 + (fx.calm ? 0 : 0.04 * Math.sin(age * 14))
                : 1 + Math.max(0, 0.12 - age) * (n.kind === 'crit' ? 5 : 3);
            const size = Math.round(base * pop * this.dpr);
            ctx.font = `${size}px "Jersey 10", monospace`;
            ctx.globalAlpha = a;
            let x = X(n.x);
            let y = Y(n.y);
            if (jackpot) {
                // A boss can die at the edge of the view: keep the payout on screen.
                const cw = this.canvas.width;
                const half = ctx.measureText(n.text).width / 2 + 10 * this.dpr;
                x = Math.min(cw - half, Math.max(half, x));
                y = Math.min(this.canvas.height - size, Math.max(size * 2.2, y));
            }
            if (n.rot) {
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(n.rot);
            }
            const ox = n.rot ? 0 : x;
            const oy = n.rot ? 0 : y;
            ctx.lineWidth = Math.max(3, 5 * this.dpr);
            ctx.lineJoin = 'round';
            ctx.strokeStyle = '#07090C';
            ctx.strokeText(n.text, ox, oy);
            ctx.fillStyle =
                n.kind === 'crit'
                    ? '#FFC53D'
                    : n.kind === 'hurt'
                      ? '#FF3B5C'
                      : n.kind === 'heal' || n.kind === 'info'
                        ? '#16E08A'
                        : '#F4F7FA';
            ctx.fillText(n.text, ox, oy);
            if (jackpot) {
                ctx.fillStyle = n.kind === 'jackpot' ? '#FFC53D' : '#FFE08A';
                ctx.fillText(n.text, ox, oy);
                ctx.fillStyle = 'rgba(255,255,255,0.55)';
                ctx.fillText(n.text, ox, oy - Math.max(1, 2 * this.dpr));
                ctx.fillStyle = n.kind === 'jackpot' ? '#FFC53D' : '#FFE08A';
                ctx.fillText(n.text, ox, oy + Math.max(1, this.dpr));
            }
            if (n.kind === 'crit') {
                ctx.fillStyle = 'rgba(255,255,255,0.5)';
                ctx.fillText(n.text, ox, oy - Math.max(1, this.dpr));
                ctx.fillStyle = '#FFC53D';
                ctx.fillText(n.text, ox, oy);
            }
            if (n.rot) ctx.restore();
        }
        ctx.globalAlpha = 1;
    }

    _drawScreenFx(fx, W, H, p, th, t) {
        const ctx = this.ctx;
        const low = p.hp / p.maxHp;
        const v = Math.max(fx.vignette * 0.7, low < 0.25 ? 0.35 + 0.25 * Math.sin(t * 5.5) : 0);
        if (v > 0.01) {
            const key = `hurt:${W}x${H}`;
            let tex = this._cache[key];
            if (!tex) {
                tex = makeCanvas(W, H);
                const g = tex.getContext('2d');
                const gr = g.createRadialGradient(
                    W / 2,
                    H / 2,
                    Math.min(W, H) * 0.32,
                    W / 2,
                    H / 2,
                    Math.max(W, H) * 0.72
                );
                gr.addColorStop(0, 'rgba(255,59,92,0)');
                gr.addColorStop(1, 'rgba(255,59,92,0.5)');
                g.fillStyle = gr;
                g.fillRect(0, 0, W, H);
                this._cache[key] = tex;
            }
            ctx.globalAlpha = Math.min(1, v);
            ctx.drawImage(tex, 0, 0);
            ctx.globalAlpha = 1;
        }
        if (this._halted) {
            // Trading Halt: the edges of the screen frost over while the bears stand frozen
            const key = `halt:${W}x${H}`;
            let tex = this._cache[key];
            if (!tex) {
                tex = makeCanvas(W, H);
                const g = tex.getContext('2d');
                const gr = g.createRadialGradient(
                    W / 2,
                    H / 2,
                    Math.min(W, H) * 0.35,
                    W / 2,
                    H / 2,
                    Math.max(W, H) * 0.7
                );
                gr.addColorStop(0, 'rgba(150,220,255,0)');
                gr.addColorStop(1, 'rgba(150,220,255,0.32)');
                g.fillStyle = gr;
                g.fillRect(0, 0, W, H);
                this._cache[key] = tex;
            }
            ctx.globalAlpha = 0.8 + 0.2 * Math.sin(t * 3);
            ctx.drawImage(tex, 0, 0);
            ctx.globalAlpha = 1;
        }
        if (fx.flash.a > 0.01) {
            ctx.fillStyle = `rgba(${fx.flash.color},${fx.flash.a})`;
            ctx.fillRect(0, 0, W, H);
        }
        void th;
    }
}
