/*
 * The game's own pixel art on the HQ (game/src/art, copied to /art by scripts/build.mjs). Loaded when the browser
 * is idle, so it never delays the first paint, and the page works without it.
 *
 *   <canvas data-sprite="bull" data-scale="3" data-anim>   a game sprite (animated with data-anim)
 *   <canvas data-icon="buyback" data-scale="4">             a weapon / passive icon
 *   <canvas id="poster">                                    the hero's still frame until the live game loads
 *
 * Canvases added later (the podium, the build wall) are painted when their container fires `bp:paint`.
 */

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

let art;
try {
    art = await import('/art/sprites.js');
} catch {
    art = null;
}
if (art) {
    paintSlots(art, document);
    document.addEventListener('bp:paint', (e) => paintSlots(art, e.target));
    window.bpArt = art;
    document.dispatchEvent(new Event('bp:art'));
    const poster = document.getElementById('poster');
    if (poster) runPoster(poster, art);
}

// ---------------------------------------------------------------- sprite slots

function paintSlots({ SPRITES, bakeSprite, bakeIcon }, root) {
    const animated = [];
    for (const c of root.querySelectorAll('canvas[data-sprite], canvas[data-icon]')) {
        if (c.dataset.painted) continue;
        c.dataset.painted = '1';
        const scale = Number(c.dataset.scale || 3);
        const id = c.dataset.sprite || c.dataset.icon;
        const frames = c.dataset.sprite ? bakeSprite(id, scale) : bakeIcon(id, scale);
        if (!frames || !frames.length) continue;
        c.width = frames[0].width;
        c.height = frames[0].height;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(frames[0], 0, 0);
        if (c.dataset.anim !== undefined && frames.length > 1 && !reduced) {
            animated.push({
                c,
                ctx,
                frames,
                fps: (c.dataset.sprite && SPRITES[id].fps) || 6,
                on: false,
                last: -1
            });
        }
    }
    if (!animated.length) return;
    const io = new IntersectionObserver((entries) => {
        for (const e of entries) {
            const a = animated.find((x) => x.c === e.target);
            if (a) a.on = e.isIntersecting;
        }
    });
    for (const a of animated) io.observe(a.c);
    const t0 = performance.now();
    const tick = (now) => {
        const t = Math.max(0, now - t0) / 1000;
        for (const a of animated) {
            if (!a.on) continue;
            const f = Math.floor(t * a.fps) % a.frames.length;
            if (f === a.last) continue;
            a.last = f;
            a.ctx.clearRect(0, 0, a.c.width, a.c.height);
            a.ctx.drawImage(a.frames[f], 0, 0);
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}

// ---------------------------------------------------------------- poster: the screen before the live game loads

function runPoster(canvas, { bakeSprite }) {
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let W = 0;
    let H = 0;
    let k = 3;
    const ring = [
        'red_candle',
        'grizzly',
        'fud_cloud',
        'paper_hands',
        'rug_puller',
        'bag_holder',
        'sybil',
        'red_candle',
        'doomposter',
        'margin_call'
    ];
    const resize = () => {
        const r = canvas.getBoundingClientRect();
        W = Math.round(r.width * dpr);
        H = Math.round(r.height * dpr);
        canvas.width = W;
        canvas.height = H;
        k = Math.max(2, Math.round((r.width < 500 ? 2 : 3) * dpr));
        ctx.imageSmoothingEnabled = false;
    };
    addEventListener('resize', resize);
    resize();
    const t0 = performance.now();
    const frame = (now) => {
        // Stops once the live game has faded in over it.
        const live = canvas.parentElement.querySelector('iframe.on');
        if (live) return;
        const t = Math.max(0, now - t0) / 1000;
        ctx.fillStyle = '#0a1015';
        ctx.fillRect(0, 0, W, H);
        // floor tiles
        const g = 40 * dpr;
        ctx.fillStyle = 'rgba(22,224,138,0.05)';
        for (let y = 0; y < H; y += g)
            for (let x = ((y / g) % 2) * g; x < W; x += g * 2) ctx.fillRect(x, y, g, g);
        const cx = W / 2;
        const cy = H / 2;
        // the bear market closing in
        ring.forEach((id, i) => {
            const frames = bakeSprite(id, k);
            if (!frames) return;
            const a = (i / ring.length) * Math.PI * 2 + (reduced ? 0 : t * 0.25);
            const rad = Math.min(W, H) * (0.42 + 0.03 * Math.sin(t * 1.5 + i));
            const img = frames[reduced ? 0 : Math.floor(t * 6 + i) % frames.length];
            const x = cx + Math.cos(a) * rad * 1.5;
            const y = cy + Math.sin(a) * rad;
            ctx.drawImage(img, Math.round(x - img.width / 2), Math.round(y - img.height / 2));
        });
        if (!reduced) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
}
