/*
 * BEARPROOF HQ v2. Every value on the page is live API data or a designed empty state. Nothing is invented,
 * and every fetch fails soft: a network error leaves the designed state, never an exception.
 *
 *   /api/stats        day, builds, live build, next build, treasury, token, players, top score   (polled)
 *   /api/agent/live   last night's Build Agent session (replayed), or tonight's while it runs   (polled at night)
 *   /api/builds       build manifest          /devlog.json   devlog entries        (latest card + timeline)
 *   /api/daily        today's challenge       /api/pot       today's Daily Pot     /api/leaderboard  today's board
 *   /api/winners      the last payouts        /api/vote      the ballot (vote.js does the voting)
 *   /api/ledger       wallets + the last on-chain moves
 */

const REPO = 'https://github.com/0smanturgut/bearproof';
const ANSEM_MINT = '9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump';
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SIG = /^[1-9A-HJ-NP-Za-km-z]{43,90}$/;
const SHA = /^[0-9a-f]{7,40}$/i;
const STATS_POLL_MS = 30000;

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const saveData = !!(navigator.connection && navigator.connection.saveData);

// ------------------------------------------------------------------------------------------- helpers

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props)
        for (const [k, v] of Object.entries(props)) {
            if (v === null || v === undefined || v === false) continue;
            if (k === 'class') el.className = v;
            else if (k === 'style') el.style.cssText = v;
            else if (k.startsWith('on') && typeof v === 'function')
                el.addEventListener(k.slice(2), v);
            else el.setAttribute(k, v === true ? '' : String(v));
        }
    for (const k of kids.flat()) {
        if (k === null || k === undefined || k === false) continue;
        el.append(k instanceof Node ? k : document.createTextNode(String(k)));
    }
    return el;
}

async function getJSON(url, timeoutMs = 8000) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
        const r = await fetch(url, {
            headers: { accept: 'application/json' },
            cache: 'no-cache',
            signal: ctl.signal
        });
        return r.ok ? await r.json() : null;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

const toMs = (t) => {
    const v = typeof t === 'number' ? t : Date.parse(t);
    return Number.isFinite(v) ? v : null;
};
const pad = (n) => String(n).padStart(2, '0');
const hms = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};
const mss = (ms) => {
    if (!isNum(ms)) return '—';
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${pad(s % 60)}`;
};
const clockOf = (ms) => new Date(ms).toISOString().slice(11, 19);
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const niceDay = (ms) => {
    const d = new Date(ms);
    return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};
const fmtInt = (n) => (isNum(n) ? Math.round(n).toLocaleString('en-US') : '—');
const usd = (n) =>
    `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const sol = (n, d = 3) => `${Number(n).toLocaleString('en-US', { maximumFractionDigits: d })} SOL`;
const ansem = (raw) => (Number(raw) / 1e6).toLocaleString('en-US', { maximumFractionDigits: 2 });
const tokenAmount = (raw, token) =>
    token === 'SOL'
        ? `${(Number(raw) / 1e9).toFixed(3)} SOL`
        : `${ansem(raw)} $${token || 'ANSEM'}`;
const short = (a) => (a && a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a || '');
const nextMidnight = (ms) => {
    const d = new Date(ms);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
};

function safeUrl(u, hosts) {
    try {
        const url = new URL(u);
        return url.protocol === 'https:' &&
            hosts.some((x) => url.hostname === x || url.hostname.endsWith('.' + x))
            ? url.href
            : null;
    } catch {
        return null;
    }
}

/** Runs fn once, when el comes within `margin` of the viewport. */
function whenNear(el, fn, margin = '700px') {
    if (!el) return;
    if (!('IntersectionObserver' in window)) return fn();
    const io = new IntersectionObserver(
        (es) => {
            if (es.some((e) => e.isIntersecting)) {
                io.disconnect();
                fn();
            }
        },
        { rootMargin: margin }
    );
    io.observe(el);
}

async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        const t = h('textarea', { style: 'position:fixed;top:0;left:0;opacity:0', readonly: true });
        t.value = text;
        document.body.append(t);
        t.focus({ preventScroll: true });
        t.select();
        let ok = false;
        try {
            ok = document.execCommand('copy');
        } catch {
            ok = false;
        }
        t.remove();
        return ok;
    }
}

let toastTimer = 0;
function toast(text) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = text;
    el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('on'), 2200);
}

/** Counts a number up the first time it is shown; later updates just set it. */
const counted = new WeakSet();
function setNumber(el, value, format, html = null) {
    if (!el) return;
    const done = () => {
        if (html) el.innerHTML = html;
        else el.textContent = format(value);
    };
    if (counted.has(el) || reduced.matches || !isNum(value) || value <= 0) {
        counted.add(el);
        return done();
    }
    counted.add(el);
    const t0 = performance.now();
    const dur = 1100;
    const step = (t) => {
        const k = Math.min(1, (t - t0) / dur);
        const e = 1 - Math.pow(1 - k, 3);
        if (k < 1) {
            el.textContent = format(value * e);
            requestAnimationFrame(step);
        } else done();
    };
    requestAnimationFrame(step);
}

// ------------------------------------------------------------------------------------------- state

const state = {
    stats: null,
    nextBuildAt: nextMidnight(Date.now()),
    agent: null, // { status, build }
    vote: null,
    mint: null
};
let resolveStats;
const firstStats = new Promise((r) => (resolveStats = r));

// ------------------------------------------------------------------------------------------- nav

function initNav() {
    const nav = $('#nav');
    const onScroll = () => nav.classList.toggle('solid', scrollY > 12);
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    const btn = $('#navMenu');
    const sheet = $('#sheet');
    const close = () => {
        sheet.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
        nav.classList.toggle('solid', scrollY > 12);
    };
    btn.addEventListener('click', () => {
        const open = sheet.hidden;
        sheet.hidden = !open;
        btn.setAttribute('aria-expanded', String(open));
        if (open) nav.classList.add('solid');
        else close();
    });
    sheet.addEventListener('click', (e) => e.target.closest('a') && close());
    addEventListener('keydown', (e) => e.key === 'Escape' && !sheet.hidden && close());
}

// ------------------------------------------------------------------------------------------- contract address

function renderCa(mint) {
    if (!mint || state.mint === mint) return;
    state.mint = mint;
    for (const box of $$('[data-ca]')) {
        const v = $('[data-ca-v]', box);
        v.textContent = mint;
        v.title = mint;
        const btn = $('[data-ca-copy]', box);
        btn.disabled = false;
        btn.addEventListener('click', async () => {
            const ok = await copyText(mint);
            const label = $('span', btn);
            btn.classList.toggle('done', ok);
            label.textContent = ok ? 'Copied' : 'Copy failed';
            toast(
                ok
                    ? 'Contract address copied'
                    : 'Copy failed. Select the address and copy it by hand.'
            );
            setTimeout(() => {
                btn.classList.remove('done');
                label.textContent = 'Copy';
            }, 1800);
        });
    }
    const mini = $('#navCa');
    $('#navCaV').textContent = short(mint);
    mini.hidden = false;
    mini.addEventListener('click', async () =>
        toast((await copyText(mint)) ? 'Contract address copied' : 'Copy failed')
    );
    const links = {
        pump: `https://pump.fun/coin/${mint}`,
        jup: `https://jup.ag/swap/SOL-${mint}`,
        dex: `https://dexscreener.com/solana/${mint}`
    };
    for (const a of $$('[data-buy]')) a.href = links[a.dataset.buy];
}

// ------------------------------------------------------------------------------------------- stats

async function loadStats() {
    const s = await getJSON('/api/stats');
    if (s) {
        state.stats = s;
        state.statsAt = Date.now();
        const next = toMs(s.nextBuildAt);
        if (next) state.nextBuildAt = next;
        renderStats(s);
    } else if (!state.stats) {
        $('#heroPillText').textContent = 'Live numbers offline · the game still works';
    }
    resolveStats(s);
}

function renderStats(s) {
    setNumber($('#nDay'), s.day, (v) => fmtInt(v));
    setNumber($('#nBuilds'), s.buildsShipped, (v) => fmtInt(v));
    setNumber($('#nPlayers'), s.playersToday, (v) => fmtInt(v));
    const top = s.topScoreToday;
    if (top && isNum(top.score)) setNumber($('#nTop'), top.score, (v) => fmtInt(v));
    else $('#nTop').textContent = '0';
    const t = s.treasury || {};
    if (isNum(t.balance))
        setNumber(
            $('#nTreasury'),
            t.balance,
            (v) => v.toFixed(3),
            `${t.balance.toFixed(3)}<small>SOL</small>`
        );
    const spent = s.computeSpentUsd && s.computeSpentUsd.measured;
    if (isNum(spent)) setNumber($('#nSpent'), spent, (v) => usd(v));

    if (s.token && B58.test(s.token.mint || '')) renderCa(s.token.mint);
    renderScreen(s);
    renderPill();
    renderReceiptTiles(s);
    const tg = s.community && safeUrl(s.community.telegram, ['t.me']);
    if (tg) {
        for (const el of $$('[data-tg-link]')) el.href = tg;
        for (const el of $$('[data-tg]')) el.hidden = false;
    }
}

function updatedLine() {
    const el = $('#updated');
    if (!el || !state.statsAt) return;
    const s = Math.round((Date.now() - state.statsAt) / 1000);
    el.textContent = `Live from the chain and the game server · updated ${s < 5 ? 'just now' : `${s}s ago`}`;
}

// ------------------------------------------------------------------------------------------- hero pill + clocks

function renderPill() {
    const pill = $('#heroPill');
    const text = $('#heroPillText');
    const s = state.stats;
    const a = state.agent;
    const live = s && s.liveBuild;
    text.textContent = '';
    pill.classList.remove('building');
    if (a && a.status === 'running') {
        pill.classList.add('building');
        text.append(
            h(
                'a',
                { href: '/live' },
                `The AI is coding Build #${a.build || (live ? live.n + 1 : '')} right now · watch →`
            )
        );
        return;
    }
    if (!live) {
        text.textContent = 'Live · connecting…';
        return;
    }
    const ready = a && a.status === 'done' && isNum(a.build) && a.build > live.n;
    text.append(
        `Live · Build #${live.n} · `,
        ready ? `#${a.build} is built, ships in ` : 'next build in ',
        h('b', { 'data-countdown': '' }, hms(state.nextBuildAt - Date.now()))
    );
}

function tick() {
    const now = Date.now();
    if (now >= state.nextBuildAt) {
        // Midnight passed: a new build and a new challenge. Refresh what changed.
        state.nextBuildAt = nextMidnight(now);
        loadStats();
    }
    const left = hms(state.nextBuildAt - now);
    for (const el of $$('[data-countdown]')) el.textContent = left;
    const clock = $('#clock');
    if (clock) clock.textContent = `${clockOf(now)} UTC`;
    stepLines();
    updatedLine();
    setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
}

// ------------------------------------------------------------------------------------------- the four steps

const steps = { pot: null };
function stepLines() {
    const s = state.stats;
    const set = (id, text) => {
        const el = $(id);
        if (el && el.textContent !== text) el.textContent = text;
    };
    const pot = steps.pot;
    if (pot && pot.measured && isNum(pot.feesSol))
        set('#stepFund', `Fees today: ${sol(pot.feesSol)}, on-chain`);
    else if (s && s.treasury && isNum(s.treasury.balance))
        set('#stepFund', `Treasury: ${sol(s.treasury.balance)}, on-chain`);
    const a = state.agent;
    if (a && a.status === 'running') set('#stepBuild', `Coding Build #${a.build || ''} right now`);
    else set('#stepBuild', `Next build in ${hms(state.nextBuildAt - Date.now())}`);
    if (pot && isNum(pot.potSol) && pot.status === 'on')
        set('#stepPlay', `Today's pot: ${sol(pot.potSol)} in $ANSEM`);
    else if (s && isNum(s.playersToday))
        set('#stepPlay', `${fmtInt(s.playersToday)} players today`);
    const v = state.vote;
    if (v && v.status === 'open')
        set('#stepSteer', `Vote open · closes in ${hms(toMs(v.closesAt) - Date.now())}`);
    else if (v && v.status === 'closed')
        set(
            '#stepSteer',
            v.winner ? `Tonight: ${v.winner.title}` : 'Vote closed · new ballot at 00:00 UTC'
        );
}

// ------------------------------------------------------------------------------------------- hero background: a market that never stops

function heroBackground() {
    const canvas = $('#heroBg');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, devicePixelRatio || 1);
    let W = 0;
    let H = 0;
    let candles = [];
    let price = 0.55;
    let off = 0;
    let visible = true;
    const STEP = 16;
    const next = () => {
        // a bear market with fight in it: drifts down, bounces hard
        const drift = Math.random() < 0.5 ? -0.028 : 0.022;
        const o = price;
        const c = Math.min(0.85, Math.max(0.2, o + drift * (0.4 + Math.random())));
        const hi = Math.max(o, c) + Math.random() * 0.03;
        const lo = Math.min(o, c) - Math.random() * 0.03;
        price = c;
        return { o, c, hi, lo };
    };
    const resize = () => {
        const r = canvas.getBoundingClientRect();
        W = Math.round(r.width * dpr);
        H = Math.round(r.height * dpr);
        canvas.width = W;
        canvas.height = H;
        const n = Math.ceil(r.width / STEP) + 3;
        while (candles.length < n) candles.push(next());
        draw();
    };
    const draw = () => {
        ctx.clearRect(0, 0, W, H);
        // dot grid
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        const g = 32 * dpr;
        for (let y = g / 2; y < H; y += g)
            for (let x = g / 2 - ((off * dpr * 0.3) % g); x < W; x += g)
                ctx.fillRect(x, y, dpr, dpr);
        const s = STEP * dpr;
        const shift = (off * dpr) % s;
        const top = H * 0.12;
        const span = H * 0.62;
        const Y = (v) => top + (1 - v) * span;
        let prev = null;
        ctx.lineWidth = 1.5 * dpr;
        for (let i = 0; i < candles.length; i++) {
            const c = candles[i];
            const x = i * s - shift;
            const up = c.c >= c.o;
            const fade = Math.min(1, Math.max(0, (x / W) * 1.6 - 0.05));
            const a = 0.05 + fade * 0.14;
            ctx.fillStyle = up ? `rgba(22,224,138,${a})` : `rgba(255,59,92,${a})`;
            ctx.fillRect(x + s * 0.5 - dpr / 2, Y(c.hi), dpr, Y(c.lo) - Y(c.hi));
            const y0 = Y(Math.max(c.o, c.c));
            ctx.fillRect(x + s * 0.2, y0, s * 0.6, Math.max(dpr * 2, Y(Math.min(c.o, c.c)) - y0));
            if (prev) {
                ctx.strokeStyle = `rgba(22,224,138,${0.06 + fade * 0.22})`;
                ctx.beginPath();
                ctx.moveTo(prev.x, prev.y);
                ctx.lineTo(x + s * 0.5, Y(c.c));
                ctx.stroke();
            }
            prev = { x: x + s * 0.5, y: Y(c.c) };
        }
    };
    let last = 0;
    const frame = (t) => {
        if (!visible || reduced.matches) return;
        const dt = Math.min(0.05, (t - (last || t)) / 1000);
        last = t;
        off += dt * 14;
        if (off >= STEP) {
            off -= STEP;
            candles.shift();
            candles.push(next());
        }
        draw();
        requestAnimationFrame(frame);
    };
    new IntersectionObserver((es) => {
        visible = es[0].isIntersecting;
        if (visible && !reduced.matches) {
            last = 0;
            requestAnimationFrame(frame);
        }
    }).observe(canvas);
    addEventListener('resize', resize);
    resize();
}

// ------------------------------------------------------------------------------------------- the live screen

let mounted = null;
function renderScreen(s) {
    const live = s && s.liveBuild;
    const title = $('#screenTitle');
    if (!live) return;
    title.textContent = `Build #${live.n} · ${live.title || ''}`;
    $('#screenTap').setAttribute('aria-label', `Tap to play Build #${live.n}`);
    if (reduced.matches || saveData) {
        $('#screenCap').textContent = `Build #${live.n} is live. Tap to play.`;
        return;
    }
    if (mounted === live.n) return;
    if (mounted !== null) {
        // A new build went live while the page was open: reload the view (/play resolves to it).
        const f = $('#screenView iframe');
        if (f) f.src = '/play?attract=1';
        mounted = live.n;
        return;
    }
    mounted = live.n;
    const go = () =>
        whenNear(
            $('#screen'),
            () => {
                const f = h('iframe', {
                    src: '/play?attract=1',
                    title: `BEARPROOF Build #${live.n}, playing itself`,
                    tabindex: '-1',
                    inert: true,
                    allow: 'autoplay'
                });
                f.addEventListener('load', () => setTimeout(() => f.classList.add('on'), 400), {
                    once: true
                });
                $('#screenView').insertBefore(f, $('#screenTap'));
            },
            '0px'
        );
    if (document.readyState === 'complete') go();
    else addEventListener('load', go, { once: true });
}

function screenTilt() {
    const screen = $('#screen');
    const frame = $('.screen-frame', screen);
    if (!screen || reduced.matches || !matchMedia('(hover: hover) and (min-width: 1041px)').matches)
        return;
    let raf = 0;
    const hero = $('.hero');
    hero.addEventListener('pointermove', (e) => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
            const r = screen.getBoundingClientRect();
            const x = (e.clientX - (r.left + r.width / 2)) / innerWidth;
            const y = (e.clientY - (r.top + r.height / 2)) / innerHeight;
            frame.style.setProperty('--ry', `${-7 + x * 10}deg`);
            frame.style.setProperty('--rx', `${3 - y * 6}deg`);
        });
    });
    hero.addEventListener('pointerleave', () => {
        frame.style.removeProperty('--ry');
        frame.style.removeProperty('--rx');
    });
}

// ------------------------------------------------------------------------------------------- the Build Agent: replay or live

const term = { events: [], shown: 0, timer: 0, live: false, lastId: 0, run: null };
const TERM_KEEP = 18;

function pickEvents(events) {
    // Everything the AI says and does that a person can follow; tool calls only when they change code.
    return events.filter(
        (e) =>
            e &&
            typeof e.text === 'string' &&
            e.text.trim() &&
            (e.type !== 'tool' ||
                /^(Editing|Writing|Creating|Running npm|Running node --test)/.test(e.text))
    );
}

function termLine(e, typing) {
    const ms = toMs(e.ts);
    const text = e.type === 'tool' ? `$ ${e.text}` : e.text;
    const li = h(
        'li',
        { class: `t-${e.type}` },
        h('time', null, ms ? clockOf(ms).slice(0, 8) : ''),
        h('span', { class: typing ? 'caret' : null }, typing ? '' : text)
    );
    if (typing) {
        const span = li.lastChild;
        let i = 0;
        const chunk = Math.max(2, Math.ceil(text.length / 40));
        const type = () => {
            i = Math.min(text.length, i + chunk);
            span.textContent = text.slice(0, i);
            if (i < text.length) setTimeout(type, 16);
            else span.classList.remove('caret');
        };
        type();
    }
    return li;
}

function pushLine(e, typing = !reduced.matches) {
    const body = $('#termBody');
    body.append(termLine(e, typing));
    while (body.children.length > TERM_KEEP) body.firstChild.remove();
}

function replay() {
    clearTimeout(term.timer);
    if (term.live || !term.events.length) return;
    if (term.shown >= term.events.length) {
        term.timer = setTimeout(() => {
            term.shown = 0;
            $('#termBody').textContent = '';
            replay();
        }, 7000);
        return;
    }
    const e = term.events[term.shown++];
    pushLine(e);
    const pause = e.type === 'tool' ? 380 : e.type === 'say' ? 1500 : 1000;
    term.timer = setTimeout(replay, pause);
}

async function loadAgent(first = false) {
    const d = await getJSON('/api/agent/live');
    if (!d) {
        if (first)
            $('#termBody').append(
                h('li', null, h('time'), h('span', null, 'The session log is offline right now.'))
            );
        return;
    }
    state.agent = { status: d.status, build: d.build };
    renderPill();
    $('#navLive').classList.toggle('on', d.status === 'running');
    const events = pickEvents(Array.isArray(d.events) ? d.events : []);
    const running = d.status === 'running';
    const started = toMs(d.startedAt);
    const ended = toMs(d.updatedAt);
    $('#termTitle').textContent =
        `build-agent · Build #${d.build || '—'}` +
        (started
            ? ` · ${niceDay(started)}, ${clockOf(started).slice(0, 5)}${!running && ended ? `–${clockOf(ended).slice(0, 5)}` : ''} UTC`
            : '');
    const sub = $('#buildSub');
    sub.textContent = '';
    if (running)
        sub.append(
            `This is the AI's session right now, live: it is writing Build #${d.build || ''} and ships it at 00:00 UTC. The full control room is at `,
            h('a', { href: '/live' }, '/live'),
            '.'
        );
    else
        sub.append(
            "This is last night's real session log, replayed. Tonight's is streamed live at ",
            h('a', { href: '/live' }, '/live'),
            ' from 21:00 UTC.'
        );
    const st = $('#termState');
    st.textContent = running ? 'live now' : 'replay';
    st.classList.toggle('live', running);

    if (running) {
        // Live: show the latest lines at once, then append new ones as they arrive.
        const fresh = d.run !== term.run;
        if (!term.live || fresh) {
            term.live = true;
            term.run = d.run;
            clearTimeout(term.timer);
            $('#termBody').textContent = '';
            for (const e of events.slice(-TERM_KEEP)) pushLine(e, false);
        } else {
            for (const e of events) if (e.id > term.lastId) pushLine(e);
        }
        term.lastId = events.reduce((m, e) => Math.max(m, e.id || 0), term.lastId);
        return;
    }
    const wasLive = term.live;
    term.live = false;
    if (first || wasLive || d.run !== term.run) {
        term.run = d.run;
        term.events = events;
        term.shown = Math.max(0, 0);
        $('#termBody').textContent = '';
        if (reduced.matches) for (const e of events.slice(-TERM_KEEP)) pushLine(e, false);
        else replay();
    }
}

function agentLoop() {
    let first = true;
    const run = async () => {
        await loadAgent(first);
        first = false;
        // Around the nightly session check often; otherwise now and then.
        const hr = new Date().getUTCHours();
        const running = state.agent && state.agent.status === 'running';
        setTimeout(run, running ? 8000 : hr >= 20 && hr <= 23 ? 30000 : 300000);
    };
    run();
}

// ------------------------------------------------------------------------------------------- latest build + timeline

const WHO = {
    agent: 'AI · nightly',
    bootstrap: 'AI · bootstrap',
    human: 'human',
    upstream: 'original'
};

function costText(b, d) {
    const mode = (b && b.mode) || (d && d.mode);
    if (mode === 'upstream') return 'no AI work';
    const pick = (v) => (isNum(v) && v > 0 ? v : null);
    const val = pick(d && d.costUsd) ?? pick(b && b.costUsd);
    if (val === null) return mode === 'bootstrap' ? 'unmetered' : 'not metered';
    return `${usd(val)} ${d && d.costMeasured === true ? 'measured' : 'estimate'}`;
}

function buildTitle(b, d) {
    if (b && b.mode === 'upstream') return 'The untouched original';
    return (d && d.title) || (b && b.title) || (b ? `Build #${b.n}` : 'No build');
}

function renderLatest(live, d) {
    if (!live) return;
    const at = toMs(live.activatesAt);
    $('#latestN').textContent = `#${live.n}`;
    $('#latestTitle').textContent = buildTitle(live, d);
    $('#latestDate').textContent = at ? `Shipped ${niceDay(at)}, 00:00 UTC` : '';
    $('#latestSum').textContent =
        (d && d.summary) ||
        (live.n === 0 ? 'The untouched open-source game the AI started from.' : '');
    const chips = $('#latestChips');
    chips.textContent = '';
    chips.append(h('li', null, 'cost ', h('b', null, costText(live, d))));
    if (d && d.chosenBy)
        chips.append(
            h(
                'li',
                null,
                d.chosenBy === 'holders'
                    ? 'chosen in the vote'
                    : d.chosenBy === 'agent'
                      ? 'chosen by the AI'
                      : `chosen by ${d.chosenBy}`
            )
        );
    chips.append(h('li', null, 'by ', h('b', null, WHO[live.mode] || live.mode || '—')));
    if (SHA.test(live.commit || ''))
        chips.append(
            h(
                'li',
                null,
                'commit ',
                h(
                    'a',
                    { href: `${REPO}/commit/${live.commit}`, rel: 'noopener', target: '_blank' },
                    live.commit.slice(0, 7)
                )
            )
        );
    $('#latestPlay').href = `/b/${live.n}/`;
    if (d) $('#latestLog').href = `${REPO}/blob/main/devlog/build-${live.n}.md`;
}

function buildCard(b, d, live) {
    const at = b ? toMs(b.activatesAt) : d ? toMs(d.date) : null;
    const mode = b ? b.mode : d && d.mode;
    const failed = d && d.status && d.status !== 'shipped';
    const cls = ['bc'];
    if (live) cls.push('live');
    if (b && b.n === 0) cls.push('zero');
    return h(
        'li',
        null,
        h(
            'article',
            { class: cls.join(' ') },
            h(
                'div',
                { class: 'bc-top' },
                h('span', { class: 'bc-n' }, b ? `#${b.n}` : '—'),
                h('span', { class: 'bc-d' }, live ? 'LIVE NOW' : at ? niceDay(at) : '')
            ),
            h(
                'span',
                { class: `bc-who ${mode || ''}` },
                failed ? String(d.status) : b && b.revoked ? 'revoked' : WHO[mode] || mode || '—'
            ),
            h('h4', { class: 'bc-t' }, buildTitle(b, d)),
            d && d.summary
                ? h('p', { class: 'bc-s' }, d.summary)
                : b && b.n === 0
                  ? h(
                        'p',
                        { class: 'bc-s' },
                        'The open-source game the AI started from, untouched.'
                    )
                  : null,
            h(
                'div',
                { class: 'bc-f' },
                h('span', null, costText(b, d)),
                b
                    ? h(
                          'a',
                          {
                              class: 'bc-play',
                              href: `/b/${b.n}/`,
                              'aria-label': `Play Build #${b.n}`
                          },
                          '▶ Play'
                      )
                    : null
            )
        )
    );
}

function nextCard(n, scheduled) {
    return h(
        'li',
        null,
        h(
            'article',
            { class: 'bc next' },
            h(
                'div',
                { class: 'bc-top' },
                h('span', { class: 'bc-n' }, `#${n}`),
                h('span', { class: 'bc-d' }, scheduled ? 'READY' : 'TONIGHT')
            ),
            h('span', { class: 'bc-who' }, scheduled ? 'built and tested' : 'from 21:00 UTC'),
            h(
                'h4',
                { class: 'bc-t' },
                scheduled ? scheduled.title || `Build #${n}` : 'The next build'
            ),
            h(
                'p',
                { class: 'bc-s' },
                scheduled
                    ? 'It goes live at 00:00 UTC.'
                    : 'You vote for it, the AI codes it live, and it ships at midnight. '
            ),
            h(
                'p',
                { class: 'bc-clock', 'data-countdown': '' },
                hms(state.nextBuildAt - Date.now())
            ),
            h(
                'div',
                { class: 'bc-f' },
                h('span', null, 'ships 00:00 UTC'),
                h('a', { class: 'bc-play', href: '/live' }, 'Watch')
            )
        )
    );
}

async function loadBuilds() {
    const [data, dl, s] = await Promise.all([
        getJSON('/api/builds'),
        getJSON('/devlog.json'),
        firstStats
    ]);
    const tl = $('#timeline');
    if (!data || !Array.isArray(data.builds)) {
        $('#latestTitle').textContent = 'The build log is offline right now';
        return;
    }
    const now = Date.now();
    const builds = data.builds.filter((b) => b && isNum(b.n));
    const entries =
        dl && Array.isArray(dl.entries) ? dl.entries.filter((e) => e && typeof e === 'object') : [];
    const byBuild = new Map(entries.filter((e) => isNum(e.build)).map((e) => [e.build, e]));
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
    renderLatest(live, live ? byBuild.get(live.n) : null);

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
    tl.textContent = '';
    const maxN = builds.reduce((m, b) => Math.max(m, b.n), 0);
    if (scheduled.length) for (const b of scheduled.reverse()) tl.append(nextCard(b.n, b));
    else tl.append(nextCard(maxN + 1, null));
    for (const it of items) tl.append(buildCard(it.b, it.d, live && it.b && it.b.n === live.n));
    $('#tlCount').textContent = String(shipped.filter((b) => b.n > 0).length);
    timelineControls();
}

function timelineControls() {
    const tl = $('#timeline');
    const bar = $('#tlBar');
    const sync = () => {
        const max = tl.scrollWidth - tl.clientWidth;
        const vis = tl.clientWidth / tl.scrollWidth;
        bar.style.width = `${Math.max(8, vis * 100)}%`;
        bar.style.transform = `translateX(${max > 0 ? (tl.scrollLeft / max) * ((1 - vis) / vis) * 100 : 0}%)`;
    };
    tl.addEventListener('scroll', sync, { passive: true });
    addEventListener('resize', sync);
    sync();
    const by = (dir) =>
        tl.scrollBy({
            left: dir * Math.min(tl.clientWidth * 0.8, 860),
            behavior: reduced.matches ? 'auto' : 'smooth'
        });
    $('#tlPrev').onclick = () => by(-1);
    $('#tlNext').onclick = () => by(1);
    // drag to scroll with a mouse
    let down = null;
    tl.onpointerdown = (e) => {
        if (e.pointerType !== 'mouse' || e.button !== 0) return;
        down = { x: e.clientX, left: tl.scrollLeft, moved: false };
    };
    addEventListener('pointermove', (e) => {
        if (!down) return;
        const dx = e.clientX - down.x;
        if (!down.moved && Math.abs(dx) > 5) {
            down.moved = true;
            tl.classList.add('drag');
        }
        if (down.moved) tl.scrollLeft = down.left - dx;
    });
    addEventListener('pointerup', () => {
        if (!down) return;
        down = null;
        setTimeout(() => tl.classList.remove('drag'), 0);
    });
}

// ------------------------------------------------------------------------------------------- daily challenge

function statusChip(st, runId) {
    const ok = st === 'verified';
    const label = ok
        ? '✓ verified'
        : st === 'rejected'
          ? 'rejected'
          : st === 'pending' || !st
            ? 'checking'
            : String(st);
    const cls = `st ${ok ? 'ok' : st === 'rejected' ? 'bad' : 'wait'}`;
    if (!runId || !/^[0-9a-z]{8,40}$/.test(runId)) return h('span', { class: cls }, label);
    return h(
        'a',
        {
            class: cls,
            href: `/run/${runId}`,
            title: ok
                ? 'The server re-played this run from its inputs and got the same score.'
                : 'The server re-plays every run from its recorded inputs, usually within the hour.'
        },
        label
    );
}

let boardRows = [];
let boardOpen = false;
function renderBoard() {
    const box = $('#lb');
    box.textContent = '';
    const rows = boardOpen ? boardRows : boardRows.slice(0, 10);
    box.append(
        h(
            'table',
            { class: 'lb' },
            h('caption', { class: 'sr-only' }, "Today's Daily Challenge leaderboard"),
            h(
                'thead',
                null,
                h(
                    'tr',
                    null,
                    h('th', { scope: 'col' }, '#'),
                    h('th', { scope: 'col' }, 'Player'),
                    h('th', { scope: 'col', class: 'num-c' }, 'Score'),
                    h('th', { scope: 'col', class: 'num-c opt-c' }, 'Time'),
                    h('th', { scope: 'col', class: 'num-c opt-c' }, 'Kills'),
                    h('th', { scope: 'col' }, '')
                )
            ),
            h(
                'tbody',
                null,
                rows.map((e, i) => {
                    const rank = e.rank || i + 1;
                    return h(
                        'tr',
                        { class: rank <= 3 ? 'top' : null, style: `--i:${Math.min(i, 12)}` },
                        h(
                            'td',
                            { class: 'rk' },
                            h(
                                'span',
                                { class: `medal${rank <= 3 ? ` m${rank}` : ''}` },
                                String(rank)
                            )
                        ),
                        h(
                            'td',
                            { class: 'nm' },
                            e.name ? String(e.name) : 'anon',
                            e.operator
                                ? h(
                                      'span',
                                      {
                                          class: 'st wait',
                                          title: "The operator's run: it ranks, but it can't win."
                                      },
                                      ' operator'
                                  )
                                : null
                        ),
                        h('td', { class: 'num-c sc' }, fmtInt(e.score)),
                        h('td', { class: 'num-c opt-c' }, mss(e.timeMs)),
                        h('td', { class: 'num-c opt-c' }, fmtInt(e.kills)),
                        h('td', null, statusChip(e.status, e.runId))
                    );
                })
            )
        )
    );
    const more = $('#lbMore');
    more.hidden = boardRows.length <= 10;
    more.textContent = boardOpen ? 'Show the top 10' : `Show the whole board (${boardRows.length})`;
}

async function loadBoard(date, pinned) {
    const lb = pinned === 0 ? null : await getJSON('/api/leaderboard?date=' + date);
    const rows = lb && Array.isArray(lb.rows) ? lb.rows : [];
    $('#lbMeta').textContent = [
        lb && isNum(lb.total) ? `${fmtInt(lb.total)} on the board` : null,
        pinned !== null ? `Build #${pinned}` : null
    ]
        .filter(Boolean)
        .join(' · ');
    if (!rows.length) {
        $('#lb').textContent = '';
        $('#lb').append(
            h(
                'p',
                { class: 'board-empty' },
                pinned === 0
                    ? "Today's challenge has no scored board."
                    : 'No runs yet today. The first one on the board could be yours.'
            )
        );
        $('#lbMore').hidden = true;
        return;
    }
    boardRows = rows;
    renderBoard();
}

function renderPot(pot, daily) {
    steps.pot = pot;
    if (pot && pot.status === 'on' && isNum(pot.potSol)) {
        setNumber($('#potSol'), pot.potSol, (v) => v.toFixed(3));
        $('#potNote').textContent = pot.measured
            ? `40% of today's creator fees so far, measured on-chain. Paid in $ANSEM after 00:10 UTC.`
            : "Today's fees aren't measured yet. The pot is paid in $ANSEM after 00:10 UTC.";
        if (pot.bounty)
            $('#dBounty').append(
                h(
                    'small',
                    null,
                    `${pot.bounty.name}: ${pot.bounty.cleared === null ? 'checking runs' : `${fmtInt(pot.bounty.cleared)} cleared so far`}`
                )
            );
    } else if (pot && pot.status === 'next') {
        $('#potSol').textContent = '0';
        $('#potNote').textContent = `The Daily Pot starts with the ${pot.from} challenge.`;
    }
    const rule = pot && pot.rule;
    if (rule && rule.text) {
        $('#potRuleText').textContent = rule.text;
        const ul = $('#potRuleList');
        ul.textContent = '';
        for (const d of rule.details || []) ul.append(h('li', null, d));
    } else $('#potRules').hidden = true;
    if (daily && daily.prize && daily.prize.status && daily.prize.status !== 'live')
        $('#potNote').textContent = 'Prizes are paused right now. The board still counts.';
}

async function loadChallenge() {
    const [daily, pot] = await Promise.all([getJSON('/api/daily'), getJSON('/api/pot')]);
    const date = daily && /^\d{4}-\d{2}-\d{2}$/.test(daily.date) ? daily.date : dayOf(Date.now());
    const pinned = daily && isNum(daily.build) ? daily.build : null;
    $('#dStage').textContent = (daily && (daily.stageName || daily.stage)) || '—';
    const tw = daily && daily.twist && typeof daily.twist.name === 'string' ? daily.twist : null;
    const twist = $('#dTwist');
    twist.textContent = tw ? tw.name : 'None today';
    if (tw && tw.description) twist.append(h('small', null, tw.description));
    const bounty = $('#dBounty');
    bounty.textContent = pot && pot.bounty ? pot.bounty.text : '—';
    const play = $('#dailyPlay');
    if (pinned === 0) {
        play.href = '/play';
        play.textContent = 'PLAY THE LIVE BUILD';
    } else if (daily) play.href = '/play?challenge=' + date;
    renderPot(pot, daily);
    loadBoard(date, pinned);
    $('#lbMore').onclick = () => {
        boardOpen = !boardOpen;
        renderBoard();
    };
}

async function loadWinners() {
    const w = await getJSON('/api/winners');
    const rows = w && Array.isArray(w.winners) ? w.winners : [];
    const paid = rows.find((r) => r.status === 'paid' && r.tx);
    if (!paid) return;
    const sent = (paid.payouts || []).filter((p) => p.status === 'sent' && SIG.test(p.tx || ''));
    const players = paid.playersPaid || new Set(sent.map((p) => p.name)).size || 1;
    const row = $('#paidRow');
    row.textContent = '';
    const day = toMs(`${paid.date}T00:00:00Z`);
    row.append(
        h('strong', null, tokenAmount(paid.amountRaw, paid.token)),
        h(
            'span',
            null,
            `to ${players} player${players === 1 ? '' : 's'} for the ${day ? niceDay(day) : paid.date} Daily${paid.topUp ? ' (top-up)' : ''}, on-chain.`
        )
    );
    const list = h('div', { class: 'paid-list' });
    // The places by name, each with its transfer; the bounty shares as one count (all of them on /receipts).
    const places = sent.filter((p) => p.kind === 'place').sort((x, y) => x.place - y.place);
    const shares = sent.filter((p) => p.kind !== 'place');
    for (const p of places.slice(0, 5))
        list.append(
            h(
                'a',
                {
                    href: `https://solscan.io/tx/${p.tx}`,
                    rel: 'noopener',
                    target: '_blank',
                    title: 'Open the transfer on Solscan'
                },
                `#${p.place} `,
                String(p.name || 'anon'),
                ' · ',
                h('b', null, tokenAmount(p.amountRaw, p.token)),
                ' ↗'
            )
        );
    const more = places.length - 5;
    if (shares.length || more > 0)
        list.append(
            h(
                'a',
                { href: '/receipts' },
                [
                    more > 0 ? `${more} more place${more === 1 ? '' : 's'}` : null,
                    shares.length
                        ? `${shares.length} bounty share${shares.length === 1 ? '' : 's'}`
                        : null
                ]
                    .filter(Boolean)
                    .join(' + ') + ' · all on the receipts page →'
            )
        );
    if (!sent.length && SIG.test(paid.tx))
        list.append(
            h(
                'a',
                { href: `https://solscan.io/tx/${paid.tx}`, rel: 'noopener', target: '_blank' },
                'Solscan ↗'
            )
        );
    row.append(list);
    $('#paid').hidden = false;
}

// The game and the HQ share an origin, so a browser that has played has its player id here too. Lets a player add
// or change the address a Daily Challenge prize is paid to without playing another run.
function prizeAddress() {
    const form = $('#prizeAddr');
    let id = null;
    let prefs = {};
    try {
        id = localStorage.getItem('bearproof_player_id');
        prefs = JSON.parse(localStorage.getItem('bearproof_prefs_v1') || '{}') || {};
    } catch {
        return;
    }
    if (!id) return; // never played on this device: nothing to attach an address to
    const input = $('#prizeAddrIn');
    const note = $('#prizeAddrNote');
    const say = (t, tone) => {
        note.textContent = t;
        note.className = 'addr-note' + (tone ? ' ' + tone : '');
    };
    if (prefs.payoutAddress) {
        input.value = prefs.payoutAddress;
        say('Saved on this device. Change it any time.', 'good');
    }
    form.hidden = false;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const address = input.value.trim();
        if (address && !B58.test(address))
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
            say(address ? 'Saved. If your run places, the prize goes here.' : 'Removed.', 'good');
        } catch {
            say('Network error. Try again.', 'bad');
        }
    });
}

// ------------------------------------------------------------------------------------------- vote status for the steps

async function loadVoteState() {
    const v = await getJSON('/api/vote');
    if (v) state.vote = v;
}

// ------------------------------------------------------------------------------------------- receipts

const CATEGORY = {
    creator_fees: 'Creator fees',
    compute: 'AI compute',
    hosting: 'Hosting',
    prize: 'Daily prize',
    sweep: 'Prize wallet top-up',
    launch: 'Launch',
    marketing: 'Marketing',
    buyback: 'Buyback',
    reimbursement: 'Reimbursement',
    other: 'Other'
};

function renderReceiptTiles(s) {
    const t = s.treasury || {};
    const tile = (id, addr, bal) => {
        const el = $(id);
        if (!el) return;
        if (addr && B58.test(addr)) el.href = `https://solscan.io/account/${addr}`;
        if (isNum(bal))
            $('.rc-v', el).innerHTML =
                `${bal.toFixed(3)}<small style="font-size:.5em;color:var(--muted)"> SOL</small>`;
        const s2 = $('.rc-s', el);
        if (addr) s2.textContent = `${short(addr)} · Solscan ↗`;
    };
    tile('#rcTreasury', t.wallet, t.balance);
    tile('#rcPrize', t.prizeWallet, t.prizeWalletBalance);
    const c = s.computeSpentUsd || {};
    if (isNum(c.measured)) {
        $('#rcSpent').textContent = usd(c.measured);
        $('#rcSpentS').textContent =
            `measured · ${fmtInt(c.meteredRuns)} nightly runs${isNum(c.chat) && c.chat > 0 ? ' + the Telegram chat' : ''}`;
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
                  ? short(r.tokenMint)
                  : 'tokens';
        parts.push(
            `${Number(r.tokenAmount).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${sym}`
        );
    }
    if (!parts.length && isNum(r.usdEstimate)) parts.push(`≈ ${usd(r.usdEstimate)}`);
    return parts.join(' + ') || '—';
}

async function loadMoves() {
    const box = $('#moves');
    if (!box) return;
    const data = await getJSON('/api/ledger');
    const rows = data && Array.isArray(data.entries) ? data.entries : [];
    box.textContent = '';
    if (!rows.length) {
        box.append(
            h(
                'li',
                { class: 'moves-empty' },
                data ? 'No transactions yet.' : 'The ledger is offline right now.'
            )
        );
        return;
    }
    // Many small transfers read as one line each: the day's fee claims, and each Daily's payout. Single moves stay
    // single. The ledger answers its newest 100 rows, so the oldest day in it may be partial: groups from that day
    // are left out (every row is on /receipts).
    const oldest = rows.reduce((m, r) => {
        const ms = toMs(r.ts);
        return ms && (!m || ms < m) ? ms : m;
    }, null);
    const oldestDay = oldest ? dayOf(oldest) : null;
    const groups = new Map();
    for (const r of rows) {
        const ms = toMs(r.ts);
        const prize = r.category === 'prize' && /prize:(\d{4}-\d{2}-\d{2})/.exec(r.memo || '');
        const key =
            r.category === 'creator_fees' && ms
                ? `fees:${dayOf(ms)}`
                : prize
                  ? `prize:${prize[1]}`
                  : `tx:${r.tx || r.ts}`;
        if (!groups.has(key))
            groups.set(key, { key, rows: [], ms, prizeDay: prize ? prize[1] : null });
        groups.get(key).rows.push(r);
    }
    const pick = [...groups.values()]
        .filter((g) => !(g.key.startsWith('fees:') && g.key.slice(5) === oldestDay))
        .slice(0, 6);
    for (const g of pick) {
        const r = g.rows[0];
        const n = g.rows.length;
        const dir = r.direction === 'in' ? 'in' : 'out';
        const url =
            (r.solscan && safeUrl(r.solscan, ['solscan.io'])) ||
            (SIG.test(r.tx || '') ? `https://solscan.io/tx/${r.tx}` : null);
        let title = CATEGORY[r.category] || r.category || '—';
        let amount = amountText(r);
        let sub = `${g.ms ? `${niceDay(g.ms)}, ${clockOf(g.ms).slice(0, 5)} UTC` : ''}${r.measured ? ' · measured' : ' · estimate'}`;
        if (g.key.startsWith('fees:')) {
            const total = g.rows.reduce((t, x) => t + (isNum(x.amountSol) ? x.amountSol : 0), 0);
            title = `Creator fees, ${niceDay(g.ms)}`;
            amount = `${+total.toFixed(4)} SOL`;
            sub = `${n} claim${n === 1 ? '' : 's'} · last at ${clockOf(g.ms).slice(0, 5)} UTC · measured`;
        } else if (g.prizeDay) {
            const buy = g.rows.find((x) => /:buy$/.test(x.memo || ''));
            const sends = g.rows.filter((x) => !/:buy$/.test(x.memo || '')).length;
            title = `Daily prize for ${niceDay(toMs(g.prizeDay + 'T00:00:00Z'))}`;
            amount = buy ? amountText(buy) : amountText(r);
            sub = `${sends} transfer${sends === 1 ? '' : 's'} to players${buy ? ' · SOL swapped to $ANSEM' : ''}`;
        }
        box.append(
            h(
                'li',
                { class: dir },
                h(
                    'span',
                    { class: 'arr', 'aria-label': dir === 'in' ? 'In' : 'Out' },
                    dir === 'in' ? '↓' : '↑'
                ),
                h('span', { class: 'what' }, h('b', null, title), h('span', null, sub)),
                h('span', { class: 'amt' }, `${dir === 'in' ? '+' : '−'}${amount}`),
                n > 1
                    ? h('a', { class: 'tx', href: '/receipts' }, `${n} txs →`)
                    : url
                      ? h(
                            'a',
                            { class: 'tx', href: url, rel: 'noopener', target: '_blank' },
                            'Solscan ↗'
                        )
                      : h('span', { class: 'tx' }, r.source === 'chain' ? 'pending' : 'off-chain')
            )
        );
    }
}

// ------------------------------------------------------------------------------------------- reveal on scroll

function reveal() {
    if (reduced.matches || !('IntersectionObserver' in window)) return;
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
    const targets = $$(
        '.numbers, .sec-h, .step, .term, .latest, .tl-head, .pot, .board, .paid, .vote-bar, .ballot, .voice-card, .coin, .rc-tile, .faq details, .finale-in'
    );
    let i = 0;
    let lastParent = null;
    for (const el of targets) {
        if (el.getBoundingClientRect().top < innerHeight * 0.92) continue; // already on screen: never flash
        if (el.parentElement !== lastParent) i = 0;
        lastParent = el.parentElement;
        el.style.setProperty('--i', String(Math.min(i++, 5)));
        el.classList.add('rv');
        io.observe(el);
    }
}

// ------------------------------------------------------------------------------------------- spotlight, eyebrows, live feed

function spotlight() {
    if (!matchMedia('(hover: hover)').matches) return;
    const sel =
        '.step, .opt, .bc, .rc-tile, .latest, .who-c, .voice-card, .bosses li, .pot, .board';
    let cur = null;
    document.addEventListener(
        'pointermove',
        (e) => {
            const el = e.target.closest && e.target.closest(sel);
            if (el !== cur) cur = el;
            if (!el) return;
            el.classList.add('spot');
            const r = el.getBoundingClientRect();
            el.style.setProperty('--mx', `${e.clientX - r.left}px`);
            el.style.setProperty('--my', `${e.clientY - r.top}px`);
        },
        { passive: true }
    );
}

/** Section labels type themselves in, terminal style, the first time they scroll into view. */
function decodeEyebrows() {
    if (reduced.matches || !('IntersectionObserver' in window)) return;
    const GLYPHS = '#$%&*+=?<>/[]01';
    const io = new IntersectionObserver(
        (es) => {
            for (const e of es) {
                if (!e.isIntersecting) continue;
                io.unobserve(e.target);
                const el = e.target;
                const text = el.textContent;
                el.setAttribute('aria-label', text);
                const t0 = performance.now();
                const frame = (t) => {
                    const k = Math.min(1, (t - t0) / 650);
                    const n = Math.floor(k * text.length);
                    el.textContent =
                        text.slice(0, n) +
                        [...text.slice(n)]
                            .map((c) =>
                                c === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0]
                            )
                            .join('');
                    if (k < 1) requestAnimationFrame(frame);
                    else el.textContent = text;
                };
                requestAnimationFrame(frame);
            }
        },
        { rootMargin: '0px 0px -10% 0px' }
    );
    for (const el of $$('.sec-h .eyebrow, .coin .eyebrow')) io.observe(el);
}

/** What players are doing right now, from /api/activity: a small card, one at a time, desktop only. */
function liveFeed() {
    if (!matchMedia('(min-width: 1041px)').matches) return;
    let off = false;
    try {
        off = sessionStorage.getItem('bp_feed_off') === '1';
    } catch {
        off = false;
    }
    if (off) return;
    const box = h('aside', { class: 'feed', 'aria-live': 'off', 'aria-label': 'Live activity' });
    const body = h('div');
    const x = h(
        'button',
        { class: 'feed-x', type: 'button', 'aria-label': 'Hide live activity' },
        '×'
    );
    box.append(h('i', { class: 'dot', 'aria-hidden': 'true' }), body, x);
    document.body.append(box);
    const seen = new Set();
    let queue = [];
    let since = Date.now() - 20 * 60000; // on arrival, the last 20 minutes count as live
    let showing = false;
    x.addEventListener('click', () => {
        off = true;
        box.classList.remove('on');
        try {
            sessionStorage.setItem('bp_feed_off', '1');
        } catch {
            /* fine */
        }
    });
    // Only what the server writes itself: players' own words (ideas, requests) stay in their sections.
    const LABEL = {
        run: 'Just played',
        verified: 'Verified by the server',
        vote: 'New vote',
        fees: 'Fees in, on-chain',
        ledger: 'On-chain'
    };
    const show = () => {
        if (off || showing || document.hidden || !queue.length) return;
        const item = queue.shift();
        showing = true;
        body.textContent = '';
        body.append(h('span', { class: 'feed-k' }, LABEL[item.kind] || 'Live'), String(item.text));
        box.classList.add('on');
        setTimeout(() => {
            box.classList.remove('on');
            setTimeout(() => (showing = false), 600);
        }, 6000);
    };
    const poll = async () => {
        const d = await getJSON('/api/activity');
        const items = d && Array.isArray(d.items) ? d.items : [];
        const fresh = [];
        for (const it of items) {
            const ms = toMs(it.ts);
            const key = `${it.ts}|${it.text}`;
            if (
                !ms ||
                ms < since ||
                seen.has(key) ||
                typeof it.text !== 'string' ||
                !LABEL[it.kind]
            )
                continue;
            seen.add(key);
            fresh.push(it);
        }
        since = Math.max(since, Date.now() - 2 * 60000);
        // Oldest first, and never a backlog: at most the three newest.
        queue = queue.concat(fresh.reverse()).slice(-3);
    };
    poll();
    setTimeout(() => {
        show();
        setInterval(show, 16000);
    }, 7000);
    setInterval(() => !document.hidden && poll(), 30000);
}

// ------------------------------------------------------------------------------------------- boot

function boot() {
    initNav();
    reveal();
    spotlight();
    decodeEyebrows();
    liveFeed();
    heroBackground();
    screenTilt();
    loadStats();
    setInterval(() => !document.hidden && loadStats(), STATS_POLL_MS);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && Date.now() - (state.statsAt || 0) > STATS_POLL_MS) loadStats();
    });
    tick();
    agentLoop();
    loadVoteState();
    setInterval(() => !document.hidden && loadVoteState(), 60000);
    getJSON('/api/pot').then((p) => p && (steps.pot = p));
    prizeAddress();
    whenNear($('#build'), loadBuilds, '900px');
    whenNear(
        $('#challenge'),
        () => {
            loadChallenge();
            loadWinners();
            setInterval(() => document.visibilityState === 'visible' && loadChallenge(), 60000);
        },
        '900px'
    );
    if ($('#moves')) whenNear($('#receipts'), loadMoves, '900px');
    // The game's pixel art: when the browser is idle, so it never delays the first paint.
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 200));
    idle(() => import('/art.js').catch(() => {}));
}

boot();
