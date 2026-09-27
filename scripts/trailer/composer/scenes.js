// The trailer's scenes. Each draws one frame from (scene, local time) and the data snapshot; nothing here is
// typed-in data: numbers, build titles, log lines, ledger rows and ballot options all come from `env.D`.
import {
    C,
    clamp,
    lerp,
    prog,
    ease,
    hash,
    text,
    measure,
    fit,
    setFont,
    scramble,
    slam,
    rect,
    strokeRect,
    brackets,
    panel,
    chip,
    button,
    grid,
    chart
} from './gfx.js';
import { BEAT, footageAt, AGENT_BEATS, shortTx } from './timeline.js';

// ---------------------------------------------------------------- shared pieces

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const dayMon = (iso) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
const hms = (iso) => iso.slice(11, 19);
const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
const M = (env) => (env.P ? 64 : 96);

function cover(ctx, env, img, o = {}) {
    if (!img) return;
    const x = o.x ?? 0;
    const y = o.y ?? 0;
    const w = o.w ?? env.W;
    const h = o.h ?? env.H;
    const iw = img.width;
    const ih = img.height;
    const s = Math.max(w / iw, h / ih) * (o.zoom || 1);
    const cx = o.cx ?? 0.5;
    const cy = o.cy ?? 0.5;
    const dw = iw * s;
    const dh = ih * s;
    let dx = x + w / 2 - cx * dw;
    let dy = y + h / 2 - cy * dh;
    // never show past the image edge
    dx = Math.min(x, Math.max(x + w - dw, dx));
    dy = Math.min(y, Math.max(y + h - dh, dy));
    ctx.save();
    ctx.globalAlpha *= o.alpha ?? 1;
    if (o.clip) {
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();
}

function footage(ctx, env, s, lt, o = {}) {
    const fr = footageAt(s, lt, env.meta);
    if (!fr) return null;
    const img = env.frame(fr.shot, fr.frame);
    cover(ctx, env, img, o);
    return fr;
}

let blurCanvas = null;
/** A cheap strong blur: draw small, scale back up. */
function blurred(ctx, env, img, o = {}) {
    if (!img) return;
    const k = o.k || 16;
    const w = Math.ceil(env.W / k);
    const h = Math.ceil(env.H / k);
    if (!blurCanvas || blurCanvas.width !== w) {
        blurCanvas = document.createElement('canvas');
        blurCanvas.width = w;
        blurCanvas.height = h;
    }
    const b = blurCanvas.getContext('2d');
    b.imageSmoothingEnabled = true;
    b.imageSmoothingQuality = 'high';
    cover(b, { W: w, H: h }, img, { zoom: o.zoom || 1 });
    ctx.save();
    ctx.globalAlpha *= o.alpha ?? 1;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(blurCanvas, 0, 0, env.W, env.H);
    ctx.restore();
}

function bg(ctx, env, lt, o = {}) {
    const { W, H } = env;
    rect(ctx, 0, 0, W, H, o.fill || C.ink);
    if (o.glow) {
        const g = ctx.createRadialGradient(
            W / 2,
            H * (o.glowY ?? 0.45),
            0,
            W / 2,
            H * (o.glowY ?? 0.45),
            Math.max(W, H) * 0.6
        );
        g.addColorStop(0, o.glow);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    }
    if (o.chart !== false)
        chart(ctx, W, H, env.t + (o.seed || 0), {
            trend: o.trend ?? 0,
            alpha: o.chartAlpha ?? 0.22,
            base: H * (o.chartY ?? 0.66),
            amp: H * 0.14,
            maColor: o.trend === -1 ? 'rgba(255,59,92,0.45)' : 'rgba(22,224,138,0.45)'
        });
    grid(ctx, W, H, { step: 60, ox: env.t * 12, color: o.gridColor || 'rgba(27,34,43,0.6)' });
}

/** "■ LIVE · DAY 5 · BUILD #5" and the URL, top of the frame. */
function topBar(ctx, env, o = {}) {
    const { W, D } = env;
    const m = M(env);
    const y = env.P ? 86 : 70;
    const px = env.P ? 22 : 22;
    ctx.save();
    ctx.globalAlpha *= o.alpha ?? 1;
    const blink = Math.floor(env.t * 2) % 2 === 0 ? 1 : 0.35;
    rect(ctx, m, y - 13, 14, 14, `rgba(22,224,138,${blink})`);
    text(ctx, `LIVE · DAY ${D.day} · BUILD #${D.liveBuild.n}`, m + 28, y, {
        kind: 'monoBold',
        px,
        color: C.bull,
        tracking: 3,
        baseline: 'alphabetic'
    });
    text(ctx, 'bearproof.app', W - m, y, {
        kind: 'mono',
        px,
        color: C.muted,
        align: 'right',
        tracking: 2
    });
    ctx.restore();
}

/** A line of display text that slams in at t0 (scaled about its own centre). */
function slamText(ctx, env, lt, t0, str, x, y, o = {}) {
    const st = slam(lt, t0, o.dur || 0.2);
    if (!st.on) return 0;
    const px = o.maxW ? fit(ctx, str, o.kind || 'display', o.px, o.maxW, o.tracking || 0) : o.px;
    const w = measure(ctx, str, o.kind || 'display', px, o.tracking || 0);
    const align = o.align || 'center';
    const cx = align === 'center' ? x : align === 'left' ? x + w / 2 : x - w / 2;
    const cy = y - px * 0.34;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(st.scale, st.scale);
    ctx.translate(-cx, -cy);
    text(ctx, str, x, y, { ...o, align, px, maxW: undefined, alpha: (o.alpha ?? 1) * st.alpha });
    if (st.flash > 0)
        text(ctx, str, x, y, {
            ...o,
            align,
            px,
            maxW: undefined,
            color: '#FFFFFF',
            shadow: 0,
            glow: 0,
            alpha: st.flash * 0.85
        });
    ctx.restore();
    return px;
}

function typed(str, lt, t0, cps = 60) {
    if (lt < t0) return '';
    return str.slice(0, Math.floor((lt - t0) * cps));
}

function wrap(ctx, str, maxW, kind, px) {
    setFont(ctx, kind, px);
    const words = str.split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
        const t = cur ? `${cur} ${w}` : w;
        if (ctx.measureText(t).width > maxW && cur) {
            lines.push(cur);
            cur = w;
        } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
}

function ellipsize(ctx, str, maxW, kind, px) {
    setFont(ctx, kind, px);
    if (ctx.measureText(str).width <= maxW) return str;
    let lo = 0;
    let hi = str.length;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (ctx.measureText(str.slice(0, mid) + '…').width <= maxW) lo = mid;
        else hi = mid - 1;
    }
    return str.slice(0, lo).trimEnd() + '…';
}

function drawSprite(ctx, env, id, scale, x, y, o = {}) {
    const frames = env.sprite(id, scale, o);
    if (!frames) return null;
    const fps = o.fps || 8;
    const img = frames[Math.floor((o.time ?? env.t) * fps) % frames.length];
    const dx = Math.round(x - img.width * (o.ax ?? 0.5));
    const dy = Math.round(y - img.height * (o.ay ?? 1));
    ctx.save();
    ctx.globalAlpha *= o.alpha ?? 1;
    ctx.imageSmoothingEnabled = false;
    if (o.glow) {
        const g = env.glow(id, scale);
        if (g) {
            const gi = g[Math.floor((o.time ?? env.t) * fps) % g.length];
            ctx.globalCompositeOperation = 'lighter';
            ctx.drawImage(
                gi,
                Math.round(x - gi.width / 2),
                Math.round(dy + img.height / 2 - gi.height / 2)
            );
            ctx.globalCompositeOperation = 'source-over';
        }
    }
    ctx.drawImage(img, dx, dy);
    ctx.restore();
    return img;
}

function darken(ctx, env, a) {
    rect(ctx, 0, 0, env.W, env.H, `rgba(7,9,12,${a})`);
}

function bottomShade(ctx, env, from = 0.45, a = 0.9) {
    const g = ctx.createLinearGradient(0, env.H * from, 0, env.H);
    g.addColorStop(0, 'rgba(7,9,12,0)');
    g.addColorStop(1, `rgba(7,9,12,${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, env.H * from, env.W, env.H * (1 - from));
}

function topShade(ctx, env, to = 0.3, a = 0.85) {
    const g = ctx.createLinearGradient(0, 0, 0, env.H * to);
    g.addColorStop(0, `rgba(7,9,12,${a})`);
    g.addColorStop(1, 'rgba(7,9,12,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, env.W, env.H * to);
}

function blackout(ctx, env, lt, from) {
    const a = clamp((lt - from) / 0.06);
    if (a > 0) rect(ctx, 0, 0, env.W, env.H, `rgba(0,0,0,${a})`);
}

// ---------------------------------------------------------------- 0–8 s: the one-liner

function hook(ctx, env, s, lt) {
    const { W, H, P } = env;
    footage(ctx, env, s, lt, { zoom: 1.04 + 0.05 * (lt / 2) });
    darken(ctx, env, 0.48);
    const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.5);
    g.addColorStop(0, 'rgba(7,9,12,0.55)');
    g.addColorStop(1, 'rgba(7,9,12,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    topBar(ctx, env);

    const px = P ? 156 : 178;
    const lh = px * 0.9;
    const rows = s.words.length + (s.sub ? 0.7 : 0);
    const y0 = H / 2 - (rows * lh) / 2 + lh * 0.72;
    s.words.forEach((w, i) => {
        const size = w.big ? px * 1.22 : px;
        // the very first word is already there on frame 0: it is the thumbnail X shows before playing
        const t0 = s.id === 'hook1' && i === 0 ? -0.3 : w.b * BEAT;
        slamText(ctx, env, lt, t0, w.s, W / 2, y0 + i * lh + (w.big ? lh * 0.1 : 0), {
            px: size,
            color: w.green ? C.bull : C.text,
            shadow: Math.round(size * 0.06),
            shadowColor: w.green ? C.bullDeep : '#000',
            glow: w.green ? 36 : 0,
            maxW: W - 2 * M(env)
        });
    });
    if (s.sub) {
        const str = typed(s.sub.s, lt, s.sub.b * BEAT, 115);
        const lines = wrap(ctx, s.sub.s, W - 2 * M(env) - 40, 'mono', P ? 34 : 36);
        let left = str.length;
        const y = y0 + s.words.length * lh + (P ? 10 : 6);
        lines.forEach((ln, i) => {
            const part = ln.slice(0, Math.max(0, left));
            left -= ln.length + 1;
            text(ctx, part, W / 2, y + i * (P ? 48 : 50), {
                kind: 'mono',
                px: P ? 34 : 36,
                color: C.text2,
                align: 'center'
            });
        });
    }
}

function clock(ctx, env, s, lt) {
    const { W, H, P } = env;
    const b = lt / BEAT;
    bg(ctx, env, lt, {
        trend: 0,
        glow: b >= 3 ? 'rgba(22,224,138,0.18)' : 'rgba(70,200,255,0.05)'
    });
    topBar(ctx, env);
    const px = P ? 196 : 340;
    const cy = H / 2 + px * 0.18;
    const done = b >= 3;
    const secs = done ? '00' : String(57 + Math.floor(b)).padStart(2, '0');
    const head = done ? '00:00:' : '23:59:';
    const full = head + secs;
    const w = measure(ctx, full, 'display', px);
    const x0 = W / 2 - w / 2;
    const wHead = measure(ctx, head, 'display', px);
    const col = done ? C.bull : C.text;
    const sh = {
        shadow: Math.round(px * 0.05),
        shadowColor: done ? C.bullDeep : '#000',
        glow: done ? 60 : 0
    };
    if (done) {
        const st = slam(lt, 3 * BEAT, 0.18);
        ctx.save();
        ctx.translate(W / 2, cy - px * 0.3);
        ctx.scale(st.scale, st.scale);
        ctx.translate(-W / 2, -(cy - px * 0.3));
        text(ctx, full, x0, cy, { px, color: col, ...sh });
        ctx.restore();
    } else {
        text(ctx, head, x0, cy, { px, color: col, ...sh });
        // the seconds roll in from above on every beat
        const k = ease.outCubic(clamp((b % 1) / 0.28));
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0 + wHead - 10, cy - px * 0.85, px * 1.2, px * 1.05);
        ctx.clip();
        const prev = String(57 + Math.floor(b) - 1).padStart(2, '0');
        if (b >= 1 && k < 1)
            text(ctx, prev, x0 + wHead, cy + k * px * 0.9, { px, color: col, ...sh, alpha: 1 - k });
        text(ctx, secs, x0 + wHead, cy - (1 - k) * px * 0.9, { px, color: col, ...sh });
        ctx.restore();
    }
    text(ctx, 'UTC', W / 2, cy + (P ? 90 : 110), {
        kind: 'monoBold',
        px: P ? 34 : 40,
        color: C.muted,
        align: 'center',
        tracking: 12
    });
    const line = 'Every day at 00:00 UTC, a new build goes live.';
    text(ctx, typed(line, lt, 0.1, 55), W / 2, cy + (P ? 170 : 200), {
        kind: 'mono',
        px: P ? 30 : 34,
        color: C.text2,
        align: 'center',
        maxW: W - 2 * M(env)
    });
    if (done) {
        const st = slam(lt, 3 * BEAT + 0.05, 0.16);
        if (st.on)
            chip(ctx, `BUILD #${env.D.liveBuild.n} · LIVE`, W / 2, cy - px * 0.95, {
                px: P ? 24 : 28,
                align: 'center',
                color: C.bull,
                fill: 'rgba(6,77,47,0.55)',
                alpha: st.alpha
            });
        brackets(ctx, x0 - 50, cy - px * 0.82, w + 100, px * 1.05, C.bull, 44, 6);
    }
    blackout(ctx, env, lt, 3.6 * BEAT);
}

function title(ctx, env, s, lt) {
    const { W, H, P, D } = env;
    bg(ctx, env, lt, {
        trend: 1,
        glow: 'rgba(22,224,138,0.22)',
        chartAlpha: 0.3,
        gridColor: 'rgba(22,224,138,0.08)'
    });
    const px = P ? 220 : 330;
    const cy = P ? H * 0.44 : H * 0.44;
    // shockwave
    const r = ease.outCubic(prog(lt, 0, 0.6)) * Math.max(W, H) * 0.7;
    if (lt < 0.6) {
        ctx.save();
        ctx.strokeStyle = `rgba(22,224,138,${0.7 * (1 - lt / 0.6)})`;
        ctx.lineWidth = 16 * (1 - lt / 0.6) + 2;
        ctx.beginPath();
        ctx.arc(W / 2, cy - px * 0.3, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
    // pixel debris
    for (let i = 0; i < 60; i++) {
        const a = hash(i, 5) * Math.PI * 2;
        const sp = 300 + hash(i, 6) * 900;
        const life = 0.4 + hash(i, 7) * 0.9;
        const tt = lt;
        if (tt > life) continue;
        const d = sp * tt * (1 - tt / (life * 2));
        const x = W / 2 + Math.cos(a) * d;
        const y = cy - px * 0.3 + Math.sin(a) * d + 400 * tt * tt;
        const sz = 6 + hash(i, 8) * 10;
        ctx.fillStyle = i % 5 === 0 ? C.gold : i % 3 === 0 ? C.bullLight : C.bull;
        ctx.globalAlpha = 1 - tt / life;
        ctx.fillRect(x, y, sz, sz);
    }
    ctx.globalAlpha = 1;
    slamText(ctx, env, lt, 0, 'BEARPROOF', W / 2, cy, {
        px,
        color: C.bull,
        shadow: Math.round(px * 0.045),
        shadowColor: C.bullDeep,
        glow: 50,
        maxW: W - 2 * M(env),
        dur: 0.24
    });
    // the bull charges in under the logo
    const k = ease.outExpo(prog(lt, 0.1, 0.55));
    const scale = P ? 8 : 10;
    const bx = lerp(-260, W / 2, k);
    const by = cy + (P ? 300 : 320);
    // dust
    for (let i = 0; i < 18; i++) {
        const age = (lt * 3 + hash(i, 1)) % 1;
        const x = bx - 130 - age * 260 - hash(i, 2) * 40;
        const y = by - 10 - hash(i, 3) * 40 - age * 30;
        ctx.fillStyle = `rgba(150,160,175,${0.35 * (1 - age) * clamp(k * 2)})`;
        const sz = 8 + age * 16;
        ctx.fillRect(x, y, sz, sz);
    }
    drawSprite(ctx, env, 'bull', scale, bx, by, { fps: k < 1 ? 14 : 8, glow: true });
    const sub = 'A GAME BUILT IN PUBLIC BY AN AI';
    text(ctx, typed(sub, lt, 1.5 * BEAT, 50), W / 2, by + (P ? 90 : 84), {
        kind: 'monoBold',
        px: P ? 30 : 34,
        color: C.text2,
        align: 'center',
        tracking: 7,
        maxW: W - 2 * M(env)
    });
    const st = slam(lt, 2.5 * BEAT, 0.16);
    if (st.on)
        chip(ctx, `DAY ${D.day} · BUILD #${D.liveBuild.n} LIVE`, W / 2, P ? 230 : 150, {
            px: P ? 24 : 26,
            align: 'center',
            color: C.gold,
            alpha: st.alpha
        });
}

// ---------------------------------------------------------------- 10–16 s: the Build Agent's night

const LINE_STYLE = {
    start: ['●', C.gold],
    say: ['›', C.text],
    tool: ['$', C.muted],
    test: ['✓', C.bull],
    review: ['◆', C.info],
    gate: ['✓', C.bull],
    cost: ['$', C.gold],
    ship: ['⇪', C.bull],
    plan: ['≡', C.text2],
    done: ['✓', C.bull],
    context: ['i', C.text2]
};

function agent(ctx, env, s, lt) {
    const { W, H, P, D } = env;
    bg(ctx, env, lt, { chart: false });
    topBar(ctx, env);
    const m = M(env);
    const hpx = P ? 92 : 96;
    if (P) {
        slamText(ctx, env, lt, 0, 'EVERY NIGHT, 21:00 UTC', W / 2, 250, {
            px: hpx,
            color: C.bull,
            shadow: 5,
            shadowColor: C.bullDeep,
            maxW: W - 2 * m
        });
        slamText(ctx, env, lt, 0.12, 'IT WRITES THE NEXT BUILD.', W / 2, 250 + hpx * 0.95, {
            px: hpx * 0.8,
            color: C.text,
            shadow: 5,
            maxW: W - 2 * m
        });
    } else {
        slamText(ctx, env, lt, 0, 'EVERY NIGHT AT 21:00 UTC,', m, 170, {
            px: hpx,
            color: C.bull,
            shadow: 5,
            shadowColor: C.bullDeep,
            align: 'left'
        });
        slamText(ctx, env, lt, 0.12, 'IT WRITES THE NEXT BUILD. LIVE.', m, 170 + hpx * 0.9, {
            px: hpx,
            color: C.text,
            shadow: 5,
            align: 'left'
        });
    }
    const px = P ? 23 : 25;
    const lh = Math.round(px * 1.62);
    const x = m;
    const y = P ? 470 : 330;
    const w = W - 2 * m;
    const h = P ? H - y - 190 : H - y - 70;
    const started = D.agent.startedAt;
    const merged = D.agent.mergedAt;
    const inT = ease.outCubic(prog(lt, 0.1, 0.35));
    ctx.save();
    ctx.translate(0, (1 - inT) * 60);
    ctx.globalAlpha = inT;
    panel(ctx, x, y, w, h, {
        title: `BUILD AGENT · BUILD #${D.agent.build} · ${dayMon(started)} ${started.slice(0, 4)} · REAL SESSION LOG`,
        titleRight: P
            ? ''
            : `${hms(started).slice(0, 5)} → ${merged ? hms(merged).slice(0, 5) : '…'} UTC`,
        titleRightW: P ? 0 : 240,
        titlePx: P ? 15 : 17,
        brackets: C.bull,
        fill: 'rgba(9,12,16,0.94)'
    });
    // lines, typed, scrolled to keep the newest in view
    const innerTop = y + 64;
    const innerH = h - 84;
    const tsW = measure(ctx, '00:00:00  ', 'mono', px);
    const textW = w - 48 - tsW - 36;
    const items = [];
    s.lines.forEach((l, i) => {
        const t0 = AGENT_BEATS[i] * BEAT;
        if (lt < t0) return;
        const lines = P
            ? wrap(ctx, l.text, textW, 'mono', px).slice(0, 3)
            : [ellipsize(ctx, l.text, textW, 'mono', px)];
        items.push({ l, t0, lines, h: lines.length * lh + (P ? 8 : 4) });
    });
    let total = 0;
    for (const it of items) total += it.h;
    const last = items[items.length - 1];
    const prevTotal = total - (last ? last.h : 0);
    const target = Math.max(0, total - innerH);
    const prevTarget = Math.max(0, prevTotal - innerH);
    const off = last ? lerp(prevTarget, target, ease.outCubic(clamp((lt - last.t0) / 0.14))) : 0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 4, innerTop - 6, w - 8, innerH + 10);
    ctx.clip();
    let yy = innerTop + px - off;
    items.forEach((it, idx) => {
        const [icon, col] = LINE_STYLE[it.l.type] || ['·', C.text2];
        const newest = idx === items.length - 1;
        const chars = newest ? Math.floor((lt - it.t0) * 190) : 1e9;
        let left = chars;
        text(ctx, hms(it.l.ts), x + 24, yy, { kind: 'mono', px, color: C.dim });
        text(ctx, icon, x + 24 + tsW, yy, { kind: 'monoBold', px, color: col });
        it.lines.forEach((ln, k) => {
            const part = ln.slice(0, Math.max(0, left));
            left -= ln.length + 1;
            text(ctx, part, x + 24 + tsW + 34, yy + k * lh, {
                kind: it.l.type === 'say' || it.l.type === 'ship' ? 'monoBold' : 'mono',
                px,
                color: it.l.type === 'tool' ? C.muted : col
            });
            if (newest && left < 0 && left > -ln.length - 1 && Math.floor(env.t * 4) % 2 === 0) {
                const cw = measure(ctx, part, 'mono', px);
                rect(
                    ctx,
                    x + 24 + tsW + 34 + cw + 4,
                    yy + k * lh - px * 0.8,
                    px * 0.55,
                    px,
                    C.bull
                );
            }
        });
        yy += it.h;
    });
    ctx.restore();
    ctx.restore();
    if (P)
        text(ctx, 'Live every night at bearproof.app/live', W / 2, H - 110, {
            kind: 'mono',
            px: 26,
            color: C.muted,
            align: 'center'
        });
}

function stats(ctx, env, s, lt) {
    const { W, H, P, D } = env;
    bg(ctx, env, lt, { trend: 1, chartAlpha: 0.14 });
    topBar(ctx, env);
    const a = D.agent;
    const mins = a.mergedAt
        ? Math.floor((Date.parse(a.mergedAt) - Date.parse(a.startedAt)) / 60000)
        : null;
    const tests = Number(/Tests: (\d+) passed/.exec(a.tests || '')?.[1] || 0);
    const cost = D.liveBuild.costUsd;
    const tiles = [
        {
            v: `#${D.liveBuild.n}`,
            k: 'BUILD',
            c: `live since ${dayMon(D.liveBuild.activatesAt)}, 00:00 UTC`,
            col: C.text
        },
        {
            v: mins != null ? `${mins} MIN` : '—',
            k: 'VOTE CLOSED → MERGED',
            c: `${hms(a.startedAt).slice(0, 5)} → ${a.mergedAt ? hms(a.mergedAt).slice(0, 5) : '?'} UTC`,
            col: C.text
        },
        {
            v: tests ? `${tests} ✓` : 'ALL ✓',
            k: 'TESTS PASSED',
            c: 'plus smoke, determinism, a review pass',
            col: C.bull
        },
        {
            v: cost != null ? `$${cost.toFixed(2)}` : '—',
            k: 'COMPUTE, MEASURED',
            c: "Claude Code's own count",
            col: C.gold
        }
    ];
    const m = M(env);
    const cols = P ? 2 : 4;
    const gap = P ? 28 : 30;
    const tw = (W - 2 * m - gap * (cols - 1)) / cols;
    const th = P ? 400 : 360;
    const rowsN = Math.ceil(tiles.length / cols);
    const y0 = H / 2 - (rowsN * th + (rowsN - 1) * gap) / 2 + (P ? 60 : 30);
    text(ctx, `LAST NIGHT, BUILD #${D.liveBuild.n}:`, W / 2, y0 - (P ? 60 : 70), {
        kind: 'monoBold',
        px: P ? 28 : 30,
        color: C.muted,
        align: 'center',
        tracking: 6
    });
    tiles.forEach((tl, i) => {
        const st = slam(lt, i * 0.5 * BEAT, 0.18);
        if (!st.on) return;
        const cx = m + (i % cols) * (tw + gap);
        const cy = y0 + Math.floor(i / cols) * (th + gap);
        ctx.save();
        ctx.translate(cx + tw / 2, cy + th / 2);
        ctx.scale(st.scale, st.scale);
        ctx.translate(-(cx + tw / 2), -(cy + th / 2));
        ctx.globalAlpha = st.alpha;
        panel(ctx, cx, cy, tw, th, {
            fill: 'rgba(14,18,23,0.95)',
            stroke: i === 3 ? C.goldDark : C.line2
        });
        text(ctx, tl.k, cx + tw / 2, cy + 64, {
            kind: 'monoBold',
            px: P ? 20 : 20,
            color: C.muted,
            align: 'center',
            tracking: 3,
            maxW: tw - 30
        });
        text(ctx, tl.v, cx + tw / 2, cy + th * 0.63, {
            px: P ? 150 : 130,
            color: tl.col,
            align: 'center',
            shadow: 6,
            shadowColor: tl.col === C.bull ? C.bullDeep : tl.col === C.gold ? C.goldDeep : '#000',
            maxW: tw - 30
        });
        text(ctx, tl.c, cx + tw / 2, cy + th - 42, {
            kind: 'mono',
            px: P ? 18 : 19,
            color: C.text2,
            align: 'center',
            maxW: tw - 30
        });
        if (st.flash > 0) rect(ctx, cx, cy, tw, th, `rgba(255,255,255,${st.flash * 0.35})`);
        ctx.restore();
    });
}

// ---------------------------------------------------------------- 16–28 s: Day 0 → today

function modeChips(b, bounty) {
    if (b.mode === 'upstream')
        return [
            ['canvas-vampire-survivors v2.8.0', C.muted, true],
            ['MIT', C.muted, true]
        ];
    const chips = [];
    if (b.mode === 'agent') chips.push(['WRITTEN BY THE BUILD AGENT', C.bull]);
    else if (b.mode === 'bootstrap')
        chips.push(['WRITTEN BY THE AI', C.bull], ['IN A SESSION OSMAN STARTED', C.gold]);
    else if (b.mode === 'human') chips.push(['WRITTEN BY A HUMAN', C.text2]);
    chips.push(
        b.costUsd != null
            ? [`$${b.costUsd.toFixed(2)} MEASURED`, C.gold]
            : ['COST UNMETERED', C.muted, true]
    );
    if (bounty) chips.push([`AI BOUNTY: ${bounty.name.toUpperCase()}`, C.info]);
    return chips;
}

function evo(ctx, env, s, lt) {
    const { W, H, P, D } = env;
    const b = s.build;
    const live = b.n === D.liveBuild.n;
    const fr = footageAt(s, lt, env.meta);
    const img = fr ? env.frame(fr.shot, fr.frame) : null;
    cover(ctx, env, img, { zoom: 1.0 + 0.05 * (lt / 2) });
    if (b.n === 0) darken(ctx, env, 0.05);
    bottomShade(ctx, env, P ? 0.5 : 0.5, 0.94);

    // the pipeline, Day 0 → today, bottom right (the game's own HUD keeps the top)
    const m = M(env);
    const all = [D.builds[0], ...D.builds.slice(1).slice(-5)];
    const idx = all.findIndex((x) => x.n === b.n);
    const pw = P ? W - 2 * m : 660;
    const px0 = P ? m : W - m - pw;
    const py = P ? H - 430 : H - 118;
    const stepW = pw / (all.length - 1);
    rect(ctx, px0, py - 2, pw, 4, C.line2);
    rect(
        ctx,
        px0,
        py - 2,
        stepW * Math.max(0, idx - 1 + ease.outCubic(clamp(lt / 0.3))),
        4,
        C.bull
    );
    all.forEach((x, i) => {
        const cx = px0 + i * stepW;
        const on = i < idx || (i === idx && lt > 0.05);
        const cur = i === idx;
        const sz = cur ? 24 : 14;
        rect(ctx, cx - sz / 2, py - sz / 2, sz, sz, on ? (cur ? C.bull : C.bullDark) : C.ink);
        strokeRect(ctx, cx - sz / 2, py - sz / 2, sz, sz, on ? C.bull : C.line2, 2);
        text(ctx, x.n === 0 ? 'DAY 0' : `#${x.n}`, cx, py + (P ? 44 : 46), {
            kind: 'monoBold',
            px: P ? 19 : 19,
            color: cur ? C.bull : on ? C.text2 : C.dim,
            align: 'center',
            tracking: 2
        });
    });

    // lower third
    const label = b.n === 0 ? 'DAY 0' : `BUILD #${b.n}`;
    const date = dayMon(b.date);
    const lpx = P ? 150 : 170;
    const ly = P ? H - 590 : H - 230;
    const shown = lt < 0.2 ? scramble(label, lt / 0.2, b.n + 3) : label;
    const lw = slamText(ctx, env, lt, 0, shown, m, ly, {
        px: lpx,
        color: C.text,
        shadow: 8,
        shadowColor: '#000',
        align: 'left',
        dur: 0.16
    });
    const labelW = measure(ctx, label, 'display', lw || lpx);
    const dst = slam(lt, 0.08, 0.16);
    if (dst.on)
        text(ctx, date, m + labelW + 34, ly, {
            px: lpx * 0.5,
            color: C.bull,
            alpha: dst.alpha,
            shadow: 4,
            shadowColor: C.bullDeep
        });
    if (live) {
        const lst = slam(lt, 0.2, 0.16);
        if (lst.on)
            chip(ctx, 'LIVE NOW', m + labelW + 34, ly - lpx * 0.62, {
                px: P ? 20 : 22,
                color: C.ink,
                fill: C.bull,
                textColor: C.ink,
                alpha: lst.alpha
            });
    }
    const ttl = b.n === 0 ? 'The open-source game it started from' : b.title;
    text(ctx, typed(ttl, lt, 0.12, 90), m, ly + (P ? 70 : 66), {
        kind: 'monoBold',
        px: P ? 36 : 40,
        color: C.text,
        maxW: W - 2 * m
    });
    let cx = m;
    const cy = ly + (P ? 104 : 96);
    modeChips(b, live ? env.bounty : null).forEach(([str, col, dashed], i) => {
        const st = slam(lt, 0.25 + i * 0.08, 0.14);
        if (!st.on) return;
        if (P && cx + measure(ctx, str, 'monoBold', 20, 2) + 40 > W - m) return;
        cx +=
            chip(ctx, str, cx, cy, {
                px: P ? 18 : 20,
                color: col,
                dashed,
                alpha: st.alpha,
                fill: 'rgba(7,9,12,0.6)'
            }) + 14;
    });
}

function diff(ctx, env, s, lt) {
    const { W, H, P, D } = env;
    bg(ctx, env, lt, { trend: 1, chartAlpha: 0.18 });
    topBar(ctx, env);
    const m = M(env);
    const pw = P ? W - 2 * m : 1240;
    const ph = P ? 250 : 190;
    const px0 = (W - pw) / 2;
    const py = P ? 330 : 190;
    panel(ctx, px0, py, pw, ph, {
        title: '~/bearproof · git',
        titlePx: 17,
        fill: 'rgba(9,12,16,0.95)'
    });
    const cmd = '$ git diff --shortstat day-0..main -- game/';
    const tpx = P ? 26 : 30;
    const cmdLines = P ? ['$ git diff --shortstat', '    day-0..main -- game/'] : [cmd];
    let left = Math.floor(clamp(lt / (0.75 * BEAT)) * cmd.length);
    cmdLines.forEach((ln, i) => {
        const part = ln.slice(0, Math.max(0, left));
        left -= ln.length;
        text(ctx, part, px0 + 30, py + 100 + i * (tpx * 1.5), {
            kind: 'monoBold',
            px: tpx,
            color: C.text
        });
    });
    const out = ` ${D.git.gameFiles} files changed, ${D.git.gameInsertions} insertions(+)`;
    if (lt >= 0.9 * BEAT)
        text(ctx, out, px0 + 30, py + 100 + cmdLines.length * (tpx * 1.5), {
            kind: 'mono',
            px: tpx,
            color: C.bull,
            maxW: pw - 60
        });
    // the count-up
    const k = ease.outExpo(prog(lt, 1.0 * BEAT, 1.6 * BEAT));
    if (lt >= 1.0 * BEAT) {
        const n = Math.round(D.git.gameInsertions * k);
        const big = P ? 230 : 280;
        const cy = P ? H * 0.64 : H * 0.66;
        text(ctx, `+${fmtInt(n)}`, W / 2, cy, {
            px: big,
            color: C.bull,
            align: 'center',
            shadow: 12,
            shadowColor: C.bullDeep,
            glow: 40
        });
        const st = slam(lt, 1.5 * BEAT, 0.18);
        if (st.on) {
            text(ctx, 'LINES OF GAME CODE SINCE DAY 0', W / 2, cy + (P ? 100 : 110), {
                px: P ? 62 : 74,
                color: C.text,
                align: 'center',
                alpha: st.alpha,
                maxW: W - 2 * m
            });
            text(
                ctx,
                `${D.git.commits} commits since the fork, every one public on GitHub`,
                W / 2,
                cy + (P ? 160 : 172),
                {
                    kind: 'mono',
                    px: P ? 24 : 28,
                    color: C.muted,
                    align: 'center',
                    alpha: st.alpha,
                    maxW: W - 2 * m
                }
            );
        }
    }
    blackout(ctx, env, lt, 3.78 * BEAT);
}

// ---------------------------------------------------------------- 30–44 s: the game

function bull(ctx, env, s, lt) {
    const { W, H, P } = env;
    footage(ctx, env, s, lt, { zoom: 1.24 + 0.1 * (lt / 2) });
    topShade(ctx, env, 0.42, 0.85);
    bottomShade(ctx, env, 0.7, 0.6);
    const y = P ? 330 : 250;
    const a = 'YOU ARE A ';
    const bw = 'BULL.';
    const px = fit(ctx, a + bw, 'display', P ? 150 : 190, W - 2 * M(env));
    const wa = measure(ctx, a, 'display', px);
    const wb = measure(ctx, bw, 'display', px);
    const x0 = W / 2 - (wa + wb) / 2;
    slamText(ctx, env, lt, 0, a, x0, y, { px, color: C.text, align: 'left', shadow: 9 });
    slamText(ctx, env, lt, 0.1, bw, x0 + wa, y, {
        px,
        color: C.bull,
        align: 'left',
        shadow: 9,
        shadowColor: C.bullDeep,
        glow: 40
    });
    const st = slam(lt, 2 * BEAT, 0.2);
    if (st.on)
        text(ctx, 'Horns · 100 HP · one tap to play', W / 2, y + (P ? 80 : 90), {
            kind: 'monoBold',
            px: P ? 28 : 32,
            color: C.text2,
            align: 'center',
            tracking: 4,
            alpha: st.alpha
        });
}

function bears(ctx, env, s, lt) {
    const { W, H, P } = env;
    bg(ctx, env, lt, {
        trend: -1,
        chartAlpha: 0.4,
        glow: 'rgba(255,59,92,0.16)',
        gridColor: 'rgba(60,20,28,0.55)',
        chartY: 0.5
    });
    const px = P ? 132 : 150;
    const y1 = P ? 300 : 210;
    slamText(ctx, env, lt, 0, 'THE BEAR MARKET', W / 2, y1, { px, color: C.text, shadow: 8 });
    slamText(ctx, env, lt, 0.08, 'IS ENDLESS.', W / 2, y1 + px * 0.92, {
        px,
        color: C.bear,
        shadow: 8,
        shadowColor: C.bearDeep,
        glow: 30
    });
    const cast = s.cast;
    const E = env.content.ENEMIES;
    const names = Object.fromEntries(Object.values(E).map((e) => [e.id, e.name]));
    const perRow = P ? 4 : cast.length;
    const rowsN = Math.ceil(cast.length / perRow);
    const slotW = (W - 2 * M(env)) / perRow;
    const baseY = P ? H * 0.62 : H * 0.8;
    const rowH = P ? 420 : 0;
    // the ground
    rect(ctx, 0, baseY + 4, W, 3, 'rgba(255,59,92,0.35)');
    if (P && rowsN > 1) rect(ctx, 0, baseY + rowH + 4, W, 3, 'rgba(255,59,92,0.35)');
    cast.forEach((id, i) => {
        const t0 = (0.5 + i * 0.375) * BEAT;
        if (lt < t0) return;
        const row = Math.floor(i / perRow);
        const inRow = row === rowsN - 1 ? cast.length - row * perRow : perRow;
        const col = i % perRow;
        const cx = W / 2 + (col - (inRow - 1) / 2) * slotW;
        const y = baseY + row * rowH;
        const frames = env.sprite(id, 1);
        const h1 = frames ? frames[0].height : 16;
        const scale = Math.max(3, Math.floor((P ? 190 : 210) / h1));
        const k = ease.outBack(prog(lt, t0, 0.22), 2.2);
        const up = (1 - k) * 80;
        ctx.save();
        ctx.translate(cx, y);
        ctx.scale(k, k);
        ctx.translate(-cx, -y);
        drawSprite(ctx, env, id, scale, cx, y + up, { fps: 8, glow: true, time: env.t + i * 0.13 });
        ctx.restore();
        const nst = slam(lt, t0 + 0.06, 0.12);
        if (nst.on)
            text(ctx, (names[id] || id).toUpperCase(), cx, y + (P ? 52 : 56), {
                kind: 'monoBold',
                px: P ? 21 : 22,
                color: C.bearLight,
                align: 'center',
                tracking: 2,
                alpha: nst.alpha,
                maxW: slotW - 10
            });
    });
}

function arsenal(ctx, env, s, lt) {
    const { W, H, P } = env;
    footage(ctx, env, s, lt, { zoom: 1.06 });
    darken(ctx, env, 0.5);
    const b = lt / BEAT;
    const cur = [...s.items].reverse().find((it) => b >= it.b);
    if (!cur) return;
    const def = cur.passive
        ? Object.values(env.content.PASSIVES).find((p) => p.id === cur.id)
        : Object.values(env.content.WEAPONS).find((w) => w.id === cur.id);
    const t0 = cur.b * BEAT;
    const k = ease.outExpo(prog(lt, t0, 0.25));
    const slide = (1 - k) * 160;
    const risky = cur.id === 'leverage';
    const col = risky ? C.gold : C.bull;
    const iconScale = P ? 12 : 14;
    const ix = P ? W / 2 : M(env) + 170;
    const iy = P ? H * 0.42 : H / 2 + 80;
    ctx.save();
    ctx.globalAlpha = k;
    ctx.translate(slide, 0);
    const icon = env.icon(cur.id, iconScale);
    if (icon) {
        const g = ctx.createRadialGradient(
            ix,
            iy - icon[0].height / 2,
            0,
            ix,
            iy - icon[0].height / 2,
            260
        );
        g.addColorStop(0, risky ? 'rgba(255,197,61,0.35)' : 'rgba(22,224,138,0.35)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(ix - 300, iy - icon[0].height / 2 - 300, 600, 600);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(icon[0], Math.round(ix - icon[0].width / 2), Math.round(iy - icon[0].height));
    }
    const name = (def?.name || cur.id).toUpperCase();
    const desc = def?.description || '';
    if (P) {
        slamText(ctx, env, lt, t0, name, W / 2, iy + 190, {
            px: 140,
            color: col,
            shadow: 8,
            shadowColor: risky ? C.goldDeep : C.bullDeep,
            maxW: W - 2 * M(env)
        });
        wrap(ctx, desc, W - 2 * M(env), 'mono', 32).forEach((ln, i) =>
            text(ctx, ln, W / 2, iy + 270 + i * 46, {
                kind: 'mono',
                px: 32,
                color: C.text,
                align: 'center'
            })
        );
    } else {
        const tx = ix + 250;
        slamText(ctx, env, lt, t0, name, tx, iy - 40, {
            px: 170,
            color: col,
            shadow: 9,
            shadowColor: risky ? C.goldDeep : C.bullDeep,
            align: 'left',
            maxW: W - tx - M(env)
        });
        wrap(ctx, desc, W - tx - M(env), 'mono', 36).forEach((ln, i) =>
            text(ctx, ln, tx, iy + 30 + i * 50, { kind: 'mono', px: 36, color: C.text })
        );
    }
    ctx.restore();
    const pool = cur.passive ? env.content.PASSIVES : env.content.WEAPONS;
    const label = `${cur.passive ? 'PASSIVE' : 'WEAPON'} · ONE OF ${Object.keys(pool).length}`;
    text(ctx, label, P ? W / 2 : M(env), P ? 250 : 150, {
        kind: 'monoBold',
        px: 22,
        color: C.muted,
        tracking: 3,
        align: P ? 'center' : 'left'
    });
}

function brrr(ctx, env, s, lt) {
    const { P } = env;
    const b = lt / BEAT;
    const punch = b >= 1.5 && b < 3 ? 0.1 * Math.exp(-(lt - 1.5 * BEAT) * 5) : 0;
    const fr = footage(ctx, env, s, lt, {
        zoom: b < 3 ? 1.12 + punch : 1.2 + 0.1 * prog(lt, 3 * BEAT, BEAT),
        cy: b < 3 ? 0.5 : 0.42
    });
    topShade(ctx, env, 0.25, 0.7);
    const label =
        fr?.shot === 'levelup' ? 'LEVEL UP: PICK A CARD' : 'AIRDROP CRATES · SINCE BUILD #4';
    chip(ctx, label, P ? env.W / 2 : M(env), P ? 110 : 70, {
        px: P ? 20 : 22,
        align: P ? 'center' : 'left',
        color: fr?.shot === 'levelup' ? C.gold : C.bull,
        fill: 'rgba(7,9,12,0.7)'
    });
}

function hazard(ctx, env, y, h, t) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y, env.W, h);
    ctx.clip();
    rect(ctx, 0, y, env.W, h, C.bearDeep);
    ctx.fillStyle = C.bear;
    const s = h * 1.2;
    const off = (t * 240) % (s * 2);
    for (let x = -s * 2 - off; x < env.W + s * 2; x += s * 2) {
        ctx.beginPath();
        ctx.moveTo(x, y + h);
        ctx.lineTo(x + s, y);
        ctx.lineTo(x + s * 2, y);
        ctx.lineTo(x + s, y + h);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();
}

function boss(ctx, env, s, lt) {
    const { W, H, P } = env;
    const b = lt / BEAT;
    const fr = footageAt(s, lt, env.meta);
    if (!fr) {
        // the alarm before the Rug Lord
        const pulse = Math.floor(lt * 8) % 2 === 0;
        rect(ctx, 0, 0, W, H, pulse ? '#2A0710' : C.ink);
        grid(ctx, W, H, { step: 60, color: 'rgba(255,59,92,0.12)' });
        hazard(ctx, env, 0, P ? 70 : 60, lt);
        hazard(ctx, env, H - (P ? 70 : 60), P ? 70 : 60, -lt);
        slamText(ctx, env, lt, 0, 'BOSS INCOMING', W / 2, H / 2 + 40, {
            px: P ? 150 : 200,
            color: C.bear,
            shadow: 10,
            shadowColor: C.bearDeep,
            glow: 50,
            maxW: W - 2 * M(env)
        });
        text(ctx, '5:00 · 7:30 · 10:00 · 12:00', W / 2, H / 2 + (P ? 140 : 150), {
            kind: 'monoBold',
            px: P ? 28 : 32,
            color: C.bearLight,
            align: 'center',
            tracking: 6
        });
        return;
    }
    const start = fr.use.at * BEAT;
    const align = fr.use.align ? fr.use.align.b * BEAT : start;
    const since = lt - align;
    const punch = since >= 0 ? 0.12 * Math.exp(-since * 4) : 0;
    cover(ctx, env, env.frame(fr.shot, fr.frame), {
        zoom: 1.04 + punch + 0.03 * prog(lt, start, fr.use.dur * BEAT)
    });
    if (s.id === 'boss2') {
        const w = clamp((b - 3.5) / 0.5);
        if (w > 0) rect(ctx, 0, 0, W, H, `rgba(255,255,255,${w})`);
    }
}

// ---------------------------------------------------------------- 44–56 s: fund it, steer it, play it

function headline(ctx, env, lt, str, o = {}) {
    const { W, P } = env;
    const px = o.px || (P ? 150 : 150);
    const y = o.y ?? (P ? 300 : 200);
    const parts = str.split('|');
    if (parts.length === 1) {
        slamText(ctx, env, lt, o.t0 || 0, str, o.x ?? W / 2, y, {
            px,
            color: o.color || C.text,
            shadow: 8,
            shadowColor: o.shadowColor || '#000',
            align: o.align || 'center',
            maxW: W - 2 * M(env)
        });
        return;
    }
    // two colours on one line: "YOU |FUND| IT."
    const ws = parts.map((p) => measure(ctx, p, 'display', px));
    let x = (o.x ?? W / 2) - (o.align === 'left' ? 0 : ws.reduce((a, b) => a + b, 0) / 2);
    parts.forEach((p, i) => {
        const hl = i % 2 === 1;
        slamText(ctx, env, lt, (o.t0 || 0) + i * 0.04, p, x, y, {
            px,
            color: hl ? o.hl || C.bull : C.text,
            shadow: 8,
            shadowColor: hl ? C.bullDeep : '#000',
            glow: hl ? 30 : 0,
            align: 'left'
        });
        x += ws[i];
    });
}

function fund(ctx, env, s, lt) {
    const { W, H, P, D } = env;
    bg(ctx, env, lt, { trend: 1, chartAlpha: 0.18 });
    topBar(ctx, env);
    headline(ctx, env, lt, 'YOU |FUND| IT.', { y: P ? 290 : 220 });
    const m = M(env);
    // the loop: trades → creator fees → the AI's public wallet
    const nodes = ['TRADES', 'CREATOR FEES', "THE AI'S WALLET"];
    const k = ease.outCubic(prog(lt, 0.4 * BEAT, 0.3));
    const nw = P ? 300 : 380;
    const nh = P ? 96 : 110;
    const gapX = P ? 0 : (W - 2 * m - nw * 3) / 2;
    const pos = nodes.map((_, i) =>
        P ? [W / 2 - nw / 2, 420 + i * (nh + 80)] : [m + i * (nw + gapX), 330]
    );
    ctx.save();
    ctx.globalAlpha = k;
    pos.forEach(([x, y], i) => {
        panel(ctx, x, y, nw, nh, {
            fill: i === 2 ? 'rgba(6,77,47,0.5)' : 'rgba(14,18,23,0.95)',
            stroke: i === 2 ? C.bull : C.line2
        });
        text(ctx, nodes[i], x + nw / 2, y + nh / 2 + 16, {
            px: P ? 48 : 54,
            color: i === 2 ? C.bull : C.text,
            align: 'center',
            maxW: nw - 30
        });
        if (i < 2) {
            const [x2, y2] = pos[i + 1];
            const ax = P ? x + nw / 2 : x + nw + 14;
            const ay = P ? y + nh + 12 : y + nh / 2;
            const bx = P ? x2 + nw / 2 : x2 - 14;
            const by = P ? y2 - 12 : y2 + nh / 2;
            ctx.strokeStyle = C.bullDark;
            ctx.lineWidth = 4;
            ctx.setLineDash([10, 10]);
            ctx.lineDashOffset = -env.t * 60;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.stroke();
            ctx.setLineDash([]);
            // tokens flowing
            for (let j = 0; j < 3; j++) {
                const p = (env.t * 0.9 + j / 3) % 1;
                rect(ctx, lerp(ax, bx, p) - 7, lerp(ay, by, p) - 7, 14, 14, C.gold);
            }
        }
    });
    text(
        ctx,
        `wallet ${shortTx(D.treasury.wallet)} · read from chain`,
        pos[2][0] + nw / 2,
        pos[2][1] + nh + 40,
        {
            kind: 'mono',
            px: P ? 22 : 22,
            color: C.muted,
            align: 'center'
        }
    );
    ctx.restore();
    // the latest fee claims, from the ledger
    const fees = D.ledger.rows.filter((r) => r.cat === 'creator_fees').slice(0, 4);
    const fx = P ? m : m + 60;
    const fy = P ? 1010 : 640;
    const fw = W - 2 * fx;
    const rowH = P ? 64 : 56;
    fees.forEach((r, i) => {
        const t0 = (0.75 + i * 0.25) * BEAT;
        const st = slam(lt, t0, 0.14);
        if (!st.on) return;
        const y = fy + i * rowH;
        ctx.save();
        ctx.globalAlpha = st.alpha;
        rect(ctx, fx, y, fw, rowH - 8, 'rgba(14,18,23,0.9)');
        rect(ctx, fx, y, 5, rowH - 8, C.bull);
        const px = P ? 22 : 26;
        const my = y + (rowH - 8) / 2 + px * 0.36;
        text(ctx, `+${r.sol.toFixed(4)} SOL`, fx + 24, my, { kind: 'monoBold', px, color: C.bull });
        text(
            ctx,
            P ? 'creator fees' : `creator fees · ${dayMon(r.ts)} ${hms(r.ts).slice(0, 5)} UTC`,
            fx + (P ? 250 : 300),
            my,
            { kind: 'mono', px, color: C.text2 }
        );
        text(ctx, `tx ${shortTx(r.tx)}`, fx + fw - 24, my, {
            kind: 'mono',
            px,
            color: C.muted,
            align: 'right'
        });
        ctx.restore();
    });
    const st = slam(lt, 2 * BEAT, 0.2);
    if (st.on) {
        const y = fy + fees.length * rowH + (P ? 50 : 40);
        text(
            ctx,
            `${D.ledger.feeClaims} fee claims so far, ${D.ledger.feesSol.toFixed(2)} SOL, every one on Solscan.`,
            W / 2,
            y,
            {
                kind: 'monoBold',
                px: P ? 24 : 26,
                color: C.text,
                align: 'center',
                alpha: st.alpha,
                maxW: W - 2 * m
            }
        );
        wrap(
            ctx,
            'Compute and hosting are billed off-chain. Paying them back from the treasury is paused until a costs wallet is set.',
            W - 2 * m,
            'mono',
            P ? 20 : 21
        ).forEach((ln, i) =>
            text(ctx, ln, W / 2, y + (P ? 44 : 40) + i * 30, {
                kind: 'mono',
                px: P ? 20 : 21,
                color: C.muted,
                align: 'center',
                alpha: st.alpha
            })
        );
    }
}

function steer(ctx, env, s, lt) {
    const { W, H, P, D } = env;
    bg(ctx, env, lt, { trend: 0, chartAlpha: 0.12 });
    topBar(ctx, env);
    headline(ctx, env, lt, 'YOU |STEER| IT.', { y: P ? 290 : 200 });
    const m = M(env);
    const v = D.vote;
    const st0 = slam(lt, 0.25 * BEAT, 0.16);
    if (st0.on)
        text(
            ctx,
            `The ballot for Build #${v.forBuild}: holders vote, the AI builds the winner.`,
            W / 2,
            P ? 380 : 285,
            {
                kind: 'monoBold',
                px: P ? 24 : 28,
                color: C.gold,
                align: 'center',
                alpha: st0.alpha,
                maxW: W - 2 * m
            }
        );
    const props = v.proposals.slice(0, 3);
    const cw = P ? W - 2 * m : (W - 2 * m - 2 * 36) / 3;
    const ch = P ? 300 : 420;
    props.forEach((p, i) => {
        const t0 = (0.5 + i * 0.25) * BEAT;
        const k = ease.outExpo(prog(lt, t0, 0.3));
        if (lt < t0) return;
        const x = P ? m : m + i * (cw + 36);
        const y = (P ? 450 + i * (ch + 30) : 350) + (1 - k) * 120;
        ctx.save();
        ctx.globalAlpha = k;
        panel(ctx, x, y, cw, ch, { fill: 'rgba(14,18,23,0.96)', stroke: C.line2 });
        text(ctx, `OPTION ${String.fromCharCode(65 + i)}`, x + 30, y + 52, {
            kind: 'monoBold',
            px: 18,
            color: C.muted,
            tracking: 4
        });
        text(ctx, p.title.toUpperCase(), x + 30, y + (P ? 126 : 132), {
            px: P ? 76 : 80,
            color: C.text,
            maxW: cw - 60,
            shadow: 5
        });
        const lines = wrap(ctx, p.description, cw - 60, 'mono', P ? 21 : 22).slice(0, P ? 4 : 7);
        lines.forEach((ln, j) =>
            text(ctx, ln, x + 30, y + (P ? 176 : 186) + j * (P ? 30 : 33), {
                kind: 'mono',
                px: P ? 21 : 22,
                color: C.text2
            })
        );
        ctx.restore();
    });
    const st = slam(lt, 1.75 * BEAT, 0.18);
    if (st.on) {
        const y = P ? H - 190 : H - 120;
        text(ctx, 'Sign a message to vote. No transaction. Weight = √tokens.', W / 2, y, {
            kind: 'monoBold',
            px: P ? 23 : 26,
            color: C.text,
            align: 'center',
            alpha: st.alpha,
            maxW: W - 2 * m
        });
        text(
            ctx,
            'Anyone can drop an idea in the box, no wallet needed. The AI reads them all.',
            W / 2,
            y + (P ? 42 : 44),
            {
                kind: 'mono',
                px: P ? 21 : 23,
                color: C.muted,
                align: 'center',
                alpha: st.alpha,
                maxW: W - 2 * m
            }
        );
    }
}

function phone(ctx, env, img, x, y, w, h) {
    const r = w * 0.12;
    ctx.save();
    ctx.shadowColor = 'rgba(22,224,138,0.35)';
    ctx.shadowBlur = 60;
    ctx.fillStyle = '#0B0E12';
    ctx.beginPath();
    ctx.roundRect(x - 16, y - 16, w + 32, h + 32, r + 12);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#2A3441';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.clip();
    cover(ctx, env, img, { x, y, w, h });
    ctx.restore();
    // the island
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.roundRect(x + w / 2 - w * 0.16, y + 14, w * 0.32, w * 0.075, w * 0.04);
    ctx.fill();
}

function play(ctx, env, s, lt) {
    const { W, H, P } = env;
    bg(ctx, env, lt, { trend: 1, chartAlpha: 0.2, glow: 'rgba(22,224,138,0.1)', glowY: 0.5 });
    topBar(ctx, env);
    const m = M(env);
    const fr = footageAt(s, lt, env.meta);
    const img = fr ? env.frame(fr.shot, fr.frame) : null;
    const k = ease.outExpo(prog(lt, 0.25 * BEAT, 0.45));
    const bullets = [
        ['Free, in any browser. One tap.', 1],
        ['No wallet. No signup.', 1.25],
        ['Same Daily Challenge for everyone.', 1.5]
    ];
    if (P) {
        headline(ctx, env, lt, 'YOU |PLAY| IT.', { y: 260 });
        const pw = 470;
        const ph = pw * (844 / 390);
        phone(ctx, env, img, W / 2 - pw / 2, 330 + (1 - k) * 900, pw, ph);
        bullets.forEach(([str, b], i) => {
            const st = slam(lt, b * BEAT, 0.14);
            if (st.on)
                text(ctx, `✓ ${str}`, W / 2, H - 250 + i * 52, {
                    kind: 'monoBold',
                    px: 30,
                    color: i === 1 ? C.bull : C.text,
                    align: 'center',
                    alpha: st.alpha
                });
        });
    } else {
        headline(ctx, env, lt, 'YOU |PLAY| IT.', { y: 400, x: m, align: 'left', px: 170 });
        const ph = H - 190;
        const pw = ph * (390 / 844);
        phone(ctx, env, img, W - m - pw - 60 + (1 - k) * 800, 120, pw, ph);
        bullets.forEach(([str, b], i) => {
            const st = slam(lt, b * BEAT, 0.14);
            if (!st.on) return;
            text(ctx, '✓', m, 530 + i * 76, {
                kind: 'monoBold',
                px: 42,
                color: C.bull,
                alpha: st.alpha
            });
            text(ctx, str, m + 60, 530 + i * 76, {
                kind: 'monoBold',
                px: 42,
                color: C.text,
                alpha: st.alpha
            });
        });
        const st = slam(lt, 2 * BEAT, 0.2);
        if (st.on)
            text(ctx, "Today's challenge runs on today's build, until 00:00 UTC.", m, 800, {
                kind: 'mono',
                px: 26,
                color: C.muted,
                alpha: st.alpha
            });
    }
}

function verify(ctx, env, s, lt) {
    const { W, H, P } = env;
    bg(ctx, env, lt, { chart: false });
    topBar(ctx, env);
    const m = M(env);
    const px = P ? 104 : 118;
    slamText(ctx, env, lt, 0, 'EVERY SCORE IS', W / 2, P ? 280 : 200, {
        px,
        color: C.text,
        shadow: 7
    });
    slamText(ctx, env, lt, 0.06, 'REPLAYED ON THE SERVER.', W / 2, (P ? 280 : 200) + px * 0.95, {
        px,
        color: C.info,
        shadow: 7,
        shadowColor: C.infoDark,
        maxW: W - 2 * m
    });
    const y0 = P ? 560 : 440;
    const rowH = P ? 190 : 100;
    s.rows.forEach((r, i) => {
        const t0 = (0.75 + i * 0.25) * BEAT;
        const st = slam(lt, t0, 0.14);
        if (!st.on) return;
        const ok = r.kind !== 'rejected';
        const y = y0 + i * rowH;
        const col = ok ? C.bull : C.bear;
        ctx.save();
        ctx.globalAlpha = st.alpha;
        rect(ctx, m, y, W - 2 * m, rowH - 16, ok ? 'rgba(6,77,47,0.25)' : 'rgba(94,10,31,0.35)');
        rect(ctx, m, y, 6, rowH - 16, col);
        const tpx = P ? 24 : 27;
        const chipW = P ? 0 : 230;
        const lines = P
            ? wrap(ctx, r.text, W - 2 * m - 60, 'mono', tpx).slice(0, 3)
            : [ellipsize(ctx, r.text, W - 2 * m - chipW - 90, 'mono', tpx)];
        lines.forEach((ln, j) =>
            text(ctx, ln, m + 30, y + (P ? 44 : (rowH - 16) / 2 + tpx * 0.36) + j * 38, {
                kind: 'mono',
                px: tpx,
                color: C.text
            })
        );
        chip(
            ctx,
            ok ? '✓ VERIFIED' : '✗ REJECTED',
            P ? m + 30 : W - m - 24,
            P ? y + rowH - 70 : y + (rowH - 16) / 2 - 20,
            {
                px: 20,
                align: P ? 'left' : 'right',
                color: col,
                fill: 'rgba(7,9,12,0.6)',
                h: 40
            }
        );
        ctx.restore();
    });
}

function prize(ctx, env, s, lt) {
    const { W, H, P, D } = env;
    bg(ctx, env, lt, { trend: 1, chartAlpha: 0.14, glow: 'rgba(255,197,61,0.12)' });
    topBar(ctx, env);
    const m = M(env);
    const px = P ? 112 : 128;
    slamText(ctx, env, lt, 0, 'WINNERS GET PAID', W / 2, P ? 280 : 200, {
        px,
        color: C.text,
        shadow: 7
    });
    slamText(ctx, env, lt, 0.06, 'IN $ANSEM.', W / 2, (P ? 280 : 200) + px * 0.95, {
        px,
        color: C.gold,
        shadow: 7,
        shadowColor: C.goldDeep,
        glow: 30
    });
    const y0 = P ? 560 : 450;
    const rowH = P ? 200 : 120;
    s.prizes.forEach((p, i) => {
        const t0 = (0.75 + i * 0.5) * BEAT;
        const k = ease.outExpo(prog(lt, t0, 0.3));
        if (lt < t0) return;
        const y = y0 + i * rowH;
        ctx.save();
        ctx.globalAlpha = k;
        ctx.translate((1 - k) * -120, 0);
        panel(ctx, m, y, W - 2 * m, rowH - 20, { fill: 'rgba(14,18,23,0.95)', stroke: C.goldDark });
        // a coin
        const cx = m + 70;
        const cy = y + (rowH - 20) / 2;
        ctx.fillStyle = C.gold;
        ctx.beginPath();
        ctx.arc(cx, cy, 32, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = C.goldDark;
        ctx.beginPath();
        ctx.arc(cx, cy, 22, 0, Math.PI * 2);
        ctx.fill();
        text(ctx, '$', cx, cy + 12, { px: 40, color: C.gold, align: 'center' });
        const amount = `${p.ansem.toFixed(2)} $ANSEM`;
        if (P) {
            text(ctx, amount, m + 130, y + 70, { px: 70, color: C.gold });
            text(ctx, `Daily Challenge winner · ${dayMon(p.day)}`, m + 130, y + 112, {
                kind: 'mono',
                px: 22,
                color: C.text2,
                maxW: W - 2 * m - 160
            });
            text(ctx, `tx ${shortTx(p.tx)} · paid`, m + 130, y + 146, {
                kind: 'mono',
                px: 20,
                color: C.muted
            });
        } else {
            text(ctx, amount, m + 140, cy + 26, { px: 84, color: C.gold });
            text(ctx, `Daily Challenge winner · ${dayMon(p.day)}`, m + 640, cy + 10, {
                kind: 'mono',
                px: 26,
                color: C.text2,
                maxW: W - m - 640 - 250
            });
            chip(ctx, `PAID · ${shortTx(p.tx)}`, W - m - 30, cy - 20, {
                px: 20,
                align: 'right',
                color: C.bull,
                h: 40
            });
        }
        ctx.restore();
    });
    const st = slam(lt, 2.25 * BEAT, 0.2);
    if (st.on) {
        const lines = wrap(
            ctx,
            'Bought through Jupiter and sent on-chain by the Worker. Free to play: holding $BPROOF is never required.',
            W - 2 * m,
            'mono',
            P ? 22 : 24
        );
        lines.forEach((ln, i) =>
            text(ctx, ln, W / 2, (P ? H - 200 : H - 110) + i * 34, {
                kind: 'mono',
                px: P ? 22 : 24,
                color: C.muted,
                align: 'center',
                alpha: st.alpha
            })
        );
    }
}

function receipts(ctx, env, s, lt) {
    const { W, H, P } = env;
    bg(ctx, env, lt, { chart: false });
    topBar(ctx, env);
    const m = M(env);
    const px = P ? 104 : 120;
    slamText(ctx, env, lt, 0, 'RECEIPTS', W / 2, P ? 280 : 190, { px, color: C.text, shadow: 7 });
    slamText(ctx, env, lt, 0.06, 'FOR EVERYTHING.', W / 2, (P ? 280 : 190) + px * 0.95, {
        px,
        color: C.bull,
        shadow: 7,
        shadowColor: C.bullDeep,
        glow: 26
    });
    const x = m;
    const y = P ? 520 : 410;
    const w = W - 2 * m;
    const h = P ? H - y - 200 : H - y - 110;
    panel(ctx, x, y, w, h, {
        title: 'THE PUBLIC LEDGER · READ FROM CHAIN',
        titleRight: P ? '' : 'bearproof.app/#receipts',
        titleRightW: P ? 0 : 300,
        fill: 'rgba(9,12,16,0.95)'
    });
    const rowH = P ? 76 : 50;
    const tpx = P ? 21 : 23;
    const inner = y + 60;
    const innerH = h - 70;
    const speed = rowH / (0.25 * BEAT); // a row every 16th
    const scroll = Math.max(0, (lt - 0.4 * BEAT) * speed);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 4, inner, w - 8, innerH);
    ctx.clip();
    s.rows.forEach((r, i) => {
        const yy = inner + 30 + i * rowH - scroll + innerH * 0.4;
        if (yy < inner - rowH || yy > inner + innerH + rowH) return;
        const inCol = r.dir === 'in' ? C.bull : r.cat === 'prize' ? C.gold : C.bear;
        if (P) {
            text(ctx, `${r.dir === 'in' ? '▲' : '▼'} ${r.amount}`, x + 24, yy, {
                kind: 'monoBold',
                px: tpx,
                color: inCol
            });
            text(ctx, `tx ${r.tx}`, x + w - 24, yy, {
                kind: 'mono',
                px: tpx - 2,
                color: C.muted,
                align: 'right'
            });
            text(ctx, `${dayMon(r.ts)} ${hms(r.ts).slice(0, 5)} · ${r.what}`, x + 24, yy + 32, {
                kind: 'mono',
                px: tpx - 3,
                color: C.text2,
                maxW: w - 48
            });
        } else {
            text(ctx, `${dayMon(r.ts)} ${hms(r.ts).slice(0, 5)}`, x + 24, yy, {
                kind: 'mono',
                px: tpx,
                color: C.dim
            });
            text(ctx, r.dir === 'in' ? '▲ IN ' : '▼ OUT', x + 250, yy, {
                kind: 'monoBold',
                px: tpx,
                color: inCol
            });
            text(ctx, r.what, x + 380, yy, { kind: 'mono', px: tpx, color: C.text2, maxW: 640 });
            text(ctx, r.amount, x + 1210, yy, {
                kind: 'monoBold',
                px: tpx,
                color: inCol,
                align: 'right'
            });
            text(ctx, `tx ${r.tx}`, x + w - 24, yy, {
                kind: 'mono',
                px: tpx,
                color: C.muted,
                align: 'right'
            });
        }
        rect(ctx, x + 16, yy + (P ? 48 : 18), w - 32, 1, 'rgba(42,52,65,0.6)');
    });
    ctx.restore();
    // fade the top and bottom of the list
    const g1 = ctx.createLinearGradient(0, inner, 0, inner + 80);
    g1.addColorStop(0, 'rgba(9,12,16,1)');
    g1.addColorStop(1, 'rgba(9,12,16,0)');
    ctx.fillStyle = g1;
    ctx.fillRect(x + 4, inner, w - 8, 80);
    const g2 = ctx.createLinearGradient(0, inner + innerH - 80, 0, inner + innerH);
    g2.addColorStop(0, 'rgba(9,12,16,0)');
    g2.addColorStop(1, 'rgba(9,12,16,1)');
    ctx.fillStyle = g2;
    ctx.fillRect(x + 4, inner + innerH - 80, w - 8, 80);
    text(
        ctx,
        'Every build is in git. Every SOL in and out is on-chain.',
        W / 2,
        P ? H - 130 : H - 50,
        {
            kind: 'monoBold',
            px: P ? 24 : 26,
            color: C.text,
            align: 'center',
            maxW: W - 2 * m
        }
    );
}

function tonight(ctx, env, s, lt) {
    const { W, H, P, D } = env;
    bg(ctx, env, lt, { trend: 1, glow: 'rgba(22,224,138,0.12)' });
    topBar(ctx, env);
    const next = D.liveBuild.n + 1;
    const px = P ? 230 : 280;
    const cy = H / 2 - (P ? 60 : 40);
    slamText(ctx, env, lt, 0, `BUILD #${next}`, W / 2, cy, {
        px,
        color: C.bull,
        shadow: 12,
        shadowColor: C.bullDeep,
        glow: 50
    });
    slamText(ctx, env, lt, 0.75 * BEAT, 'SHIPS AT 00:00 UTC.', W / 2, cy + px * 0.55, {
        px: px * 0.42,
        color: C.text,
        shadow: 6,
        maxW: W - 2 * M(env)
    });
    const line = P
        ? 'Watch the AI write it, live from 21:00 UTC'
        : 'Watch the AI write it, live from 21:00 UTC → bearproof.app/live';
    text(ctx, typed(line, lt, 1.25 * BEAT, 75), W / 2, cy + px * 0.55 + (P ? 90 : 100), {
        kind: 'mono',
        px: P ? 28 : 34,
        color: C.text2,
        align: 'center',
        maxW: W - 2 * M(env)
    });
    if (P && lt > 2 * BEAT)
        text(ctx, 'bearproof.app/live', W / 2, cy + px * 0.55 + 150, {
            kind: 'monoBold',
            px: 30,
            color: C.bull,
            align: 'center'
        });
    blackout(ctx, env, lt, 3.78 * BEAT);
}

function end(ctx, env, s, lt) {
    const { W, H, P, D } = env;
    const fr = footageAt(s, lt, env.meta);
    rect(ctx, 0, 0, W, H, C.ink);
    if (fr) blurred(ctx, env, env.frame(fr.shot, fr.frame), { k: 10, alpha: 0.55, zoom: 1.1 });
    darken(ctx, env, 0.55);
    grid(ctx, W, H, { step: 60, ox: env.t * 12, color: 'rgba(22,224,138,0.07)' });
    const g = ctx.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, Math.max(W, H) * 0.55);
    g.addColorStop(0, 'rgba(22,224,138,0.2)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const m = M(env);
    const px = P ? 210 : 270;
    const ly = P ? H * 0.42 : H * 0.43;
    // bull on top of the logo
    const k = ease.outBack(prog(lt, 0.05, 0.4), 1.6);
    const scale = P ? 8 : 7;
    ctx.save();
    ctx.translate(W / 2, ly - px * 0.8);
    ctx.scale(k, k);
    ctx.translate(-W / 2, -(ly - px * 0.8));
    drawSprite(ctx, env, 'bull', scale, W / 2, ly - px * 0.8, { fps: 8, glow: true });
    ctx.restore();
    // shockwave
    if (lt < 0.6) {
        ctx.save();
        ctx.strokeStyle = `rgba(22,224,138,${0.6 * (1 - lt / 0.6)})`;
        ctx.lineWidth = 14 * (1 - lt / 0.6) + 2;
        ctx.beginPath();
        ctx.arc(
            W / 2,
            ly - px * 0.3,
            ease.outCubic(lt / 0.6) * Math.max(W, H) * 0.7,
            0,
            Math.PI * 2
        );
        ctx.stroke();
        ctx.restore();
    }
    slamText(ctx, env, lt, 0, 'BEARPROOF', W / 2, ly, {
        px,
        color: C.bull,
        shadow: Math.round(px * 0.045),
        shadowColor: C.bullDeep,
        glow: 50,
        maxW: W - 2 * m,
        dur: 0.24
    });
    // "Are you bearproof?"
    const q1 = 'ARE YOU ';
    const q2 = 'BEARPROOF?';
    const qpx = P ? 84 : 92;
    const qy = ly + (P ? 120 : 130);
    const w1 = measure(ctx, q1, 'display', qpx);
    const w2 = measure(ctx, q2, 'display', qpx);
    slamText(ctx, env, lt, 2 * BEAT, q1, W / 2 - (w1 + w2) / 2, qy, {
        px: qpx,
        color: C.text,
        align: 'left',
        shadow: 5
    });
    slamText(ctx, env, lt, 2 * BEAT + 0.06, q2, W / 2 - (w1 + w2) / 2 + w1, qy, {
        px: qpx,
        color: C.bull,
        align: 'left',
        shadow: 5,
        shadowColor: C.bullDeep
    });
    // call to action
    const cst = slam(lt, 4 * BEAT, 0.2);
    if (cst.on) {
        const bw = P ? 700 : 600;
        const bh = P ? 124 : 106;
        const by = qy + (P ? 190 : 142);
        ctx.save();
        ctx.globalAlpha = cst.alpha;
        ctx.translate(W / 2, by);
        ctx.scale(cst.scale, cst.scale);
        ctx.translate(-W / 2, -by);
        button(ctx, 'PLAY FREE ▸', W / 2, by, bw, bh, { px: bh * 0.66 });
        ctx.restore();
        text(ctx, 'bearproof.app', W / 2, by + bh / 2 + (P ? 90 : 78), {
            kind: 'monoBold',
            px: P ? 46 : 46,
            color: C.text,
            align: 'center',
            alpha: cst.alpha,
            tracking: 2
        });
        text(ctx, 'No wallet. No signup. On your phone.', W / 2, by + bh / 2 + (P ? 140 : 120), {
            kind: 'mono',
            px: P ? 28 : 28,
            color: C.text2,
            align: 'center',
            alpha: cst.alpha
        });
    }
    const fst = slam(lt, 5 * BEAT, 0.3);
    if (fst.on) {
        const foot = P
            ? ['$BPROOF on Solana · a new build every day at 00:00 UTC', 'built in public by an AI']
            : ['$BPROOF on Solana · a new build every day at 00:00 UTC · built in public by an AI'];
        const fy = P ? H - 200 : H - 92;
        foot.forEach((ln, i) =>
            text(ctx, ln, W / 2, fy + i * 30, {
                kind: 'monoBold',
                px: 20,
                color: C.muted,
                align: 'center',
                tracking: 1,
                alpha: fst.alpha,
                maxW: W - 2 * m
            })
        );
        const small = `Real footage from each shipped build, played by the game's own autopilot (kept alive for the camera). Build #0 is ricardo-foundry/canvas-vampire-survivors (MIT). Music and sound made in code. Numbers as of ${dayMon(D.fetchedAt)} ${D.fetchedAt.slice(11, 16)} UTC.`;
        const sy = P ? H - 120 : H - 50;
        wrap(ctx, small, W - 2 * m, 'mono', P ? 15 : 15).forEach((ln, i) =>
            text(ctx, ln, W / 2, sy + i * 21, {
                kind: 'mono',
                px: 15,
                color: C.dim,
                align: 'center',
                alpha: fst.alpha
            })
        );
    }
}

// ---------------------------------------------------------------- registry

export const SCENES = {
    hook1: hook,
    hook2: hook,
    hook3: hook,
    clock,
    title,
    agent,
    stats,
    evo,
    diff,
    bull,
    bears,
    arsenal,
    brrr,
    boss0: boss,
    boss1: boss,
    boss2: boss,
    fund,
    steer,
    play,
    verify,
    prize,
    receipts,
    tonight,
    end
};

export function drawScene(ctx, env, s, lt) {
    const fn = s.kind === 'evo' ? evo : SCENES[s.id];
    fn(ctx, env, s, lt);
}
