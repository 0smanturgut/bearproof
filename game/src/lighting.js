/**
 * @module lighting
 * @description Night light for the maps: a small light buffer (a quarter of the screen's resolution) filled with
 * the map's moonlight, darkened where clouds pass over, with every light source added in (the bull's own glow,
 * lamps, fires, XP candles, explosions), then multiplied over the world. Whatever is drawn after it (shots, sparks,
 * damage numbers, the bloom of eyes and candles) stays at full brightness, so it pops out of the dark.
 * Render-only.
 */

import { watchCanvas } from './art/sprites.js';

const LS = 4; // device px per light-buffer px
const CLOUD_CELL = 1100; // world units: one cloud per cell, drifting with the wind
const WIND = [14, 5]; // world units per second

function hash(i, j) {
    let h = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(j | 0, 0x165667b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
}

function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return watchCanvas(c);
}

export class Lighting {
    constructor() {
        this.canvas = null;
        this.blobs = {};
        this.lights = [];
    }

    /** After a lost context: rebuild the buffer and the light textures. */
    drop() {
        this.canvas = null;
        this.blobs = {};
    }

    /** A soft light texture in one colour, 64×64, cached. */
    blob(rgb) {
        let c = this.blobs[rgb];
        if (c) return c;
        c = makeCanvas(64, 64);
        const x = c.getContext('2d');
        const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, `rgba(${rgb},1)`);
        g.addColorStop(0.35, `rgba(${rgb},0.62)`);
        g.addColorStop(0.7, `rgba(${rgb},0.2)`);
        g.addColorStop(1, `rgba(${rgb},0)`);
        x.fillStyle = g;
        x.fillRect(0, 0, 64, 64);
        this.blobs[rgb] = c;
        return c;
    }

    /** Start a frame's list of lights. */
    begin() {
        this.lights.length = 0;
    }

    /** One light at screen point (sx, sy), `r` device px, colour 'r,g,b', strength 0..1. */
    add(sx, sy, r, rgb, a) {
        if (a > 0.01 && r > 1) this.lights.push(sx, sy, r, rgb, a);
    }

    /**
     * Multiply the night over everything drawn so far. `ambient`: [r, g, b] moonlight; `cloud`: how dark a cloud's
     * shadow is; `cam`: the world point at the screen centre; `s`: device px per world unit; `t`: seconds.
     */
    apply(ctx, W, H, { ambient, cloud, cam, s, t, lift = 0 }) {
        const lw = Math.ceil(W / LS);
        const lh = Math.ceil(H / LS);
        if (!this.canvas || this.canvas.width !== lw || this.canvas.height !== lh) {
            this.canvas = makeCanvas(lw, lh);
        }
        const g = this.canvas.getContext('2d');
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1;
        const k = Math.min(1, lift);
        const amb = ambient.map((v) => Math.round(v + (255 - v) * k));
        g.fillStyle = `rgb(${amb[0]},${amb[1]},${amb[2]})`;
        g.fillRect(0, 0, lw, lh);
        // cloud shadows sliding over the ground
        if (cloud > 0) {
            const shade = this.blob('0,0,0');
            const sc = s / LS;
            const ox = cam.x - WIND[0] * t;
            const oy = cam.y - WIND[1] * t;
            const hw = (W / s) * 0.5 + 600;
            const hh = (H / s) * 0.5 + 600;
            const i0 = Math.floor((ox - hw) / CLOUD_CELL);
            const i1 = Math.floor((ox + hw) / CLOUD_CELL);
            const j0 = Math.floor((oy - hh) / CLOUD_CELL);
            const j1 = Math.floor((oy + hh) / CLOUD_CELL);
            for (let j = j0; j <= j1; j++)
                for (let i = i0; i <= i1; i++) {
                    if (hash(i, j) < 0.35) continue;
                    const wx = (i + hash(i + 7, j)) * CLOUD_CELL + WIND[0] * t;
                    const wy = (j + hash(i, j + 7)) * CLOUD_CELL + WIND[1] * t;
                    const r = (380 + hash(i + 3, j + 9) * 420) * sc;
                    const x = (wx - cam.x) * sc + lw / 2;
                    const y = (wy - cam.y) * sc + lh / 2;
                    g.globalAlpha = cloud * (0.6 + 0.4 * hash(i + 5, j + 5));
                    g.drawImage(shade, x - r * 1.4, y - r, r * 2.8, r * 2);
                }
        }
        g.globalCompositeOperation = 'lighter';
        const L = this.lights;
        for (let i = 0; i < L.length; i += 5) {
            const r = L[i + 2] / LS;
            g.globalAlpha = Math.min(1, L[i + 4]);
            g.drawImage(this.blob(L[i + 3]), L[i] / LS - r, L[i + 1] / LS - r, r * 2, r * 2);
        }
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
        const smooth = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = true;
        ctx.globalCompositeOperation = 'multiply';
        ctx.drawImage(this.canvas, 0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
        ctx.imageSmoothingEnabled = smooth;
    }
}
