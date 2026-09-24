/*
 * HQ art: the game's own pixel art on the landing page. Loaded when the browser is idle, so it never
 * delays the first paint.
 *
 *   <canvas data-sprite="bull" data-scale="3" data-anim>   a game sprite (animated with data-anim)
 *   <canvas data-icon="dca" data-scale="2">                 a weapon / passive icon
 *   <canvas id="parade">                                    the bull charging, the bear market chasing
 */

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const idle = window.requestIdleCallback || ((f) => setTimeout(f, 250));

idle(async () => {
    let art;
    try {
        art = await import('/art/sprites.js');
    } catch {
        return; // the page works without it
    }
    paintSlots(art);
    const parade = document.getElementById('parade');
    if (parade) runParade(parade, art);
});

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
        c.classList.add('painted');
        if (c.dataset.anim !== undefined && frames.length > 1 && !reduced) {
            animated.push({
                c,
                ctx,
                frames,
                fps: (c.dataset.sprite && SPRITES[id].fps) || 6,
                on: false
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
    let W = 0;
    let H = 0;
    let k = 3;
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
        'doomposter'
    ];
    let chasers = [];
    let candles = [];
    let pickups = [];
    let off = 0;
    let on = true;
    let last = 0;

    function resize() {
        const r = canvas.getBoundingClientRect();
        W = Math.round(r.width * dpr);
        H = Math.round(r.height * dpr);
        canvas.width = W;
        canvas.height = H;
        k = Math.max(2, Math.round((r.width < 600 ? 2 : 3) * dpr));
        const bull = SPRITES.bull;
        const bx = W * (r.width < 600 ? 0.62 : 0.58);
        chasers = cast.map((id, i) => ({
            id,
            x:
                bx -
                bull.w * k * 0.9 -
                (i + 1) * (r.width < 600 ? 44 : 68) * dpr -
                (id === 'grizzly' ? 10 : 0) * dpr,
            ph: i * 1.7
        }));
        candles = Array.from({ length: Math.ceil(W / (14 * dpr)) + 2 }, (_, i) => mk(i));
        pickups = Array.from({ length: 6 }, (_, i) => ({
            x: bx + (i + 1) * 110 * dpr,
            big: i % 3 === 2
        }));
        ctx.imageSmoothingEnabled = false;
    }
    function mk(i) {
        const h = (0.2 + Math.random() * 0.55) * H;
        return { i, h, up: Math.random() < 0.45, w: 0 };
    }

    const io = new IntersectionObserver((e) => (on = e[0].isIntersecting));
    io.observe(canvas);
    addEventListener('resize', resize);
    resize();

    const frame = (now) => {
        requestAnimationFrame(frame);
        if (!on) return;
        const dt = Math.min(0.05, Math.max(0, (now - (last || now)) / 1000));
        last = now;
        const t = now / 1000;
        const speed = reduced ? 0 : 150 * dpr;
        off += speed * dt;
        ctx.clearRect(0, 0, W, H);
        const ground = H - 18 * dpr;

        // background candles, scrolling (parallax)
        const step = 14 * dpr;
        const shift = (off * 0.4) % step;
        for (let i = 0; i < candles.length; i++) {
            const c = candles[(i + Math.floor((off * 0.4) / step)) % candles.length];
            const x = i * step - shift;
            ctx.fillStyle = c.up ? 'rgba(22,224,138,0.12)' : 'rgba(255,59,92,0.12)';
            ctx.fillRect(
                Math.round(x),
                Math.round(ground - c.h),
                Math.round(step * 0.55),
                Math.round(c.h * 0.6)
            );
        }
        // the chart line the bull runs on
        ctx.strokeStyle = 'rgba(22,224,138,0.8)';
        ctx.lineWidth = 2 * dpr;
        ctx.shadowColor = 'rgba(22,224,138,0.8)';
        ctx.shadowBlur = 10 * dpr;
        ctx.beginPath();
        ctx.moveTo(0, ground);
        ctx.lineTo(W, ground);
        ctx.stroke();
        ctx.shadowBlur = 0;
        // ground ticks
        ctx.fillStyle = 'rgba(123,245,166,0.35)';
        const tk = 40 * dpr;
        for (let x = -(off % tk); x < W; x += tk)
            ctx.fillRect(Math.round(x), ground + 5 * dpr, 2 * dpr, 4 * dpr);

        // XP candles ahead, flowing into the bull
        const bull = SPRITES.bull;
        const bw = bull.w * k;
        const bx = W * (W / dpr < 600 ? 0.62 : 0.58);
        for (const p of pickups) {
            p.x -= speed * dt;
            if (p.x < bx + bw * 0.2) p.x += 6 * 110 * dpr + Math.random() * 60 * dpr;
            const id = p.big ? 'xp_candle_big' : 'xp_candle';
            const f = bakeSprite(id, k)[0];
            const y = ground - 24 * dpr - f.height + Math.sin(t * 4 + p.x * 0.01) * 4 * dpr;
            const g = bakeGlow(id, k);
            if (g) {
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = 0.8;
                ctx.drawImage(
                    g[0],
                    Math.round(p.x - g[0].width / 2),
                    Math.round(y + f.height / 2 - g[0].height / 2)
                );
                ctx.globalAlpha = 1;
                ctx.globalCompositeOperation = 'source-over';
            }
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
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.fillRect(
                Math.round(c.x - img.width * 0.35),
                ground - 2 * dpr,
                Math.round(img.width * 0.7),
                3 * dpr
            );
            ctx.drawImage(img, Math.round(c.x - img.width / 2), Math.round(y));
            const g = bakeGlow(c.id, k);
            if (g) {
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = 0.7;
                ctx.drawImage(
                    g[fi % g.length],
                    Math.round(c.x - g[0].width / 2),
                    Math.round(y + img.height / 2 - g[0].height / 2)
                );
                ctx.globalAlpha = 1;
                ctx.globalCompositeOperation = 'source-over';
            }
        }

        // the bull, charging
        const bf = bakeSprite('bull', k);
        const img = bf[reduced ? 0 : Math.floor(t * 11) % bf.length];
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(Math.round(bx - bw * 0.4), ground - 2 * dpr, Math.round(bw * 0.8), 3 * dpr);
        ctx.drawImage(
            img,
            Math.round(bx - img.width / 2),
            Math.round(ground - img.height + 2 * dpr)
        );
        // dust behind the hooves
        if (!reduced) {
            ctx.fillStyle = 'rgba(160,190,200,0.25)';
            for (let i = 0; i < 4; i++) {
                const a = (t * 3 + i * 0.25) % 1;
                const s = (3 + a * 8) * dpr;
                ctx.globalAlpha = 1 - a;
                ctx.fillRect(
                    Math.round(bx - bw * 0.45 - a * 40 * dpr),
                    Math.round(ground - s - a * 6 * dpr),
                    Math.round(s),
                    Math.round(s)
                );
            }
            ctx.globalAlpha = 1;
        }
    };
    requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- live ticker (real numbers only)

(async () => {
    const el = document.getElementById('ticker');
    const track = document.getElementById('tickerTrack');
    if (!el || !track) return;
    const get = (u) =>
        fetch(u, { cache: 'no-cache', headers: { accept: 'application/json' } })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null);
    const [s, d] = await Promise.all([get('/api/stats'), get('/api/daily')]);
    const items = [];
    const esc = (v) => String(v).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    const add = (label, value, tone = '') =>
        items.push(`<span class="${tone}">${esc(label)} <b>${esc(value)}</b></span>`);
    if (s && s.liveBuild) add('Live build', `#${s.liveBuild.n} · ${s.liveBuild.title}`, 'g');
    if (s && Number.isFinite(s.day)) add('Day', `${s.day} of building`);
    if (s && Number.isFinite(s.buildsShipped)) add('Builds shipped', s.buildsShipped, 'g');
    if (d && d.twist && d.twist.name) add("Today's twist", d.twist.name, 'y');
    if (d && d.stageName) add('Stage', d.stageName);
    if (s && s.playersToday > 0) add('Players today', s.playersToday, 'g');
    if (s && s.topScoreToday)
        add(
            "Today's #1",
            `${Number(s.topScoreToday.score).toLocaleString('en-US')}${s.topScoreToday.verified ? ' ✓' : ''}`,
            'y'
        );
    if (s && s.treasury && Number.isFinite(s.treasury.balance)) {
        // Same number as the live board: wallet + the treasury's est. share of unclaimed creator fees.
        const t = s.treasury;
        const share =
            Number.isFinite(t.feeShare) && t.feeShare > 0 && t.feeShare <= 1 ? t.feeShare : 0;
        const fees = Number.isFinite(t.feesUnclaimed) ? t.feesUnclaimed * share : 0;
        add('Treasury', `${fees > 0 ? '~' : ''}${(t.balance + fees).toFixed(2)} SOL`, 'y');
    }
    add('Next build', '00:00 UTC');
    if (items.length < 3) return;
    const run = items.join('');
    track.innerHTML = run + run; // doubled for a seamless loop
    el.hidden = false;
})();

// ---------------------------------------------------------------- recent builds fold

(() => {
    const list = document.getElementById('timeline');
    const btn = document.getElementById('tlMore');
    if (!list || !btn) return;
    let open = false;
    const sync = () => {
        const n = list.children.length;
        const fold = n > 4 && !open;
        list.classList.toggle('collapsed', fold);
        btn.hidden = n <= 4;
        btn.textContent = open ? 'Show recent builds' : `Show every build (${n})`;
    };
    btn.addEventListener('click', () => {
        open = !open;
        sync();
    });
    new MutationObserver(sync).observe(list, { childList: true });
    sync();
})();

// ---------------------------------------------------------------- fund / steer / play status

(async () => {
    const get = (u) =>
        fetch(u, { cache: 'no-cache', headers: { accept: 'application/json' } })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null);
    const [s, v] = await Promise.all([get('/api/stats'), get('/api/vote')]);
    const set = (id, text, on) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = text;
        el.classList.toggle('on', !!on);
    };
    if (s && s.token) set('verbFund', 'Live · the coin is out', true);
    if (v && v.status === 'open')
        set('verbSteer', `Poll open · closes ${String(v.closesAt).slice(11, 16)} UTC`, true);
    else if (v && v.status === 'closed')
        set('verbSteer', 'Poll closed · next one at 00:00 UTC', true);
    if (s && s.liveBuild) set('verbPlay', `Live now · Build #${s.liveBuild.n}`, true);
})();

// ---------------------------------------------------------------- sections rise in, live numbers count up

(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver(
            (es) => {
                for (const e of es)
                    if (e.isIntersecting) {
                        e.target.classList.add('in');
                        io.unobserve(e.target);
                    }
            },
            { rootMargin: '0px 0px -8% 0px' }
        );
        for (const el of document.querySelectorAll('main > .sec, main > .verbs, main > .finale')) {
            // Whatever is already on screen stays put, so nothing above the fold ever flashes.
            if (el.getBoundingClientRect().top < innerHeight) continue;
            el.classList.add('rv');
            io.observe(el);
        }
    }
    // The first time a live number arrives, it counts up to its value (once, under a second).
    for (const el of document.querySelectorAll('.board .v')) {
        let done = false;
        let mine = null;
        let latest = null;
        const mo = new MutationObserver(() => {
            const txt = el.textContent.trim();
            if (txt === mine) return;
            latest = txt;
            if (done) return;
            const m = /^\d[\d,]*$/.exec(txt);
            if (!m) return;
            const target = Number(txt.replace(/,/g, ''));
            done = true;
            if (!(target > 3)) return;
            const t0 = performance.now();
            const frame = (t) => {
                const k = Math.min(1, (t - t0) / 800);
                if (k < 1) {
                    mine = Math.round(target * (1 - Math.pow(1 - k, 3))).toLocaleString('en-US');
                    el.textContent = mine;
                    requestAnimationFrame(frame);
                } else {
                    mine = null;
                    el.textContent = latest;
                    mo.disconnect();
                }
            };
            requestAnimationFrame(frame);
        });
        mo.observe(el, { childList: true, characterData: true, subtree: true });
    }
})();

// ---------------------------------------------------------------- prize address from the HQ
// The game and the HQ share an origin, so a browser that has played has its player id here too. Lets a player add
// or change the address a Daily Challenge win is paid to without playing another run.

(() => {
    const form = document.getElementById('prizeAddr');
    if (!form) return;
    let id = null;
    let prefs = {};
    try {
        id = localStorage.getItem('bearproof_player_id');
        prefs = JSON.parse(localStorage.getItem('bearproof_prefs_v1') || '{}') || {};
    } catch {
        return;
    }
    if (!id) return; // never played on this device: nothing to attach an address to
    const input = document.getElementById('prizeAddrIn');
    const note = document.getElementById('prizeAddrNote');
    const say = (t, tone) => {
        note.textContent = t;
        note.className = 'pa-note' + (tone ? ' ' + tone : '');
    };
    if (prefs.payoutAddress) {
        input.value = prefs.payoutAddress;
        say('Saved on this device. Change it any time.', 'good');
    }
    form.hidden = false;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const address = input.value.trim();
        if (address && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address))
            return say(
                address.length > 44 || /\s/.test(address)
                    ? 'That is not a public address. Never paste a private key or seed phrase anywhere.'
                    : 'That is not a Solana address.',
                'bad'
            );
        say('Saving…');
        try {
            const r = await fetch('/api/payout-address', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ playerId: id, address })
            });
            const data = await r.json().catch(() => null);
            if (!r.ok)
                return say(
                    (data && data.error && data.error.message) || 'Could not save. Try again.',
                    'bad'
                );
            try {
                const cur = JSON.parse(localStorage.getItem('bearproof_prefs_v1') || '{}') || {};
                cur.payoutAddress = address;
                localStorage.setItem('bearproof_prefs_v1', JSON.stringify(cur));
            } catch {
                /* the server has it; the device copy is a convenience */
            }
            say(
                address
                    ? 'Saved. If your run is the verified #1, the prize goes here.'
                    : 'Removed.',
                'good'
            );
        } catch {
            say('Network error. Try again.', 'bad');
        }
    });
})();
