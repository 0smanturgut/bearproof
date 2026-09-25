/**
 * @module render
 * @description Canvas renderer. Full-viewport, DPR-aware, pixel-perfect sprites (baked once per integer
 * scale by art/sprites.js). The world is a trading terminal at night: a parallax candlestick chart with a
 * moving-average line, a terminal grid, soft contact shadows under everything, and neon bloom on whatever
 * glows (eyes, candles, lasers). Reads simulation state; never mutates it.
 */

import { SPRITES, bakeGlow, bakeSprite } from './art/sprites.js';
import { THEMES } from './art/stages.js';
import { SIM } from './sim/content.js';

const ART_UNIT = 2; // world units per art pixel
// Visible world area: ~1100×720 units on a desktop, zooming in to ~520×1100 on a phone so sprites stay
// big enough to read. Interpolated by screen area (CSS px²).
const AREA_PHONE = 500 * 1040;
const AREA_DESKTOP = 960 * 620;
const MIN_SHORT_SIDE = 440; // never show less than this many world units across the short side
const TAU = Math.PI * 2;

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
    sybil: '#A3ACB8'
};

// Things that hover: their shadow sits lower and smaller.
const FLOATERS = new Set(['fud_cloud', 'liquidation', 'capitulation']);

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
    return c;
}

export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
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
        const ctx = this.ctx;
        const W = this.canvas.width;
        const H = this.canvas.height;
        const s = this.s;
        const k = this.k;
        const theme = THEMES[sim.stageId] || THEMES.chop;
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

        // --- backdrop
        ctx.fillStyle = theme.bg;
        ctx.fillRect(0, 0, W, H);
        this._drawChart(cx, cy, W, H, theme, t);
        this._drawGrid(cx, cy, X, Y, theme);

        const p = sim.player;

        // --- ground layer: aura, mines
        const aura = p.weapons.find((w) => w.def.type === 'aura');
        if (aura) this._drawAura(X(p.x), Y(p.y), aura.getRange(p) * s, t);
        for (const m of sim.mines) {
            if (!visible(m.x, m.y)) continue;
            this._drawMine(m, X(m.x), Y(m.y), t);
        }

        // --- XP candles (with a soft light under each)
        ctx.globalCompositeOperation = 'lighter';
        for (const o of sim.xp) {
            if (!visible(o.x, o.y, 40)) continue;
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
        for (const o of sim.xp) {
            if (!visible(o.x, o.y, 40)) continue;
            const bob = Math.sin(t * 5 + o.x * 0.1) * 2 * s;
            const alpha = o.life < 3 ? (Math.floor(t * 8) % 2 ? 0.35 : 1) : 1;
            this._blit(o.value >= 50 ? 'xp_candle_big' : 'xp_candle', X(o.x), Y(o.y) + bob, {
                alpha,
                frame: Math.floor(t * 3 + o.x) % 2
            });
        }

        // --- airdrop crates on the ground: landing markers and landed crates (falling ones fly above the crowd)
        for (const c of sim.crates) {
            if (!visible(c.x, c.y, 60)) continue;
            this._drawCrateGround(c, X(c.x), Y(c.y), t);
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

        const drawList = list.slice();
        drawList.push(p);
        drawList.sort((a, b) => a.y - b.y);
        const glows = [];
        for (const e of drawList) {
            if (e === p) this._drawBull(p, X(p.x), Y(p.y), t, dt, fx, glows, sim);
            else this._drawEnemy(e, X(e.x), Y(e.y), t, glows);
        }
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

        // --- bloom pass: everything that glows, in one additive batch
        ctx.globalCompositeOperation = 'lighter';
        for (const [id, x, y, frame, flip, a] of glows) {
            const g = bakeGlow(id, k, { flip });
            if (!g) continue;
            const img = g[(((frame | 0) % g.length) + g.length) % g.length];
            ctx.globalAlpha = a;
            ctx.drawImage(img, Math.round(x - img.width / 2), Math.round(y - img.height / 2));
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';

        this._drawFx(fx, X, Y, t);
        this._drawWeather(theme, W, H, t, dt);

        // --- lighting: vignette + stage tint
        ctx.drawImage(this._vignette(W, H, theme.vignette), 0, 0);
        this._drawScreenFx(fx, W, H, p, theme, t);
    }

    // ---------------------------------------------------------------- creatures

    /** The sprite of the character this run plays (the bull unless the run says otherwise). */
    _playerSprite(sim) {
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
        this._blit(id, sx, sy, {
            frame,
            flip: p.facing < 0,
            tint: hurt ? '#FFFFFF' : null,
            alpha: blink ? 0.5 : 1,
            sx: 1 / breathe,
            sy: breathe
        });
        // footstep dust
        if (p.moving && t - this.dustAt > 0.09) {
            this.dustAt = t;
            fx.dust(p.x - p.facing * 12, p.y + 22, p.facing);
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
        const fps = (sd.fps || 8) * (e.dashActive > 0 ? 2 : 1);
        let frame = Math.floor(t * fps + e.uid * 0.37) % sd.frames.length;
        if (e.flashTimer > 0) {
            tint = '#FFFFFF';
            sxs *= 1.12;
            sys *= 0.9;
        } else if (e.slowTimer > 0) tint = '#9FE6FF';
        if (def.bomber && e.fuseArmed) {
            frame = (t * 20) % 2 < 1 ? 1 : 3;
            if (Math.floor(t * 12) % 2 === 0) tint = '#FFFFFF';
            sxs *= 1 + Math.sin(t * 40) * 0.06;
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
                this._blob(id === 'long_winter' ? '70,184,240' : '255,59,92'),
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

    // ---------------------------------------------------------------- airdrop crates

    /** A falling crate's landing ring, or a landed crate with a green beacon (blinking when it's about to go). */
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

    // ---------------------------------------------------------------- weapons

    _drawAura(x, y, r, t) {
        const ctx = this.ctx;
        const key = `aura:${Math.round(r / 4)}`;
        let tex = this._cache[key];
        if (!tex) {
            tex = makeCanvas(r * 2 + 4, r * 2 + 4);
            const g = tex.getContext('2d');
            const gr = g.createRadialGradient(r + 2, r + 2, r * 0.15, r + 2, r + 2, r);
            gr.addColorStop(0, 'rgba(22,224,138,0.02)');
            gr.addColorStop(0.75, 'rgba(22,224,138,0.1)');
            gr.addColorStop(1, 'rgba(22,224,138,0.22)');
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
        ctx.strokeStyle = `rgba(123,245,166,${0.3 + 0.2 * Math.sin(t * 4)})`;
        ctx.lineWidth = Math.max(1, this.s * 1.5);
        ctx.setLineDash([4 * this.dpr, 10 * this.dpr]);
        ctx.lineDashOffset = -t * 40;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        // rising hopium bubbles
        ctx.fillStyle = 'rgba(123,245,166,0.55)';
        for (let i = 0; i < 10; i++) {
            const a = hash1(i) * TAU + t * 0.2;
            const rr = r * (0.3 + 0.65 * hash1(i * 7));
            const life = (t * 0.6 + hash1(i * 13)) % 1;
            const bx = x + Math.cos(a) * rr;
            const by = y + Math.sin(a) * rr * 0.9 - life * 30 * this.s;
            const sz = Math.max(1, (1 - life) * 3 * this.dpr);
            ctx.globalAlpha = 1 - life;
            ctx.fillRect(Math.round(bx), Math.round(by), sz, sz);
        }
        ctx.globalAlpha = 1;
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

    // ---------------------------------------------------------------- backdrop

    _drawChart(cx, cy, W, H, th, t) {
        // A big candlestick chart behind the arena, scrolling at half speed (parallax), with a glowing
        // moving-average line. Deterministic from the candle index, so it never flickers.
        const ctx = this.ctx;
        const s = this.s * 0.5; // parallax
        const step = 70;
        const X = (wx) => (wx - cx * 0.5) * s + W / 2;
        const Y = (wy) => (wy - cy * 0.5) * s + H / 2;
        const half = W / s / 2;
        const i0 = Math.floor((cx * 0.5 - half) / step) - 2;
        const i1 = Math.floor((cx * 0.5 + half) / step) + 2;
        const price = (i) =>
            Math.sin(i * 0.19) * 300 +
            Math.sin(i * 0.051 + 1.3) * 520 +
            (hash1(i) - 0.5) * 120 +
            i * 9;
        const baseRow = Math.floor((cy * 0.5 - H / s / 2) / 1800) - 1;
        const bw = Math.max(2, step * 0.56 * s);
        for (let row = baseRow; row <= baseRow + 2; row++) {
            const off = row * 1800;
            for (let i = i0; i <= i1; i++) {
                const o = price(i);
                const c = price(i + 1);
                const hi = Math.min(o, c) - 24 - hash1(i * 7) * 70;
                const lo = Math.max(o, c) + 24 + hash1(i * 13) * 70;
                const up = c < o; // screen y grows downward: lower y = higher price
                const x = X(i * step + step / 2);
                ctx.fillStyle = up ? th.upWick : th.downWick;
                ctx.fillRect(
                    Math.round(x - Math.max(1, s * 1.2)),
                    Y(hi + off),
                    Math.max(2, 2.4 * s),
                    Y(lo + off) - Y(hi + off)
                );
                ctx.fillStyle = up ? th.up : th.down;
                const top = Y(Math.min(o, c) + off);
                const bot = Y(Math.max(o, c) + off);
                ctx.fillRect(
                    Math.round(x - bw / 2),
                    Math.round(top),
                    Math.round(bw),
                    Math.max(2, Math.round(bot - top))
                );
            }
            // moving average
            ctx.strokeStyle = th.ma;
            ctx.lineWidth = Math.max(1.5, 2.2 * this.dpr);
            ctx.beginPath();
            for (let i = i0; i <= i1; i++) {
                let m = 0;
                for (let j = 0; j < 6; j++) m += price(i - j);
                const x = X(i * step + step / 2);
                const y = Y(m / 6 + off);
                if (i === i0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
        void t;
    }

    _drawGrid(cx, cy, X, Y, th) {
        const ctx = this.ctx;
        const minor = 50;
        const x0 = Math.floor((cx - this.halfW) / minor) * minor;
        const y0 = Math.floor((cy - this.halfH) / minor) * minor;
        const W = this.canvas.width;
        const H = this.canvas.height;
        ctx.lineWidth = 1;
        ctx.strokeStyle = th.grid;
        ctx.beginPath();
        for (let x = x0; x <= cx + this.halfW + minor; x += minor) {
            if (x % 250 === 0) continue;
            const sx = Math.round(X(x)) + 0.5;
            ctx.moveTo(sx, 0);
            ctx.lineTo(sx, H);
        }
        for (let y = y0; y <= cy + this.halfH + minor; y += minor) {
            if (y % 250 === 0) continue;
            const sy = Math.round(Y(y)) + 0.5;
            ctx.moveTo(0, sy);
            ctx.lineTo(W, sy);
        }
        ctx.stroke();
        ctx.strokeStyle = th.gridMajor;
        ctx.beginPath();
        const X0 = Math.floor((cx - this.halfW) / 250) * 250;
        const Y0 = Math.floor((cy - this.halfH) / 250) * 250;
        for (let x = X0; x <= cx + this.halfW + 250; x += 250) {
            const sx = Math.round(X(x)) + 0.5;
            ctx.moveTo(sx, 0);
            ctx.lineTo(sx, H);
        }
        for (let y = Y0; y <= cy + this.halfH + 250; y += 250) {
            const sy = Math.round(Y(y)) + 0.5;
            ctx.moveTo(0, sy);
            ctx.lineTo(W, sy);
        }
        ctx.stroke();
        // crosshairs at major intersections, and price labels on the right edge
        ctx.fillStyle = th.cross;
        const c = Math.max(3, Math.round(4 * this.dpr));
        for (let x = X0; x <= cx + this.halfW + 250; x += 250)
            for (let y = Y0; y <= cy + this.halfH + 250; y += 250) {
                const sx = Math.round(X(x));
                const sy = Math.round(Y(y));
                ctx.fillRect(sx - c, sy, c * 2 + 1, 1);
                ctx.fillRect(sx, sy - c, 1, c * 2 + 1);
            }
        ctx.fillStyle = th.label;
        ctx.font = `${Math.round(10 * this.dpr)}px "JetBrains Mono", ui-monospace, monospace`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        for (let y = Y0; y <= cy + this.halfH + 250; y += 250) {
            const pct = (-y / 250) * 2.5;
            ctx.fillText(
                `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`,
                W - 8 * this.dpr,
                Math.round(Y(y)) - 3 * this.dpr
            );
        }
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
            const base =
                n.kind === 'crit' ? 32 : n.kind === 'info' ? 26 : n.kind === 'hurt' ? 26 : 20;
            const pop = 1 + Math.max(0, 0.12 - age) * (n.kind === 'crit' ? 5 : 3);
            const size = Math.round(base * pop * this.dpr);
            ctx.font = `${size}px "Jersey 10", monospace`;
            ctx.globalAlpha = a;
            const x = X(n.x);
            const y = Y(n.y);
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
        if (fx.flash.a > 0.01) {
            ctx.fillStyle = `rgba(${fx.flash.color},${fx.flash.a})`;
            ctx.fillRect(0, 0, W, H);
        }
        void th;
    }
}
