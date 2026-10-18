/**
 * @module life
 * @description The maps' ambient life and weather, around the camera: crows and pigeons that take off when
 * something comes near, rats running across the street, hares bolting over the snow, fireflies in the groves,
 * embers over fires, steam out of manholes, rain and its splashes, glints on puddles, ripples where the bull (or a
 * bear) wades through water, the bull's tracks in the snow, the marks a kill leaves on the ground, and the aurora
 * over Crypto Winter. Render-only and random on purpose (Math.random): nothing here feeds back into a run.
 */

import { SPRITES } from './art/sprites.js';

const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);

const STAIN = {
    chop: '18,14,10',
    bear_trap: '8,8,12',
    winter: '62,74,100'
};

export class Life {
    constructor() {
        this.stage = null;
        this.reset('chop');
    }

    reset(stage) {
        this.stage = stage;
        this.birds = [];
        this.runners = [];
        this.flies = [];
        this.embers = [];
        this.steam = [];
        this.drops = [];
        this.rings = [];
        this.prints = [];
        this.stains = [];
        this.leaves = [];
        this.spawnAt = 0;
        this.runnerAt = 3;
        this.printAt = 0;
        this.printSide = 1;
        this.last = null;
        this.wade = new Map();
        this.mist = [];
        this.boltAt = 20;
        this.bolt = -10;
    }

    /** How bright a lightning strike over the city is right now (0 when there's none): a double flicker. */
    lightning(t) {
        const a = t - this.bolt;
        if (a < 0 || a > 0.45) return 0;
        return a < 0.08
            ? 1 - a / 0.08
            : a < 0.16
              ? 0.15
              : a < 0.24
                ? 0.8
                : Math.max(0, 0.8 - (a - 0.24) * 4);
    }

    // ------------------------------------------------------------------------------------------------ update

    /**
     * One frame. `view`: { cx, cy, hw, hh } in world units (the camera centre and half extents); `rich`: full
     * effects (graphics 'high'); `calm`: reduced motion.
     */
    update(dt, t, sim, world, fx, view, rich, calm) {
        if (world.stageId !== this.stage) this.reset(world.stageId);
        const st = this.stage;
        const p = sim.player;
        const { cx, cy, hw, hh } = view;
        const near = (x, y, m) => Math.abs(x - cx) < hw + m && Math.abs(y - cy) < hh + m;
        const moved = this.last ? Math.hypot(p.x - this.last.x, p.y - this.last.y) : 0;
        const dir =
            this.last && moved > 0.01 ? Math.atan2(p.y - this.last.y, p.x - this.last.x) : 0;
        this.last = { x: p.x, y: p.y };
        const moving = moved > 0.5;

        // --- birds: a flock pecks just off screen; whatever comes near sends it up
        if (st !== 'winter') {
            if (t > this.spawnAt && this.birds.filter((b) => !b.fly).length < (rich ? 7 : 4)) {
                this.spawnAt = t + rnd(1.5, 4);
                const a = moving && Math.random() < 0.7 ? dir + rnd(-0.6, 0.6) : rnd(0, TAU);
                const d = Math.max(hw, hh) * rnd(0.85, 1.15);
                const fx0 = cx + Math.cos(a) * d;
                const fy0 = cy + Math.sin(a) * d * 0.8;
                const n = st === 'chop' ? Math.floor(rnd(2, 5)) : Math.floor(rnd(3, 7));
                for (let i = 0; i < n; i++)
                    this.birds.push({
                        kind: st === 'chop' ? 'crow' : 'pigeon',
                        x: fx0 + rnd(-40, 40),
                        y: fy0 + rnd(-24, 24),
                        z: 0,
                        vx: 0,
                        vy: 0,
                        flip: Math.random() < 0.5,
                        fly: false,
                        peck: rnd(0, 3),
                        ph: rnd(0, 10)
                    });
            }
        }
        for (const b of this.birds) {
            if (!b.fly) {
                let scare = Math.hypot(b.x - p.x, b.y - p.y) < 150;
                if (!scare)
                    for (const e of sim.enemies) {
                        if (Math.abs(e.x - b.x) < 70 && Math.abs(e.y - b.y) < 60) {
                            scare = true;
                            break;
                        }
                    }
                if (scare) {
                    b.fly = true;
                    const a = Math.atan2(b.y - p.y, b.x - p.x) + rnd(-0.5, 0.5);
                    const sp = rnd(170, 240);
                    b.vx = Math.cos(a) * sp;
                    b.vy = Math.sin(a) * sp * 0.6 - 40;
                    b.flip = b.vx < 0;
                } else if (Math.random() < dt * 0.4) b.flip = !b.flip;
            } else {
                b.x += b.vx * dt;
                b.y += b.vy * dt;
                b.z = Math.min(140, b.z + 120 * dt);
            }
        }
        this.birds = this.birds.filter((b) => near(b.x, b.y - b.z, b.fly ? 160 : 500));

        // --- runners: a rat across the street, a hare that sits until you come close
        if (st !== 'chop' && t > this.runnerAt && this.runners.length < 3) {
            this.runnerAt = t + rnd(4, 9);
            if (st === 'bear_trap') {
                const left = Math.random() < 0.5;
                const y = cy + rnd(-hh * 0.8, hh * 0.8);
                this.runners.push({
                    kind: 'rat',
                    x: left ? cx - hw - 30 : cx + hw + 30,
                    y,
                    vx: left ? rnd(220, 300) : -rnd(220, 300),
                    vy: rnd(-30, 30),
                    run: true,
                    hop: 0
                });
            } else {
                const a = rnd(0, TAU);
                this.runners.push({
                    kind: 'hare',
                    x: cx + Math.cos(a) * hw * 0.9,
                    y: cy + Math.sin(a) * hh * 0.9,
                    vx: 0,
                    vy: 0,
                    run: false,
                    hop: 0
                });
            }
        }
        for (const r of this.runners) {
            if (r.kind === 'hare' && !r.run && Math.hypot(r.x - p.x, r.y - p.y) < 190) {
                r.run = true;
                const a = Math.atan2(r.y - p.y, r.x - p.x) + rnd(-0.4, 0.4);
                r.vx = Math.cos(a) * 250;
                r.vy = Math.sin(a) * 250;
            }
            if (r.run) {
                r.x += r.vx * dt;
                r.y += r.vy * dt;
                r.hop += dt;
            }
        }
        this.runners = this.runners.filter((r) => near(r.x, r.y, r.run ? 60 : 400));

        // --- fireflies in the forest, drifting where the trees are thick
        if (st === 'chop') {
            const want = rich ? 34 : 14;
            while (this.flies.length < want) {
                let x = cx + rnd(-hw - 100, hw + 100);
                let y = cy + rnd(-hh - 100, hh + 100);
                for (let k = 0; k < 4 && world.layout.grove(x, y) < 0.5; k++) {
                    x = cx + rnd(-hw - 100, hw + 100);
                    y = cy + rnd(-hh - 100, hh + 100);
                }
                this.flies.push({
                    x,
                    y,
                    a: rnd(0, TAU),
                    ph: rnd(0, TAU),
                    f: rnd(1.2, 2.6),
                    z: rnd(14, 40)
                });
            }
            for (const f of this.flies) {
                f.a += rnd(-2, 2) * dt;
                f.x += Math.cos(f.a) * 16 * dt;
                f.y += Math.sin(f.a) * 12 * dt;
            }
            this.flies = this.flies.filter((f) => near(f.x, f.y, 140));
        }

        // --- embers over every fire on screen; steam out of the manholes
        if (!calm) {
            for (const c of world.visibleChunks(cx, cy, hw, hh)) {
                for (const { p: pr, l } of c.lights) {
                    if (l.flicker !== 'fire' || !near(pr.x, pr.y, 40)) continue;
                    if (Math.random() < dt * (rich ? 7 : 3)) {
                        const sd = SPRITES[pr.id];
                        const lx = pr.x + (pr.flip ? -(l.x || 0) : l.x || 0) * 2;
                        const ly = pr.y - (sd.h / 2 - 2) * 2 + (l.y || 0) * 2;
                        this.embers.push({
                            x: lx + rnd(-6, 6),
                            y: ly,
                            vx: rnd(-14, 14),
                            vy: rnd(-70, -40),
                            life: rnd(0.8, 1.6),
                            max: 1.6
                        });
                    }
                }
                for (const m of c.steam) {
                    if (!near(m.x, m.y, 60)) continue;
                    if (Math.random() < dt * (rich ? 3.2 : 1.4))
                        this.steam.push({
                            x: m.x + rnd(-6, 6),
                            y: m.y,
                            vx: rnd(-6, 10),
                            vy: rnd(-26, -14),
                            r: rnd(6, 10),
                            life: rnd(1.8, 2.8),
                            max: 2.8
                        });
                }
            }
        }
        for (const e of this.embers) {
            e.x += (e.vx + Math.sin(t * 3 + e.y * 0.05) * 10) * dt;
            e.y += e.vy * dt;
            e.life -= dt;
        }
        this.embers = this.embers.filter((e) => e.life > 0).slice(-70);
        for (const m of this.steam) {
            m.x += m.vx * dt;
            m.y += m.vy * dt;
            m.r += 9 * dt;
            m.life -= dt;
        }
        this.steam = this.steam.filter((m) => m.life > 0).slice(-50);

        // --- water: the bull and the bears splash through puddles; it rains downtown
        const waters = [];
        for (const c of world.visibleChunks(cx, cy, hw, hh))
            for (const w of c.waters) if (near(w.x, w.y, 40)) waters.push(w);
        this.waters = waters;
        const inside = (w, x, y) => {
            const dx = (x - w.x) / w.rx;
            const dy = (y - w.y) / w.ry;
            return dx * dx + dy * dy < 1;
        };
        for (const w of waters) {
            if (w.ice) continue;
            const was = this.wade.get(w) || 0;
            if (t - was < 0.12) continue;
            let who = null;
            if (moving && inside(w, p.x, p.y + 12)) who = p;
            else
                for (const e of sim.enemies) {
                    if (
                        e.hp > 0 &&
                        Math.abs(e.x - w.x) < w.rx &&
                        inside(w, e.x, e.y + e.size * 0.6)
                    ) {
                        who = e;
                        break;
                    }
                }
            if (!who) continue;
            this.wade.set(w, t);
            const fy = who === p ? p.y + 14 : who.y + who.size * 0.6;
            this.rings.push({ x: who.x, y: fy, r: 3, R: rnd(14, 22), life: 0.5, max: 0.5 });
            for (let i = 0; i < 3; i++)
                this.drops.push({
                    x: who.x + rnd(-6, 6),
                    y: fy,
                    vx: rnd(-50, 50),
                    vy: rnd(-90, -50),
                    g: 320,
                    life: 0.35,
                    max: 0.35,
                    splash: true
                });
        }
        if (this.wade.size > 60) this.wade.clear();
        if (st === 'bear_trap' && !calm) {
            // rain on the ground: tiny rings, more of them on the puddles
            const n = (rich ? 26 : 10) * dt;
            for (let i = 0; i < Math.floor(n) + (Math.random() < n % 1 ? 1 : 0); i++)
                this.rings.push({
                    x: cx + rnd(-hw, hw),
                    y: cy + rnd(-hh, hh),
                    r: 0.5,
                    R: rnd(3, 5),
                    life: 0.28,
                    max: 0.28,
                    rain: true
                });
            for (const w of waters)
                if (Math.random() < dt * 5) {
                    const a = rnd(0, TAU);
                    const k = Math.sqrt(Math.random()) * 0.8;
                    this.rings.push({
                        x: w.x + Math.cos(a) * w.rx * k,
                        y: w.y + Math.sin(a) * w.ry * k,
                        r: 1,
                        R: rnd(6, 10),
                        life: 0.6,
                        max: 0.6
                    });
                }
        }
        for (const r of this.rings) r.life -= dt;
        this.rings = this.rings.filter((r) => r.life > 0).slice(-120);
        for (const d of this.drops) {
            d.vy += d.g * dt;
            d.x += d.vx * dt;
            d.y += d.vy * dt;
            d.life -= dt;
        }
        this.drops = this.drops.filter((d) => d.life > 0);

        // --- tracks in the snow (not on the frozen river)
        if (st === 'winter' && moving && t > this.printAt && p.rocketTimer <= 0) {
            this.printAt = t + 0.14;
            if (world.layout.trail(p.x, p.y + 16) > 62) {
                this.printSide = -this.printSide;
                const nx = -Math.sin(dir);
                const ny = Math.cos(dir);
                this.prints.push({
                    x: p.x + nx * 5 * this.printSide,
                    y: p.y + 18 + ny * 3 * this.printSide,
                    a: dir,
                    t0: t
                });
            }
        }
        this.prints = this.prints.filter((q) => t - q.t0 < 9).slice(-160);

        // --- what a kill leaves behind
        for (const c of fx.corpses) {
            if (c._marked) continue;
            c._marked = true;
            this.stains.push({
                x: c.x,
                y: c.y + 10,
                t0: t,
                r: rnd(7, 11),
                seed: Math.random() * 1000
            });
        }
        this.stains = this.stains.filter((q) => t - q.t0 < 16).slice(-70);

        // --- a storm over the city: now and then, lightning
        if (st === 'bear_trap' && !calm && t > this.boltAt) {
            this.bolt = t;
            this.boltAt = t + rnd(18, 40);
        }

        // --- mist lying low between the trees
        if (st === 'chop' && rich) {
            while (this.mist.length < 5)
                this.mist.push({
                    x: cx + rnd(-hw - 300, hw + 300),
                    y: cy + rnd(-hh - 200, hh + 200),
                    r: rnd(150, 260),
                    a: rnd(0.04, 0.08)
                });
            for (const m of this.mist) {
                m.x += 9 * dt;
                m.y += 3 * dt;
            }
            this.mist = this.mist.filter((m) => near(m.x, m.y, 420));
        }

        // --- leaves drifting down through the forest's light
        if (st === 'chop' && !calm) {
            while (this.leaves.length < (rich ? 9 : 4))
                this.leaves.push({
                    x: rnd(0, 1),
                    y: rnd(-0.2, 1),
                    v: rnd(0.025, 0.05),
                    ph: rnd(0, TAU),
                    c: Math.random() < 0.5 ? '#6E6A3A' : '#5B4A2C'
                });
            for (const l of this.leaves) {
                l.y += l.v * dt;
                l.x += Math.sin(t * 1.3 + l.ph) * 0.012 * dt;
                if (l.y > 1.05) {
                    l.y = -0.05;
                    l.x = Math.random();
                }
            }
        }
    }

    // ------------------------------------------------------------------------------------------------ drawing

    /** On the ground, before the creatures: kill marks, tracks, ripples, and the small life still on its feet. */
    drawGround(r, X, Y, t) {
        const ctx = r.ctx;
        const s = r.s;
        const k = r.k;
        const stain = STAIN[this.stage] || STAIN.chop;
        for (const q of this.stains) {
            const age = t - q.t0;
            const a = Math.min(1, age * 6) * Math.max(0, 1 - age / 16) * 0.42;
            if (a <= 0.01) continue;
            ctx.fillStyle = `rgba(${stain},${a.toFixed(3)})`;
            const u = Math.max(2, Math.round(k));
            const x0 = Math.round(X(q.x));
            const y0 = Math.round(Y(q.y));
            for (let i = 0; i < 7; i++) {
                const h = Math.sin(q.seed + i * 12.9898) * 43758.5453;
                const f = h - Math.floor(h);
                const ang = f * TAU;
                const d = (i ? 0.45 + f * 0.55 : 0) * q.r * s;
                const w = (i ? 2 : 4) * u;
                ctx.fillRect(
                    Math.round(x0 + Math.cos(ang) * d - w / 2),
                    Math.round(y0 + Math.sin(ang) * d * 0.55 - w / 4),
                    w,
                    Math.max(u, w / 2)
                );
            }
        }
        if (this.prints.length) {
            const u = Math.max(2, Math.round(k * 0.9));
            for (const q of this.prints) {
                const a = Math.max(0, 1 - (t - q.t0) / 9) * 0.5;
                ctx.fillStyle = `rgba(70,88,122,${a.toFixed(3)})`;
                const x = Math.round(X(q.x));
                const y = Math.round(Y(q.y));
                ctx.fillRect(x - u, y - Math.round(u / 2), u * 2, u);
                ctx.fillRect(
                    x + Math.round(Math.cos(q.a) * u * 1.6) - Math.round(u / 2),
                    y - Math.round(u / 2),
                    u,
                    u
                );
            }
        }
        // ripples (and rain rings)
        ctx.lineWidth = Math.max(1, s * 1.2);
        for (const q of this.rings) {
            const f = 1 - q.life / q.max;
            const R = (q.r + (q.R - q.r) * f) * s;
            ctx.strokeStyle = q.rain
                ? `rgba(170,190,215,${(0.35 * (1 - f)).toFixed(3)})`
                : `rgba(190,215,235,${(0.55 * (1 - f)).toFixed(3)})`;
            ctx.beginPath();
            ctx.ellipse(X(q.x), Y(q.y), R, R * 0.45, 0, 0, TAU);
            ctx.stroke();
        }
        // critters on the ground: a soft shadow, then the sprite
        for (const b of this.birds)
            if (!b.fly)
                this._critter(
                    r,
                    b.kind,
                    X(b.x),
                    Y(b.y),
                    (t + b.ph) % 3 < 0.4 || Math.sin(t * 2 + b.ph) > 0.8 ? 1 : 0,
                    b.flip,
                    0
                );
        for (const q of this.runners) {
            if (q.kind === 'rat')
                this._critter(r, 'rat', X(q.x), Y(q.y), Math.floor(t * 14), q.vx < 0, 0);
            else {
                const hop = q.run ? Math.abs(Math.sin(q.hop * 9)) : 0;
                this._critter(
                    r,
                    'hare',
                    X(q.x),
                    Y(q.y),
                    q.run ? (hop > 0.5 ? 1 : 2) : 0,
                    q.vx < 0,
                    hop * 8 * s
                );
            }
        }
    }

    _critter(r, id, sx, sy, frame, flip, lift) {
        const def = SPRITES[id];
        if (!def) return;
        const k = r.k;
        r._shadow(sx, sy + (def.h * k) / 2 - 2 * k, def.w * k * 0.7, 0.7);
        r._blit(id, sx, sy - lift, { frame, flip });
    }

    /** Above the world, after the night is multiplied in: everything here glows or flies. */
    drawAir(r, X, Y, W, H, t, rich, calm) {
        const ctx = r.ctx;
        const s = r.s;
        const k = r.k;
        // glints on water and ice
        ctx.globalCompositeOperation = 'lighter';
        for (const w of this.waters || []) {
            const n = w.ice ? 4 : 2;
            for (let i = 0; i < n; i++) {
                const h1 = Math.sin(w.x * 0.13 + i * 7.1) * 0.5 + 0.5;
                const h2 = Math.sin(w.y * 0.17 + i * 3.7) * 0.5 + 0.5;
                const tw = Math.sin(t * (w.ice ? 3.1 : 1.7) + i * 2 + w.x);
                if (tw < 0.55) continue;
                const a = (tw - 0.55) / 0.45;
                const x = Math.round(X(w.x + (h1 - 0.5) * w.rx * 1.2));
                const y = Math.round(Y(w.y + (h2 - 0.5) * w.ry * 1.1));
                // a glint of moonlight: one bright pixel on a short, faint streak
                const u = Math.max(1, Math.round(k * 0.8));
                ctx.fillStyle = `rgba(200,224,255,${(0.35 * a).toFixed(3)})`;
                ctx.fillRect(x - u * 2, y, u * 5, u);
                ctx.fillStyle = `rgba(230,244,255,${(0.9 * a).toFixed(3)})`;
                ctx.fillRect(x, y, u, u);
            }
        }
        // mist (under the fireflies)
        for (const m of this.mist) {
            ctx.globalAlpha = m.a;
            const rr = m.r * s;
            ctx.drawImage(
                r.lighting.blob('170,200,190'),
                X(m.x) - rr * 1.6,
                Y(m.y) - rr * 0.7,
                rr * 3.2,
                rr * 1.4
            );
        }
        ctx.globalAlpha = 1;
        // fireflies
        for (const f of this.flies) {
            const b = Math.sin(t * f.f + f.ph);
            if (b < -0.2) continue;
            const a = (b + 0.2) / 1.2;
            const x = X(f.x);
            const y = Y(f.y - f.z);
            if (rich) {
                const rr = 12 * s;
                ctx.globalAlpha = 0.5 * a;
                ctx.drawImage(r.lighting.blob('190,255,150'), x - rr, y - rr, rr * 2, rr * 2);
            }
            ctx.globalAlpha = a;
            ctx.fillStyle = '#E4FFB0';
            const u = Math.max(2, Math.round(k * 0.9));
            ctx.fillRect(Math.round(x - u / 2), Math.round(y - u / 2), u, u);
        }
        ctx.globalAlpha = 1;
        // embers
        for (const e of this.embers) {
            const a = Math.max(0, e.life / e.max);
            ctx.fillStyle = `rgba(255,${Math.round(120 + 100 * a)},60,${a.toFixed(3)})`;
            const u = Math.max(1, Math.round(k * 0.8));
            ctx.fillRect(Math.round(X(e.x)), Math.round(Y(e.y)), u, u);
        }
        ctx.globalCompositeOperation = 'source-over';
        // splash droplets
        for (const d of this.drops) {
            ctx.fillStyle = `rgba(190,215,240,${((0.8 * d.life) / d.max).toFixed(3)})`;
            const u = Math.max(1, Math.round(k * 0.7));
            ctx.fillRect(Math.round(X(d.x)), Math.round(Y(d.y)), u, u);
        }
        // steam
        for (const m of this.steam) {
            const f = m.life / m.max;
            const a = Math.min(1, (1 - f) * 5) * f * 0.16;
            ctx.globalAlpha = a;
            const rr = m.r * s;
            ctx.drawImage(r.lighting.blob('215,222,235'), X(m.x) - rr, Y(m.y) - rr, rr * 2, rr * 2);
        }
        ctx.globalAlpha = 1;
        // birds in the air (and their shadows far below)
        for (const b of this.birds) {
            if (!b.fly) continue;
            const def = SPRITES[b.kind];
            if (!def) continue;
            r._shadow(
                X(b.x),
                Y(b.y) + (def.h * k) / 2,
                def.w * k * 0.5,
                Math.max(0, 0.6 - b.z / 200)
            );
            r._blit(b.kind, X(b.x), Y(b.y - b.z), {
                frame: 2 + (Math.floor(t * 12 + b.ph) % 2),
                flip: b.flip
            });
        }
        // falling leaves (screen space)
        if (this.leaves.length) {
            const u = Math.max(2, Math.round(k * 0.9));
            for (const l of this.leaves) {
                ctx.fillStyle = l.c;
                const x = Math.round(l.x * W);
                const y = Math.round(l.y * H);
                const flat = Math.sin(t * 4 + l.ph) > 0;
                ctx.fillRect(x, y, flat ? u * 2 : u, flat ? u : u * 2);
            }
        }
        if (this.stage === 'bear_trap') this._rain(ctx, W, H, t, r.dpr, rich, calm);
        if (this.stage === 'winter' && rich) this._aurora(ctx, W, H, t, calm);
    }

    /** Rain: thin slanted streaks over the whole screen. */
    _rain(ctx, W, H, t, dpr, rich, calm) {
        const n = Math.round(((W * H) / (9000 * dpr * dpr)) * (rich ? 1 : 0.5));
        if (!this.rain || this.rain.length !== n)
            this.rain = Array.from({ length: n }, () => ({
                x: Math.random(),
                y: Math.random(),
                v: rnd(0.9, 1.3),
                l: rnd(0.7, 1.2)
            }));
        const speed = calm ? 0.25 : 1.3;
        ctx.strokeStyle = 'rgba(160,178,205,0.28)';
        ctx.lineWidth = Math.max(1, dpr);
        ctx.beginPath();
        const len = 16 * dpr;
        for (const d of this.rain) {
            const y = ((d.y + t * speed * d.v) % 1.1) - 0.05;
            const x = (d.x + y * 0.12) % 1;
            const px = x * W;
            const py = y * H;
            ctx.moveTo(px, py);
            ctx.lineTo(px - len * 0.22 * d.l, py - len * d.l);
        }
        ctx.stroke();
    }

    /** The aurora: curtains of green and teal light waving along the top of the screen. */
    _aurora(ctx, W, H, t, calm) {
        const tex = this._auroraTex(H);
        const step = Math.max(4, Math.round(W / 140));
        const sp = calm ? 0.15 : 1;
        ctx.globalCompositeOperation = 'lighter';
        for (let band = 0; band < 2; band++) {
            const img = tex[band];
            for (let x = 0; x < W; x += step) {
                const u = x / W;
                const wave =
                    Math.sin(u * 5.2 + t * 0.21 * sp + band * 2) * 0.5 +
                    Math.sin(u * 13.7 - t * 0.37 * sp + band) * 0.25;
                const top = H * (0.02 + band * 0.07 + wave * 0.05);
                const h = H * (0.22 + 0.08 * Math.sin(u * 9 + t * 0.3 * sp + band * 4));
                const a = 0.5 + 0.5 * Math.sin(u * 21 + t * 0.8 * sp + band * 3);
                ctx.globalAlpha = (0.05 + 0.1 * a) * (band ? 0.7 : 1);
                ctx.drawImage(img, x, top, step, h);
            }
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
    }

    _auroraTex(H) {
        if (this._aur && this._aurH === H) return this._aur;
        const mk = (top, mid) => {
            const c = document.createElement('canvas');
            c.width = 1;
            c.height = 128;
            const g = c.getContext('2d');
            const gr = g.createLinearGradient(0, 0, 0, 128);
            gr.addColorStop(0, `rgba(${top},0)`);
            gr.addColorStop(0.25, `rgba(${top},0.9)`);
            gr.addColorStop(0.6, `rgba(${mid},0.5)`);
            gr.addColorStop(1, `rgba(${mid},0)`);
            g.fillStyle = gr;
            g.fillRect(0, 0, 1, 128);
            return c;
        };
        this._aur = [mk('140,255,200', '60,200,190'), mk('170,140,255', '80,170,255')];
        this._aurH = H;
        return this._aur;
    }
}
