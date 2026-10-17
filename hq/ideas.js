/*
 * The ideas box on the HQ. Anyone can post a short idea, no wallet; the Build Agent reads the last day's ideas
 * every night before it writes the next ballot, and a proposal it takes from one is marked "suggested by a
 * player". Server side: POST and GET /api/ideas (same text filters as holder requests, Turnstile, 3 per IP and
 * 100 in all per UTC day). The box stays hidden until GET /api/ideas answers, so the page never offers a form
 * the server can't take. (The 20:30 UTC Telegram digest the AI reads is at /api/feedback.)
 */
(function () {
    'use strict';
    const $ = (s) => document.querySelector(s);
    const MIN = 8;
    const MAX = 200;
    const SHOWN = 3;

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

    // The bot check (Turnstile), shared with the vote (hq/turnstile.js): invisible for most people.
    const bot = window.bpBotCheck(
        document.getElementById('ideaTs'),
        document.getElementById('ideaTsHint')
    );
    const key = bot.key;
    const token = bot.token;
    const warmUp = bot.warmUp;

    function botMessage() {
        const code = bot.error() ? ` (${bot.error()})` : '';
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
