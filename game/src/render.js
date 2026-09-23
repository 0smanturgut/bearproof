/**
 * @module render
 * @description Canvas renderer. Full-viewport, DPR-aware, pixel-perfect sprites (baked once per integer
 * scale by art/sprites.js). The world is an endless trading chart: a faint candlestick backdrop and a
 * terminal grid that scroll with the bull. Reads simulation state; never mutates it.
 */

import { SPRITES, bakeSprite } from './art/sprites.js';
import { getStage } from './sim/content.js';

const ART_UNIT = 3.2; // world units per art pixel
// Visible world area: ~1100×720 units on a desktop, zooming in to ~520×1100 on a phone so sprites stay
// big enough to read. Interpolated by screen area (CSS px²).
const AREA_PHONE = 520 * 1100;
const AREA_DESKTOP = 1100 * 720;
const MIN_SHORT_SIDE = 460; // never show less than this many world units across the short side

export const KILL_COLORS = {
    red_candle: '#FF3B5C',
    bag_holder: '#8D7BA8',
    paper_hands: '#E8EDF2',
    rug_puller: '#FF6B4A',
    grizzly: '#C27A4E',
    fud_cloud: '#8D7BA8',
    doomposter: '#FF3B5C',
    ponzi: '#FFC53D',
    downline: '#FFC53D',
    margin_call: '#FF3B5C',
    sybil: '#B8C0CC'
};

function hash1(i) {
    let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
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

    _blit(id, x, y, { frame = 0, flip = false, tint = null, alpha = 1, rot = 0, scale = 1 } = {}) {
        const frames = this.sprite(id, { flip, tint });
        if (!frames || !frames.length) return false;
        const img = frames[frame % frames.length];
        const ctx = this.ctx;
        const w = img.width * scale;
        const h = img.height * scale;
        if (alpha !== 1) ctx.globalAlpha = alpha;
        if (rot) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(rot);
            ctx.drawImage(img, Math.round(-w / 2), Math.round(-h / 2), w, h);
            ctx.restore();
        } else {
            ctx.drawImage(img, Math.round(x - w / 2), Math.round(y - h / 2), w, h);
        }
        if (alpha !== 1) ctx.globalAlpha = 1;
        return true;
    }

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
        const pal = getStage(sim.stageId).palette;
        const [shx, shy] = fx.shakeOffset();
        const cx = cam.x + shx;
        const cy = cam.y + shy;
        const X = (wx) => (wx - cx) * s + W / 2;
        const Y = (wy) => (wy - cy) * s + H / 2;
        const margin = 120;
        const visible = (x, y, pad = margin) =>
            Math.abs(x - cx) < this.halfW + pad && Math.abs(y - cy) < this.halfH + pad;

        ctx.fillStyle = pal.bg;
        ctx.fillRect(0, 0, W, H);
        this._drawChart(cx, cy, X, Y, pal);
        this._drawGrid(cx, cy, X, Y, pal);

        const p = sim.player;

        // Hopium aura (continuous visual for the aura weapon).
        const aura = p.weapons.find((w) => w.def.type === 'aura');
        if (aura) {
            const r = aura.getRange(p) * s;
            const pulse = 0.5 + 0.5 * Math.sin(t * 4);
            ctx.fillStyle = `rgba(22,224,138,${0.05 + pulse * 0.04})`;
            ctx.beginPath();
            ctx.arc(X(p.x), Y(p.y), r, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = `rgba(22,224,138,${0.25 + pulse * 0.2})`;
            ctx.lineWidth = Math.max(1, s * 1.5);
            ctx.setLineDash([6 * this.dpr, 6 * this.dpr]);
            ctx.lineDashOffset = -t * 30;
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Limit orders (mines): marker + a ring that fills as the order is about to fill.
        for (const m of sim.mines) {
            if (!visible(m.x, m.y)) continue;
            const prog = 1 - m.fuse / m.maxFuse;
            ctx.strokeStyle = `rgba(255,197,61,${0.25 + prog * 0.6})`;
            ctx.lineWidth = Math.max(1, s * 2);
            ctx.beginPath();
            ctx.arc(X(m.x), Y(m.y), m.radius * s, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2);
            ctx.stroke();
            this._blit('limit_order', X(m.x), Y(m.y), {
                tint: prog > 0.7 && (t * 10) % 2 < 1 ? '#FFFFFF' : null
            });
        }

        // XP candles.
        for (const o of sim.xp) {
            if (!visible(o.x, o.y, 40)) continue;
            const bob = Math.sin(t * 5 + o.x * 0.1) * 2 * s;
            const alpha = o.life < 3 ? (Math.floor(t * 8) % 2 ? 0.35 : 1) : 1;
            if (
                !this._blit(o.value >= 50 ? 'xp_candle_big' : 'xp_candle', X(o.x), Y(o.y) + bob, {
                    alpha
                })
            ) {
                ctx.fillStyle = '#16E08A';
                ctx.fillRect(X(o.x) - 3 * s, Y(o.y) - 5 * s, 6 * s, 10 * s);
            }
        }

        // Enemies, back to front.
        const list = sim.enemies.filter((e) => e.hp > 0 && visible(e.x, e.y, e.size + 60));
        list.sort((a, b) => a.y - b.y);
        for (const e of list) this._drawEnemy(e, X(e.x), Y(e.y), t);

        // The bull.
        const blink = p.invincible && Math.floor(t * 16) % 2 === 0;
        const frame = p.moving ? Math.floor(t * 9) % 2 : 0;
        if (
            !this._blit('bull', X(p.x), Y(p.y), {
                frame,
                flip: p.facing < 0,
                alpha: blink ? 0.45 : 1
            })
        ) {
            ctx.fillStyle = '#16E08A';
            ctx.beginPath();
            ctx.arc(X(p.x), Y(p.y), p.size * s, 0, Math.PI * 2);
            ctx.fill();
        }

        // Orbiting diamonds.
        for (const w of p.weapons) {
            if (!w.shards) continue;
            for (const sh of w.shards) {
                if (!this._blit('diamond', X(sh.x), Y(sh.y), { frame: Math.floor(t * 6) })) {
                    ctx.fillStyle = '#46C8FF';
                    ctx.fillRect(X(sh.x) - 4 * s, Y(sh.y) - 4 * s, 8 * s, 8 * s);
                }
            }
        }

        // Player projectiles.
        for (const pr of sim.projectiles) {
            if (!visible(pr.x, pr.y, 40)) continue;
            const sx = X(pr.x);
            const sy = Y(pr.y);
            if (pr.id === 'laser_eyes') {
                const len = 26 * s;
                const ax = Math.cos(pr.angle);
                const ay = Math.sin(pr.angle);
                ctx.lineCap = 'round';
                ctx.strokeStyle = 'rgba(22,224,138,0.55)';
                ctx.lineWidth = 7 * this.dpr;
                ctx.beginPath();
                ctx.moveTo(sx - ax * len, sy - ay * len);
                ctx.lineTo(sx, sy);
                ctx.stroke();
                ctx.strokeStyle = '#E8FFF4';
                ctx.lineWidth = 2.5 * this.dpr;
                ctx.stroke();
                ctx.lineCap = 'butt';
            } else if (pr.id === 'dead_cat_bounce') {
                this._blit('dead_cat', sx, sy, { rot: t * 14 });
            } else {
                this._blit(pr.def.sprite || 'green_candle', sx, sy, {
                    rot: pr.angle + Math.PI / 2
                });
            }
        }

        // Enemy FUD bolts.
        for (const b of sim.enemyProjectiles) {
            if (!visible(b.x, b.y, 30)) continue;
            if (!this._blit('fud_bolt', X(b.x), Y(b.y), { frame: Math.floor(t * 10) })) {
                ctx.fillStyle = '#FF3B5C';
                ctx.beginPath();
                ctx.arc(X(b.x), Y(b.y), b.size * s, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        this._drawFx(fx, X, Y, t);
        this._drawScreenFx(fx, W, H, p);
    }

    _drawEnemy(e, sx, sy, t) {
        const ctx = this.ctx;
        const def = e.def;
        let tint = null;
        let frame = Math.floor(t * 6 + e.uid * 0.37) % 2;
        if (e.flashTimer > 0) tint = '#FFFFFF';
        else if (e.slowTimer > 0) tint = '#9FE6FF';
        if (def.bomber && e.fuseArmed) {
            frame = 1;
            if (Math.floor(t * 12) % 2 === 0) tint = '#FFFFFF';
        }
        const alpha = e.isClone ? 0.55 : 1;
        const drawn = this._blit(def.sprite || e.id, sx, sy, {
            frame,
            flip: e.facing > 0,
            tint,
            alpha
        });
        if (!drawn) {
            ctx.fillStyle = KILL_COLORS[e.id] || '#FF3B5C';
            ctx.beginPath();
            ctx.arc(sx, sy, e.size * this.s, 0, Math.PI * 2);
            ctx.fill();
        }
        if (e.shielded && e.shieldHp > 0) {
            ctx.strokeStyle = 'rgba(70,200,255,0.7)';
            ctx.lineWidth = Math.max(1, this.s * 2);
            ctx.beginPath();
            ctx.arc(sx, sy, (e.size + 6) * this.s, 0, Math.PI * 2);
            ctx.stroke();
        }
        if (!e.boss && e.hp < e.maxHp) {
            const w = Math.max(18, e.size * 1.6) * this.s;
            const h = Math.max(2, 2 * this.dpr);
            const y = sy + (e.size + 8) * this.s;
            ctx.fillStyle = '#07090C';
            ctx.fillRect(sx - w / 2 - 1, y - 1, w + 2, h + 2);
            ctx.fillStyle = '#FF3B5C';
            ctx.fillRect(sx - w / 2, y, w * Math.max(0, e.hp / e.maxHp), h);
        }
    }

    _drawChart(cx, cy, X, Y, pal) {
        // A faint endless candlestick chart behind everything: 60-unit candles, repeating vertically.
        const ctx = this.ctx;
        const step = 60;
        const i0 = Math.floor((cx - this.halfW) / step) - 1;
        const i1 = Math.floor((cx + this.halfW) / step) + 1;
        const tile = 1400;
        const price = (i) =>
            Math.sin(i * 0.21) * 260 + Math.sin(i * 0.057 + 1.3) * 420 + (hash1(i) - 0.5) * 90;
        ctx.globalAlpha = 0.5;
        for (let i = i0; i <= i1; i++) {
            const o = price(i);
            const c = price(i + 1);
            const hi = Math.min(o, c) - 20 - hash1(i * 7) * 60;
            const lo = Math.max(o, c) + 20 + hash1(i * 13) * 60;
            const up = c < o; // screen y grows downward, so a lower y is a higher price
            ctx.fillStyle = up ? '#0C2A1E' : '#2A0F16';
            const x = X(i * step + step / 2);
            const bw = Math.max(2, step * 0.55 * this.s);
            const baseRow = Math.floor((cy - this.halfH) / tile) - 1;
            for (let row = baseRow; row <= baseRow + 3; row++) {
                const off = row * tile;
                const top = Y(Math.min(o, c) + off);
                const bot = Y(Math.max(o, c) + off);
                ctx.fillRect(
                    x - Math.max(1, this.s),
                    Y(hi + off),
                    Math.max(2, 2 * this.s),
                    Y(lo + off) - Y(hi + off)
                );
                ctx.fillRect(x - bw / 2, top, bw, Math.max(2, bot - top));
            }
        }
        ctx.globalAlpha = 1;
        void pal;
    }

    _drawGrid(cx, cy, X, Y, pal) {
        const ctx = this.ctx;
        const minor = 50;
        const x0 = Math.floor((cx - this.halfW) / minor) * minor;
        const y0 = Math.floor((cy - this.halfH) / minor) * minor;
        const W = this.canvas.width;
        const H = this.canvas.height;
        ctx.lineWidth = 1;
        for (let x = x0; x <= cx + this.halfW + minor; x += minor) {
            ctx.strokeStyle = x % 250 === 0 ? pal.gridMajor : pal.grid;
            const sx = Math.round(X(x)) + 0.5;
            ctx.beginPath();
            ctx.moveTo(sx, 0);
            ctx.lineTo(sx, H);
            ctx.stroke();
        }
        for (let y = y0; y <= cy + this.halfH + minor; y += minor) {
            ctx.strokeStyle = y % 250 === 0 ? pal.gridMajor : pal.grid;
            const sy = Math.round(Y(y)) + 0.5;
            ctx.beginPath();
            ctx.moveTo(0, sy);
            ctx.lineTo(W, sy);
            ctx.stroke();
        }
    }

    _drawFx(fx, X, Y, t) {
        const ctx = this.ctx;
        const s = this.s;
        // Horn swipes: two crescents (or a full ring when evolved).
        for (const sw of fx.swipes) {
            const k = sw.t / sw.dur;
            ctx.strokeStyle = `rgba(232,237,242,${0.9 * (1 - k)})`;
            ctx.lineWidth = Math.max(2, (10 - 6 * k) * s);
            const r = sw.r * (0.6 + 0.4 * k) * s;
            ctx.beginPath();
            if (sw.evolved) ctx.arc(X(sw.x), Y(sw.y), r, 0, Math.PI * 2);
            else {
                ctx.arc(X(sw.x), Y(sw.y), r, -0.55, 0.55);
                ctx.moveTo(X(sw.x) - r * Math.cos(0.55), Y(sw.y) - r * Math.sin(0.55));
                ctx.arc(X(sw.x), Y(sw.y), r, Math.PI - 0.55, Math.PI + 0.55);
            }
            ctx.stroke();
        }
        for (const r of fx.rings) {
            const k = r.t / r.dur;
            ctx.strokeStyle = `rgba(${r.color},${1 - k})`;
            ctx.lineWidth = Math.max(1, r.width * s * (1 - k * 0.5));
            ctx.beginPath();
            ctx.arc(X(r.x), Y(r.y), (r.r0 + (r.r1 - r.r0) * k) * s, 0, Math.PI * 2);
            ctx.stroke();
        }
        for (const l of fx.lines) {
            const k = l.t / l.dur;
            ctx.strokeStyle = `rgba(${l.color},${1 - k})`;
            ctx.lineWidth = Math.max(1, l.width * s);
            ctx.beginPath();
            ctx.moveTo(X(l.x1), Y(l.y1));
            if (l.jagged) {
                const n = 5;
                for (let i = 1; i < n; i++) {
                    const f = i / n;
                    const j = (Math.sin(l.seed + i * 12.9) * 12 + Math.sin(t * 40 + i) * 4) * s;
                    ctx.lineTo(X(l.x1 + (l.x2 - l.x1) * f) + j, Y(l.y1 + (l.y2 - l.y1) * f) - j);
                }
            }
            ctx.lineTo(X(l.x2), Y(l.y2));
            ctx.stroke();
        }
        for (const d of fx.drops) {
            const k = Math.min(1, d.t / d.dur);
            const y = d.y - (1 - k) * 220;
            this._blit('airdrop', X(d.x), Y(y), { frame: 0 });
        }
        for (const p of fx.particles) {
            const a = Math.max(0, p.life / p.max);
            ctx.globalAlpha = Math.min(1, a * 1.6);
            ctx.fillStyle = p.color;
            const sz = Math.max(this.dpr, p.size * s);
            ctx.fillRect(Math.round(X(p.x) - sz / 2), Math.round(Y(p.y) - sz / 2), sz, sz);
        }
        ctx.globalAlpha = 1;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const n of fx.numbers) {
            const a = Math.min(1, (n.life / n.max) * 2);
            const big =
                n.kind === 'crit' ? 30 : n.kind === 'info' ? 26 : n.kind === 'hurt' ? 24 : 19;
            const pop = n.kind === 'crit' ? 1 + Math.max(0, 0.35 - (n.max - n.life)) * 1.4 : 1;
            ctx.font = `${Math.round(big * pop * this.dpr)}px "Jersey 10", monospace`;
            ctx.globalAlpha = a;
            ctx.lineWidth = 4 * this.dpr;
            ctx.strokeStyle = '#07090C';
            ctx.strokeText(n.text, X(n.x), Y(n.y));
            ctx.fillStyle =
                n.kind === 'crit'
                    ? '#FFC53D'
                    : n.kind === 'hurt'
                      ? '#FF3B5C'
                      : n.kind === 'heal' || n.kind === 'info'
                        ? '#16E08A'
                        : '#E8EDF2';
            ctx.fillText(n.text, X(n.x), Y(n.y));
        }
        ctx.globalAlpha = 1;
    }

    _drawScreenFx(fx, W, H, p) {
        const ctx = this.ctx;
        const low = p.hp / p.maxHp;
        const v = Math.max(
            fx.vignette * 0.6,
            low < 0.25 ? 0.35 + 0.25 * Math.sin(performance.now() / 180) : 0
        );
        if (v > 0.01) {
            const g = ctx.createRadialGradient(
                W / 2,
                H / 2,
                Math.min(W, H) * 0.35,
                W / 2,
                H / 2,
                Math.max(W, H) * 0.75
            );
            g.addColorStop(0, 'rgba(255,59,92,0)');
            g.addColorStop(1, `rgba(255,59,92,${0.38 * v})`);
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, W, H);
        }
        if (fx.flash.a > 0.01) {
            ctx.fillStyle = `rgba(${fx.flash.color},${fx.flash.a})`;
            ctx.fillRect(0, 0, W, H);
        }
    }
}
