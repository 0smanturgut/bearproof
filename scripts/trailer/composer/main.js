// The composer runtime: renders frame f of the trailer onto #c. Deterministic in f; the recorder calls
// window.setup(...) once, then await window.render(f) and a screenshot per frame.
import { C, hash, grain, scanlines, vignette, glitch } from './gfx.js';
import {
    FPS,
    BEAT,
    DURATION,
    buildScenes,
    resolveFootage,
    footageAt,
    allCues
} from './timeline.js';
import { drawScene } from './scenes.js';

const S = {};

async function loadFonts() {
    const faces = [
        new FontFace('Jersey 10', 'url(/fonts/jersey-10.woff2)'),
        new FontFace('JetBrains Mono', 'url(/fonts/jetbrains-mono-400.woff2)', { weight: '400' }),
        new FontFace('JetBrains Mono', 'url(/fonts/jetbrains-mono-700.woff2)', { weight: '700' })
    ];
    for (const f of faces) document.fonts.add(await f.load());
    await document.fonts.ready;
}

// ---- footage frames: loaded on demand, a small cache, prefetched ahead of the playhead
const cache = new Map();
const pending = new Map();
function url(shot, i) {
    return `/footage/${S.aspect}/${shot}/${String(i).padStart(4, '0')}.jpg`;
}
function load(shot, i) {
    const k = `${shot}/${i}`;
    if (cache.has(k)) return Promise.resolve(cache.get(k));
    if (pending.has(k)) return pending.get(k);
    const p = new Promise((res) => {
        const img = new Image();
        img.onload = () =>
            img.decode().then(
                () => res(img),
                () => res(img)
            );
        img.onerror = () => res(null);
        img.src = url(shot, i);
    }).then((img) => {
        pending.delete(k);
        cache.set(k, img);
        if (cache.size > 240) cache.delete(cache.keys().next().value);
        return img;
    });
    pending.set(k, p);
    return p;
}

function sceneAt(t) {
    return S.scenes.find((s) => t >= s.t0 && t < s.t1) || S.scenes[S.scenes.length - 1];
}

window.setup = async (o) => {
    Object.assign(S, o);
    const canvas = document.getElementById('c');
    canvas.width = o.W;
    canvas.height = o.H;
    S.canvas = canvas;
    S.ctx = canvas.getContext('2d', { alpha: false });
    S.scene = document.createElement('canvas');
    S.scene.width = o.W;
    S.scene.height = o.H;
    S.sctx = S.scene.getContext('2d', { alpha: false });
    await loadFonts();
    const art = await import(`/b/${o.D.liveBuild.n}/src/art/sprites.js`);
    const content = await import(`/b/${o.D.liveBuild.n}/src/sim/content.js`);
    S.art = art;
    S.content = content;
    S.bounty = await fetch(`/b/${o.D.liveBuild.n}/bounty.json`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
    S.scenes = resolveFootage(buildScenes(o.D), o.meta);
    S.cues = allCues(S.scenes);
    return { scenes: S.scenes.map((s) => [s.id, s.t0, s.t1]), frames: Math.round(DURATION * FPS) };
};

window.timeline = () => ({ scenes: S.scenes, cues: S.cues });

/** Shake, flash and glitch from the cues: every hit in the music lands on the picture too. */
function hits(t) {
    let sx = 0;
    let sy = 0;
    let flash = 0;
    let flashCol = '255,255,255';
    let gl = 0;
    for (const c of S.cues) {
        const dt = t - c.t;
        if (dt < 0) break;
        if (dt > 0.8) continue;
        const f = Math.floor(t * FPS);
        const shake = (amp, decay) => {
            const k = Math.max(0, 1 - dt / decay);
            sx += (hash(f, c.t, 1) - 0.5) * 2 * amp * k * k;
            sy += (hash(f, c.t, 2) - 0.5) * 2 * amp * k * k;
        };
        const v = c.v ?? 1;
        switch (c.type) {
            case 'impact':
                shake(30 * v, 0.55);
                flash = Math.max(flash, 0.55 * v * Math.max(0, 1 - dt / 0.3));
                gl = Math.max(gl, 0.9 * Math.max(0, 1 - dt / 0.1));
                break;
            case 'slamBig':
                shake(14 * v, 0.3);
                flash = Math.max(flash, 0.16 * Math.max(0, 1 - dt / 0.16));
                break;
            case 'slam':
                shake(6 * v, 0.18);
                break;
            case 'zap':
                shake(10, 0.2);
                gl = Math.max(gl, Math.max(0, 1 - dt / 0.14));
                break;
            case 'glitch':
                shake(7, 0.16);
                gl = Math.max(gl, 0.85 * Math.max(0, 1 - dt / 0.12));
                flash = Math.max(flash, 0.12 * Math.max(0, 1 - dt / 0.1));
                break;
            case 'alarm':
                shake(8, 0.6);
                flashCol = '255,59,92';
                flash = Math.max(flash, 0.3 * Math.max(0, 1 - dt / 0.3));
                break;
            case 'err':
                shake(5, 0.15);
                break;
            default:
        }
    }
    return { sx, sy, flash, flashCol, gl };
}

window.render = async (f) => {
    const t = f / FPS;
    const s = sceneAt(t);
    const lt = t - s.t0;
    const fr = footageAt(s, lt, S.meta);
    if (fr) {
        await load(fr.shot, fr.frame);
        // read ahead
        for (let k = 1; k <= 8; k++) {
            const ahead = footageAt(s, lt + k / FPS, S.meta);
            if (ahead) load(ahead.shot, ahead.frame);
        }
    }
    const env = {
        W: S.W,
        H: S.H,
        P: S.H > S.W,
        D: S.D,
        meta: S.meta,
        t,
        f,
        content: S.content,
        bounty: S.bounty,
        frame: (shot, i) => cache.get(`${shot}/${i}`) || null,
        sprite: (id, scale, o) => S.art.bakeSprite(id, scale, o || {}),
        icon: (id, scale) => S.art.bakeIcon(id, scale),
        glow: (id, scale) => S.art.bakeGlow?.(id, scale) || null
    };
    const sc = S.sctx;
    sc.save();
    sc.fillStyle = C.ink;
    sc.fillRect(0, 0, S.W, S.H);
    drawScene(sc, env, s, lt);
    sc.restore();

    const ctx = S.ctx;
    const h = hits(t);
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, S.W, S.H);
    const pad = Math.min(40, Math.hypot(h.sx, h.sy) * 1.2);
    const k = 1 + (2 * pad) / S.W;
    ctx.translate(S.W / 2 + h.sx, S.H / 2 + h.sy);
    ctx.scale(k, k);
    ctx.drawImage(S.scene, -S.W / 2, -S.H / 2);
    ctx.restore();
    if (h.gl > 0.02) glitch(ctx, S.scene, S.W, S.H, h.gl, Math.floor(t * FPS));
    if (h.flash > 0.01) {
        ctx.fillStyle = `rgba(${h.flashCol},${Math.min(1, h.flash)})`;
        ctx.fillRect(0, 0, S.W, S.H);
    }
    vignette(ctx, S.W, S.H, 0.38);
    scanlines(ctx, S.W, S.H, 0.045);
    grain(ctx, S.W, S.H, t, 0.04);
    return s.id;
};

window.BEAT = BEAT;
