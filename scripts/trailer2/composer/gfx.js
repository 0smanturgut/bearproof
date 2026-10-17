// Drawing helpers for the trailer: the HQ's "Terminal Arcade" look on a canvas. Colours are the game's palette.

export const C = {
    ink: '#07090C',
    panel: '#0E1217',
    panel2: '#141A21',
    line: '#1B222B',
    line2: '#2A3441',
    text: '#E8EDF2',
    text2: '#B8C2CE',
    muted: '#7D8896',
    dim: '#4A5461',
    bull: '#16E08A',
    bullLight: '#7DFFC0',
    bullDark: '#0A8F55',
    bullDeep: '#064D2F',
    bear: '#FF3B5C',
    bearLight: '#FF8FA3',
    bearDark: '#B3173A',
    bearDeep: '#5E0A1F',
    gold: '#FFC53D',
    goldDark: '#B07A00',
    goldDeep: '#4A3300',
    info: '#46C8FF',
    infoDark: '#1C7DB8',
    white: '#FFFFFF'
};

export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
/** 0→1 progress of t through [t0, t0 + dur]. */
export const prog = (t, t0, dur) => clamp((t - t0) / dur);

export const ease = {
    linear: (x) => x,
    inCubic: (x) => x * x * x,
    outCubic: (x) => 1 - (1 - x) ** 3,
    outQuint: (x) => 1 - (1 - x) ** 5,
    outExpo: (x) => (x >= 1 ? 1 : 1 - 2 ** (-10 * x)),
    inExpo: (x) => (x <= 0 ? 0 : 2 ** (10 * x - 10)),
    inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2),
    outBack: (x, s = 1.9) => 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2,
    outElastic: (x) =>
        x <= 0
            ? 0
            : x >= 1
              ? 1
              : 2 ** (-10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1
};

/** Deterministic hash noise in [0, 1). */
export function hash(...n) {
    let h = 2166136261;
    for (const v of n) {
        h ^= Math.floor(v * 1000) | 0;
        h = Math.imul(h, 16777619);
        h ^= h >>> 13;
        h = Math.imul(h, 0x5bd1e995);
        h ^= h >>> 15;
    }
    return (h >>> 0) / 4294967296;
}

export function rng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ---------------------------------------------------------------- text

export const FONT = {
    display: (px) => `400 ${px}px "Jersey 10"`,
    mono: (px) => `400 ${px}px "JetBrains Mono"`,
    monoBold: (px) => `700 ${px}px "JetBrains Mono"`
};

export function setFont(ctx, kind, px, tracking = 0) {
    ctx.font = FONT[kind](Math.round(px));
    ctx.letterSpacing = `${tracking}px`;
}

/** Largest size ≤ px at which `str` fits in maxW. */
export function fit(ctx, str, kind, px, maxW, tracking = 0) {
    setFont(ctx, kind, px, tracking);
    const w = ctx.measureText(str).width;
    if (w <= maxW) return px;
    return Math.max(8, Math.floor(px * (maxW / w)));
}

export function measure(ctx, str, kind, px, tracking = 0) {
    setFont(ctx, kind, px, tracking);
    return ctx.measureText(str).width;
}

/**
 * Text with the HQ's hard pixel shadow and an optional glow.
 * o: { kind, px, color, align, baseline, shadow, shadowColor, glow, alpha, tracking, maxW }
 */
export function text(ctx, str, x, y, o = {}) {
    const kind = o.kind || 'display';
    let px = o.px || 64;
    if (o.maxW) px = fit(ctx, str, kind, px, o.maxW, o.tracking || 0);
    setFont(ctx, kind, px, o.tracking || 0);
    ctx.textAlign = o.align || 'left';
    ctx.textBaseline = o.baseline || 'alphabetic';
    ctx.save();
    ctx.globalAlpha *= o.alpha ?? 1;
    if (o.shadow) {
        ctx.fillStyle = o.shadowColor || '#000';
        ctx.fillText(str, x + o.shadow, y + o.shadow);
    }
    if (o.glow) {
        ctx.shadowColor = o.glowColor || o.color || C.bull;
        ctx.shadowBlur = o.glow;
    }
    ctx.fillStyle = o.color || C.text;
    ctx.fillText(str, x, y);
    ctx.restore();
    return px;
}

/** Characters settle left to right from random glyphs (a terminal "decode"). */
export function scramble(str, p, seed = 1) {
    const glyphs = '#$%&*+<>?/\\|=_-01ABCDEFGHJKLMNPQRSTUVWXYZ';
    const n = str.length;
    let out = '';
    for (let i = 0; i < n; i++) {
        const ch = str[i];
        const settle = (i / Math.max(1, n)) * 0.7;
        if (ch === ' ' || p >= settle + 0.3) out += ch;
        else if (p < settle)
            out +=
                p > settle - 0.25
                    ? glyphs[Math.floor(hash(i, seed, Math.floor(p * 30)) * glyphs.length)]
                    : ' ';
        else out += glyphs[Math.floor(hash(i, seed, Math.floor(p * 40)) * glyphs.length)];
    }
    return out;
}

/** A slam: overshoot scale in, a white flash on the glyphs for the first frames. */
export function slam(t, t0, dur = 0.22) {
    const p = prog(t, t0, dur);
    if (t < t0) return { on: false, scale: 1, alpha: 0, flash: 0 };
    const scale = lerp(1.55, 1, ease.outBack(p, 1.4));
    return { on: true, scale, alpha: clamp(p * 4), flash: 1 - clamp((t - t0) / 0.1) };
}

// ---------------------------------------------------------------- shapes

export function rect(ctx, x, y, w, h, fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
}

export function strokeRect(ctx, x, y, w, h, color, lw = 2) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw);
}

/** The HQ's corner brackets. */
export function brackets(ctx, x, y, w, h, color, len = 22, lw = 3) {
    ctx.fillStyle = color;
    const L = len;
    ctx.fillRect(x - lw, y - lw, L, lw);
    ctx.fillRect(x - lw, y - lw, lw, L);
    ctx.fillRect(x + w - L + lw, y + h, L, lw);
    ctx.fillRect(x + w, y + h - L + lw, lw, L);
}

/** A bordered panel with an optional title bar. */
export function panel(ctx, x, y, w, h, o = {}) {
    ctx.save();
    ctx.globalAlpha *= o.alpha ?? 1;
    rect(ctx, x, y, w, h, o.fill || 'rgba(14,18,23,0.92)');
    strokeRect(ctx, x, y, w, h, o.stroke || C.line2, o.lw || 2);
    if (o.title) {
        const th = o.titleH || 44;
        rect(ctx, x + 2, y + 2, w - 4, th, o.titleFill || 'rgba(20,26,33,0.98)');
        rect(ctx, x + 2, y + th + 2, w - 4, 2, o.stroke || C.line2);
        rect(ctx, x + 18, y + th / 2 - 5, 10, 10, o.dot || C.bull);
        text(ctx, o.title, x + 40, y + th / 2 + 2, {
            kind: 'monoBold',
            px: o.titlePx || 17,
            color: o.titleColor || C.text2,
            baseline: 'middle',
            tracking: 2,
            maxW: w - 60 - (o.titleRightW || 0)
        });
        if (o.titleRight)
            text(ctx, o.titleRight, x + w - 18, y + th / 2 + 2, {
                kind: 'mono',
                px: o.titlePx || 17,
                color: C.muted,
                baseline: 'middle',
                align: 'right',
                tracking: 1
            });
    }
    if (o.brackets) brackets(ctx, x - 6, y - 6, w + 12, h + 12, o.brackets, 26, 4);
    ctx.restore();
}

/** An outlined uppercase chip (the HQ's .flag). Returns its width. */
export function chip(ctx, str, x, y, o = {}) {
    const px = o.px || 18;
    const pad = o.pad ?? Math.round(px * 0.7);
    const h = o.h || Math.round(px * 2);
    setFont(ctx, 'monoBold', px, o.tracking ?? 2);
    const w = Math.ceil(ctx.measureText(str).width + pad * 2);
    const x0 = o.align === 'right' ? x - w : o.align === 'center' ? x - w / 2 : x;
    ctx.save();
    ctx.globalAlpha *= o.alpha ?? 1;
    if (o.fill) rect(ctx, x0, y, w, h, o.fill);
    if (o.dashed) ctx.setLineDash([6, 5]);
    strokeRect(ctx, x0, y, w, h, o.color || C.bull, o.lw || 2);
    ctx.setLineDash([]);
    ctx.fillStyle = o.textColor || o.color || C.bull;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(str, x0 + pad, y + h / 2 + 1);
    ctx.restore();
    return w;
}

/** The HQ's PLAY NOW button: green, square, hard shadow. */
export function button(ctx, str, cx, cy, w, h, o = {}) {
    const x = cx - w / 2;
    const y = cy - h / 2;
    const sh = o.shadow ?? Math.round(h * 0.11);
    rect(ctx, x + sh, y + sh, w, h, o.shadowColor || C.bullDeep);
    rect(ctx, x, y, w, h, o.fill || C.bull);
    text(ctx, str, cx, cy + h * 0.06, {
        kind: 'display',
        px: o.px || h * 0.62,
        color: o.color || C.ink,
        align: 'center',
        baseline: 'middle',
        tracking: o.tracking ?? 3,
        maxW: w * 0.86
    });
}

// ---------------------------------------------------------------- backgrounds

export function grid(ctx, W, H, o = {}) {
    const step = o.step || 60;
    const ox = (((o.ox || 0) % step) + step) % step;
    const oy = (((o.oy || 0) % step) + step) % step;
    ctx.fillStyle = o.color || 'rgba(27,34,43,0.55)';
    for (let x = -ox; x < W; x += step) ctx.fillRect(Math.round(x), 0, 1, H);
    for (let y = -oy; y < H; y += step) ctx.fillRect(0, Math.round(y), W, 1);
    if (o.major) {
        ctx.fillStyle = o.major;
        for (let x = -ox; x < W; x += step * 4) ctx.fillRect(Math.round(x), 0, 2, H);
        for (let y = -oy; y < H; y += step * 4) ctx.fillRect(0, Math.round(y), W, 2);
    }
}

/**
 * A procedural candlestick chart scrolling left: the game's arena, as a backdrop.
 * trend: -1 bear, 0 chop, +1 bull. Deterministic in `t`.
 */
export function chart(ctx, W, H, t, o = {}) {
    const cw = o.cw || 34;
    const gap = o.gap || 14;
    const step = cw + gap;
    const speed = o.speed ?? 40;
    const shift = t * speed;
    const first = Math.floor(shift / step);
    const trend = o.trend ?? 0;
    const base = o.base ?? H * 0.62;
    const amp = o.amp ?? H * 0.16;
    ctx.save();
    ctx.globalAlpha *= o.alpha ?? 0.5;
    const n = Math.ceil(W / step) + 2;
    const price = (i) =>
        base -
        trend * i * (o.slope ?? 3.2) +
        Math.sin(i * 0.37) * amp * 0.35 +
        Math.sin(i * 0.11 + 1.3) * amp * 0.6 +
        (hash(i, 7) - 0.5) * amp * 0.5;
    let prevMA = null;
    const ma = [];
    for (let k = 0; k < n; k++) {
        const i = first + k;
        const x = k * step - (shift - first * step);
        const open = price(i);
        const close = price(i + 1);
        const hi = Math.min(open, close) - hash(i, 3) * amp * 0.25;
        const lo = Math.max(open, close) + hash(i, 4) * amp * 0.25;
        const up = close < open;
        const col = up ? o.up || C.bullDark : o.down || C.bearDark;
        ctx.fillStyle = col;
        ctx.fillRect(Math.round(x + cw / 2 - 1), Math.round(hi), 3, Math.round(lo - hi));
        ctx.fillRect(
            Math.round(x),
            Math.round(Math.min(open, close)),
            cw,
            Math.max(3, Math.round(Math.abs(close - open)))
        );
        ma.push([x + cw / 2, (open + close) / 2]);
    }
    if (o.ma !== false) {
        ctx.strokeStyle = o.maColor || 'rgba(22,224,138,0.5)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let k = 0; k < ma.length; k++) {
            const avg =
                ma.slice(Math.max(0, k - 4), k + 1).reduce((s, v) => s + v[1], 0) /
                Math.min(k + 1, 5);
            if (k === 0) ctx.moveTo(ma[k][0], avg);
            else ctx.lineTo(ma[k][0], avg);
        }
        ctx.stroke();
    }
    ctx.restore();
    void prevMA;
}

export function vignette(ctx, W, H, strength = 0.55) {
    const g = ctx.createRadialGradient(
        W / 2,
        H / 2,
        Math.min(W, H) * 0.3,
        W / 2,
        H / 2,
        Math.hypot(W, H) * 0.62
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${strength})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
}

let grainTile = null;
export function grain(ctx, W, H, t, alpha = 0.05) {
    if (!grainTile) {
        grainTile = document.createElement('canvas');
        grainTile.width = grainTile.height = 256;
        const g = grainTile.getContext('2d');
        const img = g.createImageData(256, 256);
        const r = rng(99);
        for (let i = 0; i < img.data.length; i += 4) {
            const v = Math.floor(r() * 255);
            img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
            img.data[i + 3] = 255;
        }
        g.putImageData(img, 0, 0);
    }
    const f = Math.floor(t * 60);
    const ox = Math.floor(hash(f, 1) * 256);
    const oy = Math.floor(hash(f, 2) * 256);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'overlay';
    for (let y = -oy; y < H; y += 256)
        for (let x = -ox; x < W; x += 256) ctx.drawImage(grainTile, x, y);
    ctx.restore();
}

export function scanlines(ctx, W, H, alpha = 0.07) {
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 2);
    ctx.restore();
}

// ---------------------------------------------------------------- post effects

/** Horizontal slice displacement + colour split, from a snapshot of the frame. */
export function glitch(ctx, snap, W, H, amount, seed) {
    if (amount <= 0) return;
    const r = rng(seed);
    ctx.save();
    // colour split
    const off = Math.round(14 * amount);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35 * amount;
    ctx.drawImage(snap, -off, 0);
    ctx.drawImage(snap, off, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    // slices
    const n = Math.round(4 + 10 * amount);
    for (let i = 0; i < n; i++) {
        const y = Math.floor(r() * H);
        const h = Math.floor(8 + r() * 70 * amount);
        const dx = Math.round((r() - 0.5) * 220 * amount);
        ctx.drawImage(snap, 0, y, W, h, dx, y, W, h);
        if (r() < 0.3) {
            ctx.fillStyle = r() < 0.5 ? 'rgba(22,224,138,0.25)' : 'rgba(255,59,92,0.25)';
            ctx.fillRect(0, y, W, Math.max(2, h / 6));
        }
    }
    ctx.restore();
}

/** Screen shake offset for an impulse that started at t0. */
export function shake(t, t0, amp, decay = 0.35, seed = 1) {
    if (t < t0) return [0, 0];
    const k = Math.max(0, 1 - (t - t0) / decay);
    if (k <= 0) return [0, 0];
    const f = Math.floor(t * 60);
    return [(hash(f, seed, 1) - 0.5) * 2 * amp * k * k, (hash(f, seed, 2) - 0.5) * 2 * amp * k * k];
}
