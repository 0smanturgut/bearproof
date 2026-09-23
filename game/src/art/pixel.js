// BEARPROOF pixel-art engine. Sprites are built from shapes (ellipses, capsules, boxes, polygons) on a small
// grid, then lit like little 3D objects: every shape carries a surface normal, the light comes from the top
// left, and the brightness picks a colour from the material's ramp (with a touch of ordered dithering on
// big sprites). Parts drawn on top cast a contact shadow on the parts behind them, and the silhouette gets a
// selective outline in the darkest hue of whatever it touches. The result is consistent, hand-lit-looking
// pixel art that can be animated by just moving the shapes.
//
// Pure data, no DOM: the output is `{ w, h, px: (hex|null)[], glow: (hex|null)[] }`.

const norm = (v) => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
};
const LIGHT = norm([-0.55, -0.72, 0.5]);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** A material: a dark→light colour ramp, an outline hue and an optional emissive colour. */
export function mat(ramp, { line = null, glow = null } = {}) {
    return { ramp, line: line || ramp[0], glow };
}

function shadeNormal(nx, ny, nz, o) {
    const d = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
    const spec = o.spec ? Math.pow(Math.max(0, d), 12) * o.spec : 0;
    return clamp01((o.amb ?? 0.17) + (o.dif ?? 0.76) * Math.max(0, d) + (o.bias ?? 0) + spec);
}

export class PixelSprite {
    constructor(w, h, { dither = 0 } = {}) {
        this.w = w;
        this.h = h;
        const n = w * h;
        this.mat = new Array(n).fill(null);
        this.lum = new Float32Array(n);
        this.z = new Int32Array(n).fill(-1);
        this.group = new Int32Array(n).fill(-1);
        this.color = new Array(n).fill(null);
        this.glow = new Array(n).fill(null);
        this.bare = new Uint8Array(n); // no outline next to these pixels
        this.bias = new Float32Array(n);
        this.zc = 0;
        this.groups = new Map();
        this.autos = new Map();
        this.dither = dither;
    }

    /**
     * Light every shape of group `g` as ONE volume: a bevel of radius `R` px from the combined silhouette
     * (distance field), plus a top-left → bottom-right gradient of strength `grad` across the whole form.
     */
    auto(g, { R = 3, grad = 0.22, k = 1.5 } = {}) {
        this.autos.set(this._group({ g }), { R, grad, k });
        return this;
    }

    _group(o) {
        if (o.g === undefined) return this.zc;
        if (!this.groups.has(o.g)) this.groups.set(o.g, 100000 + this.groups.size);
        return this.groups.get(o.g);
    }

    _put(x, y, m, lum, o, z, g) {
        if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
        const i = y * this.w + x;
        if (o.under && this.mat[i]) return; // fill only empty pixels
        if (o.clip && !this.mat[i] && !this.color[i]) return; // paint only on existing pixels
        this.mat[i] = m;
        this.lum[i] = lum;
        this.z[i] = z;
        this.group[i] = g;
        this.color[i] = o.color || null;
        this.glow[i] = o.glow || m.glow || null;
        this.bare[i] = o.bare ? 1 : 0;
        this.bias[i] = o.bias || 0;
    }

    _bbox(x0, y0, x1, y1, fn) {
        const ax = Math.max(0, Math.floor(x0));
        const ay = Math.max(0, Math.floor(y0));
        const bx = Math.min(this.w - 1, Math.ceil(x1));
        const by = Math.min(this.h - 1, Math.ceil(y1));
        for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) fn(x, y, x + 0.5, y + 0.5);
    }

    /** Ellipse lit as a sphere (default) or flat (`shade: 'flat'`, `lum`). */
    ellipse(cx, cy, rx, ry, m, o = {}) {
        const z = ++this.zc;
        const g = this._group(o);
        this._bbox(cx - rx, cy - ry, cx + rx, cy + ry, (x, y, px, py) => {
            const u = (px - cx) / rx;
            const v = (py - cy) / ry;
            const d2 = u * u + v * v;
            if (d2 > 1) return;
            let lum;
            if (o.shade === 'flat') lum = o.lum ?? 0.6;
            else {
                const k = o.flat ?? 1; // <1 flattens the bulge
                lum = shadeNormal(u * k, v * k, Math.sqrt(Math.max(0, 1 - d2 * k * k)), o);
            }
            this._put(x, y, m, lum, o, z, g);
        });
        return this;
    }

    circle(cx, cy, r, m, o) {
        return this.ellipse(cx, cy, r, r, m, o);
    }

    /** Tapered limb from (x0,y0) radius r0 to (x1,y1) radius r1, lit as a cylinder. */
    capsule(x0, y0, x1, y1, r0, r1, m, o = {}) {
        const z = ++this.zc;
        const g = this._group(o);
        const dx = x1 - x0;
        const dy = y1 - y0;
        const len2 = dx * dx + dy * dy || 1e-6;
        const len = Math.sqrt(len2);
        const px0 = -dy / len;
        const py0 = dx / len;
        const R = Math.max(r0, r1);
        this._bbox(
            Math.min(x0, x1) - R,
            Math.min(y0, y1) - R,
            Math.max(x0, x1) + R,
            Math.max(y0, y1) + R,
            (x, y, px, py) => {
                const t = clamp01(((px - x0) * dx + (py - y0) * dy) / len2);
                const r = Math.max(0.5, r0 + (r1 - r0) * t);
                const qx = x0 + dx * t;
                const qy = y0 + dy * t;
                const ex = px - qx;
                const ey = py - qy;
                const d = Math.hypot(ex, ey);
                if (d > r + 0.15) return;
                let lum;
                if (o.shade === 'flat') lum = o.lum ?? 0.6;
                else {
                    const a = clamp01(d / r) * Math.sign(ex * px0 + ey * py0 || 1);
                    const nz = Math.sqrt(Math.max(0, 1 - a * a));
                    lum = shadeNormal(px0 * a, py0 * a, nz, o);
                }
                this._put(x, y, m, lum, o, z, g);
            }
        );
        return this;
    }

    /** Box with rounded corners (`r`), lit like a pillow: flat top, bevelled edges (`bevel` px). */
    box(x, y, w, h, m, o = {}) {
        const z = ++this.zc;
        const g = this._group(o);
        const r = o.r ?? 0;
        const bev = o.bevel ?? Math.max(1, Math.min(w, h) * 0.3);
        this._bbox(x, y, x + w - 1, y + h - 1, (ix, iy, px, py) => {
            if (px < x || py < y || px > x + w || py > y + h) return;
            // rounded corners
            const cx = Math.min(Math.max(px, x + r), x + w - r);
            const cy = Math.min(Math.max(py, y + r), y + h - r);
            if (r > 0 && Math.hypot(px - cx, py - cy) > r) return;
            let lum;
            if (o.shade === 'flat') lum = o.lum ?? 0.6;
            else {
                const dl = px - x;
                const dr = x + w - px;
                const dt = py - y;
                const db = y + h - py;
                const nx = dl < bev ? -(1 - dl / bev) : dr < bev ? 1 - dr / bev : 0;
                const ny = dt < bev ? -(1 - dt / bev) : db < bev ? 1 - db / bev : 0;
                const n = norm([nx * 0.9, ny * 0.9, 1]);
                lum = shadeNormal(n[0], n[1], n[2], o);
            }
            this._put(ix, iy, m, lum, o, z, g);
        });
        return this;
    }

    /** Polygon (even-odd). Flat, or a vertical gradient with `top` / `bot` brightness. */
    poly(points, m, o = {}) {
        const z = ++this.zc;
        const g = this._group(o);
        let x0 = Infinity;
        let y0 = Infinity;
        let x1 = -Infinity;
        let y1 = -Infinity;
        for (const [px, py] of points) {
            x0 = Math.min(x0, px);
            y0 = Math.min(y0, py);
            x1 = Math.max(x1, px);
            y1 = Math.max(y1, py);
        }
        this._bbox(x0, y0, x1, y1, (x, y, px, py) => {
            let inside = false;
            for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
                const [xi, yi] = points[i];
                const [xj, yj] = points[j];
                if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)
                    inside = !inside;
            }
            if (!inside) return;
            let lum = o.lum ?? 0.6;
            if (o.top !== undefined) {
                const v = (py - y0) / Math.max(1, y1 - y0);
                lum = o.top + (o.bot - o.top) * v;
            }
            if (o.left !== undefined) {
                const u = (px - x0) / Math.max(1, x1 - x0);
                lum = o.left + (o.right - o.left) * u;
            }
            this._put(x, y, m, clamp01(lum), o, z, g);
        });
        return this;
    }

    /**
     * Hand-drawn silhouette: `rows` is a list of [y, x0, x1] spans (inclusive), filled with `m`.
     * Use it with an `auto` group so the shape is lit as one volume.
     */
    spans(rows, m, o = {}) {
        const z = ++this.zc;
        const g = this._group(o);
        const dx = o.dx || 0;
        const dy = o.dy || 0;
        for (const [y, x0, x1] of rows)
            for (let x = x0; x <= x1; x++) this._put(x + dx, y + dy, m, o.lum ?? 0.6, o, z, g);
        return this;
    }

    /** A 1-px (or `w`-px) line, flat. */
    line(x0, y0, x1, y1, m, o = {}) {
        const w = o.w ?? 1;
        return this.capsule(x0, y0, x1, y1, w / 2, w / 2, m, { shade: 'flat', ...o });
    }

    /** One explicit pixel colour (details: eyes, glints, marks). */
    px(x, y, hex, o = {}) {
        const z = ++this.zc;
        const m = o.mat || { ramp: [hex], line: o.line || '#07090C', glow: null };
        this._put(Math.round(x), Math.round(y), m, 1, { ...o, color: hex }, z, -2);
        return this;
    }

    /** Several pixels: `pxs([[x, y], ...], hex)` or rows of a tiny ASCII patch with a colour map. */
    pxs(list, hex, o) {
        for (const [x, y] of list) this.px(x, y, hex, o);
        return this;
    }

    patch(x, y, rows, colors, o = {}) {
        rows.forEach((row, dy) => {
            for (let dx = 0; dx < row.length; dx++) {
                const ch = row[dx];
                if (ch === '.' || ch === ' ') continue;
                const c = colors[ch];
                if (c) this.px(x + dx, y + dy, c, o);
            }
        });
        return this;
    }

    /** Remove pixels inside a shape. */
    cutEllipse(cx, cy, rx, ry) {
        this._bbox(cx - rx, cy - ry, cx + rx, cy + ry, (x, y, px, py) => {
            const u = (px - cx) / rx;
            const v = (py - cy) / ry;
            if (u * u + v * v <= 1) this._clear(y * this.w + x);
        });
        return this;
    }

    cutBox(x, y, w, h) {
        this._bbox(x, y, x + w - 1, y + h - 1, (ix, iy) => this._clear(iy * this.w + ix));
        return this;
    }

    _clear(i) {
        this.mat[i] = null;
        this.color[i] = null;
        this.glow[i] = null;
        this.z[i] = -1;
    }

    /** Brighten or darken every pixel of a material already placed (e.g. far-side legs). */
    tone(delta, pred = () => true) {
        for (let i = 0; i < this.mat.length; i++)
            if (this.mat[i] && !this.color[i] && pred(i % this.w, (i / this.w) | 0))
                this.lum[i] = clamp01(this.lum[i] + delta);
        return this;
    }

    _autoShade() {
        const { w, h } = this;
        for (const [gid, { R, grad, k }] of this.autos) {
            const inG = (x, y) =>
                x >= 0 &&
                y >= 0 &&
                x < w &&
                y < h &&
                this.group[y * w + x] === gid &&
                this.mat[y * w + x] &&
                !this.color[y * w + x];
            // chamfer distance to the edge of the group's silhouette (3-4 weights, /3 ≈ px)
            const INF = 1e9;
            const d = new Float32Array(w * h);
            let x0 = w;
            let y0 = h;
            let x1 = -1;
            let y1 = -1;
            for (let y = 0; y < h; y++)
                for (let x = 0; x < w; x++) {
                    const inside = inG(x, y);
                    d[y * w + x] = inside ? INF : 0;
                    if (inside) {
                        x0 = Math.min(x0, x);
                        y0 = Math.min(y0, y);
                        x1 = Math.max(x1, x);
                        y1 = Math.max(y1, y);
                    }
                }
            if (x1 < 0) continue;
            const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[y * w + x]);
            for (let y = 0; y < h; y++)
                for (let x = 0; x < w; x++) {
                    const i = y * w + x;
                    if (!d[i]) continue;
                    d[i] = Math.min(
                        d[i],
                        at(x - 1, y) + 3,
                        at(x, y - 1) + 3,
                        at(x - 1, y - 1) + 4,
                        at(x + 1, y - 1) + 4
                    );
                }
            for (let y = h - 1; y >= 0; y--)
                for (let x = w - 1; x >= 0; x--) {
                    const i = y * w + x;
                    if (!d[i]) continue;
                    d[i] = Math.min(
                        d[i],
                        at(x + 1, y) + 3,
                        at(x, y + 1) + 3,
                        at(x + 1, y + 1) + 4,
                        at(x - 1, y + 1) + 4
                    );
                }
            const hgt = (x, y) => {
                const v = at(x, y) / 3;
                if (!v) return 0;
                const t = Math.min(1, (v - 0.5) / R);
                return Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t)));
            };
            const bw = Math.max(1, x1 - x0);
            const bh = Math.max(1, y1 - y0);
            for (let y = y0; y <= y1; y++)
                for (let x = x0; x <= x1; x++) {
                    if (!inG(x, y)) continue;
                    const i = y * w + x;
                    const n = norm([
                        (hgt(x - 1, y) - hgt(x + 1, y)) * k,
                        (hgt(x, y - 1) - hgt(x, y + 1)) * k,
                        1
                    ]);
                    const u = (x - x0) / bw - 0.5;
                    const v = (y - y0) / bh - 0.5;
                    this.lum[i] = clamp01(
                        shadeNormal(n[0], n[1], n[2], {}) - (u * 0.6 + v) * grad + this.bias[i]
                    );
                }
        }
    }

    /**
     * Resolve lighting, contact shadows and the outline into final colours. The output is padded by one
     * transparent pixel on every side, so the outline always fits.
     */
    render({ outline = true, ao = 0.2 } = {}) {
        this._autoShade();
        const { w, h } = this;
        const W = w + 2;
        const H = h + 2;
        const base = new Array(W * H).fill(null);
        const glow = new Array(W * H).fill(null);
        const src = new Int32Array(W * H).fill(-1); // padded index -> source index
        const idx = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : y * w + x);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = y * w + x;
                const m = this.mat[i];
                if (!m) continue;
                const o = (y + 1) * W + x + 1;
                src[o] = i;
                glow[o] = this.glow[i];
                if (this.color[i]) {
                    base[o] = this.color[i];
                    continue;
                }
                let lum = this.lum[i];
                if (ao) {
                    // A later part above or to the left casts a small shadow down-right onto this one.
                    for (const [nx, ny, k] of [
                        [x - 1, y, 1],
                        [x, y - 1, 1],
                        [x + 1, y, 0.45],
                        [x, y + 1, 0.45]
                    ]) {
                        const j = idx(nx, ny);
                        if (j < 0 || !this.mat[j] || this.color[j]) continue;
                        if (this.z[j] > this.z[i] && this.group[j] !== this.group[i]) {
                            lum -= ao * k;
                            break;
                        }
                    }
                }
                const n = m.ramp.length;
                let t = clamp01(lum) * (n - 1);
                if (this.dither) t += (BAYER[(y & 3) * 4 + (x & 3)] - 0.5) * this.dither;
                base[o] = m.ramp[Math.max(0, Math.min(n - 1, Math.round(t)))];
            }
        }
        if (!outline) return { w: W, h: H, px: base, glow };
        const out = base.slice();
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const o = y * W + x;
                if (base[o]) continue;
                let best = null;
                // The last neighbour checked wins, so below/right (the shadow side) sets the line colour.
                for (const [nx, ny] of [
                    [x, y - 1],
                    [x - 1, y],
                    [x + 1, y],
                    [x, y + 1]
                ]) {
                    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                    const j = ny * W + nx;
                    if (!base[j] || src[j] < 0 || this.bare[src[j]]) continue;
                    best = this.mat[src[j]].line;
                }
                if (best) out[o] = best;
            }
        }
        return { w: W, h: H, px: out, glow };
    }
}

/**
 * Turn rendered frames into the renderer's sprite format: `{ w, h, frames: string[][], colors, glow? }`,
 * one character per colour.
 */
const CHARS = 'ABCDEFGHIJKLMNPQRSTUVWXYZabcdefghijklmnpqrstuvwxyz0123456789!#$%&*+-/:;<=>?@^_~|';
export function toDef(frames, extra = {}) {
    const w = frames[0].w;
    const h = frames[0].h;
    const colors = {};
    const byHex = new Map();
    const ch = (hex) => {
        const key = hex.toLowerCase();
        if (key === '#07090c') return 'o';
        if (!byHex.has(key)) {
            const c = CHARS[byHex.size];
            if (!c) throw new Error('too many colours in one sprite');
            byHex.set(key, c);
            colors[c] = hex;
        }
        return byHex.get(key);
    };
    const grid = (arr) => {
        const rows = [];
        for (let y = 0; y < h; y++) {
            let row = '';
            for (let x = 0; x < w; x++) {
                const v = arr[y * w + x];
                row += v ? ch(v) : '.';
            }
            rows.push(row);
        }
        return rows;
    };
    const def = { w, h, frames: frames.map((f) => grid(f.px)), colors: { o: '#07090C' }, ...extra };
    if (frames.some((f) => f.glow.some(Boolean))) def.glowFrames = frames.map((f) => grid(f.glow));
    Object.assign(def.colors, colors);
    return def;
}
