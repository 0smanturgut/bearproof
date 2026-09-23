/**
 * @module fx
 * @description Cosmetic effects in world space: sparks, dust, smoke, sprite shatter, damage numbers,
 * rings, beams, falling crates, horn swipes, plus screen shake and flash. Driven by simulation events;
 * uses Math.random freely because nothing here feeds back into gameplay. Everything is capped so a
 * 300-enemy late game stays at 60 fps on a mid-range phone.
 */

const MAX_PARTICLES = 420;
const MAX_NUMBERS = 70;
const MAX_CORPSES = 40;

export class Fx {
    constructor(prefs) {
        this.prefs = prefs;
        this.particles = [];
        this.numbers = [];
        this.rings = [];
        this.lines = [];
        this.drops = [];
        this.swipes = [];
        this.corpses = [];
        this.pings = [];
        this.shake = 0;
        this.flash = { a: 0, color: '255,255,255', decay: 3 };
        this.vignette = 0;
        this.kick = 0; // camera punch (0..1), decays fast
    }

    clear() {
        for (const k of [
            'particles',
            'numbers',
            'rings',
            'lines',
            'drops',
            'swipes',
            'corpses',
            'pings'
        ])
            this[k].length = 0;
        this.shake = 0;
        this.flash.a = 0;
        this.vignette = 0;
        this.kick = 0;
    }

    get calm() {
        return !!this.prefs.reducedMotion;
    }

    _push(p) {
        if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
        this.particles.push(p);
    }

    /**
     * Particle burst. `kind`: 'px' (square pixels), 'spark' (additive streaks), 'dust', 'smoke', 'ember',
     * 'bubble', 'snow'.
     */
    burst(x, y, color, n = 8, speed = 160, size = 4, kind = 'px') {
        if (this.calm) n = Math.min(n, 3);
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = speed * (0.35 + Math.random() * 0.9);
            const life = kind === 'smoke' ? 0.6 + Math.random() * 0.5 : 0.3 + Math.random() * 0.4;
            this._push({
                kind,
                x,
                y,
                vx: Math.cos(a) * s,
                vy: Math.sin(a) * s - (kind === 'smoke' || kind === 'ember' ? 40 : 0),
                life,
                max: life,
                size: size * (0.6 + Math.random() * 0.8),
                color,
                drag: kind === 'spark' ? 6 : kind === 'smoke' || kind === 'dust' ? 3 : 4
            });
        }
    }

    /** Short bright streaks at a hit point, flying away from `angle` (radians) if given. */
    sparks(x, y, color = '#FFFFFF', n = 3, angle = null) {
        if (this.calm) return;
        for (let i = 0; i < n; i++) {
            const a =
                angle === null ? Math.random() * Math.PI * 2 : angle + (Math.random() - 0.5) * 1.6;
            const s = 220 + Math.random() * 260;
            this._push({
                kind: 'spark',
                x,
                y,
                vx: Math.cos(a) * s,
                vy: Math.sin(a) * s,
                life: 0.12 + Math.random() * 0.12,
                max: 0.24,
                size: 2.2,
                color,
                drag: 9
            });
        }
    }

    /** A puff of dust at a footstep. */
    dust(x, y, dir = 0) {
        if (this.calm && Math.random() < 0.6) return;
        this._push({
            kind: 'dust',
            x: x + (Math.random() - 0.5) * 8,
            y,
            vx: -dir * (30 + Math.random() * 30),
            vy: -8 - Math.random() * 14,
            life: 0.38,
            max: 0.38,
            size: 5 + Math.random() * 3,
            color: 'rgba(160,190,200,',
            drag: 3
        });
    }

    /** Break a sprite into chunks that fly apart (renderer draws the pieces from the baked sprite). */
    shatter(x, y, sprite, { big = false, flip = false } = {}) {
        if (this.corpses.length >= MAX_CORPSES) this.corpses.shift();
        const n = big ? 4 : 3;
        const pieces = [];
        for (let gy = 0; gy < n; gy++)
            for (let gx = 0; gx < n; gx++) {
                const cx = (gx + 0.5) / n - 0.5;
                const cy = (gy + 0.5) / n - 0.5;
                const sp = (big ? 180 : 140) * (0.6 + Math.random() * 0.8);
                pieces.push({
                    u: gx / n,
                    v: gy / n,
                    w: 1 / n,
                    h: 1 / n,
                    ox: 0,
                    oy: 0,
                    vx: cx * sp * 2 + (Math.random() - 0.5) * 60,
                    vy: cy * sp * 2 - 60 - Math.random() * 50,
                    rot: 0,
                    vr: (Math.random() - 0.5) * 14
                });
            }
        this.corpses.push({ x, y, sprite, flip, pieces, t: 0, dur: big ? 0.9 : 0.5 });
    }

    /** A little sparkle where something was picked up. */
    ping(x, y, color = '22,224,138') {
        if (this.pings.length > 30) this.pings.shift();
        this.pings.push({ x, y, t: 0, dur: 0.28, color });
    }

    number(x, y, value, kind = 'dmg') {
        if (!this.prefs.damageNumbers && kind !== 'info' && kind !== 'hurt') return;
        if (this.numbers.length >= MAX_NUMBERS) this.numbers.shift();
        const text = typeof value === 'number' ? String(Math.max(1, Math.round(value))) : value;
        const life = kind === 'crit' ? 0.9 : kind === 'info' ? 1.2 : 0.7;
        this.numbers.push({
            x: x + (Math.random() - 0.5) * 12,
            y,
            text,
            kind,
            life,
            max: life,
            vx: (Math.random() - 0.5) * 30,
            vy: kind === 'info' ? -40 : -90,
            rot: kind === 'crit' ? (Math.random() - 0.5) * 0.3 : 0
        });
    }

    ring(x, y, r0, r1, dur, color, width = 3, fill = false) {
        this.rings.push({ x, y, r0, r1, t: 0, dur, color, width, fill });
    }

    line(x1, y1, x2, y2, dur, color, width = 3, jagged = false) {
        this.lines.push({
            x1,
            y1,
            x2,
            y2,
            t: 0,
            dur,
            color,
            width,
            jagged,
            seed: Math.random() * 1000
        });
    }

    drop(x, y) {
        this.drops.push({ x, y, t: 0, dur: 0.3 });
    }

    swipe(x, y, r, evolved) {
        this.swipes.push({ x, y, r, evolved, t: 0, dur: 0.2, dir: Math.random() < 0.5 ? 1 : -1 });
    }

    addShake(amount) {
        if (!this.prefs.screenShake || this.calm) return;
        this.shake = Math.min(1.2, Math.max(this.shake, amount));
    }

    addKick(amount) {
        if (!this.prefs.screenShake || this.calm) return;
        this.kick = Math.min(1, Math.max(this.kick, amount));
    }

    addFlash(rgb, a, decay = 3) {
        if (this.calm) a *= 0.4;
        this.flash.color = rgb;
        this.flash.a = Math.max(this.flash.a, a);
        this.flash.decay = decay;
    }

    update(dt) {
        for (const p of this.particles) {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            const d = 1 - p.drag * dt;
            p.vx *= d;
            p.vy *= d;
            if (p.kind === 'ember') p.vy -= 30 * dt;
            p.life -= dt;
        }
        this.particles = this.particles.filter((p) => p.life > 0);
        for (const n of this.numbers) {
            n.x += n.vx * dt;
            n.y += n.vy * dt;
            n.vy *= 1 - 3.2 * dt;
            n.vx *= 1 - 3 * dt;
            n.life -= dt;
        }
        this.numbers = this.numbers.filter((n) => n.life > 0);
        for (const list of [
            this.rings,
            this.lines,
            this.drops,
            this.swipes,
            this.corpses,
            this.pings
        ])
            for (const r of list) r.t += dt;
        for (const c of this.corpses)
            for (const p of c.pieces) {
                p.ox += p.vx * dt;
                p.oy += p.vy * dt;
                p.vx *= 1 - 3.5 * dt;
                p.vy = p.vy * (1 - 3.5 * dt) + 260 * dt;
                p.rot += p.vr * dt;
            }
        this.rings = this.rings.filter((r) => r.t < r.dur);
        this.lines = this.lines.filter((r) => r.t < r.dur);
        this.swipes = this.swipes.filter((r) => r.t < r.dur);
        this.corpses = this.corpses.filter((c) => c.t < c.dur);
        this.pings = this.pings.filter((c) => c.t < c.dur);
        for (const d of this.drops) {
            if (d.t >= d.dur && !d.landed) {
                d.landed = true;
                this.ring(d.x, d.y, 8, 70, 0.3, '255,197,61', 4);
                this.burst(d.x, d.y, '#FFC53D', 8, 200, 4, 'spark');
                this.burst(d.x, d.y + 6, 'rgba(160,140,110,', 6, 90, 8, 'dust');
                this.addShake(0.12);
            }
        }
        this.drops = this.drops.filter((d) => d.t < d.dur + 0.05);
        this.shake = Math.max(0, this.shake - 2.2 * dt);
        this.kick = Math.max(0, this.kick - 6 * dt);
        this.flash.a = Math.max(0, this.flash.a - this.flash.decay * dt);
        this.vignette = Math.max(0, this.vignette - 3 * dt);
    }

    /** Current shake offset in world units. */
    shakeOffset() {
        if (this.shake <= 0 && this.kick <= 0) return [0, 0];
        const s = this.shake * this.shake * 14 + this.kick * 7;
        return [(Math.random() - 0.5) * s, (Math.random() - 0.5) * s];
    }
}
