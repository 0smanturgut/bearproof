/*
 * The game's own pixel art on the HQ (game/src/art, copied to /art by scripts/build.mjs). Loaded when the browser
 * is idle, so it never delays the first paint, and the page works without it.
 *
 *   <canvas data-sprite="bull" data-scale="3" data-anim>   a game sprite (animated with data-anim)
 *   <canvas data-icon="buyback" data-scale="4">             a weapon / passive icon
 *   <canvas id="parade">                                    the bull charging, the bear market chasing
 *   <canvas id="poster">                                    the screen's still frame until the live game loads
 */

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

let art;
try {
    art = await import('/art/sprites.js');
} catch {
    art = null;
}
if (art) {
    // The marquee loops seamlessly: a second copy of its items follows the first.
    const track = document.getElementById('mobs');
    if (track && !track.dataset.doubled) {
        track.dataset.doubled = '1';
        for (const li of [...track.children]) track.append(li.cloneNode(true));
    }
    paintSlots(art);
    const parade = document.getElementById('parade');
    if (parade) runParade(parade, art);
    const poster = document.getElementById('poster');
    if (poster) runPoster(poster, art);
}

// ---------------------------------------------------------------- sprite slots

function paintSlots({ SPRITES, bakeSprite, bakeIcon }) {
    const animated = [];
    for (const c of document.querySelectorAll('canvas[data-sprite], canvas[data-icon]')) {
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

// ---------------------------------------------------------------- parade

function runParade(canvas, { SPRITES, bakeSprite, bakeGlow }) {
    const ctx = canvas.getContext('2d', { alpha: true });
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cast = [
        'red_candle',
        'paper_hands',
        'grizzly',
        'fud_cloud',
        'red_candle',
        'sybil',
        'bag_holder',
        'margin_call',
        'rug_puller',
        'doomposter',
        'red_candle',
        'ponzi'
    ];
    let W = 0;
    let H = 0;
    let k = 3;
    let narrow = false;
    let chasers = [];
    let pickups = [];
    let on = true;
    let last = 0;

    function resize() {
        const r = canvas.getBoundingClientRect();
        W = Math.round(r.width * dpr);
        H = Math.round(r.height * dpr);
        canvas.width = W;
        canvas.height = H;
        narrow = r.width < 720;
        k = Math.max(2, Math.round((narrow ? 2 : 3) * dpr));
        const bx = bullX();
        const gap = (narrow ? 46 : 74) * dpr;
        chasers = cast.map((id, i) => ({
            id,
            x: bx - SPRITES.bull.w * k - (i + 1) * gap,
            ph: i * 1.7
        }));
        pickups = Array.from({ length: 7 }, (_, i) => ({
            x: bx + (i + 1) * 120 * dpr,
            big: i % 3 === 2
        }));
        ctx.imageSmoothingEnabled = false;
    }
    const bullX = () => W * (narrow ? 0.7 : 0.62);

    new IntersectionObserver((e) => (on = e[0].isIntersecting)).observe(canvas);
    addEventListener('resize', resize);
    resize();

    const glow = (id, x, y, h, fi = 0, a = 0.75) => {
        const g = bakeGlow(id, k);
        if (!g) return;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a;
        ctx.drawImage(
            g[fi % g.length],
            Math.round(x - g[0].width / 2),
            Math.round(y + h / 2 - g[0].height / 2)
        );
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
    };

    const frame = (now) => {
        requestAnimationFrame(frame);
        if (!on) return;
        const dt = Math.min(0.05, Math.max(0, (now - (last || now)) / 1000));
        last = now;
        const t = now / 1000;
        const speed = reduced ? 0 : 160 * dpr;
        ctx.clearRect(0, 0, W, H);
        const ground = H - 6 * dpr;
        const bx = bullX();
        const bw = SPRITES.bull.w * k;

        // XP candles ahead, flowing into the bull
        for (const p of pickups) {
            p.x -= speed * dt;
            if (p.x < bx + bw * 0.2) p.x += 7 * 120 * dpr + Math.random() * 60 * dpr;
            const id = p.big ? 'xp_candle_big' : 'xp_candle';
            const f = bakeSprite(id, k)[0];
            const y = ground - 22 * dpr - f.height + Math.sin(t * 4 + p.x * 0.01) * 4 * dpr;
            glow(id, p.x, y, f.height, 0, 0.8);
            ctx.drawImage(f, Math.round(p.x - f.width / 2), Math.round(y));
        }

        // the bear market, chasing
        for (const c of chasers) {
            const def = SPRITES[c.id];
            const frames = bakeSprite(c.id, k);
            const fi = reduced ? 0 : Math.floor(t * (def.fps || 8) + c.ph) % frames.length;
            const img = frames[fi];
            const float = c.id === 'fud_cloud';
            const hop = float
                ? Math.sin(t * 2 + c.ph) * 5 * dpr
                : -Math.abs(Math.sin(t * 6 + c.ph)) * 3 * dpr;
            const y = ground - img.height + (float ? -26 * dpr : 0) + hop;
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.fillRect(
                Math.round(c.x - img.width * 0.35),
                ground - 2 * dpr,
                Math.round(img.width * 0.7),
                3 * dpr
            );
            ctx.drawImage(img, Math.round(c.x - img.width / 2), Math.round(y));
            glow(c.id, c.x, y, img.height, fi, 0.7);
        }

        // the bull, charging
        const bf = bakeSprite('bull', k);
        const img = bf[reduced ? 0 : Math.floor(t * 11) % bf.length];
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(Math.round(bx - bw * 0.4), ground - 2 * dpr, Math.round(bw * 0.8), 3 * dpr);
        ctx.drawImage(
            img,
            Math.round(bx - img.width / 2),
            Math.round(ground - img.height + 2 * dpr)
        );
        if (!reduced) {
            ctx.fillStyle = 'rgba(123,245,166,0.35)';
            for (let i = 0; i < 5; i++) {
                const a = (t * 3 + i * 0.2) % 1;
                const s = (3 + a * 8) * dpr;
                ctx.globalAlpha = 1 - a;
                ctx.fillRect(
                    Math.round(bx - bw * 0.45 - a * 50 * dpr),
                    Math.round(ground - s - a * 8 * dpr),
                    Math.round(s),
                    Math.round(s)
                );
            }
            ctx.globalAlpha = 1;
        }
    };
    requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- poster: the screen before the live game loads

function runPoster(canvas, { SPRITES, bakeSprite, bakeGlow }) {
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
            const rad = Math.min(W, H) * (0.36 + 0.03 * Math.sin(t * 1.5 + i));
            const img = frames[reduced ? 0 : Math.floor(t * 6 + i) % frames.length];
            const x = cx + Math.cos(a) * rad * 1.5;
            const y = cy + Math.sin(a) * rad;
            ctx.drawImage(img, Math.round(x - img.width / 2), Math.round(y - img.height / 2));
        });
        // the bull, holding the middle
        const bf = bakeSprite('bull', k + dpr);
        const img = bf[reduced ? 0 : Math.floor(t * 11) % bf.length];
        const gl = bakeGlow('bull', k + dpr);
        if (gl) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.drawImage(
                gl[0],
                Math.round(cx - gl[0].width / 2),
                Math.round(cy - gl[0].height / 2)
            );
            ctx.globalCompositeOperation = 'source-over';
        }
        ctx.drawImage(img, Math.round(cx - img.width / 2), Math.round(cy - img.height / 2));
        if (!reduced) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
}
