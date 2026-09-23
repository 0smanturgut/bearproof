/**
 * @module sim/spatial
 * @description Uniform-grid spatial hash for broad-phase queries (from upstream src/spatial-hash.js).
 * Keys are numbers, not "gx,gy" strings, so a rebuild every tick allocates no strings. Iteration order is
 * insertion order, which keeps every query deterministic.
 */

const STRIDE = 100003;

export class SpatialHash {
    constructor(cell = 64) {
        this.cell = cell;
        this.map = new Map();
    }

    rebuild(items) {
        this.map.clear();
        const c = this.cell;
        for (const it of items) {
            const k = Math.floor(it.x / c) * STRIDE + Math.floor(it.y / c);
            const b = this.map.get(k);
            if (b) b.push(it);
            else this.map.set(k, [it]);
        }
    }

    /** Items whose cell overlaps the square (x ± r, y ± r). Callers do the exact distance test. */
    queryRect(x, y, r) {
        const c = this.cell;
        const x0 = Math.floor((x - r) / c);
        const x1 = Math.floor((x + r) / c);
        const y0 = Math.floor((y - r) / c);
        const y1 = Math.floor((y + r) / c);
        const out = [];
        for (let gx = x0; gx <= x1; gx++) {
            for (let gy = y0; gy <= y1; gy++) {
                const b = this.map.get(gx * STRIDE + gy);
                if (b) for (let i = 0; i < b.length; i++) out.push(b[i]);
            }
        }
        return out;
    }

    /** Closest live item within maxRange, or null. Ties keep the first found. */
    findNearest(x, y, maxRange) {
        let best = null;
        let bestD2 = maxRange * maxRange;
        const r = Math.min(maxRange, 1400);
        for (const e of this.queryRect(x, y, r)) {
            if (e.hp <= 0) continue;
            const dx = e.x - x;
            const dy = e.y - y;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestD2) {
                bestD2 = d2;
                best = e;
            }
        }
        return best;
    }
}
