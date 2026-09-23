// Public repo URL, e.g. 'https://github.com/<owner>/<repo>'. Empty = repo links stay hidden.
const REPO_URL = 'https://github.com/0smanturgut/bearproof';

/**
 * HQ v1. Every value on the page is real API data or a designed empty state. Nothing is invented.
 * All fetches fail soft: a network error or a 404 renders the empty state, never an exception.
 *
 * Data sources:
 *   /api/stats        live numbers, live build, next build time, treasury, token   (polled)
 *   /api/builds       build manifest                                               (timeline)
 *   /devlog.json      devlog entries                                               (timeline)
 *   /api/daily        today's challenge (date, build, stage)
 *   /api/leaderboard  today's board
 *   /api/ledger       wallets + ledger rows
 */

const ANSEM_MINT = '9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump';
const STATS_POLL_MS = 30000;
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SIG = /^[1-9A-HJ-NP-Za-km-z]{43,90}$/;
const SHA = /^[0-9a-f]{7,40}$/i;

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const saveData = !!(navigator.connection && navigator.connection.saveData);

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

const $ = (sel, root = document) => root.querySelector(sel);

function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
        for (const [k, v] of Object.entries(props)) {
            if (v === null || v === undefined || v === false) continue;
            if (k === 'class') el.className = v;
            else if (k === 'text') el.textContent = v;
            else if (k.startsWith('on') && typeof v === 'function')
                el.addEventListener(k.slice(2), v);
            else el.setAttribute(k, v === true ? '' : String(v));
        }
    }
    for (const kid of kids.flat()) {
        if (kid === null || kid === undefined || kid === false) continue;
        el.append(kid instanceof Node ? kid : String(kid));
    }
    return el;
}

async function getJSON(url, timeoutMs = 8000) {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : 0;
    try {
        const res = await fetch(url, {
            headers: { accept: 'application/json' },
            credentials: 'same-origin',
            cache: 'no-cache', // always revalidate: live numbers must never come from a stale browser copy
            signal: ctl ? ctl.signal : undefined
        });
        if (!res.ok) return null;
        if (!(res.headers.get('content-type') || '').includes('json')) return null;
        return await res.json();
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const pad2 = (n) => String(n).padStart(2, '0');
const usd = (n) => '$' + Number(n).toFixed(2);
const fmtInt = (n) => (isNum(n) ? Math.round(n).toLocaleString('en-US') : '—');

function toMs(t) {
    if (isNum(t)) return t < 1e12 ? t * 1000 : t;
    if (typeof t === 'string') {
        const ms = Date.parse(t);
        return Number.isFinite(ms) ? ms : null;
    }
    return null;
}
function utcDay(ms) {
    return new Date(ms).toISOString().slice(0, 10);
}
function utcStamp(ms) {
    const d = new Date(ms);
    return `${utcDay(ms)} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())} UTC`;
}
function hms(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor(s / 60) % 60)}:${pad2(s % 60)}`;
}
function mss(ms) {
    if (!isNum(ms)) return '—';
    const s = Math.max(0, Math.round(ms / 1000));
    return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
}
function nextUtcMidnight(ms) {
    const d = new Date(ms);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}
function shortAddr(a) {
    return a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
}

/** Only https URLs on an allowed host (or same-origin paths) ever become links. */
function safeUrl(u, hosts) {
    try {
        const url = new URL(u, location.origin);
        if (url.origin === location.origin && !hosts) return url.pathname + url.search;
        if (url.protocol !== 'https:') return null;
        if (hosts && !hosts.includes(url.hostname)) return null;
        return url.href;
    } catch {
        return null;
    }
}
function commitUrl(sha) {
    if (!REPO_URL || !SHA.test(sha || '')) return null;
    return `${REPO_URL.replace(/\/+$/, '')}/commit/${sha}`;
}

/** Run `fn` once, the first time `el` comes within `margin` of the viewport. */
function whenNear(el, fn, margin = '600px') {
    if (!el) return;
    if (!('IntersectionObserver' in window)) return void fn();
    const io = new IntersectionObserver(
        (entries) => {
            if (entries.some((e) => e.isIntersecting)) {
                io.disconnect();
                fn();
            }
        },
        { rootMargin: margin }
    );
    io.observe(el);
}

/** Toggle `cb(visible)` as `el` enters / leaves the viewport. */
function watchVisible(el, cb) {
    if (!('IntersectionObserver' in window)) return void cb(true);
    new IntersectionObserver((entries) => cb(entries[entries.length - 1].isIntersecting)).observe(
        el
    );
}

async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        const ta = h('textarea', { readonly: true, style: 'position:fixed;opacity:0;top:0' });
        ta.value = text;
        document.body.append(ta);
        ta.select();
        let ok = false;
        try {
            ok = document.execCommand('copy');
        } catch {
            ok = false;
        }
        ta.remove();
        return ok;
    }
}

const ICON_CHECK = () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 6 6');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('shape-rendering', 'crispEdges');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', 'M0 3h1v1h1v1H1V4H0zM2 4h1v1H2zM3 3h1v1H3zM4 2h1v1H4zM5 1h1v1H5z');
    p.setAttribute('fill', 'currentColor');
    svg.append(p);
    return svg;
};

// ---------------------------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------------------------

const state = {
    stats: null,
    statsAt: 0,
    statsOk: false,
    nextBuildAt: nextUtcMidnight(Date.now()),
    rolledAt: 0
};
let resolveFirstStats;
const firstStats = new Promise((r) => (resolveFirstStats = r));

// ---------------------------------------------------------------------------------------------
// Top bar: solid once scrolled; PLAY appears whenever the hero CTA is off-screen.
// ---------------------------------------------------------------------------------------------

function initBar() {
    const bar = $('#bar');
    let ticking = false;
    const onScroll = () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
            bar.classList.toggle('scrolled', window.scrollY > 4);
            ticking = false;
        });
    };
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    const cta = $('#playBtn');
    if ('IntersectionObserver' in window) {
        new IntersectionObserver(
            (entries) => {
                // A sliver of the big button at the screen edge doesn't count as "visible".
                const e = entries[entries.length - 1];
                bar.classList.toggle('cta-off', !e.isIntersecting || e.intersectionRatio < 0.6);
            },
            { rootMargin: '-56px 0px 0px 0px', threshold: [0, 0.6, 1] }
        ).observe(cta);
    } else {
        bar.classList.add('cta-off');
    }
}

// ---------------------------------------------------------------------------------------------
// Live numbers (same honest empty-state rules as HQ v0)
// ---------------------------------------------------------------------------------------------

function setV(id, text, cls) {
    const el = document.getElementById(id);
    if (!el) return;
    const changed = el.textContent !== text;
    el.textContent = text;
    el.className = 'v' + (cls ? ' ' + cls : '');
    if (changed && state.statsAt && !reduceMotion.matches) {
        void el.offsetWidth;
        el.classList.add('flash');
    }
}
function setN(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function renderStats(s) {
    if (s.day) {
        setV('sDay', String(s.day), 'bull');
        const pill = $('#dayPill');
        pill.textContent = 'Day ' + s.day;
        pill.append(h('span', { class: 'pill-x' }, ' of building'));
    }
    const line = $('#liveLine');
    if (line && s.day)
        line.textContent = s.liveBuild
            ? `Live · Day ${s.day} · Build #${s.liveBuild.n}`
            : `Live · Day ${s.day}`;
    if (isNum(s.buildsShipped)) {
        setV('sBuilds', String(s.buildsShipped), s.buildsShipped > 0 ? 'bull' : '');
        setN(
            'sBuildsN',
            s.buildsShipped > 0 && s.liveBuild
                ? 'live build: #' + s.liveBuild.n
                : 'watch this number'
        );
    }

    // Treasury: "—" until a treasury wallet exists; a number only once a balance is actually reported.
    const t = s.treasury;
    if (!t) {
        setV('sTreasury', '—', 'empty');
        setN('sTreasuryN', 'coin not launched yet');
    } else {
        const bal = isNum(t.balance)
            ? t.balance
            : t.balance && isNum(t.balance.sol)
              ? t.balance.sol
              : null;
        if (bal === null) {
            setV('sTreasury', '—', 'empty');
            setN('sTreasuryN', 'wallet live · balance feed pending');
        } else {
            setV('sTreasury', bal.toFixed(2) + ' SOL', '');
            setN('sTreasuryN', 'on-chain balance');
        }
    }

    if (s.computeSpentUsd && s.computeSpentUsd.meteredRuns > 0) {
        setV('sSpent', usd(s.computeSpentUsd.measured), '');
        setN('sSpentN', 'measured, ' + s.computeSpentUsd.meteredRuns + ' agent runs');
    } else {
        setV('sSpent', '—', 'empty');
        setN('sSpentN', 'metering starts with the Build Agent');
    }

    if (s.playersToday !== null && s.playersToday > 0) {
        setV('sPlayers', String(s.playersToday), '');
        setN('sPlayersN', 'unique browsers, UTC day');
    } else {
        setV('sPlayers', '—', 'empty');
        setN(
            'sPlayersN',
            s.liveBuild && s.liveBuild.n >= 1
                ? 'none yet today (UTC)'
                : 'counting starts with Build #1'
        );
    }

    if (s.topScoreToday) {
        setV('sTop', Number(s.topScoreToday.score).toLocaleString('en-US'), 'gold');
        setN('sTopN', s.topScoreToday.verified ? 'verified' : 'not verified yet');
    } else {
        setV('sTop', '—', 'empty');
        setN('sTopN', 'no runs submitted yet');
    }

    const next = toMs(s.nextBuildAt);
    if (next) state.nextBuildAt = next;

    renderMonitor(s);
    renderCoin(s);
}

async function loadStats() {
    const s = await getJSON('/api/stats');
    if (s && typeof s === 'object') {
        renderStats(s);
        state.stats = s;
        state.statsAt = toMs(s.generatedAt) || Date.now();
        state.statsOk = true;
        $('#pillDot').classList.remove('off');
    } else {
        state.statsOk = false;
        $('#pillDot').classList.add('off');
        if (!state.stats) renderMonitor(null);
    }
    resolveFirstStats(state.stats);
    tickUpdated();
}

function tickUpdated() {
    const el = $('#updated');
    if (!state.statsOk) {
        el.textContent = state.stats ? 'offline · showing last data' : 'offline · retrying';
        return;
    }
    const ago = Math.max(0, Math.round((Date.now() - state.statsAt) / 1000));
    el.textContent =
        'updated ' +
        (ago < 5 ? 'just now' : ago < 120 ? ago + 's ago' : Math.round(ago / 60) + 'm ago');
}

// ---------------------------------------------------------------------------------------------
// 1 Hz clock: UTC clock, countdowns, freshness
// ---------------------------------------------------------------------------------------------

function renderCountdown(el, ms) {
    const txt = hms(ms);
    if (el.dataset.v === txt) return;
    el.dataset.v = txt;
    el.textContent = '';
    for (const ch of txt) el.append(h('span', { class: ch === ':' ? 's' : 'c' }, ch));
    el.setAttribute('aria-label', 'Time until 00:00 UTC: ' + txt);
}

function tick() {
    const now = Date.now();
    const d = new Date(now);
    $('#clock').textContent =
        `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())} UTC`;

    let left = state.nextBuildAt - now;
    if (left <= 0) {
        // 00:00 UTC passed: a new build window opened. Refresh everything that depends on the day.
        state.nextBuildAt = nextUtcMidnight(now);
        left = state.nextBuildAt - now;
        if (now - state.rolledAt > 60000) {
            state.rolledAt = now;
            setTimeout(() => {
                loadStats();
                loadBuilds();
                loadChallenge();
                loadWinners();
            }, 5000);
        }
    }
    renderCountdown($('#countdown'), left);
    for (const el of document.querySelectorAll('[data-countdown]')) el.textContent = hms(left);
    tickUpdated();
    setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
}

// ---------------------------------------------------------------------------------------------
// Monitor: live game iframe (Build #1+) or a canvas poster (Build #0)
// ---------------------------------------------------------------------------------------------

let poster = null;

function mulberry32(a) {
    return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Original pixel bull (20×12), two gallop frames. G body, D shade, H horn, E eye, N muzzle, K hoof.
const BULL_BODY = [
    '..............H...H.',
    '..............HH.HH.',
    '.....GGGGG.....GGG..',
    '..GGGGGGGGGGG.GGGGG.',
    '.GGGGGGGGGGGGGGGEGGG',
    'DGGGGGGGGGGGGGGGGGGG',
    'D.GGGGGGGGGGGGGGGGNN',
    '..GGGGGGGGGGGGGDGNNN',
    '..DGGGGGGGGGGGDD.NN.',
    '..DDDDDDDDDDDD.D....'
];
const BULL_FRAMES = [
    [...BULL_BODY, '..GD.GD.....GD.GD...', '..KK.KK.....KK.KK...'],
    [...BULL_BODY, '...GD.GD...GD...GD..', '..KK...KK.KK.....KK.']
];

function createPoster(canvas) {
    const PX = 3; // CSS px per art pixel
    const STEP = 5; // candle spacing (art px)
    const CW = 3; // candle body width
    const SPEED = 13; // art px per second
    const COL = {
        ink: '#07090c',
        grid: '#121820',
        bull: '#16e08a',
        bullD: '#0a8f55',
        bear: '#ff3b5c',
        gold: '#ffc53d',
        goldD: '#b07a00',
        line: 'rgba(232,237,242,0.55)',
        horn: '#e8edf2',
        snout: '#8df7c4',
        dust: '#7d8896'
    };
    const ctx = canvas.getContext('2d', { alpha: false });
    const sprites = BULL_FRAMES.map((rows) => spriteCanvas(rows));
    const rnd = mulberry32(20260923);
    let W = 0;
    let H = 0;
    let candles = [];
    let off = 0;
    let dist = 0;
    let seq = 0;
    let bullY = 0;
    let frame = 0;
    let frameT = 0;
    let dustT = 0;
    let coinGap = 20;
    let coins = [];
    let bits = [];
    let raf = 0;
    let last = 0;
    let acc = 0;
    let visible = true;
    let dead = false;

    function spriteCanvas(rows) {
        const pal = {
            G: COL.bull,
            D: COL.bullD,
            H: COL.horn,
            E: COL.ink,
            N: COL.snout,
            K: '#05331f'
        };
        const w = rows[0].length;
        const hh = rows.length;
        const cv = document.createElement('canvas');
        cv.width = w + 2;
        cv.height = hh + 2;
        const g = cv.getContext('2d');
        g.fillStyle = COL.ink;
        for (let y = 0; y < hh; y++)
            for (let x = 0; x < w; x++) {
                if (rows[y][x] === '.') continue;
                g.fillRect(x, y + 1, 1, 1);
                g.fillRect(x + 2, y + 1, 1, 1);
                g.fillRect(x + 1, y, 1, 1);
                g.fillRect(x + 1, y + 2, 1, 1);
            }
        for (let y = 0; y < hh; y++)
            for (let x = 0; x < w; x++) {
                const c = rows[y][x];
                if (c === '.') continue;
                g.fillStyle = pal[c];
                g.fillRect(x + 1, y + 1, 1, 1);
            }
        return cv;
    }

    // Price band: portrait screens keep the chart low (the chip sits on top); wide screens centre it.
    const band = { mid: 0, amp: 0, lo: 0, hi: 0 };
    function setBand() {
        const portrait = H > W;
        band.mid = H * (portrait ? 0.54 : 0.48);
        band.amp = H * (portrait ? 0.22 : 0.2);
        band.lo = H * (portrait ? 0.3 : 0.22);
        band.hi = H * (portrait ? 0.78 : 0.74);
    }

    function nextCandle(open) {
        seq++;
        const target =
            band.mid +
            (Math.sin(seq * 0.21) * 0.55 + Math.sin(seq * 0.057 + 1.3) * 0.45) * band.amp;
        let close = open + (target - open) * 0.45 + (rnd() - 0.5) * H * 0.15;
        close = Math.min(band.hi, Math.max(band.lo, close));
        return {
            o: open,
            c: close,
            hi: Math.min(open, close) - 1 - rnd() * H * 0.045,
            lo: Math.max(open, close) + 1 + rnd() * H * 0.045
        };
    }

    function seed() {
        candles = [];
        seq = 0;
        setBand();
        let p = band.mid;
        const n = Math.ceil(W / STEP) + 4;
        for (let i = 0; i < n; i++) {
            const c = nextCandle(p);
            candles.push(c);
            p = c.c;
        }
        bullY = lineY(bullX());
        coins = [];
        bits = [];
        for (let x = bullX() + 44; x < W; x += 28 + Math.floor(rnd() * 24)) {
            coins.push({ x, dy: -12 - Math.floor(rnd() * 8), ph: rnd() * 6 });
        }
    }

    const BS = 2; // the bull sprite is drawn at 2× art pixels
    const bullX = () => Math.round(W * 0.24);

    function lineY(x) {
        const k = (x + off - CW / 2) / STEP;
        const i = Math.max(0, Math.min(candles.length - 2, Math.floor(k)));
        const f = Math.max(0, Math.min(1, k - i));
        return candles[i].c + (candles[i + 1].c - candles[i].c) * f;
    }

    function resize() {
        const r = canvas.getBoundingClientRect();
        const w = Math.max(40, Math.round(r.width / PX));
        const hh = Math.max(40, Math.round(r.height / PX));
        if (w === W && hh === H) return;
        W = w;
        H = hh;
        canvas.width = W;
        canvas.height = H;
        seed();
        draw();
    }

    function update(dt) {
        const dx = SPEED * dt;
        off += dx;
        dist += dx;
        while (off >= STEP) {
            off -= STEP;
            candles.shift();
            candles.push(nextCandle(candles[candles.length - 1].c));
        }
        const bx = bullX();
        const target = lineY(bx + 10 * BS);
        bullY += (target - bullY) * Math.min(1, dt * 9);
        frameT += dt;
        if (frameT > 0.11) {
            frameT = 0;
            frame ^= 1;
        }
        // Dust behind the hooves.
        dustT += dt;
        if (dustT > 0.07) {
            dustT = 0;
            bits.push({
                x: bx + 3,
                y: Math.round(bullY) - 1 - rnd() * 2,
                vx: -SPEED - 6 - rnd() * 10,
                vy: -2 - rnd() * 6,
                life: 0.5,
                max: 0.5,
                c: COL.dust
            });
        }
        // Coins ride the chart; the bull collects them.
        coinGap -= dx;
        if (coinGap <= 0) {
            coinGap = 28 + rnd() * 28;
            coins.push({ x: W + 2, dy: -12 - Math.floor(rnd() * 8), ph: rnd() * 6 });
        }
        for (const c of coins) {
            c.x -= dx;
            c.ph += dt * 6;
            if (!c.got && c.x <= bx + 19 * BS && c.x >= bx) {
                c.got = true;
                const cy = lineY(c.x) + c.dy;
                for (let i = 0; i < 7; i++) {
                    bits.push({
                        x: c.x,
                        y: cy,
                        vx: (rnd() - 0.5) * 40,
                        vy: -10 - rnd() * 26,
                        life: 0.55,
                        max: 0.55,
                        c: COL.gold,
                        g: 60
                    });
                }
            }
        }
        coins = coins.filter((c) => !c.got && c.x > -4);
        for (const b of bits) {
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            if (b.g) b.vy += b.g * dt;
            b.life -= dt;
        }
        bits = bits.filter((b) => b.life > 0);
    }

    function draw() {
        if (!W) return;
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = COL.ink;
        ctx.fillRect(0, 0, W, H);
        // Chart grid (scrolls with the candles).
        ctx.fillStyle = COL.grid;
        const G = 12;
        const gx = Math.floor(dist % G);
        for (let x = -gx; x < W; x += G) ctx.fillRect(x, 0, 1, H);
        for (let y = G - 1; y < H; y += G) ctx.fillRect(0, y, W, 1);
        // Candles.
        for (let i = 0; i < candles.length; i++) {
            const c = candles[i];
            const x = Math.round(i * STEP - off);
            if (x > W || x + CW < 0) continue;
            const up = c.c < c.o;
            ctx.fillStyle = up ? COL.bull : COL.bear;
            ctx.globalAlpha = 0.9;
            const top = Math.round(Math.min(c.o, c.c));
            const bot = Math.round(Math.max(c.o, c.c));
            ctx.fillRect(x + 1, Math.round(c.hi), 1, Math.round(c.lo) - Math.round(c.hi));
            ctx.fillRect(x, top, CW, Math.max(1, bot - top));
        }
        ctx.globalAlpha = 1;
        // Price line (1 px, gap-free).
        ctx.fillStyle = COL.line;
        let py = Math.round(lineY(0));
        for (let x = 0; x < W; x++) {
            const y = Math.round(lineY(x));
            const a = Math.min(py, y);
            const b = Math.max(py, y);
            ctx.fillRect(x, a, 1, Math.max(1, b - a));
            py = y;
        }
        // Coins.
        for (const c of coins) {
            const x = Math.round(c.x);
            const y = Math.round(lineY(c.x) + c.dy + Math.sin(c.ph) * 1.2);
            ctx.fillStyle = COL.goldD;
            ctx.fillRect(x - 1, y - 1, 3, 3);
            ctx.fillStyle = COL.gold;
            ctx.fillRect(x - 1, y - 1, 2, 2);
        }
        // Particles.
        for (const b of bits) {
            ctx.globalAlpha = Math.max(0, b.life / b.max);
            ctx.fillStyle = b.c;
            ctx.fillRect(Math.round(b.x), Math.round(b.y), 1, 1);
        }
        ctx.globalAlpha = 1;
        // The bull, standing on the line.
        const sp = sprites[frame];
        const bob = frame ? 1 : 0;
        const sw = sp.width * BS;
        const sh = sp.height * BS;
        ctx.drawImage(sp, bullX() - BS, Math.round(bullY) - sh + BS * 2 - bob, sw, sh);
    }

    function loop(t) {
        raf = 0;
        if (dead || !visible || document.hidden) return;
        const dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
        last = t;
        update(dt);
        acc += dt;
        if (acc >= 1 / 31) {
            acc = 0;
            draw();
        }
        raf = requestAnimationFrame(loop);
    }

    function start() {
        if (dead || raf || reduceMotion.matches) return;
        last = 0;
        raf = requestAnimationFrame(loop);
    }

    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
    resize();
    watchVisible(canvas, (v) => {
        visible = v;
        if (v) start();
    });
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) start();
    });
    reduceMotion.addEventListener?.('change', () => (reduceMotion.matches ? draw() : start()));
    start();

    return {
        stop() {
            dead = true;
            if (raf) cancelAnimationFrame(raf);
            raf = 0;
        }
    };
}

function setPosterUi(chip, cap, sub) {
    const subEl = $('#posterSub');
    subEl.textContent = '';
    if (sub) subEl.append(...sub);
    subEl.hidden = !sub;
    const chipEl = $('#posterChip');
    chipEl.textContent = '';
    chipEl.append(chip, h('i', { class: 'cursor', 'aria-hidden': 'true' }));
    const capEl = $('#posterCap');
    capEl.textContent = '';
    if (cap) capEl.append(...cap);
    capEl.hidden = !cap;
}

function ensureTap(n) {
    const screen = $('#screen');
    let tap = $('.tap', screen);
    if (!tap) {
        tap = h('a', { class: 'tap', href: '/play' }, h('span', null, 'TAP TO PLAY'));
        screen.append(tap);
    }
    tap.setAttribute('aria-label', `Tap to play Build #${n}`);
}

function renderMonitor(s) {
    const live = s && s.liveBuild;
    const title = $('#monTitle');
    if (!live) {
        title.textContent = 'Build — · offline';
        setPosterUi('Live feed offline', [
            "Couldn't reach the build server. The game itself still works: ",
            h('a', { href: '/play' }, 'play the live build'),
            '.'
        ]);
        return;
    }
    title.textContent =
        live.mode === 'upstream'
            ? `Build #${live.n} · the untouched original`
            : `Build #${live.n} · ${live.title || ''}`;
    if (live.n >= 1) {
        ensureTap(live.n);
        setPosterUi(`Build #${live.n} live`, null);
        // Autoplay is motion and data: reduced-motion and Save-Data visitors get the still poster.
        if (!reduceMotion.matches && !saveData) mountGame(live.n);
    } else {
        setPosterUi(
            'Build #1 in progress',
            [
                'The live game view mounts here when Build #1 ships. Meanwhile, ',
                h('a', { href: '/b/0/' }, 'play Build #0'),
                ', the untouched original.'
            ],
            [
                'Next release window ',
                h('b', { 'data-countdown': '' }, hms(state.nextBuildAt - Date.now()))
            ]
        );
    }
}

let gameMounted = false;
let mountedN = null;
function mountGame(n) {
    if (gameMounted) {
        // A new build went live while the page was open: reload the view (/play resolves to it).
        const f = $('#screen iframe');
        if (f && mountedN !== n) f.src = '/play?attract=1';
        mountedN = n;
        const now = $('#thenNow');
        if (now && isNum(n)) now.textContent = `Now · #${n}`;
        return;
    }
    gameMounted = true;
    mountedN = n;
    const go = () =>
        whenNear(
            $('#monitor'),
            () => {
                const f = h('iframe', {
                    src: '/play?attract=1',
                    title: 'BEARPROOF live build',
                    loading: 'lazy',
                    tabindex: '-1',
                    inert: true
                });
                f.addEventListener(
                    'load',
                    () => {
                        if (poster) poster.stop();
                        $('#posterUi').hidden = true;
                        startThen();
                    },
                    { once: true }
                );
                $('#screen').insertBefore(f, $('#posterUi'));
            },
            '0px'
        );
    if (document.readyState === 'complete') go();
    else addEventListener('load', go, { once: true });
}

/**
 * Day 0 vs now, over the live view: Build #0's gameplay (a short loop) on the left of a divider that sweeps
 * back and forth on its own. Drag it (or use the arrow keys) to take over; it resumes after a few seconds.
 * Only runs with the live game, so reduced-motion and Save-Data visitors never get it.
 */
function startThen() {
    const then = $('#then');
    const handle = $('#thenHandle');
    if (!then || !handle || then.dataset.on) return;
    then.dataset.on = '1';
    const screen = $('#screen');
    const video = $('video', then);
    const n = mountedN;
    $('#thenNow').textContent = isNum(n) ? `Now · #${n}` : 'Now';
    then.hidden = false;
    handle.hidden = false;
    let x = 50;
    let phase = 0;
    let dragging = false;
    let idleUntil = 0;
    let visible = true;
    let last = performance.now();
    const AMP = 34;
    const set = (v) => {
        x = Math.max(2, Math.min(98, v));
        screen.style.setProperty('--x', `${x}%`);
        handle.setAttribute('aria-valuenow', String(Math.round(x)));
    };
    const resume = () => {
        idleUntil = performance.now() + 4000;
        phase = Math.asin(Math.max(-1, Math.min(1, (x - 50) / AMP)));
    };
    const frame = (t) => {
        const dt = Math.min(100, t - last);
        last = t;
        if (visible && !dragging && t > idleUntil) {
            phase += (dt / 10000) * Math.PI * 2;
            set(50 + AMP * Math.sin(phase));
        }
        requestAnimationFrame(frame);
    };
    const fromEvent = (e) => {
        const r = screen.getBoundingClientRect();
        set(((e.clientX - r.left) / r.width) * 100);
    };
    handle.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        dragging = true;
        handle.setPointerCapture(e.pointerId);
        fromEvent(e);
    });
    handle.addEventListener('pointermove', (e) => dragging && fromEvent(e));
    const up = () => {
        if (!dragging) return;
        dragging = false;
        resume();
    };
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
    handle.addEventListener('keydown', (e) => {
        const step = e.key === 'ArrowLeft' ? -6 : e.key === 'ArrowRight' ? 6 : 0;
        if (!step) return;
        e.preventDefault();
        set(x + step);
        resume();
    });
    if ('IntersectionObserver' in window)
        new IntersectionObserver((es) => {
            visible = es[es.length - 1].isIntersecting;
            if (visible) video.play().catch(() => {});
            else video.pause();
        }).observe(screen);
    video.play().catch(() => {});
    set(50);
    requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------------------------
// 01 · Today's build + timeline
// ---------------------------------------------------------------------------------------------

const MODES = new Set(['agent', 'bootstrap', 'human', 'upstream']);
const BUILD0_SUMMARY =
    'The untouched open-source game the AI started from. Everything after this is new.';

function modeBadge(mode) {
    const m = MODES.has(mode) ? mode : null;
    return h('span', { class: 'badge ' + (m || 'human') }, m || String(mode || 'unknown'));
}

function costText(b, d) {
    const mode = (b && b.mode) || (d && d.mode);
    if (mode === 'upstream') return 'n/a, no AI work';
    const pick = (v) => (isNum(v) && v > 0 ? v : null);
    const val = pick(d && d.costUsd) ?? pick(b && b.costUsd);
    if (val === null) return mode === 'bootstrap' ? 'unmetered (bootstrap)' : 'not metered';
    const measured = d && d.costMeasured === true;
    return `${usd(val)} ${measured ? 'measured' : 'estimate'}`;
}

function chosenText(d) {
    if (!d || !d.chosenBy) return null;
    if (d.chosenBy === 'holders') return 'Chosen by holders';
    if (d.chosenBy === 'agent') return 'Chosen by the AI';
    return 'Chosen by ' + d.chosenBy;
}

function commitMeta(sha, ref) {
    const items = [];
    if (SHA.test(sha || '')) {
        const url = commitUrl(sha);
        items.push(
            h(
                'li',
                null,
                'commit ',
                url
                    ? h('a', { href: url, rel: 'noopener' }, sha.slice(0, 7))
                    : h('b', null, sha.slice(0, 7))
            )
        );
    }
    if (ref) items.push(h('li', null, 'tag ', h('b', null, ref)));
    return items;
}

function playLink(n) {
    return h(
        'a',
        { class: 'go', href: `/b/${n}/` },
        'Play this build',
        h('span', { class: 'sr-only' }, ` #${n}`),
        h('span', { 'aria-hidden': 'true' }, '→')
    );
}

/** Upstream builds get a plain heading; the manifest title (the fork's name) stays visible as the source line. */
function titles(b, d) {
    if (b && b.mode === 'upstream')
        return {
            title: 'The untouched original',
            src: b.title ? 'source: ' + b.title.replace(/^untouched upstream:\s*/i, '') : null
        };
    return {
        title: (d && d.title) || (b && b.title) || (b ? `Build #${b.n}` : 'Untitled'),
        src: null
    };
}

function renderToday(live, d, now) {
    const box = $('#today');
    box.textContent = '';
    if (!live) {
        box.append(
            h(
                'div',
                { class: 'state' },
                h('p', { class: 'state-big' }, 'No build is live'),
                h('p', { class: 'state-k' }, 'The build manifest is empty. Nothing to show yet.')
            )
        );
        return;
    }
    const at = toMs(live.activatesAt);
    const shippedToday = at && utcDay(at) === utcDay(now) && live.mode !== 'upstream';
    const status =
        live.mode === 'upstream'
            ? 'Live now · the starting point'
            : shippedToday
              ? 'Shipped today'
              : 'Live now';
    const { title, src } = titles(live, d);
    const summary = (d && d.summary) || (live.n === 0 ? BUILD0_SUMMARY : null);
    const chosen = chosenText(d);
    box.append(
        h(
            'article',
            { class: 'feat' },
            h(
                'div',
                { class: 'feat-n' },
                h('div', null, h('span', { class: 'feat-k' }, 'Build'), h('b', null, '#' + live.n)),
                h(
                    'div',
                    { class: 'when' },
                    h('strong', null, status),
                    at ? h('span', null, 'since ' + utcStamp(at)) : null,
                    modeBadge(live.mode)
                )
            ),
            h(
                'div',
                { class: 'feat-body' },
                h('h3', null, title),
                src ? h('p', { class: 'src' }, src) : null,
                chosen ? h('p', { class: 'by' }, chosen) : null,
                summary ? h('p', null, summary) : null,
                h(
                    'ul',
                    { class: 'meta' },
                    ...commitMeta(live.commit, live.ref),
                    h('li', null, 'cost ', h('b', null, costText(live, d)))
                ),
                h(
                    'div',
                    { class: 'feat-go' },
                    playLink(live.n),
                    d
                        ? h(
                              'a',
                              {
                                  class: 'go dim',
                                  href: `${REPO_URL}/blob/main/devlog/build-${live.n}.md`,
                                  rel: 'noopener',
                                  target: '_blank'
                              },
                              'Full devlog ↗'
                          )
                        : null
                )
            )
        )
    );
}

function timelineItem(b, d) {
    const failed = d && d.status && d.status !== 'shipped' && !b;
    const mode = b ? b.mode : d && d.mode;
    const cls = ['tl', MODES.has(mode) ? mode : 'human'];
    if (failed) cls.push('failed');
    if (b && b.revoked) cls.push('revoked');
    const at = b ? toMs(b.activatesAt) : d ? toMs(d.date) : null;
    const { title, src } = titles(b, d);
    const summary = (d && d.summary) || (b && b.n === 0 ? BUILD0_SUMMARY : null);
    const chosen = chosenText(d);
    const top = [
        h('b', null, b ? `BUILD #${b.n}` : 'NO BUILD'),
        at ? h('time', { datetime: new Date(at).toISOString() }, utcDay(at)) : null,
        mode ? modeBadge(mode) : null,
        failed ? h('span', { class: 'badge failed' }, String(d.status)) : null,
        b && b.revoked ? h('span', { class: 'badge revoked' }, 'revoked') : null,
        d && d.status && d.status !== 'shipped' && b
            ? h('span', { class: 'badge failed' }, String(d.status))
            : null
    ];
    const meta = [];
    if (b) meta.push(...commitMeta(b.commit, b.n === 0 ? b.ref : null));
    else if (d && d.commit) meta.push(...commitMeta(d.commit));
    if (b || (d && isNum(d.costUsd)))
        meta.push(h('li', null, 'cost ', h('b', null, costText(b, d))));
    if (chosen) meta.push(h('li', { class: 'bull' }, chosen));
    return h(
        'li',
        { class: cls.join(' ') },
        h('span', { class: 'tl-node', 'aria-hidden': 'true' }),
        h(
            'div',
            { class: 'tl-card' },
            h('div', { class: 'tl-top' }, ...top),
            h('h4', null, title),
            src ? h('p', { class: 'src' }, src) : null,
            summary ? h('p', null, summary) : null,
            b && b.revoked
                ? h('p', null, 'Pulled from rotation. Still playable, so old runs can be replayed.')
                : null,
            meta.length ? h('ul', { class: 'meta' }, ...meta) : null,
            b ? playLink(b.n) : null
        )
    );
}

function nextItem(n, scheduled) {
    const body = scheduled
        ? [
              h('h4', null, scheduled.title || `Build #${n}`),
              h(
                  'p',
                  null,
                  'Ready. Goes live at ',
                  h('b', null, utcStamp(toMs(scheduled.activatesAt))),
                  '.'
              )
          ]
        : [
              h(
                  'p',
                  null,
                  'Next release window: 00:00 UTC, in ',
                  h('b', { 'data-countdown': '' }, hms(state.nextBuildAt - Date.now())),
                  '. If a build passes its tests, it ships then. If not, the devlog says why.'
              )
          ];
    return h(
        'li',
        { class: 'tl next' },
        h('span', { class: 'tl-node', 'aria-hidden': 'true' }),
        h(
            'div',
            { class: 'tl-card' },
            h(
                'div',
                { class: 'tl-top' },
                h('b', null, `BUILD #${n}`),
                h('span', { class: 'badge next' }, scheduled ? 'scheduled' : 'next up')
            ),
            ...body
        )
    );
}

async function loadBuilds() {
    const [data, s] = await Promise.all([getJSON('/api/builds'), firstStats]);
    const box = $('#today');
    const tl = $('#timeline');
    if (!data || !Array.isArray(data.builds)) {
        box.textContent = '';
        box.append(
            h(
                'div',
                { class: 'state' },
                h('p', { class: 'state-big' }, 'Build log offline'),
                h(
                    'p',
                    { class: 'state-k' },
                    "Couldn't reach the build manifest. Nothing is lost: every build is in git."
                ),
                h(
                    'button',
                    { class: 'btn btn-sm', type: 'button', onclick: () => loadBuilds() },
                    'Retry'
                )
            )
        );
        tl.textContent = '';
        return;
    }
    const now = Date.now();
    const builds = data.builds.filter((b) => b && isNum(b.n));
    // The devlog starts with the Build Agent. Before Build #1 or any metered agent run there is nothing to read.
    const agentRan = s && s.computeSpentUsd && s.computeSpentUsd.meteredRuns > 0;
    let entries = [];
    if (builds.some((b) => b.n >= 1) || agentRan) {
        const dl = await getJSON('/devlog.json');
        if (dl && Array.isArray(dl.entries))
            entries = dl.entries.filter((e) => e && typeof e === 'object');
    }
    const byBuild = new Map();
    for (const e of entries) if (isNum(e.build)) byBuild.set(e.build, e);

    const shipped = builds.filter((b) => (toMs(b.activatesAt) || 0) <= now);
    const scheduled = builds
        .filter((b) => !b.revoked && (toMs(b.activatesAt) || 0) > now)
        .sort((a, b) => a.n - b.n);
    const live =
        (s && s.liveBuild && builds.find((b) => b.n === s.liveBuild.n)) ||
        shipped
            .filter((b) => !b.revoked)
            .sort((a, b) => toMs(a.activatesAt) - toMs(b.activatesAt) || a.n - b.n)
            .pop() ||
        null;
    renderToday(live, live ? byBuild.get(live.n) : null, now);

    // Timeline: shipped builds + devlog days that produced no build (e.g. a failed day), newest first.
    const items = shipped.map((b) => ({
        at: toMs(b.activatesAt) || 0,
        n: b.n,
        b,
        d: byBuild.get(b.n)
    }));
    for (const e of entries) {
        if (isNum(e.build) && builds.some((b) => b.n === e.build)) continue;
        items.push({ at: toMs(e.date) || 0, n: -1, b: null, d: e });
    }
    items.sort((a, b) => b.at - a.at || b.n - a.n);
    // The live build already has the big card above; the timeline is everything else.
    const rest = items.filter((it) => !live || it.n !== live.n);

    tl.textContent = '';
    const maxN = builds.reduce((m, b) => Math.max(m, b.n), 0);
    if (scheduled.length) for (const b of scheduled.reverse()) tl.append(nextItem(b.n, b));
    else tl.append(nextItem(maxN + 1, null));
    for (const it of rest) tl.append(timelineItem(it.b, it.d));
}

// ---------------------------------------------------------------------------------------------
// 02 · How it works: a token travels the money loop
// ---------------------------------------------------------------------------------------------

function initLoop() {
    const loop = $('#loop');
    const svg = $('#loopTrack');
    const token = $('#loopToken');
    const steps = [...loop.querySelectorAll('.step')];
    const NS = 'http://www.w3.org/2000/svg';
    let pts = [];
    let lens = [];
    let total = 0;
    let rects = [];
    let raf = 0;
    let visible = false;
    let t0 = 0;
    let hot = -1;

    function arrow(x, y, dir) {
        const s = 5;
        const d = {
            r: `M${x - s} ${y - s}L${x + s} ${y}L${x - s} ${y + s}Z`,
            l: `M${x + s} ${y - s}L${x - s} ${y}L${x + s} ${y + s}Z`,
            d: `M${x - s} ${y - s}L${x} ${y + s}L${x + s} ${y - s}Z`,
            u: `M${x - s} ${y + s}L${x} ${y - s}L${x + s} ${y + s}Z`
        }[dir];
        const p = document.createElementNS(NS, 'path');
        p.setAttribute('d', d);
        p.setAttribute('class', 'arw');
        return p;
    }

    function layout() {
        const lr = loop.getBoundingClientRect();
        rects = steps.map((s) => {
            const r = s.getBoundingClientRect();
            const x = r.left - lr.left;
            const y = r.top - lr.top;
            return { x, y, w: r.width, h: r.height, cx: x + r.width / 2, cy: y + r.height / 2 };
        });
        const [a, b] = rects;
        const row = b.y < a.y + a.h / 2;
        const last = rects[rects.length - 1];
        const arrows = [];
        pts = rects.map((r) => [r.cx, r.cy]);
        if (row) {
            const y = Math.round(Math.min(...rects.map((r) => r.cy)));
            pts = rects.map((r) => [r.cx, y]);
            const bottom = Math.max(...rects.map((r) => r.y + r.h)) + 24;
            pts.push([last.cx, bottom], [a.cx, bottom], [a.cx, y]);
            for (let i = 0; i < rects.length - 1; i++) {
                const gx = (rects[i].x + rects[i].w + rects[i + 1].x) / 2;
                arrows.push(arrow(gx, y, 'r'));
            }
            arrows.push(arrow((a.cx + last.cx) / 2, bottom, 'l'));
        } else {
            const x = Math.round(a.cx);
            pts = rects.map((r) => [x, r.cy]);
            const right = lr.width - 12;
            pts.push([right, last.cy], [right, a.cy], [x, a.cy]);
            for (let i = 0; i < rects.length - 1; i++) {
                const gy = (rects[i].y + rects[i].h + rects[i + 1].y) / 2;
                arrows.push(arrow(x, gy, 'd'));
            }
            arrows.push(arrow(right, (a.cy + last.cy) / 2, 'u'));
        }
        lens = [];
        total = 0;
        for (let i = 1; i < pts.length; i++) {
            const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
            lens.push(l);
            total += l;
        }
        svg.textContent = '';
        const pl = document.createElementNS(NS, 'polyline');
        pl.setAttribute('points', pts.map((p) => p.join(',')).join(' '));
        pl.setAttribute('class', 'trk');
        svg.append(pl, ...arrows);
    }

    function pointAt(d) {
        for (let i = 0; i < lens.length; i++) {
            if (d <= lens[i]) {
                const f = lens[i] ? d / lens[i] : 0;
                return [
                    pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f,
                    pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f
                ];
            }
            d -= lens[i];
        }
        return pts[pts.length - 1];
    }

    function frame(t) {
        raf = 0;
        if (!visible || document.hidden || reduceMotion.matches || !total) return;
        if (!t0) t0 = t;
        const period = 9000;
        const d = (((t - t0) % period) / period) * total;
        const [x, y] = pointAt(d);
        token.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        let inside = -1;
        rects.forEach((r, i) => {
            if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) inside = i;
        });
        if (inside !== hot) {
            if (hot >= 0) steps[hot].classList.remove('hot');
            if (inside >= 0) steps[inside].classList.add('hot');
            hot = inside;
        }
        raf = requestAnimationFrame(frame);
    }

    function start() {
        loop.classList.toggle('running', !reduceMotion.matches);
        if (!raf && visible && !reduceMotion.matches) raf = requestAnimationFrame(frame);
    }

    layout();
    if ('ResizeObserver' in window) new ResizeObserver(() => layout()).observe(loop);
    watchVisible(loop, (v) => {
        visible = v;
        if (v) start();
    });
    document.addEventListener('visibilitychange', start);
    reduceMotion.addEventListener?.('change', start);
}

// ---------------------------------------------------------------------------------------------
// 04 · Daily Challenge
// ---------------------------------------------------------------------------------------------

function statusChip(st) {
    if (st === 'verified')
        return h('span', { class: 'badge verified chk' }, ICON_CHECK(), 'verified');
    if (st === 'pending' || !st) return h('span', { class: 'badge pending' }, 'replay check');
    if (st === 'rejected') return h('span', { class: 'badge failed' }, 'rejected');
    return h('span', { class: 'badge pending' }, String(st));
}

function lbHead() {
    return h(
        'thead',
        null,
        h(
            'tr',
            null,
            h('th', { scope: 'col' }, '#'),
            h('th', { scope: 'col' }, 'Player'),
            h('th', { scope: 'col', class: 'num' }, 'Score'),
            h('th', { scope: 'col', class: 'num opt' }, 'Time'),
            h('th', { scope: 'col', class: 'num opt' }, 'Lvl'),
            h('th', { scope: 'col', class: 'num opt' }, 'Kills'),
            h('th', { scope: 'col' }, 'Status')
        )
    );
}

/** Empty board: the table's shape with dashes (no names, no numbers) under a clear message. */
function emptyBoard(pinned) {
    const ghost = [1, 2, 3, 4, 5].map((r) =>
        h(
            'tr',
            null,
            h('td', { class: 'rk' }, String(r)),
            h('td', null, '—'),
            h('td', { class: 'sc num' }, '—'),
            h('td', { class: 'num opt' }, '—'),
            h('td', { class: 'num opt' }, '—'),
            h('td', { class: 'num opt' }, '—'),
            h('td', null, '')
        )
    );
    return h(
        'div',
        { class: 'lb-empty' },
        h(
            'table',
            { class: 'lb ghost', 'aria-hidden': 'true' },
            lbHead(),
            h('tbody', null, ...ghost)
        ),
        h(
            'div',
            { class: 'lb-msg' },
            h('p', { class: 'state-big' }, '0 runs'),
            pinned === 0
                ? h(
                      'p',
                      { class: 'state-k' },
                      "Today's challenge is pinned to Build #0, the untouched original, which can't submit scores. A scored board on the live build opens at 00:00 UTC."
                  )
                : h('p', { class: 'state-k' }, 'No runs yet today. Be the first on the board.'),
            pinned === 0
                ? null
                : h(
                      'a',
                      { class: 'btn btn-go btn-sm', href: $('#chPlay').getAttribute('href') },
                      'Play now'
                  )
        )
    );
}

/** The prize rules, live or not, and the last winners with their payouts. */
async function loadWinners() {
    const w = await getJSON('/api/winners');
    if (!w) return;
    const live = w.status === 'live';
    const flag = $('#prizeFlag');
    flag.textContent = live
        ? 'Live'
        : w.status === 'wallet_pending'
          ? 'Starts when the prize wallet is funded'
          : 'Starts with the coin';
    flag.className = 'flag ' + (live ? 'gold' : 'dim');
    const list = $('#winners');
    const rows = Array.isArray(w.winners) ? w.winners.slice(0, 5) : [];
    list.textContent = '';
    list.hidden = !rows.length;
    for (const r of rows) {
        const what =
            r.status === 'paid'
                ? h(
                      'span',
                      { class: 'w-what paid' },
                      `Paid in $${r.token || 'ANSEM'}`,
                      r.tx
                          ? h(
                                'a',
                                {
                                    href: `https://solscan.io/tx/${r.tx}`,
                                    rel: 'noopener',
                                    target: '_blank'
                                },
                                ' · Solscan ↗'
                            )
                          : null
                  )
                : h(
                      'span',
                      { class: 'w-what' },
                      r.status === 'pending' ? 'Payout in progress' : r.why || 'No prize paid'
                  );
        list.append(
            h(
                'li',
                null,
                h('span', { class: 'w-who' }, `${r.date} · #1 ${r.name} · ${fmtInt(r.score)}`),
                what
            )
        );
    }
}

async function loadChallenge() {
    const [daily, s] = await Promise.all([getJSON('/api/daily'), firstStats]);
    const date = daily && /^\d{4}-\d{2}-\d{2}$/.test(daily.date) ? daily.date : utcDay(Date.now());
    const pinned = daily && isNum(daily.build) ? daily.build : null;
    $('#chDate').textContent = date;
    $('#chBuild').textContent = pinned === null ? '—' : '#' + pinned;
    $('#chStage').textContent = (daily && (daily.stageName || daily.stage)) || '—';
    const tw = daily && daily.twist && typeof daily.twist.name === 'string' ? daily.twist : null;
    $('#chTwistRow').hidden = !tw;
    if (tw) $('#chTwist').textContent = tw.description ? `${tw.name}: ${tw.description}` : tw.name;
    const chPlay = $('#chPlay');
    if (pinned === 0) {
        // Build #0 is the untouched upstream game: it has no scored challenge, so send players to the live build.
        chPlay.setAttribute('href', '/play');
        chPlay.textContent = 'Play the live build';
    } else if (daily) {
        chPlay.setAttribute('href', '/play?challenge=' + date);
        chPlay.textContent = "Play today's challenge";
    }

    // stats.topScoreToday is null when nobody has submitted a run today, so the board is empty.
    const mayHaveRuns = pinned !== 0 && (!s || s.topScoreToday !== null);
    const lb = mayHaveRuns ? await getJSON('/api/leaderboard?date=' + date) : null;
    const box = $('#lb');
    const meta = $('#lbMeta');
    box.textContent = '';
    const list =
        lb && (Array.isArray(lb.rows) ? lb.rows : Array.isArray(lb.entries) ? lb.entries : []);
    const entries = list || [];
    if (!entries.length) {
        meta.textContent = [date, pinned === null ? null : `Build #${pinned}`]
            .filter(Boolean)
            .join(' · ');
        box.append(emptyBoard(pinned));
        return;
    }
    meta.textContent = [
        isNum(lb.total) ? `${fmtInt(lb.total)} run${lb.total === 1 ? '' : 's'}` : null,
        isNum(lb.build) ? `Build #${lb.build}` : null
    ]
        .filter(Boolean)
        .join(' · ');
    const rows = entries
        .slice(0, 20)
        .map((e, i) =>
            h(
                'tr',
                { class: (e.rank || i + 1) === 1 ? 'first' : null },
                h('td', { class: 'rk' }, String(e.rank || i + 1)),
                h('td', { class: 'nm' }, h('span', null, e.name ? String(e.name) : 'anon')),
                h('td', { class: 'sc num' }, fmtInt(e.score)),
                h('td', { class: 'num opt' }, mss(e.timeMs)),
                h('td', { class: 'num opt' }, isNum(e.level) ? String(e.level) : '—'),
                h('td', { class: 'num opt' }, fmtInt(e.kills)),
                h('td', null, statusChip(e.status))
            )
        );
    box.append(
        h(
            'table',
            { class: 'lb' },
            h('caption', { class: 'sr-only' }, "Today's Daily Challenge leaderboard"),
            lbHead(),
            h('tbody', null, ...rows)
        )
    );
}

// ---------------------------------------------------------------------------------------------
// 05 · Receipts: wallets + ledger
// ---------------------------------------------------------------------------------------------

const CATEGORY = {
    creator_fees: 'Creator fees',
    compute: 'AI compute',
    hosting: 'Hosting',
    prize: 'Daily prize',
    sweep: 'Sweep',
    launch: 'Launch',
    other: 'Other'
};

function copyButton(value, label) {
    const btn = h(
        'button',
        { class: 'btn btn-sm', type: 'button', 'aria-label': 'Copy ' + label },
        'Copy'
    );
    btn.addEventListener('click', async () => {
        const ok = await copyText(value);
        btn.textContent = ok ? 'Copied' : 'Copy failed';
        setTimeout(() => (btn.textContent = 'Copy'), 1600);
    });
    return btn;
}

function renderWallets(w, balances) {
    const any = [...document.querySelectorAll('[data-wallet]')].some((el) => {
        const v = w && w[el.getAttribute('data-wallet')];
        return typeof v === 'string' && B58.test(v);
    });
    // Before launch the three wallets are one compact row instead of three empty cards.
    $('#wallets').classList.toggle('none', !any);
    for (const el of document.querySelectorAll('[data-wallet]')) {
        const key = el.getAttribute('data-wallet');
        const addr = w && typeof w[key] === 'string' && B58.test(w[key]) ? w[key] : null;
        const val = $('.w-val', el);
        val.textContent = '';
        if (!addr) {
            val.append(h('span', { class: 'w-empty' }, 'Not created yet'));
            continue;
        }
        val.append(
            h('code', { title: addr }, shortAddr(addr)),
            copyButton(addr, el.querySelector('.k').textContent),
            h(
                'a',
                { href: `https://solscan.io/account/${addr}`, rel: 'noopener', target: '_blank' },
                'Solscan ↗'
            )
        );
        const bal = balances && balances[key];
        if (isNum(bal)) val.append(h('span', { class: 'w-bal' }, `${bal.toFixed(3)} SOL`));
    }
}

function amountText(r) {
    const parts = [];
    if (isNum(r.amountSol)) parts.push(`${+r.amountSol.toFixed(4)} SOL`);
    if (r.tokenAmount !== null && r.tokenAmount !== undefined && r.tokenAmount !== '') {
        const sym =
            r.tokenMint === ANSEM_MINT
                ? '$ANSEM'
                : r.tokenMint && B58.test(r.tokenMint)
                  ? shortAddr(r.tokenMint)
                  : 'tokens';
        parts.push(`${r.tokenAmount} ${sym}`);
    }
    if (!parts.length && isNum(r.usdEstimate)) parts.push(`≈ ${usd(r.usdEstimate)}`);
    return parts.join(' + ') || '—';
}

function txLink(r) {
    const url =
        (r.solscan && safeUrl(r.solscan, ['solscan.io'])) ||
        (typeof r.tx === 'string' && SIG.test(r.tx) ? `https://solscan.io/tx/${r.tx}` : null);
    if (url) return h('a', { href: url, rel: 'noopener', target: '_blank' }, 'Solscan ↗');
    return h('span', { class: 'k' }, r.source === 'chain' ? 'pending' : 'off-chain');
}

async function loadLedger() {
    const s = await firstStats;
    const data = await getJSON('/api/ledger');
    const wallets = (data && data.wallets) || {};
    if (!wallets.treasury && s && s.treasury && s.treasury.wallet)
        wallets.treasury = s.treasury.wallet;
    const t = (s && s.treasury) || {};
    renderWallets(wallets, { treasury: t.balance, prize: t.prizeWalletBalance });

    const box = $('#ledger');
    box.textContent = '';
    const rows = data && Array.isArray(data.entries) ? data.entries : [];
    if (!rows.length) {
        box.append(
            h(
                'div',
                { class: 'state' },
                h('p', { class: 'state-big' }, '0 transactions'),
                h(
                    'p',
                    { class: 'state-k' },
                    'No transactions yet. The ledger reads the treasury wallet from chain every 15 minutes.'
                )
            )
        );
        return;
    }
    box.append(
        h(
            'table',
            { class: 'lg' },
            h('caption', { class: 'sr-only' }, 'Treasury ledger'),
            h(
                'thead',
                null,
                h(
                    'tr',
                    null,
                    ...['Time (UTC)', 'Flow', 'What', 'Amount', 'Memo', 'Tx', 'Number'].map((t) =>
                        h('th', { scope: 'col' }, t)
                    )
                )
            ),
            h(
                'tbody',
                null,
                ...rows.slice(0, 100).map((r) => {
                    const ms = toMs(r.ts);
                    const dir = r.direction === 'in' ? 'in' : 'out';
                    return h(
                        'tr',
                        null,
                        h('td', { 'data-l': 'Time' }, ms ? utcStamp(ms).replace(' UTC', '') : '—'),
                        h('td', { class: dir }, dir === 'in' ? '+ IN' : '− OUT'),
                        h(
                            'td',
                            { 'data-l': 'What' },
                            CATEGORY[r.category] || String(r.category || '—')
                        ),
                        h('td', { class: 'amt ' + dir }, amountText(r)),
                        h('td', { class: 'memo' }, r.memo ? String(r.memo) : ''),
                        h('td', null, txLink(r)),
                        h(
                            'td',
                            null,
                            h(
                                'span',
                                { class: 'badge ' + (r.measured ? 'verified' : 'pending') },
                                r.measured ? 'measured' : 'estimate'
                            )
                        )
                    );
                })
            )
        )
    );
}

// ---------------------------------------------------------------------------------------------
// 06 · The coin
// ---------------------------------------------------------------------------------------------

let coinBound = false;
function renderCoin(s) {
    const mint =
        s && s.token && typeof s.token.mint === 'string' && B58.test(s.token.mint)
            ? s.token.mint
            : null;
    const val = $('#caVal');
    const copy = $('#caCopy');
    const buy = $('#buyLink');
    if (!mint) return;
    val.textContent = mint;
    val.classList.remove('empty');
    copy.disabled = false;
    if (!coinBound) {
        coinBound = true;
        copy.addEventListener('click', async () => {
            const ok = await copyText(mint);
            $('#caCopied').textContent = ok
                ? 'Contract address copied.'
                : 'Copy failed. Select the address and copy it by hand.';
            setTimeout(() => ($('#caCopied').textContent = ''), 2400);
        });
    }
    buy.href = `https://pump.fun/coin/${mint}`;
    buy.rel = 'noopener';
    buy.target = '_blank';
    buy.removeAttribute('aria-disabled');
    buy.classList.remove('is-off');
    $('#buyNote').textContent = 'Opens pump.fun in a new tab. Check the address above matches.';
    for (const el of document.querySelectorAll('[data-launched]'))
        el.textContent = el.getAttribute('data-launched');
    $('#footCoin').textContent =
        "The coin funds the AI's compute and gives holders a vote on what gets built. It is not an investment and it is never required to play or win.";
    const fine = $('#howFine');
    if (fine)
        fine.textContent =
            'Compute and hosting are billed to Osman, and the treasury pays them back on-chain to the costs wallet with a memo per day. The ledger shows every payment.';
}

// ---------------------------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------------------------

function boot() {
    initBar();
    if (!document.hidden) poster = createPoster($('#poster'));
    else
        document.addEventListener(
            'visibilitychange',
            () => {
                if (!poster) poster = createPoster($('#poster'));
            },
            { once: true }
        );

    loadStats();
    setInterval(() => {
        if (!document.hidden) loadStats();
    }, STATS_POLL_MS);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && Date.now() - state.statsAt > STATS_POLL_MS) loadStats();
    });
    tick();

    if (REPO_URL) {
        const url = `${REPO_URL.replace(/\/+$/, '')}/compare/day-0...main`;
        $('#diffLink').append(' · ', h('a', { href: url, rel: 'noopener' }, 'view the diff'));
    }

    whenNear($('#build'), loadBuilds, '800px');
    whenNear($('#loop'), initLoop, '400px');
    whenNear(
        $('#challenge'),
        () => {
            loadChallenge();
            loadWinners();
            // The board moves while people play: refresh it every minute while the tab is visible.
            setInterval(() => document.visibilityState === 'visible' && loadChallenge(), 60000);
        },
        '800px'
    );
    whenNear($('#receipts'), loadLedger, '800px');
}

boot();
