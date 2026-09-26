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
            if (when) li.appendChild(el('time', null, when));
            list.appendChild(li);
        }
        const today = Number(data.today || 0);
        $('#ideaMeta').textContent = `${today} today · ${data.perIp || 3} per person a day`;
    }

    async function load() {
        try {
            const r = await fetch('/api/ideas', { headers: { accept: 'application/json' } });
            if (!r.ok) return;
            const data = await r.json();
            if (!data || !Array.isArray(data.ideas)) return;
            $('#ideaForm').hidden = false;
            render(data);
        } catch {
            /* no box until the server answers */
        }
    }

    // --- Turnstile, as in the game (game/src/turnstile.js): invisible for most people. ---
    let siteKey;
    let loading = null;
    let widgetId = null;
    let pending = null;

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
            s.onerror = () => reject(new Error('turnstile failed to load'));
            document.head.appendChild(s);
        });
        return loading;
    }

    function hint(on) {
        $('#ideaTsHint').hidden = !on;
    }

    async function token(sitekey) {
        let ts;
        try {
            ts = await loadTurnstile();
        } catch {
            return null;
        }
        return new Promise((resolve) => {
            let timer = setTimeout(() => finish(null), 15000);
            let settled = false;
            function finish(t) {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                pending = null;
                hint(false);
                resolve(t);
            }
            pending = {
                finish,
                interactive() {
                    hint(true);
                    clearTimeout(timer);
                    timer = setTimeout(() => finish(null), 120000);
                }
            };
            try {
                if (widgetId !== null) {
                    ts.reset(widgetId);
                    return;
                }
                widgetId = ts.render($('#ideaTs'), {
                    sitekey,
                    appearance: 'interaction-only',
                    theme: 'dark',
                    callback: (t) => pending && pending.finish(t),
                    'error-callback': () => {
                        if (pending) pending.finish(null);
                        return true;
                    },
                    'expired-callback': () => ts.reset(widgetId),
                    'before-interactive-callback': () => pending && pending.interactive(),
                    'after-interactive-callback': () => hint(false)
                });
            } catch {
                finish(null);
            }
        });
    }

    function count() {
        $('#ideaCount').textContent = `${$('#ideaText').value.length} / ${MAX}`;
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
            const turnstileToken = sitekey ? await token(sitekey) : null;
            const r = await fetch('/api/ideas', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ text, turnstileToken })
            });
            const data = await r.json().catch(() => null);
            if (r.ok && data && data.ok) {
                say(
                    'Sent. The AI reads the ideas box every night at 21:00 UTC, before it writes the next ballot.',
                    'good'
                );
                $('#ideaForm').reset();
                count();
                load();
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
    load();
})();
