/*
 * The hero's stage: the live build's playable characters, one at a time, on the same lit pixel pedestal as the
 * game's title menu. The roster is read from the live build's own content module, so a character the AI adds
 * shows up here the night it ships. Sprites come from /art (the game's pixel engine). Display only.
 *
 *   import('/stage.js').then((m) => m.mountStage(liveBuildNumber))
 */

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const HOLD_MS = 4200;

const FALLBACK = [{ id: 'bull', name: 'The Bull', sprite: 'bull', description: 'Horns · 100 HP' }];

export async function mountStage(liveN) {
    const canvas = document.getElementById('stage');
    if (!canvas || canvas.dataset.on) return;
    canvas.dataset.on = '1';
    let art;
    try {
        art = await import('/art/sprites.js');
    } catch {
        return;
    }
    let roster = FALLBACK;
    try {
        const c = await import(`/b/${Number(liveN)}/src/sim/content.js`);
        const list = (c.CHARACTER_IDS || Object.keys(c.CHARACTERS)).map((id) => c.CHARACTERS[id]);
        if (list.length && list.every((x) => x && x.sprite)) roster = list;
    } catch {
        /* the bull alone still makes a stage */
    }
    run(canvas, art, roster);
}

function run(canvas, { bakeSprite, bakeGlow }, roster) {
    const ctx = canvas.getContext('2d');
    const name = document.getElementById('stageName');
    const info = document.getElementById('stageInfo');
    const dots = document.getElementById('stageDots');
    let i = 0;
    let prev = null;
    let swapAt = -1e9;
    let lastSwap = performance.now();
    let paused = false;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let lastT = 0;
    let lastMote = 0;
    const motes = [];

    const dotEls = roster.map((c, k) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('aria-label', `Show ${c.name}`);
        b.addEventListener('click', () => show(k, k < i ? -1 : 1));
        dots.append(b);
        return b;
    });
    let dir = 1;
    const caption = () => {
        const c = roster[i];
        name.textContent = c.name.toUpperCase();
        info.textContent = c.description || '';
        dotEls.forEach((d, k) => d.setAttribute('aria-current', String(k === i)));
        canvas.parentElement.classList.remove('swap');
        void canvas.parentElement.offsetWidth;
        canvas.parentElement.classList.add('swap');
    };
    const show = (k, d = 1) => {
        if (k === i) return;
        prev = i;
        dir = d;
        i = k;
        swapAt = performance.now();
        lastSwap = swapAt;
        caption();
    };
    caption();
    canvas.parentElement.addEventListener('pointerenter', () => (paused = true));
    canvas.parentElement.addEventListener('pointerleave', () => (paused = false));

    const fit = () => {
        dpr = Math.min(2, devicePixelRatio || 1);
        const r = canvas.getBoundingClientRect();
        if (!r.width || !r.height) return false;
        const W = Math.round(r.width * dpr);
        const H = Math.round(r.height * dpr);
        if (W !== canvas.width || H !== canvas.height) {
            canvas.width = W;
            canvas.height = H;
        }
        w = W;
        h = H;
        return true;
    };
    const scaleFor = (id) => {
        const base = bakeSprite(id, 1)?.[0];
        if (!base) return 3;
        return Math.max(2, Math.floor(Math.min((h * 0.44) / base.height, (w * 0.62) / base.width)));
    };
    const drawChar = (k, t, x, alpha) => {
        const id = roster[k].sprite || 'bull';
        const s = scaleFor(id);
        const frames = bakeSprite(id, s);
        if (!frames?.length) return;
        const f = reduced ? 0 : Math.floor(t * 8) % frames.length;
        const img = frames[f];
        const bob = reduced ? 0 : Math.round(Math.sin(t * 3.2) * s * 1.2);
        const baseY = Math.round(h * 0.78);
        const dx = Math.round(x - img.width / 2);
        const dy = baseY - img.height + bob - s * 2;
        ctx.globalAlpha = alpha;
        const glow = bakeGlow(id, s);
        if (glow?.length) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.drawImage(glow[f % glow.length], dx - glow.pad, dy - glow.pad);
            ctx.globalCompositeOperation = 'source-over';
        }
        ctx.drawImage(img, dx, dy);
        ctx.globalAlpha = 1;
    };

    // Only runs while the stage is on screen and the tab is visible.
    let visible = true;
    new IntersectionObserver((e) => (visible = e[0].isIntersecting)).observe(canvas);

    // 30 frames a second is plenty for 8 fps pixel art, and leaves the phone's time for the game behind it
    let drawn = 0;
    const frame = (now) => {
        requestAnimationFrame(frame);
        if (!visible || document.hidden || now - drawn < 30 || !fit()) return;
        drawn = now;
        if (!reduced && !paused && roster.length > 1 && now - lastSwap > HOLD_MS)
            show((i + 1) % roster.length, 1);
        const t = now / 1000;
        const dt = Math.min(0.05, Math.max(0, t - (lastT || t)));
        lastT = t;
        const cx = w / 2;
        const baseY = Math.round(h * 0.78);
        const u = Math.max(2, Math.round(h / 100));
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, w, h);

        // a pool of shade, so the live game behind never walks across the stage
        const shade = ctx.createRadialGradient(
            cx,
            h * 0.58,
            4,
            cx,
            h * 0.58,
            Math.max(w, h) * 0.56
        );
        shade.addColorStop(0, 'rgba(6,8,11,0.94)');
        shade.addColorStop(0.65, 'rgba(6,8,11,0.78)');
        shade.addColorStop(1, 'rgba(6,8,11,0)');
        ctx.fillStyle = shade;
        ctx.fillRect(0, 0, w, h);
        // spotlight
        const beam = ctx.createLinearGradient(0, 0, 0, baseY);
        beam.addColorStop(0, 'rgba(22,224,138,0)');
        beam.addColorStop(1, 'rgba(22,224,138,0.16)');
        ctx.fillStyle = beam;
        ctx.beginPath();
        ctx.moveTo(cx - w * 0.07, 0);
        ctx.lineTo(cx + w * 0.07, 0);
        ctx.lineTo(cx + w * 0.34, baseY);
        ctx.lineTo(cx - w * 0.34, baseY);
        ctx.closePath();
        ctx.fill();
        // floor glow: a flat ellipse, painted over the whole canvas so it has no edge
        ctx.save();
        ctx.translate(cx, baseY);
        ctx.scale(1, 0.34);
        const floor = ctx.createRadialGradient(0, 0, 2, 0, 0, w * 0.45);
        floor.addColorStop(0, 'rgba(22,224,138,0.34)');
        floor.addColorStop(1, 'rgba(22,224,138,0)');
        ctx.fillStyle = floor;
        ctx.fillRect(-w, -h * 3, w * 2, h * 6);
        ctx.restore();

        // the plinth
        const pw = Math.round(Math.min(w * 0.7, h * 0.95) / u) * u;
        const x0 = Math.round(cx - pw / 2);
        ctx.fillStyle = '#121923';
        ctx.fillRect(x0 + u * 2, baseY - u * 3, pw - u * 4, u * 3);
        ctx.fillRect(x0, baseY - u * 2, pw, u * 2);
        ctx.fillStyle = '#16e08a';
        ctx.fillRect(x0 + u * 2, baseY - u * 3, pw - u * 4, u);
        ctx.fillRect(x0, baseY - u * 2, u * 2, u);
        ctx.fillRect(x0 + pw - u * 2, baseY - u * 2, u * 2, u);
        ctx.fillStyle = '#0a0e13';
        ctx.fillRect(x0, baseY, pw, u * 5);
        ctx.fillRect(x0 + u, baseY + u * 5, pw - u * 2, u);
        ctx.fillStyle = 'rgba(22,224,138,0.35)';
        const stripe = reduced ? 0 : Math.floor(t * 12) % (u * 6);
        for (let x = x0 + u * 2 - stripe; x < x0 + pw - u * 2; x += u * 6)
            if (x >= x0 + u * 2) ctx.fillRect(x, baseY + u * 2, u * 3, u);

        if (!reduced) {
            if (t - lastMote > 0.07) {
                lastMote = t;
                motes.push({
                    x: x0 + u * 3 + Math.random() * (pw - u * 6),
                    y: baseY - u * 3,
                    v: (20 + Math.random() * 40) * dpr,
                    life: 1,
                    s: Math.random() < 0.3 ? 2 : 1
                });
            }
            ctx.fillStyle = '#16e08a';
            for (let k = motes.length - 1; k >= 0; k--) {
                const m = motes[k];
                m.y -= m.v * dt;
                m.life -= dt * 0.6;
                if (m.life <= 0) {
                    motes.splice(k, 1);
                    continue;
                }
                ctx.globalAlpha = Math.min(1, m.life) * 0.7;
                ctx.fillRect(Math.round(m.x), Math.round(m.y), u * m.s, u * m.s);
            }
            ctx.globalAlpha = 1;
        }

        const k = reduced ? 1 : Math.min(1, (now - swapAt) / 280);
        const ease = 1 - (1 - k) ** 3;
        const slide = w * 0.34;
        if (prev !== null && k < 1) drawChar(prev, t, cx - dir * slide * ease, 1 - ease);
        drawChar(i, t, cx + dir * slide * (1 - ease), prev !== null && k < 1 ? ease : 1);
        if (k >= 1) prev = null;
        if (!reduced && k < 1) {
            ctx.globalAlpha = (1 - k) * 0.5;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(x0 + u * 2, baseY - u * 3, pw - u * 4, u);
            ctx.globalAlpha = 1;
        }
    };
    requestAnimationFrame(frame);
}
