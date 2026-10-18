/*
 * The BEARPROOF home page. Every value on it is live API data or a plain empty state; nothing is invented, and every
 * fetch fails soft: a network error leaves the designed state, never an exception.
 *
 *   /api/stats        day, builds, live build, next build, treasury, token, players, top score   (polled)
 *   /api/agent/live   last night's Build Agent session (replayed), or tonight's while it runs   (polled at night)
 *   /api/builds       build manifest          /devlog.json   devlog entries        (patch notes)
 *   /api/daily        today's challenge       /api/pot       today's Daily Pot     /api/leaderboard  today's board
 *   /api/winners      the last payouts        /api/onchain   SQD Network's view of the wallets
 *   /api/vote         the ballot (vote.js does the voting, ideas.js the ideas box)
 */

const REPO = 'https://github.com/0smanturgut/bearproof';
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SIG = /^[1-9A-HJ-NP-Za-km-z]{43,90}$/;
const SHA = /^[0-9a-f]{7,40}$/i;
const STATS_POLL_MS = 30000;
const PATCHES_SHOWN = 6;

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
        const t = h('textarea', { readonly: true });
        t.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
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

const setText = (sel, text) => {
    const el = $(sel);
    if (el) el.textContent = text;
};

// ------------------------------------------------------------------------------------------- state

const state = {
    stats: null,
    statsAt: 0,
    nextBuildAt: nextMidnight(Date.now()),
    agent: null, // { status, build }
    mint: null
};
let resolveStats;
const firstStats = new Promise((r) => (resolveStats = r));

// ------------------------------------------------------------------------------------------- nav

function initNav() {
    const btn = $('#navMenu');
    const sheet = $('#sheet');
    if (!btn || !sheet) return;
    const close = () => {
        sheet.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
    };
    btn.addEventListener('click', () => {
        const open = sheet.hidden;
        sheet.hidden = !open;
        btn.setAttribute('aria-expanded', String(open));
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
            btn.classList.toggle('done', ok);
            btn.textContent = ok ? 'Copied' : 'Copy failed';
            toast(
                ok
                    ? 'Contract address copied'
                    : 'Copy failed. Select the address and copy it by hand.'
            );
            setTimeout(() => {
                btn.classList.remove('done');
                btn.textContent = 'Copy';
            }, 1800);
        });
    }
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
        setText('#heroPillText', 'Live numbers are offline. The game still works.');
    }
    resolveStats(s);
}

function renderStats(s) {
    countTo($('#nDay'), s.day);
    countTo($('#nBuilds'), s.buildsShipped);
    countTo($('#nPlayers'), s.playersToday);
    const top = s.topScoreToday;
    if (top && isNum(top.score)) countTo($('#nTop'), top.score, fmtInt, 1300);
    else setText('#nTop', '—');
    renderLoop(s);
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

// ------------------------------------------------------------------------------------------- the status line + clocks

function renderPill() {
    const pill = $('#heroPill');
    const text = $('#heroPillText');
    if (!pill || !text) return;
    const s = state.stats;
    const a = state.agent;
    const live = s && s.liveBuild;
    text.textContent = '';
    pill.classList.remove('building');
    if (a && a.status === 'running') {
        pill.classList.add('building');
        text.append(
            'The AI is coding ',
            h('b', null, `Build #${a.build || (live ? live.n + 1 : '')}`),
            ' right now. ',
            h('a', { href: '/live' }, 'Watch it')
        );
        return;
    }
    if (!live) {
        text.textContent = 'Connecting…';
        return;
    }
    const ready = a && a.status === 'done' && isNum(a.build) && a.build > live.n;
    text.append(
        h('b', null, `Build #${live.n}`),
        ' is live · ',
        ready ? `#${a.build} is built and ships in ` : 'next build in ',
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
    dayNow(now);
    setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
}

/** The day panel: which part of the UTC day we're in, and how far into it. */
function dayNow(now) {
    const box = $('#day');
    if (!box) return;
    const d = new Date(now);
    const min = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
    for (const li of $$('li[data-from]', box)) {
        const a = Number(li.dataset.from);
        const b = Number(li.dataset.to);
        const on = min >= a && min < b;
        li.classList.toggle('now', on);
        if (on) li.style.setProperty('--p', `${(((min - a) / (b - a)) * 100).toFixed(2)}%`);
    }
    setText('#dayNow', `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC now`);
}

// ------------------------------------------------------------------------------------------- motion

/** A number counts up to its value the first time it's shown; after that (and with reduced motion) it just is. */
function countTo(el, value, fmt = fmtInt, ms = 900) {
    if (!el) return;
    if (!isNum(value)) {
        el.textContent = '—';
        return;
    }
    if (reduced.matches || el.dataset.counted) {
        el.textContent = fmt(value);
        return;
    }
    el.dataset.counted = '1';
    const t0 = performance.now();
    const step = (now) => {
        const k = Math.min(1, Math.max(0, now - t0) / ms);
        el.textContent = fmt(value * (1 - (1 - k) ** 3));
        if (k < 1) requestAnimationFrame(step);
        else el.textContent = fmt(value);
    };
    requestAnimationFrame(step);
}

/** Panels settle in as they scroll into view, a beat apart within a group. Nothing hides without this script. */
function reveal() {
    if (reduced.matches || !('IntersectionObserver' in window)) return;
    const groups = [
        '.sec > h2, .sec-head',
        '.sec > .lede',
        '.how > *',
        '.daily > *',
        '.patch > *',
        '.stats > *',
        '.coin, .sqd-strip, .paid, .faq, .patches, .idea',
        '.foot-cta > *'
    ];
    const io = new IntersectionObserver(
        (entries) => {
            for (const e of entries) {
                if (!e.isIntersecting) continue;
                e.target.classList.add('in');
                io.unobserve(e.target);
            }
        },
        { rootMargin: '0px 0px -8% 0px' }
    );
    for (const sel of groups) {
        const seen = new Map();
        for (const el of $$(sel)) {
            if (el.closest('.hero') || el.classList.contains('rv')) continue;
            const i = seen.get(el.parentElement) || 0;
            seen.set(el.parentElement, i + 1);
            el.style.setProperty('--d', `${Math.min(i, 5) * 80}ms`);
            el.classList.add('rv');
            io.observe(el);
        }
    }
}

/** Run `fn` once, the first time `el` is on screen. */
function onSeen(el, fn) {
    if (!el) return;
    if (!('IntersectionObserver' in window)) return fn();
    const io = new IntersectionObserver((entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        fn();
    });
    io.observe(el);
}

// ------------------------------------------------------------------------------------------- the loop: where the money goes

function renderLoop(s) {
    const t = s && s.treasury;
    if (t && isNum(t.balance)) setText('#loopB', `${t.balance.toFixed(3)} SOL now`);
    const c = s && s.computeSpentUsd;
    if (c && isNum(c.measured)) setText('#loopC', `${usd(c.measured)} of compute`);
    if (isNum(s && s.buildsShipped)) setText('#loopD', `${fmtInt(s.buildsShipped)} so far`);
}

/** A coin runs down the track: each step lights up as it lands, then the loop starts over. */
function runLoop() {
    const box = $('#loop');
    const coin = box && $('.loop-coin', box);
    const steps = box ? $$('.loop-steps li', box) : [];
    if (!coin || !steps.length) return;
    const light = (k) => steps.forEach((li, j) => li.classList.toggle('on', j === k));
    light(0);
    if (reduced.matches) return;
    let visible = false;
    new IntersectionObserver((e) => (visible = e[0].isIntersecting)).observe(box);
    const place = (k) => {
        const icon = $('canvas', steps[k]);
        const b = box.getBoundingClientRect();
        const r = icon.getBoundingClientRect();
        coin.style.setProperty('--x', `${Math.round(r.left - b.left + r.width / 2 - 7)}px`);
        coin.style.setProperty('--y', `${Math.round(r.top - b.top + r.height / 2 - 7)}px`);
    };
    let k = 0;
    coin.classList.add('jump');
    place(0);
    const cycle = () => {
        if (!visible || document.hidden) return setTimeout(cycle, 700);
        const next = (k + 1) % steps.length;
        if (next === 0) {
            // back to the top: more players, more trades
            coin.classList.add('jump');
            coin.classList.remove('go');
            place(0);
            k = 0;
            light(0);
            return setTimeout(cycle, 1700);
        }
        coin.classList.remove('jump');
        place(k);
        requestAnimationFrame(() => {
            coin.classList.add('go');
            place(next);
        });
        setTimeout(() => {
            k = next;
            light(k);
            coin.classList.remove('go');
            setTimeout(cycle, 1300);
        }, 760);
    };
    setTimeout(cycle, 1200);
}

// ------------------------------------------------------------------------------------------- the tape under the hero

async function loadTape() {
    const [s, daily, pot, lb] = await Promise.all([
        firstStats,
        getJSON('/api/daily'),
        getJSON('/api/pot'),
        getJSON('/api/leaderboard')
    ]);
    const items = [];
    const add = (k, v, gold = false) => v && items.push({ k, v, gold });
    if (s && s.liveBuild) add('Build', `#${s.liveBuild.n} is live`);
    if (s && isNum(s.day)) add('Day', fmtInt(s.day));
    if (daily) add("Today's map", daily.stageName || daily.stage);
    if (daily && daily.twist) add('Twist', daily.twist.name, true);
    if (pot && pot.bounty && pot.bounty.text) add('AI bounty', pot.bounty.text, true);
    if (pot && pot.status === 'on' && isNum(pot.potSol))
        add("Today's pot", `${pot.potSol.toFixed(3)} SOL`, true);
    const top = lb && Array.isArray(lb.rows) ? lb.rows[0] : null;
    if (top && isNum(top.score))
        add("Today's #1", `${top.name || 'anon'} · ${fmtInt(top.score)}`, true);
    if (s && isNum(s.playersToday) && s.playersToday > 0)
        add('Players today', fmtInt(s.playersToday));
    if (s && s.treasury && isNum(s.treasury.balance))
        add("The AI's wallet", `${s.treasury.balance.toFixed(3)} SOL`);
    if (s && s.computeSpentUsd && isNum(s.computeSpentUsd.measured))
        add('AI compute so far', usd(s.computeSpentUsd.measured));
    const run = $('#tape');
    if (!run || items.length < 3) return;
    run.textContent = '';
    for (let pass = 0; pass < 2; pass++) {
        for (const it of items)
            run.append(h('span', null, `${it.k} `, h('b', { class: it.gold ? 'g' : null }, it.v)));
        run.append(
            h(
                'span',
                null,
                'Next build in ',
                h('b', { 'data-countdown': '' }, hms(state.nextBuildAt - Date.now()))
            )
        );
    }
    run.style.animationDuration = `${Math.max(40, items.length * 8)}s`;
}

// ------------------------------------------------------------------------------------------- the live build behind the hero

let mounted = null;
function renderScreen(s) {
    const live = s && s.liveBuild;
    const view = $('#screenView');
    if (!live || !view || reduced.matches || saveData) return;
    if (mounted === live.n) return;
    if (mounted !== null) {
        // A new build went live while the page was open: reload the view (/play resolves to it).
        const f = $('iframe', view);
        if (f) f.src = '/play?attract=1';
        mounted = live.n;
        return;
    }
    mounted = live.n;
    const go = () => {
        const f = h('iframe', {
            src: '/play?attract=1',
            title: `BEARPROOF Build #${live.n}, playing itself`,
            tabindex: '-1',
            inert: true,
            allow: 'autoplay'
        });
        f.addEventListener('load', () => setTimeout(() => f.classList.add('on'), 300), {
            once: true
        });
        view.append(f);
    };
    if (document.readyState === 'complete') go();
    else addEventListener('load', go, { once: true });
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
        h('time', null, ms ? clockOf(ms) : ''),
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
        `Build #${d.build || '—'}` +
        (started
            ? ` · ${niceDay(started)}, ${clockOf(started).slice(0, 5)}${!running && ended ? `–${clockOf(ended).slice(0, 5)}` : ''} UTC`
            : '');
    const sub = $('#buildSub');
    sub.textContent = '';
    if (running)
        sub.append(
            `Every build is still playable. Right now the AI is writing Build #${d.build || ''}, live; it ships at 00:00 UTC if its tests pass. Full view at `,
            h('a', { href: '/live' }, '/live'),
            '.'
        );
    else
        sub.append(
            "Every build is still playable. Last night's session is replayed below; tonight's streams live at ",
            h('a', { href: '/live' }, '/live'),
            ' from 21:00 UTC.'
        );
    const st = $('#termState');
    st.textContent = running ? 'live' : 'replay';
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
        term.shown = 0;
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

// ------------------------------------------------------------------------------------------- patch notes

const WHO = { agent: 'nightly', bootstrap: 'bootstrap', human: 'human', upstream: 'original' };

function costText(b, d) {
    const mode = (b && b.mode) || (d && d.mode);
    if (mode === 'upstream') return 'no AI work';
    const pick = (v) => (isNum(v) && v > 0 ? v : null);
    const val = pick(d && d.costUsd) ?? pick(b && b.costUsd);
    if (val === null) return mode === 'bootstrap' ? 'unmetered' : 'not metered';
    return `${usd(val)}${d && d.costMeasured === true ? '' : ' est.'}`;
}

function buildTitle(b, d) {
    if (b && b.mode === 'upstream') return 'The untouched open-source original';
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
    chips.append(h('li', null, `cost ${costText(live, d)}`));
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
    chips.append(h('li', null, WHO[live.mode] || live.mode || '—'));
    if (SHA.test(live.commit || ''))
        chips.append(
            h(
                'li',
                null,
                h(
                    'a',
                    { href: `${REPO}/commit/${live.commit}`, rel: 'noopener', target: '_blank' },
                    `commit ${live.commit.slice(0, 7)}`
                )
            )
        );
    $('#latestPlay').href = `/b/${live.n}/`;
    if (d) $('#latestLog').href = `${REPO}/blob/main/devlog/build-${live.n}.md`;
}

function patchRow(b, d, live) {
    const at = b ? toMs(b.activatesAt) : d ? toMs(d.date) : null;
    const failed = d && d.status && d.status !== 'shipped';
    const mode = b ? b.mode : d && d.mode;
    return h(
        'li',
        null,
        h('span', { class: 'pn' }, b ? `#${b.n}` : '—'),
        h('span', { class: 'pd' }, at ? niceDay(at) : ''),
        h(
            'span',
            { class: 'pt' },
            buildTitle(b, d),
            live
                ? h('small', null, 'live')
                : failed
                  ? h('small', null, String(d.status))
                  : b && b.revoked
                    ? h('small', null, 'revoked')
                    : mode && mode !== 'agent'
                      ? h('small', null, WHO[mode] || mode)
                      : null
        ),
        h('span', { class: 'pc' }, costText(b, d)),
        b
            ? h(
                  'a',
                  { class: 'pp', href: `/b/${b.n}/`, 'aria-label': `Play Build #${b.n}` },
                  'Play'
              )
            : h('span')
    );
}

function nextRow(n, scheduled, vote) {
    const won = vote && vote.status === 'closed' && vote.winner ? vote.winner.title : null;
    return h(
        'li',
        { class: 'next' },
        h('span', { class: 'pn' }, `#${n}`),
        h('span', { class: 'pd' }, scheduled ? 'ready' : 'tonight'),
        h(
            'span',
            { class: 'pt' },
            scheduled
                ? scheduled.title || `Build #${n}`
                : won
                  ? `${won}`
                  : "Tonight's build: the vote decides",
            !scheduled && won ? h('small', null, 'won the vote') : null
        ),
        h('span', { class: 'pc', 'data-countdown': '' }, hms(state.nextBuildAt - Date.now())),
        h('a', { class: 'pp', href: '/live' }, 'Watch')
    );
}

async function loadBuilds() {
    const [data, dl, s, vote] = await Promise.all([
        getJSON('/api/builds'),
        getJSON('/devlog.json'),
        firstStats,
        getJSON('/api/vote')
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
    if (scheduled.length) for (const b of scheduled.reverse()) tl.append(nextRow(b.n, b));
    else tl.append(nextRow(maxN + 1, null, vote));
    // The live build has the big card above; the list is everything before it.
    const rest = items.filter((it) => !(live && it.b && it.b.n === live.n));
    rest.forEach((it, i) => {
        const row = patchRow(it.b, it.d, false);
        if (i >= PATCHES_SHOWN) row.hidden = true;
        tl.append(row);
    });
    $('#tlCount').textContent = String(shipped.filter((b) => b.n > 0).length);
    renderWall(shipped, byBuild, maxN);
    const more = $('#tlMore');
    more.hidden = rest.length <= PATCHES_SHOWN;
    more.textContent = `Show all ${rest.length} earlier builds`;
    more.onclick = () => {
        for (const li of $$('li[hidden]', tl)) li.hidden = false;
        more.hidden = true;
    };
}

/** One tile per build since day 1, the tonight tile last: the proof of work, at a glance. */
function renderWall(shipped, byBuild, maxN) {
    const list = shipped.filter((b) => b.n > 0 && !b.revoked).sort((a, b) => a.n - b.n);
    const box = $('#wall');
    if (!box || !list.length) return;
    // calendar days (UTC) from the first build to today, and how many of them got a build
    const first = toMs(`${dayOf(toMs(list[0].activatesAt) || Date.now())}T00:00:00Z`);
    const today = toMs(`${dayOf(Date.now())}T00:00:00Z`);
    const span = Math.round((today - first) / 864e5) + 1;
    const days = new Set(list.map((b) => dayOf(toMs(b.activatesAt) || 0))).size;
    const k = $('#wallK');
    k.textContent = '';
    k.append(
        h(
            'span',
            null,
            `${fmtInt(span)} days. `,
            h('b', null, `${fmtInt(list.length)} builds.`),
            days === span ? ' Not one day missed.' : ''
        ),
        h(
            'small',
            null,
            h('span', null, h('i'), "the AI's nightly build"),
            list.some((b) => b.mode !== 'agent')
                ? h('span', null, h('i', { class: 'b' }), 'bootstrap')
                : null
        )
    );
    const ol = $('#wallTiles');
    ol.textContent = '';
    list.forEach((b, i) => {
        const d = byBuild.get(b.n);
        const at = toMs(b.activatesAt);
        const li = h(
            'li',
            null,
            h(
                'a',
                {
                    href: `/b/${b.n}/`,
                    class: b.mode === 'agent' ? null : 'boot',
                    title: `Build #${b.n}: ${buildTitle(b, d)}${at ? ` (${niceDay(at)})` : ''}. Play it.`,
                    'aria-label': `Play Build #${b.n}, ${buildTitle(b, d)}`
                },
                String(b.n)
            )
        );
        li.style.setProperty('--i', String(i));
        ol.append(li);
    });
    const tonight = h(
        'li',
        null,
        h(
            'a',
            {
                href: '/live',
                class: 'tonight',
                title: "Tonight's build. Watch the AI code it from 21:00 UTC."
            },
            String(maxN + 1)
        )
    );
    tonight.style.setProperty('--i', String(list.length));
    ol.append(tonight);
    box.hidden = false;
    if (!reduced.matches) onSeen(box, () => box.classList.add('go'));
}

// ------------------------------------------------------------------------------------------- daily challenge

function statusChip(st, runId) {
    const ok = st === 'verified';
    const label = ok ? '✓' : st === 'rejected' ? '✗' : '…';
    const cls = `st ${ok ? 'ok' : st === 'rejected' ? 'bad' : 'wait'}`;
    const title = ok
        ? 'Verified: the server replayed this run from its inputs and got the same score.'
        : st === 'rejected'
          ? 'Rejected: the replay did not match.'
          : 'Checking: the server replays every run from its recorded inputs, usually within the hour.';
    if (!runId || !/^[0-9a-z]{8,40}$/.test(runId))
        return h('span', { class: cls, title, 'aria-label': title }, label);
    return h('a', { class: cls, href: `/run/${runId}`, title, 'aria-label': title }, label);
}

let boardRows = [];
let boardOpen = false;
let podiumRows = 0;
function renderBoard() {
    const box = $('#lb');
    box.textContent = '';
    const rows = (boardOpen ? boardRows : boardRows.slice(0, 10)).slice(podiumRows);
    box.append(
        h(
            'table',
            { class: 'lb' },
            h('caption', { class: 'sr-only' }, "Today's Daily Challenge high scores"),
            h(
                'thead',
                null,
                h(
                    'tr',
                    null,
                    h('th', { scope: 'col' }, 'Rank'),
                    h('th', { scope: 'col' }, 'Player'),
                    h('th', { scope: 'col', class: 'num-c' }, 'Score'),
                    h('th', { scope: 'col', class: 'num-c opt-c' }, 'Time'),
                    h(
                        'th',
                        { scope: 'col', class: 'num-c' },
                        h('span', { class: 'sr-only' }, 'Verified')
                    )
                )
            ),
            h(
                'tbody',
                null,
                rows.map((e, i) => {
                    const rank = e.rank || i + 1;
                    return h(
                        'tr',
                        { class: rank <= 3 ? 'top' : null },
                        h('td', { class: 'rk' }, String(rank)),
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
                                      ' (operator)'
                                  )
                                : null
                        ),
                        h('td', { class: 'num-c sc' }, fmtInt(e.score)),
                        h('td', { class: 'num-c opt-c' }, mss(e.timeMs)),
                        h('td', { class: 'num-c' }, statusChip(e.status, e.runId))
                    );
                })
            )
        )
    );
    const more = $('#lbMore');
    more.hidden = boardRows.length <= 10;
    more.textContent = boardOpen ? 'Show the top 10' : `Show all ${boardRows.length}`;
}

async function loadBoard(date, pinned) {
    const lb = pinned === 0 ? null : await getJSON('/api/leaderboard?date=' + date);
    const rows = lb && Array.isArray(lb.rows) ? lb.rows : [];
    $('#lbMeta').textContent = [
        lb && isNum(lb.total) && lb.total > 0 ? `${fmtInt(lb.total)} players` : null,
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
                    : 'Nobody has played today yet. The top spot is open.'
            )
        );
        $('#lbMore').hidden = true;
        return;
    }
    boardRows = rows;
    podiumRows = rows.length >= 3 ? 3 : 0;
    renderBoard();
    if (podiumRows) renderPodium(rows.slice(0, 3));
}

/** Today's top three on a podium, each standing as the character they played (read from their run). */
async function renderPodium(top) {
    const ol = $('#podium');
    const live = state.stats && state.stats.liveBuild;
    const [runs, content] = await Promise.all([
        Promise.all(
            top.map((r) =>
                r.runId && /^[0-9a-z]{8,40}$/.test(r.runId) ? getJSON(`/api/run/${r.runId}`) : null
            )
        ),
        live ? import(`/b/${Number(live.n)}/src/sim/content.js`).catch(() => null) : null
    ]);
    const chars = (content && content.CHARACTERS) || {};
    ol.textContent = '';
    top.forEach((r, i) => {
        const run = runs[i];
        const c = (run && chars[run.character]) ||
            chars.bull || { sprite: 'bull', name: 'The Bull' };
        const name = r.name ? String(r.name) : 'anon';
        ol.append(
            h(
                'li',
                { class: `r${i + 1}` },
                h('canvas', {
                    class: 'pod-char',
                    'data-sprite': c.sprite || 'bull',
                    'data-scale': i === 0 ? '4' : '3',
                    'data-anim': '',
                    'aria-hidden': 'true'
                }),
                h('span', { class: 'pod-name', title: name }, name),
                h('span', { class: 'pod-score' }, fmtInt(r.score)),
                h(
                    'span',
                    { class: 'pod-meta' },
                    run && c.name ? `as ${c.name.replace(/^The /, '')}` : mss(r.timeMs),
                    statusChip(r.status, r.runId)
                ),
                h('span', { class: 'pod-block', 'aria-label': `Rank ${i + 1}` }, String(i + 1))
            )
        );
    });
    ol.hidden = false;
    ol.dispatchEvent(new Event('bp:paint', { bubbles: true }));
    if (!reduced.matches) onSeen(ol, () => ol.classList.add('go'));
}

function renderPot(pot, daily) {
    if (pot && pot.status === 'on' && isNum(pot.potSol)) {
        $('#potSol').textContent = pot.potSol.toFixed(3);
        $('#potNote').textContent = pot.measured
            ? "40% of today's trading fees so far, measured on-chain. Paid in $ANSEM after 00:10 UTC."
            : "Today's fees aren't measured yet. The pot is paid in $ANSEM after 00:10 UTC.";
        if (pot.bounty)
            $('#dBounty').append(
                h(
                    'small',
                    null,
                    `${pot.bounty.name}${pot.bounty.cleared === null ? ', checking runs' : pot.bounty.cleared > 0 ? `, ${fmtInt(pot.bounty.cleared)} cleared it so far` : ''}`
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
    $('#dBounty').textContent = pot && pot.bounty ? pot.bounty.text : '—';
    const play = $('#dailyPlay');
    if (pinned === 0) {
        play.href = '/play';
        play.textContent = 'Play the live build';
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
            `to ${players} player${players === 1 ? '' : 's'} for the ${day ? niceDay(day) : paid.date} Daily${paid.topUp ? ' (top-up)' : ''}.`
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
                    title: 'The transfer on Solscan'
                },
                `#${p.place} ${String(p.name || 'anon')} `,
                h('b', null, tokenAmount(p.amountRaw, p.token))
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
                    .join(' and ') + ' on the receipts page'
            )
        );
    if (!sent.length && SIG.test(paid.tx))
        list.append(
            h(
                'a',
                { href: `https://solscan.io/tx/${paid.tx}`, rel: 'noopener', target: '_blank' },
                'Solscan'
            )
        );
    row.append(list);
    $('#paid').hidden = false;
}

// The game and the site share an origin, so a browser that has played has its player id here too. Lets a player
// add or change the address a Daily Challenge prize is paid to without playing another run.
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

// ------------------------------------------------------------------------------------------- receipts

function renderReceiptTiles(s) {
    const t = s.treasury || {};
    const tile = (id, addr, bal) => {
        const el = $(id);
        if (!el) return;
        if (addr && B58.test(addr)) el.href = `https://solscan.io/account/${addr}`;
        if (isNum(bal)) {
            const v = $('.stat-v', el);
            v.textContent = bal.toFixed(3);
            v.append(h('small', null, 'SOL'));
        }
        if (addr) $('.stat-s', el).textContent = `${short(addr)} on Solscan`;
    };
    tile('#rcTreasury', t.wallet, t.balance);
    tile('#rcPrize', t.prizeWallet, t.prizeWalletBalance);
    const c = s.computeSpentUsd || {};
    if (isNum(c.measured)) {
        setText('#rcSpent', usd(c.measured));
        setText(
            '#rcSpentS',
            `measured over ${fmtInt(c.meteredRuns)} nightly runs${isNum(c.chat) && c.chat > 0 ? ' and the Telegram chat' : ''}`
        );
    }
}

/** The receipts strip: what SQD Network saw of the two wallets in the last 24 hours, against our ledger. */
async function loadSqdStrip() {
    const el = $('#sqdText');
    if (!el) return;
    const d = await getJSON('/api/onchain');
    const day = d && Array.isArray(d.last24h) ? d.last24h : null;
    if (!day || !day.length) return; // the plain sentence stays
    const moves = day.reduce((n, t) => n + (t.moves || 0), 0);
    const listed = day.reduce((n, t) => n + (t.inLedger || 0), 0);
    el.textContent = `In the last 24 hours SQD Network saw ${fmtInt(moves)} transaction${moves === 1 ? '' : 's'} on these two wallets, read separately from our ledger. Our ledger lists ${fmtInt(listed)} of them; the receipts page shows each one side by side.`;
}

// ------------------------------------------------------------------------------------------- boot

function boot() {
    initNav();
    loadStats();
    loadTape();
    reveal();
    runLoop();
    firstStats.then((s) => {
        const idle = window.requestIdleCallback || ((f) => setTimeout(f, 200));
        idle(() =>
            import('/stage.js')
                .then((m) => m.mountStage(s && s.liveBuild ? s.liveBuild.n : null))
                .catch(() => {})
        );
    });
    setInterval(() => !document.hidden && loadStats(), STATS_POLL_MS);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && Date.now() - state.statsAt > STATS_POLL_MS) loadStats();
    });
    tick();
    agentLoop();
    prizeAddress();
    whenNear($('#challenge'), () => {
        loadChallenge();
        loadWinners();
        setInterval(() => document.visibilityState === 'visible' && loadChallenge(), 60000);
    });
    whenNear($('#build'), loadBuilds);
    whenNear($('#receipts'), loadSqdStrip);
    // The game's pixel art, when the browser is idle, so it never delays the first paint.
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 200));
    idle(() => import('/art.js').catch(() => {}));
}

boot();
