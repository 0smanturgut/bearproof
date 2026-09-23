/**
 * @module fx
 * @description Cosmetic effects in world space: pixel particles, damage numbers, rings, beams, falling
 * crates, horn swipes, plus screen shake and flash. Driven by simulation events; uses Math.random freely
 * because nothing here feeds back into gameplay. Everything is capped so a 300-enemy late game stays at
 * 60 fps on a mid-range phone.
 */

const MAX_PARTICLES = 360;
const MAX_NUMBERS = 70;

export class Fx {
    constructor(prefs) {
        this.prefs = prefs;
        this.particles = [];
        this.numbers = [];
        this.rings = [];
        this.lines = [];
        this.drops = [];
        this.swipes = [];
        this.shake = 0;
        this.flash = { a: 0, color: '255,255,255', decay: 3 };
        this.vignette = 0;
    }

    clear() {
        this.particles.length = 0;
        this.numbers.length = 0;
        this.rings.length = 0;
        this.lines.length = 0;
        this.drops.length = 0;
        this.swipes.length = 0;
        this.shake = 0;
        this.flash.a = 0;
        this.vignette = 0;
    }

    get calm() {
        return !!this.prefs.reducedMotion;
    }

    burst(x, y, color, n = 8, speed = 160, size = 4) {
        if (this.calm) n = Math.min(n, 3);
        for (let i = 0; i < n; i++) {
            if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
            const a = Math.random() * Math.PI * 2;
            const s = speed * (0.35 + Math.random() * 0.9);
            this.particles.push({
                x,
                y,
                vx: Math.cos(a) * s,
                vy: Math.sin(a) * s,
                life: 0.35 + Math.random() * 0.35,
                max: 0.7,
                size: size * (0.6 + Math.random() * 0.8),
                color
            });
        }
    }

    number(x, y, value, kind = 'dmg') {
        if (!this.prefs.damageNumbers && kind !== 'info' && kind !== 'hurt') return;
        if (this.numbers.length >= MAX_NUMBERS) this.numbers.shift();
        const text = typeof value === 'number' ? String(Math.max(1, Math.round(value))) : value;
        this.numbers.push({
            x: x + (Math.random() - 0.5) * 10,
            y,
            text,
            kind,
            life: kind === 'crit' ? 0.9 : kind === 'info' ? 1.2 : 0.65,
            max: kind === 'crit' ? 0.9 : kind === 'info' ? 1.2 : 0.65,
            vy: kind === 'info' ? -40 : -70
        });
    }

    ring(x, y, r0, r1, dur, color, width = 3) {
        this.rings.push({ x, y, r0, r1, t: 0, dur, color, width });
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
        this.drops.push({ x, y, t: 0, dur: 0.22 });
    }

    swipe(x, y, r, evolved) {
        this.swipes.push({ x, y, r, evolved, t: 0, dur: 0.16 });
    }

    addShake(amount) {
        if (!this.prefs.screenShake || this.calm) return;
        this.shake = Math.min(1.2, Math.max(this.shake, amount));
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
            p.vx *= 1 - 4 * dt;
            p.vy *= 1 - 4 * dt;
            p.life -= dt;
        }
        this.particles = this.particles.filter((p) => p.life > 0);
        for (const n of this.numbers) {
            n.y += n.vy * dt;
            n.vy *= 1 - 2.5 * dt;
            n.life -= dt;
        }
        this.numbers = this.numbers.filter((n) => n.life > 0);
        for (const list of [this.rings, this.lines, this.drops, this.swipes]) {
            for (const r of list) r.t += dt;
        }
        this.rings = this.rings.filter((r) => r.t < r.dur);
        this.lines = this.lines.filter((r) => r.t < r.dur);
        this.swipes = this.swipes.filter((r) => r.t < r.dur);
        for (const d of this.drops) {
            if (d.t >= d.dur && !d.landed) {
                d.landed = true;
                this.ring(d.x, d.y, 6, 60, 0.25, '255,197,61', 3);
                this.burst(d.x, d.y, '#FFC53D', 8, 180, 4);
            }
        }
        this.drops = this.drops.filter((d) => d.t < d.dur + 0.05);
        this.shake = Math.max(0, this.shake - 2.2 * dt);
        this.flash.a = Math.max(0, this.flash.a - this.flash.decay * dt);
        this.vignette = Math.max(0, this.vignette - 3 * dt);
    }

    /** Current shake offset in world units. */
    shakeOffset() {
        if (this.shake <= 0) return [0, 0];
        const s = this.shake * this.shake * 14;
        return [(Math.random() - 0.5) * s, (Math.random() - 0.5) * s];
    }
}
