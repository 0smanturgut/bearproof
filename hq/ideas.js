/*
 * The ideas box on the HQ. Anyone can post a short idea, no wallet; the Build Agent reads the last day's ideas
 * every night before it writes the next ballot, and a proposal it takes from one is marked "suggested by a
 * player". Server side: POST and GET /api/ideas (same text filters as holder requests, Turnstile, 3 per IP and
 * 100 in all per UTC day). The box stays hidden until GET /api/ideas answers, so the page never offers a form
 * the server can't take.
 */
(function () {
    'use strict';
    const $ = (s) => document.querySelector(s);
    const MIN = 8;
    const MAX = 200;
    const SHOWN = 8;

    function el(tag, cls, text) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined) e.textContent = text;
        return e;
    }

    /** Same cleaning as the server (lib/requests.js cleanText), so the length check matches. */
    function cleanText(raw) {
        return String(raw || '')
            .normalize('NFC')
            .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function say(text, tone) {
        const box = $('#ideaStatus');
        box.textContent = text;
        box.className = 'vote-status' + (tone ? ' ' + tone : '');
    }

    function ago(ts) {
        const t = typeof ts === 'number' ? ts : Date.parse(ts);
        if (!Number.isFinite(t)) return '';
        const m = Math.max(0, Math.round((Date.now() - t) / 60000));
        if (m < 1) return 'just now';
        if (m < 60) return `${m} min ago`;
        const h = Math.round(m / 60);
        return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
    }

    function render(data) {
        const list = $('#ideaList');
        list.textContent = '';
        const ideas = (data.ideas || []).slice(0, SHOWN);
        if (!ideas.length) {
            list.appendChild(el('li', 'ideas-empty', 'No ideas yet today. Be the first.'));
        }
        for (const idea of ideas) {
            const li = el('li', null, idea.text);
            const when = ago(idea.ts);
            // An idea sent with /idea in the Telegram group lands in the same box.
            const where = idea.via === 'telegram' ? 'via Telegram' : '';
            if (when || where)
                li.appendChild(el('time', null, [when, where].filter(Boolean).join(' · ')));
            list.appendChild(li);
        }
        const today = Number(data.today || 0);
        $('#ideaMeta').textContent = `${today} today · ${data.perIp || 3} per person a day`;
    }

    const HEARD = {
        bug: 'Bug',
        balance: 'Balance',
        idea: 'Idea',
        praise: 'Liked',
        complaint: 'Disliked',
        question: 'Asked'
    };

    /**
     * What the AI took from the Telegram group: the latest 20:30 UTC digest (GET /api/feedback). Hidden until a
     * digest with something in it exists. The text is a model's summary of players' words: textContent only.
     */
    async function loadHeard() {
        try {
            const r = await fetch('/api/feedback', { headers: { accept: 'application/json' } });
            if (!r.ok) return;
            const d = (await r.json()).digest;
            if (!d || !Array.isArray(d.items) || !d.items.length) return;
            const list = $('#heardList');
            list.textContent = '';
            for (const item of d.items.slice(0, 8)) {
                const li = el('li', null, String(item.text || ''));
                const n = Number(item.people) || 1;
                li.appendChild(
                    el('time', null, (HEARD[item.kind] || 'Note') + (n > 1 ? ` · ${n} people` : ''))
                );
                list.appendChild(li);
            }
            $('#heardMeta').textContent =
                `${ago(d.writtenAt)} · ${Number(d.messages) || 0} messages, ${Number(d.people) || 0} people`;
            $('#heard').hidden = false;
        } catch {
            /* nothing heard, nothing shown */
        }
    }

    async function load() {
        try {
            const r = await fetch('/api/ideas', { headers: { accept: 'application/json' } });
            if (!r.ok) return;
            const data = await r.json();
            if (!data || !Array.isArray(data.ideas)) return;
            $('#ideaForm').hidden = false;
            render(data);
            loadHeard();
        } catch {
            /* no box until the server answers */
        }
    }

    // --- Turnstile, as in the game (game/src/turnstile.js): invisible for most people. ---
    // The check starts when someone starts typing, so on a slow phone it has usually finished by the time they
    // press Send. A token is single use and lives five minutes; the widget refreshes it on its own.
    let siteKey;
    let loading = null;
    let widgetId = null;
    let running = false; // a check is under way
    let ready = null; // { token, at }: a token nobody has used yet
    let waiter = null; // resolves the token a submit is waiting for
    let needsTap = false;
    let lastError = '';

    async function key() {
        if (siteKey !== undefined) return siteKey;
        try {
            const r = await fetch('/api/daily');
            const d = await r.json();
            siteKey = (d && d.turnstileSiteKey) || null;
        } catch {
            siteKey = null;
        }
        return siteKey;
    }

    function loadTurnstile() {
        if (window.turnstile && window.turnstile.render) return Promise.resolve(window.turnstile);
        if (loading) return loading;
        loading = new Promise((resolve, reject) => {
            window.__bearproofIdeasTurnstile = () => resolve(window.turnstile);
            const s = document.createElement('script');
            s.src =
                'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__bearproofIdeasTurnstile';
            s.async = true;
            s.onerror = () => {
                loading = null; // let a later try load it again
                reject(new Error('turnstile failed to load'));
            };
            document.head.appendChild(s);
        });
        return loading;
    }

    function hint(on) {
        needsTap = on;
        $('#ideaTsHint').hidden = !on;
    }

    function deliver(t) {
        running = false;
        if (waiter) waiter(t);
        else if (t) ready = { token: t, at: Date.now() };
    }

    /** Run the check: render the widget the first time, reset it after. Resolves false if it can't start. */
    async function check() {
        running = true;
        const sitekey = await key();
        let ts;
        try {
            if (!sitekey) throw new Error('no site key');
            ts = await loadTurnstile();
        } catch {
            lastError = sitekey ? 'script' : '';
            running = false;
            return false;
        }
        try {
            if (widgetId !== null) {
                ts.reset(widgetId);
                return true;
            }
            widgetId = ts.render($('#ideaTs'), {
                sitekey,
                appearance: 'interaction-only',
                theme: 'dark',
                'refresh-expired': 'auto',
                callback: (t) => {
                    lastError = '';
                    hint(false);
                    deliver(t);
                },
                'error-callback': (code) => {
                    lastError = String(code || 'error');
                    hint(false);
                    deliver(null);
                    return true; // handled: no console noise
                },
                'expired-callback': () => {
                    ready = null;
                },
                'before-interactive-callback': () => hint(true),
                'after-interactive-callback': () => hint(false)
            });
            return true;
        } catch {
            lastError = 'render';
            running = false;
            return false;
        }
    }

    function warmUp() {
        if (widgetId === null && !running) check();
    }

    /**
     * A fresh token, or null. Waits up to 45 s, or 3 minutes once the check wants a tap (the hint under the box
     * says so).
     */
    function token() {
        if (ready && Date.now() - ready.at < 280000) {
            const t = ready.token;
            ready = null;
            return Promise.resolve(t);
        }
        ready = null;
        return new Promise((resolve) => {
            const t0 = Date.now();
            let timer = null;
            const finish = (t) => {
                if (!waiter) return;
                waiter = null;
                clearInterval(timer);
                resolve(t);
            };
            waiter = finish;
            timer = setInterval(() => {
                if (Date.now() - t0 > (needsTap ? 180000 : 45000)) {
                    lastError = lastError || 'timeout';
                    finish(null);
                }
            }, 500);
            if (!running)
                check().then((ok) => {
                    if (!ok) finish(null);
                });
        });
    }

    function botMessage() {
        const code = lastError ? ` (${lastError})` : '';
        return `The bot check didn't finish${code}. Press Send to try again. Inside the X app? Open bearproof.app in your phone's browser instead.`;
    }

    function count() {
        $('#ideaCount').textContent = `${$('#ideaText').value.length} / ${MAX}`;
    }

    async function post(text, turnstileToken) {
        const r = await fetch('/api/ideas', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text, turnstileToken })
        });
        return { r, data: await r.json().catch(() => null) };
    }

    async function submit(e) {
        e.preventDefault();
        const text = cleanText($('#ideaText').value);
        if (text.length < MIN) return say(`Say a little more: at least ${MIN} characters.`, 'bad');
        if (text.length > MAX) return say(`Keep it to ${MAX} characters.`, 'bad');
        const btn = $('#ideaSubmit');
        btn.disabled = true;
        say('Sending…');
        try {
            const sitekey = await key();
            let t = sitekey ? await token() : null;
            if (sitekey && !t) t = await token(); // one more go: a check can fail once on a flaky connection
            if (sitekey && !t) return say(botMessage(), 'bad');
            let { r, data } = await post(text, t);
            if (r.status === 403 && sitekey) {
                // Rejected by the server (used, expired or failed): one retry with a fresh token.
                const t2 = await token();
                if (!t2) return say(botMessage(), 'bad');
                ({ r, data } = await post(text, t2));
            }
            if (r.ok && data && data.ok) {
                say(
                    'Sent. The AI reads the ideas box every night at 21:00 UTC, before it writes the next ballot.',
                    'good'
                );
                $('#ideaForm').reset();
                count();
                load();
            } else if (r.status === 403) {
                say(botMessage(), 'bad');
            } else {
                say(
                    (data && data.error && data.error.message) ||
                        `Couldn't send it (${r.status}). Try again later.`,
                    'bad'
                );
            }
        } catch {
            say('Network error. Try again.', 'bad');
        } finally {
            btn.disabled = false;
        }
    }

    const form = $('#ideaForm');
    if (!form) return;
    form.addEventListener('submit', submit);
    $('#ideaText').addEventListener('input', count);
    // Start the bot check as soon as someone starts writing, not when they press Send.
    $('#ideaText').addEventListener('focus', warmUp);
    $('#ideaText').addEventListener('input', warmUp);
    load();
})();
